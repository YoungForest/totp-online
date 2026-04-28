#!/usr/bin/env node
/**
 * End-to-end deployment verifier for the totp-online API.
 *
 * Runs the full RFC 6238 Appendix B test vector grid (HmacSHA1/256/512 ×
 * 6 timestamps = 18 cases) plus a few negative-path checks against a live
 * deployment and reports pass/fail per case.
 *
 * Usage:
 *   node scripts/verify-deployment.mjs                   # default URL below
 *   node scripts/verify-deployment.mjs https://example   # override URL
 *
 * Exit code 0 if every case passes, 1 otherwise.
 */

const DEFAULT_BASE = 'https://ambitious-coast-0265e0a0f.5.azurestaticapps.net'

const baseUrl = (process.argv[2] || DEFAULT_BASE).replace(/\/+$/, '')
const apiUrl = `${baseUrl}/api/TOTPGenerator`

const SECRET_SHA1 = '12345678901234567890'
const SECRET_SHA256 = '12345678901234567890123456789012'
const SECRET_SHA512 =
  '1234567890123456789012345678901234567890123456789012345678901234'

// RFC 6238 Appendix B test vectors. T0=0, X=30, 8-digit codes.
const RFC_VECTORS = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
]

const cases = []
for (const [time, sha1, sha256, sha512] of RFC_VECTORS) {
  cases.push({
    name: `RFC 6238 SHA1 @ T=${time}`,
    body: { sharedSecret: SECRET_SHA1, digits: 8, hashAlgorithm: 'HmacSHA1', t0: 0, x: 30, timestamp: time },
    expect: { status: 200, code: sha1 },
  })
  cases.push({
    name: `RFC 6238 SHA256 @ T=${time}`,
    body: { sharedSecret: SECRET_SHA256, digits: 8, hashAlgorithm: 'HmacSHA256', t0: 0, x: 30, timestamp: time },
    expect: { status: 200, code: sha256 },
  })
  cases.push({
    name: `RFC 6238 SHA512 @ T=${time}`,
    body: { sharedSecret: SECRET_SHA512, digits: 8, hashAlgorithm: 'HmacSHA512', t0: 0, x: 30, timestamp: time },
    expect: { status: 200, code: sha512 },
  })
}

// Negative cases (validation should reject before we hit the algorithm)
cases.push({
  name: 'rejects unknown hash algorithm',
  body: { sharedSecret: 'abc', digits: 6, hashAlgorithm: 'HmacMD5', t0: 0, x: 30, timestamp: 0 },
  expect: { status: 400 },
})
cases.push({
  name: 'rejects empty shared secret',
  body: { sharedSecret: '', digits: 6, hashAlgorithm: 'HmacSHA1', t0: 0, x: 30, timestamp: 0 },
  expect: { status: 400 },
})
cases.push({
  name: 'rejects digits=0',
  body: { sharedSecret: 'abc', digits: 0, hashAlgorithm: 'HmacSHA1', t0: 0, x: 30, timestamp: 0 },
  expect: { status: 400 },
})
cases.push({
  name: 'rejects digits=11',
  body: { sharedSecret: 'abc', digits: 11, hashAlgorithm: 'HmacSHA1', t0: 0, x: 30, timestamp: 0 },
  expect: { status: 400 },
})
cases.push({
  name: 'rejects x=0',
  body: { sharedSecret: 'abc', digits: 6, hashAlgorithm: 'HmacSHA1', t0: 0, x: 0, timestamp: 0 },
  expect: { status: 400 },
})

console.log(`▶ Verifying deployment at ${apiUrl}\n`)

let passed = 0
let failed = 0
const failures = []

const start = Date.now()
for (const c of cases) {
  let status = 0
  let json = null
  let text = ''
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(c.body),
    })
    status = res.status
    text = await res.text()
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
  } catch (err) {
    failures.push({ name: c.name, reason: `network error: ${err?.message || err}` })
    console.log(`  ✗ ${c.name}  (network error)`)
    failed++
    continue
  }

  const reasons = []
  if (status !== c.expect.status) {
    reasons.push(`status ${status} ≠ expected ${c.expect.status}`)
  }
  if (c.expect.code !== undefined) {
    if (!json || json.code !== c.expect.code) {
      reasons.push(`code ${JSON.stringify(json?.code)} ≠ expected ${c.expect.code}`)
    }
  }
  if (reasons.length === 0) {
    passed++
    console.log(`  ✓ ${c.name}`)
  } else {
    failed++
    failures.push({ name: c.name, reason: reasons.join('; '), body: text })
    console.log(`  ✗ ${c.name}  (${reasons.join('; ')})`)
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1)
console.log(`\n${passed}/${cases.length} passed in ${elapsed}s`)

if (failed > 0) {
  console.log('\nFailure details:')
  for (const f of failures) {
    console.log(`  • ${f.name}: ${f.reason}`)
    if (f.body) console.log(`      body: ${f.body.slice(0, 200)}`)
  }
  process.exit(1)
}
