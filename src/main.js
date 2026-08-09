import './style.css';
import { GameScene } from './scene.js';
import { createBoard } from './board.js';
import { Game } from './game.js';
import { CardType, CARD_COLOR, ELEMENT_LABEL, Rarity, RARITY_COLOR, RARITY_SELL_PRICE, TYPE_ICON } from './cards.js';
import { STARTER_DECKS, buildStarterDeckList, buildThemedDeckList, ITEM_CATALOG } from './battleCards.js';
import { loginOrRegister, saveCharacter } from './auth.js';
import { getCardCatalog } from './cardCatalog.js';
import { PACKS, drawPack } from './shopPacks.js';
import { CARD_EFFECTS, saveCustomCard, validateCustomCard } from './customCards.js';
import { loadPlayerIcons } from './iconSheet.js';
import {
  BREED_BASE,
  BREED_PARTS,
  CHANGEABLE_BREED_ELEMENTS,
  computeBreedStats,
  canEquipPart,
  breedPartBadges,
  buildBreedCardDef,
} from './breedParts.js';
import { STORY_STAGES, isStageUnlocked, isStageCleared } from './story.js';
import { firebaseReady } from './firebase.js';
import { createPvpRoom, joinPvpRoom, listenToRoom, leavePvpRoom } from './pvp.js';
import { playBoardTheme, playBattleTheme, stopMusic, toggleMuted } from './audio.js';

const canvas = document.getElementById('game-canvas');
const turnIndicator = document.getElementById('turn-indicator');
const playerPanelEls = [
  document.getElementById('player-panel-0'),
  document.getElementById('player-panel-1'),
  document.getElementById('player-panel-2'),
  document.getElementById('player-panel-3'),
];
const logEl = document.getElementById('log');
const handPanel = document.getElementById('hand-panel');
const diceButton = document.getElementById('dice-button');
const directionArrowsOverlay = document.getElementById('direction-arrows-overlay');
const dirArrowUpleft = document.getElementById('dir-arrow-upleft');
const dirArrowUpright = document.getElementById('dir-arrow-upright');
const dirArrowDownleft = document.getElementById('dir-arrow-downleft');
const dirArrowDownright = document.getElementById('dir-arrow-downright');
const landCommandModal = document.getElementById('land-command-modal');
const landCommandTitle = document.getElementById('land-command-title');
const landCommandSummon = document.getElementById('land-command-summon');
const landCommandLand = document.getElementById('land-command-land');
const landCommandEnd = document.getElementById('land-command-end');
const landSubmenuModal = document.getElementById('land-submenu-modal');
const landSubmenuTitle = document.getElementById('land-submenu-title');
const landSubmenuSwap = document.getElementById('land-submenu-swap');
const landSubmenuLevelup = document.getElementById('land-submenu-levelup');
const landSubmenuElement = document.getElementById('land-submenu-element');
const landSubmenuMove = document.getElementById('land-submenu-move');
const landSubmenuSell = document.getElementById('land-submenu-sell');
const landSubmenuInfo = document.getElementById('land-submenu-info');
const landSubmenuBack = document.getElementById('land-submenu-back');
const monsterPickerModal = document.getElementById('monster-picker-modal');
const monsterPickerChoices = document.getElementById('monster-picker-choices');
const monsterPickerCancel = document.getElementById('monster-picker-cancel');
const shopTileModal = document.getElementById('shop-tile-modal');
const shopTileChoices = document.getElementById('shop-tile-choices');
const shopTileCancel = document.getElementById('shop-tile-cancel');
const elementPickerModal = document.getElementById('element-picker-modal');
const elementPickerChoices = document.getElementById('element-picker-choices');
const elementPickerCancel = document.getElementById('element-picker-cancel');
const confirmModal = document.getElementById('confirm-modal');
const confirmText = document.getElementById('confirm-text');
const confirmYes = document.getElementById('confirm-yes');
const confirmNo = document.getElementById('confirm-no');
const cameraWorkOverlay = document.getElementById('camera-work-overlay');
const camArrowUp = document.getElementById('cam-arrow-up');
const camArrowDown = document.getElementById('cam-arrow-down');
const camArrowLeft = document.getElementById('cam-arrow-left');
const camArrowRight = document.getElementById('cam-arrow-right');
const camWorkBack = document.getElementById('cam-work-back');
const tileInfoModal = document.getElementById('tile-info-modal');
const tileInfoText = document.getElementById('tile-info-text');
const tileInfoClose = document.getElementById('tile-info-close');
const cardRevealModal = document.getElementById('card-reveal-modal');
const cardRevealCard = document.getElementById('card-reveal-card');
const discardModal = document.getElementById('discard-modal');
const discardHint = document.getElementById('discard-hint');
const discardChoices = document.getElementById('discard-choices');
const cardDetailModal = document.getElementById('card-detail-modal');
const cardDetailCard = document.getElementById('card-detail-card');
const cardDetailText = document.getElementById('card-detail-text');
const cardDetailClose = document.getElementById('card-detail-close');
const cardDetailUse = document.getElementById('card-detail-use');
const centerPanel = document.getElementById('center-panel');
const centerHandEl = document.getElementById('center-hand');
const spellEffectModal = document.getElementById('spell-effect-modal');
const spellEffectText = document.getElementById('spell-effect-text');
const battleSceneModal = document.getElementById('battle-scene-modal');
const battleFade = document.getElementById('battle-fade');
const battleStage = document.getElementById('battle-stage');
const battleSide = {
  attacker: {
    owner: document.getElementById('battle-attacker-owner'),
    hp: document.getElementById('battle-attacker-hp'),
    hpBonus: document.getElementById('battle-attacker-hp-bonus'),
    atk: document.getElementById('battle-attacker-atk'),
    atkBonus: document.getElementById('battle-attacker-atk-bonus'),
    card: document.getElementById('battle-attacker-card'),
    item: document.getElementById('battle-attacker-item'),
    matchup: document.getElementById('battle-attacker-matchup'),
    el: document.getElementById('battle-side-attacker'),
  },
  defender: {
    owner: document.getElementById('battle-defender-owner'),
    hp: document.getElementById('battle-defender-hp'),
    hpBonus: document.getElementById('battle-defender-hp-bonus'),
    atk: document.getElementById('battle-defender-atk'),
    atkBonus: document.getElementById('battle-defender-atk-bonus'),
    card: document.getElementById('battle-defender-card'),
    item: document.getElementById('battle-defender-item'),
    matchup: document.getElementById('battle-defender-matchup'),
    el: document.getElementById('battle-side-defender'),
  },
};
const battleItemPickerBox = document.getElementById('battle-item-picker-box');
const battleItemPickerTitle = document.getElementById('battle-item-picker-title');
const battleItemPickerChoices = document.getElementById('battle-item-picker-choices');
const battleItemPickerSkip = document.getElementById('battle-item-picker-skip');
const battleMessageText = document.getElementById('battle-message-text');

const BLINK_MS = 600;

const TILE_TYPE_LABEL = { start: 'ゴール', land: '土地', event: 'チェックポイント', shop: 'ショップ' };

function tileSummaryText(tile) {
  const lines = [`【${TILE_TYPE_LABEL[tile.type]}】`];
  if (tile.type === 'land') {
    lines.push(`属性: ${ELEMENT_LABEL[tile.element]} / Lv${tile.level}`);
    lines.push(tile.ownerName ? `所有者: ${tile.ownerName}` : '所有者: なし');
    if (tile.unitName) lines.push(`配置モンスター: ${tile.unitName} (ATK${tile.unitAtk}/HP${tile.unitHp})`);
    lines.push(`地価: ${tile.landValue}G / 通行料: ${tile.toll}G`);
  }
  return lines.join('\n');
}

const BRANCH_ARROW_BY_DIR = {
  upleft: dirArrowUpleft,
  upright: dirArrowUpright,
  downleft: dirArrowDownleft,
  downright: dirArrowDownright,
};

/**
 * Shared diagonal-arrow + camera-work-pan chooser. Up to 4 arrows appear,
 * one per option, in whichever screen direction that option actually sits
 * (world +X/-X/+Z/-Z reads as screen ↘/↖/↙/↗ respectively under this
 * board's fixed diagonal camera - see Game._chooseNextTile /
 * Game._humanMoveFlow, both of which compute `screenDir` this same way).
 * `noBack` hides the camera-work "戻る" button (via the .no-back CSS class)
 * for choices that are mandatory rather than cancellable.
 */
function promptDirectionArrows(options, { noBack = false } = {}) {
  return new Promise((resolve) => {
    const savedFocus = { x: scene.focus.x, z: scene.focus.z };
    if (noBack) cameraWorkOverlay.classList.add('no-back');
    cameraWorkOverlay.classList.remove('hidden');
    directionArrowsOverlay.classList.remove('hidden');

    const listeners = [];
    function onPanUp() {
      scene.panByDirection('up');
    }
    function onPanDown() {
      scene.panByDirection('down');
    }
    function onPanLeft() {
      scene.panByDirection('left');
    }
    function onPanRight() {
      scene.panByDirection('right');
    }
    function onBack() {
      cleanup(null);
    }
    function cleanup(tileId) {
      cameraWorkOverlay.classList.add('hidden');
      cameraWorkOverlay.classList.remove('no-back');
      directionArrowsOverlay.classList.add('hidden');
      Object.values(BRANCH_ARROW_BY_DIR).forEach((el) => el.classList.add('hidden'));
      listeners.forEach(([el, fn]) => el.removeEventListener('click', fn));
      camArrowUp.removeEventListener('click', onPanUp);
      camArrowDown.removeEventListener('click', onPanDown);
      camArrowLeft.removeEventListener('click', onPanLeft);
      camArrowRight.removeEventListener('click', onPanRight);
      camWorkBack.removeEventListener('click', onBack);
      scene.setFocusImmediate(savedFocus.x, savedFocus.z);
      resolve(tileId);
    }

    for (const option of options) {
      const arrow = BRANCH_ARROW_BY_DIR[option.screenDir];
      arrow.classList.remove('hidden');
      const onClick = () => cleanup(option.tileId);
      listeners.push([arrow, onClick]);
      arrow.addEventListener('click', onClick);
    }
    camArrowUp.addEventListener('click', onPanUp);
    camArrowDown.addEventListener('click', onPanDown);
    camArrowLeft.addEventListener('click', onPanLeft);
    camArrowRight.addEventListener('click', onPanRight);
    camWorkBack.addEventListener('click', onBack);
  });
}

/**
 * Every time movement reaches a tile with more than one way forward (the
 * board's 4 edge-midpoints and its center - see board.js), not just once at
 * game start. One tap picks - no arm/confirm step, since this now fires
 * often rather than being a single big one-time decision. The choice is
 * mandatory (no camera-work "戻る").
 */
function promptChooseBranch(options) {
  return promptDirectionArrows(options, { noBack: true });
}

/** 土地コマンドの「移動」: same diagonal-arrow chooser, but cancellable (the player already has a monster placed - trying doesn't have to commit). */
function promptMoveDirection(options) {
  return promptDirectionArrows(options);
}

