DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 1207bb4a9ad57c28b133e3a8325c2649d3c468a968d1760f35ea3b91ca6d2da2 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 1207bb4a9ad57c28b133e3a8325c2649d3c468a968d1760f35ea3b91ca6d2da2 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 1207bb4a9ad57c28b133e3a8325c2649d3c468a968d1760f35ea3b91ca6d2da2 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 1207bb4a9ad57c28b133e3a8325c2649d3c468a968d1760f35ea3b91ca6d2da2 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
