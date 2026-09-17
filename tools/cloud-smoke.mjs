// Run after: npx wrangler dev --port 8791 --var DEV_ALLOW_UNVERIFIED_UID:1
// Local-only real WebSocket regression: stage 8, two humans, dice fixed at 5.
import assert from 'node:assert/strict';
import { buildCharacterDeckList } from '../src/battleCards.js';
const base = 'http://localhost:8791';
const config = {
  mapId: 'chin-harbor', goalCurrency: 1000,
  playerConfigs: [0, 1].map(i => ({ uid: `u${i}`, name: `Test${i}`, color: 0x112299,
    deckList: buildCharacterDeckList('hitode') })),
};
const response = await fetch(`${base}/api/rooms/987/start?uid=u0`, {
  method: 'POST', body: JSON.stringify(config),
});
assert.equal(response.status, 200, await response.text());
const sockets = [];
const queues = [Promise.resolve(), Promise.resolve()];
let checkedHostMove = false;
let hostSteps = 0;
let moveComplete = false;
let ended = false;
const timer = setTimeout(() => {
  console.error('WebSocket match timed out');
  process.exitCode = 1;
  for (const socket of sockets) socket.close();
}, 90000);
for (let i = 0; i < 2; i++) {
  const socket = new WebSocket(`ws://localhost:8791/ws?room=987&uid=u${i}`);
  sockets.push(socket);
  let state = {};
  let rollPending = false;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.t === 'state' || message.t === 'welcome') {
      state = { ...state, ...message.state };
      if (!state.awaitingRoll || state.currentPlayerId !== i) rollPending = false;
      if (state.currentPlayerId === i && state.awaitingRoll && !state.isBusy && !rollPending) {
        rollPending = true;
        socket.send(JSON.stringify({ t: 'action', action: { type: 'rollDice', steps: 5 } }));
      }
    }
    for (const event of message.events || []) {
      queues[i] = queues[i].then(async () => {
        // Model real animation latency, unlike the immediate-ACK core bots.
        await new Promise(resolve => setTimeout(resolve, event.type === 'pieceStep' ? 300 : 5));
        if (i === 0 && !checkedHostMove) {
          if (event.type === 'pieceStep' && event.payload.playerId === 0) hostSteps++;
          if (event.type === 'moveComplete' && hostSteps > 0) moveComplete = true;
          if (event.type === 'landCommand') {
            assert.equal(hostSteps, 5);
            assert.equal(moveComplete, true);
            checkedHostMove = true;
          }
        }
        let value = null;
        if (event.type === 'chooseBranch') value = event.payload[0]?.tileId;
        if (event.type === 'landCommand') value = 'end';
        if (event.type === 'landSubmenu') value = 'back';
        if (event.type === 'confirmMove' || event.type === 'confirmAction') value = false;
        if (socket.readyState === 1) socket.send(JSON.stringify({ t: 'ack', through: event.id,
          value: event.wantValue ? { id: event.id, v: value } : null }));
      }).catch(error => {
        console.error(error); process.exitCode = 1; clearTimeout(timer);
        for (const peer of sockets) peer.close();
      });
    }
    if (message.t === 'finished' && !ended) {
      ended = true;
      void Promise.all(queues).then(() => {
        clearTimeout(timer);
        assert.equal(checkedHostMove, true);
        console.log('PASS: stage 8 / two humans / host dice 5 / moveComplete / settled');
        for (const peer of sockets) peer.close();
      });
    }
  };
  socket.onerror = event => console.error('WebSocket error:', event.message);
}
