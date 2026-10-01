DOLLY 4
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM HOST /Dollyfile-ripgrep 525d97a2fdd854c7eadba27d2a62be3163d37473a3fcb789071544ca10ac564c /usr/bin/rg /usr/bin/rg
COPY FROM HOST /Dollyfile-ripgrep 525d97a2fdd854c7eadba27d2a62be3163d37473a3fcb789071544ca10ac564c /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM HOST /Dollyfile-ripgrep 525d97a2fdd854c7eadba27d2a62be3163d37473a3fcb789071544ca10ac564c /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM HOST /Dollyfile-fd-build 40d99873792e4469bdc1cea5c70ce1f76ab16eaa7aa90b0f96336d228e8db92e /usr/bin/fd /usr/bin/fd
COPY FROM HOST /Dollyfile-fd-build 40d99873792e4469bdc1cea5c70ce1f76ab16eaa7aa90b0f96336d228e8db92e /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM HOST /Dollyfile-fd-build 40d99873792e4469bdc1cea5c70ce1f76ab16eaa7aa90b0f96336d228e8db92e /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
