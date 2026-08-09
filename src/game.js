import { TileType } from './board.js';
import { PIECE_REST_Y } from './scene.js';
import { CardType, CARD_COLOR, Element, ELEMENT_LABEL, Deck } from './cards.js';
import { buildStarterExtraCards } from './battleCards.js';
import { createFieldUnit, resolveBattle } from './battle.js';
import { getCardCatalog } from './cardCatalog.js';
import { tween, easeInOutQuad, delay } from './utils.js';

const SHOP_OPTION_COUNT = 3;

function randomSample(list, count) {
  const pool = [...list];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

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

// Culdcept-accurate land economy: 地価 = 基本地価(tile.price) × レベル倍率 ×
// 連鎖倍率, 通行料 = 地価 × 通行料倍率. Both multiplier tables only go up to
// Lv5, so land level is capped there too (レベルアップ can't push past it).
const LEVEL_CAP = 5;
// カルドセプト ビギンズ系
const CHAIN_MULTIPLIER = { 1: 1.0, 2: 1.5, 3: 2.0, 4: 2.5, 5: 3.0 };
const TOLL_RATE = { 1: 0.3, 2: 0.3, 3: 0.4, 4: 0.6, 5: 0.8 };
// Flat cost to level up FROM the given level (not a formula) - keyed by current level.
const LEVEL_UP_COST = { 1: 50, 2: 200, 3: 400, 4: 600 };
// 属性変更コスト = 現レベル×100（無色マスからの変更は半額）
const ELEMENT_CHANGE_COST_PER_LEVEL = 100;
const NEUTRAL_ELEMENT_CHANGE_DISCOUNT = 0.5;
const CHANGEABLE_ELEMENTS = [Element.FIRE, Element.WATER, Element.THUNDER, Element.FOREST, Element.NEUTRAL];

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
    onConfirmMove,
    onPickBrowseTile,
    onLandSubmenu,
    onShowTileInfo,
    onChooseBranch,
    onPickMoveDirection,
    onPickElement,
    onShopPurchase,
    humanPlayer,
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
    this.onConfirmMove = onConfirmMove;
    this.onPickBrowseTile = onPickBrowseTile;
    this.onLandSubmenu = onLandSubmenu;
    this.onShowTileInfo = onShowTileInfo;
    this.onChooseBranch = onChooseBranch;
    this.onPickMoveDirection = onPickMoveDirection;
    this.onPickElement = onPickElement;
    this.onShopPurchase = onShopPurchase;
    // A canvas cropped from the player-icon sheet (see iconSheet.js) for
    // the human player's board piece - null falls back to the plain
    // colored-circle token (always true for CPU, which has no character).
    this.humanIconImage = humanPlayer?.iconImage ?? null;

    // allianceId is unused today (only 2 players, no alliance mode yet) but
    // the state payload already carries it so the UI's slot layout - which
    // groups same-alliance players together - is ready when that lands.
    // tileId indexes into `tiles` (ids are assigned sequentially at parse
    // time, so id === array index). previousTileId excludes backtracking
    // when picking the next step at a branch (see _movePlayer) - null at
    // game start, when every neighbor of the start tile is a fair option.
    this.players = [
      {
        id: 0,
        name: humanPlayer?.name || 'プレイヤー',
        isCPU: false,
        currency: 500,
        tileId: 0,
        previousTileId: null,
        color: humanPlayer?.color ?? 0x2ec4b6,
        allianceId: null,
        deck: humanPlayer?.deckList
          ? Deck.fromCardList(humanPlayer.deckList)
          : new Deck(buildStarterExtraCards(humanPlayer?.deckVariant)),
        hand: [],
        spellUsedThisTurn: false,
      },
      { id: 1, name: 'CPU', isCPU: true, currency: 500, tileId: 0, previousTileId: null, color: 0xe63946, allianceId: null, deck: new Deck(buildStarterExtraCards()), hand: [], spellUsedThisTurn: false },
    ];
    this.currentPlayerIndex = 0;
    this.isBusy = false;
    this.tilesSincePan = 0;
    // Tile ids stepped onto during the current dice roll (landing tile
    // included, the tile moved FROM excluded) - reset at the start of each
    // _movePlayer call. Powers 土地コマンド's "土地" browse, which is
    // normally scoped to just this turn's path (see _runLandCommand).
    this._turnPathIds = [];
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
      const pos = this.tiles[player.tileId].position;
      player.mesh = !player.isCPU && this.humanIconImage
        ? this.scene.createPieceFromImage(this.humanIconImage, pos)
        : this.scene.createPiece(player.color, pos);
      for (let i = 0; i < STARTING_HAND_SIZE; i++) {
        const card = player.deck.draw();
        if (card) player.hand.push(card);
      }
    }
    const startPos = this.tiles[this.currentPlayer.tileId].position;
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

  /**
   * The board is a graph (see board.js - the outer loop plus a "+"-shaped
   * inner cross), not a simple loop, so each step picks the next tile from
   * `fromTile.neighbors` rather than a fixed +1/-1. A tile with exactly one
   * forward option (excluding wherever the player just came from) just
   * continues automatically; a branch (2+ options - the 4 edge-midpoints
   * and the center) prompts a choice every time it's reached, not just
   * once at game start.
   */
  async _movePlayer(player, steps) {
    this._turnPathIds = [];
    for (let i = 0; i < steps; i++) {
      const fromTile = this.tiles[player.tileId];
      const forward = fromTile.neighbors.filter((id) => id !== player.previousTileId);
      const options = forward.length > 0 ? forward : fromTile.neighbors;

      const nextId = options.length === 1 ? options[0] : await this._chooseNextTile(player, fromTile, options);
      const toTile = this.tiles[nextId];
      player.previousTileId = player.tileId;
      player.tileId = nextId;
      this._turnPathIds.push(nextId);
      await this._stepWithCamera(player, fromTile.position, toTile.position);

      if (toTile.type === TileType.START && i < steps - 1) {
        player.currency += START_BONUS;
        this.onLog(`${player.name}はスタートを通過！ +${START_BONUS}`);
      }
    }
  }

  /** CPU just picks randomly; the human is prompted (camera-work + diagonal arrows toward whichever screen direction each option actually sits in). */
  async _chooseNextTile(player, fromTile, optionIds) {
    if (player.isCPU) return optionIds[Math.floor(Math.random() * optionIds.length)];

    const options = optionIds.map((id) => {
      const tile = this.tiles[id];
      const dgx = tile.gridX - fromTile.gridX;
      const dgz = tile.gridZ - fromTile.gridZ;
      const screenDir = dgx === 1 ? 'downright' : dgx === -1 ? 'upleft' : dgz === 1 ? 'downleft' : 'upright';
      return { tileId: id, screenDir };
    });
    return this.onChooseBranch(options);
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

  /** ② Goal/checkpoint/shop handling, plus the toll auto-charge for stopping on someone else's land. */
  async _resolveSpecialTile(player) {
    const tile = this.tiles[player.tileId];

    if (tile.type === TileType.START) {
      player.currency += START_BONUS;
      this.onLog(`${player.name}はゴールに到着！ +${START_BONUS}`);
    } else if (tile.type === TileType.EVENT) {
      this.onLog(`${player.name}はチェックポイントに止まった`);
    } else if (tile.type === TileType.SHOP) {
      await this._resolveShopTile(player);
    } else if (tile.type === TileType.LAND && tile.owner != null && tile.owner !== player.id) {
      const owner = this.players.find((p) => p.id === tile.owner);
      const toll = this._tollOfTile(tile);
      player.currency -= toll;
      owner.currency += toll;
      this.onLog(`${player.name}は通行料を支払った (-${toll}G → ${owner.name})`);
    }

    await delay(200);
  }

  /**
   * ショップマス: offers 3 random catalog cards (paid for with in-battle G,
   * added straight to hand). This is intentionally disconnected from
   * character.ownedCards - it's a one-match-only pickup, not a permanent
   * acquisition, so it must never touch the persistent collection (that's
   * the hub's ショップ screen's job, a completely separate system).
   */
  async _resolveShopTile(player) {
    if (player.isCPU) return; // CPU doesn't shop
    // Spells have no cost field at all today (useSpell has always been
    // free once drawn) - excluded here rather than pretending they cost 0G.
    const sellable = getCardCatalog().filter((c) => c.cost != null);
    const options = randomSample(sellable, SHOP_OPTION_COUNT);
    const card = await this.onShopPurchase(options, player.currency);
    if (!card) return;
    if (player.currency < card.cost) {
      this.onLog('ゴールドが足りません');
      return;
    }
    player.currency -= card.cost;
    player.hand.push({ ...card, id: `shop-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}` });
    this.onLog(`${player.name}はショップで「${card.name}」を購入した (-${card.cost}G)`);
    this._notifyState();
  }

  /**
   * ③ The 3-button 召喚(/侵略)・土地・終了 menu for whichever tile was
   * landed on. 召喚 acts on the CURRENT tile only (summon/invade/swap,
   * exactly like before); 土地 opens the tile-browse sub-flow (see
   * _runLandBrowse) scoped to this turn's traversed path - or, if the
   * player landed exactly on START/EVENT, to every tile they own (見た目
   * 上の「本拠地」扱い). Both 召喚 and any browse action that actually
   * commits end the turn immediately; a cancelled action just loops back
   * to this menu.
   */
  async _runLandCommand(player) {
    const tile = this.tiles[player.tileId];
    const isAdmin = tile.type === TileType.START || tile.type === TileType.EVENT;
    if (tile.type !== TileType.LAND && !isAdmin) return;

    if (player.isCPU) {
      if (tile.type === TileType.LAND) await this._cpuLandCommand(player, tile);
      return;
    }

    for (;;) {
      const choice = await this.onLandCommand(this.getTileSummary(tile), {
        canSummon: tile.type === TileType.LAND && this._affordableMonsterCards(player).length > 0,
      });
      if (choice === 'end') return;

      if (choice === 'summon') {
        if (await this._humanSummonFlow(player, tile)) return;
      } else if (choice === 'land') {
        const candidateIds = isAdmin ? this._ownedTiles(player).map((t) => t.id) : [...this._turnPathIds];
        if (candidateIds.length === 0) {
          this.onLog('選択できる土地がありません');
          continue;
        }
        if (await this._runLandBrowse(player, candidateIds)) return;
      }
    }
  }

  /**
   * 土地コマンドの「土地」: camera-work over just the candidate tiles
   * (blinking/highlighted), tapping one either opens the vertical submenu
   * (own tile with a garrisoned monster) or just shows its info inline
   * (anything else - handled entirely within onPickBrowseTile, which only
   * ever resolves once a "mine" tile is tapped or the player backs out).
   * Returns true once some submenu action actually commits (turn ends);
   * false if the player backs all the way out to the 3-button menu.
   */
  async _runLandBrowse(player, candidateIds) {
    for (;;) {
      const summaries = candidateIds.map((id) => this._browseTileSummary(this.tiles[id], player));
      const pickedId = await this.onPickBrowseTile(summaries);
      if (pickedId == null) return false;

      const tile = this.tiles[pickedId];
      for (;;) {
        const action = await this.onLandSubmenu(this._browseTileSummary(tile, player));
        if (action == null || action === 'back') break;

        if (action === 'info') {
          await this.onShowTileInfo(this._browseTileSummary(tile, player));
          continue;
        }
        if (action === 'swap' && (await this._humanSummonFlow(player, tile))) return true;
        if (action === 'levelup' && (await this._humanLevelUpFlowForTile(player, tile))) return true;
        if (action === 'element' && (await this._humanChangeElementFlowForTile(player, tile))) return true;
        if (action === 'move' && (await this._humanMoveFlow(player, tile))) return true;
        // cancelled sub-action - loop back to the submenu for this same tile
      }
    }
  }

  _browseTileSummary(tile, player) {
    return { ...this.getTileSummary(tile), isMine: tile.owner === player.id && tile.unit != null };
  }

  _affordableMonsterCards(player) {
    return player.hand.filter((c) => c.type === CardType.MONSTER && c.cost <= player.currency);
  }

  _ownedTiles(player) {
    return this.tiles.filter((t) => t.owner === player.id);
  }

  /**
   * 連鎖倍率: how many tiles of this element the owner holds (same-element
   * lands count as one 連鎖 today, since every element already forms a
   * single contiguous edge on this board). Unowned tiles preview at 連鎖1.
   * 無色 never chains, even with other 無色 tiles.
   */
  _chainMultiplier(ownerId, element) {
    if (ownerId == null || element === Element.NEUTRAL) return CHAIN_MULTIPLIER[1];
    const count = this.tiles.filter((t) => t.owner === ownerId && t.element === element).length;
    return CHAIN_MULTIPLIER[Math.min(Math.max(count, 1), LEVEL_CAP)];
  }

  /** 地価 = 基本地価 × レベル倍率 × 連鎖倍率 */
  _landValueOfTile(tile) {
    return Math.round(tile.price * tile.level * this._chainMultiplier(tile.owner, tile.element));
  }

  /** 通行料 = 地価 × 通行料倍率 */
  _tollOfTile(tile) {
    return Math.round(this._landValueOfTile(tile) * TOLL_RATE[tile.level]);
  }

  /**
   * Returns true if a summon/invade/swap actually went through (vs. being
   * cancelled). Doubles as the 土地-browse submenu's 入れ替え handler - the
   * only difference for a 'swap' actionType (tile already owned by this
   * player) is that the displaced unit's original card goes back to hand
   * instead of just vanishing.
   */
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
      if (actionType === 'swap' && tile.unit) {
        player.hand.push({
          ...tile.unit.def,
          id: `swap-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
      }
      this._placeUnit(tile, player, card);
      this.onLog(`${player.name}は${card.name}を${actionType === 'summon' ? '召喚' : '入れ替え'}した (-${card.cost}G)`);
    } else {
      await this._runInvasion(player, tile, card);
    }
    this._notifyState();
    return true;
  }

  /** Returns true if a level-up actually went through (vs. maxed out / cancelled / unaffordable). Operates on an already-picked tile (see _runLandBrowse). */
  async _humanLevelUpFlowForTile(player, tile) {
    if (tile.level >= LEVEL_CAP) {
      this.onLog('これ以上レベルアップできません');
      return false;
    }

    const cost = LEVEL_UP_COST[tile.level];
    const confirmed = await this.onConfirmAction({ actionType: 'levelup', cost, tile: this.getTileSummary(tile) });
    if (!confirmed) return false;
    if (player.currency < cost) {
      this.onLog('ゴールドが足りません');
      return false;
    }

    player.currency -= cost;
    tile.level += 1;
    this.onLog(`${player.name}は土地をLv${tile.level}にアップグレードした (-${cost}G)`);
    this._notifyState();
    return true;
  }

  /** Returns true if an element change actually went through (vs. cancelled / unaffordable). Operates on an already-picked tile (see _runLandBrowse). */
  async _humanChangeElementFlowForTile(player, tile) {
    const newElement = await this.onPickElement(CHANGEABLE_ELEMENTS.filter((e) => e !== tile.element));
    if (!newElement) return false;

    const rate = tile.element === Element.NEUTRAL ? NEUTRAL_ELEMENT_CHANGE_DISCOUNT : 1;
    const cost = Math.round(ELEMENT_CHANGE_COST_PER_LEVEL * tile.level * rate);
    const confirmed = await this.onConfirmAction({
      actionType: 'element',
      cost,
      tile: this.getTileSummary(tile),
      targetElement: newElement,
    });
    if (!confirmed) return false;
    if (player.currency < cost) {
      this.onLog('ゴールドが足りません');
      return false;
    }

    player.currency -= cost;
    tile.element = newElement;
    this.onLog(`${player.name}は土地属性を${ELEMENT_LABEL[newElement]}に変更した (-${cost}G)`);
    this._notifyState();
    return true;
  }

  /**
   * 土地コマンドの「移動」: relocates the tile's garrisoned monster to an
   * orthogonally-adjacent land that's either empty or enemy-owned. Empty
   * just relocates outright; enemy triggers a one-round invasion battle
   * reusing the SAME field-unit object (so equipped curses ride along).
   * Ownership only ever exists alongside a garrisoned unit - so whichever
   * tile(s) end up unit-less have owner cleared too, but level is never
   * touched (see the confirmed 土地レベルは所有権と無関係に保持される
   * design). Always ends the turn once the player actually commits to a
   * move, win or lose.
   */
  async _humanMoveFlow(player, tile) {
    const candidates = tile.neighbors
      .map((id) => this.tiles[id])
      .filter((t) => t.type === TileType.LAND && (t.owner == null || t.owner !== player.id));
    if (candidates.length === 0) {
      this.onLog('移動できる土地がありません');
      return false;
    }

    const options = candidates.map((t) => {
      const dgx = t.gridX - tile.gridX;
      const dgz = t.gridZ - tile.gridZ;
      const screenDir = dgx === 1 ? 'downright' : dgx === -1 ? 'upleft' : dgz === 1 ? 'downleft' : 'upright';
      return { tileId: t.id, screenDir };
    });
    const targetId = await this.onPickMoveDirection(options);
    if (targetId == null) return false;
    const targetTile = this.tiles.find((t) => t.id === targetId);

    const confirmed = await this.onConfirmMove(this.getTileSummary(targetTile));
    if (!confirmed) return false;

    const attackerUnit = tile.unit;
    const attackerName = attackerUnit.def.name;

    if (targetTile.owner == null) {
      targetTile.unit = attackerUnit;
      targetTile.owner = player.id;
      this._paintTile(targetTile, player.color);
      tile.unit = null;
      tile.owner = null;
      this._repaintTileToElement(tile);
      this.onLog(`${player.name}は${attackerName}を移動させた`);
    } else {
      const defenderPlayer = this.players.find((p) => p.id === targetTile.owner);
      const defenderUnit = targetTile.unit;
      const result = resolveBattle(attackerUnit, defenderUnit, this._goldAdapter());
      result.log.forEach((line) => this.onLog(line));

      if (result.attackerSurvived && !result.defenderSurvived) {
        targetTile.unit = attackerUnit;
        targetTile.owner = player.id;
        this._paintTile(targetTile, player.color);
        tile.unit = null;
        tile.owner = null;
        this._repaintTileToElement(tile);
        this.onLog(`${player.name}が土地を奪取した！`);
      } else if (result.attackerSurvived && result.defenderSurvived) {
        this.onLog(`${defenderPlayer.name}の${defenderUnit.def.name}が防衛に成功し、${attackerName}は元の土地に戻った`);
      } else {
        tile.unit = null;
        tile.owner = null;
        this._repaintTileToElement(tile);
        if (!result.defenderSurvived) {
          targetTile.unit = null;
          targetTile.owner = null;
          this._repaintTileToElement(targetTile);
          this.onLog('両者相打ちで両方の土地が無人になった');
        } else {
          this.onLog(`${attackerName}は倒された`);
        }
      }
    }
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
      landValue: this._landValueOfTile(tile),
      toll: this._tollOfTile(tile),
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

  /** Total assets' land component: sum of 地価 (see _landValueOfTile) across owned tiles. */
  _landValueOf(playerId) {
    return this.tiles
      .filter((t) => t.owner === playerId)
      .reduce((sum, t) => sum + this._landValueOfTile(t), 0);
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
