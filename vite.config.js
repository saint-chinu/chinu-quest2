import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages はリポジトリ名のサブパス、Cloudflare（Workers Assets）はルート。
  // CF_BUILD は `npm run build:cf`（scripts/build-cf.mjs）が立てる。
  base: process.env.CF_BUILD ? '/' : (process.env.GITHUB_ACTIONS ? '/chinu-quest2/' : '/'),
  server: {
    host: true,
  },
});
