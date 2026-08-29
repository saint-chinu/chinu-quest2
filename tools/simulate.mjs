/**
 * ヘッドレスCPU vs CPU 対戦シミュレータ（デッキ勝率の計測用）。
 *
 *   npm run simulate -- --deckA=kawada --deckB=fusagikonda --map=kawada \
 *                       --games=50 --goal=13000 --start=500 --seed=1
 *
 * ⚠️ このツールはゲームバランスに対して読み取り専用。src/ の game.js /
 *    battle.js / battleCards.js / board.js には一切触らない
 *    （CLAUDE.md「⑬のバランス調整ループ」の制約: 基本ルール・盤面・
 *    勝利条件・カード効果は変えない）。ここでやるのは
 *    「描画とユーザー入力の代役を立てて、本番と同じエンジンを回す」だけ。
 *
 * 先代は scratchpad/pilotrun.mjs（未コミットで消失）と tools/sim-stage14.mjs
 * （主人公を手動操作する⑭専用ハーネス）。こちらは両者ともCPUなので、
 * 「人間の打ち筋」というバイアスが入らない代わりに、測れるのは
 * 「CPUのAIがそのデッキを回した時の強さ」であることに注意
 * （末尾の「◆ 数字の読み方」参照）。
 *
 * ── アドホックデッキ（--deckB=@path/to/deck.json）のフォーマット ──
 * CHARACTER_DECKS に無いデッキ（実プレイヤーのデッキ等）を渡す用。
 * カード名（またはカタログのキー）を並べたJSONで、次のどれでもよい:
 *
 *   ["ゆきおんな", "ゆきおんな", "水神の盾", "アイキャンフライ"]
 *
 *   { "name": "そらさんのデッキ",
 *     "elements": ["water"],          // 省略可。CPUの得意属性(aiProfile
 *                                     // .preferredElements)。省略時は
 *                                     // デッキのモンスター構成から推定。
 *     "cards": [
 *       { "name": "ゆきおんな", "count": 3 },
 *       { "name": "水神の盾",   "count": 2 },
 *       "アイキャンフライ"            // 文字列は count:1 と同じ
 *     ] }
 *
 * 名前は MONSTER_CATALOG / ITEM_CATALOG / SPELL_CATALOG の `name`
 * （日本語のカード名）か、そのカタログキー（例 "yukiOnna"）で引く。
 * 1枚でも解決できない名前があれば、**黙って落とさずその場でエラー終了**する
 * （枚数が減ったデッキで測った勝率は嘘になるため）。
 *
 * ── ブリード合成モンスター（「ブリモン」等） ──
 * プレイヤーが自作するのでカタログに無く、名前では引けない。装着パーツを
 * 渡すと、ゲーム本体と同じ breedParts.js の buildBreedCardDef で生成する
 * （ATK/HP/コスト上限とパーツ9個制限を canEquipPart で実際に検証するので、
 * ゲーム内で組めない構成はその場でエラーになる）:
 *
 *   { "breed": { "name": "ブリモン",
 *                "equippedPartIds": ["part-hyper-up", "part-pierce"],
 *                "partElements": { "part-element-patch": "thunder" } },
 *     "count": 1 }
 *
 * パーツIDは breedParts.js の BREED_PARTS 参照（--list-parts で一覧表示）。
 */
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── CLI ───────────────────────────────────────────────────────────────
const FLAGS = {};
for (const raw of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(raw);
  if (!m) { console.error(`不明な引数: ${raw}`); process.exit(2); }
  FLAGS[m[1]] = m[2] ?? 'true';
}
const num = (key, fallback) => (FLAGS[key] == null ? fallback : Number(FLAGS[key]));
const flag = (key) => FLAGS[key] === 'true' || FLAGS[key] === '1';

