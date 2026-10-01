DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 09ca309adcf4710dc5d6afe812df51cfb16c528693a47fb28d44f7ee00118af5 /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 09ca309adcf4710dc5d6afe812df51cfb16c528693a47fb28d44f7ee00118af5 /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 09ca309adcf4710dc5d6afe812df51cfb16c528693a47fb28d44f7ee00118af5 /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build 09ca309adcf4710dc5d6afe812df51cfb16c528693a47fb28d44f7ee00118af5 /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
