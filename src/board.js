import { Element } from './cards.js';

export const TileType = {
  START: 'start',
  LAND: 'land',
  EVENT: 'event',
  SHOP: 'shop',
};

const SPACING = 3.2;

/**
 * ステージ1 - a fixed grid, not a generated loop: the outer perimeter plus a
 * "+"-shaped inner cross, so the 4 edge-midpoints and the center are real
 * branch points (multiple neighbors) instead of a simple one-way loop.
 * G=start, C=checkpoint, S=shop, F/W/T/M=fire/water/thunder/forest land,
 * N=neutral (無色) land, .=no tile here.
 */
const STAGE1_ROWS = [
  'GFFFFFC',
  'W..F..T',
  'W..F..T',
  'WWWNTTT',
  'W..M..T',
  'W..M..T',
  'CMMMMMS',
];

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
 * Parses STAGE1_ROWS into tiles with explicit `neighbors` (tile ids of
 * every orthogonally-adjacent present cell) - movement (see
 * Game._movePlayer) walks this graph rather than a flat array index, since
 * branch points can have 3 or 4 neighbors instead of always exactly 2.
 */
export function createBoard() {
  const height = STAGE1_ROWS.length;
  const width = STAGE1_ROWS[0].length;
  const offsetX = (width - 1) / 2;
  const offsetZ = (height - 1) / 2;

  const idByCoord = new Map();
  const tiles = [];

  for (let gz = 0; gz < height; gz++) {
    for (let gx = 0; gx < width; gx++) {
      const code = STAGE1_ROWS[gz][gx];
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