if (flag('help') || flag('h')) {
  console.log(`
使い方: npm run simulate -- [options]

  --deckA=<key|@file>   Aのデッキ。CHARACTER_DECKSのキー、または @path/to/deck.json
  --deckB=<key|@file>   Bのデッキ（同上）
  --map=<mapId>         board.jsのMAPSのid（例 kawada, royal-guard, hitode）
  --games=<n>           試合数（既定 50）
  --goal=<n>            goalCurrency（省略時はmapと同名のストーリーステージの値）
  --start=<n>           startingCurrency（同上、最終フォールバックは500）
  --seed=<n>            乱数シード（既定 1）。同じシード＝同じ出目・同じ結果
  --maxTurns=<n>        1試合の手番数上限（両者合計、既定 200）。超えたら打ち切り
  --timeout=<ms>        1試合の実時間上限（既定 60000）。超えたら打ち切り
  --nameA / --nameB     プレイヤー名。**AIの性格(aiProfiles.js)は名前で引く**
                        ので、既定は「そのデッキを使うストーリーキャラの名前」
  --elementsA/B=水,火   CPUの得意属性（water,fire,thunder,forest,neutral も可）
  --quiet               1試合ごとの進捗を出さない
  --dump=<n>            n試合目のログを全文出力する（デバッグ用）
  --list                使えるデッキキーとマップidを一覧して終了
`.trim());
  process.exit(0);
}

// ── モジュールのロード（three を含むのでViteのSSRローダを通す。
//    CLAUDE.md「テスト（ヘッドレス）」／tests/newCards.test.mjs と同じ作法） ──
globalThis.requestAnimationFrame = (cb) => setImmediate(() => cb(performance.now()));
globalThis.cancelAnimationFrame = () => {};

