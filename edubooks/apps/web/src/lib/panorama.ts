'use client';
/**
 * A room panorama from a camera turning slowly around: every new frame is matched to the previous one (how far the
 * picture moved left/right and up/down, found by comparing small grey copies), then blended into one wide picture —
 * like the panorama mode of a phone. Runs on the device; only the finished picture is sent.
 */
const SW = 96, SH = 72; // the small grey copy used to find the movement

export class PanoramaBuilder {
  private v: HTMLVideoElement; private fw: number; private fh: number;
  private small = document.createElement('canvas'); private sg: CanvasRenderingContext2D;
  private frame = document.createElement('canvas'); private fg: CanvasRenderingContext2D;
  private mask: HTMLCanvasElement;
  /** the wide picture being built (frames are placed around the middle) */
  readonly pano = document.createElement('canvas'); private pg: CanvasRenderingContext2D;
  private prev: Float32Array | null = null; private x = 0; private y = 0;
  private minX = 0; private maxX = 0; private minY = 0; private maxY = 0;
  /** how much of the room is covered, in camera-widths (about 4 ≈ half a turn, 7 ≈ all around) */
  covered = 1;
  /** true when the last frame moved too much to be matched (turning too fast) */
  tooFast = false;

  constructor(video: HTMLVideoElement, frameWidth = 320) {
    this.v = video; this.fw = frameWidth; this.fh = Math.round(frameWidth * ((video.videoHeight || 480) / (video.videoWidth || 640)));
    this.small.width = SW; this.small.height = SH; this.sg = this.small.getContext('2d', { willReadFrequently: true })!;
    this.frame.width = this.fw; this.frame.height = this.fh; this.fg = this.frame.getContext('2d')!;
    this.pano.width = this.fw * 10; this.pano.height = Math.round(this.fh * 1.6); this.pg = this.pano.getContext('2d')!;
    this.pg.fillStyle = '#0f172a'; this.pg.fillRect(0, 0, this.pano.width, this.pano.height);
    // soft left and right edges, so the frames blend into each other
    this.mask = document.createElement('canvas'); this.mask.width = this.fw; this.mask.height = this.fh;
    const mg = this.mask.getContext('2d')!; const grad = mg.createLinearGradient(0, 0, this.fw, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.12, 'rgba(0,0,0,1)'); grad.addColorStop(0.88, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    mg.fillStyle = grad; mg.fillRect(0, 0, this.fw, this.fh);
  }
  private grey(): Float32Array {
    this.sg.drawImage(this.v, 0, 0, SW, SH); const d = this.sg.getImageData(0, 0, SW, SH).data; const g = new Float32Array(SW * SH);
    for (let i = 0; i < g.length; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
    return g;
  }
  private shiftCost(a: Float32Array, b: Float32Array, dx: number, dy: number) {
    let sum = 0, n = 0;
    for (let y = Math.max(0, dy) + 4; y < Math.min(SH, SH + dy) - 4; y += 2) { const ra = y * SW, rb = (y - dy) * SW; for (let x = Math.max(0, dx); x < Math.min(SW, SW + dx); x += 2) { sum += Math.abs(a[ra + x] - b[rb + x - dx]); n++; } }
    return n ? sum / n : Infinity;
  }
  /** the movement between two grey copies: the shift with the smallest difference */
  private shift(a: Float32Array, b: Float32Array) {
    let best = { dx: 0, dy: 0, cost: Infinity };
    for (let dy = -6; dy <= 6; dy += 2) for (let dx = -36; dx <= 36; dx++) {
      let sum = 0, n = 0;
      for (let y = Math.max(0, dy) + 4; y < Math.min(SH, SH + dy) - 4; y += 2) {
        const ra = y * SW, rb = (y - dy) * SW;
        for (let x = Math.max(0, dx); x < Math.min(SW, SW + dx); x += 2) { sum += Math.abs(a[ra + x] - b[rb + x - dx]); n++; }
      }
      if (n > 200) { const c = sum / n; if (c < best.cost) best = { dx, dy, cost: c }; }
    }
    return best;
  }
  /** Adds the camera's current frame. Returns false when it could not be placed (moving too fast). */
  add(): boolean {
    if (this.v.readyState < 2) return false;
    const g = this.grey();
    let px = this.x, py = this.y;
    if (this.prev) {
      const s = this.shift(g, this.prev);
      // only accept a clear match: low difference, and clearly better than not moving at all
      const still = this.shiftCost(g, this.prev, 0, 0);
      this.tooFast = s.cost > 30 || Math.abs(s.dx) > 30 || (s.dx !== 0 && s.cost > still * 0.85 && still < 30 && Math.abs(s.dx) > 4 && s.cost > 12);
      if (this.tooFast) return false;
      // the picture moved right by dx → the camera turned left: this frame sits to the left of the last one
      px = this.x - s.dx * (this.fw / SW); py = this.y - s.dy * (this.fh / SH);
      if (Math.abs(px - this.x) < this.fw * 0.04 && Math.abs(py - this.y) < 3) return true; // hardly moved: nothing new to add
    }
    this.prev = g; this.x = px; this.y = py;
    this.minX = Math.min(this.minX, px); this.maxX = Math.max(this.maxX, px); this.minY = Math.min(this.minY, py); this.maxY = Math.max(this.maxY, py);
    this.covered = (this.maxX - this.minX + this.fw) / this.fw;
    // the frame, faded at its edges, painted onto the wide picture
    this.fg.globalCompositeOperation = 'source-over'; this.fg.clearRect(0, 0, this.fw, this.fh); this.fg.drawImage(this.v, 0, 0, this.fw, this.fh);
    this.fg.globalCompositeOperation = 'destination-in'; this.fg.drawImage(this.mask, 0, 0); this.fg.globalCompositeOperation = 'source-over';
    const ox = this.pano.width / 2 - this.fw / 2 + px, oy = (this.pano.height - this.fh) / 2 + py;
    if (ox > 0 && ox + this.fw < this.pano.width) this.pg.drawImage(this.frame, ox, oy);
    return true;
  }
  /** The finished panorama, cut to what was filmed, as a JPEG (at most `maxW` wide). */
  result(maxW = 3200, quality = 0.75): string {
    // without the faded ends of the first and last frame
    const x0 = Math.max(0, this.pano.width / 2 - this.fw / 2 + this.minX + this.fw * 0.1), x1 = Math.min(this.pano.width, this.pano.width / 2 + this.fw / 2 + this.maxX - this.fw * 0.1);
    const y0 = Math.max(0, (this.pano.height - this.fh) / 2 + this.minY), y1 = Math.min(this.pano.height, (this.pano.height + this.fh) / 2 + this.maxY);
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0); const k = Math.min(1, maxW / w);
    const out = document.createElement('canvas'); out.width = Math.round(w * k); out.height = Math.round(h * k);
    out.getContext('2d')!.drawImage(this.pano, x0, y0, w, h, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', quality);
  }
  /** A small preview of the part filmed so far (for the screen). */
  preview(c: HTMLCanvasElement) {
    const x0 = Math.max(0, this.pano.width / 2 - this.fw / 2 + this.minX), w = Math.min(this.pano.width - x0, this.maxX - this.minX + this.fw);
    const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height); g.fillStyle = '#0f172a'; g.fillRect(0, 0, c.width, c.height);
    const k = Math.min(c.width / w, c.height / this.pano.height); const dw = w * k, dh = this.pano.height * k;
    g.drawImage(this.pano, x0, 0, w, this.pano.height, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
  }
}

/** Records a short, small video of the camera (the room scan), for the teacher to replay. */
export function recordClip(stream: MediaStream) {
  const types = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  const type = typeof MediaRecorder !== 'undefined' ? types.find((x) => MediaRecorder.isTypeSupported?.(x)) : undefined;
  if (!type) return null;
  const chunks: Blob[] = []; let rec: MediaRecorder;
  try { rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 180_000 }); } catch { return null; }
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start(1000);
  return {
    stop: () => new Promise<string | null>((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: type.split(';')[0] });
        if (!blob.size || blob.size > 1_350_000) return resolve(null);
        const r = new FileReader(); r.onload = () => resolve(String(r.result).replace(/^data:video\/(webm|mp4)[^,]*,/, 'data:video/$1;base64,')); r.onerror = () => resolve(null); r.readAsDataURL(blob);
      };
      try { rec.stop(); } catch { resolve(null); }
    }),
  };
}
