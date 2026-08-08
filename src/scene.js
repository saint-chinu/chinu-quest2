import * as THREE from 'three';
import { TileType } from './board.js';

const TILE_COLOR = {
  [TileType.START]: 0xffd166,
  [TileType.LAND]: 0x4a90d9,
  [TileType.EVENT]: 0x9b5de5,
};

// Offset diagonally (not straight along Z) so the camera looks at the
// board from a corner angle. This is what makes the axis-aligned square
// tiles read as diamonds on screen, isometric-style — the tiles
// themselves stay plain squares.
const CAMERA_OFFSET = new THREE.Vector3(14.5, 25, 14.5);
const CAMERA_FOV = 45;

// Exponential smoothing rate for the camera chasing its target (world x/z
// only — vertical piece motion never feeds into this). Lower = slower,
// lazier follow.
const CAMERA_FOLLOW_SPEED = 2.2;

export const PIECE_REST_Y = 0.7;

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

export class GameScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      200
    );

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this._setupLights();

    this.focus = new THREE.Vector3(0, 0, 0);
    this.chaseTarget = new THREE.Vector3(0, 0, 0);
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
  }

  buildBoard(tiles) {
    const tileGeo = new THREE.BoxGeometry(2.6, 0.4, 2.6);
    for (const tile of tiles) {
      const mat = new THREE.MeshStandardMaterial({ color: TILE_COLOR[tile.type] });
      const mesh = new THREE.Mesh(tileGeo, mat);
      mesh.position.set(tile.position.x, -0.2, tile.position.z);
      this.scene.add(mesh);
      tile.mesh = mesh;
    }

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x14141f })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.6;
    this.scene.add(ground);
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

  setFocusImmediate(x, z) {
    this.focus.set(x, 0, z);
    this.chaseTarget.set(x, 0, z);
    this._applyCamera();
  }

  /** Horizontal-only chase target; call continuously as a piece moves. */
  setChaseTarget(x, z) {
    this.chaseTarget.set(x, 0, z);
  }

  update(delta) {
    const alpha = 1 - Math.exp(-CAMERA_FOLLOW_SPEED * delta);
    this.focus.lerp(this.chaseTarget, alpha);
    this._applyCamera();
  }

  _applyCamera() {
    this.camera.position.copy(this.focus).add(CAMERA_OFFSET);
    this.camera.lookAt(this.focus);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