/** 3-button top menu: 召喚（敵地なら侵略）/ 土地 / 終了. */
function promptLandCommand(tile, { canSummon }) {
  return new Promise((resolve) => {
    landCommandTitle.textContent = tileSummaryText(tile);
    landCommandSummon.disabled = !canSummon;
    landCommandModal.classList.remove('hidden');

    function cleanup(result) {
      landCommandModal.classList.add('hidden');
      landCommandSummon.removeEventListener('click', onSummon);
      landCommandLand.removeEventListener('click', onLand);
      landCommandEnd.removeEventListener('click', onEnd);
      resolve(result);
    }
    function onSummon() {
      cleanup('summon');
    }
    function onLand() {
      cleanup('land');
    }
    function onEnd() {
      cleanup('end');
    }
    landCommandSummon.addEventListener('click', onSummon);
    landCommandLand.addEventListener('click', onLand);
    landCommandEnd.addEventListener('click', onEnd);
  });
}

/**
 * The 土地-browse tile's vertical submenu (own tile with a garrisoned
 * monster only - see Game._runLandBrowse, which never opens this for a
 * tile that isn't the player's own): 入れ替え/土地Lvアップ/属性変更/移動/
 * 情報/もどる. Resolves the chosen action string, or 'back'/null.
 */
function promptLandSubmenu(tile) {
  return new Promise((resolve) => {
    landSubmenuTitle.textContent = tileSummaryText(tile);
    landSubmenuModal.classList.remove('hidden');

    function cleanup(result) {
      landSubmenuModal.classList.add('hidden');
      landSubmenuSwap.removeEventListener('click', onSwap);
      landSubmenuLevelup.removeEventListener('click', onLevelup);
      landSubmenuElement.removeEventListener('click', onElement);
      landSubmenuMove.removeEventListener('click', onMove);
      landSubmenuSell.removeEventListener('click', onSell);
      landSubmenuInfo.removeEventListener('click', onInfo);
      landSubmenuBack.removeEventListener('click', onBack);
      resolve(result);
    }
    function onSwap() {
      cleanup('swap');
    }
    function onLevelup() {
      cleanup('levelup');
    }
    function onElement() {
      cleanup('element');
    }
    function onMove() {
      cleanup('move');
    }
    function onSell() {
      cleanup('sell');
    }
    function onInfo() {
      cleanup('info');
    }
    function onBack() {
      cleanup('back');
    }
    landSubmenuSwap.addEventListener('click', onSwap);
    landSubmenuLevelup.addEventListener('click', onLevelup);
    landSubmenuElement.addEventListener('click', onElement);
    landSubmenuMove.addEventListener('click', onMove);
    landSubmenuSell.addEventListener('click', onSell);
    landSubmenuInfo.addEventListener('click', onInfo);
    landSubmenuBack.addEventListener('click', onBack);
  });
}

/** "移動しますか？" はい/いいえ, reusing the generic confirm modal. */
function promptConfirmMove() {
  return confirmYesNo('移動しますか？');
}

/** "この土地を売りますか？ 売却額+◯◯G" はい/いいえ - unlike every other confirm here this is a GAIN, not a cost, so it gets its own wording rather than reusing promptConfirmAction's "コスト" framing. */
function promptConfirmSellLand({ salePrice }) {
  return confirmYesNo(`この土地を売りますか？ 売却額+${salePrice}G`);
}

/** Shows the hand's monster cards; clicking one blinks it twice before resolving. */
function promptPickMonsterCard(options) {
  return new Promise((resolve) => {
    monsterPickerChoices.replaceChildren();
    for (const card of options) {
      const el = document.createElement('div');
      el.className = 'card';
      renderCardEl(el, card);
      el.addEventListener('click', () => {
        el.classList.add('blinking');
        setTimeout(() => {
          monsterPickerModal.classList.add('hidden');
          resolve(card);
        }, BLINK_MS);
      });
      monsterPickerChoices.appendChild(el);
    }
    monsterPickerModal.classList.remove('hidden');

    function onCancel() {
      monsterPickerModal.classList.add('hidden');
      monsterPickerCancel.removeEventListener('click', onCancel);
      resolve(null);
    }
    monsterPickerCancel.addEventListener('click', onCancel);
  });
}

/**
 * ショップマス: 3 random cards, paid for with in-battle G, land straight in
 * hand for this match only (see Game._resolveShopTile - never touches
 * character.ownedCards, the permanent collection). Picking one blinks it,
 * then confirms the cost like every other spend in this game; declining
 * the confirm returns to the 3-card picker rather than closing outright.
 */
