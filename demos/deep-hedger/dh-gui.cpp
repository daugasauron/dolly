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

static const char *chain_json = "/tmp/dh/chain.json", *chain_text = "/tmp/dh/chain.txt", *fit_output = "/tmp/dh/fit.out";
enum { MAX_DAYS = 64, MAX_EXPIRIES = 8, STRIKES_PER_SIDE = 13, KERNELS = 49 };

struct Contract {
  int expiry;          // index into expiries
  double strike;       // in currency
  int call;            // +1 or -1
  double bid, ask;     // in currency
  double model[8] = {};  // dh-fit's result fields, in forward units
  bool fitted = false;
};
struct Expiry {
  long day;            // days since 1970
  int business_days, calendar_days;
  double forward, discount;
  double model_forward = 0;
  std::vector<double> law;  // the interval's kernel weights
};
struct State {
  std::vector<Contract> contracts;
  std::vector<Expiry> expiries;
  std::vector<double> nodes;
  std::vector<std::vector<float>> paths;
  std::vector<float> losses;
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
static void write_chain(double cost, double risk) {
  FILE *file = fopen(chain_text, "w");
  fprintf(file, "cost %.9g risk %.9g\ndays", cost, risk);
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
      staged.iteration = index, staged.losses.push_back((float)loss), staged.seconds = seconds;
    else if (name == "quote" && numbers.size() == 9 && numbers[0] < staged.contracts.size()) {
      Contract &c = staged.contracts[(size_t)numbers[0]];
      std::copy(numbers.begin() + 1, numbers.end(), c.model);
      c.fitted = true;
    } else if (name == "law" && numbers.size() == KERNELS + 1 && numbers[0] < staged.expiries.size())
      staged.expiries[(size_t)numbers[0]].law.assign(numbers.begin() + 1, numbers.end());
    else if (name == "forward" && numbers.size() == 3 && numbers[0] < staged.expiries.size())
      staged.expiries[(size_t)numbers[0]].model_forward = numbers[1];
    else if (name == "path" && numbers.size() > 2) {
      if (numbers[0] == 0) staged.paths.clear();
      staged.paths.emplace_back(numbers.begin() + 1, numbers.end());
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
                   frame_colour = IM_COL32(90, 90, 90, 255), text_colour = IM_COL32(170, 170, 170, 255);

struct Plot {
  ImVec2 origin, size;
  double x0, x1, y0, y1;
  ImDrawList *draw;
  Plot(const char *title, ImVec2 size, double x0, double x1, double y0, double y1) : size(size), x0(x0), x1(x1), y0(y0), y1(y1) {
    origin = ImGui::GetCursorScreenPos();
    draw = ImGui::GetWindowDrawList();
    ImGui::Dummy(size);
    draw->AddRect(origin, ImVec2(origin.x + size.x, origin.y + size.y), frame_colour);
    draw->AddText(ImVec2(origin.x + 6, origin.y + 3), text_colour, title);
    char label[32];
    snprintf(label, sizeof label, "%.3g", y1);
    draw->AddText(ImVec2(origin.x + size.x - 6 - ImGui::CalcTextSize(label).x, origin.y + 3), text_colour, label);
    snprintf(label, sizeof label, "%.3g", y0);
    draw->AddText(ImVec2(origin.x + size.x - 6 - ImGui::CalcTextSize(label).x, origin.y + size.y - 17), text_colour, label);
  }
  ImVec2 at(double x, double y) const {
    const float margin = 14;
    return ImVec2(origin.x + margin + (float)((x - x0) / (x1 - x0)) * (size.x - 2 * margin),
                  origin.y + size.y - 20 - (float)((std::min(std::max(y, y0), y1) - y0) / (y1 - y0)) * (size.y - 42));
  }
};

// One expiry's calls or puts: the market's band a bar, the model's bid and ask lines.
static void quotes_plot(int expiry_index, int call, bool volatility, ImVec2 size, double x0, double x1, double top) {
  const Expiry &expiry = state.expiries[expiry_index];
  double years = expiry.calendar_days / 365.0, unit = expiry.discount * expiry.forward;
  char title[96];
  time_t day = expiry.day * 86400;
  strftime(title, sizeof title, call > 0 ? "calls %b %d" : "puts %b %d", gmtime(&day));
  Plot plot(title, size, x0, x1, 0, top);
  plot.draw->AddLine(plot.at(0, 0), plot.at(0, top), frame_colour);
  std::vector<ImVec2> bids, asks;
  for (const Contract &c : state.contracts) {
    if (c.expiry != expiry_index || c.call != call) continue;
    double strike = c.strike / expiry.forward, x = log(strike);
    auto shown = [&](double price_over_unit) { return volatility ? implied_volatility(price_over_unit, strike, call, years) : price_over_unit * unit; };
    double low = shown(c.bid / unit), high = shown(c.ask / unit);
    // A bid under the option's value at expiry has no volatility: the bar is faint and starts at zero.
    if (!std::isnan(high)) plot.draw->AddLine(plot.at(x, std::isnan(low) ? 0 : low), plot.at(x, high), std::isnan(low) ? frame_colour : market_colour, 3);
    if (!c.fitted) continue;
    double bid = shown(c.model[0]), ask = shown(c.model[1]);
    if (!std::isnan(bid)) bids.push_back(plot.at(x, bid));
    if (!std::isnan(ask)) asks.push_back(plot.at(x, ask));
  }
  if (bids.size() > 1) plot.draw->AddPolyline(bids.data(), (int)bids.size(), bid_colour, 2.0f);
  if (asks.size() > 1) plot.draw->AddPolyline(asks.data(), (int)asks.size(), ask_colour, 2.0f);
}

static void quotes_tab(bool volatility) {
  ImGui::TextColored(ImColor(market_colour), "| market bid to ask");
  ImGui::SameLine();
  ImGui::TextColored(ImColor(bid_colour), "  model bid");
  ImGui::SameLine();
  ImGui::TextColored(ImColor(ask_colour), "  model ask");
  ImGui::SameLine();
  double x0 = 0, x1 = 0;
  for (const Contract &c : state.contracts) {
    double x = log(c.strike / state.expiries[c.expiry].forward);
    x0 = std::min(x0, x), x1 = std::max(x1, x);
  }
  ImGui::Text(volatility ? "   Black volatility at the forward the quotes imply, by log(strike / forward) from %.2f to %.2f; the line is the forward"
                         : "   price, by log(strike / forward) from %.2f to %.2f; the line is the forward", x0, x1);
  int columns = 4, rows = ((int)state.expiries.size() * 2 + columns - 1) / columns;
  ImVec2 available = ImGui::GetContentRegionAvail();
  ImVec2 size((available.x - 8 * (columns - 1)) / columns, std::max(120.0f, (available.y - 8 * rows) / rows));
  for (int e = 0; e < (int)state.expiries.size(); e++) {
    const Expiry &expiry = state.expiries[e];
    // The axis is the market's alone, so it does not move while the model fits:
    // prices to the highest ask, volatilities to twice the median ask's.
    std::vector<double> values;
    for (const Contract &c : state.contracts)
      if (c.expiry == e) {
        double strike = c.strike / expiry.forward, unit = expiry.discount * expiry.forward;
        double value = volatility ? implied_volatility(c.ask / unit, strike, c.call, expiry.calendar_days / 365.0) : c.ask;
        if (!std::isnan(value)) values.push_back(value);
      }
    std::sort(values.begin(), values.end());
    double top = values.empty() ? 1 : volatility ? 2 * values[values.size() / 2] : 1.05 * values.back();
    for (int call : {1, -1}) {
      quotes_plot(e, call, volatility, size, x0, x1, top);
      if ((e * 2 + (call < 0)) % columns != columns - 1) ImGui::SameLine(0, 8);
    }
  }
}

// Mean, deviation, skewness and excess kurtosis of an interval's daily return.
static void moments(const std::vector<double> &law, double out[4]) {
  double m[5] = {};
  for (int k = 0; k < KERNELS && k + 2 < (int)state.nodes.size(); k++) {
    // A hat's moments by Simpson's rule on each of its two sides: exact for the mean and the
    // variance, and close for the two above them, a hat being narrow.
    double lo = state.nodes[k], peak = state.nodes[k + 1], hi = state.nodes[k + 2], height = 2 / (hi - lo);
    for (int side = 0; side < 2; side++) {
      double a = side ? peak : lo, b = side ? hi : peak, fa = side ? height : 0, fb = side ? 0 : height;
      for (int power = 0; power < 5; power++)
        m[power] += law[k] * (b - a) / 6 * (pow(a, power) * fa + 4 * pow((a + b) / 2, power) * (fa + fb) / 2 + pow(b, power) * fb);
    }
  }
  double mean = m[1], variance = m[2] - mean * mean;
  out[0] = mean, out[1] = sqrt(variance);
  out[2] = (m[3] - 3 * mean * m[2] + 2 * mean * mean * mean) / pow(variance, 1.5);
  out[3] = (m[4] - 4 * mean * m[3] + 6 * mean * mean * m[2] - 3 * pow(mean, 4)) / (variance * variance) - 3;
}

static void law_tab() {
  if (state.nodes.empty() || state.expiries[0].law.empty()) {
    ImGui::TextUnformatted("The law is shown once the fit has reported.");
    return;
  }
  ImVec2 available = ImGui::GetContentRegionAvail();
  ImVec2 size((available.x - 8) / 2, available.y * 0.55f);
  double peak = 0;
  for (const Expiry &expiry : state.expiries)
    for (int k = 0; k < KERNELS; k++) peak = std::max(peak, expiry.law[k] * 2 / (state.nodes[k + 2] - state.nodes[k]));
  Plot density("density of one day's log return, an interval a line (early blue, late orange)", size, -0.08, 0.08, 0, peak * 1.05);
  for (size_t e = 0; e < state.expiries.size(); e++) {
    std::vector<ImVec2> line;
    for (int k = 0; k < KERNELS; k++)
      if (fabs(state.nodes[k + 1]) <= 0.08) line.push_back(density.at(state.nodes[k + 1], state.expiries[e].law[k] * 2 / (state.nodes[k + 2] - state.nodes[k])));
    float late = state.expiries.size() > 1 ? (float)e / (state.expiries.size() - 1) : 0;
    density.draw->AddPolyline(line.data(), (int)line.size(), IM_COL32(64 + 191 * late, 156 - 18 * late, 255 - 207 * late, 255), 2.0f);
  }
  ImGui::SameLine(0, 8);
  int days = state.expiries.back().business_days;
  Plot paths("the stock over its forward by business day: 28 paths, and the batch's 10 lowest and 10 highest", size, 0, days, 0.6, 1.4);
  for (size_t index = 0; index < state.paths.size(); index++) {
    const std::vector<float> &path = state.paths[index];
    std::vector<ImVec2> line;
    for (size_t t = 0; t < path.size(); t++) line.push_back(paths.at((double)t, exp(path[t])));
    // dh-fit's order: 28 drawn at random, then the lowest ten, then the highest ten.
    paths.draw->AddPolyline(line.data(), (int)line.size(), index < 28 ? IM_COL32(170, 170, 170, 120) : index < 38 ? ask_colour : bid_colour, 1.0f);
  }
  if (ImGui::BeginTable("law", 7, ImGuiTableFlags_Borders | ImGuiTableFlags_RowBg)) {
    for (const char *name : {"interval ends", "business day", "mean of a day, bp", "deviation of a day, %", "the same, a year", "skewness", "excess kurtosis"}) ImGui::TableSetupColumn(name);
    ImGui::TableHeadersRow();
    for (const Expiry &expiry : state.expiries) {
      double m[4];
      moments(expiry.law, m);
      char date[32];
      time_t day = expiry.day * 86400;
      strftime(date, sizeof date, "%Y-%m-%d", gmtime(&day));
      ImGui::TableNextRow();
      ImGui::TableNextColumn(), ImGui::TextUnformatted(date);
      ImGui::TableNextColumn(), ImGui::Text("%d", expiry.business_days);
      ImGui::TableNextColumn(), ImGui::Text("%.2f", m[0] * 1e4);
      ImGui::TableNextColumn(), ImGui::Text("%.3f", m[1] * 100);
      ImGui::TableNextColumn(), ImGui::Text("%.1f%%", m[1] * sqrt(252.0) * 100);
      ImGui::TableNextColumn(), ImGui::Text("%.2f", m[2]);
      ImGui::TableNextColumn(), ImGui::Text("%.1f", m[3]);
    }
    ImGui::EndTable();
  }
}

static void fit_tab(double risk) {
  if (ImGui::BeginTable("fit", 12, ImGuiTableFlags_Borders | ImGuiTableFlags_RowBg)) {
    for (const char *name : {"expiry", "days", "forward, quotes", "forward, model", "discount", "contracts", "bids and asks in band", "market spread", "model spread",
                             "of it hedge cost", "risk left of unhedged", "risk price the market implies"})
      ImGui::TableSetupColumn(name);
    ImGui::TableHeadersRow();
    for (int e = 0; e <= (int)state.expiries.size(); e++) {
      bool all = e == (int)state.expiries.size();
      int count = 0, inside = 0, fitted = 0;
      double market = 0, model = 0, cost = 0, deviation = 0, unhedged = 0;
      for (const Contract &c : state.contracts) {
        if (!all && c.expiry != e) continue;
        const Expiry &expiry = state.expiries[c.expiry];
        double unit = expiry.discount * expiry.forward;
        count++, market += c.ask - c.bid;
        if (!c.fitted) continue;
        fitted++;
        for (int side = 0; side < 2; side++) inside += c.model[side] * unit >= c.bid - 1e-9 && c.model[side] * unit <= c.ask + 1e-9;
        model += (c.model[1] - c.model[0]) * unit, cost += (c.model[2] + c.model[3]) * unit, deviation += (c.model[4] + c.model[5]) * unit, unhedged += 2 * c.model[7] * unit;
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
      // The risk price at which this hedger's costs and risks add up to the market's spreads.
      if (fitted && deviation > 0) ImGui::Text("%.3f", (market / count * fitted - cost) / deviation);
    }
    ImGui::EndTable();
  }
  ImGui::Text("Spreads are means, in currency. A model spread is hedge cost plus the risk price (%.3g) times the risk daily hedging leaves, both sides: the deviation of what is left, here as a share of the payoff's own.", risk);
  if (state.losses.size() > 1) {
    ImVec2 available = ImGui::GetContentRegionAvail();
    double low = 1e30, high = -1e30;
    for (float loss : state.losses) low = std::min(low, log10(loss + 1e-12)), high = std::max(high, log10(loss + 1e-12));
    Plot plot("log10 of the generator's loss: mean squared distance outside the bands, in band widths, by report", ImVec2(available.x, std::max(160.0f, available.y - 8)), 0,
              (double)state.losses.size() - 1, low - 0.1, high + 0.1);
    std::vector<ImVec2> line;
    for (size_t i = 0; i < state.losses.size(); i++) line.push_back(plot.at((double)i, log10(state.losses[i] + 1e-12)));
    plot.draw->AddPolyline(line.data(), (int)line.size(), ask_colour, 2.0f);
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
  float cost_bp = 1.0f, risk = 0.05f;
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
    ImGui::SameLine(), ImGui::SetNextItemWidth(60), ImGui::InputFloat("risk price", &risk, 0, 0, "%.3f");
    ImGui::SameLine(), ImGui::SetNextItemWidth(70), ImGui::InputInt("paths", &paths, 0);
    ImGui::SameLine();
    if (fit > 0 ? ImGui::Button("Stop") : ImGui::Button("Fit") && !state.contracts.empty()) {
      if (fit > 0) stop(fit);
      else {
        paths = std::max(64, paths / 64 * 64);
        write_chain(cost_bp * 1e-4, risk);
        for (Contract &c : state.contracts) c.fitted = false;
        state.losses.clear(), state.iteration = 0;
        staged = state, pending.clear();
        if (output) fclose(output);
        fit = start({"dh-fit", chain_text, std::to_string(paths), std::to_string(seed++)}, fit_output);
        output = fopen(fit_output, "r");
      }
    }
    if (state.iteration) ImGui::Text("iteration %d, %.2f a second.  ", state.iteration, state.iteration / std::max(state.seconds, 1e-9)), ImGui::SameLine();
    ImGui::TextUnformatted(state.status.c_str());

    if (!state.contracts.empty() && ImGui::BeginTabBar("views")) {
      if (ImGui::BeginTabItem("Volatility")) quotes_tab(true), ImGui::EndTabItem();
      if (ImGui::BeginTabItem("Price")) quotes_tab(false), ImGui::EndTabItem();
      if (ImGui::BeginTabItem("Law")) law_tab(), ImGui::EndTabItem();
      if (ImGui::BeginTabItem("Fit")) fit_tab(risk), ImGui::EndTabItem();
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
