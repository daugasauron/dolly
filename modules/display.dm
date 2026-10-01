DOLLY 4
MODULE display

REQUIRES HOST display@0

COPY FROM HOST /Dollyfile-ghostty-build 2229f56c136442aabcde045b9650429687818a695df80c08053986d7a655acf4 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM HOST /Dollyfile-ghostty-build 2229f56c136442aabcde045b9650429687818a695df80c08053986d7a655acf4 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM HOST /Dollyfile-ghostty-build 2229f56c136442aabcde045b9650429687818a695df80c08053986d7a655acf4 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM HOST /Dollyfile-ghostty-build 2229f56c136442aabcde045b9650429687818a695df80c08053986d7a655acf4 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
