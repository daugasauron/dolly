// dh-gui: loads a live option chain, shows its quotes, starts dh-fit on it and
// shows the model's bids and asks against the market's while it fits.
// The model is THEORY.md; this program only prepares its input and draws.
#include "imgui.h"
#include "imgui_impl_sdl2.h"
#include "imgui_impl_sdlrenderer2.h"
#include <SDL.h>
#include <algorithm>
#include <cmath>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <map>
#include <spawn.h>
#include <string>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

extern char **environ;

static const char *chain_json = "/tmp/dh/chain.json", *chain_text = "/tmp/dh/chain.txt", *fit_output = "/tmp/dh/fit.out",
                  *shown_text = "/tmp/dh/chain.txt.shown";
// The contracts the Hedge tab is to show, three at most, as rows of the Quotes tab were clicked:
// dh-fit reads them at its next report.
static std::vector<int> shown_rows;
static void show(int contract) {
  auto at = std::find(shown_rows.begin(), shown_rows.end(), contract);
  if (at != shown_rows.end()) shown_rows.erase(at);
  else shown_rows.push_back(contract);
  if (shown_rows.size() > 3) shown_rows.erase(shown_rows.begin());
  FILE *file = fopen(shown_text, "w");
  for (int row : shown_rows) fprintf(file, "%d ", row);
  fclose(file);
}
enum { MAX_DAYS = 64, MAX_EXPIRIES = 8, STRIKES_PER_SIDE = 13, KERNELS = 49, INPUTS = 7, HIDDEN = 16 };

struct Contract {
  int expiry;          // index into expiries
  double strike;       // in currency
  int call;            // +1 or -1
  double bid, ask;     // in currency
  // dh-fit's report of the contract, in forward units: the two middles (what replicating the long
  // and the short book costs on average), the two hedges' costs, the two residuals' deviations,
  // the loss, the payoff's deviation, the two books' worst twentieths, the days its market spread
  // pays for (-1: more than to its expiry), and its charge under each closure (CHAIN, WHOLE, OUT).
  double model[14] = {};
  bool fitted = false;
};
struct Expiry {
  long day;            // days since 1970
  int business_days, calendar_days;
  double forward, discount;
  double model_forward = 0;
  double days[6] = {};  // the batch's days in the interval: mean, deviation, skewness, excess kurtosis, and how a day's size goes with the day before's
  std::vector<double> law;  // the interval's kernel weights
};
struct State {
  std::vector<Contract> contracts;
  std::vector<Expiry> expiries;
  std::vector<double> nodes;
  std::vector<std::vector<float>> paths, scales;  // the shown paths' log levels by day, and their days' scales
  std::vector<std::vector<float>> hedges;  // contract, then the position bought each day, a path each
  std::vector<std::vector<float>> residuals;  // contract, side (0 short, 1 long), then what the hedge left on each path
  std::vector<float> losses, inside;  // by report: the loss, the share of the model's bids and asks in the market's bands
  // What the market's spreads imply under each closure of THEORY.md, section 4: a floor every
  // contract pays (over the forward), each expiry's number (the price of a day's deviation, of
  // the whole residual's, the days to get out), and how far those leave the model's spreads
  // from the market's.
  double closure_floor[3] = {}, closure_miss[3] = {};
  std::vector<double> closure_numbers[3];
  double keep = 0, swing = 0, lean = 0;  // the volatility state's numbers, as fitted
  // dh-fit's "DH net" lines: by group (the hedger's network, the law's logits, the volatility state's numbers),
  // the values, then Adam's first and second moments of their gradients.
  std::vector<double> net[3][3];
  double spot = 0;
  long quoted = 0;      // epoch seconds of the newest quote
  int iteration = 0;
  double seconds = 0;
  std::string status = "Load quotes to begin.";
} state;

// ---- the chain: one request, columns of JSON ----

static std::string read_file(const char *path) {
  std::string text;
  if (FILE *file = fopen(path, "rb")) {
    char block[65536];
    for (size_t got; (got = fread(block, 1, sizeof block, file)) > 0;) text.append(block, got);
    fclose(file);
  }
  return text;
}

// The values of "key":[...] as text; a string value keeps its quotes off.
static std::vector<std::string> column(const std::string &json, const char *key) {
  std::vector<std::string> values;
  size_t at = json.find(std::string("\"") + key + "\":[");
  if (at == std::string::npos) return values;
  at = json.find('[', at) + 1;
  std::string value;
  for (; at < json.size() && json[at] != ']'; at++) {
    if (json[at] == ',') values.push_back(value), value.clear();
    else if (json[at] != '"' && json[at] != ' ') value += json[at];
  }
  values.push_back(value);
  return values;
}

static int business_days_between(long from, long to) {
  int count = 0;
  for (long day = from + 1; day <= to; day++) {
    int weekday = (int)((day + 4) % 7);  // 0 is Sunday
    if (weekday != 0 && weekday != 6) count++;
  }
  return count;
}

// An expiry's carry from its own quotes: a call less a put at one strike is
// worth D (F - K), and D F is the spot while no dividend falls before the
// expiry, which is assumed. So D = (S - (C - P)) / K, here the mean over the
// strikes near the money, on the centres of the bands; F = S / D.
static bool carry(const std::vector<Contract> &quotes, int expiry, double spot, double &forward, double &discount) {
  std::map<double, double> calls, puts;
  for (const Contract &c : quotes)
    if (c.expiry == expiry && fabs(c.strike / spot - 1) < 0.05) (c.call > 0 ? calls : puts)[c.strike] = (c.bid + c.ask) / 2;
  double pairs = 0, sum = 0;
  for (auto &[strike, call] : calls)
    if (puts.count(strike)) pairs++, sum += (spot - (call - puts[strike])) / strike;
  if (pairs < 3) return false;
  discount = std::min(1.0, std::max(0.9, sum / pairs));
  forward = spot / discount;
  return true;
}

static std::vector<Contract> thinned(std::vector<Contract> side) {
  std::sort(side.begin(), side.end(), [](const Contract &a, const Contract &b) { return a.strike < b.strike; });
  if ((int)side.size() <= STRIKES_PER_SIDE) return side;
  std::vector<Contract> kept;
  for (int i = 0; i < STRIKES_PER_SIDE; i++) kept.push_back(side[(size_t)llround(i * (side.size() - 1.0) / (STRIKES_PER_SIDE - 1))]);
  return kept;
}

// Reads the downloaded chain into state: expiries of 2 to MAX_DAYS business
// days, at most MAX_EXPIRIES of them, quotes with a bid of three ticks or more.
static bool load_chain() {
  std::string json = read_file(chain_json);
  auto strikes = column(json, "strike"), bids = column(json, "bid"), asks = column(json, "ask"), sides = column(json, "side"),
       expirations = column(json, "expiration"), updated = column(json, "updated"), underlying = column(json, "underlyingPrice");
  size_t count = strikes.size();
  if (count < 10 || bids.size() != count || asks.size() != count || sides.size() != count || expirations.size() != count) {
    state.status = json.empty() ? "No answer: the request was blocked or the host is unreachable." : "Not a chain: " + json.substr(0, 120);
    return false;
  }
  state = State();
  state.spot = atof(underlying[0].c_str());
  for (auto &time : updated) state.quoted = std::max(state.quoted, atol(time.c_str()));
  long today = state.quoted / 86400;
  std::map<long, int> expiry_of_day;
  std::vector<Contract> quotes;
  for (size_t i = 0; i < count; i++) {
    double bid = atof(bids[i].c_str()), ask = atof(asks[i].c_str());
    long day = atol(expirations[i].c_str()) / 86400;
    int business = business_days_between(today, day);
    if (business < 2 || business > MAX_DAYS || bid < 0.03 || ask <= bid) continue;
    if (!expiry_of_day.count(day)) {
      expiry_of_day[day] = (int)state.expiries.size();
      state.expiries.push_back({day, business, (int)(day - today), 0, 1});
    }
    quotes.push_back({expiry_of_day[day], atof(strikes[i].c_str()), sides[i] == "call" ? 1 : -1, bid, ask});
  }
  // Expiries in order, with their carry; then at most MAX_EXPIRIES, evenly.
  std::vector<int> order;
  for (auto &[day, index] : expiry_of_day)
    if (carry(quotes, index, state.spot, state.expiries[index].forward, state.expiries[index].discount)) order.push_back(index);
  std::vector<int> chosen = order;
  if ((int)order.size() > MAX_EXPIRIES) {
    chosen.clear();
    for (int i = 0; i < MAX_EXPIRIES; i++) chosen.push_back(order[(size_t)llround(i * (order.size() - 1.0) / (MAX_EXPIRIES - 1))]);
  }
  std::vector<Expiry> expiries;
  for (int index : chosen) {
    const Expiry &expiry = state.expiries[index];
    for (int call : {1, -1}) {
      std::vector<Contract> side;
      for (const Contract &c : quotes) {
        bool near = fabs(log(c.strike / expiry.forward)) <= 0.06 + 0.2 * sqrt(expiry.business_days / (double)MAX_DAYS);
        // The model prices the payoff at expiry. A listed put can be exercised before,
        // which is worth at most the interest on its strike until then: an in-the-money
        // put stays while that is under half its band.
        bool european = call > 0 || c.strike <= expiry.forward || (1 - expiry.discount) * c.strike <= (c.ask - c.bid) / 2;
        if (c.expiry == index && c.call == call && near && european) side.push_back(c);
      }
      for (Contract c : thinned(side)) c.expiry = (int)expiries.size(), state.contracts.push_back(c);
    }
    expiries.push_back(expiry);
  }
  state.expiries = expiries;
  if (state.contracts.empty()) {
    state.status = "The chain has no quoted contracts within 64 business days.";
    return false;
  }
  char text[160];
  time_t quoted = state.quoted;
  strftime(text, sizeof text, "quotes of %Y-%m-%d %H:%M UTC", gmtime(&quoted));
  state.status = std::string(text) + ", " + std::to_string(state.contracts.size()) + " contracts, " + std::to_string(state.expiries.size()) + " expiries";
  return true;
}

