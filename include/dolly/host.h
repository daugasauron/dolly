#pragma once
#include <dolly/host-abi.h>

/* One record per client object; LLD concatenates selected archive members.
 * The layout is defined by abi/dolly-host-0.wat. Programs include their module
 * header instead; this macro is for the module's client implementation. */
#define DOLLY_HOST_STRINGIFY_(value) #value
#define DOLLY_HOST_STRINGIFY(value) DOLLY_HOST_STRINGIFY_(value)
#define DOLLY_HOST_REQUIRE(name, revision) \
  __asm__(".section .custom_section.dolly.host,\"\",@\n" \
          "1:\n.asciz \"" #name "\"\n.zero " DOLLY_HOST_STRINGIFY(DOLLY_HOST_NAME_BYTES) "-(.-1b)\n" \
          ".int32 " DOLLY_HOST_STRINGIFY(revision) "\n.int32 0\n")
