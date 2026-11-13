// nena lists and switches the host modules of the running session: the
// bridges between this Wasm userspace and the browser. The page makes every
// switch (nena@0); an image that does not declare that module has the list
// its recipe gave it, and nothing here can change it.
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <dolly/nena.h>

static void usage(FILE *stream) {
  fputs("usage: nena                    every host module of the page: NAME@VERSION, its state, what it gives\n"
        "       nena enable NAME...     enable modules for the session, such as: nena enable gpu\n"
        "       nena disable NAME...    disable them; nena disable nena fixes the list until the page is reloaded\n"
        "A host module is a bridge between this userspace and the browser. State: declared (the image\n"
        "has it), enabled (the session added it), available (nena can enable it) or - (fixed and off).\n"
        "A disabled module is gone at once: programs that need it are refused, a running one's calls fail.\n"
        "What a session enabled is kept in /etc/dolly/enabled and enabled again when the session is loaded.\n"
        "nena works in an image that declares nena@0, as default does; elsewhere the image's list is fixed.\n",
        stream);
}

static const char *state(const dolly_nena_module *module) {
  if (!(module->state & DOLLY_NENA_ENABLED)) return module->state & DOLLY_NENA_FIXED ? "-" : "available";
  return module->state & DOLLY_NENA_DECLARED ? "declared" : "enabled";
}

// The page's module called NAME or NAME@VERSION; 0, or -1 when it has none.
static int find(dolly_nena *nena, const char *name, dolly_nena_module *module) {
  const char *at = strchr(name, '@');
  const size_t length = at == NULL ? strlen(name) : (size_t)(at - name);
  for (uint32_t index = 0; dolly_nena_module_at(nena, index, module) == 0; ++index) {
    if (strlen(module->name) == length && memcmp(module->name, name, length) == 0 &&
        (at == NULL || strtoul(at + 1, NULL, 10) == module->version)) return 0;
  }
  return -1;
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  const int enabling = argc >= 3 && strcmp(argv[1], "enable") == 0;
  if (argc != 1 && !enabling && !(argc >= 3 && strcmp(argv[1], "disable") == 0)) {
    usage(stderr);
    return 2;
  }
  static dolly_nena nena;
  dolly_nena_module module;
  if (dolly_nena_open(&nena) != 0) {
    if (errno == ENOSYS) fputs("nena: this session has no nena@0: its host modules are fixed\n", stderr);
    else fprintf(stderr, "nena: %s\n", strerror(errno));
    return 1;
  }
  int status = 0;
  for (uint32_t index = 0; argc == 1 && dolly_nena_module_at(&nena, index, &module) == 0; ++index) {
    char name[sizeof(module.name) + 12];
    snprintf(name, sizeof(name), "%s@%u", module.name, module.version);
    printf("%-14s %-10s %s%s%s\n", name, state(&module), module.gives,
           module.state & DOLLY_NENA_FIXED ? "; fixed: " : "", module.state & DOLLY_NENA_FIXED ? module.reason : "");
  }
  for (int argument = 2; argument < argc; ++argument) {
    if (find(&nena, argv[argument], &module) != 0) {
      fprintf(stderr, "nena: %s: this page has no such host module; nena lists them\n", argv[argument]);
      status = 1;
      continue;
    }
    const uint32_t version = module.version;
    char name[sizeof(module.name)];
    memcpy(name, module.name, sizeof(name));
    const int result = enabling ? dolly_nena_enable(&nena, name, version, &module)
                                : dolly_nena_disable(&nena, name, version, &module);
    if (result == 0) printf("nena: %s@%u %s\n", name, version, enabling ? "enabled" : "disabled");
    else {
      fprintf(stderr, "nena: %s@%u: %s\n", name, version, errno == ENOTSUP ? module.reason : strerror(errno));
      status = 1;
    }
  }
  // After nena disable nena there is no provider left to close.
  dolly_nena_close(&nena);
  return status;
}
