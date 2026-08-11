import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/chinu-quest2/' : '/',
  server: {
    host: true,
  },
});
