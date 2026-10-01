DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 3cdb107ec7f0f4ef01dce67842c15c5f5391c1a7714e253d09c8db8b4ba2c5d7 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 3cdb107ec7f0f4ef01dce67842c15c5f5391c1a7714e253d09c8db8b4ba2c5d7 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 3cdb107ec7f0f4ef01dce67842c15c5f5391c1a7714e253d09c8db8b4ba2c5d7 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 3cdb107ec7f0f4ef01dce67842c15c5f5391c1a7714e253d09c8db8b4ba2c5d7 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
