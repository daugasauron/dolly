#include "os_dolly.h"

#include "core/os/main_loop.h"
#include "main/main.h"
#include "servers/display/display_server.h"

#ifdef GLES3_ENABLED
#include "display_server_dolly.h"
#endif

#include <limits.h>
#include <unistd.h>

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
	}
	main_loop->finalize();
}
