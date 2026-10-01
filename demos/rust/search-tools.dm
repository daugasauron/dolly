DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 14bb820c334f4ec968b858c52f3a938b65eb56d7f83f5f6b2706a317a6b4dbf4 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 14bb820c334f4ec968b858c52f3a938b65eb56d7f83f5f6b2706a317a6b4dbf4 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 14bb820c334f4ec968b858c52f3a938b65eb56d7f83f5f6b2706a317a6b4dbf4 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build 902641bdea3a3ef6bba1589fc530242e22486bfba65803e199fad292f7c9c902 /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 902641bdea3a3ef6bba1589fc530242e22486bfba65803e199fad292f7c9c902 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 902641bdea3a3ef6bba1589fc530242e22486bfba65803e199fad292f7c9c902 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
