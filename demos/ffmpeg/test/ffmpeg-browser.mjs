// FFmpeg in default, as a person installs it: lavfi's test pattern and tone
// encoded by FFmpeg's own encoders into MP4, Matroska and WAV, the streams
// read back by ffprobe, the lossless ones decoded to the source's exact
// samples, the lossy video compared with its source, a frame written as PNG,
// and a C program linked with the libraries.
// Usage: node demos/ffmpeg/test/ffmpeg-browser.mjs [chromium|firefox ...]
import { demoTest, writeCommand } from "../../browser.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
const video = "-f lavfi -i testsrc2=size=320x240:rate=25:duration=2";
const tone = "-f lavfi -i sine=frequency=440:sample_rate=44100:duration=2";
const quiet = "ffmpeg -hide_banner -loglevel error -y";
const probe = (entries, file) => `ffprobe -v error -show_entries ${entries} -of csv=p=0 ${file}`;
const lists = (command, lines) => `test "$(${command})" = "$(printf '%s\\n' ${lines.map(line => `'${line}'`).join(" ")})"`;
const program = `#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
int main(void) {
  return avcodec_find_encoder(AV_CODEC_ID_FFV1) == NULL || av_find_input_format("matroska") == NULL ||
    avformat_version() != LIBAVFORMAT_VERSION_INT;
}`;

for (const browser of browsers) {
  await demoTest("ffmpeg", { image: "default", timeout: 900_000, browser }, async ({ open }) => {
    const { run } = await open();
    await run("amy install ffmpeg");
    await run("mkdir /tmp/media && cd /tmp/media && " +
      `${quiet} ${video} ${tone} -c:v mpeg4 -q:v 3 -c:a aac -shortest clip.mp4 && ` +
      `${quiet} ${video} ${tone} -pix_fmt yuv420p -c:v ffv1 -c:a flac lossless.mkv && ` +
      `${quiet} -i lossless.mkv -vn -c:a pcm_s16le tone.wav`);
    await run(`cd /tmp/media && ${lists(probe("stream=codec_name,width,height", "clip.mp4"), ["mpeg4,320,240", "aac"])} && ` +
      `${lists(probe("stream=codec_name,width,height", "lossless.mkv"), ["ffv1,320,240", "flac"])} && ` +
      `${lists(probe("stream=codec_name,sample_rate,channels", "tone.wav"), ["pcm_s16le,44100,1"])} && ` +
      `${lists(probe("format=duration", "tone.wav"), ["2.000000"])}`);
    // Lossless: what is decoded is what lavfi made, sample for sample.
    await run("cd /tmp/media && " +
      `test "$(${quiet} ${video} -pix_fmt yuv420p -f md5 -)" = "$(${quiet} -i lossless.mkv -map 0:v -f md5 -)" && ` +
      `test "$(${quiet} ${tone} -f md5 -)" = "$(${quiet} -i tone.wav -f md5 -)"`);
    // Lossy: MPEG-4 Part 2 decoded and compared with its source, above 30 dB.
    await run("cd /tmp/media && " +
      `${quiet.replace("error", "info")} -i clip.mp4 ${video} -lavfi '[0:v][1:v]psnr' -f null - 2> psnr.txt && ` +
      "test \"$(sed -n 's/.* average:\\([0-9]*\\).*/\\1/p' psnr.txt)\" -gt 30");
    // A frame as PNG, which ffprobe decodes to its size.
    await run("cd /tmp/media && " +
      `${quiet} -ss 1 -i clip.mp4 -frames:v 1 frame.png && ${lists(probe("stream=codec_name,width,height", "frame.png"), ["png,320,240"])}`);
    // The libraries and headers, for programs the cc package builds.
    await run("amy install cc");
    await run(`cd /tmp/media && ${writeCommand("probe.c", program)} && ` +
      "cc probe.c -pthread -lavformat -lavcodec -lavutil -lswresample -lz -lm -o probe && ./probe");
  });
}
