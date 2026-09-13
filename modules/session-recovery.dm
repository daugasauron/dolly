DOLLY 3
MODULE session-recovery

REQUIRES HEADER libc
REQUIRES TOOL cc
REQUIRES TOOL rm

SOURCE HOST /static/session-recovery/session-recover.c /tmp/session-recovery/session-recover.c a7aab830678897e4766a5c873308caf7eb5e95f74a03c0b696e13d7afe1b14c4
SOURCE HOST /static/session-recovery/session-records.h /tmp/session-recovery/session-records.h 5339885ea73a23f509eef28c62360016e451d10a482911b1a10ab8f5a04e5ea5
SOURCE HOST /static/session-recovery/fs-record.h /tmp/session-recovery/fs-record.h 653bb0d53d0f1c4e6e3fa8de25aed2402f200251cea188cdc3ae9afed3e62dbc

SLOP cc -O1 -I/tmp/session-recovery /tmp/session-recovery/session-recover.c -o /usr/bin/session-recover
EXPORTS TOOL session-recover
SLOP rm -rf /tmp/session-recovery
