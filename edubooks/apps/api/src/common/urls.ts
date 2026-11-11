import { BadRequestException } from '@nestjs/common';

/** Accept YouTube / Vimeo for videos (shown embedded) and any https link otherwise. */
export function checkUrl(kind: string, url?: string | null) {
  if (kind !== 'VIDEO' && kind !== 'LINK') return null;
  if (!url) throw new BadRequestException(kind === 'VIDEO' ? 'Paste a YouTube or Vimeo link' : 'Paste a link');
  let u: URL; try { u = new URL(url); } catch { throw new BadRequestException('That link is not valid'); }
  if (u.protocol !== 'https:') throw new BadRequestException('Links must start with https://');
  if (kind === 'VIDEO' && !/(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(u.hostname)) throw new BadRequestException('Videos must be on YouTube or Vimeo. For other sites, use a “Link” lesson.');
  return u.toString();
}