const vite = await createServer({
  root: PROJECT_ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const { createBoard, MAPS } = await vite.ssrLoadModule('/src/board.js');
const { Game } = await vite.ssrLoadModule('/src/game.js');
const { STORY_STAGES } = await vite.ssrLoadModule('/src/story.js');
const {
  CHARACTER_DECKS, buildCharacterCardList, MONSTER_CATALOG, ITEM_CATALOG, SPELL_CATALOG,
} = await vite.ssrLoadModule('/src/battleCards.js');
const { CardType, Element } = await vite.ssrLoadModule('/src/cards.js');
const {
  BREED_PARTS, BREED_BASE, buildBreedCardDef, canEquipPart, describeBreedPart,
} = await vite.ssrLoadModule('/src/breedParts.js');
const { speedState } = await vite.ssrLoadModule('/src/utils.js');
// 演出待ち（tween/delay）をほぼゼロにする。数値の意味は変わらない
// （待ち時間だけを縮めるので、判定・抽選の順序はそのまま）。
speedState.multiplier = 20000;

if (flag('list')) {
  console.log('CHARACTER_DECKS:', Object.keys(CHARACTER_DECKS).join(', '));
  console.log('MAPS:', MAPS.map((m) => m.id).join(', '));
  await vite.close();
  process.exit(0);
}

if (flag('list-parts')) {
  console.log(`ブリードの素体: ${BREED_BASE.element} ATK${BREED_BASE.atk}/HP${BREED_BASE.hp} ${BREED_BASE.cost}G`);
  for (const part of BREED_PARTS) {
    console.log(`  ${part.id.padEnd(28)} ${part.name.padEnd(12)} ${part.rarity}  ${describeBreedPart(part)}`);
  }
  await vite.close();
  process.exit(0);
}

/**
 * デッキJSONの `breed` エントリを実カードdefへ。パーツは1個ずつ
 * canEquipPart を通すので、上限超過や9個超えはゲーム内と同じ理由で弾かれる
 * （組めない構成のまま測ってしまうのを防ぐ）。
 */
function buildBreedDef(spec, side) {
  const bm = {
    name: spec.name || BREED_BASE.defaultName,
    equippedPartIds: [],
    partElements: { ...(spec.partElements || {}) },
  };
  for (const partId of spec.equippedPartIds || []) {
    const part = BREED_PARTS.find((p) => p.id === partId);
    if (!part) {
      console.error(`--deck${side}: 不明なブリードパーツID "${partId}"（--list-parts で一覧）`);
      process.exit(2);
    }
    const chk = canEquipPart(bm, part);
    if (!chk.ok) {
      console.error(`--deck${side}: ブリード構成がゲーム内で成立しない（"${part.name}" を装着できない）: ${chk.error}`);
      process.exit(2);
    }
    bm.equippedPartIds.push(partId);
  }
  return buildBreedCardDef({ breedMonsters: [bm], breedMonsterIndex: 0, breedImageDataUrl: '' });
}

// ── デッキ解決 ────────────────────────────────────────────────────────
/** duplicateForDeck（battleCards.js、非export）の等価物。catalogIdは能力引きに必須。 */
let adhocCounter = 0;
function duplicateForDeck(def, count) {
  const copies = [];
  for (let i = 0; i < count; i++) {
    adhocCounter += 1;
    copies.push({ ...def, id: `${def.id}-sim${adhocCounter}`, catalogId: def.id });
  }
  return copies;
}

const CATALOGS = [MONSTER_CATALOG, ITEM_CATALOG, SPELL_CATALOG];
const BY_NAME = new Map();
const BY_KEY = new Map();
for (const catalog of CATALOGS) {
  for (const [key, def] of Object.entries(catalog)) {
    BY_KEY.set(key, def);
    // 同名カードは存在しない前提だが、万一衝突したら最初の1つを採用する。
    if (!BY_NAME.has(def.name)) BY_NAME.set(def.name, def);
  }
}

/** ストーリーに登場する「そのデッキキーを使うキャラ」= 名前/色/属性/aiProfile の既定値。 */
const PERSONA_BY_DECK_KEY = new Map();
for (const stage of STORY_STAGES) {
  for (const variant of [stage, stage.replay, stage.secretReplay].filter(Boolean)) {
    const roster = [...(variant.opponents ?? []), variant.ally, variant.extraAlly].filter(Boolean);
    for (const who of roster) {
      if (who.deckKey && !PERSONA_BY_DECK_KEY.has(who.deckKey)) {
        PERSONA_BY_DECK_KEY.set(who.deckKey, {
          name: who.name,
          color: who.color ?? 0x888888,
          elements: who.theme?.elements ?? null,
          aiProfile: who.aiProfile ?? null,
        });
      }
    }
  }
}

const ELEMENT_ALIASES = {
  火: Element.FIRE, 水: Element.WATER, 雷: Element.THUNDER, 森: Element.FOREST, 無: Element.NEUTRAL, 無属性: Element.NEUTRAL,
  fire: Element.FIRE, water: Element.WATER, thunder: Element.THUNDER, forest: Element.FOREST, neutral: Element.NEUTRAL,
};
function parseElements(text) {
  if (!text) return null;
  return text.split(',').map((raw) => {
    const value = ELEMENT_ALIASES[raw.trim()];
    if (!value) { console.error(`不明な属性: ${raw}（火/水/雷/森/無 または fire/water/thunder/forest/neutral）`); process.exit(2); }
    return value;
  });
}

/** デッキのモンスター構成から得意属性を推定する（アドホックデッキの既定値）。 */
function inferElements(cardList) {
  const monsters = cardList.filter((c) => c.type === CardType.MONSTER && c.element !== Element.NEUTRAL);
  if (!monsters.length) return null;
  const counts = new Map();
  for (const m of monsters) counts.set(m.element, (counts.get(m.element) || 0) + 1);
  const threshold = monsters.length * 0.25;
  const picked = [...counts.entries()].filter(([, n]) => n >= threshold).sort((a, b) => b[1] - a[1]).map(([e]) => e);
  return picked.length ? picked : null;
}

/** @param {string} spec `<CHARACTER_DECKSのキー>` または `@path/to/deck.json` */
function resolveDeck(spec, side) {
  if (spec.startsWith('@')) {
    const file = path.resolve(process.cwd(), spec.slice(1));
    let parsed;
    try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
      console.error(`--deck${side}: ${file} を読めない/JSONとして壊れている: ${e.message}`);
      process.exit(2);
    }
    const entries = Array.isArray(parsed) ? parsed : parsed.cards;
    if (!Array.isArray(entries)) {
      console.error(`--deck${side}: ${file} はカード名の配列か {"cards":[...]} である必要がある`);
      process.exit(2);
    }
    const cards = [];
    const unresolved = [];
    for (const entry of entries) {
      const count = typeof entry === 'string' ? 1 : Math.max(1, Number(entry?.count) || 1);
      // ブリード合成モンスターはカタログに無いので、パーツから実カードを組む。
      if (entry && typeof entry === 'object' && entry.breed) {
        const def = buildBreedDef(entry.breed, side);
        console.log(`  ブリード生成: ${def.name} ${def.element} ATK${def.atk}/HP${def.hp} ${def.cost}G`
          + ` 特性=[${(def.traits || []).join(',') || 'なし'}] ×${count}`);
        cards.push(...duplicateForDeck(def, count));
        continue;
      }
      const name = typeof entry === 'string' ? entry : entry?.name ?? entry?.id;
      const def = BY_NAME.get(String(name).trim()) ?? BY_KEY.get(String(name).trim());
      if (!def) { unresolved.push(name); continue; }
      cards.push(...duplicateForDeck(def, count));
    }
    if (unresolved.length) {
      // 黙って落とすと枚数の減ったデッキで測ることになるので必ず落とす。
      console.error(`--deck${side}: カタログに無いカード名 ${unresolved.length}件 → ${[...new Set(unresolved)].join(' / ')}`);
      console.error('  （MONSTER_CATALOG / ITEM_CATALOG / SPELL_CATALOG の name かカタログキーで指定する。'
        + 'ブリード合成モンスターは名前ではなく "breed" エントリでパーツから組む - 先頭のコメント参照）');
      process.exit(2);
    }
    if (!cards.length) { console.error(`--deck${side}: ${file} にカードが1枚も無い`); process.exit(2); }
    return {
      label: `@${path.basename(file)}`,
      cards,
      name: FLAGS[`name${side}`] ?? parsed.name ?? `プレイヤー${side}`,
      elements: parseElements(FLAGS[`elements${side}`]) ?? parseElements((parsed.elements || []).join(',')) ?? inferElements(cards),
      color: side === 'A' ? 0x44aaff : 0xe4572e,
      aiProfile: null,
    };
  }
  if (!CHARACTER_DECKS[spec]) {
    console.error(`--deck${side}=${spec} は CHARACTER_DECKS に無い。使えるのは: ${Object.keys(CHARACTER_DECKS).join(', ')}`);
    process.exit(2);
  }
  const persona = PERSONA_BY_DECK_KEY.get(spec);
  return {
    label: spec,
    cards: buildCharacterCardList(spec),
    // CPUの性格は aiProfiles.js が「名前」で引く。既定はそのデッキの
    // 持ち主キャラの名前にして、本番のストーリー戦と同じAIを再現する。
    name: FLAGS[`name${side}`] ?? persona?.name ?? spec,
    elements: parseElements(FLAGS[`elements${side}`]) ?? persona?.elements ?? null,
    color: persona?.color ?? (side === 'A' ? 0x44aaff : 0xe4572e),
    aiProfile: persona?.aiProfile ?? null,
  };
}

const mapId = FLAGS.map ?? 'kawada';
if (!MAPS.some((m) => m.id === mapId)) {
  console.error(`--map=${mapId} は board.js の MAPS に無い。使えるのは: ${MAPS.map((m) => m.id).join(', ')}`);
  process.exit(2);
}
const stage = STORY_STAGES.find((s) => s.key === mapId) ?? null;
const goalCurrency = num('goal', stage?.goalCurrency ?? null);
const startingCurrency = num('start', stage?.startingCurrency ?? 500);
const deckA = resolveDeck(FLAGS.deckA ?? 'kawada', 'A');
const deckB = resolveDeck(FLAGS.deckB ?? 'fusagikonda', 'B');
const games = num('games', 50);
const seed = num('seed', 1);
const maxTurns = num('maxTurns', 200);
const timeoutMs = num('timeout', 60000);
const dumpIndex = FLAGS.dump != null ? Number(FLAGS.dump) : null;
if (deckA.name === deckB.name) deckB.name = `${deckB.name}(B)`;

// ── 乱数 ──────────────────────────────────────────────────────────────
function mulberry32(a) {
  return function next() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── scene.js の代役 ──────────────────────────────────────────────────
// game.js が実際に触るのは tile.mesh.material.color.set / player.mesh.position.set
// / tile.unitMesh くらい。それだけ本物と同じ「形」を持たせ、残りは何を呼ばれても
// meshを返すProxyで受け流す（tools/sim-stage14.mjs と同じ方式）。
const vec = () => ({ x: 0, y: 0, z: 0, set() {}, copy() {}, lerp() {}, clone() { return vec(); } });
const mesh = () => ({
  position: vec(), scale: vec(), rotation: vec(), userData: {}, visible: true,
  material: { color: { set() {} }, opacity: 1 }, add() {}, remove() {},
});
function makeScene(tiles) {
  const base = {
    focus: { x: 0, z: 0 },
    buildBoard(list) { for (const t of list) { t.mesh = mesh(); t.borderMesh = mesh(); } },
    createPiece: () => mesh(),
    createPieceFromImage: () => mesh(),
    createUnitIcon: () => mesh(),
    createOwnerLabel: () => mesh(),
    isOutsideSafeView: () => false,
    setFocusImmediate() {},
    panTo() {},
  };
  base.buildBoard(tiles);
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => mesh()) });
}

