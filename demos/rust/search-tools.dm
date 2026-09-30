DOLLY 4
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM HOST /Dollyfile-ripgrep 9352ec1c72db4b4e60ca8059d94eead97985edcc4e843a0eacad70dada40d143 /usr/bin/rg /usr/bin/rg
COPY FROM HOST /Dollyfile-ripgrep 9352ec1c72db4b4e60ca8059d94eead97985edcc4e843a0eacad70dada40d143 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM HOST /Dollyfile-ripgrep 9352ec1c72db4b4e60ca8059d94eead97985edcc4e843a0eacad70dada40d143 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM HOST /Dollyfile-fd-build 74526e364ec69f8fdc582c5776edd9cf09a969bdfb24d3a82f119f615a03d7c3 /usr/bin/fd /usr/bin/fd
COPY FROM HOST /Dollyfile-fd-build 74526e364ec69f8fdc582c5776edd9cf09a969bdfb24d3a82f119f615a03d7c3 /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM HOST /Dollyfile-fd-build 74526e364ec69f8fdc582c5776edd9cf09a969bdfb24d3a82f119f615a03d7c3 /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