function promptShopPurchase(options) {
  return new Promise((resolve) => {
    function cleanup(result) {
      shopTileModal.classList.add('hidden');
      shopTileCancel.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onCancel() {
      cleanup(null);
    }

    shopTileChoices.replaceChildren();
    for (const card of options) {
      const el = document.createElement('div');
      el.className = 'card';
      renderCardEl(el, card);
      el.addEventListener('click', () => {
        el.classList.add('blinking');
        setTimeout(async () => {
          el.classList.remove('blinking');
          const confirmed = await confirmYesNo(`「${card.name}」を購入しますか？ コスト${card.cost}G`);
          if (confirmed) cleanup(card);
          // declined: stay on the picker, nothing to reset
        }, BLINK_MS);
      });
      shopTileChoices.appendChild(el);
    }
    shopTileModal.classList.remove('hidden');
    shopTileCancel.addEventListener('click', onCancel);
  });
}

const ACTION_LABEL = { summon: '召喚', invade: '侵略', swap: '入れ替え', levelup: 'レベルアップ', element: '属性変更' };

function promptConfirmAction({ actionType, card, cost, tile, targetElement }) {
  return new Promise((resolve) => {
    let text;
    if (actionType === 'element') {
      text = `属性を${ELEMENT_LABEL[targetElement]}に変更しますか？ コスト${cost}G`;
    } else {
      const subject = card ? `「${card.name}」で` : '';
      const extra = actionType === 'levelup' && tile ? `（Lv${tile.level}→Lv${tile.level + 1}）` : '';
      text = `${subject}${ACTION_LABEL[actionType]}${extra}しますか？ コスト${cost}G`;
    }
    confirmText.textContent = text;
    confirmModal.classList.remove('hidden');

    function cleanup(result) {
      confirmModal.classList.add('hidden');
      confirmYes.removeEventListener('click', onYes);
      confirmNo.removeEventListener('click', onNo);
      resolve(result);
    }
    function onYes() {
      cleanup(true);
    }
    function onNo() {
      cleanup(false);
    }
    confirmYes.addEventListener('click', onYes);
    confirmNo.addEventListener('click', onNo);
  });
}

/** Picks a target element from the given options (colored swatches); resolves the element, or null if cancelled. */
function promptPickElement(options) {
  return new Promise((resolve) => {
    elementPickerChoices.replaceChildren();
    for (const element of options) {
      const el = document.createElement('div');
      el.className = 'card';
      el.style.background = CARD_COLOR[element];
      el.textContent = ELEMENT_LABEL[element];
      el.addEventListener('click', () => {
        elementPickerModal.classList.add('hidden');
        resolve(element);
      });
      elementPickerChoices.appendChild(el);
    }
    elementPickerModal.classList.remove('hidden');

    function onCancel() {
      elementPickerModal.classList.add('hidden');
      elementPickerCancel.removeEventListener('click', onCancel);
      resolve(null);
    }
    elementPickerCancel.addEventListener('click', onCancel);
  });
}

/** Simple info-only popup, no camera-work of its own - "閉じる" just resolves. */
function promptShowTileInfo(tile) {
  return new Promise((resolve) => {
    tileInfoText.textContent = tileSummaryText(tile);
    tileInfoModal.classList.remove('hidden');

    function onClose() {
      tileInfoModal.classList.add('hidden');
      tileInfoClose.removeEventListener('click', onClose);
      resolve();
    }
    tileInfoClose.addEventListener('click', onClose);
  });
}

const BROWSE_HIGHLIGHT_COLOR = 0xfff2a8;

/** Slow blink/faint-glow on the given tiles' meshes (via emissive), until the returned stop function is called. */
function startTileHighlight(tileIds) {
  const meshes = tileIds.map((id) => tiles[id]?.mesh).filter(Boolean);
  const start = performance.now();
  let raf;
  function frame(now) {
    const t = (now - start) / 1000;
    const intensity = 0.35 + 0.25 * Math.sin(t * 2.4);
    for (const mesh of meshes) {
      mesh.material.emissive.setHex(BROWSE_HIGHLIGHT_COLOR);
      mesh.material.emissiveIntensity = intensity;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    for (const mesh of meshes) {
      mesh.material.emissive.setHex(0x000000);
      mesh.material.emissiveIntensity = 0;
    }
  };
}

/**
 * 土地コマンドの「土地」: camera-work over just the given candidate tiles
 * (this turn's traversed path, or every owned tile if landed exactly on
 * START/EVENT - see Game._runLandCommand), which slowly blink/glow.
 * Tapping a candidate that's the player's own garrisoned land resolves
 * with its id, closing this camera-work session so Game._runLandBrowse can
 * open the vertical submenu over it. Tapping anything else just shows its
 * info inline, without closing camera-work, and keeps waiting for another
 * tap. Backing out via 戻る resolves null.
 */
function promptPickBrowseTile(candidates) {
  return new Promise((resolve) => {
    const savedFocus = { x: scene.focus.x, z: scene.focus.z };
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const stopHighlight = startTileHighlight(candidates.map((c) => c.id));
    cameraWorkOverlay.classList.remove('hidden');

    function onCanvasClick(e) {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const tile = scene.pickTileAt(ndcX, ndcY, tiles);
      const candidate = tile && byId.get(tile.id);
      if (!candidate) return;
      if (candidate.isMine) {
        finish(candidate.id);
      } else {
        tileInfoText.textContent = tileSummaryText(candidate);
        tileInfoModal.classList.remove('hidden');
      }
    }
    function onInfoClose() {
      tileInfoModal.classList.add('hidden');
    }
    function onUp() {
      scene.panByDirection('up');
    }
    function onDown() {
      scene.panByDirection('down');
    }
    function onLeft() {
      scene.panByDirection('left');
    }
    function onRight() {
      scene.panByDirection('right');
    }
    function onWorkBack() {
      finish(null);
    }
    function finish(result) {
      stopHighlight();
      cameraWorkOverlay.classList.add('hidden');
      tileInfoModal.classList.add('hidden');
      canvas.removeEventListener('click', onCanvasClick);
      camArrowUp.removeEventListener('click', onUp);
      camArrowDown.removeEventListener('click', onDown);
      camArrowLeft.removeEventListener('click', onLeft);
      camArrowRight.removeEventListener('click', onRight);
      camWorkBack.removeEventListener('click', onWorkBack);
      tileInfoClose.removeEventListener('click', onInfoClose);
      scene.setFocusImmediate(savedFocus.x, savedFocus.z);
      resolve(result);
    }

    canvas.addEventListener('click', onCanvasClick);
    camArrowUp.addEventListener('click', onUp);
    camArrowDown.addEventListener('click', onDown);
    camArrowLeft.addEventListener('click', onLeft);
    camArrowRight.addEventListener('click', onRight);
    camWorkBack.addEventListener('click', onWorkBack);
    tileInfoClose.addEventListener('click', onInfoClose);
  });
}

function cardColor(card) {
  return card.type === CardType.MONSTER ? CARD_COLOR[card.element] : CARD_COLOR[card.type];
}

function hexColor(colorInt) {
  return `#${colorInt.toString(16).padStart(6, '0')}`;
}

/**
 * Maps players to the 4 HUD corner slots [TL, TR, BL, BR].
 * No alliances: turn order fills TL, TR, then wraps to BL (under TL) and
 * BR (under TR). With alliances: the team containing the first-turn player
 * takes the left column (leader TL, teammates stacked under at BL), the
 * next team takes the right column the same way - turn order within a
 * team doesn't matter for placement.
 */
function computePlayerSlots(players) {
  const hasAlliances = players.some((p) => p.allianceId != null);
  if (!hasAlliances) {
    return [players[0], players[1], players[2], players[3]];
  }

  const teams = [];
  const teamIndexByKey = new Map();
  for (const p of players) {
    const key = p.allianceId ?? `solo-${p.id}`;
    if (!teamIndexByKey.has(key)) {
      teamIndexByKey.set(key, teams.length);
      teams.push([]);
    }
    teams[teamIndexByKey.get(key)].push(p);
  }

  const [left = [], right = []] = teams;
  return [left[0], right[0], left[1], right[1]];
}

function renderPlayerPanels(players) {
  const slots = computePlayerSlots(players);
  slots.forEach((player, i) => {
    const el = playerPanelEls[i];
    el.classList.toggle('hidden', !player);
    if (!player) return;

    el.style.setProperty('--player-color', hexColor(player.color));
    el.classList.toggle('player-defeated', !!player.defeated);
    el.replaceChildren();

    const icon = document.createElement('div');
    icon.className = 'player-icon';

    const lines = document.createElement('div');
    lines.className = 'player-info-lines';
    lines.innerHTML = `
      <div class="player-name">${player.name}${player.defeated ? '（脱落）' : ''}</div>
      <div class="player-stat">所持 ${player.currency}G / 総資産 ${player.totalAssets}G</div>
    `;

    el.append(icon, lines);
  });
}

/** Rarity badge (top-left) + type icon (top-right) + name, over the element/type background color. */
function renderCardEl(el, card) {
  el.style.background = card.imageDataUrl
    ? `linear-gradient(rgba(0,0,0,.12), rgba(0,0,0,.72)), url("${card.imageDataUrl}") center / cover`
    : cardColor(card);
  el.replaceChildren();

  const rarity = document.createElement('span');
  rarity.className = 'card-rarity';
  rarity.textContent = card.rarity || Rarity.N;
  rarity.style.background = RARITY_COLOR[card.rarity] || RARITY_COLOR[Rarity.N];

  const typeIcon = document.createElement('span');
  typeIcon.className = 'card-type-icon';
  typeIcon.textContent = TYPE_ICON[card.type] || '';

  const name = document.createElement('span');
  name.className = 'card-name-text';
  name.textContent = card.name;

  el.append(rarity, typeIcon, name);
}

const TYPE_LABEL = {
  [CardType.MONSTER]: 'モンスター',
  [CardType.GEAR]: '武器防具',
  [CardType.SPELL]: 'スペル',
};

function describeCard(card) {
  return card.type === CardType.MONSTER
    ? `モンスター（${ELEMENT_LABEL[card.element]}属性）`
    : TYPE_LABEL[card.type];
}

/** Richer, multi-line version for the card detail popup (image + description) - stats, not just the type/element blurb. */
function describeCardDetail(card) {
  const rarityText = `レア度: ${card.rarity || Rarity.N}`;
  const lines = [`${TYPE_LABEL[card.type]} / ${rarityText}`];
  if (card.type === CardType.MONSTER) {
    lines.push(`属性: ${card.element ? ELEMENT_LABEL[card.element] : '無属性'}`);
    lines.push(`ATK ${card.atk} / HP ${card.hp} / コスト ${card.cost}`);
  } else if (card.type === CardType.GEAR) {
    lines.push(`ATK+${card.atkBonus} / HP+${card.hpBonus} / コスト ${card.cost}`);
  } else if (card.type === CardType.SPELL) {
    if (card.addedAtk != null) lines.push(`ATK+${card.addedAtk} / HP+${card.addedHp}（永続）`);
  }
  const effectLabels = (card.traits || []).map((id) => CARD_EFFECTS.find((effect) => effect.id === id)?.label || id);
  if (effectLabels.length) lines.push(`特殊効果: ${effectLabels.join('・')}`);
  if (card.effectDescription) lines.push(card.effectDescription);
  return lines.join('\n');
}

let cardDetailUseHandler = null;

function showCardDetail(card, onUse) {
  renderCardEl(cardDetailCard, card);
  cardDetailText.textContent = describeCardDetail(card);
  cardDetailUseHandler = onUse ?? null;
  cardDetailUse.classList.toggle('hidden', !onUse);
  cardDetailModal.classList.remove('hidden');
}

cardDetailClose.addEventListener('click', () => {
  cardDetailModal.classList.add('hidden');
});

cardDetailUse.addEventListener('click', () => {
  cardDetailModal.classList.add('hidden');
  cardDetailUseHandler?.();
});

function renderHand(hand) {
  handPanel.replaceChildren();
  for (const card of hand) {
    const el = document.createElement('div');
    el.className = 'card';
    el.style.pointerEvents = 'auto';
    renderCardEl(el, card);
    el.addEventListener('click', () => showCardDetail(card));
    handPanel.appendChild(el);
  }
}

/** Center hand: whoever's turn it is, shown face-up. Only the human's own cards are interactive. */
function renderCenterHand(hand, isCPU, spellUsable) {
  centerHandEl.replaceChildren();
  for (const card of hand) {
    const el = document.createElement('div');
    el.className = 'card';
    renderCardEl(el, card);

    if (isCPU) {
      el.style.cursor = 'default';
    } else {
      const isSpell = card.type === CardType.SPELL;
      const canUseThis = isSpell && spellUsable;
      el.addEventListener('click', () => {
        showCardDetail(card, canUseThis ? () => {
          el.classList.add('blinking');
          setTimeout(() => game.useSpell(card), BLINK_MS);
        } : null);
      });
    }

    centerHandEl.appendChild(el);
  }
}

// Matches the CSS transition durations on #card-reveal-card.
const REVEAL_GROW_MS = 400;
const REVEAL_HOLD_MS = 2000;
const REVEAL_SHRINK_MS = 400;

/** Auto-advancing draw reveal: grows in from the center, holds, shrinks away. */
function promptCardReveal(card) {
  return new Promise((resolve) => {
    renderCardEl(cardRevealCard, card);
    cardRevealCard.classList.remove('show');
    cardRevealModal.classList.remove('hidden');

    // Force a reflow so the grow-in transition restarts cleanly even if a
    // reveal was still mid-animation from a moment ago.
    void cardRevealCard.offsetWidth;
    requestAnimationFrame(() => cardRevealCard.classList.add('show'));

    setTimeout(() => {
      cardRevealCard.classList.remove('show');
      setTimeout(() => {
        cardRevealModal.classList.add('hidden');
        resolve();
      }, REVEAL_SHRINK_MS);
    }, REVEAL_GROW_MS + REVEAL_HOLD_MS);
  });
}

const SPELL_EFFECT_MS = 1200;

/** Placeholder for spell resolution - actual effects land with battle design in phase 2. */
function promptSpellUse(card) {
  return new Promise((resolve) => {
    spellEffectText.textContent = `『${card.name}』発動！`;
    spellEffectModal.classList.remove('hidden');
    setTimeout(() => {
      spellEffectModal.classList.add('hidden');
      resolve();
    }, SPELL_EFFECT_MS);
  });
}

const MATCHUP_LABEL = {
  advantage: '有利！攻撃1.2倍',
  disadvantage: '不利…被ダメージ1.2倍',
};

const BATTLE_FADE_MS = 450;
const BATTLE_STAGE_REVEAL_MS = 450;
const BATTLE_MESSAGE_HOLD_MS = 1500;
const BATTLE_RETREAT_MS = 600;
const BATTLE_FADE_OUT_MS = 450;

/** Resets one side's panel/card/item-overlay/matchup-label to a fresh state and fills in this battle's base stats + bonuses. */
function renderBattleStat(sideEls, data) {
  sideEls.owner.textContent = data.ownerName;
  sideEls.hp.textContent = data.hp;
  sideEls.atk.textContent = data.atk;
  sideEls.hpBonus.classList.toggle('hidden', !(data.elementHp > 0));
  if (data.elementHp > 0) sideEls.hpBonus.textContent = `+${data.elementHp}`;
  sideEls.atkBonus.classList.toggle('hidden', !(data.cheerAtk > 0));
  if (data.cheerAtk > 0) sideEls.atkBonus.textContent = `+${data.cheerAtk}`;
  renderCardEl(sideEls.card, data.card);
  sideEls.card.classList.remove('battle-crumble');
  sideEls.item.classList.add('hidden');
  sideEls.item.replaceChildren();
  const matchupText = MATCHUP_LABEL[data.matchup];
  sideEls.matchup.classList.toggle('hidden', !matchupText);
  sideEls.matchup.classList.remove('advantage', 'disadvantage');
  if (matchupText) {
    sideEls.matchup.textContent = matchupText;
    sideEls.matchup.classList.add(data.matchup);
  }
  sideEls.el.classList.remove('battle-attacking', 'battle-hit', 'battle-retreat');
}

/**
 * バトルフェーズ開始: 暗転してから攻撃側(左)・防御側(右)のカードと基礎
 * ステータス（応援/同属性ボーナスは基礎数値の横に＋◯◯で表示、有利/不利
 * 属性はカード下部に表示）を見せる。アイテムはまだこの時点では一切表示
 * しない（選択・使用時に初めて出る）。
 */
function promptBattleSceneEnter({ attacker, defender }) {
  return new Promise((resolve) => {
    playBattleTheme();
    battleSceneModal.classList.remove('hidden');
    battleStage.classList.remove('show');
    battleMessageText.classList.add('hidden');
    battleFade.classList.remove('show');
    renderBattleStat(battleSide.attacker, attacker);
    renderBattleStat(battleSide.defender, defender);

    // Force a reflow so the fade-in transition restarts cleanly even if a
    // battle scene was still mid-animation from a moment ago.
    void battleFade.offsetWidth;
    battleFade.classList.add('show');
    setTimeout(() => {
      battleStage.classList.add('show');
      setTimeout(resolve, BATTLE_STAGE_REVEAL_MS);
    }, BATTLE_FADE_MS);
  });
}

/**
 * Gear-only hand for this one side; tapping blinks then resolves that
 * card, "使わない" resolves null. Only ever one picker mounted at a time -
 * the other side's choice (already made, or not yet made) is never shown
 * here, which is what keeps each side's pick hidden from the other.
 */
function promptPickBattleItem({ hand, side, ownerName, unitName }) {
  return new Promise((resolve) => {
    battleItemPickerTitle.textContent =
      hand.length > 0 ? `${ownerName}の${unitName}: 使うアイテムを選んでください` : `${ownerName}の${unitName}: アイテムがありません`;
    battleItemPickerChoices.replaceChildren();
    for (const card of hand) {
      const el = document.createElement('div');
      el.className = 'card';
      renderCardEl(el, card);
      el.addEventListener('click', () => {
        el.classList.add('blinking');
        setTimeout(() => cleanup(card), BLINK_MS);
      });
      battleItemPickerChoices.appendChild(el);
    }
    battleItemPickerBox.classList.remove('hidden');

    function cleanup(result) {
      battleItemPickerBox.classList.add('hidden');
      battleItemPickerSkip.removeEventListener('click', onSkip);
      resolve(result);
    }
    function onSkip() {
      cleanup(null);
    }
    battleItemPickerSkip.addEventListener('click', onSkip);
  });
}

/**
 * One side's strike: its item (if used) appears at 1/4 size over its own
 * card's top-left corner, the target's card flashes/shakes, the damage
 * calculation message shows for 1.5s, and the target's displayed HP
 * updates to match. If the target died, its card crumbles from the bottom
 * during that same hold.
 */
function promptBattleAttack({ side, item, message, targetHp, targetDied }) {
  return new Promise((resolve) => {
    const attackerEls = battleSide[side];
    const targetEls = battleSide[side === 'attacker' ? 'defender' : 'attacker'];

    if (item) {
      const el = document.createElement('div');
      el.className = 'card';
      renderCardEl(el, item);
      attackerEls.item.replaceChildren(el);
      attackerEls.item.classList.remove('hidden');
    }

    attackerEls.el.classList.add('battle-attacking');
    targetEls.el.classList.add('battle-hit');
    targetEls.hp.textContent = Math.max(targetHp, 0);
    battleMessageText.textContent = message;
    battleMessageText.classList.remove('hidden');
    if (targetDied) targetEls.card.classList.add('battle-crumble');

    setTimeout(() => {
      attackerEls.el.classList.remove('battle-attacking');
      targetEls.el.classList.remove('battle-hit');
      battleMessageText.classList.add('hidden');
      resolve();
    }, BATTLE_MESSAGE_HOLD_MS);
  });
}

/** 引き分け（両者生存）専用の演出: 決着メッセージの前に、両陣営のカードをそれぞれ自分の側の画面外へ退避させる。 */
function promptBattleRetreat() {
  return new Promise((resolve) => {
    battleSide.attacker.el.classList.add('battle-retreat');
    battleSide.defender.el.classList.add('battle-retreat');
    setTimeout(resolve, BATTLE_RETREAT_MS);
  });
}

/** "〇〇の□□は土地を奪った/守った" - holds 1.5秒, then fades the whole battle scene back out to the board. */
function promptBattleOutcome({ won, ownerName, unitName }) {
  return new Promise((resolve) => {
    battleMessageText.textContent = `${ownerName}の${unitName}は${won ? '土地を奪った' : '土地を守った'}`;
    battleMessageText.classList.remove('hidden');
    setTimeout(() => {
      battleStage.classList.remove('show');
      battleFade.classList.remove('show');
      setTimeout(() => {
        battleMessageText.classList.add('hidden');
        battleSceneModal.classList.add('hidden');
        playBoardTheme();
        resolve();
      }, BATTLE_FADE_OUT_MS);
    }, BATTLE_MESSAGE_HOLD_MS);
  });
}

/** "「card.name」を捨てますか？" yes/no, reusing the same confirm modal as land-command actions. */
/** Generic はい/いいえ confirm, reusing the same confirm-modal DOM as land-command actions (never active at the same time as those). */
function confirmYesNo(text) {
  return new Promise((resolve) => {
    confirmText.textContent = text;
    confirmModal.classList.remove('hidden');

    function cleanup(result) {
      confirmModal.classList.add('hidden');
      confirmYes.removeEventListener('click', onYes);
      confirmNo.removeEventListener('click', onNo);
      resolve(result);
    }
    function onYes() {
      cleanup(true);
    }
    function onNo() {
      cleanup(false);
    }
    confirmYes.addEventListener('click', onYes);
    confirmNo.addEventListener('click', onNo);
  });
}

function confirmDiscard(card) {
  return confirmYesNo(`「${card.name}」を捨てますか？`);
}

/** Tapping a card blinks it, then asks "捨てますか？" - yes discards, no returns to the discard picker. */
function promptDiscardChoice(hand) {
  return new Promise((resolve) => {
    discardHint.textContent = '手札が7枚になりました。捨てるカードを選んでください';
    discardChoices.replaceChildren();

    for (const card of hand) {
      const el = document.createElement('div');
      el.className = 'card';
      renderCardEl(el, card);
      el.addEventListener('click', () => {
        el.classList.add('blinking');
        setTimeout(async () => {
          el.classList.remove('blinking');
          const confirmed = await confirmDiscard(card);
          if (confirmed) {
            discardModal.classList.add('hidden');
            resolve(card);
          }
        }, BLINK_MS);
      });
      discardChoices.appendChild(el);
    }
    discardModal.classList.remove('hidden');
  });
}

const DICE_FACES = {
  1: ['c'],
  2: ['tl', 'br'],
  3: ['tl', 'c', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'c', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};
const dicePips = diceButton.querySelectorAll('.pip');

function setDiceFace(value) {
  const active = new Set(DICE_FACES[value]);
  dicePips.forEach((pip) => {
    pip.style.opacity = active.has(pip.dataset.pos) ? '1' : '0';
  });
}

const DICE_SPIN_INTERVAL_MS = 90;
// Time from the stop trigger (2nd click, or CPU's auto-stop) until the face
// actually locks - the dice keeps spinning through this window, so it's a
// timing/skill stop rather than an instant one.
const DICE_STOP_DELAY_MS = 300;
// How long the locked face sits on screen (hand and dice both unchanged)
// before the move actually starts.
const DICE_RESULT_HOLD_MS = 1500;

// idle -> (click) -> spinning -> (click) -> locking -> settles + holds, then rollDice() fires
let diceState = 'idle';
let diceValue = 1;
let diceSpinTimer = null;

// The hand hides the moment the roll starts (game's showCenter goes false),
// but the dice itself stays up through the whole move animation and only
// clears once the piece actually reaches its tile.
let showCenterState = false;
let diceMoving = false;

function syncCenterVisibility() {
  centerPanel.classList.toggle('hidden', !(showCenterState || diceMoving));
  // visibility (not display) so the hand keeps reserving its layout space -
  // hiding it must never shift the dice button's position.
  centerHandEl.style.visibility = showCenterState ? '' : 'hidden';
  // The faded look means "riding along with the move", not "not your turn"
  // - CPU's dice looks perfectly normal through its own spin/hold, same as
  // the player's, and only dims once the piece is actually moving.
  diceButton.classList.toggle('moving', diceMoving);
}

function resetDice() {
  clearInterval(diceSpinTimer);
  diceSpinTimer = null;
  diceState = 'idle';
  diceValue = 1;
  diceMoving = false;
  setDiceFace(diceValue);
}

resetDice();
syncCenterVisibility();

function startDiceSpin() {
  diceState = 'spinning';
  diceSpinTimer = setInterval(() => {
    diceValue = (diceValue % 6) + 1;
    setDiceFace(diceValue);
  }, DICE_SPIN_INTERVAL_MS);
}

/**
 * Stops the spin DICE_STOP_DELAY_MS from now, landing on `forcedValue` if
 * given (CPU's predetermined roll) or whatever's currently showing (the
 * player's case). Then holds that result - hand and dice both unchanged -
 * for DICE_RESULT_HOLD_MS before resolving, so there's a beat to actually
 * see the number before the piece starts moving.
 */
function settleDiceSpin(forcedValue) {
  diceState = 'locking';
  return new Promise((resolve) => {
    setTimeout(() => {
      clearInterval(diceSpinTimer);
      diceSpinTimer = null;
      if (forcedValue !== undefined) diceValue = forcedValue;
      setDiceFace(diceValue);
      diceState = 'idle';

      setTimeout(() => resolve(diceValue), DICE_RESULT_HOLD_MS);
    }, DICE_STOP_DELAY_MS);
  });
}

/** Marks the dice as "riding along with the move" - kept visible until onMoveComplete fires. */
function beginDiceMove(result) {
  diceMoving = true;
  syncCenterVisibility();
  game.rollDice(result);
}

diceButton.addEventListener('click', () => {
  if (diceButton.disabled) return;

  if (diceState === 'idle') {
    startDiceSpin();
    return;
  }

  if (diceState === 'spinning') {
    settleDiceSpin().then(beginDiceMove);
  }
});

/** CPU's roll: same spin/settle rhythm as the player's, just auto-triggered. */
function cpuRollDice() {
  return new Promise((resolve) => {
    const finalValue = Math.floor(Math.random() * 6) + 1;
    startDiceSpin();
    settleDiceSpin(finalValue).then((result) => {
      diceMoving = true;
      syncCenterVisibility();
      resolve(result);
    });
  });
}

function onMoveComplete() {
  diceMoving = false;
  syncCenterVisibility();
}

// Populated by startBattle() once the player reaches 対戦→CPU戦 through the
// pre-game flow below - nothing here runs until then.
let scene;
let tiles;
let game;

function animate() {
  // Stops this loop for good once the battle is exited (see
  // exitBattleButton) - startBattle() kicks off a fresh loop next time, so
  // loops never pile up across repeated enter/exit cycles.
  if (!game) return;
  scene.render();
  requestAnimationFrame(animate);
}

/**
 * `character` is { name, color, deckVariant } from character creation (or
 * null pre-フェーズ0 fallback). `storyOptions` (playerConfigs/storyMode/
 * onStoryBattleEnd) is set only by playStoryStage() below for ストーリー
 * バトル - when omitted this is the plain 2人対戦 path (humanPlayer + 固定
 * CPU, Gameコンストラクタ側のフォールバックが組む)。
 */
function startBattle(character, storyOptions = {}) {
  scene = new GameScene(canvas);
  tiles = createBoard();
  scene.buildBoard(tiles);

  game = new Game({
    tiles,
    scene,
    onLog: (message) => {
      logEl.textContent = message;
    },
    onStateChange: ({
      turnText,
      canRoll,
      players,
      hand,
      showCenter,
      centerHand,
      currentPlayerIsCPU,
      spellUsedThisTurn,
    }) => {
      turnIndicator.textContent = turnText;
      diceButton.disabled = !canRoll;
      renderPlayerPanels(players);
      renderHand(hand);

      const enteringShowCenter = showCenter && !showCenterState;
      showCenterState = showCenter;
      if (enteringShowCenter) resetDice();
      syncCenterVisibility();
      if (showCenter) {
        renderCenterHand(centerHand, currentPlayerIsCPU, !spellUsedThisTurn);
      }
    },
    onCardReveal: promptCardReveal,
    onDiscardChoice: promptDiscardChoice,
    onSpellUse: promptSpellUse,
    onCpuRoll: cpuRollDice,
    onMoveComplete,
    onLandCommand: promptLandCommand,
    onPickMonsterCard: promptPickMonsterCard,
    onConfirmAction: promptConfirmAction,
    onConfirmMove: promptConfirmMove,
    onConfirmSellLand: promptConfirmSellLand,
    onPickBrowseTile: promptPickBrowseTile,
    onLandSubmenu: promptLandSubmenu,
    onShowTileInfo: promptShowTileInfo,
    onChooseBranch: promptChooseBranch,
    onPickMoveDirection: promptMoveDirection,
    onPickElement: promptPickElement,
    onShopPurchase: promptShopPurchase,
    onBattleSceneEnter: promptBattleSceneEnter,
    onPickBattleItem: promptPickBattleItem,
    onBattleAttack: promptBattleAttack,
    onBattleRetreat: promptBattleRetreat,
    onBattleOutcome: promptBattleOutcome,
    onStoryBattleEnd: storyOptions.onStoryBattleEnd,
    storyMode: storyOptions.storyMode ?? false,
    playerConfigs: storyOptions.playerConfigs,
    humanPlayer: storyOptions.playerConfigs
      ? undefined
      : character
      ? {
          name: character.name,
          color: character.color,
          deckVariant: character.deckVariant,
          deckList: character.deckList,
          iconImage: character.iconImage,
        }
      : undefined,
  });

  game.init();
  playBoardTheme();
  requestAnimationFrame(animate);
}

// ---- Pre-game: login → (first time only) character creation → mode hub ----

const preGame = document.getElementById('pre-game');
const appEl = document.getElementById('app');
const exitBattleButton = document.getElementById('exit-battle-button');
const muteButton = document.getElementById('mute-button');
muteButton.addEventListener('click', () => {
  const muted = toggleMuted();
  muteButton.textContent = muted ? '🔇' : '🔊';
});
const loginScreen = document.getElementById('login-screen');
const loginId = document.getElementById('login-id');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const loginSubmit = document.getElementById('login-submit');
const charmakeScreen = document.getElementById('charmake-screen');
const charmakeIcons = document.getElementById('charmake-icons');
const charmakeName = document.getElementById('charmake-name');
const charmakeDecks = document.getElementById('charmake-decks');
const charmakeSubmit = document.getElementById('charmake-submit');
const hubScreen = document.getElementById('hub-screen');
const hubWelcome = document.getElementById('hub-welcome');
const cardEditorHub = document.getElementById('card-editor-hub');
const catalogScreen = document.getElementById('catalog-screen');
const catalogList = document.getElementById('catalog-list');
const catalogBack = document.getElementById('catalog-back');
const cardEditorScreen = document.getElementById('card-editor-screen');
const editorName = document.getElementById('editor-name');
const editorImage = document.getElementById('editor-image');
const editorImagePreview = document.getElementById('editor-image-preview');
const editorType = document.getElementById('editor-type');
const editorRarity = document.getElementById('editor-rarity');
const editorStatsRow = document.getElementById('editor-stats-row');
const editorAtk = document.getElementById('editor-atk');
const editorHp = document.getElementById('editor-hp');
const editorElementLabel = document.getElementById('editor-element-label');
const editorElement = document.getElementById('editor-element');
const editorCost = document.getElementById('editor-cost');
const editorEffects = document.getElementById('editor-effects');
const editorEffectDescription = document.getElementById('editor-effect-description');
const editorError = document.getElementById('editor-error');
const editorSave = document.getElementById('editor-save');
const editorBack = document.getElementById('editor-back');
const deckScreen = document.getElementById('deck-screen');
const deckCount = document.getElementById('deck-count');
const deckCatalogList = document.getElementById('deck-catalog-list');
const deckSave = document.getElementById('deck-save');
const deckBack = document.getElementById('deck-back');
const shopScreen = document.getElementById('shop-screen');
const shopCurrency = document.getElementById('shop-currency');
const shopPackList = document.getElementById('shop-pack-list');
const shopPackResult = document.getElementById('shop-pack-result');
const shopPackCards = document.getElementById('shop-pack-cards');
const shopPackResultClose = document.getElementById('shop-pack-result-close');
const shopList = document.getElementById('shop-list');
const shopPartsList = document.getElementById('shop-parts-list');
const shopBackButton = document.getElementById('shop-back');
const battleMenuScreen = document.getElementById('battle-menu-screen');
const battleCpuButton = document.getElementById('battle-cpu');
const battlePvpButton = document.getElementById('battle-pvp');
const battleBackButton = document.getElementById('battle-back');
const pvpMenuScreen = document.getElementById('pvp-menu-screen');
const pvpCreateButton = document.getElementById('pvp-create-button');
const pvpJoinCode = document.getElementById('pvp-join-code');
const pvpJoinButton = document.getElementById('pvp-join-button');
const pvpMenuError = document.getElementById('pvp-menu-error');
const pvpMenuBack = document.getElementById('pvp-menu-back');
const pvpRoomScreen = document.getElementById('pvp-room-screen');
const pvpRoomCode = document.getElementById('pvp-room-code');
const pvpRoomStatus = document.getElementById('pvp-room-status');
const pvpRoomStart = document.getElementById('pvp-room-start');
const pvpRoomLeave = document.getElementById('pvp-room-leave');
const breedScreen = document.getElementById('breed-screen');
const breedName = document.getElementById('breed-name');
const breedImage = document.getElementById('breed-image');
const breedImagePreview = document.getElementById('breed-image-preview');
const breedStats = document.getElementById('breed-stats');
const breedError = document.getElementById('breed-error');
const breedPartsList = document.getElementById('breed-parts-list');
const breedBackButton = document.getElementById('breed-back');
const stubScreen = document.getElementById('stub-screen');
const stubText = document.getElementById('stub-text');
const stubBackButton = document.getElementById('stub-back');
const storyScreen = document.getElementById('story-screen');
const storyStageList = document.getElementById('story-stage-list');
const storyBackButton = document.getElementById('story-back');
const storyDialogueScreen = document.getElementById('story-dialogue-screen');
const storyDialogueSpeaker = document.getElementById('story-dialogue-speaker');
const storyDialogueText = document.getElementById('story-dialogue-text');
const storyDialogueNext = document.getElementById('story-dialogue-next');

const ALL_PG_SCREENS = [loginScreen, charmakeScreen, hubScreen, catalogScreen, cardEditorScreen, deckScreen, shopScreen, battleMenuScreen, breedScreen, stubScreen, storyScreen, storyDialogueScreen, pvpMenuScreen, pvpRoomScreen];
function showScreen(el) {
  ALL_PG_SCREENS.forEach((s) => s.classList.toggle('hidden', s !== el));
}

// Accent color paired 1:1 with the 6 split icons (panel border / UI chrome
// color) - the icon image itself is the actual selectable "character",
// this is just cosmetic trim to keep player panels distinguishable.
const ICON_COLORS = [0x2ec4b6, 0xe63946, 0xffd166, 0x8e5ce6, 0x4caf6e, 0x3a86e6];
// M is the persistent menu-side currency (character.m) - entirely separate
// from the in-battle G (player.currency, resets to 500 every match). Earned
// by cashing out a battle's ending G at 20% (see settleBattleEnd), min 50.
const STARTING_M = 300;
const M_CONVERSION_RATE = 0.2;
const M_CONVERSION_MIN = 50;
const CARD_EDITOR_HASH = '#card-editor';

let currentUserId = null;
let currentCharacter = null;
let selectedIconIndex = null;
let selectedDeckVariant = null;

function updateCharmakeValidity() {
  charmakeSubmit.disabled = !charmakeName.value.trim() || selectedIconIndex == null || !selectedDeckVariant;
}

async function showCharmakeScreen() {
  selectedIconIndex = null;
  selectedDeckVariant = null;
  charmakeName.value = '';

  charmakeIcons.replaceChildren();
  const icons = await loadPlayerIcons();
  icons.forEach((icon, index) => {
    const el = document.createElement('img');
    el.className = 'pg-icon-choice';
    el.src = icon.dataUrl;
    el.alt = `アイコン${index + 1}`;
    el.addEventListener('click', () => {
      selectedIconIndex = index;
      [...charmakeIcons.children].forEach((c) => c.classList.remove('selected'));
      el.classList.add('selected');
      updateCharmakeValidity();
    });
    charmakeIcons.appendChild(el);
  });

  charmakeDecks.replaceChildren();
  for (const deck of Object.values(STARTER_DECKS)) {
    const el = document.createElement('div');
    el.className = 'pg-deck-choice';
    el.textContent = deck.name;
    el.addEventListener('click', () => {
      selectedDeckVariant = deck.id;
      [...charmakeDecks.children].forEach((c) => c.classList.remove('selected'));
      el.classList.add('selected');
      updateCharmakeValidity();
    });
    charmakeDecks.appendChild(el);
  }

  updateCharmakeValidity();
  showScreen(charmakeScreen);
}

function showHubScreen() {
  hubWelcome.textContent = `ようこそ、${currentCharacter.name}（所持M: ${currentCharacter.m}）`;
  cardEditorHub.classList.add('hidden');
  if (location.hash === CARD_EDITOR_HASH) {
    showCardEditor();
    return;
  }
  showScreen(hubScreen);
}

/** Existing characters saved before ブリードモンスター existed won't have these fields yet - fill them in with the default build (no owned parts) rather than crashing on undefined. */
function ensureBreedFields(character) {
  if (!character.breedMonster) character.breedMonster = { name: BREED_BASE.defaultName, equippedPartIds: [] };
  if (!character.ownedPartIds) character.ownedPartIds = [];
  if (character.storyProgress == null) character.storyProgress = 0;
  return character;
}

loginSubmit.addEventListener('click', () => {
  const result = loginOrRegister(loginId.value.trim(), loginPassword.value);
  if (!result.ok) {
    loginError.textContent = result.error;
    loginError.classList.remove('hidden');
    return;
  }
  loginError.classList.add('hidden');
  currentUserId = result.id;
  if (result.isNew || !result.character) {
    showCharmakeScreen();
  } else {
    currentCharacter = ensureBreedFields(result.character);
    showHubScreen();
  }
});

charmakeName.addEventListener('input', updateCharmakeValidity);

charmakeSubmit.addEventListener('click', () => {
  if (charmakeSubmit.disabled) return;
  const breedMonster = { name: BREED_BASE.defaultName, equippedPartIds: [] };
  const breedCard = { ...buildBreedCardDef({ breedMonster }), id: `breedMonster-${Date.now()}` };

  const deckList = buildStarterDeckList(selectedDeckVariant);
  // ブリードモンスターはレアリティEXで初期デッキに常に1枚だけ入る - 汎用
  // モンスターを1枚外して差し替え、合計40枚を維持する。
  const genericMonsterIndex = deckList.findIndex((c) => c.type === CardType.MONSTER && !c.catalogId);
  if (genericMonsterIndex !== -1) deckList.splice(genericMonsterIndex, 1);
  deckList.push(breedCard);

  const ownedCards = {};
  for (const card of deckList) ownedCards[cardKey(card)] = (ownedCards[cardKey(card)] || 0) + 1;
  currentCharacter = {
    name: charmakeName.value.trim(),
    iconIndex: selectedIconIndex,
    color: ICON_COLORS[selectedIconIndex],
    deckVariant: selectedDeckVariant,
    deckList,
    ownedCards,
    m: STARTING_M,
    breedMonster,
    ownedPartIds: [],
    storyProgress: 0,
  };
  saveCharacter(currentUserId, currentCharacter);
  showHubScreen();
});

const STUB_MODE_LABEL = { story: 'ストーリー' };

// ---- Story mode: stage select → intro dialogue → N人対戦（storyMode）→ outro dialogue ----
// バトル自体は通常のstartBattle()と同じGameクラスを使う - playerConfigs/
// storyMode/onStoryBattleEndを渡すだけで1vs1vs1・2vs2同盟戦も成立する
// （#36で汎用化済み。Game側のターン進行/CPU/同盟集計はプレイヤー人数に
// 依存しない実装のため、ここは「誰を何人渡すか」を組み立てるだけでいい）。

let activeStoryStageIndex = null;

function showStoryScreen() {
  storyStageList.replaceChildren();
  STORY_STAGES.forEach((stage, index) => {
    const unlocked = isStageUnlocked(currentCharacter, index);
    const cleared = isStageCleared(currentCharacter, index);

    const row = document.createElement('div');
    row.className = `deck-row${unlocked ? '' : ' story-stage-row-locked'}`;

    const info = document.createElement('div');
    info.className = 'deck-row-info';
    const name = document.createElement('div');
    name.className = 'deck-row-name';
    name.textContent = stage.title;
    if (unlocked) name.addEventListener('click', () => playStoryStage(index));
    const meta = document.createElement('div');
    meta.className = 'deck-row-meta';
    meta.textContent = unlocked ? (cleared ? 'クリア済み' : `形式: ${stage.format}`) : 'ロック中';
    info.append(name, meta);

    row.append(info);
    storyStageList.appendChild(row);
  });
  showScreen(storyScreen);
}

storyBackButton.addEventListener('click', showHubScreen);

/** Shows `lines` one at a time (speaker + text), advancing on click of storyDialogueNext. Resolves once the last line has been dismissed. */
function playDialogueLines(lines) {
  return new Promise((resolve) => {
    let i = 0;
    function showLine() {
      storyDialogueSpeaker.textContent = lines[i].speaker;
      storyDialogueText.textContent = lines[i].text;
    }
    function onNext() {
      i += 1;
      if (i >= lines.length) {
        storyDialogueNext.removeEventListener('click', onNext);
        resolve();
        return;
      }
      showLine();
    }
    storyDialogueNext.addEventListener('click', onNext);
    showLine();
  });
}

async function playStoryStage(index) {
  showScreen(storyDialogueScreen);
  await playDialogueLines(STORY_STAGES[index].intro);
  await startStoryBattle(index);
}

/** hero(+ally) vs opponents, in Gameの playerConfigs 形式。陣営分けはallianceIdだけで表現 - stage.heroAllianceId/enemyAllianceIdがnullなら同盟なし（1vs1vs1のFFA）。 */
function buildStoryPlayerConfigs(stage, iconImage) {
  const configs = [
    {
      name: currentCharacter.name,
      isCPU: false,
      color: currentCharacter.color,
      allianceId: stage.heroAllianceId ?? null,
      deckList: currentCharacter.deckList,
      deckVariant: currentCharacter.deckVariant,
      iconImage,
    },
  ];
  if (stage.ally) {
    configs.push({
      name: stage.ally.name,
      isCPU: true,
      color: stage.ally.color,
      allianceId: stage.heroAllianceId ?? null,
      deckList: buildThemedDeckList(stage.ally.theme),
    });
  }
  for (const opponent of stage.opponents) {
    configs.push({
      name: opponent.name,
      isCPU: true,
      color: opponent.color,
      allianceId: stage.enemyAllianceId ?? null,
      deckList: buildThemedDeckList(opponent.theme),
    });
  }
  return configs;
}

async function startStoryBattle(index) {
  const stage = STORY_STAGES[index];
  activeStoryStageIndex = index;

  let iconImage = null;
  if (currentCharacter.iconIndex != null) {
    const icons = await loadPlayerIcons();
    iconImage = icons[currentCharacter.iconIndex]?.canvas ?? null;
  }

  preGame.classList.add('hidden');
  appEl.classList.remove('hidden');
  startBattle(currentCharacter, {
    storyMode: true,
    playerConfigs: buildStoryPlayerConfigs(stage, iconImage),
    onStoryBattleEnd: (result) => handleStoryBattleEnd(index, result),
  });
}

async function handleStoryBattleEnd(index, { won }) {
  const stage = STORY_STAGES[index];
  game = undefined;
  appEl.classList.add('hidden');
  preGame.classList.remove('hidden');
  activeStoryStageIndex = null;

  if (!won) {
    showScreen(storyDialogueScreen);
    await playDialogueLines([{ speaker: '???', text: '力及ばず、敗れてしまった……もう一度挑もう。' }]);
    showStoryScreen();
    return;
  }

  if (stage.reward) {
    const rewardDef = ITEM_CATALOG[stage.reward];
    if (rewardDef) {
      const key = cardKey(rewardDef);
      currentCharacter.ownedCards[key] = (currentCharacter.ownedCards[key] || 0) + 1;
    }
  }
  if (index + 1 > (currentCharacter.storyProgress || 0)) {
    currentCharacter.storyProgress = index + 1;
  }
  saveCharacter(currentUserId, currentCharacter);

  showScreen(storyDialogueScreen);
  await playDialogueLines(stage.outro);
  showStoryScreen();
}

document.querySelectorAll('.hub-tile').forEach((tile) => {
  tile.addEventListener('click', () => {
    const mode = tile.dataset.mode;
    if (mode === 'story') {
      showStoryScreen();
    } else if (mode === 'battle') {
      showScreen(battleMenuScreen);
    } else if (mode === 'deck') {
      showDeckScreen();
    } else if (mode === 'catalog') {
      showCatalogScreen();
    } else if (mode === 'shop') {
      showShopScreen();
    } else if (mode === 'breed') {
      showBreedScreen();
    } else {
      stubText.textContent = `${STUB_MODE_LABEL[mode]}は準備中です`;
      showScreen(stubScreen);
    }
  });
});

battleBackButton.addEventListener('click', showHubScreen);
stubBackButton.addEventListener('click', showHubScreen);

// ---- Card catalog: unowned entries stay blank; owned entries reveal name/count/detail. ----

const RARITY_ORDER = { [Rarity.N]: 0, [Rarity.S]: 1, [Rarity.R]: 2, [Rarity.EX]: 3 };

function sortedCatalog() {
  return effectiveCatalog().slice().sort((a, b) =>
    (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99)
      || a.name.localeCompare(b.name, 'ja'));
}

function showCatalogScreen() {
  catalogList.replaceChildren();
  for (const card of sortedCatalog()) {
    const owned = ownedCountOf(cardKey(card));
    const row = document.createElement('div');
    row.className = `catalog-row${owned ? '' : ' catalog-row-unknown'}`;
    const rarity = document.createElement('span');
    rarity.className = 'catalog-rarity';
    rarity.textContent = card.rarity;
    rarity.style.color = RARITY_COLOR[card.rarity];
    const name = document.createElement(owned ? 'button' : 'span');
    name.className = 'catalog-card-name';
    name.textContent = owned ? card.name : '';
    const count = document.createElement('span');
    count.className = 'catalog-count';
    count.textContent = owned ? `${owned}枚` : '';
    if (owned) name.addEventListener('click', () => showCardDetail(card));
    row.append(rarity, name, count);
    catalogList.appendChild(row);
  }
  showScreen(catalogScreen);
}

catalogBack.addEventListener('click', showHubScreen);

// ---- Secret URL card editor (#card-editor). Definitions persist in localStorage. ----

let editorImageDataUrl = '';

function updateEditorFields() {
  const isMonster = editorType.value === CardType.MONSTER;
  const hasStats = editorType.value !== CardType.SPELL;
  editorStatsRow.classList.toggle('hidden', !hasStats);
  editorElementLabel.classList.toggle('hidden', !isMonster);
  for (const label of editorEffects.querySelectorAll('label')) {
    label.classList.toggle('hidden', !label.dataset.types.split(',').includes(editorType.value));
  }
}

function showCardEditor() {
  if (!currentCharacter) return;
  editorEffects.replaceChildren();
  for (const effect of CARD_EFFECTS) {
    const label = document.createElement('label');
    label.dataset.types = effect.types.join(',');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = effect.id;
    label.append(input, document.createTextNode(effect.label));
    editorEffects.appendChild(label);
  }
  updateEditorFields();
  showScreen(cardEditorScreen);
}

editorType.addEventListener('change', updateEditorFields);

editorImage.addEventListener('change', () => {
  const file = editorImage.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    editorError.textContent = '画像ファイルを選択してください';
    editorError.classList.remove('hidden');
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const image = new Image();
    image.addEventListener('load', () => {
      const maxSide = 768;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      editorImageDataUrl = canvas.toDataURL('image/webp', 0.82);
      editorImagePreview.src = editorImageDataUrl;
      editorImagePreview.classList.remove('hidden');
      editorError.classList.add('hidden');
    });
    image.src = String(reader.result);
  });
  reader.readAsDataURL(file);
});

editorSave.addEventListener('click', () => {
  const input = {
    name: editorName.value,
    imageDataUrl: editorImageDataUrl,
    type: editorType.value,
    rarity: editorRarity.value,
    atk: editorAtk.value,
    hp: editorHp.value,
    element: editorElement.value,
    cost: editorCost.value,
    traits: [...editorEffects.querySelectorAll('input:checked')].map((el) => el.value),
    effectDescription: editorEffectDescription.value,
  };
  const error = validateCustomCard(currentUserId, input);
  if (error) {
    editorError.textContent = error;
    editorError.classList.remove('hidden');
    return;
  }
  if (getCardCatalog(currentUserId).some((card) => card.name === input.name.trim())) {
    editorError.textContent = '同じ名前のカードが図鑑に既にあります';
    editorError.classList.remove('hidden');
    return;
  }
  let card;
  try {
    card = saveCustomCard(currentUserId, input);
  } catch {
    editorError.textContent = '画像またはカードデータを保存できませんでした。画像サイズを小さくしてください';
    editorError.classList.remove('hidden');
    return;
  }
  editorError.classList.add('hidden');
  // 作っただけでは誰の持ち物にもならず、デッキに一切入れられなかった
  // バグ（所持枚数0のまま固定）の修正: 作成者に1枚付与する。
  const key = cardKey(card);
  currentCharacter.ownedCards[key] = (currentCharacter.ownedCards[key] || 0) + 1;
  saveCharacter(currentUserId, currentCharacter);
  showCardDetail(card);
  editorName.value = '';
  editorImage.value = '';
  editorImageDataUrl = '';
  editorImagePreview.classList.add('hidden');
  editorEffectDescription.value = '';
  editorEffects.querySelectorAll('input').forEach((el) => { el.checked = false; });
});

editorBack.addEventListener('click', () => {
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  showHubScreen();
});

// ---- Deck editor: browse the card catalog, +/- copies (max 4 each) until exactly 40, then save ----

const MAX_COPIES_PER_CARD = 4;
const DECK_SIZE = 40;

/**
 * Every card's `name` is unique across the catalog (named flavor cards and
 * formulaic generic names never collide), so it's the simplest stable key
 * for grouping deck copies against catalog entries - `catalogId` doesn't
 * help here since raw catalog entries don't carry one (only deck-
 * instantiated copies do), and `id` isn't stable across separate
 * buildCardPool() calls for generic cards. The one exception is the
 * ブリードモンスター, which the player can rename anytime in the ブリード
 * screen - it keys on its stable catalogId instead so a rename can't
 * desync ownedCards/deck tracking from what's actually equipped.
 */
function cardKey(card) {
  return card.catalogId === 'breedMonster' ? 'breedMonster' : card.name;
}

/** getCardCatalog() plus this character's live breed-monster card (not cached globally - it's per-character and its stats change as parts are equipped). */
function effectiveCatalog() {
  return [...getCardCatalog(currentUserId), buildBreedCardDef(currentCharacter)];
}

let deckWorkingCounts = null;

function deckTotal() {
  let total = 0;
  for (const count of deckWorkingCounts.values()) total += count;
  return total;
}

function updateDeckTotalDisplay() {
  const total = deckTotal();
  deckCount.textContent = `${total} / ${DECK_SIZE}`;
  deckSave.disabled = total !== DECK_SIZE;
}

function ownedCountOf(key) {
  return (currentCharacter.ownedCards || {})[key] || 0;
}

function showDeckScreen() {
  const catalog = effectiveCatalog();
  deckWorkingCounts = new Map();
  for (const card of currentCharacter.deckList || []) {
    const key = cardKey(card);
    deckWorkingCounts.set(key, (deckWorkingCounts.get(key) || 0) + 1);
  }

  // The DECK_SIZE-reached cap on every "＋" button is a global constraint
  // (depends on the grand total, not just that row's own count), so
  // changing any one row must refresh every row's button state, not just
  // the one that was clicked.
  const rowRefreshers = [];
  function refreshAll() {
    rowRefreshers.forEach((fn) => fn());
    updateDeckTotalDisplay();
  }

  deckCatalogList.replaceChildren();
  for (const def of catalog) {
    const key = cardKey(def);
    const owned = ownedCountOf(key);
    const copyCap = Math.min(MAX_COPIES_PER_CARD, owned);
    const row = document.createElement('div');
    row.className = 'deck-row';

    const swatch = document.createElement('div');
    swatch.className = 'deck-row-swatch';
    swatch.style.background = cardColor(def);

    const info = document.createElement('div');
    info.className = 'deck-row-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'deck-row-name';
    nameEl.textContent = def.name;
    nameEl.addEventListener('click', () => showCardDetail(def));
    const costText = def.cost != null ? ` / コスト${def.cost}` : '';
    const meta = document.createElement('div');
    meta.className = 'deck-row-meta';
    meta.textContent = `${describeCard(def)}${costText} / 所持${owned}`;
    info.append(nameEl, meta);

    const minusBtn = document.createElement('button');
    minusBtn.textContent = '−';
    const countEl = document.createElement('span');
    const plusBtn = document.createElement('button');
    plusBtn.textContent = '＋';

    function refreshRow() {
      const count = deckWorkingCounts.get(key) || 0;
      countEl.textContent = String(count);
      minusBtn.disabled = count <= 0;
      plusBtn.disabled = count >= copyCap || deckTotal() >= DECK_SIZE;
    }
    rowRefreshers.push(refreshRow);

    minusBtn.addEventListener('click', () => {
      const count = deckWorkingCounts.get(key) || 0;
      if (count <= 0) return;
      deckWorkingCounts.set(key, count - 1);
      refreshAll();
    });
    plusBtn.addEventListener('click', () => {
      const count = deckWorkingCounts.get(key) || 0;
      if (count >= copyCap || deckTotal() >= DECK_SIZE) return;
      deckWorkingCounts.set(key, count + 1);
      refreshAll();
    });

    const stepper = document.createElement('div');
    stepper.className = 'deck-row-stepper';
    stepper.append(minusBtn, countEl, plusBtn);
    row.append(swatch, info, stepper);
    deckCatalogList.appendChild(row);
  }

  refreshAll();
  showScreen(deckScreen);
}

deckSave.addEventListener('click', () => {
  if (deckSave.disabled) return;
  const catalog = effectiveCatalog();
  const byKey = new Map(catalog.map((def) => [cardKey(def), def]));
  const newList = [];
  for (const [key, count] of deckWorkingCounts.entries()) {
    const def = byKey.get(key);
    for (let i = 0; i < count; i++) newList.push({ ...def });
  }
  currentCharacter = { ...currentCharacter, deckList: newList };
  saveCharacter(currentUserId, currentCharacter);
  showHubScreen();
});

deckBack.addEventListener('click', showHubScreen);

// ---- Shop: buy permanent card packs with M, or sell spare cards. EX never sells. ----

function inDeckCountOf(key) {
  let count = 0;
  for (const card of currentCharacter.deckList || []) {
    if (cardKey(card) === key) count += 1;
  }
  return count;
}

function showShopScreen() {
  const catalog = getCardCatalog(currentUserId);
  const byKey = new Map(catalog.map((def) => [cardKey(def), def]));
  shopCurrency.textContent = `所持M: ${currentCharacter.m}`;
  shopPackResult.classList.add('hidden');
  shopPackList.replaceChildren();
  shopList.replaceChildren();
  shopPartsList.replaceChildren();

  for (const pack of PACKS) {
    const row = document.createElement('div');
    row.className = 'shop-pack-row';
    const info = document.createElement('div');
    info.className = 'deck-row-info';
    const name = document.createElement('div');
    name.className = 'shop-pack-name';
    name.textContent = pack.name;
    const meta = document.createElement('div');
    meta.className = 'deck-row-meta';
    meta.textContent = `${pack.description} / 最低1枚S以上 / ${pack.cost}M`;
    info.append(name, meta);

    const buyButton = document.createElement('button');
    buyButton.className = 'deck-row-sell';
    buyButton.textContent = `${pack.cost}Mで引く`;
    buyButton.disabled = currentCharacter.m < pack.cost;
    buyButton.addEventListener('click', () => {
      if (currentCharacter.m < pack.cost) return;
      const cards = drawPack(pack, catalog);
      currentCharacter.m -= pack.cost;
      for (const card of cards) {
        const key = cardKey(card);
        currentCharacter.ownedCards[key] = (currentCharacter.ownedCards[key] || 0) + 1;
      }
      saveCharacter(currentUserId, currentCharacter);
      showPackResult(cards);
      shopCurrency.textContent = `所持M: ${currentCharacter.m}`;
      renderPackButtons();
    });
    row.append(info, buyButton);
    shopPackList.appendChild(row);
  }

  if (!currentCharacter.ownedPartIds) currentCharacter.ownedPartIds = [];
  for (const part of BREED_PARTS) {
    const owned = currentCharacter.ownedPartIds.includes(part.id);

    const row = document.createElement('div');
    row.className = 'shop-pack-row';

    const info = document.createElement('div');
    info.className = 'deck-row-info';
    const name = document.createElement('div');
    name.className = 'shop-pack-name';
    name.textContent = part.name;
    const badges = document.createElement('div');
    badges.className = 'breed-part-badges';
    for (const badge of breedPartBadges(part)) {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'breed-part-badge';
      badgeEl.textContent = `${badge.icon}${badge.text}`;
      badges.appendChild(badgeEl);
    }
    info.append(name, badges);

    const buyButton = document.createElement('button');
    buyButton.className = 'deck-row-sell';
    if (owned) {
      buyButton.textContent = '購入済み';
      buyButton.disabled = true;
    } else {
      buyButton.textContent = `${part.price}Mで購入`;
      buyButton.disabled = currentCharacter.m < part.price;
      buyButton.addEventListener('click', () => {
        if (currentCharacter.m < part.price || currentCharacter.ownedPartIds.includes(part.id)) return;
        currentCharacter.m -= part.price;
        currentCharacter.ownedPartIds.push(part.id);
        saveCharacter(currentUserId, currentCharacter);
        showShopScreen();
      });
    }
    row.append(info, buyButton);
    shopPartsList.appendChild(row);
  }

  for (const [key, owned] of Object.entries(currentCharacter.ownedCards || {})) {
    if (owned <= 0) continue;
    const def = byKey.get(key);
    if (!def) continue;
    const surplus = owned - inDeckCountOf(key);
    const price = RARITY_SELL_PRICE[def.rarity];

    const row = document.createElement('div');
    row.className = 'deck-row';

    const swatch = document.createElement('div');
    swatch.className = 'deck-row-swatch';
    swatch.style.background = cardColor(def);

    const info = document.createElement('div');
    info.className = 'deck-row-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'deck-row-name';
    nameEl.textContent = def.name;
    nameEl.addEventListener('click', () => showCardDetail(def));
    const meta = document.createElement('div');
    meta.className = 'deck-row-meta';
    meta.textContent = price != null
      ? `所持${owned} / 余り${Math.max(surplus, 0)} / 売却${price}M`
      : `所持${owned} / ${def.rarity}は売却不可`;
    info.append(nameEl, meta);

    const sellBtn = document.createElement('button');
    sellBtn.className = 'deck-row-sell';
    sellBtn.textContent = '売る';
    sellBtn.disabled = price == null || surplus <= 0;
    sellBtn.addEventListener('click', () => {
      currentCharacter.ownedCards[key] -= 1;
      currentCharacter.m += price;
      saveCharacter(currentUserId, currentCharacter);
      showShopScreen();
    });

    row.append(swatch, info, sellBtn);
    shopList.appendChild(row);
  }
  showScreen(shopScreen);
}

function renderPackButtons() {
  for (const button of shopPackList.querySelectorAll('button')) {
    const price = Number.parseInt(button.textContent, 10);
    button.disabled = currentCharacter.m < price;
  }
}

function showPackResult(cards) {
  shopPackCards.replaceChildren();
  for (const card of cards) {
    const el = document.createElement('button');
    el.className = 'shop-result-card';
    el.style.borderColor = RARITY_COLOR[card.rarity];
    const rarity = document.createElement('strong');
    rarity.style.color = RARITY_COLOR[card.rarity];
    rarity.textContent = card.rarity;
    const name = document.createElement('span');
    name.textContent = card.name;
    el.append(rarity, name);
    el.addEventListener('click', () => showCardDetail(card));
    shopPackCards.appendChild(el);
  }
  shopPackResult.classList.remove('hidden');
}

shopPackResultClose.addEventListener('click', showShopScreen);

shopBackButton.addEventListener('click', showHubScreen);

// ---- ブリード: rename + view computed stats + equip/unequip owned parts ----

function showBreedScreen() {
  breedName.value = currentCharacter.breedMonster.name;
  breedImage.value = '';
  if (currentCharacter.breedMonster.imageDataUrl) {
    breedImagePreview.src = currentCharacter.breedMonster.imageDataUrl;
    breedImagePreview.classList.remove('hidden');
  } else {
    breedImagePreview.classList.add('hidden');
  }
  breedError.classList.add('hidden');
  renderBreedScreen();
  showScreen(breedScreen);
}

function renderBreedScreen() {
  const stats = computeBreedStats(currentCharacter.breedMonster);
  breedStats.textContent = `属性: ${ELEMENT_LABEL[stats.element]} / ATK ${stats.atk} / HP ${stats.hp} / 召喚コスト ${stats.cost}G`;

  breedPartsList.replaceChildren();
  for (const part of currentCharacter.ownedPartIds || []) {
    const def = BREED_PARTS.find((p) => p.id === part);
    if (!def) continue;
    const equipped = currentCharacter.breedMonster.equippedPartIds.includes(def.id);

    const row = document.createElement('div');
    row.className = 'deck-row';

    const info = document.createElement('div');
    info.className = 'deck-row-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'deck-row-name';
    nameEl.textContent = def.name;
    if (equipped && def.chooseElement && currentCharacter.breedMonster.elementPatchChoice) {
      const meta = document.createElement('div');
      meta.className = 'deck-row-meta';
      meta.textContent = `属性→${ELEMENT_LABEL[currentCharacter.breedMonster.elementPatchChoice]}に上書き中`;
      info.append(nameEl, meta);
    } else {
      const badges = document.createElement('div');
      badges.className = 'breed-part-badges';
      for (const badge of breedPartBadges(def)) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'breed-part-badge';
        badgeEl.textContent = `${badge.icon}${badge.text}`;
        badges.appendChild(badgeEl);
      }
      info.append(nameEl, badges);
    }

    function equip() {
      currentCharacter.breedMonster.equippedPartIds.push(def.id);
      saveCharacter(currentUserId, currentCharacter);
      renderBreedScreen();
    }

    if (!equipped && def.chooseElement) {
      // 属性パッチ: needs an element picked before it can actually equip -
      // validate the numeric caps first (same as any other part), then show
      // 4 element swatches in place of the toggle button.
      const check = canEquipPart(currentCharacter.breedMonster, def);
      if (!check.ok) {
        const disabledBtn = document.createElement('button');
        disabledBtn.className = 'deck-row-sell';
        disabledBtn.textContent = '装着';
        disabledBtn.disabled = true;
        disabledBtn.title = check.error;
        row.append(info, disabledBtn);
      } else {
        const choices = document.createElement('div');
        choices.className = 'breed-element-choices';
        for (const element of CHANGEABLE_BREED_ELEMENTS) {
          const swatch = document.createElement('button');
          swatch.className = 'breed-element-choice';
          swatch.style.background = CARD_COLOR[element];
          swatch.textContent = ELEMENT_LABEL[element];
          swatch.addEventListener('click', () => {
            breedError.classList.add('hidden');
            currentCharacter.breedMonster.elementPatchChoice = element;
            equip();
          });
          choices.appendChild(swatch);
        }
        row.append(info, choices);
      }
      breedPartsList.appendChild(row);
      continue;
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'deck-row-sell';
    toggleBtn.textContent = equipped ? '外す' : '装着';
    if (!equipped) {
      const check = canEquipPart(currentCharacter.breedMonster, def);
      toggleBtn.disabled = !check.ok;
      toggleBtn.title = check.ok ? '' : check.error;
    }
    toggleBtn.addEventListener('click', () => {
      breedError.classList.add('hidden');
      if (equipped) {
        currentCharacter.breedMonster.equippedPartIds = currentCharacter.breedMonster.equippedPartIds.filter(
          (id) => id !== def.id
        );
        saveCharacter(currentUserId, currentCharacter);
        renderBreedScreen();
        return;
      }
      const check = canEquipPart(currentCharacter.breedMonster, def);
      if (!check.ok) {
        breedError.textContent = check.error;
        breedError.classList.remove('hidden');
        return;
      }
      equip();
    });

    row.append(info, toggleBtn);
    breedPartsList.appendChild(row);
  }
}

breedName.addEventListener('change', () => {
  const trimmed = breedName.value.trim();
  currentCharacter.breedMonster.name = trimmed || BREED_BASE.defaultName;
  breedName.value = currentCharacter.breedMonster.name;
  saveCharacter(currentUserId, currentCharacter);
});

breedImage.addEventListener('change', () => {
  const file = breedImage.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    breedError.textContent = '画像ファイルを選択してください';
    breedError.classList.remove('hidden');
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const dataUrl = String(reader.result);
    try {
      currentCharacter.breedMonster.imageDataUrl = dataUrl;
      saveCharacter(currentUserId, currentCharacter);
    } catch {
      breedError.textContent = '画像を保存できませんでした。画像サイズを小さくしてください';
      breedError.classList.remove('hidden');
      return;
    }
    breedImagePreview.src = dataUrl;
    breedImagePreview.classList.remove('hidden');
    breedError.classList.add('hidden');
  });
  reader.readAsDataURL(file);
});

