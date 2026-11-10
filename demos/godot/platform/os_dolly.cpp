#include "os_dolly.h"

#include "core/os/main_loop.h"
#include "main/main.h"
#include "servers/display/display_server.h"

#ifdef GLES3_ENABLED
#include "display_server_dolly.h"
#endif

#include <errno.h>
#include <limits.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;

// A command line as execv and posix_spawn take it.
static std::vector<std::string> command_line(const String &p_path, const List<String> &p_arguments) {
	std::vector<std::string> words{ p_path.utf8().get_data() };
	for (const String &argument : p_arguments) {
		words.push_back(argument.utf8().get_data());
	}
	return words;
}

static std::vector<char *> argv(std::vector<std::string> &p_words) {
	std::vector<char *> pointers;
	for (std::string &word : p_words) {
		pointers.push_back(word.data());
	}
	pointers.push_back(nullptr);
	return pointers;
}

static int spawn(std::vector<std::string> p_words, pid_t *r_pid) {
	std::vector<char *> pointers = argv(p_words);
	return posix_spawnp(r_pid, pointers[0], nullptr, nullptr, pointers.data(), environ);
}

static int exit_code(int p_status) {
	return WIFEXITED(p_status) ? WEXITSTATUS(p_status) : p_status;
}

OS_Dolly::OS_Dolly() {
	AudioDriverManager::add_driver(&audio_driver);
#ifdef GLES3_ENABLED
	DisplayServerDolly::register_dolly_driver();
#endif
}

void OS_Dolly::initialize() {
	OS_Unix::initialize_core();
}

void OS_Dolly::finalize() {
	delete_main_loop();
}

void OS_Dolly::set_main_loop(MainLoop *p_main_loop) {
	main_loop = p_main_loop;
}

void OS_Dolly::delete_main_loop() {
	if (main_loop) {
		memdelete(main_loop);
	}
	main_loop = nullptr;
}

String OS_Dolly::get_name() const {
	return "Dolly";
}

MainLoop *OS_Dolly::get_main_loop() const {
	return main_loop;
}

bool OS_Dolly::_check_internal_feature_support(const String &p_feature) {
	return p_feature == "dolly";
}

// In low-processor mode, the editor's, a frame's sleep ends at the next input
// record, as Godot's Windows and macOS platforms end it for a screen reader:
// a hover or a press is drawn without waiting out the rest of the sleep. The
// sleep ends at a target, as OS::add_frame_delay's, so a long frame sleeps less.
void OS_Dolly::add_frame_delay(bool p_can_draw, bool p_wake_for_events) {
#ifdef GLES3_ENABLED
	DisplayServerDolly *display = Object::cast_to<DisplayServerDolly>(DisplayServer::get_singleton());
	if (display && is_in_low_processor_usage_mode()) {
		const uint64_t delay = get_frame_delay(p_can_draw);
		frame_target += delay;
		const uint64_t now = get_ticks_usec();
		if (now < frame_target) {
			display->wait_for_event(frame_target - now);
		}
		const uint64_t woken = get_ticks_usec();
		frame_target = MIN(MAX(frame_target, woken - delay), woken + delay);
		return;
	}
#endif
	OS_Unix::add_frame_delay(p_can_draw, p_wake_for_events);
}

String OS_Dolly::get_executable_path() const {
	char path[PATH_MAX];
	const ssize_t size = readlink("/proc/self/exe", path, sizeof(path));
	return size > 0 ? String::utf8(path, size) : OS::get_executable_path();
}

// The XDG base directories, as Godot's Linux platform takes them.
String OS_Dolly::xdg_directory(const String &p_variable, const String &p_under_home) const {
	if (get_environment(p_variable).is_absolute_path()) {
		return get_environment(p_variable);
	}
	return has_environment("HOME") ? get_environment("HOME").path_join(p_under_home) : ".";
}

String OS_Dolly::get_config_path() const {
	return xdg_directory("XDG_CONFIG_HOME", ".config");
}

String OS_Dolly::get_data_path() const {
	return xdg_directory("XDG_DATA_HOME", ".local/share");
}

String OS_Dolly::get_cache_path() const {
	return xdg_directory("XDG_CACHE_HOME", ".cache");
}

void OS_Dolly::run() {
	if (!main_loop) {
		return;
	}
	main_loop->initialize();
	while (true) {
		DisplayServer::get_singleton()->process_events();
		if (Main::iteration()) {
			break;
		}
		start_instance();
	}
	main_loop->finalize();
}