// What dh-fit reads: prices over D F, strikes over F (dh-fit.mojo, Chain).
static void write_chain(double cost) {
  FILE *file = fopen(chain_text, "w");
  // The options' tick is a cent.
  fprintf(file, "cost %.9g tick %.9g\ndays", cost, 0.01 / state.spot);
  for (const Expiry &expiry : state.expiries) fprintf(file, " %d", expiry.business_days);
  fprintf(file, "\n");
  for (const Contract &c : state.contracts) {
    const Expiry &expiry = state.expiries[c.expiry];
    double unit = expiry.discount * expiry.forward;
    fprintf(file, "%.9g %d %d %.9g %.9g\n", c.strike / expiry.forward, c.expiry, c.call, c.bid / unit, c.ask / unit);
  }
  fclose(file);
}

// ---- processes: curl for the chain, dh-fit for the model ----

static pid_t start(std::vector<std::string> arguments, const char *output) {
  std::vector<char *> argv;
  for (std::string &argument : arguments) argv.push_back(argument.data());
  argv.push_back(nullptr);
  posix_spawn_file_actions_t actions;
  posix_spawn_file_actions_init(&actions);
  posix_spawn_file_actions_addopen(&actions, 1, output, O_WRONLY | O_CREAT | O_TRUNC, 0644);
  posix_spawn_file_actions_adddup2(&actions, 1, 2);
  pid_t pid = -1;
  if (posix_spawnp(&pid, argv[0], &actions, nullptr, argv.data(), environ) != 0) pid = -1;
  posix_spawn_file_actions_destroy(&actions);
  return pid;
}

static bool ended(pid_t &pid, int &status) {
  if (pid <= 0 || waitpid(pid, &status, WNOHANG) != pid) return false;
  pid = -1;
  return true;
}

static void stop(pid_t &pid) {
  if (pid <= 0) return;
  int status;
  kill(pid, SIGTERM);
  waitpid(pid, &status, 0);
  pid = -1;
}

// The number after a word of a report's line, or zero.
static double named(const std::string &line, const char *word) {
  size_t at = line.find(word);
  return at == std::string::npos ? 0 : atof(line.c_str() + at + strlen(word));
}

// One report of dh-fit is shown when its last line has come.
static void read_fit(FILE *output, std::string &pending, State &staged) {
  char block[65536];
  for (size_t got; (got = fread(block, 1, sizeof block, output)) > 0;) pending.append(block, got);
  clearerr(output);
  for (size_t end; (end = pending.find('\n')) != std::string::npos; pending.erase(0, end + 1)) {
    std::string line = pending.substr(0, end);
    char kind[32] = "";
    int index = 0, used = 0;
    if (sscanf(line.c_str(), "DH %31s%n", kind, &used) != 1) {
      if (!line.empty() && line.find("warning") == std::string::npos) state.status = line;
      continue;
    }
    const char *rest = line.c_str() + used;
    std::vector<double> numbers;
    for (char *next; ; rest = next) {
      double value = strtod(rest, &next);
      if (next == rest) break;
      numbers.push_back(value);
    }
    std::string name = kind;
    if (name == "nodes") state.nodes = numbers;
    else if (double loss, seconds; name == "iteration" && sscanf(line.c_str(), "DH iteration %d loss %lf seconds %lf", &index, &loss, &seconds) == 3)
      staged.iteration = index, staged.losses.push_back((float)loss), staged.inside.push_back((float)named(line, " inside ")), staged.seconds = seconds, staged.residuals.clear(),
      staged.keep = named(line, " keep "), staged.swing = named(line, " swing "), staged.lean = named(line, " lean ");
    else if (name == "residual" && numbers.size() > 2) staged.residuals.emplace_back(numbers.begin(), numbers.end());
    else if (name == "net" && numbers.size() > 2 && numbers[0] >= 0 && numbers[0] < 3 && numbers[1] >= 0 && numbers[1] < 3)
      staged.net[(int)numbers[0]][(int)numbers[1]].assign(numbers.begin() + 2, numbers.end());
    else if (name == "closure" && numbers.size() == 3 * (2 + staged.expiries.size()))
      for (size_t n = 0, at = 0; n < 3; n++, at += 2 + staged.expiries.size()) {
        staged.closure_floor[n] = numbers[at], staged.closure_miss[n] = numbers[at + 1];
        staged.closure_numbers[n].assign(numbers.begin() + at + 2, numbers.begin() + at + 2 + staged.expiries.size());
      }
    else if (name == "quote" && numbers.size() == 15 && numbers[0] < staged.contracts.size()) {
      Contract &c = staged.contracts[(size_t)numbers[0]];
      std::copy(numbers.begin() + 1, numbers.end(), c.model);
      c.fitted = true;
    } else if (name == "law" && numbers.size() == KERNELS + 1 && numbers[0] < staged.expiries.size())
      staged.expiries[(size_t)numbers[0]].law.assign(numbers.begin() + 1, numbers.end());
    else if (name == "forward" && numbers.size() == 7 && numbers[0] < staged.expiries.size()) {
      Expiry &expiry = staged.expiries[(size_t)numbers[0]];
      expiry.model_forward = numbers[1];
      std::copy(numbers.begin() + 2, numbers.end(), expiry.days);
    }
    else if (name == "path" && numbers.size() > 2) {
      if (numbers[0] == 0) staged.paths.clear();
      staged.paths.emplace_back(numbers.begin() + 1, numbers.end());
    } else if (name == "scale" && numbers.size() > 2) {
      if (numbers[0] == 0) staged.scales.clear();
      staged.scales.emplace_back(numbers.begin() + 1, numbers.end());
    } else if (name == "hedge" && numbers.size() > 2) {
      if (numbers[0] == 0) staged.hedges.clear();
      staged.hedges.emplace_back(numbers.begin() + 1, numbers.end());
    } else if (name == "end") {
      std::string status = state.status;
      std::vector<double> nodes = state.nodes;
      state = staged;
      state.nodes = nodes;
      state.status = status;
    }
  }
}

// ---- what is drawn ----

static double normal_cdf(double x) { return 0.5 * erfc(-x / sqrt(2.0)); }

// The Black volatility of a price over D F at strike over F: for the plots
// only, the model has none (THEORY.md, decision 4).
static double implied_volatility(double price, double strike, int call, double years) {
  double intrinsic = std::max(call * (1 - strike), 0.0);
  if (price <= intrinsic + 1e-7 || price >= (call > 0 ? 1.0 : strike)) return NAN;
  double low = 1e-4, high = 5;
  for (int i = 0; i < 60; i++) {
    double vol = (low + high) / 2, s = vol * sqrt(years), d1 = -log(strike) / s + s / 2;
    double value = call > 0 ? normal_cdf(d1) - strike * normal_cdf(d1 - s) : strike * normal_cdf(s - d1) - normal_cdf(-d1);
    (value > price ? high : low) = vol;
  }
  return (low + high) / 2;
}

static const ImU32 market_colour = IM_COL32(205, 205, 205, 255), bid_colour = IM_COL32(64, 156, 255, 255), ask_colour = IM_COL32(255, 138, 48, 255),
                   frame_colour = IM_COL32(90, 90, 90, 255), text_colour = IM_COL32(170, 170, 170, 255),
                   grid_colour = IM_COL32(45, 45, 45, 255);

enum { CHAIN, WHOLE, OUT };
static const char *closure_names[3] = {"a chain of dealers", "held to expiry", "out after some days"};
// The closure whose one number leaves the spreads nearest the market's.
static int best_closure() {
  int best = CHAIN;
  for (int n : {WHOLE, OUT})
    if (state.closure_miss[n] < state.closure_miss[best]) best = n;
  return best;
}
// The model's bid and ask of a contract, over D F: a middle less or plus the charge.
static double model_bid(const Contract &c, int closure) { return c.model[0] - c.model[11 + closure]; }
static double model_ask(const Contract &c, int closure) { return c.model[1] + c.model[11 + closure]; }

