DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 30d5a0e528ef89ea18e45f8e833dcf58b77b4173534cf572a8f942481ca5896b /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 30d5a0e528ef89ea18e45f8e833dcf58b77b4173534cf572a8f942481ca5896b /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 30d5a0e528ef89ea18e45f8e833dcf58b77b4173534cf572a8f942481ca5896b /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build 6b133f38d8e728d015d97fe12c65b884554641a623aed2e4f06a6514ad3b37d1 /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 6b133f38d8e728d015d97fe12c65b884554641a623aed2e4f06a6514ad3b37d1 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 6b133f38d8e728d015d97fe12c65b884554641a623aed2e4f06a6514ad3b37d1 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
