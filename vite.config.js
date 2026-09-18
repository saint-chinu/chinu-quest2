import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages はリポジトリ名のサブパス、Cloudflare（Workers Assets）はルート。
  // CF_BUILD は `npm run build:cf`（scripts/build-cf.mjs）が立てる。
  base: process.env.CF_BUILD ? '/' : (process.env.GITHUB_ACTIONS ? '/chinu-quest2/' : '/'),
  // Cloudflare ビルドでは「サイトも対戦サーバーも同じ Worker」なので、
  // 接続先を埋め込まず実行時の location.origin を使う（独自ドメインへ移しても
  // CORS 設定や再ビルドが要らない）。GitHub Pages ビルドでは false。
  define: { __PVP_SAME_ORIGIN__: JSON.stringify(Boolean(process.env.CF_BUILD)) },
  server: {
    host: true,
  },
});
