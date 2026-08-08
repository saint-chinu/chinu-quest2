import './style.css';
import { GameScene } from './scene.js';
import { createBoard } from './board.js';
import { Game } from './game.js';
import { CardType, CARD_COLOR, ELEMENT_LABEL } from './cards.js';

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
const landCommandModal = document.getElementById('land-command-modal');
const landCommandTitle = document.getElementById('land-command-title');
const landCommandSummon = document.getElementById('land-command-summon');
const landCommandLevelup = document.getElementById('land-command-levelup');
const landCommandInfo = document.getElementById('land-command-info');
const landCommandEnd = document.getElementById('land-command-end');
const monsterPickerModal = document.getElementById('monster-picker-modal');
const monsterPickerChoices = document.getElementById('monster-picker-choices');
const monsterPickerCancel = document.getElementById('monster-picker-cancel');
const confirmModal = document.getElementById('confirm-modal');
const confirmText = document.getElementById('confirm-text');
const confirmYes = document.getElementById('confirm-yes');
const confirmNo = document.getElementById('confirm-no');
const tileInfoModal = document.getElementById('tile-info-modal');
const tileInfoText = document.getElementById('tile-info-text');
const tileInfoClose = document.getElementById('tile-info-close');
const cardRevealModal = document.getElementById('card-reveal-modal');
const cardRevealCard = document.getElementById('card-reveal-card');
const discardModal = document.getElementById('discard-modal');
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

const TILE_TYPE_LABEL = { start: 'ゴール', land: '土地', event: 'チェックポイント' };

function tileSummaryText(tile) {
  const lines = [`【${TILE_TYPE_LABEL[tile.type]}】`];
  if (tile.type === 'land') {
    lines.push(`属性: ${ELEMENT_LABEL[tile.element]} / Lv${tile.level}`);
    lines.push(tile.ownerName ? `所有者: ${tile.ownerName}` : '所有者: なし');
    if (tile.unitName) lines.push(`配置モンスター: ${tile.unitName} (ATK${tile.unitAtk}/HP${tile.unitHp})`);
    lines.push(`通行料: ${tile.toll}G`);
  }
  return lines.join('\n');
}

function promptLandCommand(tile, { canSummon, canLevelUp }) {
  return new Promise((resolve) => {
    landCommandTitle.textContent = tileSummaryText(tile);
    landCommandSummon.disabled = !canSummon;
    landCommandLevelup.disabled = !canLevelUp;
    landCommandModal.classList.remove('hidden');

    function cleanup(result) {
      landCommandModal.classList.add('hidden');
      landCommandSummon.removeEventListener('click', onSummon);
      landCommandLevelup.removeEventListener('click', onLevelup);
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
    function onInfo() {
      cleanup('info');
    }
    function onEnd() {
      cleanup('end');
    }
    landCommandSummon.addEventListener('click', onSummon);
    landCommandLevelup.addEventListener('click', onLevelup);
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

const ACTION_LABEL = { summon: '召喚', invade: '侵略', swap: '入れ替え', levelup: 'レベルアップ' };

function promptConfirmAction({ actionType, card, cost, tile }) {
  return new Promise((resolve) => {
    const subject = card ? `「${card.name}」で` : '';
    const extra = actionType === 'levelup' && tile ? `（Lv${tile.level}→Lv${tile.level + 1}）` : '';
    confirmText.textContent = `${subject}${ACTION_LABEL[actionType]}${extra}しますか？ コスト${cost}G`;
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

function promptTileInfo(tile) {
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
      <div class="player-stat">召喚数 ${player.summonCount}</div>
    `;

    el.append(icon, lines);
  });
}

function renderCardEl(el, card) {
  el.style.background = cardColor(card);
  el.textContent = card.name;
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

let cardDetailUseHandler = null;

function showCardDetail(card, onUse) {
  renderCardEl(cardDetailCard, card);
  cardDetailText.textContent = describeCard(card);
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

function promptDiscardChoice(hand) {
  return new Promise((resolve) => {
    discardChoices.replaceChildren();
    for (const card of hand) {
      const el = document.createElement('div');
      el.className = 'card';
      renderCardEl(el, card);
      el.addEventListener('click', () => {
        discardModal.classList.add('hidden');
        resolve(card);
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

const scene = new GameScene(canvas);
const tiles = createBoard({ width: 6, height: 5 });
scene.buildBoard(tiles);

const game = new Game({
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
});

game.init();

function animate() {
  scene.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
