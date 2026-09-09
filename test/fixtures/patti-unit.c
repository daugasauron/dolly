#define main patti_main
#include "patti.c"
#undef main
#include <assert.h>

int main(int argc, char **argv) {
  if (argc > 1 && equal(argv[1], "bad-version")) return version_matches("1.0.0", "banana");
  Value *config = value(TABLE), *unix_values = value(ARRAY);
  append(unix_values, &nil); put(config, "unix", unix_values);
  put(config, "target_os", arguments("emscripten", NULL));
  put(config, "target_pointer_width", arguments("64", NULL));
  if (argc > 1 && equal(argv[1], "bad-cfg")) return cfg_matches("cfg(unix) garbage", config, "dolly");
  struct { const char *actual, *requirement; bool expected; } cases[] = {
    {"1.4.0", "1.2", true}, {"2.0.0", "1.2", false},
    {"0.3.0", "0.2.148", false}, {"0.2.186", "0.2.148", true},
    {"0.0.4", "^0.0.3", false}, {"0.5.0", "0", true},
    {"1.0.228", "=1.0.228", true}, {"1.0.229", "=1.0.228", false},
    {"1.3.0", "~1.2", false}, {"1.2.7", "1.2.*", true},
    {"1.4.0", ">=1.3.0, <2.0.0", true},
    {"0.4.9", ">=0.3, <0.5", true}, {"0.5.1", ">=0.3, <0.5", false},
    {"0.9.11+spec-1.1.0", "0.9", true},
    {"0.3.0-alpha.4", "0.3.0-alpha.3", true},
    {"0.3.0-alpha.4", "=0.3.0-alpha.4", true},
    {"0.3.0-alpha.4", "0.3", false}, {"0.3.1-alpha.4", "0.3.0-alpha.4", false},
    {"0.3.0-alpha.10", ">0.3.0-alpha.9", true}, {"0.3.0", "0.3.0-alpha.4", true},
  };
  for (size_t i = 0; i < sizeof(cases)/sizeof(*cases); ++i)
    assert(version_matches(cases[i].actual, cases[i].requirement) == cases[i].expected);
  assert(cfg_matches("cfg(all(unix, not(target_os = \"linux\"),))", config, "dolly"));
  assert(!cfg_matches("cfg(any(windows, target_pointer_width = \"32\"))", config, "dolly"));
  assert(cfg_matches("dolly", config, "dolly"));
  struct timespec stamp = pax_time("1153704088.123456789");
  assert(stamp.tv_sec == 1153704088 && stamp.tv_nsec == 123456789);
  stamp = pax_time("-0.25");
  assert(stamp.tv_sec == -1 && stamp.tv_nsec == 750000000);
  release(&permanent);
  puts("PATTI-PARSERS-PASSED");
  return 0;
}
