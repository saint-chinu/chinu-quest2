import { Element } from './cards.js';

export const TileType = {
  START: 'start',
  LAND: 'land',
  EVENT: 'event',
};

const SPACING = 3.2;

/**
 * Land element is fixed by which screen quadrant the tile falls in (never
 * changes outside of special effects) - 火 top-right, 水 bottom-right, 地
 * bottom-left, 風 top-left. The camera looks at the board diagonally (see
 * scene.js's CAMERA_OFFSET), so "screen right" is world (x - z) > 0 and
 * "screen top" is world (x + z) < 0 - the boundaries are the board's own
 * diagonals, which is what actually reads as clean screen-aligned
 * quadrants once rendered through that rotated camera.
 */
function elementForPosition(x, z) {
  const right = x - z >= 0;
  const top = x + z < 0;
  if (top) return right ? Element.FIRE : Element.WIND;
  return right ? Element.WATER : Element.EARTH;
}

/**
 * Walks the perimeter of a width x height grid (no diagonals, no duplicate
 * corners) so the course reads as a simple rectangular loop.
 */
function generateLoopGridCoords(width, height) {
  const coords = [];
  for (let x = 0; x < width; x++) coords.push([x, 0]);
  for (let z = 1; z < height; z++) coords.push([width - 1, z]);
  for (let x = width - 2; x >= 0; x--) coords.push([x, height - 1]);
  for (let z = height - 2; z > 0; z--) coords.push([0, z]);
  return coords;
}

export function createBoard({ width = 6, height = 5 } = {}) {
  const coords = generateLoopGridCoords(width, height);
  const offsetX = (width - 1) / 2;
  const offsetZ = (height - 1) / 2;

  return coords.map(([gx, gz], i) => {
    let type = TileType.LAND;
    if (i === 0) type = TileType.START;
    else if (i % 5 === 0) type = TileType.EVENT;

    const isLand = type === TileType.LAND;
    const position = {
      x: (gx - offsetX) * SPACING,
      z: (gz - offsetZ) * SPACING,
    };

    return {
      id: i,
      type,
      gridX: gx,
      gridZ: gz,
      position,
      element: isLand ? elementForPosition(position.x, position.z) : null,
      owner: isLand ? null : undefined,
      unit: isLand ? null : undefined,
      level: isLand ? 1 : undefined,
      // 基本地価 (base land price) - flat across all tiles for now. See
      // Game._landValueOfTile/_tollOfTile for how level/chain multipliers
      // turn this into 地価 and 通行料.
      price: isLand ? 75 : null,
    };
  });
}
