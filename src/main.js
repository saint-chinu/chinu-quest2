import './style.css';
import { GameScene } from './scene.js';
import { createBoard } from './board.js';
import { Game } from './game.js';
import { CardType, CARD_COLOR } from './cards.js';

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
const cardRevealOk = document.getElementById('card-reveal-ok');
const discardModal = document.getElementById('discard-modal');
const discardChoices = document.getElementById('discard-choices');

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

function renderHand(hand) {
  handPanel.replaceChildren();
  for (const card of hand) {
    const el = document.createElement('div');
    el.className = 'card';
    renderCardEl(el, card);
    handPanel.appendChild(el);
  }
}

function promptCardReveal(card) {
  return new Promise((resolve) => {
    renderCardEl(cardRevealCard, card);
    cardRevealModal.classList.remove('hidden');

    function onOk() {
      cardRevealModal.classList.add('hidden');
      cardRevealOk.removeEventListener('click', onOk);
      resolve();
    }
    cardRevealOk.addEventListener('click', onOk);
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

const scene = new GameScene(canvas);
const tiles = createBoard({ width: 6, height: 5 });
scene.buildBoard(tiles);

const game = new Game({
  tiles,
  scene,
  onLog: (message) => {
    logEl.textContent = message;
  },
  onStateChange: ({ turnText, canRoll, players, hand }) => {
    turnIndicator.textContent = turnText;
    diceButton.disabled = !canRoll;
    currencyPanel.textContent = players
      .map((p) => `${p.name}: ${p.currency}G / 手札${p.handCount}枚`)
      .join('\n');
    renderHand(hand);
  },
  onPurchasePrompt: promptPurchase,
  onCardReveal: promptCardReveal,
  onDiscardChoice: promptDiscardChoice,
});

diceButton.addEventListener('click', () => game.rollDice());

game.init();

function animate() {
  scene.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
