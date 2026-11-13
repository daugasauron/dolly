#include <dolly/runtime.h>

#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <sys/wait.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  const char *checker = argv[1];
  int descriptors[2];
  if (pipe(descriptors) != 0) return 40;

  char *producer_arguments[] = {(char *)checker, "produce", NULL};
  const int producer = dolly_spawn(
      checker, 2, producer_arguments,
      STDIN_FILENO, descriptors[1], STDERR_FILENO);
  if (producer < 0) return 41;

  char *consumer_arguments[] = {(char *)checker, "consume", NULL};
  const int consumer = dolly_spawn(
      checker, 2, consumer_arguments,
      descriptors[0], STDOUT_FILENO, STDERR_FILENO);
  if (consumer < 0) return 42;

  if (close(descriptors[0]) != 0 || close(descriptors[1]) != 0) return 43;
  int producer_status = 255;
  int consumer_status = 255;
  if (dolly_wait(producer, &producer_status) != 0 || producer_status != 0) return 44;
  if (dolly_wait(consumer, &consumer_status) != 0 || consumer_status != 0) return 45;

  char *broken_arguments[] = {(char *)checker, "broken", NULL};
  const int first = dolly_spawn(checker, 2, broken_arguments, 0, 1, 2);
  const int second = dolly_spawn(checker, 2, broken_arguments, 0, 1, 2);
  if (first < 0 || second < 0) return 46;
  for (int reaped = 0; reaped < 2; ++reaped) {
    int status;
    const pid_t pid = waitpid(-1, &status, 0);
    if ((pid != first && pid != second) || !WIFEXITED(status) || WEXITSTATUS(status) != 0) return 47;
  }
  if (waitpid(-1, NULL, WNOHANG) != -1 || errno != ECHILD) return 48;

  char *sigpipe_arguments[] = {(char *)checker, "sigpipe", NULL};
  const int killed = dolly_spawn(checker, 2, sigpipe_arguments, 0, 1, 2);
  int status;
  if (killed < 0 || waitpid(killed, &status, 0) != killed) return 49;
  if (!WIFSIGNALED(status) || WTERMSIG(status) != SIGPIPE) return 50;
  return 0;
}
