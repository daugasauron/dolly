import os
import shutil
import sys

root = sys.argv[1]
path = os.path.join(root, "shutil-file")
open(path, "w").close()

# One user: chown checks that the path exists and changes nothing.
shutil.chown(path, user=0, group=0)
shutil.chown(path, user=0, follow_symlinks=False)
try:
    shutil.chown(path + "-missing", user=0)
    raise AssertionError("chown accepted a missing path")
except FileNotFoundError:
    pass

# Capacity is kernel memory: a file uses it until it is removed.
size = 64 << 20
before = shutil.disk_usage(root)
with open(path, "wb") as file:
    file.write(bytes(size))
written = shutil.disk_usage(root)
os.unlink(path)
removed = shutil.disk_usage(root)
assert before.total == written.total == removed.total, (before, written, removed)
assert written.used - before.used >= size, (before, written)
assert removed.free - written.free >= size, (written, removed)
print("PYTHON-SHUTIL-OK")
