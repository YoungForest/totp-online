<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  HASH_ALGORITHMS,
  generateTotp,
  type HashAlgorithm,
} from './lib/totp'

type Mode = 'local' | 'server'

const mode = ref<Mode>('local')
const t0 = ref<number>(0)
const x = ref<number>(30)
const sharedSecret = ref<string>('12345678901234567890')
const digits = ref<number>(6)
const hashAlgorithm = ref<HashAlgorithm>('HmacSHA1')
const showSecret = ref<boolean>(false)
const autoRefresh = ref<boolean>(true)
const useNow = ref<boolean>(true)
const timestamp = ref<number>(Math.floor(Date.now() / 1000))

const otp = ref<string>('')
const errorMessage = ref<string>('')
const isLoading = ref<boolean>(false)
const copied = ref<boolean>(false)
let copyResetTimer: number | undefined

const validationError = computed<string>(() => {
  if (!sharedSecret.value) return 'Shared secret is required.'
  if (!Number.isInteger(digits.value) || digits.value < 1 || digits.value > 10) {
    return 'Digits must be an integer in [1, 10].'
  }
  if (!Number.isFinite(x.value) || x.value <= 0) {
    return 'Time step (X) must be a positive number.'
  }
  if (!Number.isFinite(t0.value)) return 'T0 must be a number.'
  if (!Number.isFinite(timestamp.value)) return 'Timestamp must be a number.'
  return ''
})

const periodInfo = computed(() => {
  if (!Number.isFinite(x.value) || x.value <= 0) return { progress: 0, remaining: 0 }
  const ts = useNow.value ? Math.floor(Date.now() / 1000) : timestamp.value
  const elapsed = ((ts - t0.value) % x.value + x.value) % x.value
  return {
    progress: elapsed / x.value,
    remaining: Math.max(0, x.value - elapsed),
  }
})

