DOLLY 4
MODULE session-recovery

REQUIRES HEADER libc
REQUIRES TOOL cc
REQUIRES TOOL rm

SOURCE HOST /static/session-recovery/session-recover.c /tmp/session-recovery/session-recover.c a7aab830678897e4766a5c873308caf7eb5e95f74a03c0b696e13d7afe1b14c4
SOURCE HOST /static/session-recovery/session-records.h /tmp/session-recovery/session-records.h 292acf93331576388471b273f690515871f3a76833a7ad1c6545945292e613d1
SOURCE HOST /static/session-recovery/fs-record.h /tmp/session-recovery/fs-record.h 90306f4adb1484187a99784ed6a736aa3b7c4058e81d527d73314d8121dea96a

SLOP cc -O1 -I/tmp/session-recovery /tmp/session-recovery/session-recover.c -o /usr/bin/session-recover
EXPORTS TOOL session-recover
SLOP rm -rf /tmp/session-recovery
