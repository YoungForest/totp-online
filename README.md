# totp-online

A small RFC 6238 [Time-based One-Time Password](https://datatracker.ietf.org/doc/html/rfc6238)
generator. Vue 3 + Vite SPA hosted on **Azure Static Web Apps**, with an
optional Node.js **Azure Functions** API for demonstration.

> **Local mode is the default.** The shared secret never leaves your
> browser. The Azure API is only used if you switch to the "Azure demo"
> tab — please use it only with throwaway / test secrets.

## Features

- HMAC-SHA1 / SHA-256 / SHA-512
- Configurable T0, X (time step), digits (1–10), algorithm
- Live progress bar + auto-refresh
- Copy-to-clipboard
- Dark mode
- Tested against the RFC 6238 Appendix B reference vectors

## Architecture

```
┌────────────────────────── totp-online (this repo) ──────────────────────────┐
│                                                                             │
│   Vue 3 SPA  ─── Azure Function mode ──► /api/TOTPGenerator ──► Functions   │
│                  (POST + JSON, default)                         (Node 20)   │
│       │                                                                     │
│       └─── Local mode ───► Web Crypto API (in your browser)                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

The SPA and the Functions API are deployed together by the Azure Static
Web Apps GitHub Action — there is **no separate Function App** and no
function-key in the source.

The TOTP algorithm is implemented once in [`src/lib/totp.ts`](src/lib/totp.ts)
using Web Crypto. The Functions API at
[`api/src/totp.ts`](api/src/totp.ts) is a verbatim copy (kept in sync)
because Azure Static Web Apps treats `api/` as a self-contained npm
package. Both run unmodified on Node 20+ and modern browsers.

The original Java implementation lives in the sibling repo
[`YoungForest/totp-functions`](https://github.com/YoungForest/totp-functions)
as a reference. It targeted a standalone `totpfast.azurewebsites.net`
Function App that has since been removed; this repo replaces it with
SWA managed functions but keeps the algorithm logically identical.

## Local development

Requirements: Node.js ≥ 20, [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
(only needed if you want to run the API locally).

```sh
# Frontend
npm install
npm run dev          # http://localhost:5173

# (optional) API on http://localhost:7071, auto-proxied via Vite at /api
cd api
npm install
npm run start
```

## Tests

```sh
npm test                # Vitest – RFC 6238 vectors + input validation (30 unit tests)
npm run verify:deploy   # POST every RFC vector at the live API and assert outputs (23 cases)
```

`npm run verify:deploy` defaults to the production URL above. To verify a
PR/staging environment, pass the URL as the first argument:

```sh
node scripts/verify-deployment.mjs https://my-pr-environment.azurestaticapps.net
```

## Production build

```sh
npm run build        # outputs dist/
cd api && npm run build   # outputs api/dist/
```

## Azure deployment topology

Today (2026-04-28) the `topt` resource group on subscription `Visual
Studio Enterprise Subscription` (tenant `393e9d95-…`) contains:

| Resource                                | Type                                  | Status     | Used by    |
|-----------------------------------------|---------------------------------------|------------|------------|
| `topt-online`                           | `Microsoft.Web/staticSites` (Free)    | Ready      | This repo  |
| `topta5c6`                              | Storage account (Function backing)    | Available  | Java FA    |
| `ASP-topt-8671`                         | App Service Plan                      | Ready      | Java FA    |
| `totp-functions`                        | `Microsoft.Web/sites` (Function App)  | Running    | Legacy POC |
| `totp-functions` (Application Insights) | App Insights component                | Active     | Java FA    |

The **Java Function App** (`totp-functions.azurewebsites.net`) is a
historical / parallel POC built from the
[`YoungForest/totp-functions`](https://github.com/YoungForest/totp-functions)
repo — Java 17, FUNCTIONS_EXTENSION_VERSION `~4`. It still works but is
**not used by this site** (the SPA calls the SWA managed function at
`/api/TOTPGenerator` over the same origin instead). It is preserved as
a Java demonstration; you can call it directly with a function key:

```sh
curl "https://totp-functions.azurewebsites.net/api/TOTPGenerator\
?code=<FUNCTION_KEY>&T0=0&X=30&sharedSecret=12345678901234567890\
&digits=8&hashAlgorithm=HmacSHA1&timestamp=59"
# -> 94287082
```

(Get the key with `az functionapp function keys list -n totp-functions
-g topt --function-name TOTPGenerator -o json`.)

The **old hostname** `totpfast.azurewebsites.net` referenced in earlier
versions of this README and in `src/App.vue` was removed by Azure long
ago and is unrelated to the currently-running `totp-functions` app.

## Deployment

Push to the `mainline` branch — the GitHub Action
[`azure-static-web-apps-*.yml`](.github/workflows/) builds and deploys
the SPA + the API to Azure Static Web Apps automatically.

Live URLs (verified 2026-04-28, 23/23 RFC 6238 vectors pass):

- Custom domain: <https://totp.youngforest.me>
- Default SWA hostname: <https://ambitious-coast-0265e0a0f.5.azurestaticapps.net>

The custom domain `totp.youngforest.me` is bound to the SWA via
`Microsoft.Web/staticSites/customDomains` (status: Ready).

### If a fresh deploy fails

The previous standalone Function App (`totpfast.azurewebsites.net`) was
retired. The current deployment requires:

1. The repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN_AMBITIOUS_COAST_0265E0A0F`
   to be a valid SWA deployment token. Regenerate it in the Azure portal
   under **Static Web App → Manage deployment token** and update the
   secret in **GitHub repo → Settings → Secrets and variables → Actions**.
2. The SWA resource itself to still exist in your Azure subscription. If
   it has been deleted, create a new one and update the workflow file
   (`api_token` secret name + the URL above).

## Notes on the rewrite

This repo was modernised in 2026:

- Frontend upgraded: Vue 3.2 → 3.5, Vite 2 → 5, TypeScript 4.5 → 5.6,
  vue-tsc 0.31 → 2.1.
- Backend rewritten: the Java 11 Azure Functions project (formerly
  deployed to `totpfast.azurewebsites.net` with FUNCTIONS_EXTENSION_VERSION
  `~3` — the App was removed and the runtime retired) was reimplemented
  in Node.js 20 / TypeScript Functions v4 and integrated here as Azure
  Static Web Apps **managed functions**. This eliminates the separate
  Function App, the function-key-in-source security issue, and the
  cross-origin call. The original Java source remains at
  [`YoungForest/totp-functions`](https://github.com/YoungForest/totp-functions)
  for reference.
- Algorithm fixes during the port: the legacy Java
  `DIGITS_POWER[10] = 10^9` bug (10-digit OTPs were truncated to 9
  significant digits) is corrected to `10^10` per spec.
- Removed Google AdSense / Analytics scripts from the page that
  collects shared secrets.
- Added `scripts/verify-deployment.mjs` for live end-to-end verification
  against any deployment URL.

## License

MIT (see history; original scaffold from `vue create`).

