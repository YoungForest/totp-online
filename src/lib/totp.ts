/**
 * Shared TOTP implementation used by both the SPA (browser) and the
 * Azure Functions API (Node 20+). Both runtimes expose the Web Crypto
 * API on the global `crypto` object, so the same code runs unmodified.
 *
 * Reference: RFC 6238 (TOTP) + RFC 4226 (HOTP).
 */

export type HashAlgorithm = 'HmacSHA1' | 'HmacSHA256' | 'HmacSHA512'

export const HASH_ALGORITHMS: readonly HashAlgorithm[] = [
  'HmacSHA1',
  'HmacSHA256',
  'HmacSHA512',
] as const

export interface GenerateTotpOptions {
  /** Shared secret. Used as raw UTF-8 bytes. */
  sharedSecret: string
  /** Number of digits in the OTP. Must be an integer in [1, 10]. */
  digits: number
  /** HMAC hash algorithm. */
  hashAlgorithm: HashAlgorithm
  /** Initial time (T0) in unix seconds. Default 0. */
  t0?: number
  /** Time step (X) in seconds. Must be > 0. Default 30. */
  x?: number
  /** Current timestamp in unix seconds. Default = current wall-clock. */
  timestamp?: number
}

const SUBTLE_NAMES: Record<HashAlgorithm, string> = {
  HmacSHA1: 'SHA-1',
  HmacSHA256: 'SHA-256',
  HmacSHA512: 'SHA-512',
}

export function isHashAlgorithm(value: unknown): value is HashAlgorithm {
  return typeof value === 'string' && (value as HashAlgorithm) in SUBTLE_NAMES
}

/**
 * Generate a TOTP code per RFC 6238.
 *
 * The shared secret is interpreted as raw UTF-8 bytes. This matches the
 * reference test vectors in RFC 6238 Appendix B (which use ASCII secrets
 * such as "12345678901234567890") and the original Java backend's
 * behavior for ASCII inputs.
 *
 * Compatibility note: the original Java backend had a bug where
 * `digits=10` actually returned a value modulo 10^9 (only 9 significant
 * digits). This implementation fixes that to use 10^digits as the spec
 * requires, so digits=10 outputs may differ from the legacy backend.
 */
export async function generateTotp(opts: GenerateTotpOptions): Promise<string> {
  const {
    sharedSecret,
    digits,
    hashAlgorithm,
    t0 = 0,
    x = 30,
    timestamp = Math.floor(Date.now() / 1000),
  } = opts

  if (typeof sharedSecret !== 'string' || sharedSecret.length === 0) {
    throw new RangeError('sharedSecret must be a non-empty string')
  }
  if (!Number.isInteger(digits) || digits < 1 || digits > 10) {
    throw new RangeError('digits must be an integer in [1, 10]')
  }
  if (!Number.isFinite(x) || x <= 0) {
    throw new RangeError('x (time step) must be a positive number')
  }
  if (!Number.isFinite(t0)) {
    throw new RangeError('t0 must be a finite number')
  }
  if (!Number.isFinite(timestamp)) {
    throw new RangeError('timestamp must be a finite number')
  }
  if (!isHashAlgorithm(hashAlgorithm)) {
    throw new RangeError(`unknown hashAlgorithm: ${String(hashAlgorithm)}`)
  }

  // Counter T = floor((current - T0) / X), big-endian 64-bit.
  // Use BigInt to avoid Number-precision issues for large timestamps.
  const t = BigInt(Math.floor((timestamp - t0) / x))
  const counter = new ArrayBuffer(8)
  new DataView(counter).setBigInt64(0, t, false)

  const keyBytes = new TextEncoder().encode(sharedSecret)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: SUBTLE_NAMES[hashAlgorithm] },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, counter))

  // Dynamic truncation, RFC 4226 §5.3.
  const offset = sig[sig.length - 1] & 0x0f
  const binary =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff)

  const otp = binary % 10 ** digits
  return otp.toString().padStart(digits, '0')
}
