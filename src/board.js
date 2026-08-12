import { Element, CARD_COLOR } from './cards.js';
import { assetUrl } from './assetUrl.js';

export const TileType = {
  START: 'start',
  LAND: 'land',
  EVENT: 'event',
  SHOP: 'shop',
  SHRINE: 'shrine',
  WARP: 'warp',
};

const SPACING = 3.2;

const TILE_TYPE_COLOR = {
  [TileType.START]: '#ffd166',
  [TileType.EVENT]: '#9b5de5',
  [TileType.SHOP]: '#2ec4b6',
  [TileType.SHRINE]: '#c1440e',
  [TileType.WARP]: '#5e60ce',
};

/**
 * ①ヒトデ戦のマップ（従来のステージ1） - a fixed grid, not a generated
 * loop: the outer perimeter plus a "+"-shaped inner cross, so the 4
 * edge-midpoints and the center are real branch points (multiple
 * neighbors) instead of a simple one-way loop.
 * G=start, C=checkpoint, S=shop, F/W/T/M=fire/water/thunder/forest land,
 * N=neutral (無色) land, .=no tile here.
 */
const HITODE_ROWS = [
  'GFFFFFC',
  'W..F..T',
  'W..F..T',
  'WWWNTTT',
  'W..M..T',
  'W..M..T',
  'CMMMMMS',
];

// ②暴君マダイ戦のマップ - ユーザー指定のレイアウト。15マス×5マスで、
// 左右2つの縦長ループ（外周の上下段でつながる）を、中央のGを通る横一列
// の通路が橋渡しする「めがね」型。四隅がH（ほこら）とC（チェックポイント）
// の対角配置になっている。H=ほこら（止まるとランダム効果「マダイの福音書」
// が発生 - _resolveShrineTile参照）。このステージだけ「全チェックポイント
// を通過しないとゴールにならない」ルールが乗る（MAPS側のrequireAllCheckpoints
// 参照）。ショップマスは無し（ユーザー指定に無いため）。
const MADAI_ROWS = [
  'HFFFN.....NWWWC',
  'M...T.....M...T',
  'M...TNNGNNM...T',
  'M...T.....M...T',
  'CWWWN.....NFFFH',
];

// ③ウサギ＆某不思議の国の少女 vs 紫の魔女ホフク＆主人公戦のマップ - ユーザー
// 指定のレイアウト。外周ループのメイン盤面(11×6)と、物理的に隔絶された
// もう一つの島(4×4)の2領域から成る - 隣接マスとしては絶対に行き来できず、
// 唯一の行き来手段がワープマス。V=ワープ1（メイン盤面に1つだけ。着地する
// と別の島の「先頭のP」＝tiles配列で最初に見つかるPへ瞬間移動する - 生成順
// はgz→gxの走査順なので自然と「一番上・一番左のP」になる）、P=ワープ2
// （別の島の四隅すべて。どこに着地してもワープ1(V)へ戻る）。どちらも
// "ちょうど止まった"時だけ発動する（通過しただけでは何も起きない -
// ほこらマスと同じ挙動。実際のリンク付けはcreateBoard末尾、発動は
// Game._resolveWarpTile参照）。行間の全マス"."の空白行が2島の非連結を
// 表す実際の盤上の隙間。
const BUDOU_ROWS = [
  'GMMMMCTTTTV',
  'W.........W',
  'W.........N',
  'W.........F',
  'W.........F',
  'CFFFFWWMMTT',
  '...........',
  '...........',
  '...PFFP....',
  '...W..T....',
  '...W..T....',
  '...PMMP....',
];

