/** Wallet REST configuration or HTTP failures (server-side). */

export class WalletConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletConfigError";
  }
}

export class WalletApiError extends Error {
  readonly status: number;
  readonly bodySnippet?: string;

  constructor(status: number, message: string, bodySnippet?: string) {
    super(message);
    this.name = "WalletApiError";
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}
