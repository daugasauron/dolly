DOLLY 5
MODULE display

REQUIRES HOST display@0

COPY FROM https://daugasauron.com/Dollyfile-ghostty-build ec599420cb41cba48a97e93a6597987b588f79158d06bb380ee8920f8c0870dc /usr/lib/libdisplay.so /usr/lib/libdisplay.so
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build ec599420cb41cba48a97e93a6597987b588f79158d06bb380ee8920f8c0870dc /usr/share/fonts/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build ec599420cb41cba48a97e93a6597987b588f79158d06bb380ee8920f8c0870dc /usr/share/licenses/ghostty /usr/share/licenses/ghostty
COPY FROM https://daugasauron.com/Dollyfile-ghostty-build ec599420cb41cba48a97e93a6597987b588f79158d06bb380ee8920f8c0870dc /usr/share/licenses/uucode /usr/share/licenses/uucode
EXPORTS LIB display /usr/lib/libdisplay.so
EXPORTS ENV DISPLAY /usr/lib/libdisplay.so
