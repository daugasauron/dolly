DOLLY 4
MODULE display

REQUIRES HOST display@0

COPY FROM HOST /Dollyfile-ghostty-build c69a4bc8ac9d7b03efe3c61f8a8b1a248ee8042a2cadaff933193cca7a20423e /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM HOST /Dollyfile-ghostty-build c69a4bc8ac9d7b03efe3c61f8a8b1a248ee8042a2cadaff933193cca7a20423e /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM HOST /Dollyfile-ghostty-build c69a4bc8ac9d7b03efe3c61f8a8b1a248ee8042a2cadaff933193cca7a20423e /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM HOST /Dollyfile-ghostty-build c69a4bc8ac9d7b03efe3c61f8a8b1a248ee8042a2cadaff933193cca7a20423e /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