struct Plot {
  ImVec2 origin, size;
  double x0, x1, y0, y1;
  ImDrawList *draw;
  // Three faint lines across with their values, so that a level can be read off.
  Plot(const char *title, ImVec2 size, double x0, double x1, double y0, double y1) : size(size), x0(x0), x1(x1), y0(y0), y1(y1) {
    origin = ImGui::GetCursorScreenPos();
    draw = ImGui::GetWindowDrawList();
    ImGui::InvisibleButton(title, size);
    draw->AddRect(origin, ImVec2(origin.x + size.x, origin.y + size.y), ImGui::IsItemHovered() ? text_colour : frame_colour);
    for (int line = 0; line <= 2; line++) {
      double level = y0 + (y1 - y0) * line / 2;
      ImVec2 left = at(x0, level);
      draw->AddLine(ImVec2(origin.x + 1, left.y), ImVec2(origin.x + size.x - 1, left.y), grid_colour);
      char label[32];
      snprintf(label, sizeof label, "%.3g", level);
      draw->AddText(ImVec2(origin.x + size.x - 6 - ImGui::CalcTextSize(label).x, left.y - (line ? 0 : 14)), text_colour, label);
    }
    draw->AddText(ImVec2(origin.x + 6, origin.y + 3), text_colour, title, strstr(title, "##"));
    char label[32];
    snprintf(label, sizeof label, "%.3g", x0);
    draw->AddText(ImVec2(origin.x + 6, origin.y + size.y - 17), text_colour, label);
    snprintf(label, sizeof label, "%.3g", x1);
    draw->AddText(ImVec2(origin.x + size.x - 6 - ImGui::CalcTextSize(label).x, origin.y + size.y - 17), text_colour, label);
  }
  ImVec2 at(double x, double y) const {
    const float margin = 14;
    return ImVec2(origin.x + margin + (float)((std::min(std::max(x, x0), x1) - x0) / (x1 - x0)) * (size.x - 2 * margin),
                  origin.y + size.y - 20 - (float)((std::min(std::max(y, y0), y1) - y0) / (y1 - y0)) * (size.y - 42));
  }
};

// One expiry's calls or puts: the market's band a bar, the model's bid and ask lines; under
// the pointer, the nearest contract's numbers. Returns whether it was clicked.
static bool quotes_plot(int expiry_index, int call, bool volatility, ImVec2 size, double x0, double x1, double low, double top) {
  const Expiry &expiry = state.expiries[expiry_index];
  double years = expiry.calendar_days / 365.0, unit = expiry.discount * expiry.forward;
  char title[96];
  time_t day = expiry.day * 86400;
  strftime(title, sizeof title, call > 0 ? "calls %b %d" : "puts %b %d", gmtime(&day));
  Plot plot(title, size, x0, x1, low, top);
  bool hovered = ImGui::IsItemHovered(), clicked = ImGui::IsItemClicked();
  plot.draw->AddLine(plot.at(0, low), plot.at(0, top), frame_colour);
  std::vector<ImVec2> bids, asks;
  const Contract *nearest = nullptr;
  float distance = 1e9f, pointer = ImGui::GetIO().MousePos.x;
  for (const Contract &c : state.contracts) {
    if (c.expiry != expiry_index || c.call != call) continue;
    double strike = c.strike / expiry.forward, x = log(strike);
    auto shown = [&](double price_over_unit) { return volatility ? implied_volatility(price_over_unit, strike, call, years) : price_over_unit * unit; };
    double bar_low = shown(c.bid / unit), bar_high = shown(c.ask / unit);
    // A bid under the option's value at expiry has no volatility: the bar is faint and starts at the axis.
    if (!std::isnan(bar_high))
      plot.draw->AddLine(plot.at(x, std::isnan(bar_low) ? low : bar_low), plot.at(x, bar_high), std::isnan(bar_low) ? frame_colour : market_colour, 3);
    if (fabsf(plot.at(x, low).x - pointer) < distance) distance = fabsf(plot.at(x, low).x - pointer), nearest = &c;
    if (!c.fitted) continue;
    double bid = shown(model_bid(c, best_closure())), ask = shown(model_ask(c, best_closure()));
    if (!std::isnan(bid)) bids.push_back(plot.at(x, bid));
    if (!std::isnan(ask)) asks.push_back(plot.at(x, ask));
  }
  if (bids.size() > 1) plot.draw->AddPolyline(bids.data(), (int)bids.size(), bid_colour, 2.0f);
  if (asks.size() > 1) plot.draw->AddPolyline(asks.data(), (int)asks.size(), ask_colour, 2.0f);
  if (hovered && nearest) {
    const Contract &c = *nearest;
    double strike = c.strike / expiry.forward;
    plot.draw->AddLine(plot.at(log(strike), low), plot.at(log(strike), top), grid_colour);
    // A price under the option's value at expiry has no volatility.
    auto vol = [&](double price) {
      double volatility = implied_volatility(price / unit, strike, call, years);
      char text[16];
      snprintf(text, sizeof text, std::isnan(volatility) ? "none" : "%.1f%%", 100 * volatility);
      return std::string(text);
    };
    ImGui::BeginTooltip();
    ImGui::Text("%s at %.5g, forward %.5g", title, c.strike, expiry.forward);
    ImGui::TextColored(ImColor(market_colour), "market  %8.3f to %8.3f   %s to %s", c.bid, c.ask, vol(c.bid).c_str(), vol(c.ask).c_str());
    if (c.fitted) {
      double bid = model_bid(c, best_closure()) * unit, ask = model_ask(c, best_closure()) * unit;
      ImGui::Text("model   %8.3f to %8.3f   %s to %s", bid, ask, vol(bid).c_str(), vol(ask).c_str());
      ImGui::Text("replicating it costs %.3f short, %.3f long; the hedger leaves %.0f%% of the risk", c.model[1] * unit, c.model[0] * unit,
                  c.model[7] > 0 ? 50 * (c.model[4] + c.model[5]) / c.model[7] : 0.0);
      if (c.model[10] < 0) ImGui::TextUnformatted("its spread pays for more risk than holding it to expiry has");
      else ImGui::Text("its spread pays for %.2g days of the hedged book's risk", c.model[10]);
      ImGui::TextColored(ImColor(ask_colour), "sold at the bid, hedged: mean %+.3f, worst twentieth %+.2f", c.bid - c.model[1] * unit, c.bid - c.model[8] * unit);
      ImGui::TextColored(ImColor(bid_colour), "bought at the ask, hedged: mean %+.3f, worst twentieth %+.2f", -c.ask + c.model[0] * unit, -c.ask - c.model[9] * unit);
    }
    ImGui::EndTooltip();
  }
  return clicked;
}

static void quotes_tab(bool volatility) {
  static int enlarged = -1;  // an expiry shown alone, by a click on one of its plots
  if (enlarged >= (int)state.expiries.size()) enlarged = -1;
  ImGui::TextColored(ImColor(market_colour), "| market bid to ask");
  ImGui::SameLine();
  ImGui::TextColored(ImColor(bid_colour), "  model bid");
  ImGui::SameLine();
  ImGui::TextColored(ImColor(ask_colour), "  model ask");
  ImGui::SameLine();
  double x0 = 0, x1 = 0;
  for (const Contract &c : state.contracts) {
    if (enlarged >= 0 && c.expiry != enlarged) continue;
    double x = log(c.strike / state.expiries[c.expiry].forward);
    x0 = std::min(x0, x), x1 = std::max(x1, x);
  }
  ImGui::TextUnformatted(volatility ? "   Black volatility at the forward the quotes imply, by log(strike / forward); the upright line is the forward; click a plot for its expiry alone"
                                    : "   price, by log(strike / forward); the upright line is the forward; click a plot for its expiry alone");
  int shown = enlarged >= 0 ? 1 : (int)state.expiries.size();
  int columns = enlarged >= 0 ? 2 : 4, rows = (shown * 2 + columns - 1) / columns;
  ImVec2 available = ImGui::GetContentRegionAvail();
  ImVec2 size((available.x - 8 * (columns - 1)) / columns, std::max(120.0f, (available.y - 8 * rows) / rows));
  int clicked = -2;
  for (int e = 0, cell = 0; e < (int)state.expiries.size(); e++) {
    if (enlarged >= 0 && e != enlarged) continue;
    const Expiry &expiry = state.expiries[e];
    // The axis is the market's alone, so it does not move while the model fits: prices
    // to the highest ask; volatilities from half the median ask's to twice it.
    std::vector<double> values;
    for (const Contract &c : state.contracts)
      if (c.expiry == e) {
        double strike = c.strike / expiry.forward, unit = expiry.discount * expiry.forward;
        double value = volatility ? implied_volatility(c.ask / unit, strike, c.call, expiry.calendar_days / 365.0) : c.ask;
        if (!std::isnan(value)) values.push_back(value);
      }
    std::sort(values.begin(), values.end());
    double median = values.empty() ? 1 : values[values.size() / 2];
    double low = volatility ? 0.5 * median : 0, top = values.empty() ? 1 : volatility ? 2 * median : 1.05 * values.back();
    for (int call : {1, -1}) {
      if (quotes_plot(e, call, volatility, size, x0, x1, low, top)) clicked = enlarged >= 0 ? -1 : e;
      if (cell++ % columns != columns - 1) ImGui::SameLine(0, 8);
    }
  }
  if (clicked != -2) enlarged = clicked;
}

