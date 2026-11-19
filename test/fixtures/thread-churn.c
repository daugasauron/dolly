// Threads started and ended in turn: ROUNDS times two threads, each joined.
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>

static void *run(void *argument) { return argument; }

int main(int argc, char **argv) {
  int rounds = argc > 1 ? atoi(argv[1]) : 100;
  for (int round = 0; round < rounds; round++) {
    pthread_t threads[2];
    for (int i = 0; i < 2; i++)
      if (pthread_create(&threads[i], NULL, run, NULL)) { perror("pthread_create"); return 1; }
    for (int i = 0; i < 2; i++) pthread_join(threads[i], NULL);
  }
  printf("%d threads started and ended\n", 2 * rounds);
  return 0;
}
