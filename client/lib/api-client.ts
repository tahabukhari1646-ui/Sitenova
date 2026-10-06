const TOKEN_COOKIE_NAME = "sentinel_token";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${TOKEN_COOKIE_NAME}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function setToken(token: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; secure"
      : "";
  document.cookie = `${TOKEN_COOKIE_NAME}=${encodeURIComponent(
    token
  )}; path=/; max-age=${maxAgeSeconds}; samesite=lax${secure}`;
}

export function clearToken() {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE_NAME}=; path=/; max-age=0`;
}

type ApiResponse<T> =
  | ({ success: true } & T)
  | { success: false; error: string };

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`/api${path}`, { ...options, headers });
  const body = (await response.json()) as ApiResponse<T>;

  if (!body.success) {
    if (response.status === 401) {
      clearToken();
      if (typeof window !== "undefined") {
        // Hooks (useRouter) aren't available in this plain module, and a 401
        // means the session is gone — a hard redirect is the correct reset.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login";
      }
    }
    throw new ApiError(body.error, response.status);
  }

  return body as unknown as T;
}
