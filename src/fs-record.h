#ifndef DOLLY_FS_RECORD_H
#define DOLLY_FS_RECORD_H

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

// Shared path kinds for images, cached modules, and session deltas. Their
// versioned envelopes carry: kind:u32, path_bytes:u32, data_bytes:u64, path, data.
enum {
  DOLLY_FS_DIRECTORY = 1,
  DOLLY_FS_FILE = 2,
  DOLLY_FS_SYMLINK = 3,
  DOLLY_FS_DELETED = 4,
};

typedef struct {
  char *path;
  uint32_t kind;
  uintptr_t size;
  const unsigned char *data;
} dolly_fs_record;

static inline int dolly_fs_valid_path(const char *path) {
  const size_t length = strlen(path);
  if (length < 2 || length >= PATH_MAX || path[0] != '/' ||
      path[length - 1] == '/' ||
      strstr(path, "//") != NULL) return 0;
  for (const char *part = path + 1; *part != '\0';) {
    const char *slash = strchr(part, '/');
    const size_t size = slash == NULL ? strlen(part) : (size_t)(slash - part);
    if ((size == 1 && part[0] == '.') ||
        (size == 2 && part[0] == '.' && part[1] == '.')) return 0;
    if (slash == NULL) break;
    part = slash + 1;
  }
  return 1;
}

static inline int dolly_fs_metadata(const char *path, uint32_t *kind,
                                     uintptr_t *size) {
  struct stat metadata;
  if (lstat(path, &metadata) != 0) return -1;
  if (S_ISDIR(metadata.st_mode)) {
    *kind = DOLLY_FS_DIRECTORY; *size = 0;
  } else if (S_ISREG(metadata.st_mode) && metadata.st_size >= 0) {
    *kind = DOLLY_FS_FILE; *size = (uintptr_t)metadata.st_size;
  } else if (S_ISLNK(metadata.st_mode)) {
    char target[PATH_MAX];
    const ssize_t length = readlink(path, target, sizeof(target));
    if (length < 0) return -1;
    if (length == 0 || length >= (ssize_t)sizeof(target)) {
      errno = ENAMETOOLONG; return -1;
    }
    *kind = DOLLY_FS_SYMLINK; *size = (uintptr_t)length;
  } else {
    errno = ENOTSUP; return -1;
  }
  return 0;
}

static inline int dolly_fs_read_data(const dolly_fs_record *record,
                                      unsigned char *output) {
  if (record->kind == DOLLY_FS_DIRECTORY) return 0;
  if (record->kind == DOLLY_FS_SYMLINK) {
    const ssize_t length = readlink(record->path, (char *)output, record->size);
    if (length == (ssize_t)record->size) return 0;
    if (length >= 0) errno = EIO;
    return -1;
  }
  int descriptor = open(record->path, O_RDONLY);
  if (descriptor < 0) return -1;
  uintptr_t offset = 0;
  while (offset < record->size) {
    const ssize_t count = read(descriptor, output + offset, record->size - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) {
      const int error = count < 0 ? errno : EIO;
      close(descriptor); errno = error; return -1;
    }
    offset += (uintptr_t)count;
  }
  return close(descriptor);
}

static inline int dolly_fs_remove_tree(const char *path) {
  struct stat metadata;
  if (lstat(path, &metadata) != 0) return errno == ENOENT ? 0 : -1;
  if (!S_ISDIR(metadata.st_mode)) return unlink(path);
  DIR *directory = opendir(path);
  if (directory == NULL) return -1;
  int error = 0;
  for (;;) {
    errno = 0;
    struct dirent *entry = readdir(directory);
    if (entry == NULL) { error = errno; break; }
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
    char child[PATH_MAX];
    if (snprintf(child, sizeof(child), "%s/%s", path, entry->d_name) >= (int)sizeof(child)) {
      error = ENAMETOOLONG; break;
    }
    if (dolly_fs_remove_tree(child) != 0) { error = errno; break; }
  }
  if (closedir(directory) != 0 && error == 0) error = errno;
  if (error != 0) { errno = error; return -1; }
  return rmdir(path);
}