// ── 1試合 ────────────────────────────────────────────────────────────
const HUMAN_ONLY_CALLBACKS = [
  'onLandCommand', 'onPickMonsterCard', 'onConfirmAction', 'onPickLevelUp', 'onConfirmMove',
  'onPickBrowseTile', 'onLandSubmenu', 'onPickAbilityTarget', 'onPickTransformTarget',
  'onPickCardType', 'onChooseBranch', 'onPickMoveDirection', 'onPickElement', 'onShopPurchase',
  'onPickBattleItem', 'onDiscardChoice', 'onOfudaMarket', 'onPickDebtRecovery', 'onCardReveal',
];
/** 両者CPUなので人間用フックは呼ばれないはず。呼ばれたら記録して報告する（＝シミュの不忠実さの証拠）。 */
const humanCallbackHits = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOne(gameSeed, index) {
  const originalRandom = Math.random;
  Math.random = mulberry32(gameSeed);
  const logs = [];
  const t0 = Date.now();
  let game = null;
  let outcome = null;
  let error = null;
  try {
    const tiles = createBoard(mapId);
    const scene = makeScene(tiles);
    let settle = null;
    const finished = new Promise((resolve) => { settle = resolve; });

    const playerConfigs = [deckA, deckB].map((deck) => ({
      name: deck.name,
      isCPU: true, // ★ 両者CPU。人間の入力は一切要らない
      color: deck.color,
      allianceId: null,
      deckList: deck.cards,
      elements: deck.elements,
      aiProfile: deck.aiProfile,
      startingCurrency,
    }));

    const stub = (name) => async (...args) => {
      humanCallbackHits.set(name, (humanCallbackHits.get(name) || 0) + 1);
      // 形を間違えると _runLandCommand 等の for(;;) が回り続けて
      // ハーネスが無限ループする（tools/sim-stage14.mjs 冒頭の注意書き参照）。
      // 「何も選ばない/やめる」に相当する値を返して必ず抜けさせる。
      if (name === 'onLandCommand') return 'end';
      if (name === 'onLandSubmenu') return 'back';
      if (name === 'onConfirmAction' || name === 'onConfirmMove') return false;
      void args;
      return null;
    };

    game = new Game({
      tiles,
      mapId,
      scene,
      storyMode: true, // ★ これが無いと決着コールバックが飛ばない
      goalCurrency,
      playerConfigs,
      onLog: (m) => { if (logs.length < 20000) logs.push(m); },
      onStateChange: () => {},
      // CPUの出目。本番(main.jsのcpuRollDice)と同じ1〜6の一様乱数。
      onCpuRoll: async (forced) => forced ?? (1 + Math.floor(Math.random() * 6)),
      onGoalAchieved: async () => {},
      onBankruptcy: async () => {},
      onStoryBattleEnd: async (r) => {
        if (outcome) return;
        // 両者CPUなので r.won は常に false（won は「勝った陣営に人間がいるか」）。
        // 勝者は winnerPlayerId（目標総資産の達成）か alivePlayerIds（破産決着）で見る。
        const winnerId = Number.isInteger(r?.winnerPlayerId)
          ? r.winnerPlayerId
          : (r?.alivePlayerIds?.length === 1 ? r.alivePlayerIds[0] : null);
        outcome = { kind: winnerId == null ? 'draw' : 'win', winnerId };
        settle();
      },
    });
    // 未指定のフックを全て安全な既定値で埋める（未定義のまま呼ぶと
    // TypeErrorでその試合が異常終了する）。
    for (const key of Object.keys(game)) {
      if (!key.startsWith('on') || typeof game[key] === 'function') continue;
      game[key] = HUMAN_ONLY_CALLBACKS.includes(key) ? stub(key) : async () => {};
    }

    game.init(); // 以降は両者CPUなので、エンジンが自分でターンを回し続ける

    while (!outcome) {
      if (game.turnCount >= maxTurns) { outcome = { kind: 'turnCap', winnerId: null }; break; }
      if (Date.now() - t0 > timeoutMs) { outcome = { kind: 'timeout', winnerId: null }; break; }
      await Promise.race([finished, sleep(2)]);
    }
  } catch (e) {
    error = e;
  } finally {
    // 打ち切り時も含め、必ずこのGameの続きを止めてから次へ行く。放置すると
    // 前の試合のtween/delayが走り続け、共有しているMath.randomを食い合って
    // 再現性が壊れる（tools/sim-stage14.mjs で実際に踏んだ罠）。
    try { game?.cancel(); } catch { /* noop */ }
    Math.random = originalRandom; // 居残りの非同期処理には素の乱数を食わせる
    await sleep(30);
  }

  const assets = game
    ? game.players.map((p) => ({
      name: p.name,
      total: game._totalAssetsOf(p),
      currency: p.currency,
      lands: game.tiles.filter((t) => t.owner === p.id).length,
      laps: p.lapsCompleted ?? 0,
    }))
    : [];
  if (dumpIndex === index) console.log(`\n--- #${index} ログ全文 ---\n${logs.join('\n')}\n`);
  return {
    outcome: outcome ?? { kind: 'error', winnerId: null },
    error,
    turns: game?.turnCount ?? 0,
    seconds: (Date.now() - t0) / 1000,
    assets,
    logs,
  };
}

