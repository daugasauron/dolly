// Reuse the upstream multiplayer command protocol over in-Wasm pipes.
// SPDX-License-Identifier: GPL-2.0-or-later
#include "arena.h"
#include "input.h"
#include <OBATTLE.h>
#include <OCONFIG.h>
#include <OERRCTRL.h>
#include <OGAME.h>
#include <OINFO.h>
#include <OMOUSE.h>
#include <OMOUSECR.h>
#include <ONATION.h>
#include <OREMOTE.h>
#include <OSYS.h>
#include <CmdLine.h>
#include <ConfigAdv.h>
#include <multiplayer.h>
#include <SDL.h>
#include <cerrno>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <fcntl.h>
#include <unistd.h>

namespace {
uint32_t player;
uint32_t replay_player;
bool replay_detecting;
volatile std::sig_atomic_t interrupted;
int output = -1;
std::vector<unsigned char> outgoing;
size_t sent;
unsigned char incoming[4 + 10240];
size_t received;
uint32_t packet_size;

void interrupt(int) { interrupted = 1; }

bool stopping()
{
    if (interrupted) return true;
    char filename[sizeof(sys.dir_config) + 32];
    std::snprintf(filename, sizeof(filename), "%s/stop", std::getenv("DOLLY_RTS_PLAYER_DIR"));
    return access(filename, F_OK) == 0;
}

void flush()
{
    while (sent < outgoing.size()) {
        const ssize_t count = write(output, outgoing.data() + sent, outgoing.size() - sent);
        if (count > 0) sent += count;
        else if (count < 0 && errno == EINTR) continue;
        else if (count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return;
        else dolly_rts_transport_failed();
    }
    outgoing.clear();
    sent = 0;
}
}

uint32_t dolly_rts_player() { return player; }
uint32_t dolly_rts_replay_player() { return replay_player; }
bool dolly_rts_replay_eof() { return replay_player && remote.is_replay_end(); }
bool dolly_rts_replay_detecting() { return replay_detecting; }

void dolly_rts_replay_detect(bool active)
{
    replay_detecting = replay_player && active;
}

char *dolly_rts_replay_discard(int size)
{
    // Replayed clicks restore local UI state only. Simulation commands come
    // exclusively from the native recording, never from these UI events.
    static std::vector<char> discarded;
    if (size < 0 || size > 65536) std::exit(65);
    discarded.resize(size ? size : 1);
    return discarded.data();
}

int dolly_rts_replay_next_frame()
{
    const std::string path = std::string(std::getenv("DOLLY_RTS_PLAYER_DIR")) + "/clock";
    uint32_t target = 1;
    if (FILE *file = std::fopen(path.c_str(), "rb")) {
        if (std::fread(&target, sizeof(target), 1, file) != 1) target = 1;
        std::fclose(file);
    }
    return sys.frame_count < target;
}

uint32_t dolly_rts_replay_milliseconds(uint32_t frame)
{
    struct Point { uint32_t frame, milliseconds; };
    static std::vector<Point> points;
    static size_t index;
    if (points.empty()) {
        const std::string path = std::string(std::getenv("DOLLY_RTS_PLAYER_DIR")) + "/timing";
        FILE *file = std::fopen(path.c_str(), "rb");
        if (!file) std::exit(65);
        Point point;
        while (std::fread(&point, sizeof(point), 1, file) == 1) points.push_back(point);
        std::fclose(file);
        if (points.empty()) std::exit(65);
    }
    while (index + 1 < points.size() && points[index + 1].frame <= frame) ++index;
    const Point &a = points[index];
    if (frame <= a.frame) return a.milliseconds;
    if (index + 1 == points.size()) return a.milliseconds + (frame - a.frame) * 50;
    const Point &b = points[index + 1];
    return a.milliseconds + uint64_t(frame - a.frame) * (b.milliseconds - a.milliseconds) / (b.frame - a.frame);
}

void dolly_rts_transport_failed()
{
    if (stopping()) std::exit(0);
    std::fprintf(stderr, "RTS: local multiplayer connection failed; stopping instead of substituting a built-in AI\n");
    std::exit(74);
}

int dolly_rts_prepare()
{
    const char *value = std::getenv("DOLLY_RTS_PLAYER");
    const char *replay = std::getenv("DOLLY_RTS_REPLAY_PLAYER");
    if (replay) value = replay;
    if (!value) return 0;
    const char *directory = std::getenv("DOLLY_RTS_PLAYER_DIR");
    if ((std::strcmp(value, "1") && std::strcmp(value, "2")) || !directory ||
        directory[0] != '/' || std::strlen(directory) + 2 >= sizeof(sys.dir_config)) {
        std::fputs("RTS: the supervisor must supply player 1/2 and a private player directory\n", stderr);
        return 1;
    }
    if (replay) replay_player = value[0] - '0';
    else player = value[0] - '0';
    if (SDL_setenv("SDL_VIDEODRIVER", "dummy", 1) || SDL_setenv("SKCONFIG", directory, 1)) return 1;
    std::signal(SIGINT, interrupt);
    std::signal(SIGTERM, interrupt);
    if (replay) return 0;
    // Reserve the original stdout for framed game packets; ordinary upstream
    // diagnostics go to stderr. No native socket backend is enabled.
    output = dup(STDOUT_FILENO);
    if (output < 0 || dup2(STDERR_FILENO, STDOUT_FILENO) < 0 ||
        fcntl(STDIN_FILENO, F_SETFL, fcntl(STDIN_FILENO, F_GETFL) | O_NONBLOCK) < 0 ||
        fcntl(output, F_SETFL, fcntl(output, F_GETFL) | O_NONBLOCK) < 0) return 1;
    std::signal(SIGPIPE, SIG_IGN);
    return 0;
}

void dolly_rts_configure()
{
    if (!player && !replay_player) return;
    cmd_line.enable_audio = false;
    config_adv.vga_window_width = 800;
    config_adv.vga_window_height = 600;
    config_adv.vga_full_screen = 0;
    config_adv.vga_keep_aspect_ratio = 1;
    config_adv.vga_pause_on_focus_loss = 0;
    config_adv.remote_compare_random_seed = 1;
}

void dolly_rts_poll()
{
    if (remote.sync_test_level < 0 && (player || remote.is_replay() || remote.is_replay_end())) {
        std::fputs("RTS: game state synchronization failed\n", stderr);
        _exit(74);
    }
    if (!player && !replay_player) return;
    if (stopping()) sys.signal_exit_flag = 2;
}

void MultiPlayer::init_local(uint32_t id)
{
    init_flag = 1;
    set_my_player_id(id);
    joined_session.player_count = 2;
    for (int i = 0; i < MAX_NATION; ++i) player_pool[i] = pending_pool[i] = nullptr;
}

int dolly_rts_send(uint32_t to, const void *bytes, uint32_t size)
{
    if ((to != BROADCAST_PID && to != 3 - player) || !size || size > 10240) return 0;
    flush();
    if (outgoing.size() - sent + size + 4 > 128 * 1024) { errno = EAGAIN; return 0; }
    if (sent) {
        outgoing.erase(outgoing.begin(), outgoing.begin() + sent);
        sent = 0;
    }
    const auto *length = reinterpret_cast<const unsigned char *>(&size);
    const auto *data = static_cast<const unsigned char *>(bytes);
    outgoing.insert(outgoing.end(), length, length + 4);
    outgoing.insert(outgoing.end(), data, data + size);
    flush();
    return 1;
}

char *dolly_rts_receive(uint32_t *from, uint32_t *size, int *system_messages)
{
    flush();
    *from = *size = 0;
    if (system_messages) *system_messages = 0;
    while (true) {
        const size_t needed = received < 4 ? 4 : 4 + packet_size;
        const ssize_t count = read(STDIN_FILENO, incoming + received, needed - received);
        if (count > 0) received += count;
        else if (count < 0 && errno == EINTR) continue;
        else if (count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return nullptr;
        else dolly_rts_transport_failed();
        if (received < 4) continue;
        std::memcpy(&packet_size, incoming, 4);
        if (!packet_size || packet_size > sizeof(incoming) - 4) dolly_rts_transport_failed();
        if (received == packet_size + 4) {
            *from = 3 - player;
            *size = packet_size;
            received = 0;
            return reinterpret_cast<char *>(incoming + 4);
        }
    }
}

void dolly_rts_run()
{
    config.default_game_setting();
    config.reset_cheat_setting();
    config.ai_nation_count = 0;
    config.new_nation_emerge = 0;
    config.monster_type = 0;
    config.explore_whole_map = 0;
    config.fog_of_war = config.blacken_map = 1;
    config.frame_speed = 20;
    game.game_mode = GAME_MULTI_PLAYER;
    sys.is_mp_game = 1;
    mp_obj.init_local(player);
    remote.init(&mp_obj);
    if (player == 1) remote.create_game(); else remote.connect_game();
    remote.set_process_frame_delay(1);
    ec_remote.init(&mp_obj, player);
    ec_remote.set_dp_id(3 - player, 3 - player);
    NewNationPara nations[2] = {};
    char names[][16] = { "Player 1", "Player 2" };
    for (int i = 0; i < 2; ++i) nations[i].init(i + 1, i + 1, i + 1, 1, names[i]);
    remote.init_start_mp();
    remote.init_send_queue(1, player);
    remote.init_receive_queue(1);
    info.init_random_seed(cmd_line.rnd ? cmd_line.rnd : 12345);
    // The normal menus initialize this; the arena starts directly in a match.
    mouse_cursor.set_icon(CURSOR_NORMAL);
    mouse.show();
    game.init();
    remote.handle_vga_lock = 0;
    remote.init_replay_save(nations, 2);
    sys.signal_exit_flag = 0;
    battle.run(nations, 2);
    dolly_rts_input_close(sys.frame_count);
    remote.deinit();
    ec_remote.deinit();
    game.deinit();
    close(output);
    output = -1;
}

void dolly_rts_finish(int winner, int destroyed, int surrendered, int retired)
{
    if (!winner && (destroyed || surrendered || retired)) winner = 3 - player;
    char filename[sizeof(sys.dir_config) + 32];
    std::snprintf(filename, sizeof(filename), "%s/result.txt", std::getenv("DOLLY_RTS_PLAYER_DIR"));
    if (FILE *file = std::fopen(filename, "w")) {
        std::fprintf(file, "%d %u\n", winner, static_cast<unsigned>(sys.frame_count));
        std::fclose(file);
    }
    game.game_has_ended = 1;
    sys.signal_exit_flag = 2;
}

bool dolly_rts_replay(int argc, char **argv)
{
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "-replay")) continue;
        if (i + 1 == argc) {
            std::fputs("usage: seven-kingdoms -replay FILE [-noaudio] [-win] [-speed N]\n", stderr);
            std::exit(64);
        }
        mouse_cursor.set_icon(CURSOR_NORMAL);
        mouse.show();
        const int result = battle.run_replay(argv[i + 1]);
        if (!result) {
            std::fprintf(stderr, "RTS: could not load replay: %s\n", argv[i + 1]);
            std::exit(65);
        }
        std::printf("RTS replay %s at game frame %u\n", result == 1 ? "reached EOF" : "stopped",
            static_cast<unsigned>(sys.frame_count));
        return true;
    }
    return false;
}
