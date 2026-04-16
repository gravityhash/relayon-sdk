// =============================================
// @relayon/sdk — Webhook Signature Verification
// Use this in your server to verify Relayon webhook requests
// =============================================

import * as crypto from 'crypto';

/**
 * Verify a Relayon webhook signature.
 *
 * @param body - The raw request body string
 * @param signature - The X-Relayon-Signature header value
 * @param secret - Your webhook secret
 * @param maxAgeMs - Maximum signature age in ms (default: 5 minutes)
 * @returns true if the signature is valid
 *
 * @example
 * ```typescript
 * import { verifyWebhookSignature } from '@relayon/sdk'
 *
 * app.post('/webhook', (req, res) => {
 *   const isValid = verifyWebhookSignature(
 *     req.body,
 *     req.headers['x-relayon-signature'],
 *     process.env.WEBHOOK_SECRET
 *   )
 *   if (!isValid) return res.status(401).send('Invalid signature')
 *   // Process the webhook...
 * })
 * ```
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string,
  maxAgeMs: number = 300000,
): boolean {
  if (!body || !signature || !secret) return false;

  const parts = signature.split(',');
  const timestampPart = parts.find(p => p.startsWith('t='));
  const hmacPart = parts.find(p => p.startsWith('sha256='));

  if (!timestampPart || !hmacPart) return false;

  const timestamp = parseInt(timestampPart.substring(2), 10);
  const receivedHmac = hmacPart.substring(7);

  // Check timestamp freshness
  const age = Date.now() - timestamp * 1000;
  if (age > maxAgeMs || age < -60000) return false;

  // Compute expected HMAC
  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  // Constant-time comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedHmac, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}
