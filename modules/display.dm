DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 2c31cc6fdb4182e81bc3a352bcdb12944b53beed3d0a7535aa6f09a20742c3fd /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 2c31cc6fdb4182e81bc3a352bcdb12944b53beed3d0a7535aa6f09a20742c3fd /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 2c31cc6fdb4182e81bc3a352bcdb12944b53beed3d0a7535aa6f09a20742c3fd /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 2c31cc6fdb4182e81bc3a352bcdb12944b53beed3d0a7535aa6f09a20742c3fd /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
