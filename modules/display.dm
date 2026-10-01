DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 89915b67659773891789320daffd0ecf6294e6a4e03d7dc94b0d35b02c5813ed /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 89915b67659773891789320daffd0ecf6294e6a4e03d7dc94b0d35b02c5813ed /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 89915b67659773891789320daffd0ecf6294e6a4e03d7dc94b0d35b02c5813ed /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 89915b67659773891789320daffd0ecf6294e6a4e03d7dc94b0d35b02c5813ed /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
