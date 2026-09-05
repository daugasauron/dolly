#include <dolly/toolchain.h>

int main(int argc, char **argv) {
  return dolly_toolchain_proxy(argc, argv, DOLLY_TOOLCHAIN_CXX);
}
