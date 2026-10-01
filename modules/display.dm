DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 8f596534f1a241f1f1deadf41eb59d6de5a8ec48daa4c0ad09f9d6e21c0d747d /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 8f596534f1a241f1f1deadf41eb59d6de5a8ec48daa4c0ad09f9d6e21c0d747d /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 8f596534f1a241f1f1deadf41eb59d6de5a8ec48daa4c0ad09f9d6e21c0d747d /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 8f596534f1a241f1f1deadf41eb59d6de5a8ec48daa4c0ad09f9d6e21c0d747d /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
