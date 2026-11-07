#pragma once

#include "drivers/unix/os_unix.h"

// Godot on Dolly's POSIX: files, clocks, processes and entropy are OS_Unix's.
class OS_Dolly : public OS_Unix {
	MainLoop *main_loop = nullptr;

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

	void run();

	OS_Dolly();
};
