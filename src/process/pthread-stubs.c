/*
 * Dolly's version-0 process target is serialized, so Emscripten's upstream
 * non-threaded pthread implementation is the correct generic fallback.
 * Language runtimes such as CPython may provide a more useful serialized
 * implementation of part of that API.  Keep every definition in the generic
 * object weak so normal static-link ownership works exactly as it does for a
 * libc fallback: a runtime's strong definition wins without a special linker
 * flag or a package-specific exclusion list.
 */

#pragma weak __acquire_ptc
#pragma weak __inhibit_ptc
#pragma weak __lock
#pragma weak __private_cond_signal
#pragma weak __pthread_cond_timedwait
#pragma weak __pthread_create
#pragma weak __pthread_detach
#pragma weak __pthread_exit
#pragma weak __pthread_join
#pragma weak __pthread_key_create
#pragma weak __pthread_key_delete
#pragma weak __pthread_mutex_lock
#pragma weak __pthread_mutex_timedlock
#pragma weak __pthread_mutex_trylock
#pragma weak __pthread_mutex_unlock
#pragma weak __pthread_once
#pragma weak __pthread_testcancel
#pragma weak __release_ptc
#pragma weak __unlock
#pragma weak __wait
#pragma weak emscripten_current_thread_process_queued_calls
#pragma weak emscripten_futex_wait
#pragma weak emscripten_futex_wake
#pragma weak emscripten_has_threading_support
#pragma weak emscripten_is_main_runtime_thread
#pragma weak emscripten_main_thread_process_queued_calls
#pragma weak emscripten_num_logical_cores
#pragma weak emscripten_thread_sleep
#pragma weak pthread_atfork
#pragma weak pthread_barrier_destroy
#pragma weak pthread_barrier_init
#pragma weak pthread_barrier_wait
#pragma weak pthread_cancel
#pragma weak pthread_cond_broadcast
#pragma weak pthread_cond_destroy
#pragma weak pthread_cond_init
#pragma weak pthread_cond_signal
#pragma weak pthread_cond_timedwait
#pragma weak pthread_cond_wait
#pragma weak pthread_create
#pragma weak pthread_detach
#pragma weak pthread_equal
#pragma weak pthread_exit
#pragma weak pthread_getspecific
#pragma weak pthread_join
#pragma weak pthread_key_create
#pragma weak pthread_key_delete
#pragma weak pthread_kill
#pragma weak pthread_mutex_consistent
#pragma weak pthread_mutex_destroy
#pragma weak pthread_mutex_init
#pragma weak pthread_mutex_lock
#pragma weak pthread_mutex_timedlock
#pragma weak pthread_mutex_trylock
#pragma weak pthread_mutex_unlock
#pragma weak pthread_once
#pragma weak pthread_rwlock_destroy
#pragma weak pthread_rwlock_init
#pragma weak pthread_rwlock_rdlock
#pragma weak pthread_rwlock_timedrdlock
#pragma weak pthread_rwlock_timedwrlock
#pragma weak pthread_rwlock_tryrdlock
#pragma weak pthread_rwlock_trywrlock
#pragma weak pthread_rwlock_unlock
#pragma weak pthread_rwlock_wrlock
#pragma weak pthread_setcancelstate
#pragma weak pthread_setcanceltype
#pragma weak pthread_setspecific
#pragma weak pthread_testcancel
#pragma weak sem_post
#pragma weak sem_trywait
#pragma weak sem_wait
#pragma weak thrd_detach

#include "library_pthread_stub.c"
