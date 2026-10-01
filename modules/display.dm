DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build b575294f45558fe0d6d9b517820725b5411292079d6492626ba8d612f48c004e /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build b575294f45558fe0d6d9b517820725b5411292079d6492626ba8d612f48c004e /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build b575294f45558fe0d6d9b517820725b5411292079d6492626ba8d612f48c004e /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build b575294f45558fe0d6d9b517820725b5411292079d6492626ba8d612f48c004e /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