// ── 実行 ──────────────────────────────────────────────────────────────
process.on('unhandledRejection', (e) => { console.error('★unhandledRejection:', e?.stack || e); process.exit(2); });

const label = (deck, index) => `${deck.name}[${deck.label}] (P${index})`;
console.log('=== chinu-quest2 CPU vs CPU simulator ===');
console.log(`map=${mapId}  goal=${goalCurrency ?? '(なし)'}  start=${startingCurrency}  games=${games}  seed=${seed}  maxTurns=${maxTurns}`);
if (goalCurrency == null) {
  console.log('⚠️ goalCurrency未指定（このmapに同名のストーリーステージが無い）。'
    + '総資産による決着が起きず、破産か打ち切りでしか終わらない。--goal=<n> を渡すこと。');
}
console.log(`A: ${label(deckA, 0)}  ${deckA.cards.length}枚  得意属性=${deckA.elements?.join('/') ?? '(なし)'}`);
console.log(`B: ${label(deckB, 1)}  ${deckB.cards.length}枚  得意属性=${deckB.elements?.join('/') ?? '(なし)'}`);
console.log('');

const tally = { A: 0, B: 0, draw: 0, turnCap: 0, timeout: 0, error: 0 };
const turnCounts = [];
const assetSums = [[], []];
const failures = [];
const perGame = [];

