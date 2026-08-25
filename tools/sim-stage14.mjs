// ⑭「王都の番人？？」ヘッドレス通し検証。
//   cp tools/sim-stage14.mjs ./ && N=24 node sim-stage14.mjs
//   （viteの解決の都合でプロジェクト直下に置いて実行する。CLAUDE.md参照）
//
// 主人公は「定石プレイ」で自動操作する: 空き地は必ず取る／一撃で落とせる時
// だけ侵略／1ターン1段だけレベルアップ／スペルもアイテムもお札も使わない。
// 塞ぎ込んだ男は本番と同じAI。ここで出る敵側勝率は定石プレイに対する数字で、
// スペルを駆使する上手いプレイヤーに対してはCPUを過大評価している。
//
// ⚠️ エンジンのコールバックは「返す値」を間違えると無限ループになる。
//   ・onLandCommand は 'end' が返るまで for(;;) が回り続ける
//   ・onPickMonsterCard は id ではなくカードそのものを返す（nullで戻ると
//     メニューへ戻るので、同じ手を返し続けるとやはり無限ループ）
//   ・onChooseBranch は選択肢オブジェクトではなく tileId を返す
//   ・onPickDebtRecovery の引数は {tiles, ofuda, deficit}。形が合わないと
//     _resolveNegativeCurrency の while が continue し続ける
//   ・rollDice(steps) は出目を渡す（引数なしだと undefined マス進む）
//  全部このハーネスを書く過程で実際に踏んだ。真似する時は注意。
import { createServer } from 'vite';

globalThis.requestAnimationFrame = (cb) => setImmediate(() => cb(performance.now()));
globalThis.cancelAnimationFrame = () => {};

process.on('unhandledRejection', (e) => { console.log('★unhandledRejection:', e && e.stack || e); process.exit(2); });
process.on('uncaughtException', (e) => { console.log('★uncaughtException:', e && e.stack || e); process.exit(2); });
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { createBoard } = await vite.ssrLoadModule('/src/board.js');
const { Game } = await vite.ssrLoadModule('/src/game.js');
const { STORY_STAGES } = await vite.ssrLoadModule('/src/story.js');
const { buildCharacterCardList, buildStarterCardList } = await vite.ssrLoadModule('/src/battleCards.js');
const { speedState } = await vite.ssrLoadModule('/src/utils.js');
speedState.multiplier = 20000; // 演出待ちをほぼゼロにする

const stage = STORY_STAGES.find((s) => s.key === 'royal-guard');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// scene.jsの代役。tile.mesh/player.meshを実際に生やすところだけ本物と同じ形にする。
const vec = () => ({ x: 0, y: 0, z: 0, set() {}, copy() {}, lerp() {}, clone() { return vec(); } });
const mesh = () => ({ position: vec(), scale: vec(), rotation: vec(), userData: {}, visible: true,
  material: { color: { set() {} }, opacity: 1 }, add() {}, remove() {} });
function makeScene(tiles) {
  const base = {
    focus: { x: 0, z: 0 },
    buildBoard(list) { for (const t of list) { t.mesh = mesh(); t.borderMesh = mesh(); } },
    createPlayerPiece: () => mesh(),
    createUnitIcon: () => mesh(),
    createOwnerLabel: () => mesh(),
  };
  base.buildBoard(tiles);
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => mesh()) });
}