// An instance of Godot whose PID the caller keeps is a child now. One asked
// for without it, as the Project Manager opens the editor and quits, waits for
// the frame's end: it is a child if the program goes on, and replaces the
// program if the frame ends it (replace_with_instance). The page has one
// surface and one foreground, as Godot's web editor runs a new editor in its
// canvas once the old one exits (misc/dist/html/editor.html).
Error OS_Dolly::create_instance(const List<String> &p_arguments, ProcessID *r_child_id) {
	if (r_child_id) {
		return create_process(get_executable_path(), p_arguments, r_child_id);
	}
	start_instance();
	instance = command_line(get_executable_path(), p_arguments);
	return OK;
}

void OS_Dolly::start_instance() {
	if (instance.empty()) {
		return;
	}
	pid_t pid = 0;
	const int error = spawn(std::move(instance), &pid);
	instance.clear();
	ERR_FAIL_COND_MSG(error != 0, vformat("Could not start Godot's instance: %s.", strerror(error)));
	MutexLock lock(children_mutex);
	children.insert(pid, Child());
}

// After Godot's cleanup: execv keeps the PID, so the instance stays the
// terminal's foreground and takes the page's surface and input.
void OS_Dolly::replace_with_instance() {
	if (instance.empty()) {
		return;
	}
	std::vector<char *> pointers = argv(instance);
	fflush(nullptr);
	execv(pointers[0], pointers.data());
	fprintf(stderr, "Could not start Godot's instance %s: %s.\n", pointers[0], strerror(errno));
}

Error OS_Dolly::create_process(const String &p_path, const List<String> &p_arguments, ProcessID *r_child_id, bool p_open_console) {
	pid_t pid = 0;
	const int error = spawn(command_line(p_path, p_arguments), &pid);
	ERR_FAIL_COND_V_MSG(error != 0, ERR_CANT_FORK, vformat("Could not start %s: %s.", p_path, strerror(error)));
	MutexLock lock(children_mutex);
	children.insert(pid, Child());
	if (r_child_id) {
		*r_child_id = pid;
	}
	return OK;
}

// Output read through a pipe is OS_Unix's, by popen, which Dolly's libc spawns.
Error OS_Dolly::execute(const String &p_path, const List<String> &p_arguments, String *r_pipe, int *r_exitcode, bool read_stderr, Mutex *p_pipe_mutex, bool p_open_console) {
	if (r_pipe) {
		return OS_Unix::execute(p_path, p_arguments, r_pipe, r_exitcode, read_stderr, p_pipe_mutex, p_open_console);
	}
	pid_t pid = 0;
	const int error = spawn(command_line(p_path, p_arguments), &pid);
	ERR_FAIL_COND_V_MSG(error != 0, ERR_CANT_FORK, vformat("Could not start %s: %s.", p_path, strerror(error)));
	int status = 0;
	while (waitpid(pid, &status, 0) < 0) {
		if (errno != EINTR) {
			return FAILED;
		}
	}
	if (r_exitcode) {
		*r_exitcode = exit_code(status);
	}
	return OK;
}

// A child spawned here: 1 while it runs, 0 once it has ended, with its exit
// code kept; -1 for a process that is not one.
int OS_Dolly::child_state(ProcessID p_pid, int *r_exit_code) const {
	MutexLock lock(children_mutex);
	Child *child = children.getptr(p_pid);
	if (!child) {
		return -1;
	}
	if (child->running) {
		int status = 0;
		pid_t waited;
		while ((waited = waitpid(p_pid, &status, WNOHANG)) < 0 && errno == EINTR) {
		}
		if (waited == 0) {
			return 1;
		}
		child->running = false;
		child->exit_code = waited == p_pid ? exit_code(status) : -1;
	}
	*r_exit_code = child->exit_code;
	return 0;
}

bool OS_Dolly::is_process_running(const ProcessID &p_pid) const {
	int code = -1;
	const int state = child_state(p_pid, &code);
	return state < 0 ? OS_Unix::is_process_running(p_pid) : state == 1;
}

int OS_Dolly::get_process_exit_code(const ProcessID &p_pid) const {
	int code = -1;
	const int state = child_state(p_pid, &code);
	return state < 0 ? OS_Unix::get_process_exit_code(p_pid) : state == 1 ? -1 : code;
}

Error OS_Dolly::kill(const ProcessID &p_pid) {
	{
		MutexLock lock(children_mutex);
		Child *child = children.getptr(p_pid);
		if (child) {
			if (!child->running || ::kill(p_pid, SIGKILL) != 0) {
				return ERR_INVALID_PARAMETER;
			}
			int status = 0;
			while (waitpid(p_pid, &status, 0) < 0 && errno == EINTR) {
			}
			child->running = false;
			child->exit_code = exit_code(status);
			return OK;
		}
	}
	return OS_Unix::kill(p_pid);
}
