# The rclone demo's upstream source pins, sourced by config/source-pins.sh.

# rclone, which keeps a folder in step with a WebDAV server through the HTTP broker (demos/rclone),
# built by the go package: the release's source and its modules as upstream vendors them.
DOLLY_RCLONE_VERSION=1.76.0
DOLLY_RCLONE_URL='https://github.com/rclone/rclone/releases/download/v1.76.0/rclone-v1.76.0.tar.gz'
DOLLY_RCLONE_SHA256=fa2b2e4ae56c4f1b91102285b736596e2a028be77cb2aaa5a0df53f3a7fc5902
DOLLY_RCLONE_VENDOR_URL='https://github.com/rclone/rclone/releases/download/v1.76.0/rclone-v1.76.0-vendor.tar.gz'
DOLLY_RCLONE_VENDOR_SHA256=7706e9d6b11971a096406a1e876db3946c73f11a64327a7457545443b13f4cc0
# Upstream's linux/amd64 release, the server the rclone test runs on this machine.
DOLLY_RCLONE_HOST_URL='https://github.com/rclone/rclone/releases/download/v1.76.0/rclone-v1.76.0-linux-amd64.zip'
DOLLY_RCLONE_HOST_SHA256=b00f00b3266c3764413afe599d3ec316f6f43b3e0ea8a0bc1d186d2133e46df7
