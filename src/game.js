import { TileType } from './board.js';
import { PIECE_REST_Y } from './scene.js';
import { CardType, CARD_COLOR, Deck } from './cards.js';
import { buildStarterExtraCards } from './battleCards.js';
import { createFieldUnit, resolveBattle } from './battle.js';
import { tween, easeInOutQuad, delay } from './utils.js';

const STEP_DURATION_MS = 300;
const START_BONUS = 100;

const STARTING_HAND_SIZE = 4;
const HAND_LIMIT = 6;

// The camera doesn't chase every step - it only pans once movement adds up
// to this many tiles since its last pan (across turns, not reset per
// roll), so small moves leave it completely still.
const TILE_PAN_THRESHOLD = 3;

// CPU "thinking" pauses so its turns don't blow by instantly.
const CPU_PRE_ROLL_MS = 1400;
const CPU_DECISION_MS = 900;

export class Game {
  constructor({
    tiles,
    scene,
    onLog,
    onStateChange,
    onCardReveal,
    onDiscardChoice,
    onSpellUse,
    onCpuRoll,
    onMoveComplete,
    onLandCommand,
    onPickMonsterCard,
    onConfirmAction,
    onTileInfo,
    onPickLandForLevelUp,
    onChooseDirection,
  }) {
    this.tiles = tiles;
    this.scene = scene;
    this.onLog = onLog;
    this.onStateChange = onStateChange;
    this.onCardReveal = onCardReveal;
    this.onDiscardChoice = onDiscardChoice;
    this.onSpellUse = onSpellUse;
    this.onCpuRoll = onCpuRoll;
    this.onMoveComplete = onMoveComplete;
    this.onLandCommand = onLandCommand;
    this.onPickMonsterCard = onPickMonsterCard;
    this.onConfirmAction = onConfirmAction;
    this.onTileInfo = onTileInfo;
    this.onPickLandForLevelUp = onPickLandForLevelUp;
    this.onChooseDirection = onChooseDirection;

    // allianceId is unused today (only 2 players, no alliance mode yet) but
    // the state payload already carries it so the UI's slot layout - which
    // groups same-alliance players together - is ready when that lands.
    // direction is +1 (clockwise, tile index increases) or -1
    // (counterclockwise); chosen once at game start and, later, also
    // flippable mid-game by a special card effect.
    this.players = [
      { id: 0, name: 'プレイヤー', isCPU: false, currency: 500, tileIndex: 0, direction: 1, color: 0x2ec4b6, allianceId: null, deck: new Deck(buildStarterExtraCards()), hand: [], spellUsedThisTurn: false },
      { id: 1, name: 'CPU', isCPU: true, currency: 500, tileIndex: 0, direction: 1, color: 0xe63946, allianceId: null, deck: new Deck(buildStarterExtraCards()), hand: [], spellUsedThisTurn: false },
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

  async init() {
    for (const player of this.players) {
      player.mesh = this.scene.createPiece(player.color, this.tiles[player.tileIndex].position);
      for (let i = 0; i < STARTING_HAND_SIZE; i++) {
        const card = player.deck.draw();
        if (card) player.hand.push(card);
      }
    }
    const startPos = this.tiles[this.currentPlayer.tileIndex].position;
    this.scene.setFocusImmediate(startPos.x, startPos.z);

    const human = this.players.find((p) => !p.isCPU);
    if (human && this.onChooseDirection) {
      human.direction = await this.onChooseDirection();
    }

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

  /**
   * `steps` is the already-determined dice result (from the UI's
   * spin-and-stop, or CPU's own roll). Turn order: ① move ② resolve a
   * special tile (goal/checkpoint) if landed on one ③ land command menu
   * if landed on a land tile.
   */
  async rollDice(steps) {
    if (this.isBusy || !this.awaitingRoll) return;
    this.isBusy = true;
    this.awaitingRoll = false;
    this._notifyState();

    const player = this.currentPlayer;
    this.onLog(`${player.name}のサイコロ: ${steps}`);

    await this._movePlayer(player, steps);
    this.onMoveComplete?.();
    await this._resolveSpecialTile(player);
    await this._runLandCommand(player);
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
      player.tileIndex = (player.tileIndex + player.direction + this.tiles.length) % this.tiles.length;
      const toTile = this.tiles[player.tileIndex];
      await this._stepWithCamera(player, fromTile.position, toTile.position);

      if (player.tileIndex === 0 && i < steps - 1) {
        player.currency += START_BONUS;
        this.onLog(`${player.name}はスタートを通過！ +${START_BONUS}`);
      }
    }
  }

  /**
   * The piece moves at a constant, uninterrupted pace - the camera pan (if
   * any) is fired off in the background and never awaited, so a slower
   * multi-hundred-ms pan can never stall the next tile's step.
   */
  _stepWithCamera(player, from, to) {
    if (this.scene.isOutsideSafeView(to.x, to.z)) {
      this.scene.panTo(to.x, to.z);
      this.tilesSincePan = 0;
    } else {
      this.tilesSincePan += 1;
      if (this.tilesSincePan >= TILE_PAN_THRESHOLD) {
        this.scene.panTo(to.x, to.z);
        this.tilesSincePan = 0;
      }
    }

    return this._tweenStep(player, from, to);
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

  /** ② Goal/checkpoint handling, plus the toll auto-charge for stopping on someone else's land. */
  async _resolveSpecialTile(player) {
    const tile = this.tiles[player.tileIndex];

    if (tile.type === TileType.START) {
      player.currency += START_BONUS;
      this.onLog(`${player.name}はゴールに到着！ +${START_BONUS}`);
    } else if (tile.type === TileType.EVENT) {
      this.onLog(`${player.name}はチェックポイントに止まった`);
    } else if (tile.type === TileType.LAND && tile.owner != null && tile.owner !== player.id) {
      const owner = this.players.find((p) => p.id === tile.owner);
      player.currency -= tile.toll;
      owner.currency += tile.toll;
      this.onLog(`${player.name}は通行料を支払った (-${tile.toll}G → ${owner.name})`);
    }

    await delay(200);
  }

  /**
   * ③ The summon/invade/swap, level-up, and info menu for whichever land
   * tile was landed on. Summon/invade/swap and level-up both end the turn
   * as soon as they actually go through; info just loops back to the menu
   * (nothing about it commits to anything), and so does a cancelled action.
   */
  async _runLandCommand(player) {
    const tile = this.tiles[player.tileIndex];
    if (tile.type !== TileType.LAND) return;

    if (player.isCPU) {
      await this._cpuLandCommand(player, tile);
      return;
    }

    for (;;) {
      const choice = await this.onLandCommand(this.getTileSummary(tile), {
        canSummon: this._affordableMonsterCards(player).length > 0,
        canLevelUp: this._ownedTiles(player).length > 0,
      });
      if (choice === 'end') return;

      if (choice === 'summon') {
        if (await this._humanSummonFlow(player, tile)) return;
      } else if (choice === 'levelup') {
        if (await this._humanLevelUpFlow(player)) return;
      } else if (choice === 'info') {
        await this.onTileInfo();
      }
    }
  }

  _affordableMonsterCards(player) {
    return player.hand.filter((c) => c.type === CardType.MONSTER && c.cost <= player.currency);
  }

  _ownedTiles(player) {
    return this.tiles.filter((t) => t.owner === player.id);
  }

  /** Returns true if a summon/invade/swap actually went through (vs. being cancelled). */
  async _humanSummonFlow(player, tile) {
    const options = this._affordableMonsterCards(player);
    if (options.length === 0) {
      this.onLog('召喚できるモンスターカードがありません');
      return false;
    }

    const card = await this.onPickMonsterCard(options);
    if (!card) return false;

    const actionType = tile.owner == null ? 'summon' : tile.owner === player.id ? 'swap' : 'invade';
    const confirmed = await this.onConfirmAction({ actionType, card, cost: card.cost, tile: this.getTileSummary(tile) });
    if (!confirmed) return false;

    player.hand = player.hand.filter((c) => c.id !== card.id);
    player.deck.discard(card);
    player.currency -= card.cost;

    if (actionType === 'summon' || actionType === 'swap') {
      this._placeUnit(tile, player, card);
      this.onLog(`${player.name}は${card.name}を${actionType === 'summon' ? '召喚' : '入れ替え'}した (-${card.cost}G)`);
    } else {
      await this._runInvasion(player, tile, card);
    }
    this._notifyState();
    return true;
  }

  /** Returns true if a level-up actually went through (vs. no owned tiles / cancelled / unaffordable). */
  async _humanLevelUpFlow(player) {
    const owned = this._ownedTiles(player);
    if (owned.length === 0) return false;

    const targetId = await this.onPickLandForLevelUp(owned.map((t) => this.getTileSummary(t)));
    if (targetId == null) return false;
    const target = this.tiles.find((t) => t.id === targetId);
    if (!target) return false;

    const cost = target.price * target.level;
    const confirmed = await this.onConfirmAction({ actionType: 'levelup', cost, tile: this.getTileSummary(target) });
    if (!confirmed) return false;
    if (player.currency < cost) {
      this.onLog('ゴールドが足りません');
      return false;
    }

    player.currency -= cost;
    target.level += 1;
    target.toll = target.baseToll * target.level;
    this.onLog(`${player.name}は土地をLv${target.level}にアップグレードした (-${cost}G)`);
    this._notifyState();
    return true;
  }

  async _cpuLandCommand(player, tile) {
    await delay(CPU_DECISION_MS);
    if (tile.owner === player.id) return; // CPU doesn't bother swapping its own land yet

    const options = this._affordableMonsterCards(player);
    if (options.length === 0) return;
    const card = options[0];
    const actionType = tile.owner == null ? 'summon' : 'invade';

    player.hand = player.hand.filter((c) => c.id !== card.id);
    player.deck.discard(card);
    player.currency -= card.cost;

    if (actionType === 'summon') {
      this._placeUnit(tile, player, card);
      this.onLog(`${player.name}は${card.name}を召喚した (-${card.cost}G)`);
    } else {
      await this._runInvasion(player, tile, card);
    }
    this._notifyState();
  }

  async _runInvasion(player, tile, card) {
    const defenderPlayer = this.players.find((p) => p.id === tile.owner);
    const attackerUnit = createFieldUnit(card, player.id);
    const defenderUnit = tile.unit;
    const result = resolveBattle(attackerUnit, defenderUnit, this._goldAdapter());
    result.log.forEach((line) => this.onLog(line));

    if (!result.defenderSurvived) {
      if (result.attackerSurvived) {
        tile.unit = attackerUnit;
        tile.owner = player.id;
        this._paintTile(tile, player.color);
        this.onLog(`${player.name}が土地を奪取した！`);
      } else {
        tile.unit = null;
        tile.owner = null;
        this._repaintTileToElement(tile);
        this.onLog('両者相打ちで土地は無人になった');
      }
    } else {
      this.onLog(`${defenderPlayer.name}の${defenderUnit.def.name}が防衛に成功した`);
    }
  }

  _placeUnit(tile, player, card) {
    tile.unit = createFieldUnit(card, player.id);
    tile.owner = player.id;
    this._paintTile(tile, player.color);
  }

  _goldAdapter() {
    const findPlayer = (id) => this.players.find((p) => p.id === id);
    return {
      add: (ownerId, amount) => {
        const p = findPlayer(ownerId);
        if (p) p.currency += amount;
      },
      transfer: (fromId, toId, amount) => {
        const from = findPlayer(fromId);
        const to = findPlayer(toId);
        if (from) from.currency -= amount;
        if (to) to.currency += amount;
      },
    };
  }

  /** Plain-data snapshot of a tile for the UI - safe to hand to main.js, no mesh/internal refs. */
  getTileSummary(tile) {
    const owner = tile.owner != null ? this.players.find((p) => p.id === tile.owner) : null;
    return {
      id: tile.id,
      type: tile.type,
      element: tile.element,
      level: tile.level,
      toll: tile.toll,
      price: tile.price,
      ownerName: owner ? owner.name : null,
      ownerColor: owner ? owner.color : null,
      unitName: tile.unit ? tile.unit.def.name : null,
      unitAtk: tile.unit ? tile.unit.def.atk : null,
      unitHp: tile.unit ? tile.unit.currentHp ?? tile.unit.def.hp : null,
    };
  }

  _paintTile(tile, colorHexInt) {
    tile.mesh.material.color.setHex(colorHexInt);
  }

  _repaintTileToElement(tile) {
    tile.mesh.material.color.set(CARD_COLOR[tile.element]);
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

  /**
   * Culdcept has no land resale market - a land's worth is purely the toll
   * income it can extract from opponents, which is exactly what `toll`
   * already tracks (base rate x current level). Summing that, rather than
   * the flat purchase `price`, means leveling up actually raises the
   * displayed total assets instead of only ever costing currency.
   */
  _landValueOf(playerId) {
    return this.tiles
      .filter((t) => t.owner === playerId)
      .reduce((sum, t) => sum + (t.toll || 0), 0);
  }

  _summonCountOf(playerId) {
    return this.tiles.filter((t) => t.owner === playerId).length;
  }

  _notifyState() {
    const human = this.players.find((p) => !p.isCPU);
    const showCenter = this.awaitingRoll && !this.isBusy;
    this.onStateChange({
      turnText: `${this.currentPlayer.name}のターン`,
      canRoll: showCenter && !this.currentPlayer.isCPU,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        allianceId: p.allianceId,
        currency: p.currency,
        totalAssets: p.currency + this._landValueOf(p.id),
        summonCount: this._summonCountOf(p.id),
        handCount: p.hand.length,
      })),
      hand: human.hand,
      showCenter,
      centerHand: this.currentPlayer.hand,
      currentPlayerIsCPU: this.currentPlayer.isCPU,
      spellUsedThisTurn: this.currentPlayer.spellUsedThisTurn,
    });
  }
}
