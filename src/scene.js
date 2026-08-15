import * as THREE from 'three';
import { TileType } from './board.js';
import { CARD_COLOR } from './cards.js';
import { tween, easeInOutQuad } from './utils.js';
import { assetUrl } from './assetUrl.js';
import { defaultCardArtUrl } from './cardArt.js';

const TILE_COLOR = {
  [TileType.START]: 0xffd166,
  [TileType.EVENT]: 0x9b5de5,
  [TileType.SHOP]: 0x2ec4b6,
  [TileType.SHRINE]: 0xc1440e,
  [TileType.WARP]: 0x5e60ce,
  [TileType.RUNAWAY]: 0xe53935,
  [TileType.DEFAMATION]: 0x7b1fa2,
};

/**
 * START(ゴール)/EVENT(チェックポイント)/SHRINE(ほこら)マスに立てる建物
 * イラスト（2026-08-12実装）。プレイヤー駒と同じ「常にカメラを向く
 * billboardスプライト」方式（createPiece参照）- 縦長の建物イラストなので
 * 個別のaspect比を持たせ、共通の目標高さから幅を逆算する。
 */
const BOARD_MARKER_HEIGHT = 3.0;
const BOARD_MARKERS = {
  [TileType.START]: { url: assetUrl('/images/board-markers/goal.webp'), aspect: 854 / 1004 },
  [TileType.EVENT]: { url: assetUrl('/images/board-markers/checkpoint.webp'), aspect: 665 / 1024 },
  [TileType.SHRINE]: { url: assetUrl('/images/board-markers/shrine.webp'), aspect: 1046 / 1181 },
};
const WARP_MARKERS = {
  entrance: { url: assetUrl('/images/board-markers/wa-pu1.png'), aspect: 1 },
  return: { url: assetUrl('/images/board-markers/wa-pu2.png'), aspect: 1024 / 1536 },
};
const boardMarkerTextureLoader = new THREE.TextureLoader();
const boardMarkerTextureCache = new Map();

function loadBoardMarkerTexture(url) {
  if (!boardMarkerTextureCache.has(url)) {
    const texture = boardMarkerTextureLoader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    boardMarkerTextureCache.set(url, texture);
  }
  return boardMarkerTextureCache.get(url);
}

// Offset diagonally (not straight along Z) so the camera looks at the
// board from a corner angle. This is what makes the axis-aligned square
// tiles read as diamonds on screen, isometric-style — the tiles
// themselves stay plain squares.
// 15% closer than the original (14.5, 25, 14.5) - board was reading too
// distant/small. Scaling this vector uniformly zooms in without touching
// the diagonal viewing angle that makes tiles read as diamonds.
// Y raised from 25→32 (2026-08-12) for a steeper, more overhead look-down
// angle (~50.6°→~58°) per user feedback that the original felt too shallow/
// tilted - X/Z left untouched so the diagonal isometric diamond read on
// tiles is unaffected.
// 2026-08-12: further zoomed in (0.85→0.72 scalar) per user feedback that
// the board still read too distant/small - uniform scale again, so the
// look-down angle established above is untouched.
// 2026-08-13: still reading too far per user feedback - one more uniform
// zoom-in pass (0.72→0.62).
// 2026-08-13: board/sprites still read as too oblique/"leaning into the
// distance" per user feedback - Y raised again (32→35) for a bit more
// overhead angle (~58°→~60.7°), same pattern as the 25→32 pass above.
// 2026-08-15: angleは維持したまま画面上で10%拡大するため、カメラ距離を
// 1/1.1へ短縮（0.62→約0.5636）。
const CAMERA_OFFSET = new THREE.Vector3(14.5, 35, 14.5).multiplyScalar(0.62 / 1.1);
// Reused scratch vector for _applyCamera's per-frame zoomScale multiply, to
// avoid allocating a new Vector3 every call (this runs during every pan/tween tick).
const cameraOffsetScratch = new THREE.Vector3();
const CAMERA_FOV = 45;
const PAN_DURATION_MS = 900;
// スペル使用時のカメラ演出（focusAndZoom/playSpellAura/shakeSprite）用。
const SPELL_FOCUS_DURATION_MS = 500;
const SPELL_FOCUS_ZOOM = 1.45;
const SPELL_AURA_DURATION_MS = 900;
const SPELL_SHAKE_DURATION_MS = 550;

// Manual free-look camera (land-info mode): one arrow press moves this far,
// smoothly, in that screen direction.
const FREE_PAN_STEP = 4;
const FREE_PAN_DURATION_MS = 350;

// Fraction of the geometrically-visible ground area that counts as "safe".
// Leaves margin for the piece's own size and for HUD elements overlapping
// the edges of the screen.
const DEADZONE_MARGIN = 0.65;

// 全ステージ共通: 2026-08-13にプレイヤー駒をさらに1.2倍（2.88→3.456）。
// 下端の沈み込み量を従来と同じ0.1に保つため、高さ/2-0.1でY位置を算出。
const PIECE_HEIGHT = 4.1472;
export const PIECE_REST_Y = PIECE_HEIGHT / 2 - 0.1;

// 配置モンスターの盤上アイコン用。プレイヤー駒より低く小さくして、通行中の
// プレイヤー駒と土地に常駐するモンスターアイコンを見分けられるようにする。
// Y位置はカードの下端がタイル表面(y=0)よりわずかに高い位置(0.05)に来る
// よう、高さ(UNIT_ICON_HEIGHT)の半分を足して算出する（2026-08-12調整前は
// 下端が-0.15とタイル面より下に沈み込み、急な俯瞰カメラ角度だとカードが
// タイルに埋まって「張り付いて」見えていた - ユーザー指摘により修正）。
// 2026-08-13に盤上表示を8%縮小した後も、下端の高さ0.05を維持する。
export const UNIT_ICON_REST_Y = 2.05008;