async function runOne(seed) {
  const origRandom = Math.random;
  Math.random = mulberry32(seed);
  const logs = [];
  let result = null;
  let error = null;
  const t0 = Date.now();
  let gameRef = null;
  try {
    const tiles = createBoard('royal-guard');
    // 分岐選択用の全点間距離（無向BFS）。
    const dist = tiles.map((src) => {
      const d = new Array(tiles.length).fill(99); d[src.id] = 0; const q = [src.id];
      for (let i = 0; i < q.length; i++) for (const n of tiles[q[i]].neighbors) if (d[n] === 99) { d[n] = d[q[i]] + 1; q.push(n); }
      return d;
    });
    const scene = makeScene(tiles);
    const game = new Game({
      tiles, mapId: 'royal-guard', scene,
      onLog: (m) => { if (logs.length < 20000) logs.push(m); },
      onStateChange: () => {},
      storyMode: true,
      goalCurrency: stage.goalCurrency,
      onStoryBattleEnd: (r) => { result = r ?? { won: null }; },
      playerConfigs: [
        { name: '主人公', isCPU: false, color: 0x44aaff, deckList: buildStarterCardList('fireForest'), startingCurrency: stage.startingCurrency },
        { name: stage.opponents[0].name, isCPU: true, color: stage.opponents[0].color,
          deckList: buildCharacterCardList(stage.opponents[0].deckKey),
          elements: stage.opponents[0].theme.elements, aiProfile: stage.opponents[0].aiProfile,
          startingCurrency: stage.startingCurrency },
      ],
      onCpuRoll: async (forced) => forced ?? (1 + Math.floor(Math.random() * 6)),
      // ★ 引数は「召喚可能なカードの配列」、戻り値は**カードそのもの**（idではない）。
      //    コスパ（(HP+ATK)/コスト）が一番良い札を出す。
      onPickMonsterCard: async (cards) => {
        if (!Array.isArray(cards) || !cards.length) return null;
        if (invadeTarget != null) {
          // 一撃で落とせる中で一番安い札。落とせないなら見送る（nullで侵略中止）。
          const killers = cards.filter((c) => c.atk >= invadeTarget).sort((a, b) => (a.cost || 0) - (b.cost || 0));
          return killers[0] ?? null;
        }
        const eff = (c) => (c.hp + c.atk) / Math.max(1, c.cost || 1);
        return cards.reduce((a, b) => (eff(a) >= eff(b) ? a : b));
      },
      onConfirmAction: async () => true,
      onPickLevelUp: async ({ options }) => options?.[0]?.targetLevel ?? null,
      // 定石プレイ: 空き地なら召喚、そうでなければ自分の土地を1段レベルアップ。
      // ★ _runLandCommand / _runLandBrowse は確定アクションかキャンセルが
      //    返るまで回り続けるので、必ずどこかで 'end' / null を返すこと。
      //    （nullを返し続けると無限ループになる＝最初にここで踏んだ罠）
      // ★ 召喚をキャンセル（onPickMonsterCardでnull）すると_runLandCommandの
      //    for(;;)がメニューへ戻る。ここで再び'summon'を返すと無限ループになる
      //    ので、1ターンに1回試したら必ず先へ進める。
      onLandCommand: async (summary, opts) => {
        invadeTarget = null;
        if (opts?.canSummon && summary?.type === 'land' && !summonTried) {
          summonTried = true;
          const me = game.players.find((p) => !p.isCPU);
          if (summary.ownerName == null) return 'summon';           // 空き地は必ず取る
          if (summary.ownerName !== me.name) {
            // 敵地: 一撃で守備を落とせる札があるときだけ侵略する。
            invadeTarget = (summary.unitHp ?? 0) + (summary.unitElementHpBonus ?? 0);
            return 'summon';
          }
        }
        if (!landActionDone && levelUpTarget()) return 'land';
        return 'end';
      },
      onPickBrowseTile: async () => {
        const t = levelUpTarget();
        landActionDone = true;
        return t ? t.id : null;
      },
      onLandSubmenu: async () => (landSubmenuUsed ? 'back' : ((landSubmenuUsed = true), 'levelup')),
      onPickBattleItem: async () => null,
      onDiscardChoice: async ({ hand }) => hand?.[0]?.id ?? null,
      // ★ 引数は {tiles, ofuda, deficit}。戻り値の形が合わないと
      //    _resolveNegativeCurrency の while が continue し続けて無限ループする。
      //    一番安い土地から売って返済する。
      onPickDebtRecovery: async ({ tiles: sellable }) => {
        if (!sellable?.length) return null;
        const cheapest = sellable.reduce((a, b) => ((a.salePrice ?? 0) <= (b.salePrice ?? 0) ? a : b));
        return { type: 'land', id: cheapest.id };
      },
      // ★ onChooseBranchは選択肢オブジェクトの配列を受け取り、tileIdを返す。
      //    オブジェクトをそのまま返すとthis.tiles[nextId]がundefinedになる。
      //    未通過CP（無ければゴール）へ最短で近づく枝を選ぶ＝定石の道順。
      onChooseBranch: async (opts) => {
        if (!Array.isArray(opts) || !opts.length) return null;
        const me = game.players.find((p) => !p.isCPU);
        const unpassed = tiles.filter((t) => t.type === 'event' && !me.passedCheckpoints.has(t.id)).map((t) => t.id);
        const aim = unpassed.length ? unpassed : tiles.filter((t) => t.type === 'start').map((t) => t.id);
        const scoreOf = (o) => Math.min(...aim.map((g) => dist[o.tileId]?.[g] ?? 99));
        return opts.reduce((best, o) => (scoreOf(o) < scoreOf(best) ? o : best)).tileId;
      },
      onPickMoveDirection: async (o) => (Array.isArray(o) && o.length ? (o[0]?.tileId ?? o[0]?.id ?? o[0]) : null),
      onShopPurchase: async () => null,
      onOfudaMarket: async () => null,
      onPickAbilityTarget: async (l) => (Array.isArray(l) && l.length ? l[0].id : null),
      onPickTransformTarget: async (l) => (Array.isArray(l) && l.length ? l[0].id : null),
      onPickCardType: async (l) => (Array.isArray(l) && l.length ? (l[0].id ?? l[0]) : null),
      onPickElement: async (l) => (Array.isArray(l) && l.length ? (l[0].id ?? l[0]) : null),
      onConfirmMove: async () => false,
    });
    gameRef = game;
    WATCH = () => `i=${seed} turn=${turns} busy=${game.isBusy} roll=${game.awaitingRoll} cur=${game.currentPlayer?.name} log=${logs.length} :: ${logs.at(-1)}`;
    for (const k of Object.keys(game)) {
      if (k.startsWith('on') && typeof game[k] !== 'function') game[k] = async () => {};
    }
    var turns = 0; let lastTrace = 0;
    let landActionDone = false, landSubmenuUsed = false, invadeTarget = null, summonTried = false;
    // 手番ごとにリセット（レベルアップは1ターン1回だけ試す）。
    const levelUpTarget = () => {
      const me = game.players.find((p) => !p.isCPU);
      const owned = game.tiles.filter((t) => t.owner === me.id && t.level < 5 && t.element !== 'neutral');
      const cost = { 2: 50, 3: 200, 4: 400, 5: 600 };
      return owned
        .filter((t) => me.currency >= cost[t.level + 1] + 150)
        .sort((a, b) => b.level - a.level)[0] ?? null;
    };
    game.init();
    // 駆動ループ。rollDiceはそのターンの処理が終わるまでのPromiseなので、
    // awaitで待てば二重発火もビジーウェイトも起きない（setIntervalで
    // 蹴っていた頃は、予約タイマーと重なって盤面が固まることがあった）。
    const cap = Number(process.env.CAP || 30000);
    while (!result) {
      if (Date.now() - t0 > cap) throw new Error(`${cap}msたっても決着しない（turn=${turns} log=${logs.length} 最後=${logs.at(-1)}）`);
      const p = game.currentPlayer;
      if (!game.isBusy && game.awaitingRoll && p && !p.isCPU) {
        turns += 1;
        landActionDone = false;
        landSubmenuUsed = false;
        summonTried = false;
        await game.rollDice(1 + Math.floor(Math.random() * 6));
      } else {
        await new Promise((r) => setTimeout(r, 1));
      }
    }
    result.turns = turns;
    result.seconds = ((Date.now() - t0) / 1000).toFixed(1);
    result.assets = game.players.map((p) => ({ name: p.name, total: game._totalAssetsOf(p), g: p.currency, lands: game.tiles.filter((t) => t.owner === p.id).length, laps: p.lapsCompleted ?? 0 }));
  } catch (e) {
    error = e;
  } finally {
    // 次の試合と非同期処理が混ざらないよう、必ず打ち切ってから戻す。
    // これをしないと前の試合のtween/delayが走り続け、共有しているMath.random
    // を食い合って再現性が壊れる（実際に途中でハングした）。
    try { gameRef?.cancel(); } catch { /* noop */ }
    await new Promise((r) => setTimeout(r, 30));
    Math.random = origRandom;
  }
  return { result, error, logs };
}

