DOLLY 3
MODULE zero-ad

REQUIRES TOOL slop
REQUIRES TOOL tar

# External wasm64 bootstrap; pinned sources and port instructions: docs/sources.md.
SOURCE HOST /static/zero-ad/pyrogenesis.wasm /opt/0ad/system/pyrogenesis bf08cfcd28734e163d01a971cddaaffa39cea11e46b23833ac302f5738ef229d
SOURCE HOST /static/zero-ad/data.tar /tmp/0ad-data.tar d9f94e4c0225454f7f93fab6246d76692dd470f3a01d8d0cc038aa98c3730be4
SLOP tar -xf /tmp/0ad-data.tar -C /opt/0ad && rm /tmp/0ad-data.tar

FILE /usr/bin/zero-ad
    #!/bin/slop
    export ICU_DATA=/opt/0ad/data/icu
    if test "$#" -eq 0; then
      set -- -autostart=skirmishes/temperate_roadway_2p -autostart-civ=1:athen -autostart-civ=2:athen -autostart-ai=2:petra -autostart-aidiff=2:1
    fi
    /opt/0ad/system/pyrogenesis -writableRoot -mod=public -conf=hotkey.exit:F10 "$@"
SLOP /usr/bin/zero-ad -version
EXPORTS TOOL zero-ad
EXPORTS FOLDER zero-ad /opt/0ad
