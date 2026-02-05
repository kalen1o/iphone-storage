export type ApiError = {
  status: number;
  message: string;
  body?: unknown;
};

function getApiBaseUrl() {
  const envUrl = process.env.REMIX_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) return envUrl.replace(/\/+$/, '');
  return 'http://localhost/api';
}

export async function apiFetch<T>(
  path: string,
  opts?: { method?: string; token?: string; body?: unknown; headers?: HeadersInit }
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  const headers = new Headers(opts?.headers);
  headers.set('Content-Type', 'application/json');
  if (opts?.token) headers.set('Authorization', `Bearer ${opts.token}`);

  const res = await fetch(url, {
    method: opts?.method || 'GET',
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const maybeJson = contentType.includes('application/json');
  const data = maybeJson ? await res.json().catch(() => undefined) : await res.text().catch(() => undefined);

  if (!res.ok) {
    const msg =
      (typeof data === 'object' && data && 'error' in (data as any) && String((data as any).error)) ||
      (typeof data === 'string' && data) ||
      `HTTP ${res.status}`;
    throw { status: res.status, message: msg, body: data } satisfies ApiError;
  }

  return data as T;
}
