DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build f9547fa085d22c6342edfa2325033f40de3dda2cfcd6c07c824d3e40fc161037 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build f9547fa085d22c6342edfa2325033f40de3dda2cfcd6c07c824d3e40fc161037 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build f9547fa085d22c6342edfa2325033f40de3dda2cfcd6c07c824d3e40fc161037 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build f9547fa085d22c6342edfa2325033f40de3dda2cfcd6c07c824d3e40fc161037 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
