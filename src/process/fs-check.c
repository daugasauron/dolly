#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#include <dolly/process.h>

static unsigned char large_payload[DOLLY_PROCESS_PACKET_LIMIT + 257];
static unsigned char large_buffer[DOLLY_PROCESS_PACKET_LIMIT + 257];

static void initialize_large_payload(void) {
  for (size_t index = 0; index < sizeof(large_payload); ++index) {
    large_payload[index] = (unsigned char)(index * 37u + 11u);
  }
}

static int write_file(void) {
  static const char payload[] = "shared-kernel-filesystem";
  if (mkdir("/tmp/process-check", 0777) != 0 && errno != EEXIST) return 10;
  if (chdir("/tmp/process-check") != 0) return 11;
  int descriptor = open("first.txt", O_CREAT | O_TRUNC | O_RDWR, 0666);
  if (descriptor < 0) return 12;
  if (write(descriptor, payload, sizeof(payload)) != (ssize_t)sizeof(payload)) return 13;
  struct stat metadata;
  if (fstat(descriptor, &metadata) != 0 || metadata.st_size != sizeof(payload)) return 16;
  if (close(descriptor) != 0) return 17;
  if (rename("first.txt", "second.txt") != 0) return 18;
  if (stat("second.txt", &metadata) != 0 || metadata.st_size != sizeof(payload)) return 19;
  descriptor = open("truncate.txt", O_CREAT | O_TRUNC | O_WRONLY, 0666);
  if (descriptor < 0 || write(descriptor, "12345678", 8) != 8 ||
      close(descriptor) != 0 || truncate("truncate.txt", 3) != 0 ||
      stat("truncate.txt", &metadata) != 0 || metadata.st_size != 3 ||
      unlink("truncate.txt") != 0) return 37;
  initialize_large_payload();
  descriptor = open("large.bin", O_CREAT | O_TRUNC | O_WRONLY, 0666);
  if (descriptor < 0 ||
      write(descriptor, large_payload, sizeof(large_payload)) !=
          (ssize_t)sizeof(large_payload) ||
      close(descriptor) != 0) return 34;
  if (symlink("second.txt", "symbolic.txt") != 0) return 26;
  char target[32] = {0};
  const ssize_t target_size = readlink("symbolic.txt", target, sizeof(target));
  if (target_size != 10 || memcmp(target, "second.txt", 10) != 0) return 27;
  return 0;
}

static int read_file(void) {
  static const char payload[] = "shared-kernel-filesystem";
  initialize_large_payload();
  char buffer[sizeof(payload)] = {0};
  int descriptor = open("/tmp/process-check/second.txt", O_RDONLY);
  if (descriptor < 0) return 20;
  if (ioctl(descriptor, FIOCLEX, NULL) != 0) return 29;
  void *mapping = mmap(NULL, sizeof(payload), PROT_READ,
                       MAP_PRIVATE, descriptor, 0);
  if (mapping == MAP_FAILED || memcmp(mapping, payload, sizeof(payload)) != 0 ||
      madvise(mapping, sizeof(payload), MADV_SEQUENTIAL) != 0 ||
      munmap(mapping, sizeof(payload)) != 0) return 30;
  if (lseek(descriptor, 0, SEEK_SET) != 0) return 21;
  if (read(descriptor, buffer, sizeof(buffer)) != (ssize_t)sizeof(buffer)) return 22;
  if (close(descriptor) != 0 || strcmp(buffer, payload) != 0) return 23;
  descriptor = open("/tmp/process-check/symbolic.txt", O_RDONLY);
  if (descriptor < 0 || read(descriptor, buffer, sizeof(buffer)) != (ssize_t)sizeof(buffer) ||
      close(descriptor) != 0 || strcmp(buffer, payload) != 0) return 28;
  descriptor = open("/tmp/process-check/large.bin", O_RDONLY);
  if (descriptor < 0) return 35;
  size_t total = 0;
  while (total != sizeof(large_buffer)) {
    const ssize_t current = read(
        descriptor, large_buffer + total, sizeof(large_buffer) - total);
    if (current <= 0 || (size_t)current > DOLLY_PROCESS_PACKET_LIMIT) return 36;
    total += (size_t)current;
  }
  if (close(descriptor) != 0 ||
      memcmp(large_buffer, large_payload, sizeof(large_payload)) != 0) return 36;
  descriptor = open("/tmp/process-check/second.txt", O_RDWR);
  if (descriptor < 0) return 31;
  mapping = mmap(NULL, sizeof(payload), PROT_READ | PROT_WRITE,
                 MAP_SHARED, descriptor, 0);
  if (mapping == MAP_FAILED) return 32;
  ((char *)mapping)[0] = 'S';
  if (msync(mapping, sizeof(payload), MS_SYNC) != 0 ||
      munmap(mapping, sizeof(payload)) != 0 ||
      pread(descriptor, buffer, sizeof(buffer), 0) != (ssize_t)sizeof(buffer) ||
      buffer[0] != 'S' || close(descriptor) != 0) return 33;
  if (unlink("/tmp/process-check/second.txt") != 0 ||
      unlink("/tmp/process-check/large.bin") != 0 ||
      unlink("/tmp/process-check/symbolic.txt") != 0 ||
      rmdir("/tmp/process-check") != 0) return 24;
  puts("PROCESS-FILESYSTEM-OK");
  return 0;
}

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  if (strcmp(argv[1], "write") == 0) return write_file();
  if (strcmp(argv[1], "read") == 0) return read_file();
  return 2;
}
