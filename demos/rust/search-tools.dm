DOLLY 4
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM HOST /Dollyfile-ripgrep f8101811e7cdb2e539f74efe1711091973ec54ca637a506aa216390836764250 /usr/bin/rg /usr/bin/rg
COPY FROM HOST /Dollyfile-ripgrep f8101811e7cdb2e539f74efe1711091973ec54ca637a506aa216390836764250 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM HOST /Dollyfile-ripgrep f8101811e7cdb2e539f74efe1711091973ec54ca637a506aa216390836764250 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM HOST /Dollyfile-fd-build aadff6b8032e782052f595341816b723d4f1ab53fd2a39385e107051d3fa1fe2 /usr/bin/fd /usr/bin/fd
COPY FROM HOST /Dollyfile-fd-build aadff6b8032e782052f595341816b723d4f1ab53fd2a39385e107051d3fa1fe2 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM HOST /Dollyfile-fd-build aadff6b8032e782052f595341816b723d4f1ab53fd2a39385e107051d3fa1fe2 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
