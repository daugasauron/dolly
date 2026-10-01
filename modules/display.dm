DOLLY 4
MODULE display

REQUIRES HOST display@0

COPY FROM HOST /Dollyfile-ghostty-build 2c945683763a446a60220b866f82fe6e97c4994f8da4178df23804c71f907996 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM HOST /Dollyfile-ghostty-build 2c945683763a446a60220b866f82fe6e97c4994f8da4178df23804c71f907996 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM HOST /Dollyfile-ghostty-build 2c945683763a446a60220b866f82fe6e97c4994f8da4178df23804c71f907996 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM HOST /Dollyfile-ghostty-build 2c945683763a446a60220b866f82fe6e97c4994f8da4178df23804c71f907996 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