static void law_tab() {
  if (state.nodes.empty() || state.expiries[0].law.empty()) {
    ImGui::TextUnformatted("The law is shown once the fit has reported.");
    return;
  }
  ImVec2 available = ImGui::GetContentRegionAvail();
  ImVec2 size((available.x - 16) / 3, std::max(200.0f, available.y - 60 - 20 * (float)state.expiries.size()));
  double peak = 0;
  for (const Expiry &expiry : state.expiries)
    for (int k = 0; k < KERNELS; k++) peak = std::max(peak, expiry.law[k] * 2 / (state.nodes[k + 2] - state.nodes[k]));
  Plot density("density of a day's shock, an interval a line (early blue, late orange)", size, -0.08, 0.08, 0, peak * 1.05);
  for (size_t e = 0; e < state.expiries.size(); e++) {
    std::vector<ImVec2> line;
    for (int k = 0; k < KERNELS; k++)
      if (fabs(state.nodes[k + 1]) <= 0.08) line.push_back(density.at(state.nodes[k + 1], state.expiries[e].law[k] * 2 / (state.nodes[k + 2] - state.nodes[k])));
    float late = state.expiries.size() > 1 ? (float)e / (state.expiries.size() - 1) : 0;
    density.draw->AddPolyline(line.data(), (int)line.size(), IM_COL32(64 + 191 * late, 156 - 18 * late, 255 - 207 * late, 255), 2.0f);
  }
  ImGui::SameLine(0, 8);
  int days = state.expiries.back().business_days;
  Plot paths("the stock over its forward: 28 paths, the 10 lowest, the 10 highest", size, 0, days, 0.6, 1.4);
  for (size_t index = 0; index < state.paths.size(); index++) {
    const std::vector<float> &path = state.paths[index];
    std::vector<ImVec2> line;
    for (size_t t = 0; t < path.size(); t++) line.push_back(paths.at((double)t, exp(path[t])));
    // dh-fit's order: 28 drawn at random, then the lowest ten, then the highest ten.
    paths.draw->AddPolyline(line.data(), (int)line.size(), index < 28 ? IM_COL32(170, 170, 170, 120) : index < 38 ? ask_colour : bid_colour, 1.0f);
  }
  ImGui::SameLine(0, 8);
  float largest = 2;
  for (const std::vector<float> &scale : state.scales) largest = std::max(largest, *std::max_element(scale.begin(), scale.end()));
  Plot scales("the scale of the same paths' days: a day's return is its shock times it", size, 0, days, 0, largest);
  for (size_t index = 0; index < state.scales.size(); index++) {
    std::vector<ImVec2> line;
    for (size_t t = 0; t < state.scales[index].size(); t++) line.push_back(scales.at((double)t, state.scales[index][t]));
    scales.draw->AddPolyline(line.data(), (int)line.size(), index < 28 ? IM_COL32(170, 170, 170, 120) : index < 38 ? ask_colour : bid_colour, 1.0f);
  }
  // What the state does to the next day's scale after a shock of two units, down and up.
  auto after = [](double e) { return 100 * (exp(state.swing * (fabs(e) - 0.7978846) + state.lean * e) - 1); };
  ImGui::Text("A day's return is its shock times the path's scale. The scale's logarithm keeps %.2f of itself a day; a shock of two units down moves the next day's scale by %+.0f%%, "
              "two up by %+.0f%%. The days of the last batch:", state.keep, after(-2), after(2));
  if (ImGui::BeginTable("law", 8, ImGuiTableFlags_Borders | ImGuiTableFlags_RowBg)) {
    for (const char *name : {"interval ends", "business day", "mean of a day, bp", "deviation of a day, %", "the same, a year", "skewness", "excess kurtosis",
                             "size with the day before's"})
      ImGui::TableSetupColumn(name);
    ImGui::TableHeadersRow();
    for (const Expiry &expiry : state.expiries) {
      char date[32];
      time_t day = expiry.day * 86400;
      strftime(date, sizeof date, "%Y-%m-%d", gmtime(&day));
      ImGui::TableNextRow();
      ImGui::TableNextColumn(), ImGui::TextUnformatted(date);
      ImGui::TableNextColumn(), ImGui::Text("%d", expiry.business_days);
      ImGui::TableNextColumn(), ImGui::Text("%.2f", expiry.days[0] * 1e4);
      ImGui::TableNextColumn(), ImGui::Text("%.3f", expiry.days[1] * 100);
      ImGui::TableNextColumn(), ImGui::Text("%.1f%%", expiry.days[1] * sqrt(252.0) * 100);
      ImGui::TableNextColumn(), ImGui::Text("%.2f", expiry.days[2]);
      ImGui::TableNextColumn(), ImGui::Text("%.1f", expiry.days[3]);
      ImGui::TableNextColumn(), ImGui::Text("%.2f", expiry.days[4]);
    }
    ImGui::EndTable();
  }
}

// A trade at the market's price, hedged to expiry: its result on every path, as a histogram.
struct Outcome {
  std::vector<double> results;  // in currency, sorted
  double mean = 0, worst = 0;   // the mean, and the mean of the worst twentieth
  explicit Outcome(std::vector<double> values) : results(std::move(values)) {
    std::sort(results.begin(), results.end());
    size_t tail = std::max<size_t>(1, results.size() / 20);
    for (double result : results) mean += result / results.size();
    for (size_t i = 0; i < tail; i++) worst += results[i] / tail;
  }
  std::vector<int> counts(double low, double high, int bins) const {
    std::vector<int> counts(bins);
    for (double result : results) counts[std::min(bins - 1, std::max(0, (int)((result - low) / (high - low) * bins)))]++;
    return counts;
  }
  void draw(const Plot &plot, int bins, ImU32 colour) const {
    std::vector<int> counts = this->counts(plot.x0, plot.x1, bins);
    for (int bin = 0; bin < bins; bin++) {
      double left = plot.x0 + (plot.x1 - plot.x0) * bin / bins, right = plot.x0 + (plot.x1 - plot.x0) * (bin + 1) / bins;
      ImVec2 low = plot.at(left, 0), high = plot.at(right, (double)counts[bin] / results.size());
      plot.draw->AddRectFilled(ImVec2(low.x, high.y), ImVec2(high.x, low.y), colour);
    }
    plot.draw->AddLine(plot.at(mean, 0), plot.at(mean, plot.y1), colour | IM_COL32(0, 0, 0, 255), 2);
  }
};

// The contracts chosen in the Quotes tab, or three calls of the middle expiry. Above: the
// stock the hedger holds, short one, along the first paths of the Law tab. Below: what selling it at the market's bid, or buying it at the
// market's ask, and hedging to expiry came to on every path of the last batch.
static void hedge_tab() {
  if (state.hedges.empty()) {
    ImGui::TextUnformatted("The hedges are shown once the fit has reported.");
    return;
  }
  ImGui::TextColored(ImColor(ask_colour), "above: paths that end in the money; below: sold at the market's bid");
  ImGui::SameLine();
  ImGui::TextColored(ImColor(bid_colour), "  above: paths that end out of it; below: bought at the market's ask");
  ImGui::SameLine();
  ImGui::TextUnformatted("   the stock held by day; the trade's result at expiry, hedged");
  ImVec2 available = ImGui::GetContentRegionAvail();
  // A column a contract: dh-fit's hedges come contract by contract.
  int count = 0;
  for (size_t at = 0; at < state.hedges.size(); at++) count += at == 0 || state.hedges[at][0] != state.hedges[at - 1][0];
  ImVec2 size((available.x - 8 * (count - 1)) / count, (available.y - 16) / 2);
  std::vector<int> shown;
  for (size_t at = 0, plot_index = 0; at < state.hedges.size(); plot_index++) {
    shown.push_back((int)state.hedges[at][0]);
    const Contract &c = state.contracts[(size_t)state.hedges[at][0]];
    const Expiry &expiry = state.expiries[c.expiry];
    char title[96], date[32];
    time_t day = expiry.day * 86400;
    strftime(date, sizeof date, "%b %d", gmtime(&day));
    snprintf(title, sizeof title, "short the %s %s at %.5g, forward %.5g", date, c.call > 0 ? "call" : "put", c.strike, expiry.forward);
    Plot plot(title, size, 0, expiry.business_days, 0, 1);
    for (size_t path = 0; at < state.hedges.size() && state.hedges[at][0] == state.hedges[at - path][0]; at++, path++) {
      const std::vector<float> &held = state.hedges[at];
      // held[1 + u] is the position bought at day u's close.
      std::vector<ImVec2> line;
      for (size_t u = 1; u < held.size(); u++) line.push_back(plot.at((double)(u - 1), held[u]));
      bool in_the_money = path < state.paths.size() && (int)state.paths[path].size() > expiry.business_days &&
                          c.call * (exp(state.paths[path][(size_t)expiry.business_days]) * expiry.forward - c.strike) > 0;
      plot.draw->AddPolyline(line.data(), (int)line.size(), in_the_money ? ask_colour : bid_colour, 1.5f);
    }
    if (plot_index + 1 < (size_t)count) ImGui::SameLine(0, 8);
  }
  for (size_t index = 0; index < shown.size(); index++) {
    const Contract &c = state.contracts[(size_t)shown[index]];
    double unit = state.expiries[c.expiry].discount * state.expiries[c.expiry].forward;
    std::vector<double> sold, bought;
    for (const std::vector<float> &row : state.residuals) {
      if ((int)row[0] != shown[index]) continue;
      // The short book's residual is what the buyer is owed less the hedge's gains; the long book's the reverse.
      for (size_t p = 2; p < row.size(); p++) (row[1] == 0 ? sold : bought).push_back(row[1] == 0 ? c.bid - row[p] * unit : -c.ask - row[p] * unit);
    }
    if (sold.empty() || bought.empty()) continue;
    Outcome selling(sold), buying(bought);
    // The axis holds all but the hundredth at either end of both.
    size_t cut = sold.size() / 100;
    double low = std::min(selling.results[cut], buying.results[cut]), high = std::max(selling.results[sold.size() - 1 - cut], buying.results[bought.size() - 1 - cut]);
    double margin = 0.05 * (high - low) + 1e-9;
    const int bins = 48;
    int tallest = 1;
    for (const Outcome *outcome : {&selling, &buying})
      for (int count : outcome->counts(low - margin, high + margin, bins)) tallest = std::max(tallest, count);
    char title[96], line[96];
    snprintf(title, sizeof title, "result at expiry, in currency##%d", shown[index]);
    Plot plot(title, size, low - margin, high + margin, 0, 1.3 * tallest / sold.size());
    plot.draw->AddLine(plot.at(0, 0), plot.at(0, plot.y1), frame_colour);
    selling.draw(plot, bins, (ask_colour & 0x00FFFFFF) | 0x90000000);
    buying.draw(plot, bins, (bid_colour & 0x00FFFFFF) | 0x90000000);
    snprintf(line, sizeof line, "sold at %.2f: mean %+.3f, worst twentieth %+.2f", c.bid, selling.mean, selling.worst);
    plot.draw->AddText(ImVec2(plot.origin.x + 6, plot.origin.y + 22), ask_colour, line);
    snprintf(line, sizeof line, "bought at %.2f: mean %+.3f, worst twentieth %+.2f", c.ask, buying.mean, buying.worst);
    plot.draw->AddText(ImVec2(plot.origin.x + 6, plot.origin.y + 38), bid_colour, line);
    if (index + 1 < shown.size()) ImGui::SameLine(0, 8);
  }
}

