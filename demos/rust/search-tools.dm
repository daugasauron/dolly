DOLLY 4
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM HOST /Dollyfile-ripgrep 690f856d5992b7ddfc0759a0e1f36740483c4032753cd1ad84af9b094bf8a509 /usr/bin/rg /usr/bin/rg
COPY FROM HOST /Dollyfile-ripgrep 690f856d5992b7ddfc0759a0e1f36740483c4032753cd1ad84af9b094bf8a509 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM HOST /Dollyfile-ripgrep 690f856d5992b7ddfc0759a0e1f36740483c4032753cd1ad84af9b094bf8a509 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM HOST /Dollyfile-fd-build be15e272f613c8650220ca2b2a579f47eb7f6777da8d053e555a3e93771d495a /usr/bin/fd /usr/bin/fd
COPY FROM HOST /Dollyfile-fd-build be15e272f613c8650220ca2b2a579f47eb7f6777da8d053e555a3e93771d495a /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM HOST /Dollyfile-fd-build be15e272f613c8650220ca2b2a579f47eb7f6777da8d053e555a3e93771d495a /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
