#include <dolly/runtime.h>

#include <stdio.h>
#include <unistd.h>

static const char *const checker =
    "/usr/libexec/dolly/process-bin/process-pipe-check";

int main(void) {
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
  return 0;
}
