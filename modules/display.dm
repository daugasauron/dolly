DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 447b6a4c5c50c0205679c1a211578e0dc5ef5865b595673040ff98ec84adc74e /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 447b6a4c5c50c0205679c1a211578e0dc5ef5865b595673040ff98ec84adc74e /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 447b6a4c5c50c0205679c1a211578e0dc5ef5865b595673040ff98ec84adc74e /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 447b6a4c5c50c0205679c1a211578e0dc5ef5865b595673040ff98ec84adc74e /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
