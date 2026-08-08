import * as THREE from 'three';
import { TileType } from './board.js';

const TILE_COLOR = {
  [TileType.START]: 0xffd166,
  [TileType.LAND]: 0x4a90d9,
  [TileType.EVENT]: 0x9b5de5,
};

const CAMERA_OFFSET = new THREE.Vector3(0, 9, 7);
const CAMERA_FOLLOW_SPEED = 4.5; // higher = snappier follow

export class GameScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    this.camera = new THREE.PerspectiveCamera(
      45,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this._setupLights();

    this.currentFocus = new THREE.Vector3(0, 0, 0);
    this.focusTarget = new THREE.Vector3(0, 0, 0);
    this.camera.position.copy(this.currentFocus).add(CAMERA_OFFSET);
    this.camera.lookAt(this.currentFocus);

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
      new THREE.PlaneGeometry(200, 200),
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

  setFocusTarget(x, z) {
    this.focusTarget.set(x, 0, z);
  }

  setFocusImmediate(x, z) {
    this.focusTarget.set(x, 0, z);
    this.currentFocus.copy(this.focusTarget);
  }

  update(delta) {
    const alpha = 1 - Math.exp(-CAMERA_FOLLOW_SPEED * delta);
    this.currentFocus.lerp(this.focusTarget, alpha);
    this.camera.position.copy(this.currentFocus).add(CAMERA_OFFSET);
    this.camera.lookAt(this.currentFocus);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
