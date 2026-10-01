DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build e204e427f57324a3c8797e2d76cddd905cadd24cac5957054f7e24acfaec8756 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build e204e427f57324a3c8797e2d76cddd905cadd24cac5957054f7e24acfaec8756 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build e204e427f57324a3c8797e2d76cddd905cadd24cac5957054f7e24acfaec8756 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build e204e427f57324a3c8797e2d76cddd905cadd24cac5957054f7e24acfaec8756 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
