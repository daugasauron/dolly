// Support/CrashReporting without Crashpad, whose handler is a second process
// that inspects the crashed one: there is no crash reporting to initialize.
#include "Support/CrashReporting/CrashReporting.h"

#include "Support/Error.h"
#include "Support/ErrorOr.h"

using namespace M;

std::filesystem::path
M::getCrashDatabasePath(const std::filesystem::path &dataFolder) {
  return dataFolder / "crashdb";
}

ErrorOr<std::filesystem::path> M::getCrashpadHandlerPath(Config *) {
  return Error("this Mojo is built without crash reporting");
}

void M::initCrashpadForProgram(StringRef, StringRef, StringRef, Config *) {}

void M::generateNonFatalDump() {}
