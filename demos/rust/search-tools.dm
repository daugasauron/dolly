DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep dfde37ee6e19c6f905be6c5fef0332a278d566658f80d1f7935ec261d53523a7 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep dfde37ee6e19c6f905be6c5fef0332a278d566658f80d1f7935ec261d53523a7 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep dfde37ee6e19c6f905be6c5fef0332a278d566658f80d1f7935ec261d53523a7 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build def6a4a94c85bf892f1f99d622ec163bdf751177655798b20caeefa89357493f /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build def6a4a94c85bf892f1f99d622ec163bdf751177655798b20caeefa89357493f /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build def6a4a94c85bf892f1f99d622ec163bdf751177655798b20caeefa89357493f /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
