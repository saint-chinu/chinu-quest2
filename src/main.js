import './style.css';
import { GameScene } from './scene.js';
import { createBoard } from './board.js';
import { Game } from './game.js';

const canvas = document.getElementById('game-canvas');
const turnIndicator = document.getElementById('turn-indicator');
const currencyPanel = document.getElementById('currency-panel');
const logEl = document.getElementById('log');
const diceButton = document.getElementById('dice-button');
const purchaseModal = document.getElementById('purchase-modal');
const purchaseText = document.getElementById('purchase-text');
const purchaseYes = document.getElementById('purchase-yes');
const purchaseNo = document.getElementById('purchase-no');

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

const scene = new GameScene(canvas);
const tiles = createBoard({ width: 6, height: 5 });
scene.buildBoard(tiles);

const game = new Game({
  tiles,
  scene,
  onLog: (message) => {
    logEl.textContent = message;
  },
  onStateChange: ({ turnText, canRoll, players }) => {
    turnIndicator.textContent = turnText;
    diceButton.disabled = !canRoll;
    currencyPanel.textContent = players.map((p) => `${p.name}: ${p.currency}G`).join('\n');
  },
  onPurchasePrompt: promptPurchase,
});

diceButton.addEventListener('click', () => game.rollDice());

game.init();

function animate() {
  scene.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
