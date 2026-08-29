#include "platform_api_vmcore.h"

int
bh_platform_init(void)
{
    return 0;
}

void
bh_platform_destroy(void)
{}

void *
os_malloc(unsigned size)
{
    return malloc(size);
}

void *
os_realloc(void *ptr, unsigned size)
{
    return realloc(ptr, size);
}

void
os_free(void *ptr)
{
    free(ptr);
}

int
os_printf(const char *format, ...)
{
    va_list ap;
    va_start(ap, format);
    int result = vprintf(format, ap);
    va_end(ap);
    return result;
}

int
os_vprintf(const char *format, va_list ap)
{
    return vprintf(format, ap);
}

uint64
os_time_get_boot_us(void)
{
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (uint64)tv.tv_sec * 1000000 + (uint64)tv.tv_usec;
}

uint64
os_time_thread_cputime_us(void)
{
    return os_time_get_boot_us();
}

korp_tid
os_self_thread(void)
{
    return 1;
}

uint8 *
os_thread_get_stack_boundary(void)
{
    return NULL;
}

void
os_thread_jit_write_protect_np(bool enabled)
{
    (void)enabled;
}

int
os_mutex_init(korp_mutex *mutex)
{
    *mutex = 0;
    return 0;
}

int
os_mutex_destroy(korp_mutex *mutex)
{
    (void)mutex;
    return 0;
}

int
os_mutex_lock(korp_mutex *mutex)
{
    (void)mutex;
    return 0;
}

int
os_mutex_unlock(korp_mutex *mutex)
{
    (void)mutex;
    return 0;
}

void *
os_mmap(void *hint, size_t size, int prot, int flags, os_file_handle file)
{
    (void)hint;
    (void)prot;
    (void)flags;
    (void)file;
    return malloc(size);
}

void
os_munmap(void *addr, size_t size)
{
    (void)size;
    free(addr);
}

int
os_mprotect(void *addr, size_t size, int prot)
{
    (void)addr;
    (void)size;
    (void)prot;
    return 0;
}

void *
os_mremap(void *old_addr, size_t old_size, size_t new_size)
{
    (void)old_size;
    return realloc(old_addr, new_size);
}

void
os_dcache_flush(void)
{}

void
os_icache_flush(void *start, size_t len)
{
    (void)start;
    (void)len;
}
