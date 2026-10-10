/* SPDX-License-Identifier: MIT */
/* Where a GTK+ program of this Wine starts. GDK's Windows backend puts the thread's message queue into
 * GLib's main loop as a descriptor that only Windows' GLib can wait for; GLib here is the Unix one, so
 * the loop is given a poll function that knows it. */
#include <poll.h>
#include <glib.h>

extern int program_main (int argc, char **argv);

static gint
poll_messages (GPollFD *fds, guint count, gint timeout)
{
  DWORD start = GetTickCount ();
  guint i, queue = count;
  gint ready;

  for (i = 0; i < count; i++)
    if (fds[i].fd == G_WIN32_MSG_HANDLE)
      queue = i;
  if (queue == count)
    return poll ((struct pollfd *) fds, count, timeout);

  /* The queue wakes the thread; descriptors beside it (none in a program without helpers) are looked at
   * every 10 ms meanwhile. */
  fds[queue].fd = -1;
  for (;;)
    {
      DWORD waited = GetTickCount () - start;
      DWORD left = timeout < 0 ? INFINITE : waited < (DWORD) timeout ? timeout - waited : 0;

      ready = count > 1 ? poll ((struct pollfd *) fds, count, 0) : 0;
      fds[queue].revents = 0;
      if (MsgWaitForMultipleObjectsEx (0, NULL, ready ? 0 : count > 1 ? MIN (left, 10) : left,
                                       QS_ALLINPUT, MWMO_INPUTAVAILABLE) == WAIT_OBJECT_0)
        {
          fds[queue].revents = G_IO_IN;
          ready++;
        }
      if (ready || !left)
        break;
    }
  fds[queue].fd = G_WIN32_MSG_HANDLE;
  return ready;
}

int
main (int argc, char **argv)
{
  g_main_context_set_poll_func (NULL, poll_messages);
  return program_main (argc, argv);
}