// Every contract: the market's bid and ask and the model's, in currency.
static void contracts_tab() {
  ImGui::TextWrapped("Buy at ask, sell at bid: a trade at the market's price, hedged to expiry by the model's hedger under the fitted law. Its mean result over the paths, a gain in "
                     "colour, and the mean of its worst twentieth. A click on a row: the Hedge tab shows that contract from the fit's next report, three at most.");
  if (!ImGui::BeginTable("quotes", 15, ImGuiTableFlags_Borders | ImGuiTableFlags_RowBg | ImGuiTableFlags_ScrollY)) return;
  ImGui::TableSetupScrollFreeze(0, 1);
  for (const char *name : {"expiry", "", "strike", "market bid", "market ask", "model bid", "model ask", "hedge cost", "risk left", "days paid for", "in band", "buy at ask",
                           "worst 1/20", "sell at bid", "worst 1/20"})
    ImGui::TableSetupColumn(name);
  ImGui::TableHeadersRow();
  for (const Contract &c : state.contracts) {
    const Expiry &expiry = state.expiries[c.expiry];
    double unit = expiry.discount * expiry.forward;
    char date[32];
    time_t day = expiry.day * 86400;
    strftime(date, sizeof date, "%Y-%m-%d", gmtime(&day));
    int row = (int)(&c - state.contracts.data());
    ImGui::TableNextRow();
    ImGui::TableNextColumn();
    ImGui::PushID(row);
    if (ImGui::Selectable(date, std::find(shown_rows.begin(), shown_rows.end(), row) != shown_rows.end(), ImGuiSelectableFlags_SpanAllColumns)) show(row);
    ImGui::PopID();
    ImGui::TableNextColumn(), ImGui::TextUnformatted(c.call > 0 ? "call" : "put");
    ImGui::TableNextColumn(), ImGui::Text("%.5g", c.strike);
    ImGui::TableNextColumn(), ImGui::Text("%.2f", c.bid);
    ImGui::TableNextColumn(), ImGui::Text("%.2f", c.ask);
    if (!c.fitted) continue;
    double bid = model_bid(c, best_closure()) * unit, ask = model_ask(c, best_closure()) * unit;
    bool bid_in = bid >= c.bid - 1e-9 && bid <= c.ask + 1e-9, ask_in = ask >= c.bid - 1e-9 && ask <= c.ask + 1e-9;
    ImGui::TableNextColumn(), ImGui::Text("%.3f", bid);
    ImGui::TableNextColumn(), ImGui::Text("%.3f", ask);
    ImGui::TableNextColumn(), ImGui::Text("%.3f", (c.model[2] + c.model[3]) * unit);
    ImGui::TableNextColumn();
    if (c.model[7] > 0) ImGui::Text("%.0f%%", 50 * (c.model[4] + c.model[5]) / c.model[7]);
    ImGui::TableNextColumn();
    if (c.model[10] < 0) ImGui::TextUnformatted("> expiry");
    else ImGui::Text("%.2f", c.model[10]);
    ImGui::TableNextColumn(), ImGui::TextUnformatted(bid_in && ask_in ? "both" : bid_in ? "bid" : ask_in ? "ask" : "");
    // What the model says buying at the ask, or selling at the bid, and hedging comes to:
    // on average, and over the worst twentieth of the paths. A gain in colour.
    double values[4] = {-c.ask + c.model[0] * unit, -c.ask - c.model[9] * unit, c.bid - c.model[1] * unit, c.bid - c.model[8] * unit};
    for (double value : values) {
      ImGui::TableNextColumn();
      if (value > 0) ImGui::TextColored(ImColor(ask_colour), "%+.3f", value);
      else ImGui::Text("%+.3f", value);
    }
  }
  ImGui::EndTable();
}

// ---- the Network tab: the parameters and Adam's moments as coloured cells ----

// Blue below zero, orange above, dark at zero; `share` is the value over the grid's scale.
static ImU32 cell_colour(double share) {
  float t = (float)std::min(1.0, fabs(share));
  const float dark[3] = {22, 22, 22}, low[3] = {64, 156, 255}, high[3] = {255, 138, 48};
  const float *to = share < 0 ? low : high;
  return IM_COL32(dark[0] + (to[0] - dark[0]) * t, dark[1] + (to[1] - dark[1]) * t, dark[2] + (to[2] - dark[2]) * t, 255);
}

// One block of cells: rows by columns, the value of (row, column) at values[first + row * row_step + column * column_step].
struct Block {
  const char *name;
  int rows, columns, first, row_step, column_step;
};

// A grid of blocks side by side, on one scale, with the scale under it: the size 98 in 100 of its values are
// within, so that one large number does not darken the rest; the few beyond it show at full colour.
// `raw`, when given, is the number behind each cell where the cell shows another reading of it.
static void grid(const char *title, const std::vector<double> &values, const std::vector<Block> &blocks, ImVec2 size, bool square, const std::vector<double> *raw = nullptr) {
  ImVec2 origin = ImGui::GetCursorScreenPos();
  ImDrawList *draw = ImGui::GetWindowDrawList();
  ImGui::InvisibleButton(title, size);
  draw->AddRect(origin, ImVec2(origin.x + size.x, origin.y + size.y), frame_colour);
  draw->AddText(ImVec2(origin.x + 6, origin.y + 3), text_colour, title);
  if (values.empty()) return;
  std::vector<double> sizes;
  for (double value : values) sizes.push_back(fabs(value));
  std::sort(sizes.begin(), sizes.end());
  double scale = sizes[(sizes.size() - 1) * 98 / 100];
  if (scale == 0) scale = sizes.back();
  if (scale == 0) return;
  int rows = 0, columns = 0;
  for (const Block &block : blocks) rows = std::max(rows, block.rows), columns += block.columns;
  const float gap = 6, top = 36, bottom = 22;
  float cell_w = (size.x - 12 - gap * (blocks.size() - 1)) / columns, cell_h = (size.y - top - bottom) / rows;
  if (square) cell_w = cell_h = std::min(cell_w, cell_h);
  float x = origin.x + 6;
  ImVec2 mouse = ImGui::GetMousePos();
  for (const Block &block : blocks) {
    if (ImGui::CalcTextSize(block.name).x <= block.columns * cell_w + gap) draw->AddText(ImVec2(x, origin.y + 19), text_colour, block.name);
    for (int row = 0; row < block.rows; row++)
      for (int column = 0; column < block.columns; column++) {
        size_t at = (size_t)(block.first + row * block.row_step + column * block.column_step);
        if (at >= values.size()) continue;
        ImVec2 a(x + column * cell_w, origin.y + top + row * cell_h), b(a.x + cell_w, a.y + cell_h);
        draw->AddRectFilled(a, ImVec2(b.x - (cell_w > 3 ? 1 : 0), b.y - (cell_h > 3 ? 1 : 0)), cell_colour(values[at] / scale));
        if (mouse.x >= a.x && mouse.x < b.x && mouse.y >= a.y && mouse.y < b.y) {
          if (raw && at < raw->size()) ImGui::SetTooltip("%s, row %d, column %d: %.4g (logit %.4g)", block.name, row, column, values[at], (*raw)[at]);
          else ImGui::SetTooltip("%s, row %d, column %d: %.4g", block.name, row, column, values[at]);
        }
      }
    x += block.columns * cell_w + gap;
  }
  // The scale: the colours from minus it to plus it.
  float y = origin.y + size.y - bottom + 5;
  for (int step = 0; step < 40; step++)
    draw->AddRectFilled(ImVec2(origin.x + 70 + step * 4, y), ImVec2(origin.x + 74 + step * 4, y + 12), cell_colour(step / 19.5 - 1));
  char label[32];
  snprintf(label, sizeof label, "%.2g", -scale);
  draw->AddText(ImVec2(origin.x + 6, y - 2), text_colour, label);
  snprintf(label, sizeof label, "%+.2g", scale);
  draw->AddText(ImVec2(origin.x + 236, y - 2), text_colour, label);
}

