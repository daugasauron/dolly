DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 9113e8e2e58d38584606dda6ebd452e4b5a845742d1ffa72094d47deb86a2da7 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 9113e8e2e58d38584606dda6ebd452e4b5a845742d1ffa72094d47deb86a2da7 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 9113e8e2e58d38584606dda6ebd452e4b5a845742d1ffa72094d47deb86a2da7 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 9113e8e2e58d38584606dda6ebd452e4b5a845742d1ffa72094d47deb86a2da7 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
