DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 3751efc7a6294162ef7640eb057b1c6f9e440597c00ea8e8011691752e78bebf /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 3751efc7a6294162ef7640eb057b1c6f9e440597c00ea8e8011691752e78bebf /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 3751efc7a6294162ef7640eb057b1c6f9e440597c00ea8e8011691752e78bebf /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build 81bcf0117c9dbd9da1d17255986cf12816a149c5d6a0b232efc41bccefc8d27b /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 81bcf0117c9dbd9da1d17255986cf12816a149c5d6a0b232efc41bccefc8d27b /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 81bcf0117c9dbd9da1d17255986cf12816a149c5d6a0b232efc41bccefc8d27b /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