breedBackButton.addEventListener('click', showHubScreen);

battleCpuButton.addEventListener('click', async () => {
  preGame.classList.add('hidden');
  appEl.classList.remove('hidden');
  let iconImage = null;
  if (currentCharacter.iconIndex != null) {
    const icons = await loadPlayerIcons();
    iconImage = icons[currentCharacter.iconIndex]?.canvas ?? null;
  }
  startBattle({ ...currentCharacter, iconImage });
});

// ---- 対人戦(PvP): 部屋コードでの招待・参加ロビー ----
// 部屋を作った側（ホスト）だけが本物のGameインスタンスを持つホスト権威
// モデル（pvp.js参照）。ここではロビー（部屋作成/参加/相手待ち）まで。

let pvpUnsubscribe = null;
let pvpSession = null; // { roomCode, uid, isHost }

function stopPvpRoomListener() {
  if (pvpUnsubscribe) {
    pvpUnsubscribe();
    pvpUnsubscribe = null;
  }
}

function showPvpMenuScreen() {
  pvpJoinCode.value = '';
  pvpMenuError.classList.add('hidden');
  pvpCreateButton.disabled = !firebaseReady;
  pvpJoinButton.disabled = !firebaseReady;
  if (!firebaseReady) {
    pvpMenuError.textContent = '対人戦は準備中です（サーバー未設定）';
    pvpMenuError.classList.remove('hidden');
  }
  showScreen(pvpMenuScreen);
}

