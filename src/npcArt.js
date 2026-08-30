// ストーリーモードの名前付きNPCの実素材（2026-08-12反映）。キーはstory.js
// の`speaker`/opponent`name`と完全一致する文字列 - この名前だけを頼りに
// 立ち絵・盤面駒アイコンを引く（story.js側にidを新設する必要はない）。
// 一覧に無いキャラは今まで通りプレースホルダー表示のまま。
import { assetUrl } from './assetUrl.js';

export const NPC_PORTRAIT_URL = {
  朕: assetUrl('/images/npc-portraits/chin-su.png'),
  酢: assetUrl('/images/npc-portraits/chin-su.png'),
  '「彼」': assetUrl('/images/npc-portraits/kare.png'),
  Q: assetUrl('/images/npc-portraits/q.png?v=2'),
  'ダンボール男': assetUrl('/images/npc-portraits/danballman.png'),
  '暴君マダイ': assetUrl('/images/npc-portraits/madai.png'),
  'お肉': assetUrl('/images/npc-portraits/nikuchan-mosaic.png?v=2'),
  '紫の魔女ホフク': assetUrl('/images/npc-portraits/hofuku.png'),
  '少女A': assetUrl('/images/npc-portraits/wonderland-girl.png'),
  // ⑨の裏の顔。専用絵が用意されるまでは少女Aと同じ立ち絵を使う。
  '専門調査官・A': assetUrl('/images/npc-portraits/wonderland-girl.png'),
  'ムール': assetUrl('/images/npc-portraits/muuru.png'),
  '邪神ヒトデマソ': assetUrl('/images/npc-portraits/hitodemaso.png'),
  '闇・ホフク': assetUrl('/images/npc-portraits/dark-hofuku.png'),
  '暗・少女A': assetUrl('/images/npc-portraits/dark-shoujo-a.png'),
  サーティー: assetUrl('/images/npc-portraits/thirty.png'),
  クエ: assetUrl('/images/npc-portraits/que.png?v=2'),
  '塞ぎ込んだ男': assetUrl('/images/npc-portraits/fusagikonda-otoko.png'),
  'ウサギン': assetUrl('/images/npc-portraits/usagin.webp'),
  'ヒトデ': assetUrl('/images/npc-portraits/hitode.webp'),
};

// 盤面駒用は256×256の正方形に統一済み（GameScene.createPieceFromImageが
// 前提とする1.6×1.6の正方形スプライトにそのまま合う）。
/**
 * 表示名を立ち絵・盤面駒のキーへ正規化する。
 * ⑦では同じキャラが「段ボール男」表記で登場する（⑤⑥は「ダンボール男」）ので、
 * どちらでも同じ素材を引けるようにここへ寄せる。盤面駒(loadNpcTokenImage)は
 * 以前から同じ正規化をしていたが、立ち絵側は素通しだったため⑦だけ立ち絵が
 * 出ていなかった（2026-08のストーリー通し確認で発覚）。
 */
export function canonicalNpcName(name) {
  const raw = String(name || '');
  if (raw.includes('段ボール男')) return 'ダンボール男';
  return raw;
}

/** 表記ゆれを吸収して立ち絵URLを引く。NPC_PORTRAIT_URLを直接添字しないこと。 */
export function npcPortraitUrl(name) {
  return NPC_PORTRAIT_URL[canonicalNpcName(name)];
}

export const NPC_TOKEN_URL = {
  朕: assetUrl('/images/npc-portraits/chin-su.png'),
  '「彼」': assetUrl('/images/npc-tokens/kare.png'),
  Q: assetUrl('/images/npc-tokens/q.png?v=2'),
  'ダンボール男': assetUrl('/images/npc-tokens/danballman.png?v=2'),
  '暴君マダイ': assetUrl('/images/npc-tokens/madai.png'),
  'お肉': assetUrl('/images/npc-tokens/nikuchan-mosaic.png?v=2'),
  '紫の魔女ホフク': assetUrl('/images/npc-tokens/hofuku.png'),
  '少女A': assetUrl('/images/npc-tokens/wonderland-girl.png'),
  '専門調査官・A': assetUrl('/images/npc-tokens/wonderland-girl.png'),
  'ムール': assetUrl('/images/npc-tokens/muuru.png'),
  '邪神ヒトデマソ': assetUrl('/images/npc-tokens/hitodemaso.png'),
  '闇・ホフク': assetUrl('/images/npc-tokens/dark-hofuku.png'),
  '暗・少女A': assetUrl('/images/npc-tokens/dark-shoujo-a.png'),
  サーティー: assetUrl('/images/npc-tokens/thirty.png'),
  クエ: assetUrl('/images/npc-tokens/que.png?v=2'),
  '塞ぎ込んだ男': assetUrl('/images/npc-tokens/fusagikonda-otoko.png'),
  'ウサギン': assetUrl('/images/npc-tokens/usagin.webp'),
  'ヒトデ': assetUrl('/images/npc-tokens/hitode.webp'),
};

const tokenImageCache = new Map();

/** 盤面駒用画像をcanvasとして読み込む（GameScene.createPieceFromImageがTHREE.CanvasTextureへそのまま渡す形 - iconSheet.jsのプレイヤーアイコンと同じ形に揃えてある）。無ければnullを返す。 */
export function loadNpcTokenImage(name) {
  // 復活・支配状態など表示名に補足が付いた段ボール男も、同じ盤面駒を使う。
  // 既存ステージ⑤だけでなく乱入する⑥・同盟戦の⑦でも丸い代替駒へ落ちない。
  const canonicalName = canonicalNpcName(name);
  const url = NPC_TOKEN_URL[canonicalName];
  if (!url) return Promise.resolve(null);
  if (tokenImageCache.has(url)) return tokenImageCache.get(url);

  const promise = new Promise((resolve) => {
    const img = new Image();
    let retried = false;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas);
    };
    // 通信瞬断やCDNの古い404を一度引いただけで、解決済みnullのPromiseを
    // セッション中ずっと使い回さない。失敗キャッシュを捨て、次回の盤面開始で
    // 再取得できるようにする（Qの駒が色付き丸へ戻る現象の対策）。
    img.onerror = () => {
      if (!retried) {
        retried = true;
        img.src = `${url}${url.includes('?') ? '&' : '?'}retry=${Date.now()}`;
        return;
      }
      tokenImageCache.delete(url);
      resolve(null);
    };
    img.src = url;
  });
  tokenImageCache.set(url, promise);
  return promise;
}
