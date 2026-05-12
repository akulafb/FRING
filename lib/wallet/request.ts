import "server-only";

import { WalletApiError } from "@/lib/wallet/errors";
import { walletRestBase, walletRestToken } from "@/lib/wallet/config";
import { cacheGet, cacheSet } from "@/lib/wallet/cache";

function serializeParams(search: URLSearchParams): string {
  const entries = [...search.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return new URLSearchParams(entries).toString();
}

function cacheKey(method: string, path: string, query: string) {
  return `${method}:${path}?${query}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type WalletFetchOpts = {
  /** GET only in this codebase */
  cacheTtlMs?: number;
  skipCache?: boolean;
  signal?: AbortSignal;
};

async function walletFetchUncached(path: string, query: string) {
  const base = walletRestBase();
  const token = walletRestToken();
  const url = `${base}${path}?${query}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };

  async function attempt(): Promise<Response> {
    return fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });
  }

  let res = await attempt();
  if (res.status === 429) {
    const ra = res.headers.get("Retry-After");
    const secs = Math.min(parseInt(ra ?? "5", 10) || 5, 120);
    await sleep(secs * 1000);
    res = await attempt();
  }

  const text = await res.text();

  if (!res.ok) {
    throw new WalletApiError(
      res.status,
      `Wallet REST ${path} returned ${res.status}`,
      text.slice(0, 500)
    );
  }

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new WalletApiError(
      res.status,
      `Wallet REST ${path}: response was not JSON`,
      text.slice(0, 200)
    );
  }
}

export async function walletGetJson(
  path: string,
  params: URLSearchParams | Record<string, string | undefined> = {},
  opts: WalletFetchOpts = {}
): Promise<unknown> {
  const search =
    params instanceof URLSearchParams
      ? params
      : new URLSearchParams(
          Object.entries(params).filter(
            (e): e is [string, string] =>
              e[1] !== undefined && e[1] !== ""
          )
        );

  const query = serializeParams(search);
  const key = cacheKey("GET", path, query);

  if (!opts.skipCache && opts.cacheTtlMs && opts.cacheTtlMs > 0) {
    const hit = cacheGet<unknown>(key);
    if (hit !== undefined) {
      return hit;
    }
  }

  const json = await walletFetchUncached(path, query);

  if (!opts.skipCache && opts.cacheTtlMs && opts.cacheTtlMs > 0) {
    cacheSet(key, json, opts.cacheTtlMs);
  }

  return json;
}
