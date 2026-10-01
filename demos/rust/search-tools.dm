DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 6ebef3594ef957f38ac9ebd9b1abe6107ec22e8fce7f60352d1a23d89c336031 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 6ebef3594ef957f38ac9ebd9b1abe6107ec22e8fce7f60352d1a23d89c336031 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 6ebef3594ef957f38ac9ebd9b1abe6107ec22e8fce7f60352d1a23d89c336031 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build a51bd8344ccf084cdc9189aed46e14b376fea543e9b4e00045b4805445d0baec /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build a51bd8344ccf084cdc9189aed46e14b376fea543e9b4e00045b4805445d0baec /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build a51bd8344ccf084cdc9189aed46e14b376fea543e9b4e00045b4805445d0baec /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
