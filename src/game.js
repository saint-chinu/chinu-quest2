import { TileType } from './board.js';
import { PIECE_REST_Y } from './scene.js';
import { CardType, Deck } from './cards.js';
import { tween, easeInOutQuad, delay } from './utils.js';

const STEP_DURATION_MS = 300;
const START_BONUS = 100;

const STARTING_HAND_SIZE = 4;
const HAND_LIMIT = 6;

// The camera doesn't chase every step - it only pans once movement adds up
// to this many tiles since its last pan (across turns, not reset per
// roll), so small moves leave it completely still.
const TILE_PAN_THRESHOLD = 3;
// If a step would otherwise leave the piece off-screen, the camera pan
// starts this many ms before the piece itself starts moving into that
// tile, so it leads rather than reacts.
const LOOKAHEAD_LEAD_MS = 150;

// CPU "thinking" pauses so its turns don't blow by instantly.
const CPU_PRE_ROLL_MS = 1400;
const CPU_DECISION_MS = 900;

export class Game {
  constructor({
    tiles,
    scene,
    onLog,
    onStateChange,
    onPurchasePrompt,
    onCardReveal,
    onDiscardChoice,
    onSpellUse,
    onCpuRoll,
  }) {
    this.tiles = tiles;
    this.scene = scene;
    this.onLog = onLog;
    this.onStateChange = onStateChange;
    this.onPurchasePrompt = onPurchasePrompt;
    this.onCardReveal = onCardReveal;
    this.onDiscardChoice = onDiscardChoice;
    this.onSpellUse = onSpellUse;
    this.onCpuRoll = onCpuRoll;

    this.players = [
      { id: 0, name: 'プレイヤー', isCPU: false, currency: 500, tileIndex: 0, color: 0x2ec4b6, deck: new Deck(), hand: [], spellUsedThisTurn: false },
      { id: 1, name: 'CPU', isCPU: true, currency: 500, tileIndex: 0, color: 0xe63946, deck: new Deck(), hand: [], spellUsedThisTurn: false },
    ];
    this.currentPlayerIndex = 0;
    this.isBusy = false;
    this.tilesSincePan = 0;
    // True from the moment a turn's draw finishes until the dice is
    // rolled - the window where the center hand+dice is shown and a
    // spell may be used.
    this.awaitingRoll = false;
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  init() {
    for (const player of this.players) {
      player.mesh = this.scene.createPiece(player.color, this.tiles[player.tileIndex].position);
      for (let i = 0; i < STARTING_HAND_SIZE; i++) {
        const card = player.deck.draw();
        if (card) player.hand.push(card);
      }
    }
    const startPos = this.tiles[this.currentPlayer.tileIndex].position;
    this.scene.setFocusImmediate(startPos.x, startPos.z);
    this._beginTurn();
  }

  /** Runs automatically whenever a turn starts: draw, then hand control to the player (or CPU). */
  async _beginTurn() {
    this.isBusy = true;
    this.awaitingRoll = false;
    this.currentPlayer.spellUsedThisTurn = false;
    this._notifyState();

    await this._drawForTurn(this.currentPlayer);

    this.isBusy = false;
    this.awaitingRoll = true;
    this._notifyState();

    if (this.currentPlayer.isCPU) {
      this._runCPUTurn();
    }
  }

  /** Uses a spell from the current (human) player's hand, once per turn, before rolling. */
  async useSpell(card) {
    if (this.isBusy || !this.awaitingRoll || this.currentPlayer.isCPU) return;
    const player = this.currentPlayer;
    if (player.spellUsedThisTurn) return;
    if (card.type !== CardType.SPELL) return;
    if (!player.hand.some((c) => c.id === card.id)) return;

    this.isBusy = true;
    this._notifyState();

    player.hand = player.hand.filter((c) => c.id !== card.id);
    player.deck.discard(card);
    player.spellUsedThisTurn = true;
    this.onLog(`${player.name}は「${card.name}」を使用した`);

    await this.onSpellUse(card);

    this.isBusy = false;
    this._notifyState();
  }

  /** `steps` is the already-determined dice result (from the UI's spin-and-stop, or CPU's own roll). */
  async rollDice(steps) {
    if (this.isBusy || !this.awaitingRoll) return;
    this.isBusy = true;
    this.awaitingRoll = false;
    this._notifyState();

    const player = this.currentPlayer;
    this.onLog(`${player.name}のサイコロ: ${steps}`);

    await this._movePlayer(player, steps);
    await this._resolveTile(player);
    await delay(400);

    this._nextTurn();
    await this._beginTurn();
  }

  async _drawForTurn(player) {
    const card = player.deck.draw();
    if (!card) return;

    if (player.isCPU) {
      this.onLog(`${player.name}はカードを1枚引いた`);
    } else {
      await this.onCardReveal(card);
    }

    player.hand.push(card);
    this._notifyState();

    if (player.hand.length > HAND_LIMIT) {
      let discarded;
      if (player.isCPU) {
        await delay(CPU_DECISION_MS);
        discarded = player.hand[0];
      } else {
        discarded = await this.onDiscardChoice(player.hand);
      }
      player.hand = player.hand.filter((c) => c.id !== discarded.id);
      player.deck.discard(discarded);
      if (player.isCPU) this.onLog(`${player.name}は手札を1枚捨てた`);
      this._notifyState();
    }
  }

  async _movePlayer(player, steps) {
    for (let i = 0; i < steps; i++) {
      const fromTile = this.tiles[player.tileIndex];
      player.tileIndex = (player.tileIndex + 1) % this.tiles.length;
      const toTile = this.tiles[player.tileIndex];
      await this._stepWithCamera(player, fromTile.position, toTile.position);

      if (player.tileIndex === 0 && i < steps - 1) {
        player.currency += START_BONUS;
        this.onLog(`${player.name}はスタートを通過！ +${START_BONUS}`);
      }
    }
  }

  async _stepWithCamera(player, from, to) {
    let pan = null;

    if (this.scene.isOutsideSafeView(to.x, to.z)) {
      // The piece is about to leave the visible area - lead with the
      // camera instead of reacting after it's already off-screen.
      pan = this.scene.panTo(to.x, to.z);
      this.tilesSincePan = 0;
      await delay(LOOKAHEAD_LEAD_MS);
    } else {
      this.tilesSincePan += 1;
      if (this.tilesSincePan >= TILE_PAN_THRESHOLD) {
        pan = this.scene.panTo(to.x, to.z);
        this.tilesSincePan = 0;
      }
    }

    const move = this._tweenStep(player, from, to);
    await (pan ? Promise.all([move, pan]) : move);
  }

  _tweenStep(player, from, to) {
    return tween(STEP_DURATION_MS, (t) => {
      const eased = easeInOutQuad(t);
      const x = from.x + (to.x - from.x) * eased;
      const z = from.z + (to.z - from.z) * eased;
      const hop = Math.sin(Math.PI * t) * 0.5;
      player.mesh.position.set(x, PIECE_REST_Y + hop, z);
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
      let wantsToBuy;
      if (player.isCPU) {
        await delay(CPU_DECISION_MS);
        wantsToBuy = canAfford;
      } else {
        wantsToBuy = canAfford && (await this.onPurchasePrompt(tile));
      }

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
    await delay(CPU_PRE_ROLL_MS);
    if (!this.currentPlayer.isCPU) return;
    const steps = await this.onCpuRoll();
    this.rollDice(steps);
  }

  _notifyState() {
    const human = this.players.find((p) => !p.isCPU);
    const showCenter = this.awaitingRoll && !this.isBusy;
    this.onStateChange({
      turnText: `${this.currentPlayer.name}のターン`,
      canRoll: showCenter && !this.currentPlayer.isCPU,
      players: this.players.map((p) => ({ name: p.name, currency: p.currency, handCount: p.hand.length })),
      hand: human.hand,
      showCenter,
      centerHand: this.currentPlayer.hand,
      currentPlayerIsCPU: this.currentPlayer.isCPU,
      spellUsedThisTurn: this.currentPlayer.spellUsedThisTurn,
    });
  }
}
