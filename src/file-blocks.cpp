// Dolly's root filesystem is WasmFS's memory filesystem with each file's bytes
// in blocks. WasmFS keeps a file in one std::vector: growing it copies the file
// into a buffer twice its size, and an allocation failure aborts the kernel.
// Here growth allocates only the new blocks, and growth that memory cannot
// hold fails with ENOSPC.
#include <algorithm>
#include <cerrno>
#include <cstdlib>
#include <cstring>

#include "memory_backend.h"
#include "wasmfs.h"

namespace {

using namespace wasmfs;

constexpr size_t kBlockSize = size_t{1} << 20;
// File bytes never take the kernel's last memory: starting a command reads its
// executable into kernel memory, and the compiler is 78 MB.
constexpr size_t kKernelReserve = size_t{128} << 20;

void *reallocateLeavingReserve(void *bytes, size_t size) {
  void *reserve = malloc(kKernelReserve);
  if (reserve == nullptr) return nullptr;
  void *resized = realloc(bytes, size);
  free(reserve);
  return resized;
}

class BlockFile : public DataFile {
  // Every block but the last holds kBlockSize bytes; the last grows by doubling.
  uint8_t **blocks = nullptr;
  size_t blockCount = 0, lastCapacity = 0, size = 0;

  size_t capacity() const {
    return blockCount == 0 ? 0 : (blockCount - 1) * kBlockSize + lastCapacity;
  }

  // Calls visit(bytes, length) on each block's part of [offset, offset + length).
  template <typename Visit> void visitRange(size_t offset, size_t length, Visit visit) {
    while (length != 0) {
      const size_t within = offset % kBlockSize;
      const size_t count = std::min(length, kBlockSize - within);
      visit(blocks[offset / kBlockSize] + within, count);
      offset += count;
      length -= count;
    }
  }

  bool reserve(size_t wanted) {
    while (capacity() < wanted) {
      if (blockCount == 0 || lastCapacity == kBlockSize) {
        auto table = static_cast<uint8_t **>(realloc(blocks, (blockCount + 1) * sizeof(*blocks)));
        if (table == nullptr) return false;
        blocks = table;
        blocks[blockCount++] = nullptr;
        lastCapacity = 0;
      }
      const size_t start = (blockCount - 1) * kBlockSize;
      const size_t grown = std::min(kBlockSize, std::max(wanted - start, 2 * lastCapacity));
      void *block = reallocateLeavingReserve(blocks[blockCount - 1], grown);
      if (block == nullptr) return false;
      blocks[blockCount - 1] = static_cast<uint8_t *>(block);
      lastCapacity = grown;
    }
    return true;
  }

  // Frees the blocks past the first `kept` bytes, including any a failed
  // reserve added.
  void release(size_t kept) {
    const size_t keptBlocks = (kept + kBlockSize - 1) / kBlockSize;
    if (blockCount > keptBlocks) lastCapacity = kBlockSize;
    while (blockCount > keptBlocks) free(blocks[--blockCount]);
    if (blockCount == 0) {
      free(blocks);
      blocks = nullptr;
      lastCapacity = 0;
    }
  }

  // Extends the file to `end` with [size, zeroedEnd) zeroed, or fails with ENOSPC.
  int grow(size_t end, size_t zeroedEnd) {
    if (!reserve(end)) {
      release(size);
      return -ENOSPC;
    }
    visitRange(size, zeroedEnd - size, [](uint8_t *bytes, size_t length) {
      memset(bytes, 0, length);
    });
    size = end;
    return 0;
  }

  int open(oflags_t) override { return 0; }
  int close() override { return 0; }
  int flush() override { return 0; }
  off_t getSize() override { return size; }

  int setSize(off_t newSize) override {
    if (size_t(newSize) > size) return grow(newSize, newSize);
    release(newSize);
    size = newSize;
    return 0;
  }

  ssize_t write(const uint8_t *buf, size_t len, off_t offset) override {
    const size_t end = offset + len;
    if (end > size) {
      if (int error = grow(end, std::max(size, size_t(offset)))) return error;
    }
    visitRange(offset, len, [&](uint8_t *bytes, size_t length) {
      memcpy(bytes, buf, length);
      buf += length;
    });
    return len;
  }

  ssize_t read(uint8_t *buf, size_t len, off_t offset) override {
    if (size_t(offset) >= size) return 0;
    len = std::min(len, size - size_t(offset));
    visitRange(offset, len, [&](uint8_t *bytes, size_t length) {
      memcpy(buf, bytes, length);
      buf += length;
    });
    return len;
  }

public:
  BlockFile(mode_t mode, backend_t backend) : DataFile(mode, backend) {}
  ~BlockFile() override { release(0); }
};

class BlockBackend : public Backend {
  // WasmFS's memory backend only populates the root with /dev and /tmp.
  backend_t memory = createMemoryBackend();

public:
  std::shared_ptr<DataFile> createFile(mode_t mode) override {
    return std::make_shared<BlockFile>(mode, this);
  }
  std::shared_ptr<Directory> createDirectory(mode_t mode) override {
    return std::make_shared<MemoryDirectory>(mode, this);
  }
  std::shared_ptr<Symlink> createSymlink(std::string target) override {
    return std::make_shared<MemorySymlink>(target, this);
  }
  void populateRoot(Directory::Handle &root) override { memory->populateRoot(root); }
};

} // namespace

// Replaces WasmFS's weak default root, its memory backend.
extern "C" backend_t wasmfs_create_root_dir(void) {
  return wasmFS.addBackend(std::make_unique<BlockBackend>());
}
