DOLLY 4
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM HOST /Dollyfile-ripgrep 53d4936993515b4c344ebb33cbb879d74e03966c9d6eaedd6bf155587c7e3886 /usr/bin/rg /usr/bin/rg
COPY FROM HOST /Dollyfile-ripgrep 53d4936993515b4c344ebb33cbb879d74e03966c9d6eaedd6bf155587c7e3886 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM HOST /Dollyfile-ripgrep 53d4936993515b4c344ebb33cbb879d74e03966c9d6eaedd6bf155587c7e3886 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM HOST /Dollyfile-fd-build 65092a90b93ffac7beb8701bf6f91a7ea861d78b0c7187c19b19c2a519c4e23a /usr/bin/fd /usr/bin/fd
COPY FROM HOST /Dollyfile-fd-build 65092a90b93ffac7beb8701bf6f91a7ea861d78b0c7187c19b19c2a519c4e23a /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM HOST /Dollyfile-fd-build 65092a90b93ffac7beb8701bf6f91a7ea861d78b0c7187c19b19c2a519c4e23a /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