battlePvpButton.addEventListener('click', showPvpMenuScreen);
pvpMenuBack.addEventListener('click', () => showScreen(battleMenuScreen));

function enterPvpRoomScreen(session) {
  pvpSession = session;
  pvpRoomCode.textContent = `部屋コード: ${session.roomCode}`;
  pvpRoomStatus.textContent = '対戦相手を待っています…';
  pvpRoomStart.classList.add('hidden');
  showScreen(pvpRoomScreen);

  stopPvpRoomListener();
  pvpUnsubscribe = listenToRoom(session.roomCode, (room) => {
    if (!room) {
      pvpRoomStatus.textContent = '部屋が削除されました';
      pvpRoomStart.classList.add('hidden');
      return;
    }
    if (room.status === 'finished') {
      pvpRoomStatus.textContent = '対戦は終了しました';
      pvpRoomStart.classList.add('hidden');
      return;
    }
    if (room.guestUid) {
      const opponentName = session.isHost ? room.guestName : room.hostName;
      pvpRoomStatus.textContent = `対戦相手: ${opponentName}`;
      pvpRoomStart.classList.toggle('hidden', !session.isHost);
    } else {
      pvpRoomStatus.textContent = '対戦相手を待っています…';
      pvpRoomStart.classList.add('hidden');
    }
  });
}

