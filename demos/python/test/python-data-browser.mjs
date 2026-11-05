// python-data in Chromium and Firefox: a script per library, with nothing to
// build or fetch (a NumPy computation, a pandas frame, a Matplotlib figure saved
// as PNG and read back, text drawn with Pillow's FreeType, a plot shown in the
// terminal), and the numpy package installed alone, which brings NumPy and no
// other library.
// The openblas package alone links a C program that calls it as SciPy does.
// Usage: node demos/python/test/python-data-browser.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { demoTest, installProbe, shellPrompt, waitForDisplay, writeCommand } from "../../browser.mjs";

const scripts = {
  numpy: `import numpy as np
a = np.arange(12.0).reshape(3, 4)
assert (a @ a.T).trace() == 506.0
assert np.allclose(np.linalg.solve([[3, 1], [1, 2]], [9, 8]), [2, 3])
assert abs(np.fft.fft(np.ones(8))[0] - 8) < 1e-12
assert abs(np.random.default_rng(42).normal(size=100_000).mean()) < 0.02
print("NUMPY-OK", np.__version__)`,
  pandas: `import pandas as pd
frame = pd.DataFrame({"city": ["Oslo", "Tokyo", "Oslo", "Lima"], "t": [3.0, 18.5, 5.0, 19.0]})
assert frame.groupby("city")["t"].mean().to_dict() == {"Lima": 19.0, "Oslo": 4.0, "Tokyo": 18.5}
days = pd.Series(range(4), index=pd.date_range("2026-11-01", periods=4, freq="D", tz="Asia/Tokyo"))
assert days.resample("2D").sum().tolist() == [1, 5]
frame.to_csv("/tmp/frame.csv", index=False)
assert pd.read_csv("/tmp/frame.csv").equals(frame)
frame.to_excel("/tmp/frame.xlsx", index=False)
assert pd.read_excel("/tmp/frame.xlsx").equals(frame)
assert "<table" in frame.style.to_html() and "| city" in frame.to_markdown(index=False)
print("PANDAS-OK", pd.__version__)`,
  matplotlib: `import matplotlib.pyplot as plt, numpy, seaborn
from PIL import Image, ImageDraw, ImageFont
assert plt.get_backend().lower() == "agg", plt.get_backend()
figure, axes = plt.subplots(figsize=(4, 3), dpi=100)
axes.plot([0, 1, 2], [0, 1, 0], color="red", linewidth=4)
axes.set_title("Dolly")
seaborn.histplot([1, 2, 2, 3, 3, 3], ax=axes.twinx())
figure.savefig("/tmp/figure.png")
image = Image.open("/tmp/figure.png").convert("RGB")
assert image.size == (400, 300), image.size
pixels = numpy.asarray(image)
red = int(((pixels[..., 0] > 200) & (pixels[..., 1] < 60) & (pixels[..., 2] < 60)).sum())
assert red > 300, red
label = Image.new("L", (80, 30))
ImageDraw.Draw(label).text((2, 2), "Dolly", font=ImageFont.load_default(size=20), fill=255)
assert (numpy.asarray(label) > 128).sum() > 50
print("MATPLOTLIB-OK", red)`,
  // Every extension module loads (its imports are the host's exports), but the
  // two bindings of Tk, which Dolly has not.
  extensions: `import importlib, pathlib
root = pathlib.Path("/usr/lib/python3.14/site-packages")
modules = [".".join(path.relative_to(root).parts[:-1] + (path.name.split(".")[0],)) for path in root.rglob("*.so")
           if not path.name.startswith(("_imagingtk.", "_tkagg."))]
for name in modules: importlib.import_module(name)
print("EXTENSIONS-OK", len(modules))`,
};
// The README's snippet: savefig, then the PNG written to the terminal as one
// kitty graphics escape. The 640x480 figure lands at the cursor, its line in
// Matplotlib's first colour, and the prompt returns below it.
const plot = `import base64, matplotlib.pyplot as plt
plt.plot([1, 3, 2]); plt.savefig("/tmp/plot.png")
print(f"\\033_Ga=T,f=100;{base64.b64encode(open('/tmp/plot.png', 'rb').read()).decode()}\\033\\\\")`;
async function showPlot({ page, run, text }) {
  await run(writeCommand("/tmp/plot.py", plot));
  await run("clear; python /tmp/plot.py");
  await waitForDisplay(page, () => {
    const { paddingX, paddingY } = __dolly.transport.geometry();
    const context = displaySnapshot.getContext("2d");
    const white = (x, y) => context.getImageData(paddingX + x, paddingY + y, 1, 1).data.every(value => value === 255);
    const pixels = context.getImageData(paddingX, paddingY, 640, 480).data;
    let line = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      line += Math.abs(pixels[index] - 31) + Math.abs(pixels[index + 1] - 119) + Math.abs(pixels[index + 2] - 180) < 30;
    }
    return white(1, 1) && white(638, 478) && !white(642, 1) && line > 300;
  });
  const { cellHeight } = await page.evaluate(() => __dolly.transport.geometry());
  const rows = (await text()).split("\n");
  assert(rows.findLastIndex(row => shellPrompt.test(row)) >= Math.ceil(480 / cellHeight), rows.join("\n"));
}

const runScript = async (run, name) => {
  await run(writeCommand(`/tmp/check-${name}.py`, scripts[name]));
  await run(`python /tmp/check-${name}.py`);
};

for (const browser of ["chromium", "firefox"]) {
  await demoTest("python-data", { image: "python-data", browser, timeout: 900_000 }, async ({ open }) => {
    const { page, run, text } = await open();
    for (const name of Object.keys(scripts)) await runScript(run, name);
    await showPlot({ page, run, text });
  });
}

const openblasCheck = await readFile(new URL("fixtures/openblas-check.c", import.meta.url), "utf8");
for (const browser of ["chromium", "firefox"]) {
  await demoTest("openblas", { image: "system", browser, timeout: 300_000 }, async ({ open }) => {
    const { run, text } = await open(await installProbe("cc", "pkgconf", "openblas"));
    await run(writeCommand("/tmp/openblas-check.c", openblasCheck));
    await run("cc $(pkg-config --cflags openblas) /tmp/openblas-check.c $(pkg-config --libs openblas) -o /tmp/openblas-check");
    await run("/tmp/openblas-check 500");
    console.log((await text()).match(/OPENBLAS-OK n \d+.*/)[0]);
  });
}

// The numpy package alone, in default: NumPy and Python, and no other library.
await demoTest("numpy", { image: "default", timeout: 900_000 }, async ({ open }) => {
  const { run } = await open();
  await run("amy install numpy");
  await runScript(run, "numpy");
  await run("python -c 'import pandas'", 1);
  await run("pip list | grep -q '^numpy '");
});
