DOLLY 5
MODULE session-recovery

REQUIRES HEADER libc
REQUIRES TOOL cc
REQUIRES TOOL rm

SOURCE https://daugasauron.com/dist/static/session-recovery/session-recover.c a7aab830678897e4766a5c873308caf7eb5e95f74a03c0b696e13d7afe1b14c4 /tmp/session-recovery/session-recover.c
SOURCE https://daugasauron.com/dist/static/session-recovery/session-records.h 292acf93331576388471b273f690515871f3a76833a7ad1c6545945292e613d1 /tmp/session-recovery/session-records.h
SOURCE https://daugasauron.com/dist/static/session-recovery/fs-record.h 91759544780d32295db84bccbfbf33c943404e9eb6854c1dcd3c036c66d6cfa2 /tmp/session-recovery/fs-record.h

SLOP cc -O1 -I/tmp/session-recovery /tmp/session-recovery/session-recover.c -o /usr/bin/session-recover
EXPORTS TOOL session-recover
SLOP rm -rf /tmp/session-recovery
