/* tmux's operating system file for Dolly, beside upstream's osdep-*.c. */
#include <sys/types.h>
#include <sys/ioctl.h>

#include <dolly/runtime.h>
#include <errno.h>
#include <fcntl.h>
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
 * The program and arguments execl or execvp would run: `cmd` by the shell, a
 * login shell when there is nothing to run, else argv.
 */
static char **
osdep_command(struct environ *env, const char *shell, const char *cmd,
    int argc, char **argv, char **program, int *count)
{
	const char	 *slash = strrchr(shell, '/');
	const char	 *base = (slash != NULL && slash[1] != '\0') ?
			      slash + 1 : shell;
	char		**args;

	if (cmd == NULL && argc != 0) {
		*program = osdep_find_program(argv[0], env);
		*count = argc;
		return (cmd_copy_argv(argc, argv));
	}
	args = xcalloc(4, sizeof *args);
	xasprintf(&args[0], "%s%s", cmd == NULL ? "-" : "", base);
	if (cmd != NULL) {
		args[1] = xstrdup("-c");
		args[2] = xstrdup(cmd);
	}
	*program = xstrdup(shell);
	*count = cmd == NULL ? 1 : 3;
	return (args);
}

/*
 * Dolly has spawn, not fork: this is fork and what tmux does in the child
 * before it execs. The program starts on the three descriptors with the
 * environment and no other descriptor of the server, in `cwd` or, when that
 * is NULL, the server's directory. Returns its pid, or -1.
 */
static pid_t
osdep_run(struct environ *env, const char *cwd, const char *shell,
    const char *cmd, int argc, char **argv, int in, int out, int err)
{
	struct environ_entry	 *envent;
	char			**envp = NULL, **args, *program;
	size_t			  envc = 0;
	int			  pid, count, i;

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

	args = osdep_command(env, shell, cmd, argc, argv, &program, &count);
	pid = dolly_spawn_env_cwd(program, count, args, envp, cwd, in, out,
	    err, -1);

	for (i = 0; i < count; i++)
		free(args[i]);
	free(args);
	while (envc != 0)
		free(envp[--envc]);
	free(envp);
	free(program);
	if (pid < 0) {
		errno = -pid;
		return (-1);
	}
	return (pid);
}

/* forkpty for a pane, in the directory spawn.c has changed to. */
pid_t
osdep_spawn(int *master, char *tty, struct winsize *ws, struct environ *env,
    const char *shell, int argc, char **argv)
{
	int	slave, error;
	pid_t	pid;

	if (openpty(master, &slave, tty, NULL, ws) != 0)
		return (-1);
	pid = osdep_run(env, NULL, shell, argc == 1 ? argv[0] : NULL,
	    argc == 1 ? 0 : argc, argv, slave, slave, slave);
	error = errno;
	close(slave);
	if (pid == -1)
		close(*master);
	errno = error;
	return (pid);
}

/*
 * fork or forkpty for a job, as job.c's child sets it up: in `cwd`, the home
 * directory or the root, on a new pseudo-terminal or on `out` with errors
 * there too or discarded.
 */
pid_t
osdep_job(int flags, int *master, char *tty, struct winsize *ws, int out,
    struct environ *env, const char *cwd, const char *shell, const char *cmd,
    int argc, char **argv)
{
	const char	*home = find_home(), *directory = NULL;
	int		 err = out, opened = -1, error;
	pid_t		 pid;

	if (cwd != NULL) {
		if (*cwd == '/' && access(cwd, X_OK) == 0)
			directory = cwd;
		else if (home != NULL && *home == '/' && access(home, X_OK) == 0)
			directory = home;
		else
			directory = "/";
		environ_set(env, "PWD", 0, "%s", directory);
	}
	if (cmd != NULL && (flags & JOB_DEFAULTSHELL))
		environ_set(env, "SHELL", 0, "%s", shell);

	if (flags & JOB_PTY) {
		if (openpty(master, &opened, tty, NULL, ws) != 0)
			return (-1);
		out = err = opened;
	} else if (~flags & JOB_SHOWSTDERR) {
		if ((opened = open(_PATH_DEVNULL, O_RDWR)) == -1)
			return (-1);
		err = opened;
	}
	pid = osdep_run(env, directory, shell, cmd, cmd != NULL ? 0 : argc,
	    argv, out, out, err);
	error = errno;
	if (opened != -1)
		close(opened);
	if (pid == -1 && (flags & JOB_PTY))
		close(*master);
	errno = error;
	return (pid);
}
