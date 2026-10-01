DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep e631ac507e35fba89a70b07ff80decbbd46cfea33dab08c8b06a662fe149194d /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep e631ac507e35fba89a70b07ff80decbbd46cfea33dab08c8b06a662fe149194d /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep e631ac507e35fba89a70b07ff80decbbd46cfea33dab08c8b06a662fe149194d /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build 151fd66b68d73879e6a3c82cf4c7ff420e13e3bed6a728a705f6deee3bdac890 /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 151fd66b68d73879e6a3c82cf4c7ff420e13e3bed6a728a705f6deee3bdac890 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build 151fd66b68d73879e6a3c82cf4c7ff420e13e3bed6a728a705f6deee3bdac890 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