// 土地レベルの縁取り。tile.mesh(2.6四方)より少し内側(2.5)に、レベルが
// 上がるほど太い黒枠を重ねる - Lv5だけ「太くする」路線から外れて二重の
// 細い枠にする（レベル1は枠なし）。各要素は{outer, width}のリング1本分。
const LEVEL_BORDER_OUTER = 2.5;
const LEVEL_BORDER_DEPTH = 0.03;
const LEVEL_BORDER_RINGS = {
  2: [{ outer: LEVEL_BORDER_OUTER, width: 0.07 }],
  3: [{ outer: LEVEL_BORDER_OUTER, width: 0.13 }],
  4: [{ outer: LEVEL_BORDER_OUTER, width: 0.19 }],
  5: [
    { outer: LEVEL_BORDER_OUTER, width: 0.06 },
    { outer: LEVEL_BORDER_OUTER - 2 * (0.06 + 0.05), width: 0.06 },
  ],
};
const levelBorderMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });

/** Flat square picture-frame geometry (outerSize square with an innerSize square hole), lying in the XZ plane. */
function buildSquareFrameGeometry(outerSize, innerSize, depth) {
  const outerHalf = outerSize / 2;
  const innerHalf = innerSize / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-outerHalf, -outerHalf);
  shape.lineTo(outerHalf, -outerHalf);
  shape.lineTo(outerHalf, outerHalf);
  shape.lineTo(-outerHalf, outerHalf);
  shape.lineTo(-outerHalf, -outerHalf);

  const hole = new THREE.Path();
  hole.moveTo(-innerHalf, -innerHalf);
  hole.lineTo(innerHalf, -innerHalf);
  hole.lineTo(innerHalf, innerHalf);
  hole.lineTo(-innerHalf, innerHalf);
  hole.lineTo(-innerHalf, -innerHalf);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const NDC_CORNERS = [
  [-1, -1], // bottom-left (nearest to camera)
  [1, -1], // bottom-right (nearest to camera)
  [-1, 1], // top-left (farthest from camera)
  [1, 1], // top-right (farthest from camera)
];

// The camera looks at the focus diagonally (see CAMERA_OFFSET), so the
// screen's actual left/right and near/far axes on the ground are rotated
// ~45° away from world X/Z. These are the ground-plane unit vectors for
// "screen right" and "screen forward" (camera → focus), used to measure
// the deadzone in the frame the screen is actually drawn in.
const offsetGroundLen = Math.hypot(CAMERA_OFFSET.x, CAMERA_OFFSET.z);
const FORWARD = {
  x: -CAMERA_OFFSET.x / offsetGroundLen,
  z: -CAMERA_OFFSET.z / offsetGroundLen,
};
// Verified against the camera's actual world-space local-X axis - the
// other 90° rotation of FORWARD pointed screen-left, not right.
const RIGHT = { x: -FORWARD.z, z: FORWARD.x };

function toScreenLocal(dx, dz) {
  return {
    right: dx * RIGHT.x + dz * RIGHT.z,
    forward: dx * FORWARD.x + dz * FORWARD.z,
  };
}

// 直接ダメージ系の土地コマンド（火炎瓶男/センチネル等）が発動した時に、
// 対象マスへ火の玉を落とす演出用。実素材が無いので、なべのふた等と同じ
// 「canvasに描いてCanvasTextureにする」プレースホルダー方式（放射状の
// グラデーションで炎っぽさを出す）。1回だけ生成してキャッシュする。
let fireballTextureCache = null;
function getFireballTexture() {
  if (fireballTextureCache) return fireballTextureCache;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  gradient.addColorStop(0, '#fff6d0');
  gradient.addColorStop(0.35, '#ffcf4d');
  gradient.addColorStop(0.7, '#ff7a1a');
  gradient.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fill();
  fireballTextureCache = new THREE.CanvasTexture(canvas);
  return fireballTextureCache;
}

const FIREBALL_FALL_MS = 500;
const FIREBALL_IMPACT_MS = 220;

// スペル詠唱時、キャスターの足元に出す魔法陣風のオーラ演出用テクスチャ。
// 紫系の放射状グラデーション＋外周のリングで「発動している感」を出す
// （属性を問わない汎用魔法エフェクトなので特定色に寄せない）。
let spellAuraTextureCache = null;
function getSpellAuraTexture() {
  if (spellAuraTextureCache) return spellAuraTextureCache;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.25, 'rgba(216,180,255,0.85)');
  gradient.addColorStop(0.55, 'rgba(140,110,255,0.55)');
  gradient.addColorStop(0.8, 'rgba(90,60,220,0.25)');
  gradient.addColorStop(1, 'rgba(90,60,220,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 10, 0, Math.PI * 2);
  ctx.stroke();
  spellAuraTextureCache = new THREE.CanvasTexture(canvas);
  return spellAuraTextureCache;
}
const FIREBALL_START_Y = 8;
const FIREBALL_SIZE = 1.3;

function createTokenTexture(color) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const hex = `#${color.toString(16).padStart(6, '0')}`;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
  ctx.fillStyle = hex;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

// 配置モンスターの盤上アイコン用ミニカード。通行料・HPなどの内部比率は
// そのまま保ち、従来の高さ4.348から8%縮小する。
export const UNIT_ICON_HEIGHT = 4.00016;
const UNIT_CARD_CANVAS_WIDTH = 110;
const TOLL_BADGE_HEIGHT = 73;
const HP_GAUGE_HEIGHT = 37;
const UNIT_OWNER_HEIGHT = 30;
const CARD_BODY_HEIGHT = 120;
const UNIT_CARD_CANVAS_HEIGHT = TOLL_BADGE_HEIGHT + CARD_BODY_HEIGHT + HP_GAUGE_HEIGHT + UNIT_OWNER_HEIGHT;

const UNIT_ELEMENT_MARK = {
  fire: '火',
  water: '水',
  forest: '森',
  thunder: '雷',
  neutral: '無',
};

