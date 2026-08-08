import { TileType } from './board.js';
import { tween, easeInOutQuad, delay, randomInt } from './utils.js';

const STEP_DURATION_MS = 300;
const START_BONUS = 100;

export class Game {
  constructor({ tiles, scene, onLog, onStateChange, onPurchasePrompt }) {
    this.tiles = tiles;
    this.scene = scene;
    this.onLog = onLog;
    this.onStateChange = onStateChange;
    this.onPurchasePrompt = onPurchasePrompt;

    this.players = [
      { id: 0, name: 'プレイヤー', isCPU: false, currency: 500, tileIndex: 0, color: 0x2ec4b6 },
      { id: 1, name: 'CPU', isCPU: true, currency: 500, tileIndex: 0, color: 0xe63946 },
    ];
    this.currentPlayerIndex = 0;
    this.isBusy = false;
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  init() {
    for (const player of this.players) {
      player.mesh = this.scene.createPiece(player.color, this.tiles[player.tileIndex].position);
    }
    const startPos = this.tiles[0].position;
    this.scene.setFocusImmediate(startPos.x, startPos.z);
    this._notifyState();
  }

  async rollDice() {
    if (this.isBusy) return;
    this.isBusy = true;
    this._notifyState();

    const player = this.currentPlayer;
    const steps = randomInt(1, 6);
    this.onLog(`${player.name}のサイコロ: ${steps}`);

    await this._movePlayer(player, steps);
    await this._resolveTile(player);
    await delay(400);

    this._nextTurn();
    this.isBusy = false;
    this._notifyState();

    if (this.currentPlayer.isCPU) {
      this._runCPUTurn();
    }
  }

  async _movePlayer(player, steps) {
    for (let i = 0; i < steps; i++) {
      const fromTile = this.tiles[player.tileIndex];
      player.tileIndex = (player.tileIndex + 1) % this.tiles.length;
      const toTile = this.tiles[player.tileIndex];
      await this._tweenStep(player, fromTile.position, toTile.position);

      if (player.tileIndex === 0 && i < steps - 1) {
        player.currency += START_BONUS;
        this.onLog(`${player.name}はスタートを通過！ +${START_BONUS}`);
      }
    }
  }

  _tweenStep(player, from, to) {
    return tween(STEP_DURATION_MS, (t) => {
      const eased = easeInOutQuad(t);
      const x = from.x + (to.x - from.x) * eased;
      const z = from.z + (to.z - from.z) * eased;
      const hop = Math.sin(Math.PI * t) * 0.5;
      player.mesh.position.set(x, 0.5 + hop, z);
      this.scene.setFocusTarget(x, z);
    });
  }

  async _resolveTile(player) {
    const tile = this.tiles[player.tileIndex];

    if (tile.type === TileType.START) {
      player.currency += START_BONUS;
      this.onLog(`${player.name}はスタートに到着！ +${START_BONUS}`);
    } else if (tile.type === TileType.LAND) {
      await this._resolveLand(player, tile);
    } else if (tile.type === TileType.EVENT) {
      this.onLog(`${player.name}はイベントマスに止まった`);
    }

    await delay(200);
  }

  async _resolveLand(player, tile) {
    if (tile.owner === null || tile.owner === undefined) {
      const canAfford = player.currency >= tile.price;
      const wantsToBuy = player.isCPU
        ? canAfford
        : canAfford && (await this.onPurchasePrompt(tile));

      if (wantsToBuy) {
        player.currency -= tile.price;
        tile.owner = player.id;
        this._paintTile(tile, player.color);
        this.onLog(`${player.name}は土地を購入 (-${tile.price}G)`);
      }
      return;
    }

    if (tile.owner !== player.id) {
      const owner = this.players.find((p) => p.id === tile.owner);
      player.currency -= tile.toll;
      owner.currency += tile.toll;
      this.onLog(`${player.name}は通行料を支払った (-${tile.toll}G → ${owner.name})`);
    }
  }

  _paintTile(tile, color) {
    tile.mesh.material.color.setHex(color);
  }

  _nextTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
  }

  async _runCPUTurn() {
    await delay(700);
    if (!this.currentPlayer.isCPU) return;
    this.rollDice();
  }

  _notifyState() {
    this.onStateChange({
      turnText: `${this.currentPlayer.name}のターン`,
      canRoll: !this.isBusy && !this.currentPlayer.isCPU,
      players: this.players.map((p) => ({ name: p.name, currency: p.currency })),
    });
  }
}
