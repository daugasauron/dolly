DOLLY 4
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM HOST /Dollyfile-ripgrep 43c40347396f9fe84f7887bab4e19c35490f83c50eff53f1f039f872962f5701 /usr/bin/rg /usr/bin/rg
COPY FROM HOST /Dollyfile-ripgrep 43c40347396f9fe84f7887bab4e19c35490f83c50eff53f1f039f872962f5701 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM HOST /Dollyfile-ripgrep 43c40347396f9fe84f7887bab4e19c35490f83c50eff53f1f039f872962f5701 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM HOST /Dollyfile-fd-build 634c66c2b75d1b2b6dd734e912451a481f9a48da319fd0ce154343c4026afa44 /usr/bin/fd /usr/bin/fd
COPY FROM HOST /Dollyfile-fd-build 634c66c2b75d1b2b6dd734e912451a481f9a48da319fd0ce154343c4026afa44 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM HOST /Dollyfile-fd-build 634c66c2b75d1b2b6dd734e912451a481f9a48da319fd0ce154343c4026afa44 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
