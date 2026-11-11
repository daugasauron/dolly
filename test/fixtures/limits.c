#include <fcntl.h>
#include <sys/resource.h>
#include <time.h>
int main(void) {
  struct rlimit limit;
  if (getrlimit(RLIMIT_NOFILE, &limit)) return 1;
  rlim_t descriptors = 3;
  while (open("/dev/null", O_RDONLY) >= 0) descriptors++;
  if (descriptors != limit.rlim_cur) return 2;
  volatile unsigned long sum = 0;
  for (unsigned long index = 0; index < 20000000; index++) sum += index;
  const clock_t used = clock();
  return used == (clock_t)-1 || used <= 0 ? 3 : 0;
}