// ④ダンボール男戦（ラスボス）のマップ - ユーザー指定のレイアウト。11×11。
// 外周ループ＋「田」字型に4分割する十字の通路、四隅寄りにチェックポイント
// 4つ（C×4、うち1つは盤面中央）、右辺中央に3連続のほこら（H×3、縦一列）。
// 最終決戦にふさわしく、チェックポイント数もほこらの密度も他マップより多い。
const DANBALL_ROWS = [
  'GFFFTTTWWWC',
  'M..M.N.F..N',
  'MMMMNNFFFNN',
  'M..M.N.F..N',
  'W..F.N.M..H',
  'WWWFNCNMNNH',
  'W..F.N.M..H',
  'T..T.N.T..W',
  'TTTTNNNTNNW',
  'T..T.N.T..W',
  'CFFFWWWMMMC',
];

// 対人戦のマップ選択・ストーリーモードの各ステージ盤面として使う一覧。
// idはstory.jsの各ステージ`key`と揃えてある - ストーリーモードは自ステージ
// のkeyをそのままmapIdとしてcreateBoard()へ渡すだけで対応する専用マップに
// なる（story.js側に別途mapIdフィールドを持たせる必要はない）。
// background: 盤面の背景画像（main.jsが#appのCSS background-imageに反映
// - applyMapBackground参照）。実素材が無いマップは共通のstage1.jpgのまま。
// requireAllCheckpoints: 全マップ共通で「全チェックポイントを通過しないと
// ゴールにならない」ルールが有効（ユーザー指定、2026-08-11）。
export const MAPS = [
  { id: 'hitode', name: '① ヒトデの縄張り', rows: HITODE_ROWS, requireAllCheckpoints: true, background: assetUrl('/images/stage/stage1.png') },
  { id: 'madai', name: '② マダイの岩礁', rows: MADAI_ROWS, requireAllCheckpoints: true, background: assetUrl('/images/stage/stage2.jpg') },
  { id: 'budou', name: '③ 決闘の浜辺', rows: BUDOU_ROWS, requireAllCheckpoints: true, background: assetUrl('/images/stage/stage3.png') },
  { id: 'danball', name: '④ 暗転した世界', rows: DANBALL_ROWS, requireAllCheckpoints: true, background: assetUrl('/images/stage/stage1.png') },
];

function getMap(mapId) {
  return MAPS.find((m) => m.id === mapId) ?? MAPS[0];
}

/** そのマップの背景画像URL（main.jsが#appのCSS背景に反映する）。 */
export function getMapBackground(mapId) {
  return getMap(mapId).background;
}

/** そのマップで「全チェックポイントを通過しないとゴールにならない」ルールが有効かどうか（Game側のGoal判定が参照する）。 */
export function mapRequiresAllCheckpoints(mapId) {
  return !!getMap(mapId).requireAllCheckpoints;
}

const LAND_ELEMENT_BY_CODE = {
  F: Element.FIRE,
  W: Element.WATER,
  T: Element.THUNDER,
  M: Element.FOREST,
  N: Element.NEUTRAL,
};

function typeForCode(code) {
  if (code === 'G') return TileType.START;
  if (code === 'C') return TileType.EVENT;
  if (code === 'S') return TileType.SHOP;
  if (code === 'H') return TileType.SHRINE;
  // V/Pは共に「ちょうど止まったらワープする」マス(TileType.WARP)。
  // V=ワープ1（1マスだけ）、P=ワープ2（複数マスありうる）- 区別は型では
  // なく、createBoard末尾のリンク付けでtile.warpTargetIdに焼き込む。
  if (code === 'V' || code === 'P') return TileType.WARP;
  if (LAND_ELEMENT_BY_CODE[code]) return TileType.LAND;
  return null;
}

/**
 * Parses the given map (mapIdが省略/未知の場合はMAPS[0]にフォールバック)
 * into tiles with explicit `neighbors` (tile ids of every
 * orthogonally-adjacent present cell) - movement (see Game._movePlayer)
 * walks this graph rather than a flat array index, since branch points can
 * have 3 or 4 neighbors instead of always exactly 2.
 */
