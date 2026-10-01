DOLLY 4
MODULE display

REQUIRES HOST display@0

COPY FROM HOST /Dollyfile-ghostty-build 635ab97f04431126a771e372c093b8855373bd12be4b6055d5864def5a52ecd5 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM HOST /Dollyfile-ghostty-build 635ab97f04431126a771e372c093b8855373bd12be4b6055d5864def5a52ecd5 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM HOST /Dollyfile-ghostty-build 635ab97f04431126a771e372c093b8855373bd12be4b6055d5864def5a52ecd5 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM HOST /Dollyfile-ghostty-build 635ab97f04431126a771e372c093b8855373bd12be4b6055d5864def5a52ecd5 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