static void network_tab() {
  if (state.net[0][0].empty()) {
    ImGui::TextUnformatted("The network is shown once the fit has reported.");
    return;
  }
  ImGui::TextWrapped("%s", "What the fit holds at its last report, a cell a number: its value, Adam's mean of its gradient (first moment), the root of Adam's mean of the gradient's "
                         "square (second moment), and their ratio, which times the learning rate is the step Adam takes. Each grid has its own scale, under it: 98 in 100 of its numbers are within it. Point at a cell for its number. "
                     "The hedger's rows are the units of a hidden layer: their weights from the seven inputs, their offsets (b), the second layer's weights from the first, its offsets, "
                     "and each unit's weight in the position with the position's offset. The law's values are its logits read as probabilities: an interval's kernels sum to one; "
                     "the moments and the step are the logits'.");
  // The hedger: 7 inputs -> 16 -> 16 -> 1. A row is a unit of a hidden layer; dh-fit's order (W1, b1, W2, b2, W3, b3).
  const int W2 = HIDDEN * INPUTS + HIDDEN, W3 = W2 + HIDDEN * HIDDEN + HIDDEN;
  const std::vector<Block> hedger = {{"in", HIDDEN, INPUTS, 0, INPUTS, 1}, {"b", HIDDEN, 1, HIDDEN * INPUTS, 1, 0}, {"hidden", HIDDEN, HIDDEN, W2, HIDDEN, 1},
                                     {"b", HIDDEN, 1, W2 + HIDDEN * HIDDEN, 1, 0}, {"o", HIDDEN, 1, W3, 1, 0}, {"b", 1, 1, W3 + HIDDEN, 0, 0}};
  const std::vector<Block> law = {{"a row an interval, a column a kernel", (int)state.expiries.size(), KERNELS, 0, KERNELS, 1}};
  const std::vector<Block> vol = {{"keep, swing, lean", 1, 3, 0, 0, 1}};
  ImVec2 available = ImGui::GetContentRegionAvail();
  float width = (available.x - 24) / 4, law_height = 62 + 14.0f * state.expiries.size();
  float hedger_height = std::max(160.0f, std::min(available.y - law_height - 76 - 110, (width - 42) / (float)(INPUTS + HIDDEN + 4) * (float)HIDDEN + 58));
  const char *groups[3] = {"hedger", "law's weights", "volatility state"};
  // The law's values are shown as what they mean: each interval's logits as its kernels' probabilities.
  std::vector<double> probability(state.net[1][0].size());
  for (size_t row = 0; row + KERNELS <= probability.size(); row += KERNELS) {
    double largest = *std::max_element(state.net[1][0].begin() + row, state.net[1][0].begin() + row + KERNELS), sum = 0;
    for (int k = 0; k < KERNELS; k++) sum += probability[row + k] = exp(state.net[1][0][row + k] - largest);
    for (int k = 0; k < KERNELS; k++) probability[row + k] /= sum;
  }
  const std::vector<Block> *blocks[3] = {&hedger, &law, &vol};
  float heights[3] = {hedger_height, law_height, 76};
  for (int group = 0; group < 3; group++) {
    const std::vector<double> &value = state.net[group][0], &first = state.net[group][1], &second = state.net[group][2];
    std::vector<double> root(second.size()), step(second.size());
    for (size_t i = 0; i < second.size() && i < first.size(); i++) root[i] = sqrt(second[i]), step[i] = first[i] / (root[i] + 1e-8);
    const std::vector<double> *shown[4] = {group == 1 ? &probability : &value, &first, &root, &step};
    const char *names[4] = {group == 1 ? "probability of each kernel" : "value", "first moment", "root of second moment", "step, over the learning rate"};
    for (int kind = 0; kind < 4; kind++) {
      char title[96];
      snprintf(title, sizeof title, "%s: %s", groups[group], names[kind]);
      if (kind) ImGui::SameLine(0, 8);
      grid(title, *shown[kind], *blocks[group], ImVec2(width, heights[group]), group == 0, group == 1 && kind == 0 ? &value : nullptr);
    }
  }
}

// ---- the Picks tab: what the model would trade on this chain, and what such trades did ----

// The backtest's table, written by the backtest and shipped with the image: a line of tab-separated
// cells is a row, a line starting with # is text.
static const char *backtest_table = "/usr/share/deep-hedger/backtest.tsv";

static void picks_tab() {
  ImGui::TextWrapped("%s", "A pick: an out-of-the-money contract whose market quote is on the wrong side of what the model says the hedged trade is worth: sold at a bid over "
                     "what manufacturing it costs on average, or bought at an ask under what holding it recovers. The gain is the model's mean over its paths, the "
                     "deviation what the hedge leaves. The last column says whether the strike is within 1.5 deviations of the forward, where the model fits the quotes.");
  struct Pick {
    const Contract *contract;
    bool sell, near;
    double price, value, deviation;
  };
  std::vector<Pick> picks;
  // Each expiry's deviation to its expiry under the law: its intervals' daily deviations over their days.
  std::vector<double> to_expiry;
  double variance = 0;
  for (size_t e = 0; e < state.expiries.size(); e++) {
    int days = state.expiries[e].business_days - (e ? state.expiries[e - 1].business_days : 0);
    variance += days * state.expiries[e].days[1] * state.expiries[e].days[1];
    to_expiry.push_back(sqrt(variance));
  }
  for (const Contract &c : state.contracts) {
    const Expiry &expiry = state.expiries[c.expiry];
    if (!c.fitted || c.call * (c.strike - expiry.forward) < 0) continue;
    double unit = expiry.discount * expiry.forward, width = to_expiry[c.expiry];
    bool near = width > 0 && fabs(log(c.strike / expiry.forward)) <= 1.5 * width;
    if (c.bid > c.model[1] * unit) picks.push_back({&c, true, near, c.bid, c.model[1] * unit, c.model[4] * unit});
    if (c.ask < c.model[0] * unit) picks.push_back({&c, false, near, c.ask, c.model[0] * unit, c.model[5] * unit});
  }
  auto gain = [](const Pick &pick) { return pick.sell ? pick.price - pick.value : pick.value - pick.price; };
  std::sort(picks.begin(), picks.end(), [&](const Pick &a, const Pick &b) { return gain(a) / a.deviation > gain(b) / b.deviation; });
  ImVec2 available = ImGui::GetContentRegionAvail();
  if (state.contracts.empty() || !state.contracts[0].fitted) ImGui::TextUnformatted("The picks are shown once the fit has reported.");
  else if (picks.empty()) ImGui::TextUnformatted("No pick: every out-of-the-money quote is on the right side of the model's value.");
  else if (ImGui::BeginTable("picks", 9, ImGuiTableFlags_Borders | ImGuiTableFlags_RowBg | ImGuiTableFlags_ScrollY, ImVec2(0, available.y * 0.42f))) {
    ImGui::TableSetupScrollFreeze(0, 1);
    for (const char *name : {"expiry", "", "strike", "trade", "at", "model's value", "mean gain", "deviation", "within 1.5 deviations"}) ImGui::TableSetupColumn(name);
    ImGui::TableHeadersRow();
    for (const Pick &pick : picks) {
      char date[32];
      time_t day = state.expiries[pick.contract->expiry].day * 86400;
      strftime(date, sizeof date, "%Y-%m-%d", gmtime(&day));
      ImGui::TableNextRow();
      ImGui::TableNextColumn(), ImGui::TextUnformatted(date);
      ImGui::TableNextColumn(), ImGui::TextUnformatted(pick.contract->call > 0 ? "call" : "put");
      ImGui::TableNextColumn(), ImGui::Text("%.5g", pick.contract->strike);
      ImGui::TableNextColumn(), ImGui::TextUnformatted(pick.sell ? "sell at bid" : "buy at ask");
      ImGui::TableNextColumn(), ImGui::Text("%.2f", pick.price);
      ImGui::TableNextColumn(), ImGui::Text("%.3f", pick.value);
      ImGui::TableNextColumn(), ImGui::TextColored(ImColor(ask_colour), "%+.3f", gain(pick));
      ImGui::TableNextColumn(), ImGui::Text("%.3f", pick.deviation);
      ImGui::TableNextColumn(), ImGui::TextUnformatted(pick.near ? "yes" : "no");
    }
    ImGui::EndTable();
  }
  static const std::string table = read_file(backtest_table);
  std::vector<std::string> lines;
  for (size_t at = 0, end; at < table.size(); at = end + 1) {
    end = table.find('\n', at);
    if (end == std::string::npos) end = table.size();
    if (end > at) lines.push_back(table.substr(at, end - at));
  }
  bool open = false;
  for (const std::string &line : lines) {
    if (line[0] == '#') {
      if (open) ImGui::EndTable(), open = false;
      ImGui::TextWrapped("%s", line.c_str() + 2);
      continue;
    }
    std::vector<std::string> cells;
    for (size_t at = 0, end; at <= line.size(); at = end + 1) {
      end = line.find('\t', at);
      if (end == std::string::npos) end = line.size();
      cells.push_back(line.substr(at, end - at));
    }
    if (!open) {
      if (!ImGui::BeginTable("backtest", (int)cells.size(), ImGuiTableFlags_Borders | ImGuiTableFlags_RowBg)) return;
      open = true;
      ImGui::TableSetupColumn(cells[0].c_str(), ImGuiTableColumnFlags_WidthStretch, 3);
      for (size_t n = 1; n < cells.size(); n++) ImGui::TableSetupColumn(cells[n].c_str(), ImGuiTableColumnFlags_WidthStretch, 1);
      ImGui::TableHeadersRow();
      continue;
    }
    ImGui::TableNextRow();
    for (const std::string &cell : cells) ImGui::TableNextColumn(), ImGui::TextWrapped("%s", cell.c_str());
  }
  if (open) ImGui::EndTable();
}

