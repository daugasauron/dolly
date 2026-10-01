DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 3bacd969d15ef6a8e12220d0e35d75325026d9a8e52a4f6921ac7c2788f39fa9 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 3bacd969d15ef6a8e12220d0e35d75325026d9a8e52a4f6921ac7c2788f39fa9 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 3bacd969d15ef6a8e12220d0e35d75325026d9a8e52a4f6921ac7c2788f39fa9 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build f01acdbb0ed564a0fdd1f3f8f5ebae5d16a34965a00533426a66f0389f9165c0 /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build f01acdbb0ed564a0fdd1f3f8f5ebae5d16a34965a00533426a66f0389f9165c0 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build f01acdbb0ed564a0fdd1f3f8f5ebae5d16a34965a00533426a66f0389f9165c0 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
