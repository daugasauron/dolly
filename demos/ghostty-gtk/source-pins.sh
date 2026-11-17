# The ghostty-gtk demo's upstream source pins, sourced by config/source-pins.sh.

DOLLY_MESA_VERSION=26.2.5
DOLLY_MESA_URL='https://archive.mesa3d.org/mesa-26.2.5.tar.xz'
DOLLY_MESA_SHA256=794b3d1729075dae7ebd47c7283b7ca0cdb5dec668f7f11cc0a5d82f6138a0a5

# Ghostty's GTK application (demos/ghostty-gtk): Ghostty's signed 1.4.0
# release tarball, the application's newest release (PACKAGING.md; minisign key
# RWQlAjJC23149WL2sEpT/l0QKy7hMIFhYdQOFy0Z7z7PbneUgvlsnYcV), Mesa's Python
# modules, libadwaita, and the host's Zig, which fetches Ghostty's packages.
DOLLY_GHOSTTY_RELEASE_URL='https://release.files.ghostty.org/1.4.0/ghostty-1.4.0.tar.gz'
DOLLY_GHOSTTY_RELEASE_SHA256=cb188ac6c3a8278d5fd7bfef15d8c017104c87f638b5560eb38024a71ae0f005
DOLLY_MAKO_URL='https://files.pythonhosted.org/packages/6d/a0/053d6af3e8f871e0073b4a36732d9e65be77a72e5434c31b94f6af78a6bb/mako-1.4.3-py3-none-any.whl'
DOLLY_MAKO_SHA256=723296007c870bfd6b3f0c3230dba7198096e5269297ebf5e4eff9e7ffa39d4f
DOLLY_PYYAML_URL='https://files.pythonhosted.org/packages/05/8e/961c0007c59b8dd7729d542c61a4d537767a59645b82a0b521206e1e25c2/pyyaml-6.0.3.tar.gz'
DOLLY_PYYAML_SHA256=d76623373421df22fb4cf8817020cbb7ef15c725b9d5e45f17e189bfc384190f
DOLLY_LIBADWAITA_VERSION=1.10.0
DOLLY_LIBADWAITA_URL='https://download.gnome.org/sources/libadwaita/1.10/libadwaita-1.10.0.tar.xz'
DOLLY_LIBADWAITA_SHA256=b1bf56239269d101a6391ad4553c910eff9cc6170b803916405477ef60a66c84
DOLLY_ZIG_HOST_URL='https://ziglang.org/download/0.17.0/zig-x86_64-linux-0.17.0.tar.xz'
DOLLY_ZIG_HOST_SHA256=1cbe9df9f27e6b78d14ccbca43b6703a404ef79ef1c463de901d7f088d4e2026