static void fit_tab() {
  if (ImGui::BeginTable("fit", 13, ImGuiTableFlags_Borders | ImGuiTableFlags_RowBg)) {
    for (const char *name : {"expiry", "days", "forward, quotes", "forward, model", "discount", "contracts", "in band", "market spread", "model spread", "hedge cost",
                             "risk left", "days paid for", "implied"})
      ImGui::TableSetupColumn(name);
    ImGui::TableHeadersRow();
    for (int e = 0; e <= (int)state.expiries.size(); e++) {
      bool all = e == (int)state.expiries.size();
      int count = 0, inside = 0, fitted = 0;
      double market = 0, model = 0, cost = 0, deviation = 0, unhedged = 0;
      std::vector<double> days;
      for (const Contract &c : state.contracts) {
        if (!all && c.expiry != e) continue;
        const Expiry &expiry = state.expiries[c.expiry];
        double unit = expiry.discount * expiry.forward;
        count++, market += c.ask - c.bid;
        if (!c.fitted) continue;
        fitted++;
        double quotes[2] = {model_bid(c, best_closure()) * unit, model_ask(c, best_closure()) * unit};
        for (double quote : quotes) inside += quote >= c.bid - 1e-9 && quote <= c.ask + 1e-9;
        days.push_back(c.model[10] < 0 ? 1e9 : c.model[10]);
        model += quotes[1] - quotes[0], cost += (c.model[2] + c.model[3]) * unit, deviation += (c.model[4] + c.model[5]) * unit, unhedged += 2 * c.model[7] * unit;
      }
      ImGui::TableNextRow();
      if (all) {
        ImGui::TableNextColumn(), ImGui::TextUnformatted("all");
        for (int i = 0; i < 4; i++) ImGui::TableNextColumn();
      } else {
        const Expiry &expiry = state.expiries[e];
        char date[32];
        time_t day = expiry.day * 86400;
        strftime(date, sizeof date, "%Y-%m-%d", gmtime(&day));
        ImGui::TableNextColumn(), ImGui::TextUnformatted(date);
        ImGui::TableNextColumn(), ImGui::Text("%d", expiry.business_days);
        ImGui::TableNextColumn(), ImGui::Text("%.2f", expiry.forward);
        ImGui::TableNextColumn();
        if (expiry.model_forward > 0) ImGui::Text("%.2f", expiry.model_forward * expiry.forward);
        ImGui::TableNextColumn(), ImGui::Text("%.4f", expiry.discount);
      }
      ImGui::TableNextColumn(), ImGui::Text("%d", count);
      ImGui::TableNextColumn();
      if (fitted) ImGui::Text("%.0f%%", 50.0 * inside / fitted);
      ImGui::TableNextColumn(), ImGui::Text("%.3f", market / count);
      ImGui::TableNextColumn();
      if (fitted) ImGui::Text("%.3f", model / fitted);
      ImGui::TableNextColumn();
      if (fitted) ImGui::Text("%.3f", cost / fitted);
      ImGui::TableNextColumn();
      if (fitted && unhedged > 0) ImGui::Text("%.0f%%", 100 * deviation / unhedged);
      ImGui::TableNextColumn();
      // The median over the contracts of the days of the hedged book's risk a market spread pays for.
      std::sort(days.begin(), days.end());
      if (fitted && days[days.size() / 2] > 1e8) ImGui::TextUnformatted("> expiry");
      else if (fitted) ImGui::Text("%.2f", days[days.size() / 2]);
      // The expiry's number under the nearest closure.
      ImGui::TableNextColumn();
      if (!all && (size_t)e < state.closure_numbers[best_closure()].size())
        ImGui::Text(best_closure() == OUT ? "%.2g days" : "%.2g deviations", state.closure_numbers[best_closure()][e]);
    }
    ImGui::EndTable();
  }
  ImGui::TextWrapped("In band: the model's bids and asks inside the market's. Spreads are means, in currency. A model quote is what replicating the contract costs on "
                     "average, less or plus a charge for the risk of not being out of it yet; the charge is as the Spreads tab's best closure has it (%s). Risk "
                     "left: the deviation of what the hedge leaves as a share of the payoff's own. Days paid for: the median over the contracts of the days of "
                     "that risk a market spread pays for at one deviation, over the floor. Implied: the expiry's number under that closure. The loss below is the two "
                     "middles' distance outside the bands.", closure_names[best_closure()]);
  if (state.losses.size() > 1) {
    ImVec2 available = ImGui::GetContentRegionAvail();
    double low = 1e30, high = -1e30;
    for (float loss : state.losses) low = std::min(low, log10(loss + 1e-12)), high = std::max(high, log10(loss + 1e-12));
    ImVec2 size((available.x - 8) / 2, std::max(160.0f, available.y - 8));
    double last = 20.0 * (state.losses.size() - 1);
    Plot plot("log10 of the generator's loss, the mean squared distance outside the bands in band widths, by iteration", size, 0, last, low - 0.1, high + 0.1);
    std::vector<ImVec2> line;
    for (size_t i = 0; i < state.losses.size(); i++) line.push_back(plot.at(20.0 * i, log10(state.losses[i] + 1e-12)));
    plot.draw->AddPolyline(line.data(), (int)line.size(), ask_colour, 2.0f);
    ImGui::SameLine(0, 8);
    Plot share("share of the model's bids and asks inside the market's bands, by iteration", size, 0, last, 0, 1);
    line.clear();
    for (size_t i = 0; i < state.inside.size(); i++) line.push_back(share.at(20.0 * i, state.inside[i]));
    share.draw->AddPolyline(line.data(), (int)line.size(), bid_colour, 2.0f);
  }
}

// How the fit stands, in a line: where it is, how its quotes sit in the market's bands,
// and whether the loss still falls (its last five reports against the five before).
static void verdict() {
  int inside = 0, fitted = 0;
  for (const Contract &c : state.contracts) {
    if (!c.fitted) continue;
    double unit = state.expiries[c.expiry].discount * state.expiries[c.expiry].forward;
    fitted += 2;
    for (double quote : {model_bid(c, best_closure()) * unit, model_ask(c, best_closure()) * unit}) inside += quote >= c.bid - 1e-9 && quote <= c.ask + 1e-9;
  }
  size_t reports = state.losses.size();
  const char *trend = "";
  if (reports >= 10) {
    double recent = 0, before = 0;
    for (size_t i = 0; i < 5; i++) recent += state.losses[reports - 1 - i], before += state.losses[reports - 6 - i];
    trend = recent < 0.9 * before ? ", falling" : recent > 1.1 * before ? ", rising" : ", level";
  }
  ImGui::Text("iteration %d, %.1f a second.", state.iteration, state.iteration / std::max(state.seconds, 1e-9));
  ImGui::SameLine();
  int closure = best_closure();
  ImGui::TextColored(ImColor(ask_colour), "%.0f%% of the model's bids and asks in the market's bands, loss %.3g%s; spreads as %s, over %.1f cents.  ",
                     fitted ? 100.0 * inside / fitted : 0.0, reports ? state.losses.back() : 0.0f, trend, closure_names[closure], 100 * state.closure_floor[closure] * state.spot);
}