pvpCreateButton.addEventListener('click', async () => {
  pvpMenuError.classList.add('hidden');
  pvpCreateButton.disabled = true;
  try {
    const session = await createPvpRoom({ name: currentCharacter.name, color: currentCharacter.color });
    enterPvpRoomScreen(session);
  } catch {
    pvpMenuError.textContent = '部屋を作成できませんでした';
    pvpMenuError.classList.remove('hidden');
  } finally {
    pvpCreateButton.disabled = false;
  }
});

pvpJoinButton.addEventListener('click', async () => {
  const code = pvpJoinCode.value.trim();
  if (!code) return;
  pvpMenuError.classList.add('hidden');
  pvpJoinButton.disabled = true;
  try {
    const session = await joinPvpRoom(code, { name: currentCharacter.name, color: currentCharacter.color });
    enterPvpRoomScreen(session);
  } catch (error) {
    pvpMenuError.textContent = error.message || '入室できませんでした';
    pvpMenuError.classList.remove('hidden');
  } finally {
    pvpJoinButton.disabled = false;
  }
});

pvpRoomLeave.addEventListener('click', async () => {
  stopPvpRoomListener();
  if (pvpSession) {
    await leavePvpRoom(pvpSession.roomCode, { isHost: pvpSession.isHost });
    pvpSession = null;
  }
  showScreen(battleMenuScreen);
});

// ---- Leaving a battle: cash out the ending in-battle G into persistent M (20%, 50 minimum) ----

exitBattleButton.addEventListener('click', async () => {
  if (!game) return;
  const endingG = game.players[0].currency;
  const earnedM = Math.max(Math.round(endingG * M_CONVERSION_RATE), M_CONVERSION_MIN);
  const confirmed = await confirmYesNo(`対戦をやめますか？\n所持${endingG}Gの20%（${earnedM}M、下限50M）を獲得します。`);
  if (!confirmed) return;

  currentCharacter.m += earnedM;
  saveCharacter(currentUserId, currentCharacter);
  game = undefined;
  stopMusic();
  appEl.classList.add('hidden');
  preGame.classList.remove('hidden');
  const wasStoryBattle = activeStoryStageIndex != null;
  activeStoryStageIndex = null;
  if (wasStoryBattle) {
    showStoryScreen();
  } else {
    showHubScreen();
  }
});
