export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function parse(res: Response) {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(body?.message) ? body.message.join('; ') : body?.message || `Request failed (${res.status})`;
    if (res.status === 401 && typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    }
    throw new ApiError(res.status, msg);
  }
  return body;
}

export const api = {
  get: <T = any>(path: string) => fetch(`/api${path}`, { credentials: 'same-origin' }).then(parse) as Promise<T>,
  send: <T = any>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
    fetch(`/api${path}`, {
      method, credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(parse) as Promise<T>,
  post: <T = any>(p: string, b?: unknown) => api.send<T>('POST', p, b ?? {}),
  patch: <T = any>(p: string, b: unknown) => api.send<T>('PATCH', p, b),
  del: <T = any>(p: string) => api.send<T>('DELETE', p),
  /** Multipart upload with progress (fetch has no upload progress). */
  upload: <T = any>(path: string, form: FormData, onProgress?: (pct: number) => void) =>
    new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api${path}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => parse(new Response(xhr.responseText, { status: xhr.status })).then(resolve, reject);
      xhr.onerror = () => reject(new ApiError(0, 'Network error during upload'));
      xhr.send(form);
    }),
};

export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
export const fmtBytes = (b: number) => (b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(1)} GB` : b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const fmtDate = (d: string | Date) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
