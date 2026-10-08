export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
console.log(API);

const get = (k: string) =>
  typeof window === "undefined" ? null : window.localStorage.getItem(k);

export const tokens = {
  access: () => get("access"),
  set(a: string, r: string) {
    localStorage.setItem("access", a);
    localStorage.setItem("refresh", r);
  },
  clear() {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
  },
  has: () => !!get("access"),
};

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const rt = get("refresh");
  if (!rt) return false;
  refreshing ??= fetch(`${API}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: rt }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      const t = await r.json();
      tokens.set(t.accessToken, t.refreshToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
  retry = true,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(tokens.access()
        ? { authorization: `Bearer ${tokens.access()}` }
        : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && retry && (await refresh()))
    return api<T>(path, opts, false);
  if (res.status === 401) {
    tokens.clear();
    window.dispatchEvent(new Event("auth:logout"));
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const msg = Array.isArray(j.message) ? j.message.join(", ") : j.message;
    throw new ApiError(res.status, msg ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
