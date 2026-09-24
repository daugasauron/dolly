export async function hasGameHud(page, fullFrame) {
  // Loading also submits GPU frames. The food icon's light outline marks the
  // actual game HUD; the loading screen does not have these bright pixels.
  const png = fullFrame ?? await page.screenshot({clip: {x: 8, y: 5, width: 24, height: 20}});
  return page.evaluate(async ({encoded, fullFrame}) => {
    const bytes = Uint8Array.from(atob(encoded), letter => letter.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/png'}));
    const canvas = new OffscreenCanvas(24, 20), context = canvas.getContext('2d');
    context.drawImage(bitmap, fullFrame ? -8 : 0, fullFrame ? -5 : 0); bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] > 170 && pixels[i + 1] > 170 && pixels[i + 2] > 170) bright++;
    return bright > 32;
  }, {encoded: png.toString('base64'), fullFrame: !!fullFrame});
}
