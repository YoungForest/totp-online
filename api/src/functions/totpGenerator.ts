import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions'
import { generateTotp, isHashAlgorithm } from '../totp.js'

interface RequestBody {
  sharedSecret?: unknown
  digits?: unknown
  hashAlgorithm?: unknown
  t0?: unknown
  x?: unknown
  timestamp?: unknown
}

const NO_STORE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
}

function bad(message: string, status = 400): HttpResponseInit {
  return {
    status,
    headers: NO_STORE_HEADERS,
    jsonBody: { error: message },
  }
}

function asNumber(name: string, v: unknown, fallback?: number): number {
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback
    throw new RangeError(`${name} is required`)
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new RangeError(`${name} must be a finite number`)
  }
  return v
}

export async function totpGenerator(
  request: HttpRequest,
  // Context is intentionally unused; we deliberately do NOT log request
  // bodies because they contain shared secrets.
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method !== 'POST') {
    return bad('Use POST with a JSON body', 405)
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return bad('Invalid JSON body')
  }
  if (body === null || typeof body !== 'object') {
    return bad('Body must be a JSON object')
  }

  const { sharedSecret, digits, hashAlgorithm, t0, x, timestamp } = body

  if (typeof sharedSecret !== 'string' || sharedSecret.length === 0) {
    return bad('sharedSecret must be a non-empty string')
  }
  if (!isHashAlgorithm(hashAlgorithm)) {
    return bad('hashAlgorithm must be HmacSHA1, HmacSHA256 or HmacSHA512')
  }

  let nDigits: number
  let nX: number
  let nT0: number
  let nTimestamp: number
  try {
    nDigits = asNumber('digits', digits)
    nX = asNumber('x', x, 30)
    nT0 = asNumber('t0', t0, 0)
    nTimestamp = asNumber('timestamp', timestamp, Math.floor(Date.now() / 1000))
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'invalid input')
  }

  try {
    const code = await generateTotp({
      sharedSecret,
      digits: nDigits,
      hashAlgorithm,
      t0: nT0,
      x: nX,
      timestamp: nTimestamp,
    })
    return {
      status: 200,
      headers: NO_STORE_HEADERS,
      jsonBody: { code },
    }
  } catch (err) {
    return bad(err instanceof Error ? err.message : 'unknown error')
  }
}

app.http('TOTPGenerator', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'TOTPGenerator',
  handler: totpGenerator,
})
