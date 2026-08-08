export const TileType = {
  START: 'start',
  LAND: 'land',
  EVENT: 'event',
};

const SPACING = 3.2;

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

    return {
      id: i,
      type,
      gridX: gx,
      gridZ: gz,
      position: {
        x: (gx - offsetX) * SPACING,
        z: (gz - offsetZ) * SPACING,
      },
      owner: type === TileType.LAND ? null : undefined,
      price: type === TileType.LAND ? 100 + (i % 4) * 50 : null,
      toll: type === TileType.LAND ? 20 + (i % 4) * 10 : null,
    };
  });
}
