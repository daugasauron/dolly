#include <assert.h>
#include <errno.h>
#include <netdb.h>
#include <netinet/in.h>
#include <pthread.h>
#include <semaphore.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

static int increment(int value) { return value + 1; }

int dolly_process_dso_data = 41;
int *dolly_process_dso_data_address(void) { return &dolly_process_dso_data; }

static const char library_name[] = "dolly-process-dso";

static const struct {
  const char *name;
  int (*transform)(int);
} library = {
    .name = library_name,
    .transform = increment,
};

int dolly_process_dso_answer(int value) {
  assert(value >= 0);
  assert(time(NULL) > 0);
  assert(getprotobyname("tcp") == NULL && errno == ENOSYS);
  assert(getprotobynumber(6) == NULL && errno == ENOSYS);
  freeaddrinfo(NULL);
  /* The owner's libc serves a library's socket calls too. */
  int ends[2];
  assert(socket(AF_INET, SOCK_STREAM, 0) == -1 && errno == EAFNOSUPPORT);
  assert(socketpair(AF_UNIX, SOCK_STREAM, 0, ends) == 0 && close(ends[0]) == 0 && close(ends[1]) == 0);
  assert(in6addr_any.s6_addr[0] == 0 && in6addr_any.s6_addr[15] == 0);
  pthread_condattr_t attribute;
  assert(pthread_condattr_init(&attribute) == ENOSYS);
  sem_t semaphore;
  assert(sem_init(&semaphore, 0, 0) == -1 && errno == ENOSYS);
  return strcmp(library.name, "dolly-process-dso") == 0
             ? library.transform(value)
             : -1;
}

__attribute__((export_name("\uFEFFdolly_process_dso_answer")))
int dolly_process_dso_literal_answer(int value) {
  return value + 2;
}

void dolly_process_dso_exit(int status) {
  exit(status);
}