// The market's spreads against the model's under each closure, and the days each pays for.
static void spreads_tab() {
  static const ImU32 colours[3] = {ask_colour, bid_colour, IM_COL32(110, 200, 120, 255)};
  ImGui::TextColored(ImColor(market_colour), "o the market's half spread");
  for (int n = 0; n < 3; n++) {
    ImGui::SameLine();
    char label[128];
    snprintf(label, sizeof label, "   %s: over %.1f cents, off by %.2f", closure_names[n], 100 * state.closure_floor[n] * state.spot, state.closure_miss[n]);
    ImGui::TextColored(ImColor(colours[n]), "%s%s", label, n == best_closure() ? ", the nearest" : "");
  }
  ImGui::TextUnformatted("by log(strike / forward), in the money faint: log10 of half the spread in currency; and log10 of the days of the hedged book's risk each market spread "
                         "pays for, at one deviation over the floor (at the top, more than to expiry)");
  double x0 = 0, x1 = 0;
  for (const Contract &c : state.contracts) {
    double x = log(c.strike / state.expiries[c.expiry].forward);
    x0 = std::min(x0, x), x1 = std::max(x1, x);
  }
  const int columns = 4;
  int rows = ((int)state.expiries.size() * 2 + columns - 1) / columns;
  ImVec2 available = ImGui::GetContentRegionAvail();
  ImVec2 size((available.x - 8 * (columns - 1)) / columns, std::max(120.0f, (available.y - 8 * rows) / rows));
  for (int e = 0, cell = 0; e < (int)state.expiries.size(); e++)
    for (int row = 0; row < 2; row++) {
      const Expiry &expiry = state.expiries[e];
      double unit = expiry.discount * expiry.forward;
      char title[96];
      time_t day = expiry.day * 86400;
      size_t length = strftime(title, sizeof title, row ? "days paid for, %b %d" : "half spread, %b %d", gmtime(&day));
      // The expiry's number under the nearest closure.
      if (row == 0 && (size_t)e < state.closure_numbers[best_closure()].size())
        snprintf(title + length, sizeof title - length, best_closure() == OUT ? ": out after %.2g days" : ": %.2g deviations", state.closure_numbers[best_closure()][e]);
      Plot plot(title, size, x0, x1, row ? -4 : -2.5, row ? 2 : 1);
      plot.draw->AddLine(plot.at(0, plot.y0), plot.at(0, plot.y1), frame_colour);
      std::vector<ImVec2> lines[3];
      for (const Contract &c : state.contracts) {
        if (c.expiry != e) continue;
        double x = log(c.strike / expiry.forward);
        bool in_the_money = (c.strike < expiry.forward) == (c.call > 0);
        ImU32 colour = in_the_money ? frame_colour : market_colour;
        if (row == 0) {
          plot.draw->AddCircle(plot.at(x, log10((c.ask - c.bid) / 2)), 3, colour);
          if (c.fitted && !in_the_money)
            for (int n = 0; n < 3; n++) lines[n].push_back(plot.at(x, log10(std::max((model_ask(c, n) - model_bid(c, n)) * unit / 2, 1e-9))));
        } else if (c.fitted)
          plot.draw->AddCircle(plot.at(x, c.model[10] < 0 ? 2 : log10(std::max(c.model[10], 1e-9))), 3, colour);
      }
      for (int n = 0; n < 3; n++) {
        std::sort(lines[n].begin(), lines[n].end(), [](const ImVec2 &a, const ImVec2 &b) { return a.x < b.x; });
        if (lines[n].size() > 1) plot.draw->AddPolyline(lines[n].data(), (int)lines[n].size(), colours[n], n == best_closure() ? 2.5f : 1.0f);
      }
      if (cell++ % columns != columns - 1) ImGui::SameLine(0, 8);
    }
}

int main(int, char **) {
  mkdir("/tmp/dh", 0755);
  if (SDL_Init(SDL_INIT_VIDEO) != 0) return fprintf(stderr, "dh-gui: %s\n", SDL_GetError()), 1;
  SDL_Window *window = SDL_CreateWindow("deep hedger", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, 1600, 900, SDL_WINDOW_RESIZABLE);
  SDL_Renderer *renderer = window ? SDL_CreateRenderer(window, -1, 0) : nullptr;
  if (!renderer) return fprintf(stderr, "dh-gui: %s\n", SDL_GetError()), 1;
  ImGui::CreateContext();
  ImGui::GetIO().IniFilename = nullptr;
  ImGui::StyleColorsDark();
  ImGui_ImplSDL2_InitForSDLRenderer(window, renderer);
  ImGui_ImplSDLRenderer2_Init(renderer);

  char symbol[16] = "AAPL", token[128] = "";
  float cost_bp = 0.25f;
  int paths = 1024, seed = 1;
  pid_t download = -1, fit = -1;
  FILE *output = nullptr;
  std::string pending;
  State staged;
  for (bool done = false; !done;) {
    for (SDL_Event event; SDL_PollEvent(&event);) {
      ImGui_ImplSDL2_ProcessEvent(&event);
      if (event.type == SDL_QUIT) done = true;
    }
    int status;
    if (ended(download, status)) {
      if (load_chain()) staged = state;
      else if (status != 0) state.status += " (curl ended with " + std::to_string(WEXITSTATUS(status)) + ")";
    }
    if (output) read_fit(output, pending, staged);
    if (ended(fit, status) && status != 0 && state.status.find("gpu") == std::string::npos) state.status = "dh-fit ended: " + state.status;

    ImGui_ImplSDLRenderer2_NewFrame();
    ImGui_ImplSDL2_NewFrame();
    ImGui::NewFrame();
    ImGui::SetNextWindowPos(ImVec2(0, 0));
    ImGui::SetNextWindowSize(ImGui::GetIO().DisplaySize);
    ImGui::Begin("deep hedger", nullptr, ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoSavedSettings);
    ImGui::SetNextItemWidth(70), ImGui::InputText("symbol", symbol, sizeof symbol, ImGuiInputTextFlags_CharsUppercase);
    ImGui::SameLine(), ImGui::SetNextItemWidth(150), ImGui::InputText("marketdata.app token", token, sizeof token, ImGuiInputTextFlags_Password);
    ImGui::SameLine();
    bool load = ImGui::Button("Load quotes");
    if (load && download <= 0) {
      stop(fit);
      // The contracts of the next 100 days around the money, in one request.
      time_t now = time(nullptr), until = now + 100 * 86400;
      char from[16], to[16];
      strftime(from, sizeof from, "%Y-%m-%d", gmtime(&now)), strftime(to, sizeof to, "%Y-%m-%d", gmtime(&until));
      std::vector<std::string> command = {"curl", "-s", "-m", "60", "-o", chain_json};
      if (token[0]) command.push_back("-H"), command.push_back(std::string("Authorization: Bearer ") + token);
      command.push_back(std::string("https://api.marketdata.app/v1/options/chain/") + symbol + "/?expiration=all&from=" + from + "&to=" + to + "&strikeLimit=60");
      unlink(chain_json);
      download = start(command, "/tmp/dh/curl.out");
      state.status = download > 0 ? "Loading quotes..." : "curl did not start.";
    }
    ImGui::SameLine(0, 24), ImGui::SetNextItemWidth(60), ImGui::InputFloat("stock cost, bp", &cost_bp, 0, 0, "%.2f");
    ImGui::SameLine(), ImGui::SetNextItemWidth(70), ImGui::InputInt("paths", &paths, 0);
    ImGui::SameLine();
    if (fit > 0 ? ImGui::Button("Stop") : ImGui::Button("Fit") && !state.contracts.empty()) {
      if (fit > 0) stop(fit);
      else {
        paths = std::max(64, paths / 64 * 64);
        write_chain(cost_bp * 1e-4);
        for (Contract &c : state.contracts) c.fitted = false;
        state.losses.clear(), state.inside.clear(), state.iteration = 0;
        staged = state, pending.clear();
        if (output) fclose(output);
        fit = start({"dh-fit", chain_text, std::to_string(paths), std::to_string(seed++)}, fit_output);
        output = fopen(fit_output, "r");
      }
    }
    ImGui::SameLine();
    if (ImGui::Button("Quit")) done = true;  // the fit is stopped below, and the shell is in front again
    if (state.iteration) verdict(), ImGui::SameLine();
    ImGui::TextUnformatted(state.status.c_str());

    if (!state.contracts.empty() && ImGui::BeginTabBar("views")) {
      if (ImGui::BeginTabItem("Volatility")) quotes_tab(true), ImGui::EndTabItem();
      if (ImGui::BeginTabItem("Price")) quotes_tab(false), ImGui::EndTabItem();
      if (ImGui::BeginTabItem("Spreads")) spreads_tab(), ImGui::EndTabItem();
      if (ImGui::BeginTabItem("Law")) law_tab(), ImGui::EndTabItem();
      if (ImGui::BeginTabItem("Hedge")) hedge_tab(), ImGui::EndTabItem();
      if (ImGui::BeginTabItem("Quotes")) contracts_tab(), ImGui::EndTabItem();
      if (ImGui::BeginTabItem("Fit")) fit_tab(), ImGui::EndTabItem();
      if (ImGui::BeginTabItem("Network")) network_tab(), ImGui::EndTabItem();
      if (ImGui::BeginTabItem("Picks")) picks_tab(), ImGui::EndTabItem();
      ImGui::EndTabBar();
    }
    ImGui::End();
    ImGui::Render();
    SDL_SetRenderDrawColor(renderer, 18, 18, 18, 255);
    SDL_RenderClear(renderer);
    ImGui_ImplSDLRenderer2_RenderDrawData(ImGui::GetDrawData(), renderer);
    SDL_RenderPresent(renderer);
    SDL_Delay(30);
  }
  stop(fit), stop(download);
  ImGui_ImplSDLRenderer2_Shutdown();
  ImGui_ImplSDL2_Shutdown();
  ImGui::DestroyContext();
  SDL_Quit();
  return 0;
}