for (let i = 0; i < games; i++) {
  // 試合ごとに独立した（しかしマスターシードから一意に決まる）乱数列。
  const gameSeed = (Math.imul(seed, 1000003) + i * 7919 + 1) | 0;
  const r = await runOne(gameSeed, i);
  let tag;
  if (r.error) {
    tally.error += 1;
    failures.push({ i, msg: r.error.message, tail: r.logs.slice(-6) });
    tag = 'ERR';
  } else if (r.outcome.kind === 'win') {
    const side = r.outcome.winnerId === 0 ? 'A' : 'B';
    tally[side] += 1;
    turnCounts.push(r.turns);
    r.assets.forEach((a, idx) => assetSums[idx].push(a));
    tag = side;
  } else {
    tally[r.outcome.kind] = (tally[r.outcome.kind] || 0) + 1;
    tag = r.outcome.kind === 'turnCap' ? 'CAP' : r.outcome.kind === 'timeout' ? 'T/O' : 'DRAW';
  }
  perGame.push(`${i}:${tag}:${r.turns}`);
  if (!flag('quiet')) process.stdout.write(`${i}:${tag}(${r.turns}T/${r.seconds.toFixed(1)}s) `);
}
if (!flag('quiet')) console.log('\n');

const decided = tally.A + tally.B;
const pct = (n) => (decided ? `${((n / decided) * 100).toFixed(1)}%` : 'n/a');
const avg = (list, pick) => (list.length ? (list.reduce((s, x) => s + pick(x), 0) / list.length) : 0);