export function createBoard(mapId) {
  const rows = getMap(mapId).rows;
  const height = rows.length;
  const width = rows[0].length;
  const offsetX = (width - 1) / 2;
  const offsetZ = (height - 1) / 2;

  const idByCoord = new Map();
  const tiles = [];
  // チェックポイント(EVENT)は生成順(gz→gxの盤面走査順)に1から番号を振る -
  // プレイヤーパネルの通過状況表示（main.jsのrenderPlayerPanels）が
  // マップごとに一貫した番号で「①②③④」のように出せるようにするため。
  let nextCheckpointNumber = 1;

  for (let gz = 0; gz < height; gz++) {
    for (let gx = 0; gx < width; gx++) {
      const code = rows[gz][gx];
      const type = typeForCode(code);
      if (!type) continue;

      const id = tiles.length;
      idByCoord.set(`${gx},${gz}`, id);
      const isLand = type === TileType.LAND;
      const position = {
        x: (gx - offsetX) * SPACING,
        z: (gz - offsetZ) * SPACING,
      };

      tiles.push({
        id,
        type,
        gridX: gx,
        gridZ: gz,
        position,
        element: isLand ? LAND_ELEMENT_BY_CODE[code] : null,
        owner: isLand ? null : undefined,
        unit: isLand ? null : undefined,
        level: isLand ? 1 : undefined,
        // 基本地価 (base land price) - flat across all tiles for now. See
        // Game._landValueOfTile/_tollOfTile for how level/chain multipliers
        // turn this into 地価 と 通行料.
        price: isLand ? 150 : null,
        neighbors: [],
        checkpointNumber: type === TileType.EVENT ? nextCheckpointNumber++ : null,
      });
    }
  }

  const DELTAS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const tile of tiles) {
    for (const [dx, dz] of DELTAS) {
      const neighborId = idByCoord.get(`${tile.gridX + dx},${tile.gridZ + dz}`);
      if (neighborId != null) tile.neighbors.push(neighborId);
    }
  }

  // ワープマスのリンク付け: 元コードが'V'の1枚（ワープ1）と'P'の全マス
  // （ワープ2）を後付けで対応させる。tilesはgz→gxの走査順で積まれている
  // ので、warpIn[0]が自然と「一番上・一番左のP」＝「先頭のP」になる。
  // このマップにV/Pが無ければ何もしない（他マップはこのブロックが
  // 素通りされるだけ）。
  const warpOut = tiles.filter((t) => rows[t.gridZ][t.gridX] === 'V');
  const warpIn = tiles.filter((t) => rows[t.gridZ][t.gridX] === 'P');
  if (warpOut.length === 1 && warpIn.length > 0) {
    warpOut[0].warpTargetId = warpIn[0].id;
    for (const t of warpIn) t.warpTargetId = warpOut[0].id;
  }

  return tiles;
}

export function getMapName(mapId) {
  return getMap(mapId).name;
}

/**
 * マップ選択UI用: そのマップの盤面レイアウトを縮小した簡易プレビューを
 * canvasに描いて返す。実素材の背景画像はまだ1種類しか無いため、タイルの
 * 配色（属性色/開始・チェックポイント・ショップ色）だけで盤面の形の違いが
 * 伝わるようにしてある。
 */
export function createMapThumbnailCanvas(mapId, cellPx = 10) {
  const { rows } = getMap(mapId);
  const width = rows[0].length;
  const height = rows.length;
  const canvas = document.createElement('canvas');
  canvas.width = width * cellPx;
  canvas.height = height * cellPx;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b2436';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let gz = 0; gz < height; gz++) {
    for (let gx = 0; gx < width; gx++) {
      const code = rows[gz][gx];
      const type = typeForCode(code);
      if (!type) continue;
      ctx.fillStyle = type === TileType.LAND ? CARD_COLOR[LAND_ELEMENT_BY_CODE[code]] : TILE_TYPE_COLOR[type];
      ctx.fillRect(gx * cellPx, gz * cellPx, cellPx - 1, cellPx - 1);
    }
  }
  return canvas;
}
