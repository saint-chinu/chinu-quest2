import './style.css';
import { GameScene } from './scene.js';
import { createBoard } from './board.js';
import { Game } from './game.js';
import { CardType, CARD_COLOR, ELEMENT_LABEL, Rarity, RARITY_COLOR, RARITY_SELL_PRICE, TYPE_ICON } from './cards.js';
import { STARTER_DECKS, buildStarterDeckList } from './battleCards.js';
import { loginOrRegister, saveCharacter } from './auth.js';
import { getCardCatalog } from './cardCatalog.js';
import { loadPlayerIcons } from './iconSheet.js';

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
const landCommandLevelup = document.getElementById('land-command-levelup');
const landCommandElement = document.getElementById('land-command-element');
const landCommandInfo = document.getElementById('land-command-info');
const landCommandEnd = document.getElementById('land-command-end');
const monsterPickerModal = document.getElementById('monster-picker-modal');
const monsterPickerChoices = document.getElementById('monster-picker-choices');
const monsterPickerCancel = document.getElementById('monster-picker-cancel');
const shopTileModal = document.getElementById('shop-tile-modal');
const shopTileChoices = document.getElementById('shop-tile-choices');
const shopTileCancel = document.getElementById('shop-tile-cancel');
const landPickerModal = document.getElementById('land-picker-modal');
const landPickerTitle = document.getElementById('land-picker-title');
const landPickerChoices = document.getElementById('land-picker-choices');
const landPickerCancel = document.getElementById('land-picker-cancel');
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
const tileInfoBack = document.getElementById('tile-info-back');
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
 * Every time movement reaches a tile with more than one way forward (the
 * board's 4 edge-midpoints and its center - see board.js), not just once at
 * game start: up to 4 diagonal arrows appear, one per available option, in
 * whichever screen direction that neighbor actually sits (see
 * Game._chooseNextTile - a world +X/-X/+Z/-Z step reads as screen
 * ↘/↖/↙/↗ respectively under this board's fixed diagonal camera). The same
 * camera-work pan overlay used by 土地情報 comes along so the player can
 * look around before deciding. One tap picks - no arm/confirm step, since
 * this now fires often rather than being a single big one-time decision.
 * The camera-work "戻る" button is hidden (.no-back) since the choice is
 * mandatory; camera position is restored once resolved, before movement
 * continues.
 */
function promptChooseBranch(options) {
  return new Promise((resolve) => {
    const savedFocus = { x: scene.focus.x, z: scene.focus.z };
    cameraWorkOverlay.classList.add('no-back');
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
  });
}

function promptLandCommand(tile, { canSummon, canLevelUp, canChangeElement }) {
  return new Promise((resolve) => {
    landCommandTitle.textContent = tileSummaryText(tile);
    landCommandSummon.disabled = !canSummon;
    landCommandLevelup.disabled = !canLevelUp;
    landCommandElement.disabled = !canChangeElement;
    landCommandModal.classList.remove('hidden');

    function cleanup(result) {
      landCommandModal.classList.add('hidden');
      landCommandSummon.removeEventListener('click', onSummon);
      landCommandLevelup.removeEventListener('click', onLevelup);
      landCommandElement.removeEventListener('click', onElement);
      landCommandInfo.removeEventListener('click', onInfo);
      landCommandEnd.removeEventListener('click', onEnd);
      resolve(result);
    }
    function onSummon() {
      cleanup('summon');
    }
    function onLevelup() {
      cleanup('levelup');
    }
    function onElement() {
      cleanup('element');
    }
    function onInfo() {
      cleanup('info');
    }
    function onEnd() {
      cleanup('end');
    }
    landCommandSummon.addEventListener('click', onSummon);
    landCommandLevelup.addEventListener('click', onLevelup);
    landCommandElement.addEventListener('click', onElement);
    landCommandInfo.addEventListener('click', onInfo);
    landCommandEnd.addEventListener('click', onEnd);
  });
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

function landChoiceText(tile) {
  return `${ELEMENT_LABEL[tile.element]} / Lv${tile.level} / 通行料${tile.toll}G`;
}

/** Picks one of the given owned tiles; resolves the tile's id, or null if cancelled. */
function promptPickLand(summaries, title) {
  return new Promise((resolve) => {
    landPickerTitle.textContent = title;
    landPickerChoices.replaceChildren();
    for (const tile of summaries) {
      const el = document.createElement('div');
      el.className = 'land-choice';
      el.textContent = landChoiceText(tile);
      el.addEventListener('click', () => {
        landPickerModal.classList.add('hidden');
        resolve(tile.id);
      });
      landPickerChoices.appendChild(el);
    }
    landPickerModal.classList.remove('hidden');

    function onCancel() {
      landPickerModal.classList.add('hidden');
      landPickerCancel.removeEventListener('click', onCancel);
      resolve(null);
    }
    landPickerCancel.addEventListener('click', onCancel);
  });
}

function promptPickLandForLevelUp(summaries) {
  return promptPickLand(summaries, 'レベルアップする土地を選んでください');
}

function promptPickLandForElementChange(summaries) {
  return promptPickLand(summaries, '属性を変更する土地を選んでください');
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

/**
 * "土地情報" mode: free-look camera (4 edge arrows) over the actual board,
 * click any tile for its info. Camera position is restored to wherever it
 * was before entering, once the player backs all the way out.
 */
function promptTileInfo() {
  return new Promise((resolve) => {
    const savedFocus = { x: scene.focus.x, z: scene.focus.z };
    cameraWorkOverlay.classList.remove('hidden');

    function onCanvasClick(e) {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const tile = scene.pickTileAt(ndcX, ndcY, tiles);
      if (tile) {
        tileInfoText.textContent = tileSummaryText(game.getTileSummary(tile));
        tileInfoModal.classList.remove('hidden');
      }
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
    function onInfoClose() {
      tileInfoModal.classList.add('hidden');
    }
    function onInfoBack() {
      tileInfoModal.classList.add('hidden');
      finish();
    }
    function onWorkBack() {
      finish();
    }
    function finish() {
      cameraWorkOverlay.classList.add('hidden');
      canvas.removeEventListener('click', onCanvasClick);
      camArrowUp.removeEventListener('click', onUp);
      camArrowDown.removeEventListener('click', onDown);
      camArrowLeft.removeEventListener('click', onLeft);
      camArrowRight.removeEventListener('click', onRight);
      camWorkBack.removeEventListener('click', onWorkBack);
      tileInfoClose.removeEventListener('click', onInfoClose);
      tileInfoBack.removeEventListener('click', onInfoBack);
      scene.setFocusImmediate(savedFocus.x, savedFocus.z);
      resolve();
    }

    canvas.addEventListener('click', onCanvasClick);
    camArrowUp.addEventListener('click', onUp);
    camArrowDown.addEventListener('click', onDown);
    camArrowLeft.addEventListener('click', onLeft);
    camArrowRight.addEventListener('click', onRight);
    camWorkBack.addEventListener('click', onWorkBack);
    tileInfoClose.addEventListener('click', onInfoClose);
    tileInfoBack.addEventListener('click', onInfoBack);
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
    el.replaceChildren();

    const icon = document.createElement('div');
    icon.className = 'player-icon';

    const lines = document.createElement('div');
    lines.className = 'player-info-lines';
    lines.innerHTML = `
      <div class="player-name">${player.name}</div>
      <div class="player-stat">所持 ${player.currency}G / 総資産 ${player.totalAssets}G</div>
    `;

    el.append(icon, lines);
  });
}

/** Rarity badge (top-left) + type icon (top-right) + name, over the element/type background color. */
function renderCardEl(el, card) {
  el.style.background = cardColor(card);
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

/** `character` is { name, color, deckVariant } from character creation (or null pre-フェーズ0 fallback). */
function startBattle(character) {
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
    onTileInfo: promptTileInfo,
    onPickLandForLevelUp: promptPickLandForLevelUp,
    onChooseBranch: promptChooseBranch,
    onPickLandForElementChange: promptPickLandForElementChange,
    onPickElement: promptPickElement,
    onShopPurchase: promptShopPurchase,
    humanPlayer: character
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
  requestAnimationFrame(animate);
}

// ---- Pre-game: login → (first time only) character creation → mode hub ----

const preGame = document.getElementById('pre-game');
const appEl = document.getElementById('app');
const exitBattleButton = document.getElementById('exit-battle-button');
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
const deckScreen = document.getElementById('deck-screen');
const deckCount = document.getElementById('deck-count');
const deckCatalogList = document.getElementById('deck-catalog-list');
const deckSave = document.getElementById('deck-save');
const deckBack = document.getElementById('deck-back');
const shopScreen = document.getElementById('shop-screen');
const shopCurrency = document.getElementById('shop-currency');
const shopList = document.getElementById('shop-list');
const shopBackButton = document.getElementById('shop-back');
const battleMenuScreen = document.getElementById('battle-menu-screen');
const battleCpuButton = document.getElementById('battle-cpu');
const battleBackButton = document.getElementById('battle-back');
const stubScreen = document.getElementById('stub-screen');
const stubText = document.getElementById('stub-text');
const stubBackButton = document.getElementById('stub-back');

const ALL_PG_SCREENS = [loginScreen, charmakeScreen, hubScreen, deckScreen, shopScreen, battleMenuScreen, stubScreen];
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
  showScreen(hubScreen);
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
    currentCharacter = result.character;
    showHubScreen();
  }
});

charmakeName.addEventListener('input', updateCharmakeValidity);

charmakeSubmit.addEventListener('click', () => {
  if (charmakeSubmit.disabled) return;
  const deckList = buildStarterDeckList(selectedDeckVariant);
  const ownedCards = {};
  for (const card of deckList) ownedCards[card.name] = (ownedCards[card.name] || 0) + 1;
  currentCharacter = {
    name: charmakeName.value.trim(),
    iconIndex: selectedIconIndex,
    color: ICON_COLORS[selectedIconIndex],
    deckVariant: selectedDeckVariant,
    deckList,
    ownedCards,
    m: STARTING_M,
  };
  saveCharacter(currentUserId, currentCharacter);
  showHubScreen();
});

const STUB_MODE_LABEL = { story: 'ストーリー', breed: 'ブリード' };

document.querySelectorAll('.hub-tile').forEach((tile) => {
  tile.addEventListener('click', () => {
    const mode = tile.dataset.mode;
    if (mode === 'battle') {
      showScreen(battleMenuScreen);
    } else if (mode === 'deck') {
      showDeckScreen();
    } else if (mode === 'shop') {
      showShopScreen();
    } else {
      stubText.textContent = `${STUB_MODE_LABEL[mode]}は準備中です`;
      showScreen(stubScreen);
    }
  });
});

battleBackButton.addEventListener('click', showHubScreen);
stubBackButton.addEventListener('click', showHubScreen);

// ---- Deck editor: browse the card catalog, +/- copies (max 4 each) until exactly 40, then save ----

const MAX_COPIES_PER_CARD = 4;
const DECK_SIZE = 40;

/** Every card's `name` is unique across the catalog (named flavor cards and formulaic generic names never collide), so it's the simplest stable key for grouping deck copies against catalog entries - `catalogId` doesn't help here since raw catalog entries don't carry one (only deck-instantiated copies do), and `id` isn't stable across separate buildCardPool() calls for generic cards. */
function cardKey(card) {
  return card.name;
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
  const catalog = getCardCatalog();
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
  const catalog = getCardCatalog();
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

// ---- Shop: sell spare cards (owned but not currently in the deck) for G. EX rarity never sells. ----

function inDeckCountOf(key) {
  let count = 0;
  for (const card of currentCharacter.deckList || []) {
    if (cardKey(card) === key) count += 1;
  }
  return count;
}

function showShopScreen() {
  const catalog = getCardCatalog();
  const byKey = new Map(catalog.map((def) => [cardKey(def), def]));
  shopCurrency.textContent = `所持M: ${currentCharacter.m}`;
  shopList.replaceChildren();

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
}

shopBackButton.addEventListener('click', showHubScreen);

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
  appEl.classList.add('hidden');
  preGame.classList.remove('hidden');
  showHubScreen();
});
