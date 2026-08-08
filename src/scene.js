import * as THREE from 'three';
import { TileType } from './board.js';

const TILE_COLOR = {
  [TileType.START]: 0xffd166,
  [TileType.LAND]: 0x4a90d9,
  [TileType.EVENT]: 0x9b5de5,
};

// Pulled back and flattened for a wide, "見下ろし" overview of the board.
const CAMERA_OFFSET = new THREE.Vector3(0, 25, 20);
const CAMERA_FOV = 45;

// Exponential smoothing rate for the camera chasing its target (world x/z
// only — vertical piece motion never feeds into this). Lower = slower,
// lazier follow.
const CAMERA_FOLLOW_SPEED = 2.2;

export const PIECE_REST_Y = 0.7;

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
    // Rotated 45° so each square tile reads as a diamond from the angled
    // camera, à la Cardcaptor-style board games. Sized so the rotated
    // diagonal still fits within the tile spacing without overlapping.
    const tileGeo = new THREE.BoxGeometry(2.2, 0.4, 2.2);
    for (const tile of tiles) {
      const mat = new THREE.MeshStandardMaterial({ color: TILE_COLOR[tile.type] });
      const mesh = new THREE.Mesh(tileGeo, mat);
      mesh.position.set(tile.position.x, -0.2, tile.position.z);
      mesh.rotation.y = Math.PI / 4;
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

  createPiece(color, tilePosition) {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.55, 0.75, 4, 8),
      new THREE.MeshStandardMaterial({ color })
    );
    mesh.position.set(tilePosition.x, PIECE_REST_Y, tilePosition.z);
    this.scene.add(mesh);
    return mesh;
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
