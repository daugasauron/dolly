/* Dolly's synchronous GNU Make job adapter.
 *
 * GNU Make's remote-job interface is a convenient, narrow replacement for
 * fork/exec.  Jobs still enter Make's ordinary dependency and error handling,
 * but they execute synchronously through /bin/slop in the current Wasm
 * instance.  There is deliberately no worker pool or host process fallback.
 */

#include "makeint.h"
#include "filedef.h"
#include "job.h"
#include "commands.h"

#include <dolly/runtime.h>

#include <fcntl.h>
#include <stdint.h>
#include <unistd.h>

char *remote_description = "Dolly serial Wasm executor";

static pid_t completed_id;
static int completed_status;
static int completed_pending;

static int
append_bytes (char **buffer, size_t *length, size_t *capacity,
              const char *bytes, size_t count)
{
  size_t required;
  char *grown;

  if (count > SIZE_MAX - *length - 1)
    return -1;
  required = *length + count + 1;
  if (required > *capacity)
    {
      size_t next = *capacity == 0 ? 128 : *capacity;
      while (next < required)
        {
          if (next > SIZE_MAX / 2)
            {
              next = required;
              break;
            }
          next *= 2;
        }
      grown = realloc (*buffer, next);
      if (grown == NULL)
        return -1;
      *buffer = grown;
      *capacity = next;
    }
  memcpy (*buffer + *length, bytes, count);
  *length += count;
  (*buffer)[*length] = '\0';
  return 0;
}

/* Reconstruct Make's shell-free fast path as a lossless shell command.  This
   makes every recipe pass through Slop while retaining the exact argv Make
   already parsed.  */
static char *
quote_argv (char **argv)
{
  char *command = NULL;
  size_t length = 0;
  size_t capacity = 0;
  size_t argument;

  for (argument = 0; argv[argument] != NULL; ++argument)
    {
      const char *cursor;
      if (argument != 0
          && append_bytes (&command, &length, &capacity, " ", 1) != 0)
        goto fail;
      if (append_bytes (&command, &length, &capacity, "'", 1) != 0)
        goto fail;
      for (cursor = argv[argument]; *cursor != '\0'; ++cursor)
        {
          if (*cursor == '\'')
            {
              if (append_bytes (&command, &length, &capacity,
                                "'\\''", 4) != 0)
                goto fail;
            }
          else if (append_bytes (&command, &length, &capacity, cursor, 1) != 0)
            goto fail;
        }
      if (append_bytes (&command, &length, &capacity, "'", 1) != 0)
        goto fail;
    }

  if (command == NULL)
    command = xstrdup (":");
  return command;

 fail:
  free (command);
  return NULL;
}

static int
run_argv (char **argv, int argc, char **envp, int stdin_fd, int stdout_fd,
          int stderr_fd, pid_t *pid_out, int *status_out)
{
  int pid;
  int status = 127;

  pid = dolly_spawn_env (argv[0], argc, argv, envp,
                         stdin_fd, stdout_fd, stderr_fd);
  if (pid < 0)
    return -1;
  if (dolly_wait (pid, &status) != 0)
    return -1;
  if (pid_out != NULL)
    *pid_out = (pid_t) pid;
  *status_out = status;
  return 0;
}

static int
run_slop (const char *command, char **envp, int stdin_fd, int stdout_fd,
          int stderr_fd, pid_t *pid_out, int *status_out)
{
  char *argv[4];
  argv[0] = "/bin/slop";
  argv[1] = "-c";
  argv[2] = (char *) command;
  argv[3] = NULL;
  return run_argv (argv, 3, envp, stdin_fd, stdout_fd, stderr_fd,
                   pid_out, status_out);
}

void
remote_setup (void)
{
  completed_id = 0;
  completed_status = 0;
  completed_pending = 0;
}

void
remote_cleanup (void)
{
}

int
start_remote_job_p (int first_p UNUSED)
{
  return 1;
}

int
start_remote_job (char **argv, char **envp, int stdin_fd,
                  int *is_remote, pid_t *id_ptr, int *used_stdin)
{
  char *command = NULL;
  pid_t id = 1;
  int status = 127;

  if (argv[0] != NULL && argv[1] != NULL
      && strcmp (argv[0], "/bin/slop") == 0
      && strcmp (argv[1], "-c") == 0)
    {
      int argc = 0;
      while (argv[argc] != NULL)
        ++argc;
      if (run_argv (argv, argc, envp, stdin_fd,
                    STDOUT_FILENO, STDERR_FILENO, &id, &status) != 0)
        status = 127;
    }
  else
    {
      command = quote_argv (argv);
      if (command != NULL)
        {
          if (run_slop (command, envp, stdin_fd,
                        STDOUT_FILENO, STDERR_FILENO, &id, &status) != 0)
            status = 127;
          free (command);
        }
    }

  completed_id = id;
  completed_status = status;
  completed_pending = 1;
  *is_remote = 1;
  *id_ptr = id;
  *used_stdin = 1;
  return 0;
}

pid_t
remote_status (int *exit_code_ptr, int *signal_ptr,
               int *coredump_ptr, int block UNUSED)
{
  pid_t id;

  if (!completed_pending)
    return 0;
  id = completed_id;
  *exit_code_ptr = completed_status;
  *signal_ptr = 0;
  *coredump_ptr = 0;
  completed_pending = 0;
  return id;
}

void
block_remote_children (void)
{
}

void
unblock_remote_children (void)
{
}

int
remote_kill (pid_t id UNUSED, int sig UNUSED)
{
  errno = ENOSYS;
  return -1;
}

/* Synchronous replacement for the pipe/fork implementation of $(shell ...).
   The unlinked temporary file is in WasmFS, so no bytes cross the browser
   boundary.  */
int
dolly_make_shell_capture (const char *command, char **envp, int stderr_fd,
                          int *status_out, char **buffer_out,
                          size_t *length_out)
{
  char path[] = "/tmp/make-shell-XXXXXX";
  char *buffer = NULL;
  size_t length = 0;
  size_t capacity = 0;
  int output_fd;
  int status = 127;

  output_fd = mkstemp (path);
  if (output_fd < 0)
    return -1;
  unlink (path);

  if (run_slop (command, envp, STDIN_FILENO, output_fd, stderr_fd,
                NULL, &status) != 0)
    status = 127;
  if (lseek (output_fd, 0, SEEK_SET) < 0)
    goto fail;

  for (;;)
    {
      char chunk[1024];
      ssize_t count = read (output_fd, chunk, sizeof chunk);
      if (count < 0)
        {
          if (errno == EINTR)
            continue;
          goto fail;
        }
      if (count == 0)
        break;
      if (append_bytes (&buffer, &length, &capacity,
                        chunk, (size_t) count) != 0)
        goto fail;
    }
  close (output_fd);

  if (buffer == NULL)
    buffer = xstrdup ("");
  *status_out = status;
  *buffer_out = buffer;
  *length_out = length;
  return 0;

 fail:
  close (output_fd);
  free (buffer);
  return -1;
}
