DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 60aa5fe00303a3f41d92b490b43a48b363b39c5ac8a5638b40f00c72e95cc850 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 60aa5fe00303a3f41d92b490b43a48b363b39c5ac8a5638b40f00c72e95cc850 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 60aa5fe00303a3f41d92b490b43a48b363b39c5ac8a5638b40f00c72e95cc850 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 60aa5fe00303a3f41d92b490b43a48b363b39c5ac8a5638b40f00c72e95cc850 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