async function compute() {
  errorMessage.value = ''
  if (validationError.value) {
    otp.value = ''
    return
  }
  const ts = useNow.value ? Math.floor(Date.now() / 1000) : timestamp.value
  isLoading.value = true
  try {
    if (mode.value === 'local') {
      otp.value = await generateTotp({
        sharedSecret: sharedSecret.value,
        digits: digits.value,
        hashAlgorithm: hashAlgorithm.value,
        t0: t0.value,
        x: x.value,
        timestamp: ts,
      })
    } else {
      const res = await fetch('/api/TOTPGenerator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify({
          sharedSecret: sharedSecret.value,
          digits: digits.value,
          hashAlgorithm: hashAlgorithm.value,
          t0: t0.value,
          x: x.value,
          timestamp: ts,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ''}`)
      }
      const data = (await res.json()) as { code?: string }
      if (typeof data.code !== 'string') {
        throw new Error('Invalid response from API')
      }
      otp.value = data.code
    }
  } catch (err) {
    otp.value = ''
    errorMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    isLoading.value = false
  }
}

function refreshTimestamp() {
  timestamp.value = Math.floor(Date.now() / 1000)
}

async function copyOtp() {
  if (!otp.value) return
  try {
    await navigator.clipboard.writeText(otp.value)
    copied.value = true
    if (copyResetTimer) window.clearTimeout(copyResetTimer)
    copyResetTimer = window.setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    // Clipboard may be unavailable (e.g. insecure context); fail silently.
  }
}

let tickHandle: number | undefined
function startTicker() {
  stopTicker()
  tickHandle = window.setInterval(() => {
    if (autoRefresh.value && useNow.value) {
      timestamp.value = Math.floor(Date.now() / 1000)
      compute()
    }
  }, 1000)
}
function stopTicker() {
  if (tickHandle) window.clearInterval(tickHandle)
  tickHandle = undefined
}
startTicker()
onBeforeUnmount(() => {
  stopTicker()
  if (copyResetTimer) window.clearTimeout(copyResetTimer)
})

watch(
  [
    sharedSecret,
    digits,
    hashAlgorithm,
    t0,
    x,
    timestamp,
    mode,
    useNow,
  ],
  () => {
    compute()
  },
  { immediate: true },
)
</script>

<template>
  <div class="page">
    <header class="header">
      <h1>Online TOTP Generator</h1>
      <p class="tagline">
        RFC 6238 time-based one-time passwords, generated locally in your
        browser by default.
      </p>
    </header>

    <main class="main">
      <section class="card">
        <div class="mode-toggle" role="radiogroup" aria-label="Computation mode">
          <label :class="{ active: mode === 'local' }">
            <input v-model="mode" type="radio" value="local" />
            <span>Local (recommended)</span>
          </label>
          <label :class="{ active: mode === 'server' }">
            <input v-model="mode" type="radio" value="server" />
            <span>Azure demo</span>
          </label>
        </div>

        <p v-if="mode === 'local'" class="hint hint-success">
          ✅ Your shared secret never leaves this browser tab.
        </p>
        <p v-else class="hint hint-warn">
          ⚠️ Your shared secret will be sent over HTTPS to the Azure Function
          API at <code>/api/TOTPGenerator</code>. Use this mode only with
          throwaway / test secrets.
        </p>

        <form class="form" @submit.prevent="compute">
          <div class="field">
            <label for="sharedSecret">Shared secret</label>
            <div class="row">
              <input
                id="sharedSecret"
                v-model="sharedSecret"
                :type="showSecret ? 'text' : 'password'"
                autocomplete="off"
                spellcheck="false"
                placeholder="e.g. 12345678901234567890"
              />
              <button
                type="button"
                class="btn-secondary"
                @click="showSecret = !showSecret"
              >
                {{ showSecret ? 'Hide' : 'Show' }}
              </button>
            </div>
          </div>

          <div class="grid">
            <div class="field">
              <label for="digits">Digits (1–10)</label>
              <input
                id="digits"
                v-model.number="digits"
                type="number"
                min="1"
                max="10"
                step="1"
              />
            </div>
            <div class="field">
              <label for="algo">Hash algorithm</label>
              <select id="algo" v-model="hashAlgorithm">
                <option v-for="a in HASH_ALGORITHMS" :key="a" :value="a">
                  {{ a }}
                </option>
              </select>
            </div>
            <div class="field">
              <label for="t0">T0 (initial time, seconds)</label>
              <input id="t0" v-model.number="t0" type="number" step="1" />
            </div>
            <div class="field">
              <label for="x">X (time step, seconds)</label>
              <input id="x" v-model.number="x" type="number" min="1" step="1" />
            </div>
          </div>

          <div class="field">
            <label>Timestamp</label>
            <div class="row">
              <label class="inline-check">
                <input v-model="useNow" type="checkbox" />
                Use current time
              </label>
              <input
                v-model.number="timestamp"
                type="number"
                step="1"
                :disabled="useNow"
              />
              <button
                type="button"
                class="btn-secondary"
                :disabled="useNow"
                @click="refreshTimestamp"
              >
                Now
              </button>
            </div>
          </div>

          <div class="field inline">
            <label class="inline-check">
              <input v-model="autoRefresh" type="checkbox" :disabled="!useNow" />
              Auto-refresh while ticking
            </label>
          </div>
        </form>

        <p v-if="validationError" class="error">{{ validationError }}</p>
        <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
      </section>

      <section class="card result-card">
        <div class="result-header">
          <h2>OTP</h2>
          <span v-if="useNow" class="period">
            ⏱ {{ periodInfo.remaining }}s left
          </span>
        </div>
        <div
          class="progress"
          :style="{ '--p': `${(periodInfo.progress * 100).toFixed(2)}%` }"
          aria-hidden="true"
        />
        <div class="otp" :class="{ loading: isLoading }">
          <span class="otp-value mono">{{ otp || '——' }}</span>
          <button
            type="button"
            class="btn-primary"
            :disabled="!otp"
            @click="copyOtp"
          >
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </section>

      <section class="card about">
        <h2>About</h2>
        <p>
          This tool implements
          <a href="https://datatracker.ietf.org/doc/html/rfc6238" target="_blank" rel="noopener">
            RFC 6238 (TOTP)
          </a>
          on top of
          <a href="https://datatracker.ietf.org/doc/html/rfc4226" target="_blank" rel="noopener">
            RFC 4226 (HOTP)
          </a>
          using HMAC-SHA1/256/512.
        </p>
        <p>
          The shared secret is interpreted as raw UTF-8 bytes, matching the
          ASCII reference vectors in RFC 6238 Appendix B.
        </p>
        <p>
          <strong>Local mode</strong> (default) runs entirely in your browser
          using the Web Crypto API; no network requests are made.
          <strong>Azure demo mode</strong> POSTs the parameters to a Node.js
          Azure Function over HTTPS, demonstrating Azure Static Web Apps
          managed functions.
        </p>
        <p>
          Source:
          <a href="https://github.com/YoungForest/totp-online" target="_blank" rel="noopener">
            github.com/YoungForest/totp-online
          </a>
        </p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1rem 4rem;
}

.header {
  margin-bottom: 1.5rem;
}

.header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.75rem;
}

.tagline {
  margin: 0;
  color: var(--fg-muted);
}

.main {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.25rem;
  box-shadow: var(--shadow);
}

.mode-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.mode-toggle label {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  background: var(--bg);
}

.mode-toggle label.active {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.mode-toggle input {
  margin: 0;
}

.hint {
  margin: 0 0 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.9rem;
}

.hint-success {
  background: color-mix(in srgb, var(--success) 10%, transparent);
  color: var(--success);
}

.hint-warn {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.hint code {
  background: var(--code-bg);
  padding: 0 0.25rem;
  border-radius: 3px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field.inline {
  flex-direction: row;
  align-items: center;
}

.field label {
  font-size: 0.85rem;
  color: var(--fg-muted);
}

.row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.row > input,
.row > select {
  flex: 1;
}

.inline-check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: var(--fg);
  white-space: nowrap;
}

.inline-check input {
  margin: 0;
}

input[type='text'],
input[type='password'],
input[type='number'],
select {
  width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
  font-size: 0.95rem;
  font-family: inherit;
}

input:focus,
select:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.btn-primary,
.btn-secondary {
  padding: 0.5rem 0.85rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 0.9rem;
  background: var(--bg);
  color: var(--fg);
  font-family: inherit;
}

.btn-primary {
  background: var(--accent);
  color: var(--accent-fg);
  border-color: var(--accent);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  margin: 0.75rem 0 0;
  color: var(--danger);
  font-size: 0.9rem;
}

.result-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.result-header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.period {
  color: var(--fg-muted);
  font-size: 0.85rem;
}

.progress {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.progress::after {
  content: '';
  position: absolute;
  inset: 0;
  width: var(--p, 0%);
  background: var(--accent);
  transition: width 250ms linear;
}

.otp {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.25rem;
}

.otp-value {
  flex: 1;
  font-size: 2rem;
  letter-spacing: 0.15em;
  font-weight: 600;
  color: var(--accent);
}

.otp.loading .otp-value {
  opacity: 0.6;
}

.about h2 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}

.about p {
  margin: 0.4rem 0;
  font-size: 0.95rem;
  color: var(--fg-muted);
}

.about a {
  color: var(--accent);
}

@media (max-width: 480px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
