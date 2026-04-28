import { describe, expect, it } from 'vitest'
import { generateTotp, isHashAlgorithm, HASH_ALGORITHMS } from './totp'

// RFC 6238 Appendix B reference vectors. ASCII secrets sized to each
// algorithm's block size, 8-digit codes, T0=0, X=30.
const SECRET_SHA1 = '12345678901234567890'
const SECRET_SHA256 = '12345678901234567890123456789012'
const SECRET_SHA512 =
  '1234567890123456789012345678901234567890123456789012345678901234'

const RFC_VECTORS: ReadonlyArray<readonly [number, string, string, string]> = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
]

describe('generateTotp — RFC 6238 reference vectors', () => {
  for (const [time, sha1, sha256, sha512] of RFC_VECTORS) {
    it(`HmacSHA1 @ T=${time} → ${sha1}`, async () => {
      expect(
        await generateTotp({
          sharedSecret: SECRET_SHA1,
          digits: 8,
          hashAlgorithm: 'HmacSHA1',
          timestamp: time,
        }),
      ).toBe(sha1)
    })
    it(`HmacSHA256 @ T=${time} → ${sha256}`, async () => {
      expect(
        await generateTotp({
          sharedSecret: SECRET_SHA256,
          digits: 8,
          hashAlgorithm: 'HmacSHA256',
          timestamp: time,
        }),
      ).toBe(sha256)
    })
    it(`HmacSHA512 @ T=${time} → ${sha512}`, async () => {
      expect(
        await generateTotp({
          sharedSecret: SECRET_SHA512,
          digits: 8,
          hashAlgorithm: 'HmacSHA512',
          timestamp: time,
        }),
      ).toBe(sha512)
    })
  }
})

describe('generateTotp — output shape', () => {
  it('zero-pads short OTPs to the requested digit count', async () => {
    const otp = await generateTotp({
      sharedSecret: 'abc',
      digits: 6,
      hashAlgorithm: 'HmacSHA1',
      timestamp: 0,
    })
    expect(otp).toMatch(/^\d{6}$/)
  })

  it('supports 10-digit output (regression for legacy 10^9 bug)', async () => {
    const otp = await generateTotp({
      sharedSecret: 'abc',
      digits: 10,
      hashAlgorithm: 'HmacSHA1',
      timestamp: 0,
    })
    expect(otp).toMatch(/^\d{10}$/)
  })

  it('respects t0 and x (time step)', async () => {
    // Same effective T -> same OTP.
    const a = await generateTotp({
      sharedSecret: SECRET_SHA1,
      digits: 8,
      hashAlgorithm: 'HmacSHA1',
      t0: 0,
      x: 30,
      timestamp: 60,
    })
    const b = await generateTotp({
      sharedSecret: SECRET_SHA1,
      digits: 8,
      hashAlgorithm: 'HmacSHA1',
      t0: 30,
      x: 30,
      timestamp: 90,
    })
    expect(a).toBe(b)
  })
})

describe('generateTotp — input validation', () => {
  const base = {
    sharedSecret: 'abc',
    digits: 6,
    hashAlgorithm: 'HmacSHA1' as const,
    timestamp: 0,
  }

  it('rejects digits below 1', async () => {
    await expect(generateTotp({ ...base, digits: 0 })).rejects.toThrow(RangeError)
  })
  it('rejects digits above 10', async () => {
    await expect(generateTotp({ ...base, digits: 11 })).rejects.toThrow(RangeError)
  })
  it('rejects non-integer digits', async () => {
    await expect(generateTotp({ ...base, digits: 6.5 })).rejects.toThrow(RangeError)
  })
  it('rejects x <= 0', async () => {
    await expect(generateTotp({ ...base, x: 0 })).rejects.toThrow(RangeError)
  })
  it('rejects negative x', async () => {
    await expect(generateTotp({ ...base, x: -1 })).rejects.toThrow(RangeError)
  })
  it('rejects empty secret', async () => {
    await expect(generateTotp({ ...base, sharedSecret: '' })).rejects.toThrow(
      RangeError,
    )
  })
  it('rejects unknown algorithm', async () => {
    await expect(
      generateTotp({ ...base, hashAlgorithm: 'HmacMD5' as unknown as 'HmacSHA1' }),
    ).rejects.toThrow(RangeError)
  })
})

describe('isHashAlgorithm', () => {
  it('accepts the three supported algorithms', () => {
    for (const a of HASH_ALGORITHMS) {
      expect(isHashAlgorithm(a)).toBe(true)
    }
  })
  it('rejects everything else', () => {
    for (const v of ['', 'HmacMD5', 'sha1', 1, null, undefined, {}]) {
      expect(isHashAlgorithm(v)).toBe(false)
    }
  })
})
