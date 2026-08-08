import * as THREE from 'three';
import { TileType } from './board.js';
import { tween, easeInOutQuad } from './utils.js';

const TILE_COLOR = {
  [TileType.START]: 0xffd166,
  [TileType.LAND]: 0x4a90d9,
  [TileType.EVENT]: 0x9b5de5,
};

// Pulled back and flattened for a wide, "見下ろし" overview of the board.
const CAMERA_OFFSET = new THREE.Vector3(0, 17, 14);
const CAMERA_FOV = 45;

// Half-size (world units) of the area around the current camera focus that
// the piece can move within without the camera reacting. Kept larger than
// the phase-1 board so the camera stays completely still during normal
// play; once a board's tiles reach past this, the camera pans just enough
// to bring the destination back into view. This is what keeps camera
// motion "最低限" — it only ever moves when the piece would otherwise go
// off-screen, never as a continuous per-frame chase.
const DEADZONE_HALF_X = 11;
const DEADZONE_HALF_Z = 9;
const PAN_DURATION_MS = 350;

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
    const tileGeo = new THREE.BoxGeometry(3, 0.4, 3);
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

  createPiece(color, tilePosition) {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 0.6, 4, 8),
      new THREE.MeshStandardMaterial({ color })
    );
    mesh.position.set(tilePosition.x, 0.5, tilePosition.z);
    this.scene.add(mesh);
    return mesh;
  }

  setFocusImmediate(x, z) {
    this.focus.set(x, 0, z);
    this._applyCamera();
  }

  /**
   * If (x, z) lies outside the deadzone around the current focus, pans the
   * camera to recenter on it and returns the pan's promise. Otherwise
   * returns null and the camera does not move at all.
   */
  panIfNeeded(x, z) {
    const dx = x - this.focus.x;
    const dz = z - this.focus.z;
    if (Math.abs(dx) <= DEADZONE_HALF_X && Math.abs(dz) <= DEADZONE_HALF_Z) {
      return null;
    }

    const from = this.focus.clone();
    const to = new THREE.Vector3(x, 0, z);
    return tween(PAN_DURATION_MS, (t) => {
      this.focus.lerpVectors(from, to, easeInOutQuad(t));
      this._applyCamera();
    });
  }

  _applyCamera() {
    this.camera.position.copy(this.focus).add(CAMERA_OFFSET);
    this.camera.lookAt(this.focus);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
