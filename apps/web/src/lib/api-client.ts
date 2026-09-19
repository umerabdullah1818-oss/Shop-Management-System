import type { ApiErrorBody } from "@shop/shared";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
const TOKEN_STORAGE_KEY = "shop.session.token";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // Private-browsing/blocked storage — session simply won't persist across reloads.
    return null;
  }
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore — matches getToken's fallback (SEC-003 session just won't persist).
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * Every request goes to the Local Shop Server (docs/09-api-design.md §0) —
 * the browser never calls the cloud directly (thin-LAN-client model,
 * Decision #16). Errors are unwrapped into ApiError using the standard
 * { error: { code, message, details } } envelope so callers can branch on
 * `code` (e.g. BELOW_COST_BLOCKED) without string-matching messages.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const token = getToken();
  const response = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = await response.json();
    } catch {
      // Non-JSON error body (e.g. a proxy/network error page) — fall through to the generic message below.
    }
    throw new ApiError(
      body?.error.code ?? "UNKNOWN_ERROR",
      body?.error.message ?? "Something went wrong. Please try again.",
      body?.error.details,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}
