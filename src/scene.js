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
const PAN_DURATION_MS = 350;

// Fraction of the geometrically-visible ground area that counts as "safe".
// Leaves margin for the piece's own size and for HUD elements overlapping
// the edges of the screen.
const DEADZONE_MARGIN = 0.65;

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const NDC_CORNERS = [
  [-1, -1], // bottom-left (nearest to camera)
  [1, -1], // bottom-right (nearest to camera)
  [-1, 1], // top-left (farthest from camera)
  [1, 1], // top-right (farthest from camera)
];

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
    // Safe (x, z) offsets from the current focus, in world units, derived
    // from the actual camera frustum by resize(). The near (bottom of
    // screen) and far (top of screen) edges sit at different distances
    // under this oblique angle, so they're tracked separately rather than
    // assumed symmetric.
    this.deadzone = { halfX: 0, nearZ: 0, farZ: 0 };
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
    const [bottomLeft, bottomRight, topLeft, topRight] = points;

    const halfX = Math.min(Math.abs(bottomLeft.x), Math.abs(bottomRight.x));
    const nearZ = Math.min(bottomLeft.z, bottomRight.z);
    const farZ = Math.max(topLeft.z, topRight.z);
    this.deadzone = {
      halfX: halfX * DEADZONE_MARGIN,
      nearZ: nearZ * DEADZONE_MARGIN,
      farZ: farZ * DEADZONE_MARGIN,
    };

    this.focus.copy(savedFocus);
    this._applyCamera();
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

  /** Unconditionally pans (no zoom/angle change) to center on (x, z). */
  centerOn(x, z) {
    return this._panTo(x, z);
  }

  /**
   * If (x, z) would fall outside the safe viewing area around the current
   * focus, pans the camera to bring it back into view and returns the
   * pan's promise. Otherwise returns null and the camera does not move.
   */
  panIfNeeded(x, z) {
    const dx = x - this.focus.x;
    const dz = z - this.focus.z;
    const { halfX, nearZ, farZ } = this.deadzone;
    const inView = Math.abs(dx) <= halfX && dz <= nearZ && dz >= farZ;
    return inView ? null : this._panTo(x, z);
  }

  _panTo(x, z) {
    const from = this.focus.clone();
    const to = new THREE.Vector3(x, 0, z);
    if (from.distanceTo(to) < 0.01) return null;
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
