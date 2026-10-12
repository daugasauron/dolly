/* tmux's operating system file for Dolly, beside upstream's osdep-*.c. */
#include <sys/types.h>
#include <sys/ioctl.h>

#include <dolly/runtime.h>
#include <errno.h>
#include <pty.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "tmux.h"

/* Dolly names no process a terminal's foreground and no process's directory. */
char *
osdep_get_name(__unused int fd, __unused char *tty)
{
	return (NULL);
}

char *
osdep_get_cwd(__unused int fd)
{
	return (NULL);
}

struct event_base *
osdep_event_init(void)
{
	return (event_init());
}

/* The file execvp would run: the name itself, or its first match on PATH. */
static char *
osdep_find_program(const char *name, struct environ *env)
{
	struct environ_entry	*envent = environ_find(env, "PATH");
	const char		*path, *end;
	char			*candidate;

	if (strchr(name, '/') != NULL)
		return (xstrdup(name));
	path = (envent != NULL && envent->value != NULL) ? envent->value :
	    _PATH_DEFPATH;
	for (; *path != '\0'; path = *end == ':' ? end + 1 : end) {
		end = path + strcspn(path, ":");
		xasprintf(&candidate, "%.*s/%s", (int)(end - path), path, name);
		if (access(candidate, X_OK) == 0)
			return (candidate);
		free(candidate);
	}
	return (xstrdup(name));
}

/*
 * Dolly has spawn, not fork: this is forkpty and what spawn.c does in the
 * child, for a pane. The program starts on a new pseudo-terminal's slave in
 * the server's current directory with the pane's environment and no other
 * descriptor of the server. Returns its pid, or -1.
 */
pid_t
osdep_spawn(int *master, char *tty, struct winsize *ws, struct environ *env,
    const char *shell, int argc, char **argv)
{
	struct environ_entry	 *envent;
	const char		 *slash = strrchr(shell, '/');
	const char		 *base = (slash != NULL && slash[1] != '\0') ?
				      slash + 1 : shell;
	char			**envp = NULL, **args, *program, *argv0 = NULL;
	size_t			  envc = 0;
	int			  slave, pid, error, i;

	for (envent = environ_first(env); envent != NULL;
	    envent = environ_next(envent)) {
		if (envent->value == NULL || *envent->name == '\0' ||
		    (envent->flags & ENVIRON_HIDDEN))
			continue;
		envp = xreallocarray(envp, envc + 2, sizeof *envp);
		xasprintf(&envp[envc++], "%s=%s", envent->name, envent->value);
	}
	if (envp == NULL)
		envp = xcalloc(1, sizeof *envp);
	envp[envc] = NULL;

	/* As spawn.c: several arguments are a command, one is for the shell. */
	if (argc > 1) {
		args = cmd_copy_argv(argc, argv);
		program = osdep_find_program(args[0], env);
	} else {
		args = xcalloc(4, sizeof *args);
		xasprintf(&argv0, "%s%s", argc == 1 ? "" : "-", base);
		args[0] = argv0;
		if (argc == 1) {
			args[1] = xstrdup("-c");
			args[2] = xstrdup(argv[0]);
		}
		program = xstrdup(shell);
		argc = argc == 1 ? 3 : 1;
	}

	if (openpty(master, &slave, tty, NULL, ws) != 0)
		pid = -1;
	else {
		pid = dolly_spawn_env_cwd(program, argc, args, envp, NULL,
		    slave, slave, slave, -1);
		close(slave);
		if (pid < 0) {
			close(*master);
			errno = -pid;
			pid = -1;
		}
	}

	error = errno;
	for (i = 0; i < argc; i++)
		free(args[i]);
	free(args);
	while (envc != 0)
		free(envp[--envc]);
	free(envp);
	free(program);
	errno = error;
	return (pid);
}
