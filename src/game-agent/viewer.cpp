// SPDX-License-Identifier: GPL-2.0-or-later
#include "../rts/spectator/graphics.h"
#include "control.h"
#include <algorithm>
#include <cctype>
#include <sstream>

static std::string contents(const std::string &path) {
    auto bytes = read(path, 512 * 1024); return std::string(bytes.begin(), bytes.end());
}
static bool publish(const std::string &path, const void *data, size_t size) {
    const auto temporary = path + ".tmp";
    FILE *file = std::fopen(temporary.c_str(), "wb");
    if (!file) return false;
    const bool okay = std::fwrite(data, 1, size, file) == size;
    const int closed = std::fclose(file);
    return okay && !closed && !std::rename(temporary.c_str(), path.c_str());
}
static void publish(const std::string &path, const std::string &value) { publish(path, value.data(), value.size()); }
static std::vector<std::string> split(const std::string &value, char delimiter = '\n') {
    std::vector<std::string> result; std::istringstream stream(value); std::string item;
    while (std::getline(stream, item, delimiter)) result.push_back(item);
    return result;
}
static std::string lower(std::string value) {
    for (auto &c : value) if (static_cast<unsigned char>(c) < 128) c = std::tolower(c);
    return value;
}
static bool hit(int x, int y, SDL_Rect rect) { return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h; }
static void shade(SDL_Rect rect, Uint8 alpha = 240, Uint8 red = 12, Uint8 green = 19, Uint8 blue = 26) {
    SDL_SetRenderDrawColor(renderer, red, green, blue, alpha); SDL_RenderFillRect(renderer, &rect);
}
static void button(const std::string &label, SDL_Rect rect) { shade(rect, 245, 38, 63, 73); text(label, rect.x + 12, rect.y + 10, rect.w - 24, 1, false); }

struct Editor {
    std::string value;
    size_t cursor = 0;
    bool all = false;
    void set(const std::string &text) { value = text; cursor = value.size(); all = false; }
    size_t previous() const { size_t n = cursor; if (n) { --n; while (n && (static_cast<unsigned char>(value[n]) & 0xc0) == 0x80) --n; } return n; }
    size_t next() const { size_t n = cursor; if (n < value.size()) { ++n; while (n < value.size() && (static_cast<unsigned char>(value[n]) & 0xc0) == 0x80) ++n; } return n; }
    void insert(const std::string &text) {
        if ((all ? 0 : value.size()) + text.size() > 65536) return;
        if (all) { value.clear(); cursor = 0; all = false; }
        value.insert(cursor, text); cursor += text.size();
    }
    void key(SDL_Keycode key, bool control) {
        if (control && key == SDLK_a) { all = true; return; }
        switch (key) {
            case SDLK_BACKSPACE: case SDLK_DELETE: case SDLK_LEFT: case SDLK_RIGHT: case SDLK_HOME: case SDLK_END: break;
            default: return;
        }
        if ((key == SDLK_BACKSPACE || key == SDLK_DELETE) && all) { set(""); return; }
        if (key == SDLK_BACKSPACE && cursor) { const auto n = previous(); value.erase(n, cursor - n); cursor = n; }
        if (key == SDLK_DELETE && cursor < value.size()) value.erase(cursor, next() - cursor);
        if (key == SDLK_LEFT) cursor = previous();
        if (key == SDLK_RIGHT) cursor = next();
        if (key == SDLK_HOME) { const auto n = cursor ? value.rfind('\n', cursor - 1) : std::string::npos; cursor = control || n == std::string::npos ? 0 : n + 1; }
        if (key == SDLK_END) { const auto n = value.find('\n', cursor); cursor = control || n == std::string::npos ? value.size() : n; }
        all = false;
    }
    std::string display(bool secret = false) const {
        if (secret) return std::string(std::min<size_t>(value.size(), 64), '*') + "_";
        return value.substr(0, cursor) + "▏" + value.substr(cursor);
    }
};

