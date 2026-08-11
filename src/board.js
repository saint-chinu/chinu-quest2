import { Element, CARD_COLOR } from './cards.js';

export const TileType = {
  START: 'start',
  LAND: 'land',
  EVENT: 'event',
  SHOP: 'shop',
};

const SPACING = 3.2;

const TILE_TYPE_COLOR = {
  [TileType.START]: '#ffd166',
  [TileType.EVENT]: '#9b5de5',
  [TileType.SHOP]: '#2ec4b6',
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

// ②暴君マダイ戦のマップ - 横長9マス×7マスの外周に、中央で1本橋渡しされた
// 「H」字型の内部通路2本を通す（ヒトデ戦のマップより横幅が広く、分岐点が
// 2箇所に増える）。
const MADAI_ROWS = [
  'GFFFFFFFC',
  'W..N.N..T',
  'W..N.N..T',
  'W..NNN..T',
  'W..N.N..T',
  'W..N.N..T',
  'CMMMMMMMS',
];

// ③ウサギ＆某不思議の国の少女 vs 紫の魔女ホフク＆主人公戦のマップ -
// 外周＋中央3×3を丸ごと埋めた「広場」。2vs2の乱戦向けに、中央付近の
// 分岐・合流点をヒトデ戦のマップより増やしてある。
const BUDOU_ROWS = [
  'GFFFFFC',
  'W..F..T',
  'W.FFF.T',
  'WNNNNNT',
  'W.MMM.T',
  'W..M..T',
  'CMMMMMS',
];

// ④ダンボール男戦（ラスボス）のマップ - ①と同じ「＋」型だが9×9に拡大した
// もの。最終決戦にふさわしい、一番広いマップ。
const DANBALL_ROWS = [
  'GFFFFFFFC',
  'W...N...T',
  'W...N...T',
  'W...N...T',
  'WWWWNTTTT',
  'W...N...T',
  'W...N...T',
  'W...N...T',
  'CMMMMMMMS',
];

// 対人戦のマップ選択・ストーリーモードの各ステージ盤面として使う一覧。
// idはstory.jsの各ステージ`key`と揃えてある - ストーリーモードは自ステージ
// のkeyをそのままmapIdとしてcreateBoard()へ渡すだけで対応する専用マップに
// なる（story.js側に別途mapIdフィールドを持たせる必要はない）。
// 背景画像（アセット）はまだ1種類しか無いため全マップ共通のプレースホルダー
// - 盤面の形だけを変えて対人戦のマップ選択に意味を持たせている。
export const MAPS = [
  { id: 'hitode', name: '① ヒトデの縄張り', rows: HITODE_ROWS },
  { id: 'madai', name: '② マダイの岩礁', rows: MADAI_ROWS },
  { id: 'budou', name: '③ 決闘の浜辺', rows: BUDOU_ROWS },
  { id: 'danball', name: '④ 暗転した世界', rows: DANBALL_ROWS },
];

function getMap(mapId) {
  return MAPS.find((m) => m.id === mapId) ?? MAPS[0];
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
        // turn this into 地価 and 通行料.
        price: isLand ? 150 : null,
        neighbors: [],
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
