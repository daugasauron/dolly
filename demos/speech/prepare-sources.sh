# Sourced by scripts/prepare-image-sources.sh.
if has_image speech-build; then
  transcribe_dir="${staging}/transcribe"
  mkdir -p "${transcribe_dir}"
  tar -xzf "$(bash scripts/fetch-pinned-archive.sh transcribe)" --strip-components=1 -C "${transcribe_dir}"
  # ggml aligns to 16 what malloc aligns to 8 here: Dolly takes the branch upstream has for Emscripten, as in llama.cpp's ggml.
  sed -i 's/^#elif defined(__EMSCRIPTEN__)$/#elif defined(__EMSCRIPTEN__) || defined(__dolly__)/' "${transcribe_dir}/ggml/include/ggml.h"
  grep -q __dolly__ "${transcribe_dir}/ggml/include/ggml.h"
  speech_inputs=("${transcribe_dir}/LICENSE" /usr/share/licenses/transcribe.cpp/LICENSE
    "${transcribe_dir}/THIRD-PARTY-LICENSES.md" /usr/share/licenses/transcribe.cpp/THIRD-PARTY-LICENSES.md
    "${transcribe_dir}/ggml/LICENSE" /usr/share/licenses/transcribe.cpp/ggml-LICENSE)
  for entry in speech-to-text.c voice.c hearing.h; do
    speech_inputs+=("demos/speech/${entry}" "/tmp/transcribe/${entry}")
  done
  # What CMake configures and the libraries compile: no bindings, tests, reports or examples.
  for entry in CMakeLists.txt cmake include src ggml/CMakeLists.txt ggml/cmake ggml/include ggml/src ggml/ggml.pc.in; do
    speech_inputs+=("${transcribe_dir}/${entry}" "/tmp/transcribe/${entry}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/speech/source.tar" "${speech_inputs[@]}"
fi
if has_image speech-to-text || has_image pi-phone; then
  (source config/source-pins.sh
    copy_static "$(bash scripts/fetch-verified-file.sh "${DOLLY_PARAKEET_URL}" "${DOLLY_PARAKEET_SHA256}" \
      .cache/parakeet-tdt_ctc-110m-Q8_0.gguf)" speech/parakeet-tdt_ctc-110m.gguf
    copy_static "$(bash scripts/fetch-verified-file.sh "${DOLLY_SILERO_VAD_URL}" "${DOLLY_SILERO_VAD_SHA256}" \
      .cache/silero-vad-v6.2-F32.gguf)" speech/silero-vad.gguf)
  copy_static demos/speech/CC-BY-4.0.txt speech/CC-BY-4.0.txt
  copy_static demos/speech/pi.menu speech/pi.menu
fi
