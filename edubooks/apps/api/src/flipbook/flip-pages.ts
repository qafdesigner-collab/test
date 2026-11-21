/**
 * Finds the page pictures inside an HTML5 flipbook package. Flipbook makers (FlipHTML5, Flip PDF, FlipBuilder,
 * 3D FlipBook, Publuu…) store each page as a numbered image, e.g. files/large/1.jpg, files/mobile/12.webp,
 * pages/page0003.png. The folder + name pattern with the most numbered images wins; a matching
 * "thumb"/"small" set is used for thumbnails.
 */
export interface FlipPage { n: number; path: string; thumb: string | null }

const IMG = /\.(jpe?g|png|webp|gif|avif)$/i;
const BIG = /(large|big|hd|page|pages|mobile|files|image|images|img|content|zoom|high)/i;
const SMALL = /(thumb|thumbnail|small|mini|preview|icon)/i;

export function detectFlipPages(paths: string[]): FlipPage[] {
  const groups = new Map<string, Map<number, string>>();
  for (const p of paths) {
    if (!IMG.test(p)) continue;
    const slash = p.lastIndexOf('/'); const dir = p.slice(0, slash + 1); const name = p.slice(slash + 1);
    const m = /(\d{1,4})(?!.*\d)/.exec(name.replace(IMG, '')); if (!m) continue; // the last number in the name is the page
    const key = `${dir}${name.slice(0, m.index)}#${name.slice(m.index + m[1].length)}`;
    const g = groups.get(key) ?? new Map<number, string>(); g.set(Number(m[1]), p); groups.set(key, g);
  }
  const score = (key: string, g: Map<number, string>) => {
    const nums = [...g.keys()].sort((a, b) => a - b); if (nums.length < 3) return -1;
    const span = nums[nums.length - 1] - nums[0] + 1; const dense = nums.length / span; // pages are numbered without big gaps
    if (dense < 0.6 || nums[0] > 2) return -1;
    return nums.length * dense + (BIG.test(key) ? 5 : 0) - (SMALL.test(key) ? 50 : 0);
  };
  let best: [string, Map<number, string>] | null = null; let bestScore = 0;
  for (const [k, g] of groups) { const s = score(k, g); if (s > bestScore) { bestScore = s; best = [k, g]; } }
  if (!best) return [];
  const [, pages] = best; const nums = [...pages.keys()].sort((a, b) => a - b); const shift = nums[0] === 0 ? 1 : 0;
  // thumbnails: a small-picture set with the same page numbers
  let thumbs: Map<number, string> | null = null;
  for (const [k, g] of groups) if (SMALL.test(k) && nums.filter((n) => g.has(n)).length >= nums.length * 0.8) { thumbs = g; break; }
  return nums.map((n) => ({ n: n + shift, path: pages.get(n)!, thumb: thumbs?.get(n) ?? null }));
}
