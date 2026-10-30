import { koboToDecimal, type Kobo } from "../lib/money";

export interface CreateCheckoutParams {
  reference: string; amountKobo: Kobo; customer: { name: string; email: string; phone: string };
  successUrl: string; cancelUrl: string; metadata: Record<string, string>; expiresInMinutes: number;
}
export interface CheckoutSession { checkoutId: string; checkoutUrl: string }
export interface PaymentGateway { createCheckout(p: CreateCheckoutParams): Promise<CheckoutSession> }
export class GatewayError extends Error { constructor(message: string, readonly retryable: boolean) { super(message); } }

/** Bachs hosted checkout, raw NGN amount. Sandbox: https://sandbox-api.bachs.io (sk_sandbox_ keys). Live: https://api.bachs.io. */
export class BachsGateway implements PaymentGateway {
  constructor(private cfg: { apiKey: string; baseUrl: string; fetchImpl?: typeof fetch; timeoutMs?: number }) {}
  async createCheckout(p: CreateCheckoutParams): Promise<CheckoutSession> {
    const f = this.cfg.fetchImpl ?? fetch;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs ?? 15_000);
    try {
      const res = await f(`${this.cfg.baseUrl}/v1/checkout-sessions`, {
        method: "POST", signal: ctrl.signal,
        headers: { Authorization: `Bearer ${this.cfg.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": p.reference },
        body: JSON.stringify({
          pricing: { currency: "NGN", amount: koboToDecimal(p.amountKobo) },
          customer: { email: p.customer.email, name: p.customer.name, phone_number: p.customer.phone },
          reference: p.reference, success_url: p.successUrl, cancel_url: p.cancelUrl,
          metadata: p.metadata, expires_in_minutes: p.expiresInMinutes,
        }),
      });
      const text = await res.text();
      let json: any = null; try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
      if (!res.ok) throw new GatewayError(`Bachs responded ${res.status}`, res.status >= 500 || res.status === 429);
      if (!json || typeof json.checkout_id !== "string" || typeof json.checkout_url !== "string") throw new GatewayError("Unexpected Bachs response", true);
      return { checkoutId: json.checkout_id, checkoutUrl: json.checkout_url };
    } catch (e) {
      if (e instanceof GatewayError) throw e;
      throw new GatewayError("Could not reach the payment provider", true);
    } finally { clearTimeout(t); }
  }
}
