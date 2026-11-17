# app-itonami-kinoko

kinoko (きのこ) — fruiting body / PoNF consensus layer. Checks nutrient flow
thresholds and forms new PoNF blocks when Shannon η-gated flow accumulates.
Extracted from `itonami/root:60-apps/itonami-project-kinoko` (see
`migration.edn`).

## Frontend migrated to ClojureScript (2026-09-07)

The `svelte/` directory (SvelteKit) is gone. The frontend is now
ClojureScript — reagent + re-frame + `jp-go-dds` (デジタル庁デザインシステム) —
at [`cljs/`](cljs). This was a **frontend-only** migration; the backend
Worker/XRPC logic was moved, not rewritten:

| Then | Now |
|---|---|
| `svelte/src/routes/+page.svelte` (the status page) | [`cljs/src/kinoko/app.cljk`](cljs/src/kinoko/app.cljk) — same seven facts + own path, faithfully ported (two fields corrected against the live wrangler config rather than the stale Svelte constant — see the namespace docstring) |
| `svelte/src/routes/xrpc/[...path]/+server.ts` (the file that actually deployed, per `wrangler.jsonc`'s former `main`) | [`src/xrpc-dispatcher.ts`](src/xrpc-dispatcher.ts) — moved byte-for-byte, only a provenance header comment added |
| `wrangler.jsonc` `main: svelte/.svelte-kit/cloudflare/_worker.js` | `main` dropped entirely |
| `wrangler.jsonc` `assets.directory: ./svelte/.svelte-kit/cloudflare/client` | `assets.directory: ./cljs/public` |
| `wrangler.jsonc` `vars.APP_FRAMEWORK: sveltekit-edge-bff` | `vars.APP_FRAMEWORK: cljs-reagent-re-frame-jp-go-dds` |

Neither `src/app.ts` nor `src/xrpc-dispatcher.ts` calls `env.ASSETS.fetch`, so
`main` was dropped rather than repointed at either — putting either Worker in
front of the static assets with no `env.ASSETS.fetch` call would mean nothing
serves the frontend. Both backend files are orphaned source, same status
`src/app.ts` already had before this migration.

**This edit is unverified**: `wrangler deploy` / `wrangler dev` were not run
against it.

## Build and test

```bash
cd cljs
npm install
npm run build   # amu compile --target wasm32-browser app -> public/js/app.js
npm test        # amu compile --target wasm32-browser test && node out/tests.js
```