struct PlayerUI {
    int id = 1, scroll = 0;
    std::string name, scratch, directory;
    bool human = true, paused = false, entering = false;
    uint32_t command_serial = 0, human_serial = 0, last_frame = 0;
    GameControl gate = {1, CONTROL_PAUSED};
    Editor prompt;
};

int main(int argc, char **argv) {
    if (argc != 7) return 64;
    const int width = std::atoi(argv[3]), height = std::atoi(argv[4]), capacity = std::atoi(argv[5]);
    if (width < 1 || width > 1280 || height < 1 || height > 960 || capacity < 1 || capacity > 4) return 64;
    auto font_bytes = read("/usr/share/fonts/IosevkaTerm-SemiBold.ttf", 16 * 1024 * 1024);
    if (font_bytes.empty() || !stbtt_InitFont(&font, font_bytes.data(), 0) || SDL_Init(SDL_INIT_VIDEO)) return 1;
    scale = stbtt_ScaleForPixelHeight(&font, 20);
    SDL_Window *window = SDL_CreateWindow(argv[6], 0, 0, 1280, 960, 0);
    renderer = window ? SDL_CreateRenderer(window, -1, SDL_RENDERER_SOFTWARE) : nullptr;
    SDL_Texture *view = renderer ? SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STREAMING, width, height) : nullptr;
    if (!view) { std::fprintf(stderr, "Game viewer: %s\n", SDL_GetError()); SDL_Quit(); return 1; }
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
    SDL_StartTextInput();
    const std::string hub(argv[1]), root(argv[2]);
    const auto preferences = contents(root + "/ui.conf");
    bool interface = preferences.find("interface=0") == std::string::npos;
    bool activity = preferences.find("activity=0") == std::string::npos;
    bool running = true, settings = false, focused = true, relative = false, dragging = false;
    int selected = 0, first = 0;
    Editor filter, answer;
    std::map<int, PlayerUI> players;
    const auto load_players = [&]() {
        for (const auto &line : split(contents(hub + "/players.txt"))) {
            const auto fields = split(line, '\t');
            if (fields.size() != 4) continue;
            const int id = std::atoi(fields[0].c_str());
            if (id < 1 || id > capacity || players.count(id)) continue;
            auto &p = players[id]; p.id = id; p.name = fields[1]; p.directory = fields[2]; p.scratch = fields[3];
            p.prompt.set(contents(p.directory + "/draft.txt")); publish(p.scratch + "/control", &p.gate, sizeof(p.gate));
        }
    };
    load_players();
    if (players.empty()) return 1;
    const int initial = std::atoi(contents(hub + "/watching").c_str());
    PlayerUI *player = &players.at(players.count(initial) ? initial : players.begin()->first);
    std::string previous_menu, menu_mode, title, message;
    std::vector<std::vector<std::string>> rows;
    std::vector<int> matches;
    std::vector<HumanEvent> manual;
    const auto command = [&](const std::string &name, const std::string &body = "") { publish(player->scratch + "/command." + std::to_string(++player->command_serial), name + "\n" + body); };
    const auto save_ui = [&]() { publish(root + "/ui.conf", "interface=" + std::to_string(interface) + "\nactivity=" + std::to_string(activity) + "\n"); };
    const auto update_gate = [&]() {
        const uint32_t owner = settings || (player->human && (interface || !focused)) || (!player->human && player->paused) ? CONTROL_PAUSED : player->human ? CONTROL_HUMAN : CONTROL_AGENT;
        if (player->gate.generation && player->gate.owner == owner) return;
        player->gate.owner = owner; ++player->gate.generation; manual.clear(); publish(player->scratch + "/control", &player->gate, sizeof(player->gate));
    };
    const auto close_settings = [&]() { command("cancel"); settings = false; answer.set(""); update_gate(); };
    const auto show_interface = [&](bool show) {
        if (!show) { if (settings) close_settings(); player->entering = false; }
        interface = show; dragging = false; save_ui(); update_gate();
    };
    const auto open_settings = [&](const std::string &page = "home") {
        if (!contents(player->scratch + "/ended").empty()) return;
        interface = true; player->entering = false; settings = true; player->paused = true;
        filter.set(""); title = "Loading"; menu_mode = "busy"; rows.clear(); matches.clear();
        command("select", page); save_ui(); update_gate();
    };
    const auto open_prompt = [&]() { if (settings) close_settings(); interface = true; player->entering = true; save_ui(); update_gate(); };
    const auto switch_control = [&]() {
        if (!contents(player->scratch + "/ended").empty()) return;
        if (settings) close_settings(); player->entering = false; player->human = !player->human; player->paused = false;
        if (player->human) interface = false;
        save_ui(); update_gate(); command(player->human ? "interrupt" : "resume");
    };
    const auto switch_player = [&](int id) {
        if (!players.count(id) || id == player->id) return;
        if (settings) close_settings();
        player->entering = false;
        if (player->human) { player->gate.owner = CONTROL_PAUSED; ++player->gate.generation; publish(player->scratch + "/control", &player->gate, sizeof(player->gate)); }
        manual.clear(); player = &players.at(id); player->last_frame = 0;
        previous_menu.clear(); rows.clear(); matches.clear(); filter.set(""); answer.set(""); selected = first = 0;
        publish(hub + "/watching", std::to_string(id)); update_gate();
    };
    const auto send_prompt = [&](bool replace) {
        if (!contents(player->scratch + "/ended").empty()) return;
        if (player->prompt.value.find_first_not_of(" \t\r\n") == std::string::npos) return;
        const auto selection = split(contents(player->scratch + "/selection.txt"));
        if (selection.size() < 3 || selection[1].empty()) { open_settings(); return; }
        player->human = false; player->paused = false; player->entering = false; update_gate();
        if (replace) { ++player->gate.generation; publish(player->scratch + "/control", &player->gate, sizeof(player->gate)); }
        command(replace ? "replace" : "prompt", player->prompt.value); player->prompt.set(""); publish(player->directory + "/draft.txt", "");
    };
    const auto choose = [&]() {
        if (menu_mode == "input" || menu_mode == "secret") {
            if (!answer.value.empty()) { command("answer", answer.value); answer.set(""); menu_mode = "busy"; } return;
        }
        if (menu_mode == "busy" || matches.empty()) return;
        command("select", rows[matches[selected]][0]); menu_mode = "busy";
    };
    const auto back = [&]() {
        if (menu_mode == "settings") close_settings();
        else { command("cancel"); command("select", "home"); menu_mode = "busy"; }
    };
    std::vector<unsigned char> pixels(width * height * 4);
    save_ui(); update_gate();
    while (running) {
        const uint32_t frame_started = SDL_GetTicks();
        load_players();
        const auto requested = contents(hub + "/select-player");
        if (!requested.empty()) { std::remove((hub + "/select-player").c_str()); switch_player(std::atoi(requested.c_str())); }
        const bool game_relative = contents(player->scratch + "/relative") == "1";
        const auto menu = contents(player->scratch + "/menu");
        if (menu != previous_menu) {
            previous_menu = menu;
            const auto lines = split(menu); rows.clear();
            if (lines.size() >= 4) {
                menu_mode = lines[1]; title = lines[2]; message = lines[3];
                for (size_t n = 4; n < lines.size(); ++n) { auto row = split(lines[n], '\t'); if (row.size() >= 2) rows.push_back(row); }
            }
            filter.set(""); answer.set(""); selected = first = 0; dragging = false;
        }
        const auto refresh_matches = [&]() {
            matches.clear(); const auto words = split(lower(filter.value), ' ');
            for (size_t n = 0; n < rows.size(); ++n) {
                std::string haystack; for (const auto &field : rows[n]) haystack += " " + lower(field);
                bool match = true; for (const auto &word : words) if (haystack.find(word) == std::string::npos) match = false;
                if (match) matches.push_back(n);
            }
            selected = std::max(0, std::min(selected, static_cast<int>(matches.size()) - 1));
            first = std::max(0, std::min(first, static_cast<int>(matches.size()) - 10));
        };
        refresh_matches();
        const auto move_selection = [&](int next) {
            selected = std::max(0, std::min(next, static_cast<int>(matches.size()) - 1));
            if (selected < first) first = selected;
            if (selected >= first + 10) first = selected - 9;
        };
        if (!contents(player->scratch + "/show-settings").empty()) { std::remove((player->scratch + "/show-settings").c_str()); open_settings(); }
        if (!contents(player->scratch + "/show-prompt").empty()) { std::remove((player->scratch + "/show-prompt").c_str()); open_prompt(); }
        const SDL_Rect editor = {900, activity ? 738 : 278, 360, activity ? 112 : 572};
        const auto scroll_to = [&](int y) {
            first = std::max(0, static_cast<int>(matches.size()) - 10) * std::max(0, std::min(479, y - 292)) / 479;
        };
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            bool consumed = false;
            if (event.type == SDL_QUIT) running = false;
            if (event.type == SDL_WINDOWEVENT && (event.window.event == SDL_WINDOWEVENT_FOCUS_LOST || event.window.event == SDL_WINDOWEVENT_FOCUS_GAINED)) {
                focused = event.window.event == SDL_WINDOWEVENT_FOCUS_GAINED; update_gate();
            }
            if (event.type == SDL_KEYDOWN) {
                const auto key = event.key.keysym.sym;
                const bool enter = key == SDLK_RETURN || key == SDLK_KP_ENTER;
                const bool ctrl = event.key.keysym.mod & (KMOD_CTRL | KMOD_GUI);
                if (key >= SDLK_F1 && key <= SDLK_F12) consumed = true;
                else if (!event.key.repeat && key == SDLK_TAB) { show_interface(!interface); consumed = true; }
                else if (!event.key.repeat && key == SDLK_BACKQUOTE && !(event.key.keysym.mod & KMOD_SHIFT)) { switch_control(); consumed = true; }
                else if (!event.key.repeat && ctrl && key == SDLK_COMMA) { if (settings) close_settings(); else open_settings(); consumed = true; }
                else if (!settings && !player->entering && !event.key.repeat && (key == SDLK_LEFTBRACKET || key == SDLK_RIGHTBRACKET)) {
                    const int step = key == SDLK_LEFTBRACKET ? -1 : 1;
                    switch_player((player->id - 1 + step + players.size()) % players.size() + 1); consumed = true;
                }
                else if (settings) {
                    consumed = true;
                    if (key == SDLK_ESCAPE) back();
                    else if (enter && !event.key.repeat) choose();
                    else if (menu_mode == "input" || menu_mode == "secret") answer.key(key, ctrl);
                    else if (menu_mode != "busy") {
                        if (key == SDLK_UP) move_selection(selected - 1);
                        else if (key == SDLK_DOWN) move_selection(selected + 1);
                        else if (key == SDLK_PAGEUP || key == SDLK_PAGEDOWN) {
                            const int delta = key == SDLK_PAGEUP ? -10 : 10; first += delta; selected += delta; refresh_matches();
                        }
                        else if (key == SDLK_HOME && menu_mode != "models") move_selection(0);
                        else if (key == SDLK_END && menu_mode != "models") move_selection(matches.size() - 1);
                        else if (menu_mode == "models") { filter.key(key, ctrl); selected = first = 0; refresh_matches(); }
                    }
                } else if (player->entering) {
                    consumed = true;
                    if (enter && !event.key.repeat) { if (event.key.keysym.mod & KMOD_SHIFT) player->prompt.insert("\n"); else send_prompt(ctrl); }
                    else if (key == SDLK_ESCAPE) {
                        player->entering = false;
                        if (!player->human) { player->paused = true; command("interrupt"); }
                        update_gate();
                    } else if (key == SDLK_UP && player->prompt.value.empty()) player->prompt.set(contents(player->directory + "/last-prompt.txt"));
                    else player->prompt.key(key, ctrl);
                    publish(player->directory + "/draft.txt", player->prompt.value);
                } else if (enter && !event.key.repeat) { open_prompt(); consumed = true; }
                else if (!player->human && key == SDLK_ESCAPE) { player->paused = true; command("interrupt"); open_prompt(); consumed = true; }
                else if (interface && activity && key == SDLK_PAGEUP) { player->scroll += 800; consumed = true; }
                else if (interface && activity && key == SDLK_PAGEDOWN) { player->scroll = std::max(0, player->scroll - 800); consumed = true; }
                else if (interface && activity && key == SDLK_END) { player->scroll = 0; consumed = true; }
            }
            if (event.type == SDL_TEXTINPUT) {
                if (settings) {
                    if (menu_mode == "models") { filter.insert(event.text.text); selected = first = 0; refresh_matches(); }
                    else if (menu_mode == "input" || menu_mode == "secret") answer.insert(event.text.text);
                    consumed = true;
                } else if (player->entering) { player->prompt.insert(event.text.text); publish(player->directory + "/draft.txt", player->prompt.value); consumed = true; }
            }
            const bool ended_drag = dragging && event.type == SDL_MOUSEBUTTONUP;
            if (dragging && event.type == SDL_MOUSEMOTION) { scroll_to(event.motion.y); consumed = true; }
            if (ended_drag) { scroll_to(event.button.y); dragging = false; consumed = true; }
            if ((event.type == SDL_MOUSEBUTTONDOWN || event.type == SDL_MOUSEBUTTONUP) && interface && !relative && !ended_drag) {
                consumed = true;
                if (event.type == SDL_MOUSEBUTTONDOWN && event.button.button == SDL_BUTTON_LEFT && settings &&
                    (menu_mode == "models" || menu_mode == "list") && hit(event.button.x, event.button.y, {1088, 292, 18, 480})) {
                    dragging = true; scroll_to(event.button.y);
                }
                if (event.type == SDL_MOUSEBUTTONUP && event.button.button == SDL_BUTTON_LEFT) {
                    const int x = event.button.x, y = event.button.y;
                    if (settings) {
                        if (hit(x, y, {1066, 112, 48, 40})) close_settings();
                        else if (hit(x, y, {162, 112, 105, 40})) back();
                        else if ((menu_mode == "input" || menu_mode == "secret") && hit(x, y, {940, 790, 150, 44})) choose();
                        else if (menu_mode == "models" && hit(x, y, {1002, 226, 74, 44})) { filter.set(""); selected = first = 0; refresh_matches(); }
                        else if (menu_mode == "settings" && hit(x, y, {190, 238, 900, 416})) { selected = (y - 238) / 104; if (selected < static_cast<int>(matches.size())) choose(); }
                        else if ((menu_mode == "models" || menu_mode == "list") && hit(x, y, {190, 292, 892, 480})) {
                            const int row = first + (y - 292) / 48;
                            if (row < static_cast<int>(matches.size())) { selected = row; choose(); }
                        }
                    } else if (hit(x, y, {20, 44, 648, 48})) {
                        const int id = (x - 20) / 162 + 1; switch_player(id);
                    }
                    else if (hit(x, y, {684, 44, 176, 48})) { if (capacity > 1) { if (players.size() < static_cast<size_t>(capacity)) publish(hub + "/add-player", std::to_string(player->id)); }
                        else { player->paused = true; update_gate(); command("interrupt"); command("review"); } }
                    else if (hit(x, y, {1148, 16, 112, 38})) show_interface(false);
                    else if (hit(x, y, {900, 68, 170, 38})) open_settings();
                    else if (hit(x, y, {1090, 68, 170, 38})) { if (player->human) show_interface(false); else switch_control(); }
                    else if (hit(x, y, {1160, 220, 100, 36})) { activity = !activity; save_ui(); }
                    else if ((player->entering || !player->prompt.value.empty()) && hit(x, y, editor)) open_prompt();
                    else if (hit(x, y, {900, 866, 170, 40})) {
                        if (player->entering || !player->prompt.value.empty()) { player->paused = true; command("interrupt"); player->entering = false; update_gate(); }
                        else open_prompt();
                    }
                    else if (hit(x, y, {1090, 866, 170, 40})) {
                        if (player->entering || !player->prompt.value.empty()) send_prompt(false);
                        else if (contents(player->scratch + "/retry") == "1") {
                            player->human = false; player->paused = false; update_gate(); command("retry");
                        }
                        else { player->paused = true; command("interrupt"); update_gate(); }
                    }
                    else if (hit(x, y, {900, 920, 150, 28})) running = false;
                    else if (x < 880) { if (player->human) show_interface(false); else player->entering = false; }
                }
            }
            if (event.type == SDL_MOUSEWHEEL && interface) {
                consumed = true;
                if (settings && (menu_mode == "models" || menu_mode == "list")) {
                    const int delta = event.wheel.y ? event.wheel.y : event.wheel.preciseY > 0 ? 1 : -1;
                    first = std::max(0, std::min(first - delta, static_cast<int>(matches.size()) - 10));
                } else if (!settings && activity) player->scroll = std::max(0, player->scroll + event.wheel.y * 160);
            }
            if (!consumed && player->gate.owner == CONTROL_HUMAN && manual.size() < 256) {
                HumanEvent item = {};
                if ((event.type == SDL_KEYDOWN && !event.key.repeat) || event.type == SDL_KEYUP) {
                    item.kind = HUMAN_KEY; item.a = event.key.keysym.scancode; item.b = event.type == SDL_KEYDOWN;
                    std::snprintf(item.text, sizeof(item.text), "%s", SDL_GetScancodeName(event.key.keysym.scancode));
                } else if (event.type == SDL_MOUSEMOTION && (relative || !game_relative)) {
                    item.kind = HUMAN_MOTION; item.c = relative; item.a = relative ? event.motion.xrel : event.motion.x * width / 1280; item.b = relative ? event.motion.yrel : event.motion.y * height / 960;
                } else if (event.type == SDL_MOUSEBUTTONDOWN || event.type == SDL_MOUSEBUTTONUP) {
                    item.kind = HUMAN_BUTTON; item.a = event.button.button; item.b = event.type == SDL_MOUSEBUTTONDOWN;
                } else if (event.type == SDL_MOUSEWHEEL) { item.kind = HUMAN_WHEEL; item.a = event.wheel.x; item.b = event.wheel.y; }
                else if (event.type == SDL_TEXTINPUT) { item.kind = HUMAN_TEXT; std::memcpy(item.text, event.text.text, sizeof(item.text)); }
                if (item.kind) manual.push_back(item);
            }
        }
        if (!manual.empty()) {
            HumanBatch header = {player->gate.generation, static_cast<uint32_t>(manual.size())};
            std::vector<unsigned char> data(sizeof(header) + manual.size() * sizeof(HumanEvent));
            std::memcpy(data.data(), &header, sizeof(header)); std::memcpy(data.data() + sizeof(header), manual.data(), manual.size() * sizeof(HumanEvent));
            publish(player->scratch + "/human." + std::to_string(++player->human_serial), data.data(), data.size()); manual.clear();
        }
        const bool want_relative = player->gate.owner == CONTROL_HUMAN && game_relative;
        if (want_relative != relative) { SDL_SetRelativeMouseMode(want_relative ? SDL_TRUE : SDL_FALSE); relative = want_relative; }
        if (FILE *frame = std::fopen((player->scratch + "/view.rgba").c_str(), "rb")) {
            uint32_t header[4] = {};
            if (std::fread(header, 1, sizeof(header), frame) == sizeof(header) && header[2] == static_cast<uint32_t>(width) && header[3] == static_cast<uint32_t>(height) && header[0] != player->last_frame &&
                std::fread(pixels.data(), 1, pixels.size(), frame) == pixels.size()) {
                SDL_UpdateTexture(view, nullptr, pixels.data(), width * 4); player->last_frame = header[0];
            }
            std::fclose(frame);
        }
        SDL_SetRenderDrawColor(renderer, 10, 15, 20, 255); SDL_RenderClear(renderer);
        SDL_Rect game = interface ? SDL_Rect{0, 150, 880, 660} : SDL_Rect{0, 0, 1280, 960};
        const int fitted_width = std::min(game.w, game.h * width / height), fitted_height = fitted_width * height / width;
        game.x += (game.w - fitted_width) / 2; game.y += (game.h - fitted_height) / 2; game.w = fitted_width; game.h = fitted_height;
        if (player->last_frame) SDL_RenderCopy(renderer, view, nullptr, &game);
        if (interface) {
            shade({880, 0, 400, 960}, 255);
            for (const auto &entry : players) {
                const auto &p = entry.second; const int x = 20 + (p.id - 1) * 162;
                button((p.id == player->id ? "> " : "") + p.name, {x, 44, 152, 48});
                auto status = contents(p.scratch + "/ended").empty() ? contents(p.scratch + "/status.txt") : "Player closed";
                if (status.find("Your controls") == 0) status = "Your controls";
                else if (status.find("Ready") == 0) status = "Ready";
                else if (status.find("Acting") == 0) status = "Acting";
                else if (status.find("error") != std::string::npos) status = "Agent error";
                text(status, x, 102, 152, 1, false);
            }
            button(capacity == 1 ? "Review attempts" : players.size() < static_cast<size_t>(capacity) ? "+ Add player" : "4 players", {684, 44, 176, 48});
            text(player->name + " / Log", 900, 25, 235, 1, false); button("Tab Hide", {1148, 16, 112, 38});
            button("Settings", {900, 68, 170, 38});
            button(player->human ? "Play yourself" : "Take control / `", {1090, 68, 170, 38});
            text(contents(player->scratch + "/ended").empty() ? contents(player->scratch + "/status.txt") : "Player closed. Save & exit to reopen.", 900, 122, 360, 2, false);
            text(contents(player->scratch + "/cost.txt"), 900, 174, 360, 2, false);
            text("Reasoning & actions", 900, 230, 250, 1, false);
            button(activity ? "Hide log" : "Show log", {1160, 220, 100, 36});
            const bool composing = player->entering || !player->prompt.value.empty();
            if (activity) {
                std::string trace = contents(player->scratch + "/activity.txt");
                player->scroll = std::min(player->scroll, std::max(0, static_cast<int>(trace.size()) - 300));
                if (player->scroll) trace.resize(trace.size() - player->scroll);
                text(trace.empty() ? "Configure your agent in Settings, then press Enter to give it an instruction.\n\nReasoning, replies and game actions will appear here." : trace, 900, 270, 360, composing ? 19 : 26, true);
            }
            if (composing) {
                text("Instruction / Enter sends", 900, editor.y - 28, 360, 1, false);
                shade(editor, 255, player->entering ? 30 : 20, player->entering ? 50 : 31, player->entering ? 65 : 40);
                text(player->entering ? player->prompt.display() : player->prompt.value, editor.x + 12, editor.y + 8, editor.w - 24, (editor.h - 16) / 22, true);
            }
            button(composing ? "Interrupt / Esc" : "Message / Enter", {900, 866, 170, 40});
            button(composing ? "Send / Enter" : contents(player->scratch + "/retry") == "1" ? "Retry task" : "Interrupt / Esc", {1090, 866, 170, 40});
            text("Save & exit", 912, 924, 140, 1, false); text("` Switch control", 1070, 924, 200, 1, false);
            text(capacity > 1 ? "Tab: game only   [ ]: player   `: take control   Enter: message" : "Tab: game only   `: take control   Enter: message", 36, 870, 800, 1, false);
        }
        if (settings) {
            shade({140, 92, 1000, 776}, 255);
            button("Back", {162, 112, 105, 40}); text(title, 290, 122, 760, 1, false); button("X", {1066, 112, 48, 40});
            text(message, 190, 174, 900, 2, false);
            if (menu_mode == "settings") {
                for (size_t n = 0; n < rows.size(); ++n) {
                    const int y = 238 + n * 104;
                    shade({190, y, 900, 88}, 255, selected == static_cast<int>(n) ? 38 : 24, 45, 58);
                    text(rows[n][1], 210, y + 10, 860, 1, false);
                    if (rows[n].size() > 2) text(rows[n][2], 210, y + 42, 860, 1, false);
                }
            } else if (menu_mode == "models" || menu_mode == "list") {
                if (menu_mode == "models") {
                    shade({190, 226, 888, 44}, 255, 28, 42, 51);
                    text(filter.value.empty() ? "Search models…" : filter.display(), 204, 236, 784, 1, false); button("Clear", {1002, 226, 74, 44});
                }
                for (int n = first; n < std::min(first + 10, static_cast<int>(matches.size())); ++n) {
                    const int y = 292 + (n - first) * 48; const auto &row = rows[matches[n]];
                    shade({190, y, 892, 46}, 255, n == selected ? 38 : 20, n == selected ? 63 : 31, n == selected ? 73 : 40);
                    text(row[1], 204, y + 2, 864, 1, false);
                    if (row.size() > 2) text(row[2], 204, y + 24, 864, 1, false);
                }
                if (matches.size() > 10) {
                    shade({1088, 292, 18, 480}, 255, 30, 44, 54);
                    const int height = 4800 / matches.size();
                    shade({1088, 292 + first * (480 - height) / (static_cast<int>(matches.size()) - 10), 18, height}, 255, 87, 130, 145);
                }
                text(matches.empty() ? "No matching models. Clear the search to start again." : std::to_string(first + 1) + "–" + std::to_string(std::min(first + 10, static_cast<int>(matches.size()))) + " of " + std::to_string(matches.size()) + "    Click to select · arrows / Enter · scroll", 190, 806, 900, 1, false);
            } else if (menu_mode == "input" || menu_mode == "secret") {
                shade({190, 260, 900, 244}, 255, 20, 31, 40); text(answer.display(menu_mode == "secret"), 208, 280, 864, 9, true);
                text("Enter submits · Back cancels", 190, 802, 680, 1, false); button("Connect", {940, 790, 150, 44});
            } else text("Please wait…", 190, 264, 900, 1, false);
        }
        SDL_RenderPresent(renderer);
        const uint32_t elapsed = SDL_GetTicks() - frame_started;
        SDL_Delay(elapsed < 16 ? 16 - elapsed : 1);
        if (glyphs.size() > 2048) { for (auto &item : glyphs) SDL_DestroyTexture(item.second.texture); glyphs.clear(); }
    }
    for (auto &entry : players) {
        auto &p = entry.second; p.gate.owner = CONTROL_PAUSED; ++p.gate.generation; publish(p.scratch + "/control", &p.gate, sizeof(p.gate));
    }
    SDL_SetRelativeMouseMode(SDL_FALSE);
    for (auto &item : glyphs) SDL_DestroyTexture(item.second.texture);
    SDL_DestroyTexture(view); SDL_DestroyRenderer(renderer); SDL_DestroyWindow(window); SDL_Quit();
    return 0;
}
