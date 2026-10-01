DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 8cb78ab9f69ce57fa1be025a416e7f73cc54b04185d3af687ec21151b122ee1e /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 8cb78ab9f69ce57fa1be025a416e7f73cc54b04185d3af687ec21151b122ee1e /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 8cb78ab9f69ce57fa1be025a416e7f73cc54b04185d3af687ec21151b122ee1e /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build 9abd50d28bdfd74c7c7beb3ec62f10caa55843d6132f2c018ad5e0dfa3573bc6 /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 9abd50d28bdfd74c7c7beb3ec62f10caa55843d6132f2c018ad5e0dfa3573bc6 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 9abd50d28bdfd74c7c7beb3ec62f10caa55843d6132f2c018ad5e0dfa3573bc6 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
