#pragma once

#include "audio_driver_dolly.h"

#include "core/os/mutex.h"
#include "core/templates/hash_map.h"
#include "drivers/unix/os_unix.h"

#include <string>
#include <vector>

// Godot on Dolly's POSIX: files, clocks and entropy are OS_Unix's. Processes
// start with posix_spawn, as Dolly has no fork.
class OS_Dolly : public OS_Unix {
	MainLoop *main_loop = nullptr;
	AudioDriverDolly audio_driver;
	uint64_t frame_target = 0; // when add_frame_delay's sleep ends

	// An instance of Godot asked for without its PID, its executable first:
	// it starts after this frame, or takes this process's place if the frame
	// ends the program. Plain strings, as it outlives Godot's cleanup.
	std::vector<std::string> instance;
	void start_instance();

	// The children spawned here and how each ended, as OS_Unix keeps its forks'.
	struct Child {
		bool running = true;
		int exit_code = -1;
	};
	mutable HashMap<ProcessID, Child> children;
	mutable Mutex children_mutex;
	int child_state(ProcessID p_pid, int *r_exit_code) const;

	String xdg_directory(const String &p_variable, const String &p_under_home) const;

protected:
	void initialize() override;
	void finalize() override;
	void initialize_joypads() override {}
	void set_main_loop(MainLoop *p_main_loop) override;
	void delete_main_loop() override;

public:
	String get_name() const override;
	MainLoop *get_main_loop() const override;
	bool _check_internal_feature_support(const String &p_feature) override;
	String get_executable_path() const override;
	String get_config_path() const override;
	String get_data_path() const override;
	String get_cache_path() const override;
	void add_frame_delay(bool p_can_draw, bool p_wake_for_events) override;

	Error create_instance(const List<String> &p_arguments, ProcessID *r_child_id = nullptr) override;
	Error create_process(const String &p_path, const List<String> &p_arguments, ProcessID *r_child_id = nullptr, bool p_open_console = false) override;
	Error execute(const String &p_path, const List<String> &p_arguments, String *r_pipe = nullptr, int *r_exitcode = nullptr, bool read_stderr = false, Mutex *p_pipe_mutex = nullptr, bool p_open_console = false) override;
	Error kill(const ProcessID &p_pid) override;
	bool is_process_running(const ProcessID &p_pid) const override;
	int get_process_exit_code(const ProcessID &p_pid) const override;

	void run();
	void replace_with_instance();

	OS_Dolly();
};
