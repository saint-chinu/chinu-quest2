import './style.css';
import { GameScene } from './scene.js';
import { createBoard } from './board.js';
import { Game } from './game.js';
import { CardType, CARD_COLOR, ELEMENT_LABEL } from './cards.js';

const canvas = document.getElementById('game-canvas');
const turnIndicator = document.getElementById('turn-indicator');
const currencyPanel = document.getElementById('currency-panel');
const logEl = document.getElementById('log');
const handPanel = document.getElementById('hand-panel');
const diceButton = document.getElementById('dice-button');
const purchaseModal = document.getElementById('purchase-modal');
const purchaseText = document.getElementById('purchase-text');
const purchaseYes = document.getElementById('purchase-yes');
const purchaseNo = document.getElementById('purchase-no');
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

function promptPurchase(tile) {
  return new Promise((resolve) => {
    purchaseText.textContent = `この土地を購入しますか？ (${tile.price}G)`;
    purchaseModal.classList.remove('hidden');

    function cleanup(result) {
      purchaseModal.classList.add('hidden');
      purchaseYes.removeEventListener('click', onYes);
      purchaseNo.removeEventListener('click', onNo);
      resolve(result);
    }
    function onYes() {
      cleanup(true);
    }
    function onNo() {
      cleanup(false);
    }
    purchaseYes.addEventListener('click', onYes);
    purchaseNo.addEventListener('click', onNo);
  });
}

function cardColor(card) {
  return card.type === CardType.MONSTER ? CARD_COLOR[card.element] : CARD_COLOR[card.type];
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

/** Center hand: whoever's turn it is, shown face-up (spell "use" only applies on the human's own turn). */
function renderCenterHand(hand, isCPU, spellUsable) {
  centerHandEl.replaceChildren();
  for (const card of hand) {
    const el = document.createElement('div');
    el.className = 'card';
    renderCardEl(el, card);

    const isSpell = card.type === CardType.SPELL;
    const canUseThis = !isCPU && isSpell && spellUsable;
    el.addEventListener('click', () => {
      showCardDetail(card, canUseThis ? () => game.useSpell(card) : null);
    });

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
const DICE_STOP_DELAY_MS = 1500;
// How long the locked face stays on screen before the roll actually proceeds.
const DICE_RESULT_HOLD_MS = 1000;

// idle -> (click) -> spinning -> (click) -> locking -> settles, holds, resolves
let diceState = 'idle';
let diceValue = 1;
let diceSpinTimer = null;

function resetDice() {
  clearInterval(diceSpinTimer);
  diceSpinTimer = null;
  diceState = 'idle';
  diceValue = 1;
  setDiceFace(diceValue);
}

resetDice();

function startDiceSpin() {
  diceState = 'spinning';
  diceSpinTimer = setInterval(() => {
    diceValue = (diceValue % 6) + 1;
    setDiceFace(diceValue);
  }, DICE_SPIN_INTERVAL_MS);
}

/**
 * Stops the spin DICE_STOP_DELAY_MS from now, landing on `forcedValue` if
 * given (CPU's predetermined roll) or whatever's currently showing
 * (the player's case). Holds the result on screen before resolving.
 */
function settleDiceSpin(forcedValue) {
  diceState = 'locking';
  return new Promise((resolve) => {
    setTimeout(() => {
      clearInterval(diceSpinTimer);
      diceSpinTimer = null;
      if (forcedValue !== undefined) diceValue = forcedValue;
      setDiceFace(diceValue);

      setTimeout(() => {
        diceState = 'idle';
        resolve(diceValue);
      }, DICE_RESULT_HOLD_MS);
    }, DICE_STOP_DELAY_MS);
  });
}

diceButton.addEventListener('click', () => {
  if (diceButton.disabled) return;

  if (diceState === 'idle') {
    startDiceSpin();
    return;
  }

  if (diceState === 'spinning') {
    settleDiceSpin().then((result) => game.rollDice(result));
  }
});

/** CPU's roll: same spin/settle/hold rhythm as the player's, just auto-triggered. */
function cpuRollDice() {
  const finalValue = Math.floor(Math.random() * 6) + 1;
  startDiceSpin();
  return settleDiceSpin(finalValue);
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
    currencyPanel.textContent = players
      .map((p) => `${p.name}: ${p.currency}G / 手札${p.handCount}枚`)
      .join('\n');
    renderHand(hand);

    const centerWasHidden = centerPanel.classList.contains('hidden');
    centerPanel.classList.toggle('hidden', !showCenter);
    if (showCenter) {
      if (centerWasHidden) resetDice();
      renderCenterHand(centerHand, currentPlayerIsCPU, !spellUsedThisTurn);
    }
  },
  onPurchasePrompt: promptPurchase,
  onCardReveal: promptCardReveal,
  onDiscardChoice: promptDiscardChoice,
  onSpellUse: promptSpellUse,
  onCpuRoll: cpuRollDice,
});

game.init();

function animate() {
  scene.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