static inline int dolly_fs_parents(const char *path, int create) {
  char copy[PATH_MAX];
  strcpy(copy, path); // callers validate the complete record set first
  for (char *slash = copy + 1; *slash != '\0'; ++slash) {
    if (*slash != '/') continue;
    *slash = '\0';
    struct stat metadata;
    if (lstat(copy, &metadata) == 0) {
      if (!S_ISDIR(metadata.st_mode)) { errno = ENOTDIR; return -1; }
    } else if (!create || errno != ENOENT || mkdir(copy, 0755) != 0) return -1;
    *slash = '/';
  }
  return 0;
}

static inline int dolly_fs_validate_restore(const dolly_fs_record *records, size_t count,
                                             int allow_missing_parents) {
  // Validate all records and their final parent graph before changing anything.
  for (size_t index = 0; index < count; ++index) {
    const dolly_fs_record *record = &records[index];
    if (!dolly_fs_valid_path(record->path) ||
        (index != 0 && strcmp(records[index - 1].path, record->path) >= 0) ||
        record->kind < DOLLY_FS_DIRECTORY || record->kind > DOLLY_FS_DELETED ||
        ((record->kind == DOLLY_FS_DIRECTORY || record->kind == DOLLY_FS_DELETED) && record->size != 0) ||
        (record->kind == DOLLY_FS_SYMLINK &&
         (record->size == 0 || record->size >= PATH_MAX || memchr(record->data, 0, record->size) != NULL))) {
      errno = EINVAL; return -1;
    }
  }
  for (size_t index = 0; index < count; ++index) {
    if (records[index].kind == DOLLY_FS_DELETED) continue;
    char path[PATH_MAX];
    strcpy(path, records[index].path);
    for (char *slash = path + 1; *slash != '\0'; ++slash) {
      if (*slash != '/') continue;
      *slash = '\0';
      size_t low = 0, high = count;
      while (low < high) {
        const size_t middle = low + (high - low) / 2;
        if (strcmp(records[middle].path, path) < 0) low = middle + 1;
        else high = middle;
      }
      if (low < count && strcmp(records[low].path, path) == 0) {
        if (records[low].kind != DOLLY_FS_DIRECTORY) { errno = ENOTDIR; return -1; }
      } else {
        struct stat metadata;
        if (lstat(path, &metadata) == 0) {
          if (!S_ISDIR(metadata.st_mode)) { errno = ENOTDIR; return -1; }
        } else if (!allow_missing_parents || errno != ENOENT) return -1;
      }
      *slash = '/';
    }
  }
  return 0;
}

static inline int dolly_fs_restore(const dolly_fs_record *records, size_t count,
                                    int allow_missing_parents) {
  if (dolly_fs_validate_restore(records, count, allow_missing_parents) != 0) return -1;
  // Children first; do not follow old symlink ancestors during type changes.
  for (size_t index = count; index != 0; --index) {
    const dolly_fs_record *record = &records[index - 1];
    if (dolly_fs_parents(record->path, 0) != 0) continue;
    struct stat metadata;
    if (record->kind == DOLLY_FS_DIRECTORY &&
        lstat(record->path, &metadata) == 0 && S_ISDIR(metadata.st_mode)) continue;
    if (dolly_fs_remove_tree(record->path) != 0) return -1;
  }
  for (size_t index = 0; index < count; ++index) {
    const dolly_fs_record *record = &records[index];
    if (record->kind == DOLLY_FS_DELETED) continue;
    if (dolly_fs_parents(record->path, 1) != 0) return -1;
    if (record->kind == DOLLY_FS_DIRECTORY) {
      if (mkdir(record->path, 0755) != 0 && errno != EEXIST) return -1;
    } else if (record->kind == DOLLY_FS_SYMLINK) {
      char target[PATH_MAX];
      memcpy(target, record->data, record->size); target[record->size] = '\0';
      if (symlink(target, record->path) != 0) return -1;
    } else {
      // Modes are compatibility metadata, not an execution permission model.
      int descriptor = open(record->path, O_WRONLY | O_CREAT | O_TRUNC, 0777);
      if (descriptor < 0) return -1;
      uintptr_t offset = 0;
      while (offset < record->size) {
        const ssize_t size = write(descriptor, record->data + offset, record->size - offset);
        if (size < 0 && errno == EINTR) continue;
        if (size <= 0) {
          const int error = size < 0 ? errno : EIO;
          close(descriptor); errno = error; return -1;
        }
        offset += (uintptr_t)size;
      }
      if (close(descriptor) != 0) return -1;
    }
  }
  return 0;
}

#endif
