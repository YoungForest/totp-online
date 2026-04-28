/**
 * Shared TOTP implementation. **Kept in sync** with
 * `../../../src/lib/totp.ts` — the SPA frontend uses the same code.
 * If you change one, change the other.
 *
 * Both runtimes (browser + Node 20+) expose Web Crypto on the global
 * `crypto` object, so the same code runs unmodified.
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
  sharedSecret: string
  digits: number
  hashAlgorithm: HashAlgorithm
  t0?: number
  x?: number
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

  const offset = sig[sig.length - 1] & 0x0f
  const binary =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff)

  const otp = binary % 10 ** digits
  return otp.toString().padStart(digits, '0')
}
