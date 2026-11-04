// What Emscripten's emscripten_libc_stubs.o and emscripten_syscall_stubs.o
// defined, which the process sysroot leaves out (scripts/prepare-process-sysroot.sh):
// the same answers where they are true for Dolly, honest ones where they claimed
// what did not happen. execve, fork, vfork, posix_spawn, popen, pclose and flock,
// and the system calls of process ids, priorities, waits, limits, madvise and
// mprotect are Dolly's own elsewhere; getdate is musl's (scripts/build.sh).
#define _GNU_SOURCE
#include <errno.h>
#include <grp.h>
#include <pwd.h>
#include <signal.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include <sys/times.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

// The process's times as getrusage reports them, in clock ticks.
clock_t times(struct tms *buffer) {
  struct timespec now, used;
  if (clock_gettime(CLOCK_MONOTONIC, &now) != 0 ||
      clock_gettime(CLOCK_PROCESS_CPUTIME_ID, &used) != 0) return (clock_t)-1;
  const long ticks = sysconf(_SC_CLK_TCK);
  if (buffer != NULL)
    *buffer = (struct tms){.tms_utime = used.tv_sec * ticks + used.tv_nsec / (1000000000 / ticks)};
  return now.tv_sec * ticks + now.tv_nsec / (1000000000 / ticks);
}

// waitpid's answer for a child, or any (P_ALL), that exits. No child stops or
// continues, and a child cannot be looked at and left waitable (WNOWAIT).
int waitid(idtype_t type, id_t id, siginfo_t *information, int options) {
  if (information == NULL || !(type == P_ALL || (type == P_PID && id > 0 && id <= INT32_MAX)) ||
      !(options & WEXITED) || (options & ~(WEXITED | WSTOPPED | WCONTINUED | WNOHANG))) {
    errno = EINVAL;
    return -1;
  }
  int status;
  const pid_t pid = waitpid(type == P_PID ? (pid_t)id : -1, &status, options & WNOHANG);
  if (pid < 0) return -1;
  memset(information, 0, sizeof(*information));
  if (pid == 0) return 0;
  information->si_signo = SIGCHLD;
  information->si_pid = pid;
  information->si_code = WIFSIGNALED(status) ? CLD_KILLED : CLD_EXITED;
  information->si_status = WIFSIGNALED(status) ? WTERMSIG(status) : WEXITSTATUS(status);
  return 0;
}

// The clock is the browser's: nothing in Dolly sets it.
int stime(const time_t *time) {
  (void)time;
  errno = EPERM;
  return -1;
}

int clock_getcpuclockid(pid_t pid, clockid_t *clock) {
  if (pid < 0) return ESRCH;
  if (pid != 0 && pid != getpid()) return ENOSYS;
  if (clock != NULL) *clock = CLOCK_PROCESS_CPUTIME_ID;
  return 0;
}

// Dolly has one user, id 0, and no user or group database: a lookup finds
// nothing, and a walk of the database ends at once.
struct passwd *getpwnam(const char *name) {
  (void)name;
  errno = ENOENT;
  return NULL;
}

struct passwd *getpwuid(uid_t uid) {
  (void)uid;
  errno = ENOENT;
  return NULL;
}

int getpwnam_r(const char *name, struct passwd *entry, char *buffer, size_t size, struct passwd **result) {
  (void)name; (void)entry; (void)buffer; (void)size;
  *result = NULL;
  return ENOENT;
}

int getpwuid_r(uid_t uid, struct passwd *entry, char *buffer, size_t size, struct passwd **result) {
  (void)uid; (void)entry; (void)buffer; (void)size;
  *result = NULL;
  return ENOENT;
}

void setpwent(void) {}
void endpwent(void) {}
struct passwd *getpwent(void) { return NULL; }

struct group *getgrnam(const char *name) {
  (void)name;
  errno = ENOENT;
  return NULL;
}

struct group *getgrgid(gid_t gid) {
  (void)gid;
  errno = ENOENT;
  return NULL;
}

int getgrnam_r(const char *name, struct group *entry, char *buffer, size_t size, struct group **result) {
  (void)name; (void)entry; (void)buffer; (void)size;
  *result = NULL;
  return ENOENT;
}

int getgrgid_r(gid_t gid, struct group *entry, char *buffer, size_t size, struct group **result) {
  (void)gid; (void)entry; (void)buffer; (void)size;
  *result = NULL;
  return ENOENT;
}

void setgrent(void) {}
void endgrent(void) {}
struct group *getgrent(void) { return NULL; }

// The one user holds no privilege to change its root or groups.
int chroot(const char *path) {
  (void)path;
  errno = EPERM;
  return -1;
}

int setgroups(size_t count, const gid_t *groups) {
  (void)groups;
  errno = count > (size_t)sysconf(_SC_NGROUPS_MAX) ? EINVAL : EPERM;
  return -1;
}

// Handlers run on the stack of the call they interrupt (docs/process-model.md).
int sigaltstack(const stack_t *restrict stack, stack_t *restrict previous) {
  (void)stack; (void)previous;
  errno = ENOSYS;
  return -1;
}

// No load average is kept.
int getloadavg(double averages[], int count) {
  (void)averages; (void)count;
  return -1;
}

// dlopen and dlsym of code that cc did not map to the dso@0 client's names.
void __dl_seterr(const char *, ...);

void *__dlsym(void *restrict handle, const char *restrict name, void *restrict caller) {
  (void)handle; (void)name; (void)caller;
  __dl_seterr("dynamic loading needs a program linked with -rdynamic and host module dso@0");
  return NULL;
}

void *dlopen(const char *path, int flags) {
  (void)path; (void)flags;
  __dl_seterr("dynamic loading needs a program linked with -rdynamic and host module dso@0");
  return NULL;
}

// Nothing waits to be written: the filesystem is kernel memory.
int __syscall_sync(void) { return 0; }

// The one user's ids are 0, and its one group is 0.
int __syscall_getgroups32(int count, gid_t list[]) {
  if (count < 0) return -EINVAL;
  if (count > 0) list[0] = 0;
  return 1;
}

int __syscall_getresuid32(uid_t *real, uid_t *effective, uid_t *saved) {
  *real = *effective = *saved = 0;
  return 0;
}

int __syscall_getresgid32(gid_t *real, gid_t *effective, gid_t *saved) {
  *real = *effective = *saved = 0;
  return 0;
}

// No page of a process's memory is ever written out: locked is how it always is.
int __syscall_mlock(const void *address, size_t length) {
  (void)address; (void)length;
  return 0;
}

int __syscall_munlock(const void *address, size_t length) {
  (void)address; (void)length;
  return 0;
}

int __syscall_mlockall(int flags) {
  (void)flags;
  return 0;
}

int __syscall_munlockall(void) { return 0; }

// A mapping neither moves nor grows: realloc copies.
int __syscall_mremap(void *address, size_t size, size_t new_size, int flags, void *new_address) {
  (void)address; (void)size; (void)new_size; (void)flags; (void)new_address;
  return -ENOMEM;
}

// No process accounting is kept, and no page is ever out of memory to report.
int __syscall_acct(const char *path) {
  (void)path;
  return -ENOSYS;
}

int __syscall_mincore(void *address, size_t length, unsigned char *residency) {
  (void)address; (void)length; (void)residency;
  return -ENOSYS;
}

// The one user holds no privilege to name the domain.
int __syscall_setdomainname(const char *name, size_t length) {
  (void)name; (void)length;
  return -EPERM;
}
