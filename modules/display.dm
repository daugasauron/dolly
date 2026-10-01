DOLLY 6
MODULE display

REQUIRES HOST display@0

COPY https://daugasauron.com/Dollyfile-ghostty-build 371dceac43de56ef166944eb54451a602ccf3faccd10d7836998401f2d574621 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY https://daugasauron.com/Dollyfile-ghostty-build 371dceac43de56ef166944eb54451a602ccf3faccd10d7836998401f2d574621 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY https://daugasauron.com/Dollyfile-ghostty-build 371dceac43de56ef166944eb54451a602ccf3faccd10d7836998401f2d574621 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY https://daugasauron.com/Dollyfile-ghostty-build 371dceac43de56ef166944eb54451a602ccf3faccd10d7836998401f2d574621 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
