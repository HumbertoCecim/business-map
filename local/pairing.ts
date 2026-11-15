import { digest, token } from "./runtime";
export class PairingCodes {
  private codes = new Map<string, { kind: "viewer" | "paseo"; expires: number }>();
  private failures: number[] = [];
  constructor(private now = Date.now) {}
  issue(kind: "viewer" | "paseo") {
    const now = this.now();
    for (const [key, code] of this.codes) if (code.expires <= now) this.codes.delete(key);
    if (this.codes.size >= 64) throw new Error("Too many unclaimed pairing codes; wait for them to expire.");
    const code = token(), expires = now + (kind === "viewer" ? 60_000 : 120_000);
    this.codes.set(digest(code), { kind, expires });
    return { code, expiresAt: new Date(expires).toISOString() };
  }
  consume(kind: "viewer" | "paseo", raw: unknown) {
    const now = this.now(); this.failures = this.failures.filter(time => now - time < 60_000);
    if (this.failures.length >= 20) throw new Error("FORBIDDEN: pairing attempt limit reached. Wait one minute.");
    const key = typeof raw === "string" && raw.length < 200 ? digest(raw) : "", code = this.codes.get(key);
    if (!code || code.kind !== kind || code.expires <= now) { this.failures.push(now); throw new Error("FORBIDDEN: pairing code is invalid, expired, or already used."); }
    this.codes.delete(key);
    return token();
  }
}
