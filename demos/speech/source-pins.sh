# The speech demo's upstream source pins, sourced by config/source-pins.sh.

# The speech demo: transcribe.cpp with the ggml it vendors; NVIDIA's Parakeet TDT-CTC 110M (8-bit) and
# Silero VAD 6.2 as that project publishes them for it (GGUF).
DOLLY_TRANSCRIBE_URL='https://codeload.github.com/handy-computer/transcribe.cpp/tar.gz/c63b18e2b4292760f71721ad86778e721c92ebeb'
DOLLY_TRANSCRIBE_SHA256=688b5064156032c1703070c521247f770882498075ec79226ac4ef717d3f1fb0
DOLLY_PARAKEET_URL='https://huggingface.co/handy-computer/parakeet-tdt_ctc-110m-gguf/resolve/766f172fe70eb66785e3371664f53762e0fbafaa/parakeet-tdt_ctc-110m-Q8_0.gguf'
DOLLY_PARAKEET_SHA256=7dd44c74a331d788a4e5f8b16913b3feb29ced22cf5613aad0e0f6cd30516296
DOLLY_SILERO_VAD_URL='https://huggingface.co/handy-computer/silero-vad-v6.2-gguf/resolve/97bbd75179f535e4708bccdf61e9278b8b60dfc7/silero-vad-v6.2-F32.gguf'
DOLLY_SILERO_VAD_SHA256=0d871a800c420fdd5d1b17a3aea4296d1c39608f0ff4a9295eb76457eb1c88e6
# GTK+ for the Wine demo: the last GTK+ that draws without cairo, with the ATK of its time; GDK's and
# Pango's Windows backends are built against Winelib. Pango is the first whose OpenType code may be taken
# under the GPL (before, the FreeType licence alone), and GLib the series that Pango needs.
DOLLY_GIMP_GLIB_VERSION=2.12.13
DOLLY_GIMP_GLIB_URL='https://download.gnome.org/sources/glib/2.12/glib-2.12.13.tar.bz2'
DOLLY_GIMP_GLIB_SHA256=1253d563ca2e50292d924849fe3a23c3b7bc707ab8b79bda19319f9d192b0e8e
