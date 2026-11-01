# Sourced by scripts/prepare-image-sources.sh.
if has_image ffmpeg; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh ffmpeg)" ffmpeg/ffmpeg-9.0.2.tar.gz
fi