const UNIT_TRAIT_MARK = {
  firstStrike: '先',
  lastStrike: '後',
  pierce: '貫',
};

const unitCardArtCache = new Map();
/** 同じURLの実イラストは1度だけロードして使い回す（複数体を盤面に出しても再ダウンロードしない）。 */
function loadUnitCardArt(url, onLoad) {
  const cached = unitCardArtCache.get(url);
  if (cached) {
    if (cached.complete) onLoad(cached);
    else cached.addEventListener('load', () => onLoad(cached), { once: true });
    return;
  }
  const img = new Image();
  img.addEventListener('load', () => onLoad(img), { once: true });
  img.src = url;
  unitCardArtCache.set(url, img);
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * ミニカード(属性色の背景+名前、`imageDataUrl`があれば実イラストを上部に
 * 描く)＋上部の通行料バッジ＋下部のHPゲージを、1枚のcanvasテクスチャに
 * まとめて描画する。`createUnitIcon`/`updateUnitIcon`（Sceneクラス）から呼ぶ。
 */
function drawUnitCard(state) {
  const { canvas } = state;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  ctx.clearRect(0, 0, w, canvas.height);

  const bodyY = TOLL_BADGE_HEIGHT;
  const bodyH = CARD_BODY_HEIGHT;
  roundRectPath(ctx, 2, bodyY, w - 4, bodyH, 10);
  ctx.fillStyle = CARD_COLOR[state.element] || '#888888';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  if (state.artImage) {
    ctx.save();
    roundRectPath(ctx, 2, bodyY, w - 4, bodyH * 0.72, 10);
    ctx.clip();
    const areaW = w - 4;
    const areaH = bodyH * 0.72;
    const imageW = state.artImage.naturalWidth || state.artImage.width;
    const imageH = state.artImage.naturalHeight || state.artImage.height;
    const scale = Math.min(areaW / imageW, areaH / imageH);
    const drawW = imageW * scale;
    const drawH = imageH * scale;
    ctx.drawImage(state.artImage, 2 + (areaW - drawW) / 2, bodyY + (areaH - drawH) / 2, drawW, drawH);
    ctx.restore();
  }

  // 盤面上でも属性と主要戦闘特性を瞬時に判別できるよう、イラスト下端へ
  // 左=属性、右=先制/後攻/貫通の短縮マークを重ねる。
  const markY = bodyY + bodyH * 0.72 - 25;
  const elementMark = UNIT_ELEMENT_MARK[state.element] || '?';
  roundRectPath(ctx, 5, markY, 25, 23, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = CARD_COLOR[state.element] || '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(elementMark, 17.5, markY + 12);

  const traitMarks = (state.traits || []).map((trait) => UNIT_TRAIT_MARK[trait]).filter(Boolean);
  if (traitMarks.length > 0) {
    const traitText = traitMarks.join('');
    const traitW = 10 + traitMarks.length * 17;
    roundRectPath(ctx, w - traitW - 5, markY, traitW, 23, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffd166';
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(traitText, w - traitW / 2 - 5, markY + 12);
  }

  const nameStripY = bodyY + bodyH * 0.72;
  const nameStripH = bodyY + bodyH - nameStripY;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(2, nameStripY, w - 4, nameStripH);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(nameStripH * 0.55)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const displayName = state.name.length > 6 ? `${state.name.slice(0, 5)}…` : state.name;
  ctx.fillText(displayName, w / 2, nameStripY + nameStripH / 2 + 1);

  if (state.toll > 0) {
    roundRectPath(ctx, w / 2 - 52, 1, 104, TOLL_BADGE_HEIGHT - 3, 11);
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffd166';
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.font = `bold ${Math.round((TOLL_BADGE_HEIGHT - 3) * 0.76)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${state.toll}`, w / 2, (TOLL_BADGE_HEIGHT - 3) / 2 + 1);
  }

  const gaugeY = bodyY + bodyH + 4;
  const gaugeH = HP_GAUGE_HEIGHT - 6;
  const ratio = state.maxHp > 0 ? Math.max(0, Math.min(1, state.hp / state.maxHp)) : 0;
  roundRectPath(ctx, 4, gaugeY, w - 8, gaugeH, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  if (ratio > 0) {
    roundRectPath(ctx, 4, gaugeY, (w - 8) * ratio, gaugeH, 4);
    ctx.fillStyle = ratio > 0.5 ? '#4caf6e' : ratio > 0.25 ? '#f0b429' : '#e6553a';
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(gaugeH * 0.75)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.max(0, state.hp)}/${state.maxHp}`, w / 2, gaugeY + gaugeH / 2 + 1);

  const ownerY = bodyY + bodyH + HP_GAUGE_HEIGHT;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(2, ownerY, w - 4, UNIT_OWNER_HEIGHT - 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(UNIT_OWNER_HEIGHT * 0.62)}px sans-serif`;
  ctx.fillText(state.ownerName || '', w / 2, ownerY + UNIT_OWNER_HEIGHT / 2 - 1);

  state.texture.needsUpdate = true;
}

// 所有者名ラベル（マスの手前下端に置くテキストbillboard）。
// 2026-08-12: ユニットアイコン同様、タイル面(y=0)より下に沈み込んで
// 見づらかったため拡大・かさ上げ（下端がタイル面よりわずかに高い位置に
// 来るようHEIGHT/2+0.05を目安にREST_Yを設定）。
const OWNER_LABEL_CANVAS_WIDTH = 160;
const OWNER_LABEL_CANVAS_HEIGHT = 40;
export const OWNER_LABEL_HEIGHT = 0.744;
export const OWNER_LABEL_REST_Y = 0.422;
// タイル半幅(2.6/2=1.3)より小さくして隣のタイルへはみ出さないようにする
// （旧1.15は境界ギリギリでタイル間をまたいで見えていた）。
export const OWNER_LABEL_Z_OFFSET = 1.23;

function drawOwnerLabel(canvas, name) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `bold ${Math.round(canvas.height * 0.6)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(name, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);
}

// How far the free-look camera (land-info mode) can pan away from wherever
// it started, in world units - keeps the player from wandering the focus
// off into empty space indefinitely. The board itself only spans roughly
// ±10, so this leaves a generous look-around margin beyond the tiles.
const FREE_PAN_MAX_DISTANCE = 18;

export class GameScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    // No scene.background, and the renderer clears to transparent (below) -
    // the stage art is a plain CSS background-image on the page behind the
    // canvas instead (see style.css #app). A THREE background/ground
    // texture would either get warped into a diamond by the diagonal
    // camera (like the tiles) or - since the 400x400 ground plane fills
    // the entire frustum from this angle - never actually show through at
    // all. Pure CSS sidesteps both: it's flat, always right-way-up, and
    // covers the viewport (overflow is fine) regardless of camera/pan.
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      200
    );

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this._setupLights();

    this.focus = new THREE.Vector3(0, 0, 0);
    // Temporary camera-distance multiplier for spell-cast focus effects
    // (focusAndZoom/restoreFocus) - 1 = normal CAMERA_OFFSET distance,
    // <1 = zoomed in. Left at 1 outside of those effects.
    this.zoomScale = 1;
    // タッチのドラッグ/ピンチでカメラを動かす機能の状態（enableTouchPan参照）。
    this._touchPanCleanup = null;
    this.panDidMove = false;
    // Safe area around the current focus, in screen-local (right, forward)
    // units - see toScreenLocal - derived from the actual camera frustum
    // by resize(). The near (bottom of screen) and far (top of screen)
    // edges sit at different distances under this oblique angle, so
    // they're tracked separately.
    this.deadzone = { halfRight: 0, nearForward: 0, farForward: 0 };
    this._applyCamera();

    this.resize();
    // iOSは横→縦→横の回転中、CSSレイアウトが確定する前の中間サイズで
    // resizeを1回だけ通知することがある。その比率をカメラに固定すると、
    // billboardの駒・モンスター・オブジェクトまで横につぶれて見える。
    // 即時＋数フレーム後＋遅延後に取り直し、visualViewportも監視する。
    this._viewportResizeTimers = [];
    this._handleViewportResize = () => {
      this._viewportResizeTimers.forEach((id) => clearTimeout(id));
      this._viewportResizeTimers = [];
      this.resize();
      requestAnimationFrame(() => requestAnimationFrame(() => this.resize()));
      this._viewportResizeTimers.push(setTimeout(() => this.resize(), 120));
      this._viewportResizeTimers.push(setTimeout(() => this.resize(), 360));
    };
    window.addEventListener('resize', this._handleViewportResize);
    window.addEventListener('orientationchange', this._handleViewportResize);
    window.visualViewport?.addEventListener('resize', this._handleViewportResize);
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(6, 12, 4);
    this.scene.add(sun);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.round(rect.width || this.canvas.clientWidth || window.innerWidth);
    const height = Math.round(rect.height || this.canvas.clientHeight || window.innerHeight);
    // 回転途中の一瞬だけ0pxになる値は採用せず、次の再計測を待つ。
    if (width <= 1 || height <= 1) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this._recomputeDeadzone();
  }

  /**
   * Casts rays through the four viewport corners onto the ground plane to
   * find what's actually visible, evaluated with focus at the origin so
   * the resulting offsets apply no matter where focus currently is.
   */
  _recomputeDeadzone() {
    const savedFocus = this.focus.clone();
    this.focus.set(0, 0, 0);
    this._applyCamera();
    this.camera.updateMatrixWorld(true);

    const points = NDC_CORNERS.map(([nx, ny]) => {
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      const point = new THREE.Vector3();
      raycaster.ray.intersectPlane(groundPlane, point);
      return point ?? new THREE.Vector3();
    });
    const [bottomLeft, bottomRight, topLeft, topRight] = points.map((p) =>
      toScreenLocal(p.x, p.z)
    );

    const halfRight = Math.min(Math.abs(bottomLeft.right), Math.abs(bottomRight.right));
    const nearForward = Math.min(bottomLeft.forward, bottomRight.forward);
    const farForward = Math.max(topLeft.forward, topRight.forward);
    this.deadzone = {
      halfRight: halfRight * DEADZONE_MARGIN,
      nearForward: nearForward * DEADZONE_MARGIN,
      farForward: farForward * DEADZONE_MARGIN,
    };

    this.focus.copy(savedFocus);
    this._applyCamera();
  }

  buildBoard(tiles) {
    const tileGeo = new THREE.BoxGeometry(2.6, 0.4, 2.6);
    for (const tile of tiles) {
      const color = tile.type === TileType.LAND ? CARD_COLOR[tile.element] : TILE_COLOR[tile.type];
      const mat = new THREE.MeshStandardMaterial({ color });
      const mesh = new THREE.Mesh(tileGeo, mat);
      mesh.position.set(tile.position.x, -0.2, tile.position.z);
      this.scene.add(mesh);
      tile.mesh = mesh;
      tile.markerSprite = this._createBoardMarker(tile);
      if (tile.type === TileType.RUNAWAY) this._createRunawayTileDecal(tile);
      this._createSpecialTileLabel(tile);
    }
    // No ground-plane mesh anymore - it used to fill the entire frustum
    // from this camera angle (400x400 is far bigger than what's ever
    // visible), which meant it fully occluded the CSS stage background
    // sitting behind the (now transparent) canvas. Tiles now float
    // directly over that backdrop instead of a separate 3D floor.
  }

  /** ゴール/チェックポイント/ほこら/ワープマスにオブジェクトを立てる。 */
  _createBoardMarker(tile) {
    const def = tile.type === TileType.WARP ? WARP_MARKERS[tile.warpKind] : BOARD_MARKERS[tile.type];
    if (!def) return null;
    const texture = loadBoardMarkerTexture(def.url);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    sprite.renderOrder = 10;
    const width = BOARD_MARKER_HEIGHT * def.aspect;
    sprite.scale.set(width, BOARD_MARKER_HEIGHT, 1);
    // プレイヤー駒（PIECE_REST_Y=0.7、高さ1.6）がタイル表面(y=0)よりわずかに
    // 沈む見た目に合わせ、同じ沈み込み量（0.1）で底面をタイルに接地させる。
    sprite.position.set(tile.position.x, BOARD_MARKER_HEIGHT / 2 - 0.1, tile.position.z);
    this.scene.add(sprite);
    return sprite;
  }

  /** 特殊マス名をオブジェクトの手前（画面上ではマスの下側）へ表示する。 */
  _createSpecialTileLabel(tile) {
    let label = null;
    if (tile.type === TileType.START) label = 'ゴール';
    else if (tile.type === TileType.EVENT) label = `CP${tile.checkpointNumber}`;
    else if (tile.type === TileType.SHRINE) label = 'ほこら';
    else if (tile.type === TileType.WARP) label = 'ワープ';
    else if (tile.type === TileType.SHOP) label = 'ショップ';
    else if (tile.type === TileType.DEFAMATION) label = '誹謗中傷';
    if (!label) return;

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.font = '900 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.strokeText(label, 160, 48);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, 160, 48);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    sprite.renderOrder = 20;
    sprite.scale.set(2.25, 0.68, 1);
    // カメラは+X/+Z側にあるため、同方向へ寄せると画面上でマスの下側になる。
    sprite.position.set(tile.position.x + 0.72, 0.48, tile.position.z + 0.72);
    this.scene.add(sprite);
  }

  /** 暴走マスは立体物や下部ラベルではなく、マス表面へ文字画像を直接貼る。 */
  _createRunawayTileDecal(tile) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '900 138px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 26;
    ctx.strokeStyle = 'rgba(30, 0, 0, 0.95)';
    ctx.strokeText('暴走', 256, 132);
    ctx.fillStyle = '#fff3a6';
    ctx.fillText('暴走', 256, 132);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(2.35, 1.18),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(tile.position.x, 0.012, tile.position.z);
    decal.renderOrder = 3;
    this.scene.add(decal);
    tile.runawayDecal = decal;
  }

  /**
   * (Re)builds the black level-ring border sitting on top of `tile.mesh`
   * to match its current `tile.level` (1 = no border). Safe to call
   * repeatedly - always disposes whatever ring was there before building
   * the new one, so it can just be called again after every level change.
   */
  updateTileLevelBorder(tile) {
    if (tile.levelBorderGroup) {
      tile.mesh.remove(tile.levelBorderGroup);
      tile.levelBorderGroup.traverse((obj) => obj.geometry?.dispose());
      tile.levelBorderGroup = null;
    }

    const rings = LEVEL_BORDER_RINGS[tile.level];
    if (!rings) return;

    const group = new THREE.Group();
    for (const ring of rings) {
      const geo = buildSquareFrameGeometry(ring.outer, ring.outer - ring.width * 2, LEVEL_BORDER_DEPTH);
      group.add(new THREE.Mesh(geo, levelBorderMaterial));
    }
    // Tile geometry is centered on its own origin, so the top face sits at
    // local y = +0.2 (half of the 0.4 box height) - nudge a hair above
    // that to avoid z-fighting with the tile's own top face.
    group.position.set(0, 0.2 + LEVEL_BORDER_DEPTH / 2 + 0.005, 0);
    tile.mesh.add(group);
    tile.levelBorderGroup = group;
  }

  /**
   * Player/monster tokens are 2D art on this 3D stage: a billboard sprite
   * that always faces the camera, so it reads correctly regardless of the
   * board's angle. `color` is a placeholder circle until real artwork
   * (spec calls for per-card WebP illustrations) is swapped into the
   * texture.
   */
  createPiece(color, tilePosition) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: createTokenTexture(color), depthTest: false, depthWrite: false }));
    sprite.renderOrder = 100;
    sprite.scale.set(PIECE_HEIGHT, PIECE_HEIGHT, 1);
    sprite.position.set(tilePosition.x, PIECE_REST_Y, tilePosition.z);
    this.scene.add(sprite);
    return sprite;
  }

  /** Same billboard-sprite piece, but textured from a real character icon (a canvas cropped from the player-icon sheet - see iconSheet.js) instead of the placeholder colored circle. */
  createPieceFromImage(imageSource, tilePosition) {
    const texture = new THREE.CanvasTexture(imageSource);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    sprite.renderOrder = 100;
    sprite.scale.set(PIECE_HEIGHT, PIECE_HEIGHT, 1);
    sprite.position.set(tilePosition.x, PIECE_REST_Y, tilePosition.z);
    this.scene.add(sprite);
    return sprite;
  }

  /**
   * 配置モンスターを表す盤上アイコン（土地に常駐するbillboardスプライト）。
   * 縮小したミニカード（属性色の背景＋名前、`imageDataUrl`があれば実イラスト
   * を上半分に描く）に、上部の通行料バッジ・下部のHPゲージを重ねた1枚の
   * canvasテクスチャとして描画する（drawUnitCard参照）。HP/通行料は
   * `updateUnitIcon`で頻繁に変わる部分だけ再描画する。
   */
  createUnitIcon(unit, tilePosition) {
    const canvas = document.createElement('canvas');
    canvas.width = UNIT_CARD_CANVAS_WIDTH;
    canvas.height = UNIT_CARD_CANVAS_HEIGHT;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    sprite.renderOrder = 20;
    const aspect = UNIT_CARD_CANVAS_WIDTH / UNIT_CARD_CANVAS_HEIGHT;
    sprite.scale.set(UNIT_ICON_HEIGHT * aspect, UNIT_ICON_HEIGHT, 1);
    sprite.position.set(tilePosition.x, UNIT_ICON_REST_Y, tilePosition.z);
    this.scene.add(sprite);

    const state = {
      canvas,
      texture,
      name: unit.def.name,
      element: unit.def.element,
      traits: [...(unit.def.traits || [])],
      hp: unit.currentHp,
      maxHp: unit.def.hp,
      toll: 0,
      ownerName: '',
      artImage: null,
    };
    sprite.userData.cardState = state;
    const artUrl = unit.def.imageDataUrl || defaultCardArtUrl(unit.def);
    if (artUrl) {
      loadUnitCardArt(artUrl, (img) => {
        state.artImage = img;
        drawUnitCard(state);
      });
    }
    drawUnitCard(state);
    return sprite;
  }

  /** プレイヤー駒の前後関係をターン順に更新する。 */
  setPieceRenderOrder(sprite, order, opacity = 1) {
    if (!sprite) return;
    sprite.renderOrder = order;
    if (sprite.material) {
      sprite.material.transparent = opacity < 1 || sprite.material.transparent;
      sprite.material.opacity = opacity;
      sprite.material.depthTest = false;
      sprite.material.depthWrite = false;
      sprite.material.needsUpdate = true;
    }
  }

  setBoardObjectOpacity(sprite, opacity = 1) {
    if (!sprite?.material) return;
    sprite.material.transparent = true;
    sprite.material.opacity = opacity;
    sprite.material.needsUpdate = true;
  }

  /** HP・通行料など頻繁に変わる部分だけを再描画する（値が変化していなければ何もしない）。 */
  updateUnitIcon(sprite, { hp, maxHp, toll, ownerName = '' }) {
    const state = sprite?.userData?.cardState;
    if (!state) return;
    if (state.hp === hp && state.maxHp === maxHp && state.toll === toll && state.ownerName === ownerName) return;
    state.hp = hp;
    state.maxHp = maxHp;
    state.toll = toll;
    state.ownerName = ownerName;
    drawUnitCard(state);
  }

  removeUnitIcon(sprite) {
    if (!sprite) return;
    this.scene.remove(sprite);
    sprite.material.map?.dispose?.();
    sprite.material.dispose();
  }

  /** 土地の所有者名を表示するラベル（マスの手前下端に置く小さなテキストbillboard）。 */
  createOwnerLabel(name, tilePosition) {
    const canvas = document.createElement('canvas');
    canvas.width = OWNER_LABEL_CANVAS_WIDTH;
    canvas.height = OWNER_LABEL_CANVAS_HEIGHT;
    drawOwnerLabel(canvas, name);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    const aspect = OWNER_LABEL_CANVAS_WIDTH / OWNER_LABEL_CANVAS_HEIGHT;
    sprite.scale.set(OWNER_LABEL_HEIGHT * aspect, OWNER_LABEL_HEIGHT, 1);
    sprite.position.set(tilePosition.x, OWNER_LABEL_REST_Y, tilePosition.z + OWNER_LABEL_Z_OFFSET);
    this.scene.add(sprite);
    return sprite;
  }

  removeOwnerLabel(sprite) {
    if (!sprite) return;
    this.scene.remove(sprite);
    sprite.material.map?.dispose?.();
    sprite.material.dispose();
  }

  /**
   * 直接ダメージ系の土地コマンド（火炎瓶男/センチネル等）用の演出:
   * 対象マスの真上から火の玉を落とし、着地の瞬間に一度膨らませてから
   * 消す。ダメージ数値のポップアップ（DOMオーバーレイ）は呼び出し元
   * （main.jsのworldToScreen経由）が別途担当する - こちらは3D演出のみ。
   */
  async playFireballImpact(tilePosition) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: getFireballTexture(), transparent: true }));
    sprite.scale.set(FIREBALL_SIZE, FIREBALL_SIZE, 1);
    const landY = PIECE_REST_Y + 0.4;
    sprite.position.set(tilePosition.x, FIREBALL_START_Y, tilePosition.z);
    this.scene.add(sprite);

    // 自由落下っぽく見えるよう加速度的なease-inで落とす（等速だと軽く見える）。
    await tween(FIREBALL_FALL_MS, (t) => {
      const eased = t * t;
      sprite.position.y = FIREBALL_START_Y + (landY - FIREBALL_START_Y) * eased;
    });

    await tween(FIREBALL_IMPACT_MS, (t) => {
      const scale = FIREBALL_SIZE * (1 + Math.sin(t * Math.PI) * 0.7);
      sprite.scale.set(scale, scale, 1);
      sprite.material.opacity = 1 - t;
    });

    this.scene.remove(sprite);
    sprite.material.dispose();
  }

  /**
   * スペル使用演出用: 対象座標の足元に魔法陣風のオーラを出す。0から
   * パッと現れて広がりながら薄れていく1回限りのパルス（ループしない）。
   * `rotation`（SpriteMaterialが対応する唯一の回転軸=視線方向の回転）を
   * 併用してくるくる感を出す。
   */
  async playSpellAura(position, duration = SPELL_AURA_DURATION_MS) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSpellAuraTexture(), transparent: true, depthTest: false }));
    sprite.renderOrder = 24;
    sprite.position.set(position.x, PIECE_REST_Y - 0.5, position.z);
    this.scene.add(sprite);

    await tween(duration, (t) => {
      // 0→1で一気に出て、後半じわっと消える(t^0.4で立ち上がりを急に)。
      const growth = Math.pow(Math.min(t / 0.35, 1), 0.4);
      const scale = 1.6 * growth + t * 1.2;
      sprite.scale.set(scale, scale, 1);
      sprite.material.opacity = t < 0.35 ? 1 : Math.max(0, 1 - (t - 0.35) / 0.65);
      sprite.material.rotation = t * Math.PI * 1.5;
    });

    this.scene.remove(sprite);
    sprite.material.dispose();
  }

  /**
   * スペルの対象（プレイヤー駒/モンスターアイコンのbillboardスプライト）を
   * 一時的にぶるぶる震わせる演出。元の座標を記録しておき、終了時に必ず
   * ぴったり元の位置へ戻す（ズレたままにならないよう`finally`で保証）。
   */
  async shakeSprite(sprite, duration = SPELL_SHAKE_DURATION_MS) {
    if (!sprite) return;
    const baseX = sprite.position.x;
    const baseZ = sprite.position.z;
    try {
      await tween(duration, (t) => {
        // 減衰する高周波の震え（終盤ほど振幅が小さくなる）。
        const decay = 1 - t;
        const magnitude = 0.16 * decay;
        sprite.position.x = baseX + Math.sin(t * 60) * magnitude;
        sprite.position.z = baseZ + Math.cos(t * 47) * magnitude;
      });
    } finally {
      sprite.position.x = baseX;
      sprite.position.z = baseZ;
    }
  }

  /** 3Dワールド座標を画面のピクセル座標に変換する（ダメージ数値等、キャンバスの上にDOM要素を重ねて表示するためのヘルパー）。 */
  worldToScreen(x, y, z) {
    const vec = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + (vec.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-vec.y * 0.5 + 0.5) * rect.height,
    };
  }

  setFocusImmediate(x, z) {
    this.focus.set(x, 0, z);
    this._applyCamera();
  }

  /** True if (x, z) would fall outside the safe viewing area right now. */
  isOutsideSafeView(x, z) {
    const local = toScreenLocal(x - this.focus.x, z - this.focus.z);
    const { halfRight, nearForward, farForward } = this.deadzone;
    return !(
      Math.abs(local.right) <= halfRight &&
      local.forward >= nearForward &&
      local.forward <= farForward
    );
  }

  /** Slow, deliberate pan (no zoom/angle change) to center on (x, z). */
  panTo(x, z) {
    const from = this.focus.clone();
    const to = new THREE.Vector3(x, 0, z);
    if (from.distanceTo(to) < 0.01) return null;
    return tween(PAN_DURATION_MS, (t) => {
      this.focus.lerpVectors(from, to, easeInOutQuad(t));
      this._applyCamera();
    });
  }

  /**
   * スペル使用演出用: 対象座標へパンしつつ同時にズーム倍率(距離を1/scale
   * に縮める)を変化させる。panToより短い既定時間（SPELL_FOCUS_DURATION_MS）
   * で、キャスター→対象と素早く切り替える用途を想定。scaleは1で通常距離、
   * 大きいほどズームイン。
   */
  focusAndZoom(x, z, scale = SPELL_FOCUS_ZOOM, duration = SPELL_FOCUS_DURATION_MS) {
    const fromFocus = this.focus.clone();
    const toFocus = new THREE.Vector3(x, 0, z);
    const fromZoom = this.zoomScale;
    const toZoom = 1 / scale;
    return tween(duration, (t) => {
      const eased = easeInOutQuad(t);
      this.focus.lerpVectors(fromFocus, toFocus, eased);
      this.zoomScale = fromZoom + (toZoom - fromZoom) * eased;
      this._applyCamera();
    });
  }

  /** ワープ中の駒を放物線状に飛ばし、カメラの注視点も同じ軌道を追わせる。 */
  flyPieceTo(sprite, targetPosition, duration = 1100) {
    if (!sprite || !targetPosition) return Promise.resolve();
    const from = sprite.position.clone();
    const to = new THREE.Vector3(targetPosition.x, PIECE_REST_Y, targetPosition.z);
    return tween(duration, (t) => {
      const eased = easeInOutQuad(t);
      sprite.position.lerpVectors(from, to, eased);
      sprite.position.y = PIECE_REST_Y + Math.sin(Math.PI * t) * 3.2;
      this.focus.set(sprite.position.x, 0, sprite.position.z);
      this._applyCamera();
    }).finally(() => sprite.position.copy(to));
  }

  /** 召喚マスの地面から放射状の光線を立ち上げ、1秒かけて回転・消失させる。 */
  playSummonBurst(position) {
    const group = new THREE.Group();
    group.position.set(position.x, 0.24, position.z);
    group.renderOrder = 18;
    const material = new THREE.MeshBasicMaterial({
      color: 0xfff3a6,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 12; i += 1) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 2.7), material);
      ray.position.y = 1.25;
      ray.rotation.y = (Math.PI * 2 * i) / 12;
      ray.rotation.x = -0.22;
      group.add(ray);
    }
    this.scene.add(group);
    return tween(1000, (t) => {
      group.rotation.y = t * Math.PI * 1.5;
      group.scale.setScalar(0.7 + Math.sin(Math.PI * t) * 0.45);
      material.opacity = 0.9 * (1 - t);
    }).finally(() => {
      this.scene.remove(group);
      group.traverse((object) => object.geometry?.dispose?.());
      material.dispose();
    });
  }

  /** 目標達成時、金色の祝福光を上空からプレイヤーへ降らせる。 */
  playBlessingLight(position) {
    const group = new THREE.Group();
    group.position.set(position.x, 0, position.z);
    group.renderOrder = 24;
    const material = new THREE.MeshBasicMaterial({
      color: 0xffe27a,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 10; i += 1) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.12 + (i % 3) * 0.05, 4.8), material);
      const angle = (Math.PI * 2 * i) / 10;
      const radius = 0.25 + (i % 4) * 0.16;
      ray.position.set(Math.cos(angle) * radius, 7 + (i % 3) * 0.8, Math.sin(angle) * radius);
      ray.rotation.y = angle;
      group.add(ray);
    }
    this.scene.add(group);
    return tween(2400, (t) => {
      const pulse = Math.sin(Math.PI * Math.min(t * 1.35, 1));
      material.opacity = 0.82 * pulse;
      group.position.y = -4.5 * t;
      group.rotation.y = t * Math.PI * 0.7;
    }).finally(() => {
      this.scene.remove(group);
      group.traverse((object) => object.geometry?.dispose?.());
      material.dispose();
    });
  }

  /** Manual free-look pan for the land-info camera mode: one screen-relative step per call, clamped so the focus can't wander indefinitely far from the board. */
  panByDirection(direction) {
    const axis = { up: FORWARD, down: FORWARD, left: RIGHT, right: RIGHT }[direction];
    const sign = direction === 'down' || direction === 'left' ? -1 : 1;
    const from = this.focus.clone();
    const to = from
      .clone()
      .add(new THREE.Vector3(axis.x, 0, axis.z).multiplyScalar(FREE_PAN_STEP * sign));
    to.x = THREE.MathUtils.clamp(to.x, -FREE_PAN_MAX_DISTANCE, FREE_PAN_MAX_DISTANCE);
    to.z = THREE.MathUtils.clamp(to.z, -FREE_PAN_MAX_DISTANCE, FREE_PAN_MAX_DISTANCE);
    if (from.distanceTo(to) < 0.01) return null;
    return tween(FREE_PAN_DURATION_MS, (t) => {
      this.focus.lerpVectors(from, to, easeInOutQuad(t));
      this._applyCamera();
    });
  }

  /** Raycasts a click (in normalized -1..1 device coords) against tile meshes; returns the hit tile or null. */
  pickTileAt(ndcX, ndcY, tiles) {
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const meshes = tiles.map((t) => t.mesh).filter(Boolean);
    const hits = raycaster.intersectObjects(meshes);
    if (hits.length === 0) return null;
    return tiles.find((t) => t.mesh === hits[0].object) ?? null;
  }

  /** 現在の注視点・ズームを控える（選択系プロンプト開始時）。 */
  snapshotCamera() {
    return { fx: this.focus.x, fz: this.focus.z, zoom: this.zoomScale };
  }

  /** 控えた注視点・ズームへ即座に戻す（選択終了時）。 */
  restoreCamera(snap) {
    if (!snap) return;
    this.focus.set(snap.fx, 0, snap.fz);
    this.zoomScale = snap.zoom;
    this._applyCamera();
  }

  /**
   * タッチ/ポインタで盤面をドラッグ移動（パン）＋2本指ピンチでズームできるように
   * する。土地情報・スペル対象選択・分岐などの選択中だけ有効化し、終わったら
   * disableTouchPan()で解除する（矢印のカメラモードの置き換え）。掴んだ地点が指の
   * 下に留まるようにfocusを動かすので地図をドラッグする感覚になる。panDidMoveは
   * 「直前の操作がドラッグ/ピンチだったか」で、タップ選択と誤爆しないようクリック側が
   * 参照する（ドラッグ直後のclickは無視する）。
   */
  enableTouchPan() {
    if (this._touchPanCleanup) return;
    const el = this.renderer.domElement;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pointers = new Map();
    let grab = null;
    let pinchPrev = 0;
    let startX = 0;
    let startY = 0;
    let dragging = false;
    const DRAG_THRESHOLD = 8; // これ未満の動きはタップ扱い（選択と誤爆させない）
    this.panDidMove = false;
    const ndc = (cx, cy) => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    };
    const ground = (cx, cy) => {
      raycaster.setFromCamera(ndc(cx, cy), this.camera);
      const p = new THREE.Vector3();
      return raycaster.ray.intersectPlane(plane, p) ? p : null;
    };
    const twoFingerDist = () => {
      const v = [...pointers.values()];
      return v.length >= 2 ? Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) : 0;
    };
    const onDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        grab = ground(e.clientX, e.clientY);
        this.panDidMove = false;
        startX = e.clientX;
        startY = e.clientY;
        dragging = false;
      } else if (pointers.size === 2) {
        pinchPrev = twoFingerDist();
        grab = null;
        dragging = true;
      }
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1 && grab) {
        // しきい値未満の微小な動きはまだ「タップ」とみなし、ドラッグにしない
        // （preventDefaultも呼ばないのでタップ選択のclickがそのまま発火する）。
        if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return;
        dragging = true;
        const curr = ground(e.clientX, e.clientY);
        if (curr) {
          this.focus.x = THREE.MathUtils.clamp(this.focus.x + (grab.x - curr.x), -FREE_PAN_MAX_DISTANCE, FREE_PAN_MAX_DISTANCE);
          this.focus.z = THREE.MathUtils.clamp(this.focus.z + (grab.z - curr.z), -FREE_PAN_MAX_DISTANCE, FREE_PAN_MAX_DISTANCE);
          this._applyCamera();
          this.panDidMove = true;
          e.preventDefault();
        }
      } else if (pointers.size >= 2) {
        const d = twoFingerDist();
        if (pinchPrev > 0 && d > 0) {
          this.zoomScale = THREE.MathUtils.clamp(this.zoomScale * (pinchPrev / d), 0.55, 1.9);
          this._applyCamera();
          this.panDidMove = true;
        }
        pinchPrev = d;
        e.preventDefault();
      }
    };
    const onUp = (e) => {
      pointers.delete(e.pointerId);
      pinchPrev = 0;
      if (pointers.size === 1) {
        const v = [...pointers.values()][0];
        grab = ground(v.x, v.y);
      } else if (pointers.size === 0) {
        grab = null;
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    this._touchPanCleanup = () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }

  disableTouchPan() {
    this._touchPanCleanup?.();
    this._touchPanCleanup = null;
    this.panDidMove = false;
  }

  _applyCamera() {
    this.camera.position.copy(this.focus).add(cameraOffsetScratch.copy(CAMERA_OFFSET).multiplyScalar(this.zoomScale));
    this.camera.lookAt(this.focus);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
