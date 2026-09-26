#define _DEFAULT_SOURCE
#include <pthread.h>
#include <dolly/runtime.h>
#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t changed = PTHREAD_COND_INITIALIZER;
static int released;
static void *hold(void *unused) {
  (void)unused;
  assert(pthread_mutex_lock(&lock) == 0);
  while (!released) assert(pthread_cond_wait(&changed, &lock) == 0);
  assert(pthread_mutex_unlock(&lock) == 0);
  return NULL;
}
static void wait_file(const char *path) { while (access(path, F_OK)) usleep(1000); }
static void publish(const char *path, int value) {
  char temporary[128];snprintf(temporary, sizeof(temporary), "%s.tmp", path);
  int fd = open(temporary, O_WRONLY | O_CREAT | O_TRUNC, 0600);
  assert(fd >= 0 && write(fd, &value, sizeof(value)) == sizeof(value) && close(fd) == 0);
  assert(rename(temporary, path) == 0);
}
int main(int argc, char **argv) {
  if (argc == 2) {
    char entered[128];snprintf(entered, sizeof(entered), "%s.entered", argv[1]);publish(entered, 1);
    wait_file("/tmp/quota-start");
    pthread_t threads[16];int count = 0, error;
    while (count < 16 && !(error = pthread_create(threads + count, NULL, hold, NULL))) ++count;
    assert(count < 16 && error == EAGAIN);
    publish(argv[1], count);
    wait_file("/tmp/quota-release");
    assert(pthread_mutex_lock(&lock) == 0);released = 1;
    assert(pthread_cond_broadcast(&changed) == 0 && pthread_mutex_unlock(&lock) == 0);
    for (int i = 0; i < count; ++i) assert(pthread_join(threads[i], NULL) == 0);
    return 0;
  }
  unlink("/tmp/quota-start");unlink("/tmp/quota-release");
  char paths[4][64];int children[4];
  for (int i = 0; i < 4; ++i) {
    snprintf(paths[i], sizeof(paths[i]), "/tmp/quota-child-%d", i);unlink(paths[i]);
    char entered[128];snprintf(entered, sizeof(entered), "%s.entered", paths[i]);unlink(entered);
    char *arguments[] = {argv[0], paths[i], NULL};
    children[i] = dolly_spawn(argv[0], 2, arguments, 0, 1, 2);
    assert(children[i] > 0);
  }
  for (int i = 0; i < 4; ++i) {
    char entered[128];snprintf(entered, sizeof(entered), "%s.entered", paths[i]);wait_file(entered);
  }
  publish("/tmp/quota-start", 1);
  int total = 5; /* Four child mains plus this main. */
  for (int i = 0; i < 4; ++i) {
    wait_file(paths[i]);int fd = open(paths[i], O_RDONLY), count;
    assert(fd >= 0 && read(fd, &count, sizeof(count)) == sizeof(count) && close(fd) == 0);
    total += count;
  }
  assert(total == 64);
  pthread_t extra;
  assert(pthread_create(&extra, NULL, hold, NULL) == EAGAIN);
  publish("/tmp/quota-release", 1);
  for (int i = 0; i < 4; ++i) { int status;assert(dolly_waitpid(children[i], &status, 0) == children[i] && status == 0); }
  released = 1;
  assert(pthread_create(&extra, NULL, hold, NULL) == 0 && pthread_join(extra, NULL) == 0);
  puts("THREAD-QUOTA-OK 64 concurrent Workers, refusal, reclamation");
  return 0;
}