console.log('──────── 結果 ────────');
console.log(`実施          ${games}試合（決着 ${decided} / 打ち切り ${tally.turnCap} / 時間切れ ${tally.timeout} / 引き分け ${tally.draw} / 異常 ${tally.error}）`);
console.log(`A ${deckA.name}[${deckA.label}]  ${tally.A}勝 ${tally.B}敗  勝率 ${pct(tally.A)}`);
console.log(`B ${deckB.name}[${deckB.label}]  ${tally.B}勝 ${tally.A}敗  勝率 ${pct(tally.B)}`);
if (turnCounts.length) {
  const sorted = [...turnCounts].sort((a, b) => a - b);
  console.log(`決着までの手番数（両者合計）平均 ${(turnCounts.reduce((s, n) => s + n, 0) / turnCounts.length).toFixed(1)} / 中央値 ${sorted[sorted.length >> 1]} / 最短 ${sorted[0]} / 最長 ${sorted.at(-1)}`);
}
for (const [idx, side] of [[0, 'A'], [1, 'B']]) {
  const rows = assetSums[idx];
  if (!rows.length) continue;
  console.log(`${side} ${rows[0].name}: 最終総資産 平均 ${avg(rows, (r) => r.total).toFixed(0)}G / 所持G ${avg(rows, (r) => r.currency).toFixed(0)} / 土地 ${avg(rows, (r) => r.lands).toFixed(1)}枚 / 周回 ${avg(rows, (r) => r.laps).toFixed(1)}`);
}
if (tally.turnCap || tally.timeout) {
  console.log(`※ 打ち切り${tally.turnCap}件・時間切れ${tally.timeout}件は勝敗に数えていない（分母は決着した${decided}試合）`);
}
if (humanCallbackHits.size) {
  console.log('※ 人間用コールバックが呼ばれた（本来CPU戦では起きない・結果が歪む可能性あり）:',
    [...humanCallbackHits.entries()].map(([k, v]) => `${k}×${v}`).join(', '));
}
if (failures.length) {
  console.log(`\n★異常終了 ${failures.length}件`);
  for (const f of failures.slice(0, 3)) console.log(`  #${f.i}: ${f.msg}\n    ${f.tail.join('\n    ')}`);
}
// 再現性の確認用: 同じ --seed なら必ず同じ署名になる。
console.log(`\nsignature ${createHash('sha1').update(perGame.join(',')).digest('hex').slice(0, 16)}  (seed=${seed} games=${games})`);

/*
 * ◆ 数字の読み方（正直な注意書き）
 * - 出るのは「そのデッキをCPUのAIが回した時」の勝率。人間の上手いプレイ
 *   （スペルコンボ・籠城など、CLAUDE.mdの⑬節にある「想定された攻略」）は
 *   CPUが打たないので、対人の実勝率とは別物。
 * - n=120未満の差は誤差（CLAUDE.md）。
 * - 描画・演出は全てスタブ。カメラ移動と待ち時間しか担っていないので判定には
 *   効かないが、演出フック(onSummonEffect等)へ渡していた cardImageUrl 等は
 *   一切渡していない。
 * - 打ち切り(turnCap/timeout)は勝敗の分母から外している。片方に有利な膠着が
 *   起きているとその分が消えるので、打ち切り件数が多い設定の勝率は要注意。
 * - 先攻はエンジンが毎試合抽選する（game.jsコンストラクタ）ので、A/Bの席順に
 *   よる先攻有利は付かない。ただしid順（Aがid 0）に依存する同着処理は残る。
 * - アドホックデッキのCPUは aiProfiles.js の DEFAULT_AI_PROFILE で戦う
 *   （名前がAI_PROFILESに無いため）。得意属性はデッキから推定した値。
 */
await vite.close();
process.exit(0);
