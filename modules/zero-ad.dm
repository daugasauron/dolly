DOLLY 3
MODULE zero-ad

REQUIRES TOOL slop
REQUIRES TOOL tar

# External wasm64 bootstrap; pinned sources and port instructions: docs/sources.md.
SOURCE HOST /static/zero-ad/pyrogenesis.wasm /opt/0ad/system/pyrogenesis 44b8b1cc4c493242279b6bd7c1307f9956ca4b4ddbfe75e4bce1ca2942e3e039
SOURCE HOST /static/zero-ad/data.tar /tmp/0ad-data.tar 106447835d6f15012d3048b0f0a2533ffbd8f714b781327d6f5b69691e09fb7b
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