// 全体を見張る番人。ハングしても必ず状況を吐かせる。
let WATCH = null;
setInterval(() => { if (WATCH) console.log('[watch]', WATCH()); }, 3000).unref?.();

const games = Number(process.env.N || 20);
let heroWins = 0, done = 0;
const failures = [];
const turnCounts = [];
const spellUse = {};
const assetRows = [];
let ashTiles = 0, ashCasts = 0, ashMisfire = 0, ashGold = 0, zombieTotal = 0, zombieCasts = 0, horizonTiles = 0, horizonCasts = 0;
const oddities = new Map();
const START = Number(process.env.START || 0);
for (let i = START; i < START + games; i++) {
  const { result, error, logs } = await runOne(1000 + i * 7919);
  if (error) { failures.push({ i, msg: error.message, tail: logs.slice(-8) }); continue; }
  done += 1;
  if (result.won) heroWins += 1;
  turnCounts.push(result.turns);
  assetRows.push(result.assets);
  for (const line of logs) {
    const m = line.match(/「(灰塵|パンデミック|ホライズン|持たざる者|遅延行為|毒霧|1のダイス)」を使用/);
    if (m) spellUse[m[1]] = (spellUse[m[1]] || 0) + 1;
    const cash = line.match(/「灰塵」で(\d+)か所を換金し、合計(-?\d+)Gを得た/);
    if (cash) { ashGold += Number(cash[2]); ashTiles += Number(cash[1]); ashCasts += 1; }
    if (/灰塵は不発/.test(line)) ashMisfire += 1;
    const zom = line.match(/盤面の(\d+)体が/);
    if (zom) { zombieTotal += Number(zom[1]); zombieCasts += 1; }
    const lv = line.match(/領地がLv2に均された（(\d+)マス）/);
    if (lv) { horizonTiles += Number(lv[1]); horizonCasts += 1; }
    if (/対象が既にいません|効果がなかった|いなかった|できません|足りません/.test(line)) {
      oddities.set(line.replace(/[0-9]+/g, 'N'), (oddities.get(line.replace(/[0-9]+/g, 'N')) || 0) + 1);
    }
  }
  process.stdout.write(`${i}:${result.won ? '主' : '敵'}(${result.turns}T/${result.seconds}s) `);
  if (process.env.DUMP) { console.log('\n--- ログ全文 ---'); console.log(logs.join('\n')); }
}
console.log('\n');
console.log(`完走 ${done}/${games}  主人公の勝率 ${heroWins}/${done}`);
if (turnCounts.length) { turnCounts.sort((a, b) => a - b); console.log(`主人公のターン数 中央値${turnCounts[turnCounts.length >> 1]} 最短${turnCounts[0]} 最長${turnCounts.at(-1)}`); }
console.log('CPUのスペル使用（全試合合計）:', spellUse, '\n  1試合あたり: ' + Object.entries(spellUse).map(([k, v]) => `${k} ${(v / Math.max(1, done)).toFixed(2)}`).join(' / '));
if (assetRows.length) {
  for (const idx of [0, 1]) {
    const rows = assetRows.map((r) => r[idx]);
    const avg = (f) => (rows.reduce((s, r) => s + f(r), 0) / rows.length).toFixed(0);
    console.log(`${rows[0].name}: 最終総資産平均 ${avg((r) => r.total)}G / 所持G ${avg((r) => r.g)} / 土地 ${avg((r) => r.lands)}枚 / 周回 ${avg((r) => r.laps)}`);
  }
}
console.log(`灰塵: 成功${ashCasts}回 / 不発${ashMisfire}回、1回あたり ${(ashTiles / Math.max(1, ashCasts)).toFixed(1)}マスを換金して ${(ashGold / Math.max(1, ashCasts)).toFixed(0)}G（1試合 ${(ashGold / Math.max(1, done)).toFixed(0)}G）`);
console.log(`パンデミック 1回あたり ${(zombieTotal / Math.max(1, zombieCasts)).toFixed(1)}体をゾンビ化（${zombieCasts}回）`);
console.log(`ホライズン 1回あたり ${(horizonTiles / Math.max(1, horizonCasts)).toFixed(1)}マスを均す（${horizonCasts}回）`);
console.log('\n--- 気になるログ（空振り・不足など） ---');
for (const [k, v] of [...oddities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${v}回  ${k}`);
if (failures.length) {
  console.log(`\n★異常終了 ${failures.length}件`);
  for (const f of failures.slice(0, 3)) console.log(`  #${f.i}: ${f.msg}\n    ${f.tail.join('\n    ')}`);
}
await vite.close();
process.exit(0);
