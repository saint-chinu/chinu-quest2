// Cloudflare（Workers Assets）向けビルド。base を '/' にして dist/ を作る。
// Windows でも動くよう環境変数は npm script ではなくここで立てる。
process.env.CF_BUILD = '1';
const { build } = await import('vite');
await build();
