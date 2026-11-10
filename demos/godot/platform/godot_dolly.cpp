#include "os_dolly.h"

#include "main/main.h"

#include <clocale>
#include <cstdlib>

int main(int argc, char *argv[]) {
	OS_Dolly os;

	setlocale(LC_CTYPE, "");

	Error err = Main::setup(argv[0], argc - 1, &argv[1]);
	if (err != OK) {
		// --help and --version end setup with ERR_HELP.
		return err == ERR_HELP ? EXIT_SUCCESS : EXIT_FAILURE;
	}
	if (Main::start() == EXIT_SUCCESS) {
		os.run();
	} else {
		os.set_exit_code(EXIT_FAILURE);
	}
	Main::cleanup();
	os.replace_with_instance();
	return os.get_exit_code();
}
