DOLLY 3
MODULE zero-ad

REQUIRES TOOL slop
REQUIRES TOOL tar

# External wasm64 bootstrap; pinned sources and port instructions: docs/sources.md.
SOURCE HOST /static/zero-ad/pyrogenesis.wasm /opt/0ad/system/pyrogenesis 3ce68297878a1bbb2f2cf19dc37ef0afa38ad5011a639574c17e034af2a8b7d1
SOURCE HOST /static/zero-ad/data.tar /tmp/0ad-data.tar d82bdc1bf4237242596a6b82b8b37069fa786511dd1f3c277fae11aba79986aa
SLOP tar -xf /tmp/0ad-data.tar -C /opt/0ad && rm /tmp/0ad-data.tar

FILE /usr/bin/zero-ad
    #!/bin/slop
    export ICU_DATA=/opt/0ad/data/icu
    if test "$#" -eq 0; then
      set -- -autostart=skirmishes/temperate_roadway_2p -autostart-civ=1:athen -autostart-civ=2:athen -autostart-ai=2:petra -autostart-aidiff=2:1
    fi
    /opt/0ad/system/pyrogenesis -writableRoot -mod=public -conf=hotkey.exit:Ctrl+F10 "$@"
SLOP /usr/bin/zero-ad -version
EXPORTS TOOL zero-ad
EXPORTS FOLDER zero-ad /opt/0ad
