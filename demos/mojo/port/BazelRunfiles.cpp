// Support/BazelRunfiles for a program that Bazel neither built nor runs: it
// has no runfiles.
#include "Support/BazelRunfiles.h"

std::optional<std::string> M::findConfigWithRunfiles(llvm::StringRef) {
  return std::nullopt;
}

const std::vector<std::pair<std::string, std::string>> *
M::getRunfilesEnvVars() {
  return nullptr;
}
