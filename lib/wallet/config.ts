import "server-only";

import { WalletConfigError } from "@/lib/wallet/errors";

const DEFAULT_BASE = "https://rest.budgetbakers.com/wallet";

export function walletRestBase(): string {
  const raw = process.env.WALLET_REST_BASE_URL?.trim();
  return raw && raw.length > 0 ? raw.replace(/\/$/, "") : DEFAULT_BASE;
}

export function walletRestToken(): string {
  const t = process.env.WALLET_REST_TOKEN?.trim();
  if (!t) {
    throw new WalletConfigError(
      "Missing WALLET_REST_TOKEN. Add it to .env.local (see env.example)."
    );
  }
  return t;
}
