// SPDX-License-Identifier: GPL-2.0-or-later
#include "../../rts/spectator/graphics.h"
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

int main(int argc, char **argv) {
    if (argc != 3) return 64;
    auto font_bytes = read("/usr/share/fonts/IosevkaTerm-SemiBold.ttf", 16 * 1024 * 1024);
    if (font_bytes.empty() || !stbtt_InitFont(&font, font_bytes.data(), 0) || SDL_Init(SDL_INIT_VIDEO)) return 1;
    scale = stbtt_ScaleForPixelHeight(&font, 20);
    SDL_Window *window = SDL_CreateWindow("ClassiCube / Agent World", 0, 0, 1280, 960, 0);
    renderer = window ? SDL_CreateRenderer(window, -1, SDL_RENDERER_SOFTWARE) : nullptr;
    SDL_Texture *view = renderer ? SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STREAMING, 640, 480) : nullptr;
    if (!view) { std::fprintf(stderr, "ClassiCube viewer: %s\n", SDL_GetError()); SDL_Quit(); return 1; }
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
    SDL_StartTextInput();
    const std::string scratch(argv[1]), directory(argv[2]);
    bool running = true, panel = true, entering = false, settings = false, human = true, paused = false, focused = true, relative = false, capture = true;
    int scroll = 0, selected = 0;
    uint32_t last_frame = 0, command_serial = 0, human_serial = 0;
    GameControl gate = {0, CONTROL_PAUSED};
    Editor prompt, filter, answer;
    prompt.set(contents(directory + "/draft.txt"));
    std::string previous_menu, menu_mode, title, message;
    std::vector<std::vector<std::string>> rows;
    std::vector<int> matches;
    std::vector<HumanEvent> manual;
    const auto command = [&](const std::string &name, const std::string &body = "") { publish(scratch + "/command." + std::to_string(++command_serial), name + "\n" + body); };
    const auto update_gate = [&]() {
        const uint32_t owner = settings || (human && (entering || !focused)) || (!human && paused) ? CONTROL_PAUSED : human ? CONTROL_HUMAN : CONTROL_AGENT;
        if (gate.generation && gate.owner == owner) return;
        gate.owner = owner; ++gate.generation; manual.clear(); publish(scratch + "/control", &gate, sizeof(gate));
    };
    const auto open_settings = [&]() { capture = false; entering = false; settings = true; paused = true; filter.set(""); command("settings"); update_gate(); };
    const auto close_settings = [&]() { command("cancel"); settings = false; answer.set(""); update_gate(); };
    const auto open_prompt = [&]() { if (settings) close_settings(); capture = false; entering = true; update_gate(); };
    const auto send_prompt = [&](bool replace) {
        if (prompt.value.find_first_not_of(" \t\r\n") == std::string::npos) return;
        const auto selection = split(contents(scratch + "/selection.txt"));
        if (selection.size() < 3 || selection[1].empty()) { open_settings(); return; }
        human = false; paused = false; entering = false; update_gate();
        if (replace) { ++gate.generation; publish(scratch + "/control", &gate, sizeof(gate)); }
        command(replace ? "replace" : "prompt", prompt.value); prompt.set(""); publish(directory + "/draft.txt", "");
    };
    const auto choose = [&]() {
        if (menu_mode == "input" || menu_mode == "secret") { if (!answer.value.empty()) { command("answer", answer.value); answer.set(""); menu_mode = "busy"; } return; }
        if (menu_mode != "list" || matches.empty()) return;
        const auto key = rows[matches[selected]][0];
        if (key == "close") close_settings();
        else { command("select", key); menu_mode = "busy"; }
    };
    update_gate();
    while (running) {
        const bool game_relative = contents(scratch + "/relative") == "1";
        const auto menu = contents(scratch + "/menu");
        if (menu != previous_menu) {
            previous_menu = menu;
            const auto lines = split(menu); rows.clear();
            if (lines.size() >= 4) {
                menu_mode = lines[1]; title = lines[2]; message = lines[3];
                for (size_t n = 4; n < lines.size(); ++n) { auto row = split(lines[n], '\t'); if (row.size() >= 2) rows.push_back(row); }
            }
            filter.set(""); answer.set(""); selected = 0;
        }
        const auto refresh_matches = [&]() {
            matches.clear(); const auto words = split(lower(filter.value), ' ');
            for (size_t n = 0; n < rows.size(); ++n) {
                std::string haystack; for (const auto &field : rows[n]) haystack += " " + lower(field);
                bool match = true; for (const auto &word : words) if (haystack.find(word) == std::string::npos) match = false;
                if (match) matches.push_back(n);
            }
            selected = std::max(0, std::min(selected, static_cast<int>(matches.size()) - 1));
        };
        refresh_matches();
        if (!contents(scratch + "/show-settings").empty()) { std::remove((scratch + "/show-settings").c_str()); open_settings(); }
        if (!contents(scratch + "/show-prompt").empty()) { std::remove((scratch + "/show-prompt").c_str()); open_prompt(); }
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            bool consumed = false;
            if (event.type == SDL_QUIT) running = false;
            if (event.type == SDL_WINDOWEVENT && (event.window.event == SDL_WINDOWEVENT_FOCUS_LOST || event.window.event == SDL_WINDOWEVENT_FOCUS_GAINED)) {
                focused = event.window.event == SDL_WINDOWEVENT_FOCUS_GAINED; if (!focused) capture = false; update_gate();
            }
            if (event.type == SDL_KEYDOWN) {
                const auto key = event.key.keysym.sym;
                const bool enter = key == SDLK_RETURN || key == SDLK_KP_ENTER;
                const bool ctrl = event.key.keysym.mod & (KMOD_CTRL | KMOD_GUI);
                if (!event.key.repeat && key == SDLK_F10) { running = false; consumed = true; }
                else if (!event.key.repeat && key == SDLK_F6) {
                    if (settings) close_settings(); entering = false; human = !human; capture = human; paused = false; update_gate();
                    command(human ? "interrupt" : "resume"); consumed = true;
                } else if (!event.key.repeat && key == SDLK_F2) { if (settings) close_settings(); else open_settings(); consumed = true; }
                else if (settings) {
                    consumed = true;
                    if (key == SDLK_ESCAPE) { if (menu_mode == "input" || menu_mode == "secret") command("cancel"); else close_settings(); }
                    else if (enter && !event.key.repeat) choose();
                    else if (menu_mode == "list") {
                        if (key == SDLK_UP) --selected; else if (key == SDLK_DOWN) ++selected; else filter.key(key, ctrl);
                        refresh_matches();
                    } else if (menu_mode == "input" || menu_mode == "secret") answer.key(key, ctrl);
                } else if (entering) {
                    consumed = true;
                    if (enter && !event.key.repeat) { if (event.key.keysym.mod & KMOD_SHIFT) prompt.insert("\n"); else send_prompt(ctrl); }
                    else if (key == SDLK_ESCAPE) {
                        if (human) entering = false;
                        else { paused = true; command("interrupt"); }
                        update_gate();
                    } else if (key == SDLK_UP && prompt.value.empty()) prompt.set(contents(directory + "/last-prompt.txt"));
                    else prompt.key(key, ctrl);
                    publish(directory + "/draft.txt", prompt.value);
                } else if (enter && !event.key.repeat) { open_prompt(); consumed = true; }
                else if (!event.key.repeat && key == SDLK_TAB) { panel = !panel; consumed = true; }
                else if (!human && key == SDLK_ESCAPE) { paused = true; command("interrupt"); open_prompt(); consumed = true; }
                else if (!human && key == SDLK_PAGEUP) { scroll += 800; consumed = true; }
                else if (!human && key == SDLK_PAGEDOWN) { scroll = std::max(0, scroll - 800); consumed = true; }
                else if (!human && key == SDLK_END) { scroll = 0; consumed = true; }
            }
            if (event.type == SDL_TEXTINPUT) {
                if (settings) { if (menu_mode == "list") { filter.insert(event.text.text); selected = 0; refresh_matches(); }
                    else if (menu_mode == "input" || menu_mode == "secret") answer.insert(event.text.text); consumed = true; }
                else if (entering) { prompt.insert(event.text.text); publish(directory + "/draft.txt", prompt.value); consumed = true; }
            }
            if ((event.type == SDL_MOUSEBUTTONDOWN || event.type == SDL_MOUSEBUTTONUP) && !relative) {
                const bool released = event.type == SDL_MOUSEBUTTONUP;
                const int x = event.button.x, y = event.button.y;
                if (settings) {
                    consumed = true;
                    if (released && hit(x, y, {1020, 128, 60, 42})) close_settings();
                    else if (released && (menu_mode == "input" || menu_mode == "secret") && hit(x, y, {940, 714, 140, 46})) choose();
                    else if (released && menu_mode == "list" && y >= 292 && y < 708 && x >= 200 && x < 1080) {
                        const int index = selected / 8 * 8 + (y - 292) / 52;
                        if (index < static_cast<int>(matches.size())) { selected = index; choose(); }
                    }
                } else if (hit(x, y, {930, 8, 168, 44})) { if (released) open_settings(); consumed = true; }
                else if (hit(x, y, {1108, 8, 160, 44})) { if (released) panel = !panel; consumed = true; }
                else if (entering && hit(x, y, {1050, 838, 146, 46})) { if (released) send_prompt(false); consumed = true; }
                else if (entering && hit(x, y, {886, 838, 146, 46})) { if (released) { paused = true; command("interrupt"); update_gate(); } consumed = true; }
                else if (hit(x, y, {18, 900, 1010, 52})) { if (released) open_prompt(); consumed = true; }
                else if (entering || (panel && x >= 870) || y < 78 || y >= 886) consumed = true;
                else if (human && !capture && game_relative) { if (released) capture = true; consumed = true; }
            }
            if (event.type == SDL_MOUSEWHEEL && settings && menu_mode == "list") { selected -= event.wheel.y; refresh_matches(); consumed = true; }
            else if (event.type == SDL_MOUSEWHEEL && !human && panel) { scroll = std::max(0, scroll + event.wheel.y * 160); consumed = true; }
            if (!consumed && gate.owner == CONTROL_HUMAN && manual.size() < 256) {
                HumanEvent item = {};
                if ((event.type == SDL_KEYDOWN && !event.key.repeat) || event.type == SDL_KEYUP) {
                    item.kind = HUMAN_KEY; item.a = event.key.keysym.scancode; item.b = event.type == SDL_KEYDOWN;
                } else if (event.type == SDL_MOUSEMOTION && (relative || !game_relative)) {
                    item.kind = HUMAN_MOTION; item.c = relative; item.a = relative ? event.motion.xrel : event.motion.x / 2; item.b = relative ? event.motion.yrel : event.motion.y / 2;
                } else if (event.type == SDL_MOUSEBUTTONDOWN || event.type == SDL_MOUSEBUTTONUP) {
                    item.kind = HUMAN_BUTTON; item.a = event.button.button; item.b = event.type == SDL_MOUSEBUTTONDOWN;
                } else if (event.type == SDL_MOUSEWHEEL) { item.kind = HUMAN_WHEEL; item.a = event.wheel.x; item.b = event.wheel.y; }
                else if (event.type == SDL_TEXTINPUT) { item.kind = HUMAN_TEXT; std::memcpy(item.text, event.text.text, sizeof(item.text)); }
                if (item.kind) manual.push_back(item);
            }
        }
        if (!manual.empty()) {
            HumanBatch header = {gate.generation, static_cast<uint32_t>(manual.size())};
            std::vector<unsigned char> data(sizeof(header) + manual.size() * sizeof(HumanEvent));
            std::memcpy(data.data(), &header, sizeof(header)); std::memcpy(data.data() + sizeof(header), manual.data(), manual.size() * sizeof(HumanEvent));
            publish(scratch + "/human." + std::to_string(++human_serial), data.data(), data.size()); manual.clear();
        }
        const bool want_relative = gate.owner == CONTROL_HUMAN && capture && game_relative;
        if (want_relative != relative) { SDL_SetRelativeMouseMode(want_relative ? SDL_TRUE : SDL_FALSE); relative = want_relative; }
        auto bytes = read(scratch + "/view.rgba", 16 + 640 * 480 * 4);
        uint32_t header[4] = {};
        if (bytes.size() == 16 + 640 * 480 * 4) std::memcpy(header, bytes.data(), 16);
        if (header[2] == 640 && header[3] == 480 && header[0] != last_frame) { SDL_UpdateTexture(view, nullptr, bytes.data() + 16, 640 * 4); last_frame = header[0]; }
        SDL_SetRenderDrawColor(renderer, 16, 23, 28, 255); SDL_RenderClear(renderer);
        if (last_frame) SDL_RenderCopy(renderer, view, nullptr, nullptr);
        shade({0, 0, 1280, 78});
        const auto selection = split(contents(scratch + "/selection.txt"));
        const std::string configured = selection.size() >= 3 ? selection[0] + " / " + (selection[1].empty() ? "Choose model (F2)" : selection[1]) + " / " + selection[2] : "Configure agent with F2";
        text((human ? "YOU  /  " : "AGENT  /  ") + configured, 18, 12, 890, 1, false);
        text(contents(scratch + "/cost.txt") + (human && !capture && !entering && !settings ? " · Double-click world to capture mouse" : ""), 18, 46, 1200, 1, false);
        button("F2 Settings", {930, 8, 168, 44}); button(panel ? "Tab Hide trace" : "Tab Show trace", {1108, 8, 160, 44});
        if (panel && !settings) {
            shade({870, 78, 410, 808}, 235);
            text("AGENT ACTIVITY", 892, 98, 365, 1, false);
            text(contents(scratch + "/status.txt"), 892, 136, 365, 2, false);
            std::string activity = contents(scratch + "/activity.txt");
            scroll = std::min(scroll, std::max(0, static_cast<int>(activity.size()) - 500));
            if (scroll) activity.resize(activity.size() - scroll);
            text(activity, 892, 198, 365, 28, true);
            text(scroll ? "Scrolled · End follows live" : "Live · Scroll for earlier activity", 892, 854, 365, 1, false);
        }
        shade({0, 886, 1280, 74});
        button("Enter / click to give an instruction", {18, 900, 520, 46});
        text("F6: " + std::string(human ? "agent takes control" : "take control") + "  |  F10: save & exit", 564, 914, 700, 1, false);
        if (entering && !settings) {
            shade({72, 614, 1136, 284}, 250);
            text("INSTRUCTION   Enter: send / steer   Shift+Enter: newline   Ctrl+Enter: interrupt & send", 94, 630, 1090, 1, false);
            shade({90, 666, 1100, 156}, 255, prompt.all ? 36 : 20, prompt.all ? 64 : 31, prompt.all ? 82 : 40);
            text(prompt.display(), 104, 676, 1070, 6, true);
            button("Esc Interrupt", {886, 838, 146, 46}); button("Send", {1050, 838, 146, 46});
        }
        if (settings) {
            shade({180, 112, 920, 688}, 250);
            text(title.empty() ? "Agent settings" : title, 208, 136, 790, 1, false); button("X", {1020, 128, 60, 42});
            text(message, 208, 184, 864, 3, false);
            if (menu_mode == "list") {
                shade({208, 248, 864, 38}, 255, 28, 42, 51); text("Filter: " + filter.display(), 220, 256, 840, 1, false);
                const int start = selected / 8 * 8;
                for (int n = start; n < std::min(start + 8, static_cast<int>(matches.size())); ++n) {
                    const int y = 292 + (n - start) * 52; const auto &row = rows[matches[n]];
                    if (n == selected) shade({200, y, 880, 50}, 255, 38, 63, 73);
                    text(row[1], 216, y + 2, 850, 1, false);
                    if (row.size() > 2) text(row[2], 216, y + 25, 850, 1, false);
                }
                text(matches.empty() ? "No matches" : std::to_string(selected + 1) + " / " + std::to_string(matches.size()) + "    Arrows / click select · Enter applies", 208, 746, 864, 1, false);
            } else if (menu_mode == "input" || menu_mode == "secret") {
                shade({208, 296, 864, 220}, 255, 20, 31, 40); text(answer.display(menu_mode == "secret"), 222, 312, 835, 8, true);
                text("Enter submits · Escape cancels", 208, 728, 650, 1, false); button("Submit", {940, 714, 140, 46});
            }
        }
        SDL_RenderPresent(renderer); SDL_Delay(33);
        if (glyphs.size() > 2048) { for (auto &item : glyphs) SDL_DestroyTexture(item.second.texture); glyphs.clear(); }
    }
    gate.owner = CONTROL_PAUSED; ++gate.generation; publish(scratch + "/control", &gate, sizeof(gate));
    SDL_SetRelativeMouseMode(SDL_FALSE);
    for (auto &item : glyphs) SDL_DestroyTexture(item.second.texture);
    SDL_DestroyTexture(view); SDL_DestroyRenderer(renderer); SDL_DestroyWindow(window); SDL_Quit();
    return 0;
}
