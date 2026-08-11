import * as THREE from 'three';
import { TileType } from './board.js';
import { CARD_COLOR } from './cards.js';
import { tween, easeInOutQuad } from './utils.js';
import { assetUrl } from './assetUrl.js';

const TILE_COLOR = {
  [TileType.START]: 0xffd166,
  [TileType.EVENT]: 0x9b5de5,
  [TileType.SHOP]: 0x2ec4b6,
  [TileType.SHRINE]: 0xc1440e,
  [TileType.WARP]: 0x5e60ce,
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
const CAMERA_OFFSET = new THREE.Vector3(14.5, 32, 14.5).multiplyScalar(0.85);
const CAMERA_FOV = 45;
const PAN_DURATION_MS = 900;

// Manual free-look camera (land-info mode): one arrow press moves this far,
// smoothly, in that screen direction.
const FREE_PAN_STEP = 4;
const FREE_PAN_DURATION_MS = 350;

// Fraction of the geometrically-visible ground area that counts as "safe".
// Leaves margin for the piece's own size and for HUD elements overlapping
// the edges of the screen.
const DEADZONE_MARGIN = 0.65;

export const PIECE_REST_Y = 0.7;

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
    // Safe area around the current focus, in screen-local (right, forward)
    // units - see toScreenLocal - derived from the actual camera frustum
    // by resize(). The near (bottom of screen) and far (top of screen)
    // edges sit at different distances under this oblique angle, so
    // they're tracked separately.
    this.deadzone = { halfRight: 0, nearForward: 0, farForward: 0 };
    this._applyCamera();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(6, 12, 4);
    this.scene.add(sun);
  }

  resize() {
    const { clientWidth, clientHeight } = this.canvas;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
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
      this._createBoardMarker(tile.type, tile.position);
    }
    // No ground-plane mesh anymore - it used to fill the entire frustum
    // from this camera angle (400x400 is far bigger than what's ever
    // visible), which meant it fully occluded the CSS stage background
    // sitting behind the (now transparent) canvas. Tiles now float
    // directly over that backdrop instead of a separate 3D floor.
  }

  /** ゴール/チェックポイント/ほこらマスに建物イラストを立てる（該当しないマスタイプなら何もしない）。プレイヤー駒と同じ、常にカメラを向くbillboardスプライト。 */
  _createBoardMarker(tileType, tilePosition) {
    const def = BOARD_MARKERS[tileType];
    if (!def) return;
    const texture = loadBoardMarkerTexture(def.url);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    const width = BOARD_MARKER_HEIGHT * def.aspect;
    sprite.scale.set(width, BOARD_MARKER_HEIGHT, 1);
    // プレイヤー駒（PIECE_REST_Y=0.7、高さ1.6）がタイル表面(y=0)よりわずかに
    // 沈む見た目に合わせ、同じ沈み込み量（0.1）で底面をタイルに接地させる。
    sprite.position.set(tilePosition.x, BOARD_MARKER_HEIGHT / 2 - 0.1, tilePosition.z);
    this.scene.add(sprite);
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
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: createTokenTexture(color) }));
    sprite.scale.set(1.6, 1.6, 1);
    sprite.position.set(tilePosition.x, PIECE_REST_Y, tilePosition.z);
    this.scene.add(sprite);
    return sprite;
  }

  /** Same billboard-sprite piece, but textured from a real character icon (a canvas cropped from the player-icon sheet - see iconSheet.js) instead of the placeholder colored circle. */
  createPieceFromImage(imageSource, tilePosition) {
    const texture = new THREE.CanvasTexture(imageSource);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(1.6, 1.6, 1);
    sprite.position.set(tilePosition.x, PIECE_REST_Y, tilePosition.z);
    this.scene.add(sprite);
    return sprite;
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

  _applyCamera() {
    this.camera.position.copy(this.focus).add(CAMERA_OFFSET);
    this.camera.lookAt(this.focus);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
