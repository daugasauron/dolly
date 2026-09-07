import { inspectDollyfile, MAX_DOLLYFILE_BYTES } from "./dollyfile-view.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";

const form = document.querySelector("#custom-dollyfile");
const source = document.querySelector("#source");
const status = document.querySelector("#status");
const fileInput = document.querySelector("#dollyfile-upload");
const storageKey = "dolly-custom-source";
const base = DOLLY_IMAGES.find(image => image.image === "system") ?? DOLLY_IMAGES[0];
try {
  source.value = sessionStorage.getItem(storageKey) ?? `DOLLY 3
IMAGE custom

FROM HOST /${base.dollyfile} ${base.sha256}

FILE /usr/share/hello.txt
    Hello from your custom image. Try: cat /usr/share/hello.txt

ENTRY /bin/foreground -i /bin/slop
`;
} catch (error) { status.textContent = error.message; }

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    if (file.size > MAX_DOLLYFILE_BYTES) throw new Error("Dollyfile exceeds 128 KiB");
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
    if (text.includes("\0")) throw new Error("Dollyfile contains NUL bytes");
    source.value = text;
    status.textContent = "";
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});

form.addEventListener("submit", event => {
  event.preventDefault();
  try {
    if (inspectDollyfile(source.value).kind !== "image") throw new Error("Upload an IMAGE recipe, not a MODULE");
    sessionStorage.setItem(storageKey, source.value);
    const target = new URL("../custom/rebuild/", import.meta.url);
    target.pathname = target.pathname.replace(/\/_dolly\/[0-9a-f]{64}\//, "/");
    location.assign(target);
  } catch (error) { status.textContent = error.message; }
});
