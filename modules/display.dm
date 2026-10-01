DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 680d7bc1b847758c324375c445a94ce0f2a9253727d3588b7c98a680f576a908 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 680d7bc1b847758c324375c445a94ce0f2a9253727d3588b7c98a680f576a908 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 680d7bc1b847758c324375c445a94ce0f2a9253727d3588b7c98a680f576a908 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 680d7bc1b847758c324375c445a94ce0f2a9253727d3588b7c98a680f576a908 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
