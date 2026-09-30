DOLLY 4
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM HOST /Dollyfile-ripgrep 79646975fba427d09fbfe3426791fa4e3aab6027543a929b7e2a01d93e809133 /usr/bin/rg /usr/bin/rg
COPY FROM HOST /Dollyfile-ripgrep 79646975fba427d09fbfe3426791fa4e3aab6027543a929b7e2a01d93e809133 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM HOST /Dollyfile-ripgrep 79646975fba427d09fbfe3426791fa4e3aab6027543a929b7e2a01d93e809133 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM HOST /Dollyfile-fd-build 9c152f723838d93f1c7cc9950176436f4d19f5ee95d528298fe5aa4a0cf5655a /usr/bin/fd /usr/bin/fd
COPY FROM HOST /Dollyfile-fd-build 9c152f723838d93f1c7cc9950176436f4d19f5ee95d528298fe5aa4a0cf5655a /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM HOST /Dollyfile-fd-build 9c152f723838d93f1c7cc9950176436f4d19f5ee95d528298fe5aa4a0cf5655a /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
