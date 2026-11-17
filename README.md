# app-itonami-kinoko — Kinoko

きのこ — 養分の流れ（flow）の証明（PoNF）の層です。流れの寄与を記録し、しきい値に届いたら子実体（block）として封じ、前の block の hash をつないだ鎖にします。鎖は手元で検証できます。

Tauri **3.0.0-alpha.6** の独立 app（`tauri-runtime-wry`、OS の WebView）と、同じファイルの static Web ビルドです。記録はすべてこの端末の中（localStorage、key `itonami.kinoko.v1`）に保存し、外部へは通信しません。外部操作の宣言もありません（`dist/descriptor.json` の `operations: []`）。保存に失敗したときは画面に表示します。

## できること

| 操作 | 内容 |
| --- | --- |
| 流れを記録 (recordFlow) | — |
| しきい値を確認 (checkFlowThreshold) | — |
| block を作る (formBlock) | 未封の流れの合計がしきい値以上のときだけ、全部を 1 つの block に封じます。 |
| block を見る (getBlock) | blockId か height。両方空なら最新の block です。 |
| 鎖を検証 (verifyChain) | すべての block の hash を height 順に計算し直します。 |

記録（collection）: `cloud.itonami.apps.kinoko.block`、`cloud.itonami.apps.kinoko.flow`

## 補足

- **この domain は新しく設計したものです。** 旧 Worker は処理を外部の AgentGateway / LangServer に転送していて、処理の中身はこの repository にありませんでした。旧 Worker の method 名・README・BPMN をもとに、この端末だけで動く domain を作りました。旧サービスと同じ挙動である保証はありません。
- block の hash は、直前の block の hash・height・しきい値・封じた流れ（id 順の id と量）を JSON にしたものの SHA-256 です。これはこの app の中の鎖で、外部のチェーンには書きません。
- 旧 `cljs/`（UI）は残しています。

## 構成

| パス | 役割 |
| --- | --- |
| `src/domain/` | domain logic（TypeScript）。ビルド時に Node の type stripping で JS にします（bundler・依存なし） |
| `src/local-store.js` | この端末内の record store。domain が使う `read` / `write` を localStorage で実装 |
| `src/app-def.js` | 画面の操作と domain 関数・collection の対応 |
| `src/ui/` | 依存なしの UI。DOM はテキストノードだけで組み、HTML 文字列を使いません（CSP `style-src 'self'`） |
| `vendor/` | kotoba-lang/kotoba の `kotoba-client-runtime.js` / consent CSS と `PINS.json`。`scripts/build.mjs` が digest のずれで失敗します |
| `src-tauri/` | Tauri v3 host。read-only command は `awai_host_info` の 1 つだけ。filesystem・network・shell・installer 権限なし |
| `cljs/` | 旧 ClojureScript UI（amu でビルド）。この app のビルド・テストでは使いません |

## コマンド

```sh
npm ci
npm test              # build してから domain と local-only のテスト（kinoko.test.ts, local-only.test.mjs）
npm run build         # dist/ と SHA-256 の release.json
npm run build:desktop # native desktop 実行ファイル（bundle・署名なし）
```

## 状態と制限（AWAI-3079, 2026-11-17）

- 旧構成（Cloudflare Worker の XRPC dispatcher / adapter、`wrangler.jsonc`、`@etzhayyim/sdk`）は削除しました。履歴は git にあります。
- 検証済み: `npm test`、`npm run build`、`cargo check`（Tauri 3.0.0-alpha.6）。
- 未検証: native window の起動、`tauri build`、Android、署名、配布。アイコンは app-soshiki の仮アイコンです。
