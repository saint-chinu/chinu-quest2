// ストーリーモードの名前付きNPCの実素材（2026-08-12反映）。キーはstory.js
// の`speaker`/opponent`name`と完全一致する文字列 - この名前だけを頼りに
// 立ち絵・盤面駒アイコンを引く（story.js側にidを新設する必要はない）。
// 一覧に無いキャラ（ヒトデ等）は今まで通りプレースホルダー表示のまま。
import { assetUrl } from './assetUrl.js';

export const NPC_PORTRAIT_URL = {
  'ダンボール男': assetUrl('/images/npc-portraits/danballman.png'),
  '暴君マダイ': assetUrl('/images/npc-portraits/madai.png'),
  'ニュウドウカジカ（お肉）': assetUrl('/images/npc-portraits/nikuchan.png'),
  '紫の魔女ホフク': assetUrl('/images/npc-portraits/hofuku.png'),
  '少女A': assetUrl('/images/npc-portraits/wonderland-girl.png'),
  'ウサギン': assetUrl('/images/npc-portraits/usagin.webp'),
};

// 盤面駒用は256×256の正方形に統一済み（GameScene.createPieceFromImageが
// 前提とする1.6×1.6の正方形スプライトにそのまま合う）。
export const NPC_TOKEN_URL = {
  'ダンボール男': assetUrl('/images/npc-tokens/danballman.png'),
  '暴君マダイ': assetUrl('/images/npc-tokens/madai.png'),
  'ニュウドウカジカ（お肉）': assetUrl('/images/npc-tokens/nikuchan.png'),
  '紫の魔女ホフク': assetUrl('/images/npc-tokens/hofuku.png'),
  '少女A': assetUrl('/images/npc-tokens/wonderland-girl.png'),
  'ウサギン': assetUrl('/images/npc-tokens/usagin.webp'),
};

const tokenImageCache = new Map();

/** 盤面駒用画像をcanvasとして読み込む（GameScene.createPieceFromImageがTHREE.CanvasTextureへそのまま渡す形 - iconSheet.jsのプレイヤーアイコンと同じ形に揃えてある）。無ければnullを返す。 */
export function loadNpcTokenImage(name) {
  const url = NPC_TOKEN_URL[name];
  if (!url) return Promise.resolve(null);
  if (tokenImageCache.has(url)) return tokenImageCache.get(url);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  tokenImageCache.set(url, promise);
  return promise;
}
