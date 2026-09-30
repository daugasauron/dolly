#ifndef DOLLY_QUICKJS_RUNNER_H
#define DOLLY_QUICKJS_RUNNER_H

// Run the generic QuickJS command when default_module is NULL. Otherwise run
// that filesystem ESM entry and pass every command argument through to it.
int dolly_quickjs_run(int argc, char **argv, const char *default_module);

struct JSContext;
// Install application-owned C bindings before evaluating the entry module.
int dolly_quickjs_embed(int argc,char **argv,const char *module,
                       int (*initialize)(struct JSContext *context));

#endif
