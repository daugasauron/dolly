DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 1105018412ebd8d7876effd8beda98b909997b0cb10a799ee5bbdb18cd06ad00 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 1105018412ebd8d7876effd8beda98b909997b0cb10a799ee5bbdb18cd06ad00 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 1105018412ebd8d7876effd8beda98b909997b0cb10a799ee5bbdb18cd06ad00 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 1105018412ebd8d7876effd8beda98b909997b0cb10a799ee5bbdb18cd06ad00 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
