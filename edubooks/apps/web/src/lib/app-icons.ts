/** Makes the installed app's home-screen icons from the company logo, in the browser (square PNGs). */
async function loadImage(url: string) {
  const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url;
  await img.decode();
  return img;
}
function draw(img: HTMLImageElement, size: number, fill: number, bg: string) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d')!; ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
  const box = size * fill; const k = Math.min(box / img.naturalWidth, box / img.naturalHeight);
  const w = img.naturalWidth * k; const h = img.naturalHeight * k;
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the icon'))), 'image/png'));
}
/** Icons for Android/desktop (logo fills ~80%), "maskable" (inside the round safe zone) and iPhone (180 px). */
export async function makeAppIcons(logoUrl: string, bg = '#ffffff') {
  const img = await loadImage(logoUrl);
  const fd = new FormData();
  fd.append('icon192', await draw(img, 192, 0.8, bg), 'icon192.png');
  fd.append('icon512', await draw(img, 512, 0.8, bg), 'icon512.png');
  fd.append('maskable', await draw(img, 512, 0.58, bg), 'maskable.png');
  fd.append('apple', await draw(img, 180, 0.78, bg), 'apple.png');
  return fd;
}
