// 未定義変数（no-undef）だけを見る軽量チェック。
// `vite build` はバンドルするだけでスコープ解析をしないため、別関数の
// ローカル変数を参照してしまっても素通りしてしまう（実際にストーリー勝利時の
// 演出が ReferenceError で止まる不具合を出した）。`npx eslint` で検出する。
export default [
  {
    files: ['src/**/*.js', 'public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', console: 'readonly', navigator: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', localStorage: 'readonly',
        sessionStorage: 'readonly', Audio: 'readonly', Image: 'readonly', fetch: 'readonly',
        performance: 'readonly', MutationObserver: 'readonly', ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly', AudioContext: 'readonly', webkitAudioContext: 'readonly',
        HTMLMediaElement: 'readonly', alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
        location: 'readonly', FileReader: 'readonly', Blob: 'readonly', URL: 'readonly',
        crypto: 'readonly', structuredClone: 'readonly', globalThis: 'readonly', process: 'readonly',
        CanvasRenderingContext2D: 'readonly', DOMParser: 'readonly', getComputedStyle: 'readonly',
        matchMedia: 'readonly', screen: 'readonly', history: 'readonly', CustomEvent: 'readonly',
        Event: 'readonly', KeyboardEvent: 'readonly', PointerEvent: 'readonly', TouchEvent: 'readonly',
        TextEncoder: 'readonly', TextDecoder: 'readonly', btoa: 'readonly', atob: 'readonly',
        caches: 'readonly', self: 'readonly', clients: 'readonly', indexedDB: 'readonly',
        OffscreenCanvas: 'readonly', createImageBitmap: 'readonly', WebSocket: 'readonly',
        AbortController: 'readonly', queueMicrotask: 'readonly', reportError: 'readonly',
      },
    },
    rules: { 'no-undef': 'error' },
  },
];
