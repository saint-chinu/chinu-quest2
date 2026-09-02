// 新規カード（スペル4種・アイテム3種）の回帰テスト。
// game.js は scene.js 経由で three を読むので、直接importせずViteのSSR
// ローダを通す（CLAUDE.md「テスト（ヘッドレス）」参照）。Gameは
// Object.create(Game.prototype) の部分インスタンスにモックを載せて叩く。
//   npm run test:cards
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { ITEM_CATALOG, SPELL_CATALOG, MONSTER_CATALOG, buildCharacterCardList, isRewardOnlyCard, buildCharacterDeckList } = await vite.ssrLoadModule('/src/battleCards.js');
const { Game } = await vite.ssrLoadModule('/src/game.js');
const battle = await vite.ssrLoadModule('/src/battle.js');
const { TileType, MAPS, createBoard } = await vite.ssrLoadModule('/src/board.js');
const { STORY_STAGES } = await vite.ssrLoadModule('/src/story.js');
const { NPC_PORTRAIT_URL, NPC_TOKEN_URL } = await vite.ssrLoadModule('/src/npcArt.js');
// audio.jsはトップレベルでwindow.addEventListenerを呼ぶ（自動再生アンロック用）
// のでNode上ではそのままでは読めない。読み込む間だけ最小のwindowを差し込み、
// 直後に必ず消す（他モジュールのtypeof window判定を汚さないため）。
const hadWindow = 'window' in globalThis;
if (!hadWindow) globalThis.window = { addEventListener() {} };
const { TRACK_SRC, MAP_TRACK, SELECTABLE_BGM } = await vite.ssrLoadModule('/src/audio.js');
const { computePlayerSlots } = await vite.ssrLoadModule('/src/playerPanels.js');
const { CardType } = await vite.ssrLoadModule('/src/cards.js');
if (!hadWindow) delete globalThis.window;
const { WIP_CARD_NAMES, reclaimReleasedWipHoldings, getCardCatalog } = await vite.ssrLoadModule('/src/cardCatalog.js');
const breedParts = await vite.ssrLoadModule('/src/breedParts.js');
test.after(() => vite.close());

const mon = (name, hp, atk, extra = {}) => ({ id: name, name, element: 'fire', rarity: 'N', hp, atk, ...extra });
const unit = (def, ownerId) => battle.createFieldUnit(def, ownerId);
const makeTile = (id, over = {}) => ({
  id, type: TileType.LAND, element: 'fire', level: 1, price: 100, owner: null, unit: null,
  neighbors: [], position: { x: id, z: 0 }, ...over,
});

/** 盤面と参加者だけを載せた部分Game。お札市場は閉じておく（相場演出を挟まない）。 */
function makeStub(tiles, players) {
  const g = Object.create(Game.prototype);
  const logs = [];
  const effects = [];
  Object.assign(g, {
    tiles,
    players,
    hasOfuda: false,
    ofudaSettings: null,
    ofudaPressure: {},
    ofudaInitialCounts: {},
    scene: {},
    logs,
    effects,
    onLog: (m) => logs.push(m),
    _notifyState: () => {},
    onTargetEffect: async (p) => { effects.push(p); },
  });
  return g;
}

/** CPUの使用判断だけを見たいので、実際の詠唱は記録に差し替える。 */
function makeCpuStub(tiles, players) {
  const g = makeStub(tiles, players);
  const casts = [];
  Object.assign(g, {
    casts,
    _cpuCastSpell: async (player, card, cast) => {
      casts.push({ name: card.name, cast });
      player.spellUsedThisTurn = true;
    },
  });
  return g;
}
const spellCopy = (def) => ({ ...def, catalogId: def.id, id: `${def.id}-hand` });

test('破産すると土地だけでなく保有お札もすべて手放す', async () => {
  // 旧実装はお札を一切クリアしなかったため、_netWorthOfが「まだお札の
  // 価値がある」と評価し続け、実際には一度も現金化できないまま同じ
  // 保有枚数を抱えて即破産を繰り返せた（ユーザー報告のバグ）。
  const tile = makeTile(0, { owner: 'A', level: 3 });
  const startTile = makeTile(1, { type: TileType.START });
  const player = {
    id: 'A',
    name: 'テスト',
    currency: -9999,
    ofuda: { fire: 0, water: 20, thunder: 0, forest: 0 },
    ofudaAvgCost: { fire: 0, water: 15, thunder: 0, forest: 0 },
    homeGoalTileId: null,
  };
  const g = Object.create(Game.prototype);
  Object.assign(g, {
    tiles: [tile, startTile],
    hasOfuda: true,
    storyMode: false,
    mapId: 'some-map',
    scene: { updateTileLevelBorder: () => {} },
    onLog: () => {},
    onBankruptcy: async () => {},
    _notifyState: () => {},
    _repaintTileToElement: () => {},
  });
  await g._triggerBankruptcy(player);
  assert.deepEqual(player.ofuda, { fire: 0, water: 0, thunder: 0, forest: 0 });
  assert.deepEqual(player.ofudaAvgCost, { fire: 0, water: 0, thunder: 0, forest: 0 });
  assert.equal(player.currency, 500);
  assert.equal(tile.owner, null, '土地も同時に手放している');
});

test('呪い解除は増税通知(通行料30%減)も一緒に解除する', async () => {
  // 増税通知はカード自身が「通行料30%減の呪いをかける」と明言しているのに、
  // tollReductionRatioは土地側のプロパティでunit.cursesに乗らないため、
  // 呪い解除(cleanseCurses)でも鉄火の料理人系の全体回復+呪い解除でも
  // 解除できていなかった（ユーザー報告のバグ）。
  const tile = makeTile(0, { owner: 'A', tollReductionRatio: 0.3 });
  tile.unit = unit(mon('壁', 50, 10), 'A');
  const player = { id: 'A', name: 'テスト', diceCurse: null };
  const g = Object.create(Game.prototype);
  Object.assign(g, { tiles: [tile], onLog: () => {}, _notifyState: () => {} });
  await g._applySpellEffect(player, { effect: { type: 'cleanseCurses' }, target: 'ownMonster' }, { targetTileId: tile.id });
  assert.equal(tile.tollReductionRatio, null);
});

test('ワープ直後にバックファイア(後退)を使うと、ワープ入口を経てワープ前の経路を遡る', async () => {
  // _resolveWarpTileはplayer.tileIdをワープ先へ書き換えるが、tileHistory
  // （バックファイアの後退用の着地履歴）へワープ先を積み忘れていた。その結果
  // tileHistory[0]がワープ入口マスのまま取り残り、直後にバックファイアで
  // 後退させると「ワープが無かったことになり」ワープ前の経路をそのまま
  // 遡ってしまっていた（ユーザー報告のバグ）。
  const tiles = [];
  for (let i = 0; i <= 12; i += 1) tiles.push(makeTile(i));
  const link = (a, b) => { tiles[a].neighbors.push(b); tiles[b].neighbors.push(a); };
  link(0, 1); link(1, 2); link(2, 3); link(3, 4); link(4, 5); link(5, 6); link(6, 7);
  link(8, 9); link(9, 10); link(10, 11); link(11, 12);
  tiles[4].type = TileType.WARP;
  tiles[4].warpTargetId = 8;
  tiles[8].type = TileType.WARP;
  tiles[8].warpTargetId = 4;

  const g = Object.create(Game.prototype);
  const player = {
    id: 0, name: 'お肉', tileId: 3, previousTileId: 2, tileHistory: [3, 2, 1, 0], isCPU: true,
  };
  Object.assign(g, {
    tiles,
    players: [player],
    onLog: () => {},
    onWarpEffect: () => Promise.resolve(),
    onMoveDestination: () => {},
    onPieceMove: () => Promise.resolve(),
    _notifyState: () => {},
    _emitPieceStep: () => {},
    _stepWithCamera: async () => {},
  });

  // 3から1歩進んでワープ入口(4)へ着地する動きを模す（_movePlayerが行う処理）。
  player.previousTileId = player.tileId;
  player.tileId = 4;
  player.tileHistory.unshift(4);

  await g._resolveWarpTile(player, tiles[4]);
  assert.equal(player.tileId, 8, 'ワープ先(8)へ転移している');
  assert.deepEqual(player.tileHistory, [8, 4, 3, 2, 1, 0], 'ワープ先も着地履歴に積まれる');

  // バックファイアで1マス後退 → ワープ入口(4)へ戻る（ワープ前の3ではない）。
  await g._movePlayerBackward(player, 1);
  assert.equal(player.tileId, 4, 'ワープ先からの後退はまずワープ入口へ戻る');
});

test('分岐待ち中に破棄された旧盤面は着地処理や次ターンへ進まない', async () => {
  const g = Object.create(Game.prototype);
  let moveComplete = 0;
  let specialTile = 0;
  let landCommand = 0;
  let nextTurn = 0;
  Object.assign(g, {
    _isCancelled: false,
    storyEnded: false,
    isBusy: false,
    awaitingRoll: true,
    tutorialMode: false,
    players: [{ id: 0, name: '主人公', diceCurse: null, isCPU: false }],
    currentPlayerIndex: 0,
    onLog: () => {},
    onDiceResult: async () => {},
    _notifyState: () => {},
    // ステージ13中央2マス目の分岐で、旧盤面を閉じた状況を再現する。
    // 実画面ではcancelAllActivePromptsが選択Promiseをnullで解決する。
    _movePlayer: async () => { g.cancel(); },
    onMoveComplete: () => { moveComplete += 1; },
    _resolveSpecialTile: async () => { specialTile += 1; },
    _runLandCommand: async () => { landCommand += 1; },
    _resolveNegativeCurrency: async () => {},
    _nextTurn: () => { nextTurn += 1; },
    _beginTurn: async () => {},
  });

  await g.rollDice(4);
  assert.equal(moveComplete, 0);
  assert.equal(specialTile, 0);
  assert.equal(landCommand, 0);
  assert.equal(nextTurn, 0);
});

test('新カードはカタログに載り、参照している画像が実在する', () => {
  // 画像が404だと <img> がbroken化し、drawImageのInvalidStateErrorが
  // 召喚処理のawait連鎖を壊して盤面が固まる（CLAUDE.md参照）。
  // imageDataUrlが指す先が本当にpublic/にあるかまで見る。
  const cards = [
    ...['russianRoulette', 'diamondShield', 'satsutabaGuard'].map((id) => [id, ITEM_CATALOG[id]]),
    ['bombBokkuri', MONSTER_CATALOG.bombBokkuri],
    ['ryanmenSukuna', MONSTER_CATALOG.ryanmenSukuna],
    ['kugutsuNoKengou', MONSTER_CATALOG.kugutsuNoKengou],
    ...['funenGolem', 'gyakuryuKajiki', 'karekiNoKyojin', 'bousouCoil'].map((id) => [id, MONSTER_CATALOG[id]]),
    ...['hinokoSlime', 'mizutamariNamazu', 'morikakeRisu', 'taidenMimizu',
      'honooNoMadoushi', 'yukiOnna', 'accelerPopper', 'nitron', 'nazoNoKyotou', 'dennouNoKaii']
      .map((id) => [id, MONSTER_CATALOG[id]]),
    ...['kotai', 'pandemic', 'horizon', 'delayTactics', 'ashToDust', 'landlessOne',
      'tochigamiNoIkari', 'shakaiFutekigou'].map((id) => [id, SPELL_CATALOG[id]]),
  ];
  for (const [id, card] of cards) {
    assert.ok(card, `${id} がカタログにない`);
    if (card.imageDataUrl == null) continue; // cardArt.jsの共通絵へ落とす運用もあり
    const rel = card.imageDataUrl.replace(/^\/+/, '');
    const file = new URL(`../public/${rel}`, import.meta.url);
    assert.ok(existsSync(file), `${id} の画像 ${card.imageDataUrl} が public/ に無い`);
  }
  assert.equal(ITEM_CATALOG.diamondShield.atkBonus, -20);
  assert.equal(ITEM_CATALOG.diamondShield.hpBonus, 60);
  assert.ok(ITEM_CATALOG.diamondShield.traits.includes('lastStrike'));
  assert.equal(SPELL_CATALOG.tochigamiNoIkari.imageDataUrl, null, '専用絵が無い土地神の怒りは共通スペル絵へフォールバックする');
  assert.equal(SPELL_CATALOG.shakaiFutekigou.imageDataUrl, null, '専用絵が無い社会不適合は共通スペル絵へフォールバックする');
  // 属性神の盾4種は2026-09に専用絵が用意された（それまではnullで共通アイテム絵へ
  // フォールバックしていた）。上のループが public/ に実在するかまで見ている。
  for (const id of ['suijinNoTate', 'kajinNoTate', 'raijinNoTate', 'shinrinjinNoTate']) {
    assert.match(ITEM_CATALOG[id].imageDataUrl, new RegExp(`/images/card-art/${id}\\.png$`),
      `${id}は専用絵を参照する`);
  }
});

test('甲鉄要塞は公開済みで、成長型の未公開は無属性だけ', () => {
  assert.equal(MONSTER_CATALOG.koutetsuYousai.wip, undefined);
  assert.deepEqual(WIP_CARD_NAMES, ['積み上がった伝票']);
  // 2026-08追加後は4属性ともN/S/Rが13/9/6で揃う（無属性だけ別枠）。
  const expected = { fire: [13, 9, 6], water: [13, 9, 6], thunder: [13, 9, 6], forest: [13, 9, 6] };
  for (const element of ['fire', 'water', 'thunder', 'forest']) {
    const live = Object.values(MONSTER_CATALOG)
      .filter((c) => c.element === element && !c.wip && !c.npcExclusive);
    const n = (r) => live.filter((c) => c.rarity === r).length;
    assert.deepEqual([n('N'), n('S'), n('R')], expected[element], `${element}の枚数が揃っていない`);
  }
});

test('公開されたwipカードは退避分が所持へ戻り、再ログインしても増えない', () => {
  const character = {
    ownedCards: { ナイフ: 2 },
    // 甲鉄要塞=公開された / 積み上がった伝票=まだ未公開 / 溶鉱炉=改名で廃止
    wipCardHoldings: { 甲鉄要塞: 3, 積み上がった伝票: 2, 溶鉱炉: 4 },
  };
  assert.equal(reclaimReleasedWipHoldings(character), true);
  assert.equal(character.ownedCards.甲鉄要塞, 3, '公開済みは所持へ戻る');
  assert.equal(character.ownedCards.溶鉱炉, undefined, '廃止カードは復活しない');
  assert.deepEqual(character.wipCardHoldings, { 積み上がった伝票: 2 }, '未公開分は退避したまま');

  // 2回目以降は何も起きない（＝ログインのたびに増殖しない）。
  assert.equal(reclaimReleasedWipHoldings(character), false);
  assert.equal(character.ownedCards.甲鉄要塞, 3);
});

test('既に持っている枚数のほうが多ければ、退避分で減らさない', () => {
  const character = { ownedCards: { 甲鉄要塞: 5 }, wipCardHoldings: { 甲鉄要塞: 3 } };
  reclaimReleasedWipHoldings(character);
  assert.equal(character.ownedCards.甲鉄要塞, 5);
  assert.equal(character.wipCardHoldings, undefined, '空になった記録は消す');
});

test('塞ぎ込んだ男の固定デッキは指定札を含む40枚', () => {
  const cards = buildCharacterCardList('fusagikonda');
  const count = (id) => cards.filter((card) => (card.catalogId || card.id) === id).length;
  assert.equal(cards.length, 40);
  assert.equal(count('ashToDust'), 2);
  assert.equal(count('pandemic'), 3);
  assert.equal(count('horizon'), 2);
  assert.equal(count('landlessOne'), 1);
  assert.equal(count('shinkenShirahadori'), 1);
  assert.equal(count('poisonMist'), 2);
  assert.equal(count('delayTactics'), 2);
  assert.equal(count('diceOne'), 2);
  assert.equal(count('thunderbird'), 4);
  assert.equal(count('denchuwoUeruOtoko'), 4);
  assert.equal(count('battleTrain'), 2);
  assert.equal(count('sacrificeCar'), 2);
  assert.equal(count('bombBokkuri'), 4);
  assert.equal(count('psychokinesis'), 1);
  assert.equal(count('backfire'), 2);
  assert.equal(count('senbonZakura'), 1);
  assert.equal(count('tetsuo'), 0);
});

test('ステージ14は専用マップ・会話・塞ぎ込んだ男へ正しく接続されている', () => {
  const stage = STORY_STAGES.find((entry) => entry.key === 'royal-guard');
  const map = MAPS.find((entry) => entry.id === 'royal-guard');
  assert.ok(stage && map);
  assert.equal(stage.title, '⑭ 王都の番人？？'); // 2026-08、ユーザー指定で本実装扱いにし「（仮公開）」を外した
  assert.equal(stage.opponents[0].deckKey, 'fusagikonda');
  assert.equal(stage.opponents[0].name, '塞ぎ込んだ男');
  assert.equal(map.rows.join('').split('C').length - 1, 1, 'CPは1か所');
  for (const symbol of ['F', 'W', 'M', 'T']) {
    assert.equal(map.rows.join('').split(symbol).length - 1, 9, `${symbol}属性は9マス`);
  }
  assert.equal(map.rows.join('').split('N').length - 1, 3, '無属性は3マス');
});

test('ステージ専用のEXスペルはショップマスの品揃えに並ばない', () => {
  // _resolveShopTileは getCardCatalog() から !isRewardOnlyCard のカードを
  // 抽選し、card.cost をそのまま請求する（ショップマスは①と⑩にある）。
  // EXは強力なうえ安いので、rewardOnlyを付け忘れると実質バグ価格になる。
  const sellable = getCardCatalog().filter((c) => c.cost != null && !isRewardOnlyCard(c));
  const leakedEx = sellable.filter((c) => c.rarity === 'EX').map((c) => `${c.name}(${c.cost}G)`);
  assert.ok(!leakedEx.includes('灰塵(100G)'), `灰塵がショップに並んでいる: ${leakedEx.join(', ')}`);
  assert.equal(isRewardOnlyCard(SPELL_CATALOG.ashToDust), true);
  // 専用デッキはSPELL_CATALOGを直接見るので、rewardOnlyでも積める。
  assert.equal(buildCharacterCardList('fusagikonda').filter((c) => (c.catalogId || c.id) === 'ashToDust').length, 2);
});

test('灰塵は自分の無属性モンスター土地だけを全て200%換金する', async () => {
  const ownNeutral = makeTile(0, { owner: 'A' });
  ownNeutral.unit = unit({ ...mon('無色', 20, 20), element: 'neutral' }, 'A');
  const ownFire = makeTile(1, { owner: 'A' });
  ownFire.unit = unit(mon('火', 20, 20), 'A');
  const enemyNeutral = makeTile(2, { owner: 'B' });
  enemyNeutral.unit = unit({ ...mon('敵無色', 20, 20), element: 'neutral' }, 'B');
  const players = [{ id: 'A', name: 'ア', currency: 0 }, { id: 'B', name: 'イ', currency: 0 }];
  const g = makeStub([ownNeutral, ownFire, enemyNeutral], players);
  const cashed = [];
  g._cashOutOwnLand = async (player, tile, multiplier) => {
    cashed.push({ tileId: tile.id, multiplier });
    player.currency += 200;
  };
  await g._applySpellEffect(players[0], SPELL_CATALOG.ashToDust, {});
  assert.deepEqual(cashed, [{ tileId: 0, multiplier: 2 }]);
});

test('持たざる者は土地0でゴールした時だけ500Gを渡して解除する', async () => {
  const player = {
    id: 'A', name: 'ア', currency: 100, landlessGoalBonus: 0, lapsCompleted: 0,
    passedCheckpoints: new Set(), lotteryOnNextGoal: false,
  };
  const g = makeStub([makeTile(0)], [player]);
  g.requireAllCheckpoints = false;
  g._healOwnedUnitsOnLap = () => {};
  g._computeLapBonus = () => ({ base: 0, land: 0, ofuda: 0, total: 0 });
  g.onGoalBonus = async () => {};
  g._growLapUnitsOnLap = async () => {};
  g._maybeTradeOfudaAtGoal = async () => {};
  g._checkGoalAchievement = async () => false;
  await g._applySpellEffect(player, SPELL_CATALOG.landlessOne, { targetPlayerId: 'A' });
  assert.equal(player.landlessGoalBonus, 500);
  await g._grantGoalBonus(player);
  assert.equal(player.currency, 600);
  assert.equal(player.landlessGoalBonus, 0);
});

test('塞ぎ込んだ男AIは灰塵を最優先し、次にホライズン、6体でパンデミック', async () => {
  const makeOwned = (count, level = 2, zombie = true) => Array.from({ length: count }, (_, id) => {
    const tile = makeTile(id, { owner: 'A', level });
    tile.unit = unit(zombie ? MONSTER_CATALOG.zombie : MONSTER_CATALOG.tetsuo, 'A');
    return tile;
  });
  const comboHand = ['ashToDust', 'horizon', 'pandemic', 'landlessOne'].map((id) => spellCopy(SPELL_CATALOG[id]));
  const ashPlayer = { id: 'A', name: '塞ぎ込んだ男', currency: 1000, spellUsedThisTurn: false, hand: comboHand, landlessGoalBonus: 0 };
  // 閾値は7→5に緩和済み（2026-08）。境界の5マスで発動することを確認する。
  const ashGame = makeCpuStub(makeOwned(5, 2, true), [ashPlayer]);
  await ashGame._cpuMaybeUseFusagikondaCombo(ashPlayer);
  assert.equal(ashGame.casts[0].name, '灰塵');

  // 灰塵の効果自体はLv2を要求しない（地価そのままで換金するだけ）ので、
  // AI側の「全部同時にLv2」という発動条件も撤去済み（2026-08）。
  // レベルがバラついていても5マス以上あれば発動することを確認する
  // （プレイヤーの奪還・新規空き地の確保でLv1が混ざっても発動が
  // 事実上死なないようにするための修正）。
  const mixedLevelTiles = makeOwned(5, 2, true);
  mixedLevelTiles[0].level = 1;
  mixedLevelTiles[1].level = 1;
  const mixedPlayer = { ...ashPlayer, spellUsedThisTurn: false, hand: comboHand };
  const mixedGame = makeCpuStub(mixedLevelTiles, [mixedPlayer]);
  await mixedGame._cpuMaybeUseFusagikondaCombo(mixedPlayer);
  assert.equal(mixedGame.casts[0].name, '灰塵');

  // ゾンビ(無属性)が5体未満ならまだ灰塵の対象外なので、7体所有かつ
  // 未レベルアップ(Lv1)ならホライズンが選ばれる。
  const horizonPlayer = { ...ashPlayer, spellUsedThisTurn: false, hand: comboHand };
  const horizonGame = makeCpuStub(makeOwned(7, 1, false), [horizonPlayer]);
  await horizonGame._cpuMaybeUseFusagikondaCombo(horizonPlayer);
  assert.equal(horizonGame.casts[0].name, 'ホライズン');

  const pandemicPlayer = { ...ashPlayer, spellUsedThisTurn: false, hand: comboHand };
  const pandemicGame = makeCpuStub(makeOwned(6, 1, false), [pandemicPlayer]);
  await pandemicGame._cpuMaybeUseFusagikondaCombo(pandemicPlayer);
  assert.equal(pandemicGame.casts[0].name, 'パンデミック');
});

test('ボムボックリは死因を問わず空き地にボックリを2体召喚し、空き地切れで打ち切る', async () => {
  const meshTile = (id) => makeTile(id, { mesh: { material: { color: { set: () => {} } } } });
  const player = { id: 'A', name: 'ア', currency: 0, toughnessTurnsRemaining: 0 };

  const tiles = [meshTile(0), meshTile(1), meshTile(2)];
  const g = makeStub(tiles, [player]);
  g._deadMonstersThisMatch = [];
  await g._handleUnitDeath(unit(MONSTER_CATALOG.bombBokkuri, 'A'), player);
  const bokkuriTiles = tiles.filter((t) => (t.unit?.def?.catalogId || t.unit?.def?.id) === 'bokkuri');
  assert.equal(bokkuriTiles.length, 2);
  for (const t of bokkuriTiles) {
    assert.equal(t.unit.def.name, 'ボックリ');
    assert.equal(t.owner, 'A');
  }

  // 空き地が1つしか無ければ1体で打ち切り（例外を投げず、2体目は不発）。
  const oneEmpty = [meshTile(10)];
  const g2 = makeStub(oneEmpty, [player]);
  g2._deadMonstersThisMatch = [];
  await g2._handleUnitDeath(unit(MONSTER_CATALOG.bombBokkuri, 'A'), player);
  assert.equal(oneEmpty.filter((t) => t.unit).length, 1);
});

test('ボムボックリの捨て駒運用: アイテム未装備・侵略見送りの代替・強制売却で最優先', async () => {
  const g = Object.create(Game.prototype);
  // sacrificeWithoutItemを立てたユニットにはCPUが何も装備しない。
  const marked = unit(MONSTER_CATALOG.bombBokkuri, 'A');
  marked.def = { ...marked.def, sacrificeWithoutItem: true };
  assert.equal(g._cpuChooseBattleItem({ hand: [] }, marked, null, null, false), null);

  // 勝てるカードが無い（見送り）状況の代替として、手札にあれば必ず使う。
  const bombCard = { ...MONSTER_CATALOG.bombBokkuri, id: 'bomb-hand', catalogId: 'bombBokkuri' };
  const decision = g._cpuMaybeSacrificeBombBokkuri([bombCard]);
  assert.equal(decision.card.sacrificeWithoutItem, true);
  assert.equal(g._cpuMaybeSacrificeBombBokkuri([]), null);

  // 一時フラグは捨て札へ残さず、再ドロー後の通常戦闘では装備可能に戻す。
  let discarded = null;
  g._discardUsedCard({ deck: { discard: (card) => { discarded = card; } } }, decision.card);
  assert.equal(discarded.sacrificeWithoutItem, undefined);
});

test('塞ぎ込んだ男はCP・ゴール最短が同点なら左下ループの空き地を優先する', () => {
  const g = Object.create(Game.prototype);
  const ordinary = makeTile(1, { owner: null });
  const loopNear = makeTile(2, { owner: null, fusagikondaLoop: true, price: 100 });
  const loopFar = makeTile(3, { owner: null, fusagikondaLoop: true, price: 200 });
  g.tiles = [ordinary, loopNear, loopFar];
  g._affordableMonsterCards = () => [{ ...MONSTER_CATALOG.bombBokkuri, id: 'bomb-hand', catalogId: 'bombBokkuri' }];
  g._forwardTileDistance = (_from, _previous, target) => (target === loopFar.id ? 4 : 2);
  g._landValueOfTile = (tile) => tile.price;

  assert.equal(g._nearestFusagikondaLoopEmptyLandTileId({ tileId: 0, previousTileId: null }), loopNear.id);
  loopNear.owner = 'enemy';
  assert.equal(g._nearestFusagikondaLoopEmptyLandTileId({ tileId: 0, previousTileId: null }), loopFar.id);
});

test('アリジゴクの詠唱者がid=0でも、forcedStopCursedのtruthy判定崩れで無視されない', () => {
  // player.idは0始まりなので、forcedStopCursedへ詠唱者id(0)が入ると
  // 素朴な!!/if(tile.forcedStopCursed)判定は「呪い無し」と誤認する
  // (_isForcedStopCursedが無い旧実装の再発防止)。
  const cursedByHuman = makeTile(1, { forcedStopCursed: 0 });
  const cursedByShrine = makeTile(2, { forcedStopCursed: true });
  const uncursed = makeTile(3, {});
  const clearedFlag = makeTile(4, { forcedStopCursed: false });
  const g = Object.create(Game.prototype);
  assert.equal(g._isForcedStopCursed(cursedByHuman), true);
  assert.equal(g._isForcedStopCursed(cursedByShrine), true);
  assert.equal(g._isForcedStopCursed(uncursed), false);
  assert.equal(g._isForcedStopCursed(clearedFlag), false);
});

test('サイコキネシスのアリジゴク対策は、詠唱者id=0の土地でも最優先で選ぶ', async () => {
  const antlionUnit = unit(mon('弱い見張り', 10, 1), 0);
  const decoyUnit = unit(mon('育った壁', 200, 20), 0);
  // アリジゴクが張られた土地はLv1・低地価だが、詠唱者(人間側=id 0)が
  // かけたものなので forcedStopCursed には player.id である 0 が入る。
  const antlionSource = makeTile(1, { owner: 0, unit: antlionUnit, level: 1, price: 100, forcedStopCursed: 0 });
  // おとりは通常のスコア計算だけならこちらが勝つ高レベル・高地価の土地。
  const decoySource = makeTile(2, { owner: 0, unit: decoyUnit, level: 5, price: 500 });
  const destA = makeTile(10, { owner: 1, unit: unit(mon('自軍地', 50, 5), 1) });
  const destB = makeTile(11, { owner: 1, unit: unit(mon('自軍地2', 50, 5), 1) });

  const player = {
    id: 1,
    name: '塞ぎ込んだ男',
    currency: 1000,
    spellUsedThisTurn: false,
    aiProfile: { psychokinesisTargetAntlion: true },
    hand: [spellCopy(SPELL_CATALOG.psychokinesis)],
  };
  const humanOwner = { id: 0, name: 'human' };

  const g = makeCpuStub([antlionSource, decoySource, destA, destB], [player, humanOwner]);
  g._moveCommandCandidates = (source) => [{ tile: source === antlionSource ? destA : destB }];
  g._estimateUnitBattleWinProbability = () => 0.1;
  g._elementHpBonus = () => 0;
  g._landValueOfTile = (tile) => tile.price;

  await g._cpuMaybeUsePsychokinesisSpell(player);
  assert.equal(g.casts.length, 1);
  assert.equal(g.casts[0].cast.targetTileId, antlionSource.id, 'アリジゴク済みの土地を最優先で剥がすべき');
});

test('ロシアンルーレットはステータスを無視して出目だけで決まる', () => {
  let attackerWins = 0;
  let defenderWins = 0;
  let mutual = 0;
  for (let i = 0; i < 4000; i++) {
    const a = unit(mon('弱者', 10, 10), 'A');
    const d = unit(mon('強者', 100, 100), 'D');
    battle.equipItem(a, ITEM_CATALOG.russianRoulette);
    const r = battle.resolveBattle(a, d, new battle.GoldLedger());
    assert.ok(!(r.attackerSurvived && r.defenderSurvived), '両者生存はありえない');
    if (r.attackerSurvived) attackerWins += 1;
    else if (r.defenderSurvived) defenderWins += 1;
    else mutual += 1;
  }
  const total = attackerWins + defenderWins + mutual;
  // 出目勝負なので 15/36 : 15/36 : 6/36。ステータス差は一切効かない。
  assert.ok(attackerWins / total > 0.35 && attackerWins / total < 0.45, `攻撃側勝率 ${attackerWins / total}`);
  assert.ok(defenderWins / total > 0.35 && defenderWins / total < 0.45, `守備側勝率 ${defenderWins / total}`);
  assert.ok(mutual / total > 0.13 && mutual / total < 0.20, `相打ち率 ${mutual / total}`);
});

test('ロシアンルーレットの敗北はライフジャケットでも耐えられない', () => {
  let survived = 0;
  for (let i = 0; i < 2000; i++) {
    const a = unit(mon('攻', 100, 100), 'A');
    const d = unit(mon('守', 10, 10), 'D');
    battle.equipItem(d, ITEM_CATALOG.russianRoulette);
    battle.equipItem(d, ITEM_CATALOG.lifeJacket);
    const r = battle.resolveBattle(a, d, new battle.GoldLedger());
    if (r.attackerSurvived && r.defenderSurvived) survived += 1;
  }
  assert.equal(survived, 0);
});

test('札束ガードはダメージ×3Gを払って戦闘を打ち切る', () => {
  const a = unit(mon('攻', 100, 40), 'A');
  const d = unit(mon('守', 50, 30), 'D');
  battle.equipItem(d, ITEM_CATALOG.satsutabaGuard);
  const gold = new battle.GoldLedger({ A: 0, D: 1000 });
  const r = battle.resolveBattle(a, d, gold);
  assert.ok(r.attackerSurvived && r.defenderSurvived, '両者生存で終わるはず');
  assert.equal(r.dmgToDefender, 0, '守備側はノーダメージ');
  assert.equal(r.dmgToAttacker, 0, '打ち切りなので反撃も起きない');
  assert.deepEqual(gold.balances, { A: 120, D: 880 });
  assert.equal(r.moneyGuardEffects[0].side, 'defender');
  assert.equal(r.moneyGuardEffects[0].amount, 120);
});

test('札束ガードは「無効化」ではなく「支払い」なので貫通で抜けない', () => {
  const a = unit(mon('攻', 100, 40, { traits: ['pierce'] }), 'A');
  const d = unit(mon('守', 50, 30), 'D');
  battle.equipItem(d, ITEM_CATALOG.satsutabaGuard);
  const gold = new battle.GoldLedger({ A: 0, D: 1000 });
  const r = battle.resolveBattle(a, d, gold);
  assert.ok(r.defenderSurvived);
  assert.equal(gold.balances.A, 120);
});

test('札束ガードを真剣白刃取りで奪うと、奪った側が支払う', () => {
  const a = unit(mon('泥棒', 100, 40), 'A');
  const d = unit(mon('守', 100, 30), 'D');
  battle.equipItem(a, ITEM_CATALOG.shinkenShirahadori);
  battle.equipItem(d, ITEM_CATALOG.satsutabaGuard);
  const gold = new battle.GoldLedger({ A: 1000, D: 0 });
  const r = battle.resolveBattle(a, d, gold);
  // 奪った側が殴られる番になって初めて発動する＝元の持ち主がATK30×3を受け取る。
  assert.deepEqual(gold.balances, { A: 910, D: 90 });
  assert.equal(r.moneyGuardEffects[0].side, 'attacker');
});

test('札束ガードはツインハンマーの2発目を止める', () => {
  const a = unit(mon('攻', 100, 40), 'A');
  const d = unit(mon('守', 200, 10), 'D');
  battle.equipItem(a, ITEM_CATALOG.twinHammer);
  battle.equipItem(d, ITEM_CATALOG.satsutabaGuard);
  const gold = new battle.GoldLedger({ A: 0, D: 1000 });
  battle.resolveBattle(a, d, gold);
  assert.equal(1000 - gold.balances.D, (40 + 10) * 3, '1発ぶんしか支払わない');
});

test('ナンカのお守りはツインハンマー等の2発目もまとめて1回分で無効化する', () => {
  // 1発目を無効化した同じチャージが2発目も守る（ユーザー指定、2026-08）。
  const a = unit(mon('攻', 100, 40), 'A');
  const d = unit(mon('守', 100, 10), 'D');
  battle.equipItem(a, ITEM_CATALOG.twinHammer);
  battle.equipItem(d, ITEM_CATALOG.nankaNoOmamori);
  const r = battle.resolveBattle(a, d, new battle.GoldLedger());
  assert.equal(r.dmgToDefender, 0, '2発とも無効化されノーダメージのまま');
  assert.ok(r.defenderSurvived);
  assert.equal(r.exchanges.filter((e) => e.side === 'attacker').length, 2, '攻撃自体は2回発生する');
  assert.ok(r.exchanges.every((e) => e.side !== 'attacker' || e.damage === 0));
});

test('ナンカのお守りは貫通に無効化されるので、2発目も普通に通る', () => {
  const a = unit(mon('攻', 100, 40, { traits: ['pierce'] }), 'A');
  const d = unit(mon('守', 200, 10), 'D');
  battle.equipItem(a, ITEM_CATALOG.twinHammer);
  battle.equipItem(d, ITEM_CATALOG.nankaNoOmamori);
  const r = battle.resolveBattle(a, d, new battle.GoldLedger());
  assert.equal(r.dmgToDefender, 100, '貫通なのでお守りは発動せず(ATK40+10)を2発とも通す');
});

test('4属性の追加Nモンスターは指定どおり尖った性能と欠点を持つ', () => {
  const fire = MONSTER_CATALOG.funenGolem;
  const water = MONSTER_CATALOG.gyakuryuKajiki;
  const forest = MONSTER_CATALOG.karekiNoKyojin;
  const thunder = MONSTER_CATALOG.bousouCoil;
  assert.deepEqual([fire.rarity, fire.hp, fire.atk, fire.cost], ['N', 60, 0, 30]);
  assert.deepEqual([water.rarity, water.hp, water.atk, water.cost], ['N', 10, 50, 30]);
  assert.ok(water.traits.includes('lastStrike'));
  assert.deepEqual([forest.rarity, forest.hp, forest.atk, forest.cost], ['N', 50, 15, 25]);
  assert.deepEqual(forest.effect, { type: 'selfDamageAfterBattle', damage: 10 });
  assert.deepEqual([thunder.rarity, thunder.hp, thunder.atk, thunder.cost], ['N', 20, 45, 30]);
  assert.deepEqual(thunder.effect, { type: 'chanceSelfDamageOnAttack', chance: 0.5, damage: 10 });
});

test('リャンメンすくなは装備込みの最終ATKで2回攻撃する', () => {
  const a = unit(MONSTER_CATALOG.ryanmenSukuna, 'A');
  const d = unit(mon('守', 100, 0, { element: 'water' }), 'D');
  battle.equipItem(a, ITEM_CATALOG.knife); // ATK20+10=30
  const r = battle.resolveBattle(a, d, new battle.GoldLedger());
  assert.equal(r.dmgToDefender, 60, '最終ATK30を2回与える');
  assert.equal(r.exchanges.filter((exchange) => exchange.side === 'attacker').length, 2);
});

test('追加10体の基本仕様と戦闘補正が定義どおり', () => {
  assert.deepEqual(
    ['hinokoSlime', 'mizutamariNamazu', 'morikakeRisu', 'taidenMimizu']
      .map((id) => [MONSTER_CATALOG[id].cost, MONSTER_CATALOG[id].hp, MONSTER_CATALOG[id].atk]),
    [[10, 20, 20], [10, 30, 10], [20, 15, 25], [15, 10, 30]],
  );
  assert.ok(MONSTER_CATALOG.morikakeRisu.traits.includes('firstStrike'));
  assert.deepEqual([MONSTER_CATALOG.honooNoMadoushi.cost, MONSTER_CATALOG.honooNoMadoushi.hp, MONSTER_CATALOG.honooNoMadoushi.atk], [40, 40, 30]);
  assert.ok(MONSTER_CATALOG.honooNoMadoushi.traits.includes('singleTargetImmune'));
  assert.deepEqual(MONSTER_CATALOG.honooNoMadoushi.ability, { type: 'grantSpell', spellId: 'fireball' });
  assert.ok(MONSTER_CATALOG.yukiOnna.traits.includes('waterAtkAura30'));
  assert.deepEqual(MONSTER_CATALOG.accelerPopper.ability, { type: 'curseOwnerDoubleDice' });
  assert.ok(MONSTER_CATALOG.nitron.traits.includes('firstStrike'));
  assert.ok(MONSTER_CATALOG.nitron.traits.includes('pierce'));
  assert.deepEqual(MONSTER_CATALOG.nazoNoKyotou.effect, { type: 'battleStatBonus', hp: 50 });
  assert.deepEqual(MONSTER_CATALOG.dennouNoKaii.ability, { type: 'cursePlayerHacking', turns: 2 });
});

test('ゆきおんなは全水モンスターへATK+30を1回だけ付与し、謎の巨頭は戦闘中HP+50', () => {
  const waterTile = makeTile(0, { owner: 'A', element: 'water' });
  waterTile.unit = unit(MONSTER_CATALOG.yukiOnna, 'A');
  const g = makeStub([waterTile], [{ id: 'A', name: 'ア', currency: 0, allianceId: null }]);
  g._elementHpBonus = () => 0;
  g._cheerAtkBonus = () => 0;
  const water = unit(mon('水兵', 20, 20, { element: 'water' }), 'A');
  assert.deepEqual(g._battleBonus(water, waterTile, waterTile), { atk: 30, hp: 0 });
  const giant = unit(MONSTER_CATALOG.nazoNoKyotou, 'A');
  const bonus = { atk: 0, hp: 0 };
  g._applyEffectBonus(giant, water, bonus);
  assert.deepEqual(bonus, { atk: 0, hp: 50 });
});

test('炎の魔導士は単体スペル対象から除外されるが全体効果ではダメージを受ける', async () => {
  const protectedTile = makeTile(0, { owner: 'B' });
  protectedTile.unit = unit(MONSTER_CATALOG.honooNoMadoushi, 'B');
  const normalTile = makeTile(1, { owner: 'B' });
  normalTile.unit = unit(mon('通常', 30, 10), 'B');
  const players = [{ id: 'A', name: 'ア', currency: 100 }, { id: 'B', name: 'イ', currency: 100 }];
  const g = makeStub([protectedTile, normalTile], players);
  let choices = [];
  g.onPickAbilityTarget = async (items) => { choices = items; return items[0]?.id ?? null; };
  await g._resolveSpellCast(players[0], SPELL_CATALOG.fireball);
  assert.deepEqual(choices.map((choice) => choice.id), [1]);
  const before = protectedTile.unit.currentHp;
  g._spellDamageAllUnits = Game.prototype._spellDamageAllUnits.bind(g);
  g.onDamageEffect = async () => {};
  g._handleUnitDeath = async () => {};
  await g._applySpellEffect(players[0], { target: 'none', effect: { type: 'damageAllUnits', amount: 5 } }, {});
  assert.equal(protectedTile.unit.currentHp, before - 5);
});

test('ハッキングは種類だけの仮カード表示・スペル禁止で、本人の2手番終了後に必ず解除', async () => {
  const spell = { ...SPELL_CATALOG.fireball, id: 'spell-hand' };
  const monster = { ...MONSTER_CATALOG.hinokoSlime, id: 'monster-hand' };
  const players = [
    { id: 'A', name: 'ア', hand: [spell, monster], hackingTurnsRemaining: 2, toughnessTurnsRemaining: 0, defeated: false, isCPU: false },
    { id: 'B', name: 'イ', hand: [], hackingTurnsRemaining: 0, toughnessTurnsRemaining: 0, defeated: false, isCPU: true },
  ];
  const g = makeStub([], players);
  g.currentPlayerIndex = 0;
  g.isBusy = false;
  g.awaitingRoll = true;
  g._isCancelled = false;
  const masked = g._displayHand(players[0]);
  assert.deepEqual(masked.map((card) => [card.id, card.name, card.hiddenByHacking]), [
    ['spell-hand', 'スペル', true], ['monster-hand', 'モンスター', true],
  ]);
  await g.useSpell(spell);
  assert.equal(players[0].hand.length, 2, 'ハッキング中はスペルを消費しない');
  g._nextTurn();
  assert.equal(players[0].hackingTurnsRemaining, 1);
  g.currentPlayerIndex = 0;
  g._nextTurn();
  assert.equal(players[0].hackingTurnsRemaining, 0);
  assert.equal(g._displayHand(players[0])[0].name, 'ファイヤーボール');
});

test('鋼体は基礎HPを底上げし、呪いの上書きでも消えない', async () => {
  const tile = makeTile(0, { owner: 'A' });
  const target = unit(mon('壁', 30, 10), 'A');
  target.currentHp = 12;
  tile.unit = target;
  const g = makeStub([tile], [{ id: 'A', name: 'ア', currency: 0 }]);
  await g._applySpellEffect(g.players[0], SPELL_CATALOG.kotai, { targetTileId: 0 });
  assert.equal(g._baseStats(target).hp, 45);
  assert.equal(target.currentHp, 27);
  battle.applyCurse(target, { name: '別の呪い', addedAtk: 5, addedHp: 0 });
  assert.equal(g._baseStats(target).hp, 45, '呪いは1体1つなので上書きされるが、鋼体は呪いではない');
  battle.prepareForBattle(target, {});
  assert.equal(target._battleMaxHp, 45);
});

test('パンデミックは配置モンスターだけを置き換え、土地には触らない', async () => {
  const tiles = [makeTile(0, { owner: 'A' }), makeTile(1, { owner: 'B' }), makeTile(2)];
  tiles[0].unit = unit(mon('強い壁', 60, 60), 'A');
  tiles[1].unit = unit(MONSTER_CATALOG.zombie, 'B');
  const alreadyZombie = tiles[1].unit;
  const g = makeStub(tiles, [{ id: 'A', name: 'ア', currency: 0 }, { id: 'B', name: 'イ', currency: 0 }]);
  await g._applySpellEffect(g.players[0], SPELL_CATALOG.pandemic, {});
  assert.equal(tiles[0].unit.def.name, 'ゾンビ');
  assert.equal(tiles[0].unit.def.hp, 20);
  assert.equal(tiles[0].unit.def.generatedOutsideDeck, true, '置換後ゾンビを40枚デッキへ混ぜない');
  assert.equal(tiles[0].unit.ownerId, 'A', 'モンスターの持ち主は変わらない');
  assert.equal(tiles[0].owner, 'A');
  assert.equal(tiles[1].owner, 'B');
  assert.equal(tiles[1].unit, alreadyZombie, '既にゾンビなら作り直さない');
  assert.equal(tiles[2].unit, null, '空き地には湧かない');
});

test('パンデミック後のゾンビを手札へ戻しても元カードと二重にデッキへ入らない', async () => {
  const original = { ...MONSTER_CATALOG.kunekune, id: 'original-kune', catalogId: 'kunekune' };
  const tile = makeTile(0, {
    owner: 'A',
    element: 'fire',
    mesh: { material: { color: { set: () => {} } } },
  });
  tile.unit = unit(original, 'A');
  const owner = {
    id: 'A', name: 'ア', currency: 0, hand: [],
    deck: { discardPile: [original], drawPile: [] },
  };
  const g = makeStub([tile], [owner]);
  g.onLandLoss = async () => {};

  await g._applySpellEffect(owner, SPELL_CATALOG.pandemic, {});
  assert.equal(tile.unit.def.catalogId, 'zombie');
  await g._spellReturnMismatchedMonstersToHand(owner, 1);
  assert.equal(owner.hand.length, 1);
  assert.equal(owner.hand[0].catalogId, 'zombie');
  assert.equal(owner.hand[0].generatedOutsideDeck, true);
  assert.deepEqual(owner.deck.discardPile.map((card) => card.catalogId), ['kunekune'],
    '元カードは捨札に残し、生成ゾンビで正規札を回収しない');
  g._discardUsedCard(owner, owner.hand[0]);
  assert.deepEqual(owner.deck.discardPile.map((card) => card.catalogId), ['kunekune'],
    '生成ゾンビを再使用しても41枚目として混ぜない');
});

test('パンデミックの演出ペイロードには専用効果種別が含まれる', () => {
  const tile = makeTile(0);
  const player = { id: 'A', name: 'ア', tileId: 0 };
  const g = makeStub([tile], [player]);
  const payload = g._buildSpellCastEffectPayload(player, {}, SPELL_CATALOG.pandemic);
  assert.equal(payload.cardId, SPELL_CATALOG.pandemic.id);
  assert.equal(payload.effectType, 'replaceAllUnitsWithZombie');
});

test('防御型は敵地へ侵略できないが自分の土地との入れ替えには使える', () => {
  const ownTile = makeTile(0, { owner: 'A' });
  ownTile.unit = unit(mon('自軍', 20, 10), 'A');
  const enemyTile = makeTile(1, { owner: 'B' });
  enemyTile.unit = unit(mon('敵軍', 20, 10), 'B');
  const wall = { ...MONSTER_CATALOG.islandWhale, id: 'wall-hand', catalogId: 'islandWhale' };
  const player = { id: 'A', name: 'ア', currency: 100, hand: [wall] };
  const g = makeStub([ownTile, enemyTile], [player, { id: 'B', name: 'イ', hand: [] }]);
  assert.equal(g._affordableMonsterCards(player, ownTile).length, 1, '自領地との入れ替え候補には出る');
  assert.equal(g._affordableMonsterCards(player, enemyTile).length, 0, '敵地への侵略候補には出ない');
});

test('ホライズンは全所有地をLv2に均し、総資産の増減を各自の頭上に出す', async () => {
  const tiles = [
    makeTile(0, { owner: 'A', level: 5 }),
    makeTile(1, { owner: 'B', level: 1 }),
    makeTile(2, { owner: 'B', level: 1 }),
    makeTile(3),
  ];
  const players = [{ id: 'A', name: 'ア', currency: 0 }, { id: 'B', name: 'イ', currency: 0 }];
  const g = makeStub(tiles, players);
  const beforeA = g._totalAssetsOf(players[0]);
  const beforeB = g._totalAssetsOf(players[1]);
  await g._applySpellEffect(players[0], SPELL_CATALOG.horizon, {});
  assert.deepEqual(tiles.map((t) => t.level), [2, 2, 2, 1], '空き地は対象外');
  assert.ok(g._totalAssetsOf(players[0]) < beforeA, 'Lv5だった側は減る');
  assert.ok(g._totalAssetsOf(players[1]) > beforeB, 'Lv1だった側は増える');
  assert.equal(g.effects.filter((e) => e.playerId != null).length, 2);
});

test('遅延行為は土地レベルを1下げ、Lv1には効かない', async () => {
  const tiles = [makeTile(0, { owner: 'A', level: 4 }), makeTile(1, { owner: 'A', level: 1 })];
  const players = [{ id: 'A', name: 'ア', currency: 0 }];
  const g = makeStub(tiles, players);
  const valueBefore = g._landValueOfTile(tiles[0]);
  await g._applySpellEffect(players[0], SPELL_CATALOG.delayTactics, { targetTileId: 0 });
  assert.equal(tiles[0].level, 3);
  assert.ok(g._landValueOfTile(tiles[0]) < valueBefore);
  await g._applySpellEffect(players[0], SPELL_CATALOG.delayTactics, { targetTileId: 1 });
  assert.equal(tiles[1].level, 1);
  assert.ok(g.logs.some((l) => l.includes('既にLv1')));
});

test('CPUの遅延行為は一番育った敵地を狙い、割に合わなければ撃たない', async () => {
  const tiles = [
    makeTile(0, { owner: 'B', level: 4, price: 200 }),
    makeTile(1, { owner: 'B', level: 2, price: 60 }),
    makeTile(2, { owner: 'A', level: 5, price: 200 }),
  ];
  const players = [
    { id: 'A', name: 'CPU', currency: 500, hand: [spellCopy(SPELL_CATALOG.delayTactics)] },
    { id: 'B', name: '敵', currency: 0, hand: [] },
  ];
  const g = makeCpuStub(tiles, players);
  await g._cpuMaybeUseDelayTacticsSpell(players[0]);
  assert.equal(g.casts.length, 1);
  assert.equal(g.casts[0].cast.targetTileId, 0, '自分の土地ではなく最大の敵地へ');
  assert.deepEqual(tiles.map((t) => t.level), [4, 2, 5], '見積もりの一時変更を戻していない');

  const poor = [makeTile(0, { owner: 'B', level: 2, price: 20 })];
  const poorPlayers = [
    { id: 'A', name: 'CPU', currency: 500, hand: [spellCopy(SPELL_CATALOG.delayTactics)] },
    { id: 'B', name: '敵', currency: 0, hand: [] },
  ];
  const poorGame = makeCpuStub(poor, poorPlayers);
  await poorGame._cpuMaybeUseDelayTacticsSpell(poorPlayers[0]);
  assert.equal(poorGame.casts.length, 0, '削れる額がコスト未満なら撃たない');
});

test('CPUのパンデミックは敵の壁が固い時だけ撃つ', async () => {
  const strongEnemy = makeTile(0, { owner: 'B' });
  strongEnemy.unit = unit(mon('鉄壁', 90, 80), 'B');
  const myWeak = makeTile(1, { owner: 'A' });
  myWeak.unit = unit(mon('雑魚', 20, 10), 'A');
  const players = [
    { id: 'A', name: 'CPU', currency: 500, hand: [spellCopy(SPELL_CATALOG.pandemic)] },
    { id: 'B', name: '敵', currency: 0, hand: [] },
  ];
  const g = makeCpuStub([strongEnemy, myWeak], players);
  await g._cpuMaybeUsePandemicSpell(players[0]);
  assert.equal(g.casts.length, 1);

  const weakEnemy = makeTile(0, { owner: 'B' });
  weakEnemy.unit = unit(mon('雑魚', 20, 10), 'B');
  const myStrong = makeTile(1, { owner: 'A' });
  myStrong.unit = unit(mon('鉄壁', 90, 80), 'A');
  const players2 = [
    { id: 'A', name: 'CPU', currency: 500, hand: [spellCopy(SPELL_CATALOG.pandemic)] },
    { id: 'B', name: '敵', currency: 0, hand: [] },
  ];
  const g2 = makeCpuStub([weakEnemy, myStrong], players2);
  await g2._cpuMaybeUsePandemicSpell(players2[0]);
  assert.equal(g2.casts.length, 0, '自分の盤面の方が強ければ自爆しない');
});

test('CPUのホライズンは自分の伸びが首位の伸びを上回る時だけ撃つ', async () => {
  const good = [
    makeTile(0, { owner: 'A', level: 1, price: 200 }),
    makeTile(1, { owner: 'A', level: 1, price: 200 }),
    makeTile(2, { owner: 'A', level: 1, price: 200 }),
    makeTile(3, { owner: 'B', level: 5, price: 200 }),
  ];
  const goodPlayers = [
    { id: 'A', name: 'CPU', currency: 500, hand: [spellCopy(SPELL_CATALOG.horizon)] },
    { id: 'B', name: '敵', currency: 0, hand: [] },
  ];
  const g = makeCpuStub(good, goodPlayers);
  await g._cpuMaybeUseHorizonSpell(goodPlayers[0]);
  assert.equal(g.casts.length, 1);
  assert.deepEqual(good.map((t) => t.level), [1, 1, 1, 5], '見積もりの一時変更を戻していない');

  const bad = [makeTile(0, { owner: 'A', level: 5, price: 200 }), makeTile(1, { owner: 'B', level: 1, price: 200 })];
  const badPlayers = [
    { id: 'A', name: 'CPU', currency: 500, hand: [spellCopy(SPELL_CATALOG.horizon)] },
    { id: 'B', name: '敵', currency: 0, hand: [] },
  ];
  const g2 = makeCpuStub(bad, badPlayers);
  await g2._cpuMaybeUseHorizonSpell(badPlayers[0]);
  assert.equal(g2.casts.length, 0);
  assert.deepEqual(bad.map((t) => t.level), [5, 1]);
});

test('CPUの鋼体は高価な土地の薄い守備を選び、手元が寂しければ撃たない', async () => {
  const cheap = makeTile(0, { owner: 'A', level: 1, price: 60 });
  cheap.unit = unit(mon('厚い', 60, 10), 'A');
  const rich = makeTile(1, { owner: 'A', level: 4, price: 200 });
  rich.unit = unit(mon('薄い', 20, 10), 'A');
  const players = [{ id: 'A', name: 'CPU', currency: 900, hand: [spellCopy(SPELL_CATALOG.kotai)] }];
  const g = makeCpuStub([cheap, rich], players);
  await g._cpuMaybeUseToughBodySpell(players[0]);
  assert.equal(g.casts[0].cast.targetTileId, 1);

  const lone = makeTile(0, { owner: 'A', level: 4, price: 200 });
  lone.unit = unit(mon('薄い', 20, 10), 'A');
  const poorPlayers = [{ id: 'A', name: 'CPU', currency: 55, hand: [spellCopy(SPELL_CATALOG.kotai)] }];
  const g2 = makeCpuStub([lone], poorPlayers);
  await g2._cpuMaybeUseToughBodySpell(poorPlayers[0]);
  assert.equal(g2.casts.length, 0, '備え100Gを割ってまでは撃たない');
});

test('CPUの鋼体はnoHpBoost持ち（くぐつの剣豪）を対象から外し、無限に撃ち続けない', async () => {
  // noHpBoostは鋼体のHP加算を無効化するので、撃ってもスコア（土地価値-HP*2）が
  // 下がらない。除外しないと、他に薄い守備が無い盤面ではCPUが毎ターン50Gを
  // 無駄撃ちし続けてしまう。
  const kugutsuTile = makeTile(0, { owner: 'A', level: 4, price: 200 });
  kugutsuTile.unit = unit(MONSTER_CATALOG.kugutsuNoKengou, 'A');
  const players = [{ id: 'A', name: 'CPU', currency: 900, hand: [spellCopy(SPELL_CATALOG.kotai)] }];
  const g = makeCpuStub([kugutsuTile], players);
  await g._cpuMaybeUseToughBodySpell(players[0]);
  assert.equal(g.casts.length, 0);

  // 他に薄い守備の土地があれば、そちらは従来どおり対象になる。
  const thinTile = makeTile(1, { owner: 'A', level: 4, price: 200 });
  thinTile.unit = unit(mon('薄い', 20, 10), 'A');
  const g2 = makeCpuStub([kugutsuTile, thinTile], players);
  await g2._cpuMaybeUseToughBodySpell(players[0]);
  assert.equal(g2.casts[0].cast.targetTileId, 1);
});

test('くぐつの剣豪は指定の性能を持ち、正式画像を参照する', () => {
  const card = MONSTER_CATALOG.kugutsuNoKengou;
  assert.equal(card.name, 'くぐつの剣豪');
  assert.equal(card.rarity, 'R');
  assert.equal(card.element, 'neutral');
  assert.deepEqual([card.hp, card.atk, card.cost], [50, 50, 120]); // 2026-08 ユーザー指定で150G→120G
  assert.equal(card.effect.type, 'autoInvadeEachTurn');
  assert.ok(card.traits.includes('immovableByMoveCommand'));
  assert.ok(card.traits.includes('noHpBoost'));
  assert.match(card.imageDataUrl, /\/images\/card-art\/kugutsuNoKengou\.png$/);
});

test('くぐつの剣豪はアイテム・スペルのHP増加だけ受けず、減少と土地ボーナスは通る', () => {
  const def = MONSTER_CATALOG.kugutsuNoKengou;
  assert.equal(battle.statTotals(unit(def, 'A')).maxHp, 50);

  // 不死鳥の盾(ATK+10/HP+20): ATKは乗るがHPは乗らない。
  const shielded = unit(def, 'A');
  battle.equipItem(shielded, ITEM_CATALOG.fushichoNoTate);
  const shieldTotals = battle.statTotals(shielded);
  assert.equal(shieldTotals.maxHp, 50, 'アイテムのHP増加は無効');
  assert.equal(shieldTotals.atk, 60, 'アイテムのATK増加は有効');

  // 斬〇剣(HP-20): マイナス補正は「増やせない」に当たらないのでそのまま効く。
  const cursedBlade = unit(def, 'A');
  battle.equipItem(cursedBlade, ITEM_CATALOG.zangokuKen);
  assert.equal(battle.statTotals(cursedBlade).maxHp, 30, 'HP減少はそのまま');

  // スペル由来（鋼体/タフネスのsummonBaseHpBonus、HP+の呪い）も無効。
  const boosted = unit(def, 'A');
  boosted.summonBaseHpBonus = 15;
  boosted.curses.push({ name: 'テスト強化', addedHp: 20 });
  assert.equal(battle.statTotals(boosted).maxHp, 50);

  // ナンカのお守り・ライフジャケットはHP加算ではないので従来どおり使える。
  const guarded = unit(def, 'A');
  battle.equipItem(guarded, ITEM_CATALOG.nankaNoOmamori);
  battle.equipItem(guarded, ITEM_CATALOG.lifeJacket);
  assert.equal(battle.statTotals(guarded).maxHp, 50);

  // 土地の同属性ボーナス・応援(bonus.hp)はアイテムでもスペルでもないので乗る。
  assert.equal(battle.statTotals(unit(def, 'A'), { hp: 30 }).maxHp, 80);
});

test('くぐつの剣豪は敵からの鋼体連投で実質HPを削られない（baseMaxHpのnoHpBoost反映漏れの回帰）', () => {
  // 鋼体はanyMonster対象＝敵も自分の剣豪へ撃てる。撃つたびcurrentHpと
  // summonBaseHpBonusが両方+15されるが、剣豪はnoHpBoostにより実際の
  // 最大HPは50のまま増えない。prepareForBattle/restoreOnBoardHpが使う
  // 「持ち越しダメージの基準値」がこのnoHpBoostを見ていないと、
  // 基準値だけがcurrentHpと一緒に膨らみ続けて次の一撃の減った分が
  // 基準値の増加に吸収されてしまい、ATK5の雑魚相手に3戦目で倒される。
  const def = MONSTER_CATALOG.kugutsuNoKengou;
  const weakDef = mon('雑魚', 10, 5);
  const kugutsu = unit(def, 'A');
  const ledger = new battle.GoldLedger();
  const castKotai = (u) => {
    u.summonBaseHpBonus = Number(u.summonBaseHpBonus || 0) + 15;
    u.currentHp += 15;
  };
  for (let round = 0; round < 3; round++) {
    castKotai(kugutsu);
    const attacker = unit(weakDef, 'B');
    const result = battle.resolveBattle(attacker, kugutsu, ledger);
    assert.equal(result.defenderSurvived, true, `${round + 1}戦目でATK5の雑魚に倒れてはいけない`);
  }
  assert.equal(kugutsu.currentHp, 45);
});

test('くぐつの剣豪の進路は無装備勝率→装備込み勝率→土地ボーナス無しの順で決まる', () => {
  const players = [{ id: 'A', name: 'ア' }, { id: 'B', name: 'イ' }];
  const build = () => {
    const source = makeTile(0, { owner: 'A', neighbors: [1, 2] });
    source.unit = unit(MONSTER_CATALOG.kugutsuNoKengou, 'A');
    const left = makeTile(1, { owner: 'B', neighbors: [0] });
    left.unit = unit(mon('左', 30, 30), 'B');
    const right = makeTile(2, { owner: 'B', neighbors: [0] });
    right.unit = unit(mon('右', 30, 30), 'B');
    const g = makeStub([source, left, right], players);
    g._elementHpBonus = () => 0;
    return { g, source };
  };

  // ①無装備で勝てる方（tile 2）へ。
  const a = build();
  a.g._estimateUnitBattleWinProbability = (u, pos, tile, trials, options) =>
    (options?.itemMode === 'none' ? (tile.id === 2 ? 0.9 : 0) : 1);
  assert.equal(a.g._chooseAutoInvadeTarget(a.source, players[0]).id, 2);

  // ②無装備ではどちらも勝てない → 装備込みの勝率が高い方（tile 1）へ。
  const b = build();
  b.g._estimateUnitBattleWinProbability = (u, pos, tile, trials, options) =>
    (options?.itemMode === 'none' ? 0 : (tile.id === 1 ? 0.8 : 0.2));
  assert.equal(b.g._chooseAutoInvadeTarget(b.source, players[0]).id, 1);

  // ③勝率が同点 → 防衛側が土地の同属性HPボーナスを受けていない方（tile 2）へ。
  const c = build();
  c.g._estimateUnitBattleWinProbability = () => 0.5;
  c.g._elementHpBonus = (u, tile) => (tile.id === 1 ? 30 : 0);
  assert.equal(c.g._chooseAutoInvadeTarget(c.source, players[0]).id, 2);
});

test('くぐつの剣豪は候補が3つ以上でも一番勝てる的へ向かう（epsilon同点判定の非推移性の回帰）', () => {
  // 隣接3件の勝率が0.40/0.45/0.50のように隣同士だけepsilon(0.05)以内だと、
  // 「|a-b|<=epsilonなら同点」という比較関数はTimSortの下で0.40と0.50を
  // 直接比較しないまま並べ、勝率最悪の的を選んでしまうことがある。
  const players = [{ id: 'A', name: 'ア' }, { id: 'B', name: 'イ' }];
  const source = makeTile(0, { owner: 'A', neighbors: [1, 2, 3] });
  source.unit = unit(mon('剣豪', 50, 50), 'A');
  const t1 = makeTile(1, { owner: 'B', neighbors: [0] }); t1.unit = unit(mon('的1', 30, 30), 'B');
  const t2 = makeTile(2, { owner: 'B', neighbors: [0] }); t2.unit = unit(mon('的2', 30, 30), 'B');
  const t3 = makeTile(3, { owner: 'B', neighbors: [0] }); t3.unit = unit(mon('的3', 30, 30), 'B');
  const g = makeStub([source, t1, t2, t3], players);
  g._elementHpBonus = () => 0;
  const winRates = { 1: 8 / 20, 2: 9 / 20, 3: 10 / 20 };
  g._estimateUnitBattleWinProbability = (u, pos, tile) => winRates[tile.id];

  const ranked = g._rankAutoInvadeTargets(source, players[0], [t1, t2, t3]);
  assert.deepEqual(ranked.map((t) => t.id), [3, 2, 1]);
  assert.equal(g._chooseAutoInvadeTarget(source, players[0]).id, 3);
});

test('到達できる敵がいなければ自動行動は起きず、移動コマンドでも動かせない', async () => {
  const players = [{ id: 'A', name: 'ア' }];
  const source = makeTile(0, { owner: 'A', neighbors: [1] });
  source.unit = unit(MONSTER_CATALOG.kugutsuNoKengou, 'A');
  const emptyLand = makeTile(1, { neighbors: [0] }); // この先に敵がいないので動かない
  const g = makeStub([source, emptyLand], players);
  assert.equal(g._chooseAutoInvadeTarget(source, players[0]), null);
  assert.equal(g._planAutoInvaderStep(source, players[0]), null);
  // 土地コマンドの「移動」からは常に拒否される。
  assert.equal(await g._humanMoveFlow(players[0], source), false);
});

test('くぐつの剣豪は隣接敵を最優先で即侵略する', () => {
  const players = [{ id: 'A', name: 'ア' }, { id: 'B', name: '敵' }];
  const source = makeTile(0, { owner: 'A', neighbors: [1] });
  source.unit = unit(MONSTER_CATALOG.kugutsuNoKengou, 'A');
  const enemy = makeTile(1, { owner: 'B', neighbors: [0, 2] });
  enemy.unit = unit(mon('敵兵', 30, 20), 'B');
  const empty = makeTile(2, { neighbors: [1] });
  const g = makeStub([source, enemy, empty], players);
  g._estimateUnitBattleWinProbability = () => 0.5;
  g._elementHpBonus = () => 0;

  const plan = g._planAutoInvaderStep(source, players[0]);
  assert.equal(plan.kind, 'invade');
  assert.equal(plan.destination.id, enemy.id);
  assert.equal(plan.distance, 1);
});

test('くぐつの剣豪は空き地を毎手番1マス進み、同じ個体のまま敵へ接近する', async () => {
  const players = [{ id: 'A', name: 'ア', color: '#f00', currency: 777 }, { id: 'B', name: '敵' }];
  const source = makeTile(0, { owner: 'A', neighbors: [1] });
  source.unit = unit(MONSTER_CATALOG.kugutsuNoKengou, 'A');
  source.unit.currentHp = 17;
  source.unit.curses = [{ name: 'テスト呪い' }];
  const firstEmpty = makeTile(1, { neighbors: [0, 2] });
  const secondEmpty = makeTile(2, { neighbors: [1, 3] });
  const enemy = makeTile(3, { owner: 'B', neighbors: [2] });
  enemy.unit = unit(mon('敵兵', 30, 20), 'B');
  const g = makeStub([source, firstEmpty, secondEmpty, enemy], players);
  Object.assign(g, {
    _estimateUnitBattleWinProbability: () => 0.5,
    _elementHpBonus: () => 0,
    _captureLandLoss: () => null,
    _captureLandGain: () => null,
    _paintTile: () => {},
    _repaintTileToElement: () => {},
    _hopUnitIcon: async () => {},
    _presentLandLoss: async () => {},
    _presentLandGain: async () => {},
  });

  const movingUnit = source.unit;
  const firstPlan = g._planAutoInvaderStep(source, players[0]);
  assert.deepEqual(
    [firstPlan.kind, firstPlan.destination.id, firstPlan.enemy.id, firstPlan.distance],
    ['advance', 1, 3, 3],
  );
  assert.equal(await g._advanceAutoInvaderToEmpty(players[0], source, firstPlan.destination, firstPlan.enemy), true);
  assert.equal(firstEmpty.unit, movingUnit, 'コピーではなく同じ配置個体を移す');
  assert.equal(firstEmpty.unit.currentHp, 17, '現在HPを回復させない');
  assert.deepEqual(firstEmpty.unit.curses, [], '通常のモンスター移動と同じく呪いを解除');
  assert.equal(source.unit, null);
  assert.equal(source.owner, null);
  assert.equal(players[0].currency, 777, '空き地への前進にGはかからない');

  const secondPlan = g._planAutoInvaderStep(firstEmpty, players[0]);
  assert.deepEqual([secondPlan.kind, secondPlan.destination.id, secondPlan.distance], ['advance', 2, 2]);
  assert.equal(await g._advanceAutoInvaderToEmpty(players[0], firstEmpty, secondPlan.destination, secondPlan.enemy), true);

  const thirdPlan = g._planAutoInvaderStep(secondEmpty, players[0]);
  assert.deepEqual([thirdPlan.kind, thirdPlan.destination.id, thirdPlan.distance], ['invade', 3, 1]);
});

test('味方が経路を塞いでいる間は動かず、味方が消えると空き地から進軍を始める', () => {
  const players = [{ id: 'A', name: 'ア' }, { id: 'B', name: '敵' }];
  const source = makeTile(0, { owner: 'A', neighbors: [1] });
  source.unit = unit(MONSTER_CATALOG.kugutsuNoKengou, 'A');
  const empty = makeTile(1, { neighbors: [0, 2] });
  const friend = makeTile(2, { owner: 'A', neighbors: [1, 3] });
  friend.unit = unit(mon('味方', 30, 20), 'A');
  const enemy = makeTile(3, { owner: 'B', neighbors: [2] });
  enemy.unit = unit(mon('敵兵', 30, 20), 'B');
  const g = makeStub([source, empty, friend, enemy], players);
  g._estimateUnitBattleWinProbability = () => 0.5;
  g._elementHpBonus = () => 0;

  assert.equal(g._planAutoInvaderStep(source, players[0]), null, '味方を通り抜けない');
  friend.owner = null;
  friend.unit = null;
  const reopened = g._planAutoInvaderStep(source, players[0]);
  assert.deepEqual(
    [reopened.kind, reopened.destination.id, reopened.enemy.id, reopened.distance],
    ['advance', 1, 3, 3],
  );
});

test('異次元ソケットは指定の性能を持ち、画像未実装のためnullを参照する', () => {
  const card = ITEM_CATALOG.dimensionalSocket;
  assert.equal(card.name, '異次元ソケット');
  assert.equal(card.rarity, 'S');
  assert.equal(card.cost, 60);
  assert.deepEqual([card.atkBonus, card.hpBonus], [0, 0]);
  assert.equal(card.effect.type, 'swapSpecialAbilities');
  assert.equal(card.imageDataUrl, null, '専用画像が無い間はnull（cardArt.jsの共通絵にフォールバック）');
});

test('異次元ソケットはモンスター自身の特性(先制)を入れ替える', () => {
  // 素の状態なら「両者無特性は攻撃側が先制」なので、先制無しの攻撃側が
  // 通常どおり先に殴って倒す。守備側にだけ先制を持たせると立場が逆転し、
  // 守備側が先に殴って攻撃側を倒す。
  {
    const a = unit(mon('攻', 50, 50), 'A');
    const d = unit(mon('守', 10, 50, { traits: ['firstStrike'] }), 'D');
    const r = battle.resolveBattle(a, d, new battle.GoldLedger());
    assert.deepEqual([r.attackerSurvived, r.defenderSurvived], [false, true], '素のままなら守備側の先制が勝つ');
  }
  // 攻撃側が異次元ソケットを装備すると、先制(守備側の特性)が入れ替わって
  // 攻撃側へ移り、逆に攻撃側が先に殴って倒す側になる。
  {
    const a = unit(mon('攻', 50, 50), 'A');
    const d = unit(mon('守', 10, 50, { traits: ['firstStrike'] }), 'D');
    battle.equipItem(a, ITEM_CATALOG.dimensionalSocket);
    const r = battle.resolveBattle(a, d, new battle.GoldLedger());
    assert.deepEqual([r.attackerSurvived, r.defenderSurvived], [true, false], '入れ替え後は攻撃側の先制が勝つ');
  }
});

test('異次元ソケットは装備アイテムの効果(ナンカのお守りの無効化)も入れ替える', () => {
  // 守備側がナンカのお守りを持つ限り、攻撃側の一撃(本来致死)は1回無効化
  // されて生き残る。
  {
    const a = unit(mon('攻', 100, 50), 'A');
    const d = unit(mon('守', 10, 0), 'D');
    battle.equipItem(d, ITEM_CATALOG.nankaNoOmamori);
    const r = battle.resolveBattle(a, d, new battle.GoldLedger());
    assert.equal(r.defenderSurvived, true, '無効化前提なら生き残る');
  }
  // 攻撃側が異次元ソケットを装備すると、守備側のナンカのお守りの効果
  // (無効化)が攻撃側の防具スロットへ移り、守備側は無効化を失って死ぬ。
  {
    const a = unit(mon('攻', 100, 50), 'A');
    const d = unit(mon('守', 10, 0), 'D');
    battle.equipItem(d, ITEM_CATALOG.nankaNoOmamori);
    battle.equipItem(a, ITEM_CATALOG.dimensionalSocket);
    const r = battle.resolveBattle(a, d, new battle.GoldLedger());
    assert.equal(r.defenderSurvived, false, '無効化を奪われたので致死ダメージが通る');
  }
});

test('異次元ソケットの入れ替えは1戦闘限りで、ATK/HPの実数値には影響しない', () => {
  // 双方とも先制した側の一撃で即死する火力に設定し、「誰が先に殴ったか」
  // だけで勝敗が完全に決まるようにする。
  const aDef = mon('攻', 50, 100, { traits: ['firstStrike'] });
  const dDef = mon('守', 50, 80);
  const a = unit(aDef, 'A');
  const d = unit(dDef, 'D');
  battle.equipItem(a, ITEM_CATALOG.dimensionalSocket);
  const r1 = battle.resolveBattle(a, d, new battle.GoldLedger());
  // 攻撃側自身の先制が守備側へ渡ってしまうので、この戦闘だけは守備側が
  // 先に殴って勝つ（通常なら攻撃側の先制で逆の結果になるところ）。
  assert.deepEqual([r1.attackerSurvived, r1.defenderSurvived], [false, true], '先制が守備側へ渡り立場が逆転する');

  // 戦闘後、defが元の共有カード定義オブジェクトへ戻っていること
  // （戻し忘れると次の戦闘以降も先制が入れ替わったままになる）。
  assert.equal(a.def, aDef);
  assert.equal(d.def, dDef);

  // 次の戦闘（アイテムは戦闘後に消費済みでソケット無し）は同じカード定義でも
  // 通常どおり攻撃側の先制が勝つ＝入れ替えが後まで残っていない証拠。
  const a2 = unit(aDef, 'A');
  const d2 = unit(dDef, 'D');
  assert.equal(battle.statTotals(a2).atk, 100, 'ATKの実数値は入れ替わらない');
  assert.equal(battle.statTotals(d2).atk, 80, 'ATKの実数値は入れ替わらない');
  const r2 = battle.resolveBattle(a2, d2, new battle.GoldLedger());
  assert.deepEqual([r2.attackerSurvived, r2.defenderSurvived], [true, false], 'ソケット無しの通常戦闘に戻っている');
});

test('異次元ソケットは連鎖・狂戦士等の戦闘中ボーナス計算より先に能力を交換する', () => {
  // 旧順序では、攻撃側のATK2倍と守備側のHP+50を先に計算してから能力だけを
  // 交換していた。ここでは正しく交換できれば、攻撃側はHP+50、守備側は
  // ATK2倍を得るため、守備側の一時HP+50が消えて最初の30ダメージで倒れる。
  const attackerDef = mon('狂戦士役', 30, 30, {
    effect: { type: 'atkMultiplier', multiplier: 2 },
  });
  const defenderDef = mon('巨頭役', 25, 10, {
    effect: {
      type: 'statsPerElementChain', element: 'water', atkPerChain: 0, hpPerChain: 50,
    },
  });
  const g = makeStub([], [{ id: 'A' }, { id: 'D' }]);
  g._battleBonus = () => ({ atk: 0, hp: 0 });
  g._chainCount = () => 1;
  const r = g._simulateBattleOnce(
    unit(attackerDef, 'A'),
    unit(defenderDef, 'D'),
    makeTile(0),
    ITEM_CATALOG.dimensionalSocket,
    null,
  );
  assert.deepEqual(r, { attackerSurvived: true, defenderSurvived: false });
});

test('異次元ソケットの一時交換は戦闘演出が中断されても復元できる', () => {
  const attackerDef = mon('攻', 40, 20, { traits: ['firstStrike'] });
  const defenderDef = mon('守', 40, 20, { traits: ['pierce'] });
  const attacker = unit(attackerDef, 'A');
  const defender = unit(defenderDef, 'D');
  battle.equipItem(attacker, ITEM_CATALOG.dimensionalSocket);
  battle.applyPreAttackItemEffects(attacker, defender);
  assert.ok(battle.hasTrait(attacker, 'pierce'), '戦闘中は交換される');
  battle.abortPreAttackItemEffects(attacker, defender);
  assert.equal(attacker.def, attackerDef);
  assert.equal(defender.def, defenderDef);
  assert.ok(battle.hasTrait(attacker, 'firstStrike'), '中断後は元の能力へ戻る');
  assert.ok(!battle.hasTrait(attacker, 'pierce'));
  battle.abortPreAttackItemEffects(attacker, defender); // 二重終了でも壊れない
});

test('異次元ソケットは周回覚醒特性と装備固有のATK0効果も交換し、終了時に復元する', () => {
  const attacker = unit(mon('攻', 50, 40), 'A');
  const defender = unit(mon('守', 50, 30), 'D');
  attacker.awakenedTraits = ['firstStrike'];
  battle.equipItem(attacker, ITEM_CATALOG.dimensionalSocket);
  battle.equipItem(defender, ITEM_CATALOG.danboorNoYoroi);

  battle.applyPreAttackItemEffects(attacker, defender);
  assert.equal(battle.hasTrait(attacker, 'firstStrike'), false, '覚醒先制は相手へ渡る');
  assert.equal(battle.hasTrait(defender, 'firstStrike'), true, '相手が覚醒先制を受け取る');
  assert.equal(battle.statTotals(attacker).atk, 0, 'ダンボールの鎧のATK0効果を受け取る');
  assert.equal(battle.statTotals(defender).atk, 30, '元の装備者からATK0効果が外れる');

  battle.abortPreAttackItemEffects(attacker, defender);
  assert.deepEqual(attacker.awakenedTraits, ['firstStrike']);
  assert.equal(defender.awakenedTraits, undefined);
  assert.equal(battle.statTotals(attacker).atk, 40, '終了後はATK0効果が残らない');
  assert.equal(battle.statTotals(defender).atk, 0, '元の装備者へATK0効果が戻る');
});

test('異次元ソケットはイカサマのサイコロ等の動的な装備効果も交換する', () => {
  const attacker = unit(mon('攻', 50, 20), 'A');
  const defender = unit(mon('守', 50, 20), 'D');
  battle.equipItem(attacker, ITEM_CATALOG.dimensionalSocket);
  battle.equipItem(defender, ITEM_CATALOG.ikasamaNoSaikoro);
  const g = makeStub([], [
    { id: 'A', lastDiceSteps: 6 },
    { id: 'D', lastDiceSteps: 2 },
  ]);
  battle.applyPreAttackItemEffects(attacker, defender);
  const attackerBonus = { atk: 0, hp: 0 };
  const defenderBonus = { atk: 0, hp: 0 };
  g._applyEquippedItemBonus(attacker, attackerBonus);
  g._applyEquippedItemBonus(defender, defenderBonus);
  assert.equal(attackerBonus.atk, 30, '奪った効果は現在の所有者の出目6を参照する');
  assert.equal(defenderBonus.atk, 0, '元の装備者からサイコロ効果が外れる');
  battle.abortPreAttackItemEffects(attacker, defender);
});

test('ハイパーアップはATK/HPともに+15、コスト+40のRパーツ', () => {
  const part = breedParts.findBreedPart('part-hyper-up');
  assert.ok(part, 'part-hyper-upがBREED_PARTSに登録されていない');
  assert.equal(part.name, 'ハイパーアップ');
  assert.equal(part.rarity, 'R');
  assert.deepEqual([part.atkDelta, part.hpDelta, part.costDelta], [15, 15, 40]);

  const breedMonster = { equippedPartIds: [] };
  assert.deepEqual(breedParts.canEquipPart(breedMonster, part), { ok: true });
  breedMonster.equippedPartIds.push(part.id);
  const stats = breedParts.computeBreedStats(breedMonster);
  assert.deepEqual(
    [stats.atk, stats.hp, stats.cost],
    [breedParts.BREED_BASE.atk + 15, breedParts.BREED_BASE.hp + 15, breedParts.BREED_BASE.cost + 40],
  );
});

test('ブリードパターンは最大3件で、選択中のパターンだけがカード化される', () => {
  // デッキと同じく、character.breedMonsters(配列)+breedMonsterIndex(選択中)
  // で管理する。activeBreedMonsterは無効なindexにもフォールバックする。
  const patternA = { name: 'パターンA', equippedPartIds: ['part-atk-up'] };
  const patternB = { name: 'パターンB', equippedPartIds: ['part-hyper-up', 'part-hyper-up'] };
  const sharedImage = 'data:image/webp;base64,shared-breed-image';
  const character = { breedMonsters: [patternA, patternB], breedMonsterIndex: 1, breedImageDataUrl: sharedImage };

  assert.equal(breedParts.activeBreedMonster(character), patternB, '選択中(index=1)のパターンを返す');
  const cardB = breedParts.buildBreedCardDef(character);
  assert.equal(cardB.name, 'パターンB');
  assert.equal(cardB.atk, breedParts.BREED_BASE.atk + 30);
  assert.equal(cardB.hp, breedParts.BREED_BASE.hp + 30);
  assert.equal(cardB.catalogId, 'breedMonster', 'パターンが違っても図鑑/デッキ追跡用のcatalogIdは固定');
  assert.equal(cardB.imageDataUrl, sharedImage, 'ブリード画像は全パターン共通の1枚を使う');

  character.breedMonsterIndex = 0;
  assert.equal(breedParts.activeBreedMonster(character), patternA, '切り替えると即座に別パターンを返す');
  const cardA = breedParts.buildBreedCardDef(character);
  assert.equal(cardA.name, 'パターンA');
  assert.equal(cardA.imageDataUrl, sharedImage, 'パターンを切り替えても画像は変わらない');

  // 無効なindex（未設定・範囲外）は先頭パターンへフォールバックする。
  character.breedMonsterIndex = 99;
  assert.equal(breedParts.activeBreedMonster(character), patternA);
  delete character.breedMonsterIndex;
  assert.equal(breedParts.activeBreedMonster(character), patternA);
});

test('旧ブリード画像は選択中の1枚へ統合し、パターン別データを残さない', () => {
  const character = {
    breedMonsters: [
      { name: 'A', equippedPartIds: [], imageDataUrl: 'data:image/webp;base64,image-a' },
      { name: 'B', equippedPartIds: [], imageDataUrl: 'data:image/webp;base64,image-b' },
      { name: 'C', equippedPartIds: [] },
    ],
    breedMonsterIndex: 1,
  };

  assert.equal(breedParts.migrateBreedImageToShared(character), true);
  assert.equal(character.breedImageDataUrl, 'data:image/webp;base64,image-b', '選択中パターンの画像を残す');
  assert.ok(character.breedMonsters.every((pattern) => !Object.hasOwn(pattern, 'imageDataUrl')));
  assert.equal(breedParts.migrateBreedImageToShared(character), false, '移行済みデータは再変更しない');
});

test('水神の盾は水属性が装備すると被ダメージを反射する', () => {
  const attacker = unit(mon('攻', 50, 30, { element: 'neutral' }), 'A');
  const defender = unit(mon('守', 50, 10, { element: 'water' }), 'D');
  battle.equipItem(defender, ITEM_CATALOG.suijinNoTate);
  const r = battle.resolveBattle(attacker, defender, new battle.GoldLedger());
  const reflectedExchange = r.exchanges.find((e) => e.reflected);
  assert.ok(reflectedExchange, '反射の演出が記録されているはず');
  assert.equal(reflectedExchange.damage, 30, '反射ダメージは元の攻撃力と同じ');
  const defenderHit = r.exchanges.find((e) => e.side === 'attacker' && !e.reflected);
  assert.equal(defenderHit.damage, 0, '守備側は反射でノーダメージのはず');
});

test('水神の盾は属性が違うと反射せず、ATK+10/HP+20・貫通だけの防具になる', () => {
  const attacker = unit(mon('攻', 50, 30, { element: 'neutral' }), 'A');
  const defender = unit(mon('守', 50, 10, { element: 'fire' }), 'D');
  battle.equipItem(defender, ITEM_CATALOG.suijinNoTate);
  const stats = battle.statTotals(defender);
  assert.equal(stats.maxHp, 70, 'HP+20は属性を問わず乗る（戦闘前に確認、戦闘後はアイテムが外れる）');
  assert.equal(stats.atk, 20, 'ATK+10は属性を問わず乗る');
  assert.ok(battle.hasTrait(defender, 'pierce'), '貫通は属性を問わず乗る');
  const r = battle.resolveBattle(attacker, defender, new battle.GoldLedger());
  assert.ok(!r.exchanges.some((e) => e.reflected), '属性が違えば反射しない');
});

test('火神の盾・雷神の盾・森神の盾も一致属性でだけ反射する（属性神の盾4種の一般化）', () => {
  const cases = [
    [ITEM_CATALOG.kajinNoTate, 'fire'],
    [ITEM_CATALOG.raijinNoTate, 'thunder'],
    [ITEM_CATALOG.shinrinjinNoTate, 'forest'],
  ];
  for (const [item, element] of cases) {
    const attacker = unit(mon('攻', 50, 30, { element: 'neutral' }), 'A');
    const matched = unit(mon('守', 50, 10, { element }), 'D');
    battle.equipItem(matched, item);
    const matchedResult = battle.resolveBattle(attacker, matched, new battle.GoldLedger());
    assert.ok(matchedResult.exchanges.some((e) => e.reflected), `${item.name}: 一致属性は反射するはず`);

    const attacker2 = unit(mon('攻', 50, 30, { element: 'neutral' }), 'A');
    const mismatched = unit(mon('守', 50, 10, { element: 'water' }), 'D');
    battle.equipItem(mismatched, item);
    const mismatchedResult = battle.resolveBattle(attacker2, mismatched, new battle.GoldLedger());
    assert.ok(!mismatchedResult.exchanges.some((e) => e.reflected), `${item.name}: 不一致属性は反射しないはず`);
  }
});

test('_itemPowerScore: 属性神の盾は一致属性の時だけ反射込みの高評価になる（不一致は素のATK/HP/貫通どまり）', () => {
  const g = Object.create(Game.prototype);
  Object.assign(g, { players: [] });
  const waterUnit = { def: { element: 'water' } };
  const fireUnit = { def: { element: 'fire' } };
  const matchedScore = g._itemPowerScore(ITEM_CATALOG.suijinNoTate, waterUnit);
  const mismatchedScore = g._itemPowerScore(ITEM_CATALOG.suijinNoTate, fireUnit);
  assert.ok(matchedScore > mismatchedScore, '一致属性は反射効果分だけ高く評価されるはず');
  // ATK+10/HP+20・貫通(+10)分は不一致でも残るので、無価値な0点にはならない。
  assert.equal(mismatchedScore, 40);
});

test('CPUのアイテム選択: 属性神の盾は一致属性なら反射込みで確実に装備し、不一致では結果を変える時だけ装備する', () => {
  // _chooseBattleItemByOutcomeは実際にresolveBattleでシミュレートして比べる
  // ため、ここでは特別なif分岐を追加せず、既存の「結果で選ぶ」ロジックだけで
  // ユーザー要望（水属性なら装備／不一致でも装備すれば守れるなら装備／
  // 装備しても結果が変わらないなら装備しない）が成立することを確認する。
  const g = Object.create(Game.prototype);
  Object.assign(g, { tiles: [], players: [{ id: 'A' }, { id: 'B' }], onLog: () => {} });
  const tile = makeTile(0);
  const shieldCard = { ...ITEM_CATALOG.suijinNoTate, catalogId: 'suijinNoTate' };

  // 一致属性(水): 反射込みで生存できるので必ず装備する。
  const waterDef = mon('テスト水', 40, 10, { element: 'water' });
  const strongAttackerDef = mon('テスト攻撃', 100, 100, { element: 'thunder' });
  const chosenMatched = g._chooseBattleItemByOutcome(
    [shieldCard], 'CPU', unit(waterDef, 'A'), unit(strongAttackerDef, 'B'), tile, true, 8,
  );
  assert.equal(chosenMatched?.catalogId, 'suijinNoTate', '水属性なら反射で生存できるので装備するはず');

  // 不一致属性(火)かつ強すぎる相手: HP+20/ATK+10・貫通だけでは生存できず
  // 結果が変わらないので、カードを温存して装備しないはず。
  const fireDef = mon('テスト火', 40, 10, { element: 'fire' });
  const chosenNoHelp = g._chooseBattleItemByOutcome(
    [shieldCard], 'CPU', unit(fireDef, 'A'), unit(strongAttackerDef, 'B'), tile, true, 8,
  );
  assert.equal(chosenNoHelp, null, '不一致で装備しても結果が変わらないなら装備しないはず');

  // 不一致属性(火)だが相手が弱め: HP+20の底上げだけで生存できるようになる
  // ので、反射が無くても装備するはず。
  const weakAttackerDef = mon('テスト弱攻撃', 100, 45, { element: 'thunder' });
  const chosenStatsSave = g._chooseBattleItemByOutcome(
    [shieldCard], 'CPU', unit(fireDef, 'A'), unit(weakAttackerDef, 'B'), tile, true, 8,
  );
  assert.equal(chosenStatsSave?.catalogId, 'suijinNoTate', '不一致でもHP+20だけで生存できるなら装備するはず');
});

test('CPUの侵略勝率見積もり: 水属性が水神の盾を持つと反射込みで計算され、負け筋が勝ち筋に変わる', () => {
  const shieldCard = { ...ITEM_CATALOG.suijinNoTate, catalogId: 'suijinNoTate' };
  const g = Object.create(Game.prototype);
  const attackerPlayer = { id: 'A', currency: 500, hand: [shieldCard] };
  Object.assign(g, { tiles: [], players: [attackerPlayer, { id: 'B', currency: 500, hand: [] }], onLog: () => {} });

  // 素の数値だけなら攻撃側が反撃で必ず落ちる(HP20 vs 相手ATK40)不利な
  // マッチアップ。反射込みなら、装備すれば攻撃側は無傷のまま相手だけが
  // 反射ダメージで倒れる有利なマッチアップになる。
  const waterAttackerDef = mon('テスト水攻撃', 20, 30, { element: 'water' });
  const defenderDef = mon('テスト守備', 70, 40, { element: 'thunder' });
  const defenderTile = makeTile(0, { owner: 'B', unit: unit(defenderDef, 'B') });

  const withoutItem = g._estimateWinProbability(waterAttackerDef, 'A', [shieldCard], defenderTile, false, 30);
  const withItem = g._estimateWinProbability(waterAttackerDef, 'A', [shieldCard], defenderTile, true, 30);
  assert.equal(withoutItem, 0, '反射抜きでは反撃を受けて必ず負けるはず');
  assert.equal(withItem, 1, '反射込みで見積もると必ず勝てるはず');
});

test('ダメージスペルのCPUは避雷針侍・くねくねを最優先で狙う', () => {
  // どちらも「戦闘では処理できないロック」なので、総資産・土地レベルより
  // 優先して落とす（game.js _cpuPickDamageTarget）。
  const g = Object.create(Game.prototype);
  const rich = { id: 'R', name: '金持ち' };
  const poor = { id: 'P', name: '貧乏' };
  Object.assign(g, { players: [rich, poor], tiles: [], onLog: () => {} });
  // 総資産は「金持ち」が圧倒的に上＝優先度を入れなければ必ずそちらが選ばれる。
  g._totalAssetsOf = (p) => (p.id === 'R' ? 99999 : 1);

  const withUnit = (id, def, ownerId, level) => {
    const t = makeTile(id, { level });
    t.unit = unit(def, ownerId);
    return t;
  };
  // 金持ちの高レベル土地にいる普通のモンスター vs 貧乏の低レベル土地の避雷針侍。
  const fat = withUnit(0, mon('カモ', 10, 10), 'R', 5);
  const rod = withUnit(1, MONSTER_CATALOG.raiheishinZamurai, 'P', 1);
  assert.equal(g._cpuPickDamageTarget([fat, rod], 15).id, rod.id, '避雷針侍を優先するはず');

  const kune = withUnit(2, MONSTER_CATALOG.kunekune, 'P', 1);
  assert.equal(g._cpuPickDamageTarget([fat, kune], 15).id, kune.id, 'くねくねを優先するはず');

  // ロックが居なければ従来どおり総資産1位を狙う（既存挙動を壊していない）。
  const plain = withUnit(3, mon('雑魚', 10, 10), 'P', 1);
  assert.equal(g._cpuPickDamageTarget([fat, plain], 15).id, fat.id, 'ロック不在なら総資産1位');

  // くぐつの剣豪はさらに上。毎手番こちらの土地へ自動侵略してくるうえ
  // 移動コマンドでも動かせないので、一撃で倒せなくても削りにいく
  // （ユーザー指定、2026-09）。
  const kugutsu = withUnit(4, MONSTER_CATALOG.kugutsuNoKengou, 'P', 1);
  assert.ok(MONSTER_CATALOG.kugutsuNoKengou.hp > 15, 'HP50なのでファイヤーボール15では落ちない前提');
  // 一撃で倒せる「カモ」(HP10)が総資産1位の高レベル土地に居ても、
  // 倒せないくぐつの方を狙う＝killable判定より前に優先が効いていること。
  assert.equal(g._cpuPickDamageTarget([fat, kugutsu], 15).id, kugutsu.id,
    'くぐつは倒せなくても最優先で削るはず');
  // 避雷針侍・くねくねよりも上。
  assert.equal(g._cpuPickDamageTarget([rod, kugutsu], 15).id, kugutsu.id, 'くぐつ > 避雷針侍');
  assert.equal(g._cpuPickDamageTarget([kune, kugutsu], 15).id, kugutsu.id, 'くぐつ > くねくね');
  // くぐつが複数居るなら、その中で倒せる方（＝削れている方）を仕留める。
  const hurtKugutsu = withUnit(5, MONSTER_CATALOG.kugutsuNoKengou, 'P', 1);
  hurtKugutsu.unit.currentHp = 10;
  assert.equal(g._cpuPickDamageTarget([kugutsu, hurtKugutsu], 15).id, hurtKugutsu.id,
    'くぐつが複数なら倒せる方を先に落とす');
});

test('川田のデッキに資本主義の権化を1枚含める（ユーザー指定）', () => {
  const kawada = buildCharacterCardList('kawada');
  assert.equal(kawada.length, 40);
  // 川田デッキにはユーザー指定で資本主義の権化を1枚採用する。
  assert.equal(
    kawada.filter((c) => c.name === '資本主義の権化').length, 1,
    '川田デッキに資本主義の権化が1枚ない',
  );
});

test('お札を開幕から仕込むCPUは居ない（全ステージ、盤面で自然に買わせる）', () => {
  const stage = STORY_STAGES.find((s) => s.key === 'kawada');
  assert.equal(stage.startingCurrency, 700);
  // ⑮はお札対応マップ。川田は他のCPUと同じくゴール／CPの取引所で
  // _cpuMaybeTradeOfudaを通して買う（開幕の作り置きはしない）。
  assert.ok(MAPS.find((m) => m.id === 'kawada').hasOfuda);
  // かつて⑮川田だけ opponent.startingOfuda で開幕に15枚持たせていたが、
  // 「開幕から仕込むのは不自然、自然に買え」という指定で仕組みごと撤去した。
  // 誰かが再び足さないよう、全ステージ・全ロールを見張る。
  for (const s of STORY_STAGES) {
    for (const who of [...(s.opponents ?? []), s.ally, s.extraAlly].filter(Boolean)) {
      assert.equal(who.startingOfuda, undefined, `${s.key}の${who.name}に開幕お札が復活している`);
    }
  }
});

test('土地神の怒りは属性の合わない土地のモンスターだけを撃つ（自分のも巻き込む）', async () => {
  const water = (id, tileElement, unitElement, owner) => {
    const t = makeTile(id, { element: tileElement });
    t.unit = unit(mon(`M${id}`, 50, 10, { element: unitElement }), owner);
    return t;
  };
  // ①属性一致（水の土地に水） ②不一致（火の土地に水） ③無属性は
  // 無属性以外の土地では常に不一致 ④無属性の土地に無属性なら一致。
  const tiles = [
    water(0, 'water', 'water', 'A'),
    water(1, 'fire', 'water', 'A'),
    water(2, 'fire', 'neutral', 'B'),
    water(3, 'neutral', 'neutral', 'B'),
  ];
  const g = makeStub(tiles, [{ id: 'A', name: '川田' }, { id: 'B', name: '敵' }]);
  g._spellDamageUnit = async (t, amount) => { t.unit.currentHp -= amount; };
  await g._applySpellEffect(
    { name: '土地神の怒り', effect: { type: 'damageAllUnitsOnMismatchedLand', amount: 15 } },
    { effect: { type: 'damageAllUnitsOnMismatchedLand', amount: 15 } },
    {},
  );
  assert.equal(tiles[0].unit.currentHp, 50, '属性が一致していれば無傷');
  assert.equal(tiles[1].unit.currentHp, 35, '不一致なら15ダメージ（自分のモンスターも対象）');
  assert.equal(tiles[2].unit.currentHp, 35, '無属性は属性土地では不一致扱い');
  assert.equal(tiles[3].unit.currentHp, 50, '無属性の土地の無属性は一致');
});

test('土地神の怒りはパンデミック後のゾンビを全滅させない（コンボ防止の下限）', () => {
  // パンデミックは盤面の全モンスターをゾンビ(無属性)へ変える。無属性マスの
  // 無い盤面ではゾンビ全員が「異属性土地」判定になるため、土地神の怒りの
  // ダメージがゾンビのHP以上だと盤面が丸ごと消える即死コンボになる。
  // ダメージを上げる時はこのテストが落ちるので必ず気づける。
  const zombieHp = MONSTER_CATALOG.zombie.hp;
  const amount = SPELL_CATALOG.tochigamiNoIkari.effect.amount;
  assert.ok(
    amount < zombieHp,
    `土地神の怒り(${amount})はゾンビのHP(${zombieHp})未満でなければならない（パンデミックとの全滅コンボ防止）`,
  );
});

test('社会不適合は属性の合わないモンスターを最大2体だけ手札に戻す', async () => {
  const meshStub = () => ({ mesh: { material: { color: { set: () => {} } } } });
  const make = (id, tileElement, unitElement, owner) => {
    const t = makeTile(id, { element: tileElement, owner, ...meshStub() });
    t.unit = unit(mon(`M${id}`, 50, 10, { element: unitElement }), owner);
    return t;
  };
  // 敵Bの不一致3体・一致1体、自分Aの不一致1体。戻るのはBの不一致から2体だけ。
  const tiles = [
    make(0, 'fire', 'thunder', 'B'),
    make(1, 'water', 'thunder', 'B'),
    make(2, 'forest', 'thunder', 'B'),
    make(3, 'thunder', 'thunder', 'B'),
    make(4, 'fire', 'water', 'A'),
  ];
  const enemy = { id: 'B', name: '敵', hand: [], deck: { discardPile: [], drawPile: [] } };
  const g = makeStub(tiles, [{ id: 'A', name: '川田' }, enemy]);
  g.onLandLoss = async () => {};
  await g._spellReturnMismatchedMonstersToHand(enemy, 2);

  assert.equal(enemy.hand.length, 2, '2体だけ戻る');
  assert.equal(tiles.filter((t) => t.unit && t.owner === 'B').length, 2, '敵の残りは2体');
  assert.ok(tiles[3].unit, '属性が一致しているモンスターは戻らない');
  assert.ok(tiles[4].unit, '対象プレイヤー以外のモンスターは戻らない');
  // 戻ったマスは空き地に戻る（所有者ごと解除される）。
  const vacated = tiles.filter((t) => !t.unit);
  for (const t of vacated) assert.equal(t.owner, null, '戻ったマスは空き地になる');
});

test('社会不適合は該当1体なら1体だけ、0体なら何も起きない', async () => {
  const enemy = () => ({ id: 'B', name: '敵', hand: [], deck: { discardPile: [], drawPile: [] } });

  const meshStub = () => ({ mesh: { material: { color: { set: () => {} } } } });
  const one = makeTile(0, { element: 'fire', owner: 'B', ...meshStub() });
  one.unit = unit(mon('単体', 50, 10, { element: 'water' }), 'B');
  const e1 = enemy();
  const g1 = makeStub([one], [{ id: 'A', name: '川田' }, e1]);
  g1.onLandLoss = async () => {};
  await g1._spellReturnMismatchedMonstersToHand(e1, 2);
  assert.equal(e1.hand.length, 1, '該当が1体なら1体だけ戻る');

  const matched = makeTile(0, { element: 'water', owner: 'B', ...meshStub() });
  matched.unit = unit(mon('一致', 50, 10, { element: 'water' }), 'B');
  const e0 = enemy();
  const g0 = makeStub([matched], [{ id: 'A', name: '川田' }, e0]);
  g0.onLandLoss = async () => {};
  await g0._spellReturnMismatchedMonstersToHand(e0, 2);
  assert.equal(e0.hand.length, 0, '該当0体なら何も戻らない');
  assert.ok(matched.unit, '盤面もそのまま');
  assert.ok(g0.logs.some((l) => l.includes('対象がいなかった')), '「対象がいなかった」と表示する');
});

test('社会不適合は変身前カードを戻し、盤面外生成カードをデッキへ混ぜない', async () => {
  const meshStub = () => ({ mesh: { material: { color: { set: () => {} } } } });

  // めたんまんは盤面上で別モンスターへ変身していても、召喚元のめたんまんを
  // 捨札から回収して手札へ戻す。変身先を戻すと元デッキに無いカードが増える。
  const originalMeta = { ...MONSTER_CATALOG.metaOn, id: 'meta-original', catalogId: 'metaOn' };
  const transformed = { ...MONSTER_CATALOG.molotovMan, id: 'meta-transformed', catalogId: 'molotovMan' };
  const metaTile = makeTile(0, { element: 'water', owner: 'B', ...meshStub() });
  metaTile.unit = unit(transformed, 'B');
  metaTile.unit.originalDef = originalMeta;
  const metaOwner = {
    id: 'B', name: '敵', hand: [],
    deck: { discardPile: [originalMeta], drawPile: [] },
  };
  const metaGame = makeStub([metaTile], [{ id: 'A', name: '川田' }, metaOwner]);
  metaGame.onLandLoss = async () => {};
  await metaGame._spellReturnMismatchedMonstersToHand(metaOwner, 1);
  assert.equal(metaOwner.hand.length, 1);
  assert.equal(metaOwner.hand[0].catalogId, 'metaOn', '変身先ではなく元のめたんまんへ戻る');
  assert.equal(metaOwner.deck.discardPile.length, 0, '召喚時に捨てた元カードを回収する');

  // 開示請求等で盤面外生成されたカードは、同名の正規カードが捨札にあっても
  // それを誤回収せず、一時カードの印を保ったまま手札へ戻す。
  const generated = {
    ...MONSTER_CATALOG.kunekune,
    id: 'outside-kune',
    catalogId: 'kunekune',
    generatedOutsideDeck: true,
  };
  const regular = { ...MONSTER_CATALOG.kunekune, id: 'regular-kune', catalogId: 'kunekune' };
  const generatedTile = makeTile(0, { element: 'fire', owner: 'B', ...meshStub() });
  generatedTile.unit = unit(generated, 'B');
  const generatedOwner = {
    id: 'B', name: '敵', hand: [],
    deck: { discardPile: [regular], drawPile: [] },
  };
  const generatedGame = makeStub([generatedTile], [{ id: 'A', name: '川田' }, generatedOwner]);
  generatedGame.onLandLoss = async () => {};
  await generatedGame._spellReturnMismatchedMonstersToHand(generatedOwner, 1);
  assert.equal(generatedOwner.hand[0].generatedOutsideDeck, true, '盤面外生成フラグを保持する');
  assert.equal(generatedOwner.deck.discardPile.length, 1, '同名の正規カードを誤回収しない');
  generatedGame._discardUsedCard(generatedOwner, generatedOwner.hand[0]);
  assert.equal(generatedOwner.deck.discardPile.length, 1, '再使用後も40枚デッキへ混ざらない');
});

test('ギア合体で生まれたガシャーンは盤面外生成として社会不適合後もデッキへ混ざらない', async () => {
  const meshStub = () => ({ mesh: { material: { color: { set: () => {} } } } });
  const player = {
    id: 'B', name: '敵', currency: 0, hand: [],
    deck: {
      discardPile: ['kodaiNoGearA', 'kodaiNoGearB', 'kodaiNoGearC'].map((id) => ({
        ...MONSTER_CATALOG[id], id: `discard-${id}`, catalogId: id,
      })),
      drawPile: [],
    },
  };
  const gearA = makeTile(0, { element: 'fire', owner: 'B', ...meshStub() });
  const gearB = makeTile(1, { element: 'neutral', owner: 'B', ...meshStub() });
  const gearC = makeTile(2, { element: 'neutral', owner: 'B', ...meshStub() });
  gearA.unit = unit(MONSTER_CATALOG.kodaiNoGearA, 'B');
  gearB.unit = unit(MONSTER_CATALOG.kodaiNoGearB, 'B');
  gearC.unit = unit(MONSTER_CATALOG.kodaiNoGearC, 'B');
  const g = makeStub([gearA, gearB, gearC], [{ id: 'A', name: '川田' }, player]);
  g.onLandLoss = async () => {};

  g._maybeFuseGear(gearA, player, MONSTER_CATALOG.kodaiNoGearA);
  assert.equal(gearA.unit.def.catalogId, 'gashaan-field');
  assert.equal(gearA.unit.def.generatedOutsideDeck, true, '合体先は盤面外生成カードになる');

  await g._spellReturnMismatchedMonstersToHand(player, 1);
  assert.equal(player.hand[0].catalogId, 'gashaan-field');
  assert.equal(player.hand[0].generatedOutsideDeck, true);
  assert.equal(player.deck.discardPile.length, 3, '元のギア3枚だけがデッキに残る');
  g._discardUsedCard(player, player.hand[0]);
  assert.equal(player.deck.discardPile.length, 3, '戻ったガシャーンを使っても41枚目にならない');
});

test('チュートリアル最後の移動侵略は戦闘完了後にmoveイベントを通知する', async () => {
  const order = [];
  const player = { id: 'H', name: 'プレイヤー', allianceId: null };
  const enemy = { id: 'C', name: '敵CPU', allianceId: null };
  const source = makeTile(0, { owner: 'H', gridX: 0, gridZ: 0, neighbors: [1] });
  const target = makeTile(1, { owner: 'C', gridX: 1, gridZ: 0, neighbors: [0] });
  source.unit = unit(MONSTER_CATALOG.kunekune, 'H');
  source.unitMesh = {};
  target.unit = unit(MONSTER_CATALOG.jukaiNoOnryou, 'C');

  const g = makeStub([source, target], [player, enemy]);
  Object.assign(g, {
    onPickMoveDirection: async () => target.id,
    onConfirmMove: async () => true,
    getTileSummary: () => ({}),
    _captureLandLoss: () => null,
    _captureLandGain: () => null,
    _runBattleScene: async () => {
      order.push('battle-complete');
      return { attackerSurvived: true, defenderSurvived: true };
    },
    _maybeRedirectDeathToLightningRod: async () => {},
    _hopUnitIcon: async () => { order.push('move-animation'); },
    onTutorialEvent: (type) => { order.push(`${type}-event`); },
  });

  assert.equal(await g._humanMoveFlow(player, source), true);
  assert.ok(order.indexOf('battle-complete') >= 0, '移動侵略の戦闘が実行される');
  assert.ok(
    order.indexOf('move-event') > order.lastIndexOf('move-animation'),
    `完了通知は戦闘・移動演出の後でなければならない: ${order.join(' -> ')}`,
  );
});

test('社会不適合のCPUは相手の属性違いが2体以上の時だけ撃つ', async () => {
  const build = (mismatchCount) => {
    const tiles = [];
    for (let i = 0; i < mismatchCount; i++) {
      const t = makeTile(i, { element: 'fire', owner: 'B' });
      t.unit = unit(mon(`敵${i}`, 50, 10, { element: 'thunder' }), 'B');
      tiles.push(t);
    }
    const player = {
      id: 'A', name: '川田', currency: 999, spellUsedThisTurn: false, allianceId: null,
      hand: [spellCopy(SPELL_CATALOG.shakaiFutekigou)],
    };
    return { g: makeCpuStub(tiles, [player, { id: 'B', name: '敵', allianceId: null }]), player };
  };

  const two = build(2);
  await two.g._cpuMaybeUseShakaiFutekigouSpell(two.player);
  assert.equal(two.g.casts.length, 1, '2体以上なら撃つ');
  assert.equal(two.g.casts[0].cast.targetPlayerId, 'B');

  const one = build(1);
  await one.g._cpuMaybeUseShakaiFutekigouSpell(one.player);
  assert.equal(one.g.casts.length, 0, '1体しか居なければ撃たない');
});

test('チュートリアルの台本どおりに進むと想定のマスへ着地する', async () => {
  // チュートリアルは完全な台本で進む（運の要素を排除、2026-08のユーザー指定）。
  // main.jsのtutorialDiceQueuesを変えると振り付けが崩れるので、リング順を
  // 実際に辿って着地マスを検証する。盤面・出目のどちらを変えてもここで気づける。
  const tiles = createBoard('tutorial');
  assert.equal(tiles.length, 8, 'チュートリアル盤面は8マス');

  // スタート(0)から一方向に辿ったリング順。
  const ring = [0];
  let cur = 0;
  let prev = null;
  for (let i = 0; i < tiles.length - 1; i++) {
    const next = tiles[cur].neighbors.find((n) => n !== prev);
    ring.push(next);
    prev = cur;
    cur = next;
  }
  assert.deepEqual(ring, [0, 1, 2, 4, 7, 6, 5, 3], 'リング順が変わっている');

  const advance = (from, steps) => ring[(ring.indexOf(from) + steps) % ring.length];

  // main.js の tutorialDiceQueues と同じ値。自6だけアイキャンフライで2倍。
  const humanDice = [1, 1, 2, 2, 2, 2];
  const cpuDice = [1, 2, 2, 2, 2];

  let human = 0;
  const humanLandings = humanDice.map((d, i) => {
    human = advance(human, i === humanDice.length - 1 ? d * 2 : d);
    return human;
  });
  let cpu = 0;
  const cpuLandings = cpuDice.map((d) => { cpu = advance(cpu, d); return cpu; });

  assert.deepEqual(humanLandings, [1, 2, 7, 5, 0, 7],
    '自1→マス1, 自2→CP(2), 自3→マス7, 自4→マス5, 自5→スタート(0), 自6→マス7');
  assert.deepEqual(cpuLandings, [1, 4, 6, 3, 1],
    '敵1→マス1(侵略), 敵2→マス4, 敵3→マス6, 敵4→マス3, 敵5→マス1(通行料)');

  // 台本が成立するためのマスの性質。
  assert.equal(tiles[1].element, 'fire', 'マス1は火（火付け役と同属性）');
  assert.equal(tiles[2].type, TileType.EVENT, 'マス2はCP＝停止すると全所有地に土地コマンドが使える');
  assert.equal(tiles[0].type, TileType.START, '自5はスタートに停止して全所有地へアクセスする');
  assert.equal(tiles[4].element, 'forest', 'マス4は森（樹海の怨霊と同属性）');
  assert.ok(tiles[7].neighbors.includes(4), '自6の移動侵略のため、マス7とマス4は隣接している必要がある');

  // 火炎瓶男(射程3)の特殊効果がマス4の怨霊へ届くこと。マス3からだと距離4で
  // 届かないので、召喚先をマス5から動かすとここで落ちる。
  const distance = (fromId, toId) => {
    const seen = new Set([fromId]);
    let frontier = [fromId];
    let d = 0;
    while (frontier.length) {
      d += 1;
      const next = [];
      for (const id of frontier) {
        for (const n of tiles[id].neighbors) {
          if (seen.has(n)) continue;
          if (n === toId) return d;
          seen.add(n);
          next.push(n);
        }
      }
      frontier = next;
    }
    return Infinity;
  };
  assert.ok(distance(5, 4) <= MONSTER_CATALOG.molotovMan.ability.range,
    '火炎瓶男はマス5からマス4の怨霊へ届く必要がある');
  assert.equal(MONSTER_CATALOG.molotovMan.ability.type, 'damage');
});

test('チュートリアル: 誘導中はCPUの目標達成を握り潰し、終えたら決着させる', async () => {
  // 握り潰したままだと「CPUが先に目標を超えてゴールに立っても何も起きない」
  // という不自然な状態になる（2026-08のユーザー報告）。誘導ステップを終えた
  // 後は普通の対戦として決着させる。
  const cpu = { id: 'C', name: 'CPU', isCPU: true, allianceId: null, defeated: false };
  const human = { id: 'H', name: '人', isCPU: false, allianceId: null, defeated: false };
  const make = (guidedComplete) => {
    const g = Object.create(Game.prototype);
    const ends = [];
    Object.assign(g, {
      players: [human, cpu], tiles: [{ position: null }], goalCurrency: 5000,
      storyEnded: false, storyMode: true, tutorialMode: true,
      tutorialGuidedComplete: guidedComplete,
      onLog: () => {}, _notifyState: () => {},
      onGoalAchieved: async () => {},
      onStoryBattleEnd: async (r) => { ends.push(r); },
      _totalAssetsOf: () => 9999,
    });
    return { g, ends };
  };

  const during = make(false);
  assert.equal(await during.g._checkGoalAchievement(cpu), false, '誘導中はCPUで決着しない');
  assert.equal(during.ends.length, 0);
  assert.equal(during.g.storyEnded, false);

  const after = make(true);
  assert.equal(await after.g._checkGoalAchievement(cpu), true, '誘導を終えたらCPUでも決着する');
  assert.equal(after.ends[0].won, false, 'CPU勝利なので人間側の敗北として渡す');

  // 人間の達成は誘導中でも常に決着する（既存挙動を壊していない）。
  const player = make(false);
  assert.equal(await player.g._checkGoalAchievement(human), true);
  assert.equal(player.ends[0].won, true);
});

test('属性神の盾の反射は貫通で無効化されない（絶対反射）', () => {
  // ユーザー指定(2026-08): 神の盾シリーズは「絶対反射」＝貫通無効。
  const attacker = unit(mon('攻', 50, 30, { element: 'neutral', traits: ['pierce'] }), 'A');
  const defender = unit(mon('守', 50, 10, { element: 'water' }), 'D');
  battle.equipItem(defender, ITEM_CATALOG.suijinNoTate);
  assert.ok(battle.hasTrait(attacker, 'pierce'), '前提: 攻撃側は貫通持ち');
  const r = battle.resolveBattle(attacker, defender, new battle.GoldLedger());
  assert.ok(r.exchanges.some((e) => e.reflected), '貫通でも盾の反射は止まらない');
});

test('くねくね自身の反射は従来どおり貫通で抜ける（盾とは別扱い）', () => {
  // 盾だけをunpierceableにしたので、モンスター固有の反射は変えていない。
  const attacker = unit(mon('攻', 50, 30, { element: 'neutral', traits: ['pierce'] }), 'A');
  const kune = unit(MONSTER_CATALOG.kunekune, 'D');
  const r = battle.resolveBattle(attacker, kune, new battle.GoldLedger());
  assert.ok(!r.exchanges.some((e) => e.reflected), 'くねくねの反射は貫通で抜ける');
});

test('異次元ソケット同士は打ち消し合って何も入れ替わらない', () => {
  // ユーザー指定(2026-08):「異次元ソケットと異次元ソケットは元に戻るだけ」。
  // 以前は双方のdefのtraits/effectだけが1回交換されてしまっていた。
  const attackerDef = mon('攻', 50, 30, { element: 'fire', traits: ['firstStrike'] });
  const defenderDef = mon('守', 50, 30, { element: 'water', traits: ['pierce'] });
  const attacker = unit(attackerDef, 'A');
  const defender = unit(defenderDef, 'D');
  battle.equipItem(attacker, ITEM_CATALOG.dimensionalSocket);
  battle.equipItem(defender, ITEM_CATALOG.dimensionalSocket);
  battle.applyPreAttackItemEffects(attacker, defender);
  assert.ok(battle.hasTrait(attacker, 'firstStrike'), '攻撃側は自分の先制を保つ');
  assert.ok(!battle.hasTrait(attacker, 'pierce'), '相手の貫通を受け取らない');
  assert.ok(battle.hasTrait(defender, 'pierce'), '守備側は自分の貫通を保つ');
  assert.ok(!battle.hasTrait(defender, 'firstStrike'), '相手の先制を受け取らない');
});

test('属性神の盾は持ち主が替わっても属性一致の時だけ反射する', () => {
  // 装備時の属性で効果を固定せず、真剣白刃取りや異次元ソケットで持ち主が
  // 替わった後も、現在の装備者とwielderElementを突き合わせて再判定する。
  const thunder = (name, atk) => mon(name, 60, atk, { element: 'thunder' });
  const build = (thiefDef, thiefItem) => {
    const d = unit(thunder('雷モンスター', 10), 'D');
    battle.equipItem(d, ITEM_CATALOG.raijinNoTate);
    const a = unit(thiefDef, 'A');
    battle.equipItem(a, thiefItem);
    return battle.resolveBattle(a, d, new battle.GoldLedger());
  };

  // 無属性が奪う → 属性が合わないので反射しない。
  const stolenByNeutral = build(mon('無属性の泥棒', 60, 30, { element: 'neutral' }), ITEM_CATALOG.shinkenShirahadori);
  assert.ok(!stolenByNeutral.exchanges.some((e) => e.reflected), '属性が合わない泥棒は反射を得ない');

  // 雷属性が奪う → 属性が合うので奪った側が反射する。
  const stolenByThunder = build(thunder('雷の泥棒', 30), ITEM_CATALOG.shinkenShirahadori);
  const byThief = stolenByThunder.exchanges.find((e) => e.reflected);
  assert.ok(byThief, '属性が合う泥棒は反射を得る');
  assert.equal(byThief.side, 'attacker', '反射するのは盾を奪った攻撃側');

  // 異次元ソケットで効果を移された無属性も反射しない。
  const viaSocket = build(mon('無属性', 60, 30, { element: 'neutral' }), ITEM_CATALOG.dimensionalSocket);
  assert.ok(!viaSocket.exchanges.some((e) => e.reflected), 'ソケットで移されても属性が合わなければ反射しない');
});

test('属性不一致で装備した神の盾も、一致属性の相手に奪われれば絶対反射が発動する', () => {
  // 装備時点でだけ属性判定すると、火モンスターが装備した水神の盾は効果が
  // 無いまま固定され、水モンスターが白刃取りで奪っても反射できなかった。
  const defender = unit(mon('火の盾持ち', 60, 10, { element: 'fire' }), 'D');
  battle.equipItem(defender, ITEM_CATALOG.suijinNoTate);
  const attacker = unit(mon('水の泥棒', 60, 30, { element: 'water' }), 'A');
  battle.equipItem(attacker, ITEM_CATALOG.shinkenShirahadori);
  const r = battle.resolveBattle(attacker, defender, new battle.GoldLedger());
  const reflected = r.exchanges.find((e) => e.reflected);
  assert.ok(reflected, '現在の装備者が水属性なので奪った水神の盾が反射する');
  assert.equal(reflected.side, 'attacker');
});

test('属性神の盾はアイテム破壊で失われれば反射しない（仕様どおり）', () => {
  // 「雷モンスターに雷神の盾を着けたのに反射しなかった」の再現条件のひとつ。
  // 海賊S等のdestroyItemBeforeAttackは戦闘開始前に装備ごと消すので、
  // 盾の効果も一緒に消える（バグではない）。
  const d = unit(mon('雷', 60, 10, { element: 'thunder' }), 'D');
  battle.equipItem(d, ITEM_CATALOG.raijinNoTate);
  const pirate = { ...mon('海賊', 60, 30, { element: 'water' }), effect: { type: 'destroyItemBeforeAttack' } };
  const r = battle.resolveBattle(unit(pirate, 'A'), d, new battle.GoldLedger());
  assert.ok(!r.exchanges.some((e) => e.reflected), 'アイテムを破壊されたら反射は起きない');
});

test('酢の朕専用制限は撤廃済み（所持数がデッキ編集のゲート）', () => {
  // ユーザー指定(2026-08):「配布しなければ制限と同じだから、制限撤廃で」。
  // npcExclusive+exclusiveOwnerNameが残っていると、配ってもgame.jsの
  // デッキ構築フィルタが黙って除外して枚数の減ったデッキになる。
  const su = MONSTER_CATALOG.su;
  assert.equal(su.npcExclusive, undefined, '酢にnpcExclusiveが残っている');
  assert.equal(su.exclusiveOwnerName, undefined, '酢にexclusiveOwnerNameが残っている');
  assert.equal(su.rarity, 'EX', 'EXなのでパック排出の対象外なのは従来どおり');

  // game.jsのpermittedDeckListと同じ条件。誰のデッキでも落ちない。
  const permitted = (name, list) => list.filter((c) => (
    !c.npcExclusive || !c.exclusiveOwnerName || c.exclusiveOwnerName === name
  ));
  const deck = [{ ...su, catalogId: 'su' }];
  assert.equal(permitted('川田', deck).length, 1, '朕以外のデッキでも除外されない');
  assert.equal(permitted('朕', deck).length, 1, '朕のデッキではもちろん通る');

  // サーティーのブリモンの専用制限まで巻き添えにしていないこと。
  assert.equal(MONSTER_CATALOG.thirtyBreedMonster.npcExclusive, true);
  assert.equal(MONSTER_CATALOG.thirtyBreedMonster.exclusiveOwnerName, 'サーティー');
});

test('合体ロボ・ガシャーンはEXカードとしてカタログに載る（合体経路は不変）', () => {
  // ユーザー指定(2026-08)でカード化。それまでは盤面専用の実体で
  // MONSTER_CATALOGに無く、⑯のEX全配布で配れなかった。
  const g = MONSTER_CATALOG['gashaan-field'];
  assert.ok(g, 'MONSTER_CATALOGに登録されていない');
  // game.jsが MONSTER_CATALOG[catalogId] で引く箇所があるのでキーと一致が必須。
  assert.equal(g.catalogId, 'gashaan-field', 'カタログのキーとcatalogIdが食い違っている');
  assert.equal(g.rarity, 'EX');
  assert.deepEqual([g.atk, g.hp], [70, 70]);
  assert.ok(g.traits.includes('pierce'));
  assert.equal(g.ability.type, 'warpToAnyEmptyLand');

  // ⚠️ コスト0のままカタログへ出すと70/70貫通が無料で召喚できてしまう。
  // 合体経路はこのcostを参照しない（ギア側のコストを払い戻して直接置く）ので、
  // 手札から普通に召喚する時のための値付けとして必ず正の値を持たせる。
  assert.ok(g.cost > 0, '召喚コストが0のままだと無料で出せてしまう');
  assert.ok(g.cost >= MONSTER_CATALOG.su.cost, '酢(60/60)より強いので酢以上のコストにする');

  // 図鑑/デッキ編集のカタログに1件だけ載る（重複登録していない）。
  const listed = getCardCatalog(null).filter((c) => c.name === '合体ロボ・ガシャーン');
  assert.equal(listed.length, 1, 'カタログに重複または未登録');
  // EXなのでパック排出の対象外なのは従来どおり（main.jsのunobtainable判定）。
  assert.equal(g.npcExclusive, undefined);
  assert.equal(g.wip, undefined);
});

test('CPUは盾が噛み合う相手へ侵略する時だけ属性神の盾を温存する', () => {
  // 盾の反射は絶対反射なので、相手も同条件で盾を使えると攻撃側は自分の
  // 攻撃力ぶんを反射で食らうだけで土地を絶対に奪えない（実測で奪取率0%）。
  // その場面で80Gの盾を切るのは丸損なので装備しない（ユーザー指定2026-08）。
  // 防衛側では従来どおり使う。
  const g = Object.create(Game.prototype);
  Object.assign(g, { tiles: [], players: [{ id: 'A' }, { id: 'B' }], onLog: () => {} });
  const tile = makeTile(0, { element: 'water', owner: 'B' });
  const hand = [
    { ...ITEM_CATALOG.suijinNoTate, id: 's1', catalogId: 'suijinNoTate' },
    { ...ITEM_CATALOG.twinHammer, id: 't1', catalogId: 'twinHammer' },
  ];
  const water = () => mon('水', 50, 50, { element: 'water' });
  const fire = () => mon('火', 50, 50, { element: 'fire' });
  const pick = (self, opponent, isDefender) => g._chooseBattleItemByOutcome(
    hand, '川田', unit(self, 'A'), unit(opponent, 'B'), tile, isDefender, 20, 999,
  );

  // 侵略側 × 相手も水 → 盾は無駄なので選ばない。
  assert.notEqual(pick(water(), water(), false)?.catalogId, 'suijinNoTate',
    '噛み合う相手への侵略で盾を切っている');
  // 侵略側でも相手の属性が違えば反射されないので普通に使う。
  assert.equal(pick(water(), fire(), false)?.catalogId, 'suijinNoTate',
    '相手が異属性なら盾は有効なので使うべき');
  // 防衛側は相手が同属性でも使う（守る側には反射がそのまま効く）。
  assert.equal(pick(water(), water(), true)?.catalogId, 'suijinNoTate',
    '防衛では従来どおり盾を使うべき');
  // 自分が不一致属性＝そもそも反射目当てではないので温存対象にしない。
  assert.equal(pick(fire(), water(), false)?.catalogId, 'suijinNoTate',
    '自分が不一致属性なら温存ロジックの対象外');
});

test('ストーリーの話者は全員が立ち絵を引ける', async () => {
  // 立ち絵はNPC_PORTRAIT_URLを名前で引くだけなので、表記ゆれがあると
  // そのステージだけ静かに立ち絵が出なくなる。実際⑦は「段ボール男」表記で
  // （⑤⑥は「ダンボール男」）立ち絵が欠けていた（2026-08に発見・修正）。
  const { npcPortraitUrl } = await vite.ssrLoadModule('/src/npcArt.js');
  assert.equal(npcPortraitUrl('段ボール男'), npcPortraitUrl('ダンボール男'),
    '「段ボール男」表記でも同じ立ち絵を引けること');

  const speakers = new Set();
  for (const stage of STORY_STAGES) {
    for (const variant of [stage, stage.replay, stage.secretReplay].filter(Boolean)) {
      for (const key of ['intro', 'outro']) {
        for (const line of (variant[key] ?? stage[key] ?? [])) speakers.add(line.speaker);
      }
    }
  }
  speakers.delete('???');
  speakers.delete('主人公'); // 主人公はプレイヤー自身のアイコンを使う
  const missing = [...speakers].filter((name) => !npcPortraitUrl(name));
  assert.deepEqual(missing, [], `立ち絵を引けない話者: ${missing.join(', ')}`);
});

test('主人公の一人称は全ステージで「俺」に統一されている', () => {
  // ⑮だけ「ワイ」＋関西弁になっていたのをユーザー指定で「俺」へ統一した
  // （2026-08）。以後どのステージを足す時もこの口調に揃えること。
  const lines = STORY_STAGES
    .flatMap((stage) => [stage, stage.replay, stage.secretReplay].filter(Boolean))
    .flatMap((variant) => ['intro', 'outro'].flatMap((key) => variant[key] ?? []))
    .filter((line) => line.speaker === '主人公');
  const wai = lines.filter((line) => /ワイ/.test(line.text)).map((line) => line.text);
  assert.deepEqual(wai, [], `主人公が「ワイ」と言っている: ${wai.join(' / ')}`);
  // 「俺」が使われていること自体も確認（一人称が消えた事故に気づけるように）。
  assert.ok(lines.some((line) => /俺/.test(line.text)), '主人公の一人称「俺」が1つも無い');
});

test('川田（⑮予定）の専用デッキはちょうど40枚', () => {
  const list = buildCharacterDeckList('kawada');
  assert.equal(list.length, 40);
});

test('ステージ15(川田)は専用マップ・会話・デッキへ正しく接続されている', () => {
  // main.jsのstartStoryBattleはmapId省略時stage.keyをそのままmapIdに使う。
  // board.jsにid:'kawada'のマップが無いと、getMap()がMAPS[0]（①ヒトデの
  // 縄張り）へ静かにフォールバックし、盤面・背景が食い違う事故になる
  // ―― ここでmapが実在することを直接確認する。
  const stage = STORY_STAGES.find((entry) => entry.key === 'kawada');
  const map = MAPS.find((entry) => entry.id === 'kawada');
  assert.ok(stage && map, 'ステージ・マップが両方見つからない');
  assert.equal(stage.opponents[0].deckKey, 'kawada');
  assert.equal(stage.opponents[0].name, '川田');
  assert.doesNotMatch(stage.title, /仮公開/, '背景と立ち絵が揃ったので仮公開表記を残さない');
  assert.equal(stage.wip, undefined, '専用マップが揃ったのでストーリーはロックしない');
  assert.ok(map.hasOfuda, 'お札ありのマップのはず');
  assert.match(map.background, /\/images\/stage\/stage15-kawada-alley\.png$/);
  assert.match(NPC_PORTRAIT_URL['川田'], /\/images\/npc-portraits\/kawada\.png$/);
  assert.match(NPC_TOKEN_URL['川田'], /\/images\/npc-tokens\/kawada\.png$/);
  const portraitFile = new URL('../public/images/npc-portraits/kawada.png', import.meta.url);
  const tokenFile = new URL('../public/images/npc-tokens/kawada.png', import.meta.url);
  const backgroundFile = new URL('../public/images/stage/stage15-kawada-alley.png', import.meta.url);
  for (const file of [portraitFile, tokenFile, backgroundFile]) {
    assert.ok(existsSync(file), `川田用画像が存在しない: ${file.pathname}`);
  }
  // PNGのIHDR color type=6はRGBA。市松模様を焼き込んだ不透明画像へ戻る事故を防ぐ。
  assert.equal(readFileSync(portraitFile)[25], 6, '川田の立ち絵は実アルファ透過PNGであること');
  assert.equal(readFileSync(tokenFile)[25], 6, '川田の盤面駒は実アルファ透過PNGであること');
  // ユーザー指定: 「同属性マス3×2で6マスの通路」が4本の真四角(8×8)。
  assert.equal(map.rows.length, 8);
  assert.ok(map.rows.every((row) => row.length === 8), '真四角＝全行8マス');
  const joined = map.rows.join('');
  for (const symbol of ['F', 'W', 'T', 'M']) {
    assert.equal(joined.split(symbol).length - 1, 6, `${symbol}属性は6マス（3×2の通路×2辺）`);
  }
  assert.equal(joined.split('G').length - 1, 1, 'スタートは1か所');
  assert.equal(joined.split('C').length - 1, 3, 'CPは3か所');
});

test('チュートリアル: 初期手札にスペルを入れず、案内しないスペルを引かせない', () => {
  // 誘導中はhandPanelのspellAllowedInTutorialが「今の吹き出しが指すスペル」
  // 以外を一切使わせないので、台本で案内しないスペルが手札に来ると最後まで
  // 触れない置物になる（2026-08のユーザー報告「最初手札にスペルがあるけど
  // 使えない」）。main.jsは丸ごとimportするとDOMを触るので、台本の宣言を
  // テキストとして読み出して検証する。
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const pick = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*(\\[[^\\]]*\\])`));
    assert.ok(m, `${key} が main.js に見つからない`);
    return m[1];
  };
  const idsIn = (literal) => [...literal.matchAll(/'([A-Za-z][\w-]*)'/g)].map((m) => m[1]);

  // 1) 初期手札はモンスターとアイテムだけ。
  const opening = idsIn(pick('tutorialOpeningCardIds'));
  assert.ok(opening.length > 0, '初期手札の指定が空');
  for (const id of opening) {
    assert.ok(!SPELL_CATALOG[id], `初期手札にスペル「${id}」が入っている`);
    assert.ok(MONSTER_CATALOG[id] || ITEM_CATALOG[id], `初期手札の「${id}」がカタログに無い`);
  }

  // 2) プレイヤーのドローは全手番ぶん指定する（nullを残さない）。nullだと
  //    山札の先頭＝案内していないスペルが早い手番で来てしまう。
  const drawBlock = src.match(/tutorialDrawQueues:\s*\{\s*human:\s*(\[[^\]]*\])/);
  assert.ok(drawBlock, 'tutorialDrawQueues.human が見つからない');
  assert.ok(!/\bnull\b/.test(drawBlock[1]), 'tutorialDrawQueues.human に null が残っている');

  // 3) 引かせるスペルは、台本(TUTORIAL_FLOW_STEPS)が使い方を教えるものだけ。
  const taughtSpells = new Set(
    [...src.matchAll(/\{\s*event:\s*'spell',\s*card:\s*'([\w-]+)'/g)].map((m) => m[1]),
  );
  assert.ok(taughtSpells.size > 0, '台本にスペルのステップが無い');
  for (const id of idsIn(drawBlock[1])) {
    if (!SPELL_CATALOG[id]) continue;
    assert.ok(taughtSpells.has(id), `台本が教えないスペル「${id}」を引かせている`);
  }

  // 4) デッキ側にも、台本が教えないスペルを積まない。ドローを全部指定して
  //    いる今は表に出ないが、指定を1つnullへ戻した瞬間に湧いてくるので。
  const deckBody = src.match(/function buildTutorialPlayerDeck\(\) \{([\s\S]*?)\n\}/);
  assert.ok(deckBody, 'buildTutorialPlayerDeck が見つからない');
  for (const m of deckBody[1].matchAll(/tutorialCopies\(SPELL_CATALOG\.(\w+),/g)) {
    assert.ok(taughtSpells.has(m[1]), `チュートリアルデッキに台本が教えないスペル「${m[1]}」が入っている`);
  }
});
// ---- ⑯「魚群の王チヌ」（1vs3・絶対敗北にしないイベントバトル） ----

test('BGMの参照先mp3はすべてpublic/audio/に実在する', () => {
  // ファイルが無いとplay()が黙って失敗し、そのステージだけ無音になる
  // （例外も出ないので気づきにくい）。参照とファイルのズレをここで止める。
  for (const [track, url] of Object.entries(TRACK_SRC)) {
    const file = new URL(`../public${new URL(url, 'http://x').pathname}`, import.meta.url);
    assert.ok(existsSync(file), `${track}のBGMが存在しない: ${url}`);
  }
  // MAP_TRACK・対人戦の選択肢が実在しないキーを指していないこと。
  for (const [mapId, track] of Object.entries(MAP_TRACK)) {
    assert.ok(TRACK_SRC[track], `MAP_TRACK['${mapId}']のトラック'${track}'がTRACK_SRCに無い`);
  }
  for (const entry of SELECTABLE_BGM) {
    assert.ok(TRACK_SRC[entry.track], `対人戦のBGM選択'${entry.title}'のトラックがTRACK_SRCに無い`);
    assert.match(entry.title, /^♪/, '曲名は♪始まりで揃える');
  }
});

test('⑯のステージBGMは専用曲（stage16bgm.mp3）', () => {
  assert.equal(MAP_TRACK.chinu, 'chinu');
  assert.match(TRACK_SRC.chinu, /\/audio\/stage16bgm\.mp3$/);
  assert.ok(SELECTABLE_BGM.some((entry) => entry.track === 'chinu'), '対人戦のBGM選択にも並べる');
});

test('⑯の専用素材（チヌの立ち絵・王の間の背景）が揃っている', () => {
  assert.match(NPC_PORTRAIT_URL['魚群の王'], /\/images\/npc-portraits\/chinu-king\.png$/);
  const portraitFile = new URL('../public/images/npc-portraits/chinu-king.png', import.meta.url);
  assert.ok(existsSync(portraitFile), 'チヌの立ち絵が存在しない');
  // PNGのIHDR color type=6はRGBA。白背景を焼き込んだ不透明画像へ戻る事故を防ぐ。
  assert.equal(readFileSync(portraitFile)[25], 6, 'チヌの立ち絵は実アルファ透過PNGであること');
  // チヌは高みの見物で対戦に参加しない＝盤面駒は用意しない。
  assert.equal(NPC_TOKEN_URL['魚群の王'], undefined);

  // 背景は⑯専用の「王の間」。⑦の法廷絵を仮流用していた状態へ戻さない。
  const map = MAPS.find((entry) => entry.id === 'chinu');
  assert.match(map.background, /\/images\/stage\/king-room\.png$/);
  const backgroundFile = new URL('../public/images/stage/king-room.png', import.meta.url);
  assert.ok(existsSync(backgroundFile), '王の間の背景が存在しない');
});

test('⑯はステージ・マップ・敵3体の専用デッキが揃っている', () => {
  const stage = STORY_STAGES.find((entry) => entry.key === 'chinu');
  const map = MAPS.find((entry) => entry.id === 'chinu');
  assert.ok(stage && map, 'ステージ・マップが両方見つからない');
  assert.equal(stage.goalCurrency, 5000);
  assert.deepEqual(stage.opponents.map((o) => o.name), ['ウサギン', 'ムール', '邪神ヒトデマソ']);
  assert.deepEqual(stage.opponents.map((o) => o.deckKey), ['chinuUsagin', 'chinuMuuru', 'chinuHitodemaso']);
  for (const opponent of stage.opponents) {
    assert.equal(buildCharacterDeckList(opponent.deckKey).length, 40, `${opponent.name}のデッキは40枚`);
    // buildBattlePlayerConfigsがopponent.theme.elementsを無条件で読むので必須。
    assert.ok(Array.isArray(opponent.theme?.elements), `${opponent.name}にthemeが無い`);
    // ⑯の下僕は共通で焼き札7枚＋バックファイア2＋1のダイス2。
    const names = buildCharacterDeckList(opponent.deckKey).map((card) => card.name);
    const count = (name) => names.filter((entry) => entry === name).length;
    assert.equal(count('ファイヤーボール'), 4);
    assert.equal(count('千本桜'), 3);
    assert.equal(count('バックファイア'), 2);
    assert.equal(count('1のダイス'), 2);
    // 2026-09-01: 実プレイで勝たれたので手札破壊を追加。CPUの使用判断は
    // 焼き札・妨害札より後に評価されるので、本来の動きは潰さない。
    assert.equal(count('キャンセルカルチャー'), 2);
    // 2026-09-01: ATK+直前の出目×5・貫通。守り札と入れ替えて打点を上げた。
    assert.equal(count('イカサマのサイコロ'), 2);
  }
  // 既存ステージのデッキを流用していない＝①〜⑮の難度に影響しない。
  assert.notEqual(stage.opponents[0].deckKey, 'usagin');
});

test('⑯は3vs1: 下僕3体が同盟、主人公は単独', () => {
  const stage = STORY_STAGES.find((entry) => entry.key === 'chinu');
  // ユーザー指定（2026-09-01）。_totalAssetsOfは同盟内の総資産を合算するので、
  // 敵側は3人ぶんの資産で目標へ届く＝主人公が圧倒的不利になる。
  assert.equal(stage.heroAllianceId ?? null, null, '主人公は単独');
  assert.ok(stage.enemyAllianceId, '下僕3体は同じ陣営');
  assert.equal(stage.format, '3vs1');
});

test('⑯は絶対敗北にしない: 負けてもクリア扱い＋勝てば隠しメッセージ', () => {
  const stage = STORY_STAGES.find((entry) => entry.key === 'chinu');
  assert.equal(stage.clearOnDefeat, true);
  assert.ok(stage.defeatOutro?.length, '敗北エンドの会話が必要');
  assert.ok(stage.outro?.length, '勝利時（隠しルート）の会話が必要');
  assert.equal(stage.heroGoesLast, true, '主人公は最後の手番');
  assert.equal(stage.eventBattleBanner?.length, 2, '開始バナーは2行');
  assert.equal(stage.midBattleEvent?.enemyAssetsAtLeast, 4000, '目標5,000Gの8割で割り込み会話');
});

test('⑯の盤面は1行20マスの一直線（両端が行き止まりで折り返す）', () => {
  const map = MAPS.find((entry) => entry.id === 'chinu');
  assert.equal(map.rows.length, 1);
  assert.equal(map.rows[0], 'GFFWWMMTTNCMMWWTTFFC');
  const tiles = createBoard('chinu');
  assert.equal(tiles.length, 20);
  assert.equal(tiles[0].type, TileType.START);
  assert.equal(tiles[19].type, TileType.EVENT, '終端がCP＝一度は最奥まで行く必要がある');
  // 一直線なので隣接は1（両端）か2（途中）。3以上ができていたら盤面が壊れている。
  assert.ok(tiles.every((tile) => tile.neighbors.length >= 1 && tile.neighbors.length <= 2));
  assert.equal(tiles.filter((tile) => tile.neighbors.length === 1).length, 2, '行き止まりは両端の2つだけ');
  const counts = {};
  for (const tile of tiles.filter((entry) => entry.type === TileType.LAND)) {
    counts[tile.element] = (counts[tile.element] || 0) + 1;
  }
  assert.deepEqual(counts, { fire: 4, water: 4, forest: 4, thunder: 4, neutral: 1 });
  assert.equal(map.checkpointBonus, 150, 'CP収入は150G（ユーザー指定）');
});

test('⑯の中央CPがくぐつの剣豪の横断を止める（くぐつ対策）', () => {
  // くぐつの剣豪(autoInvadeEachTurn)は「空き地だけで到達できる最短の敵へ
  // 毎手番1マス進む」が特殊マスは通れない。一直線の盤面では中央に特殊マスを
  // 1つ置くだけで、盤面の端から端まで延々と侵略され続けるのを止められる
  // （2026-09、ユーザー指定「くぐつ対策で真ん中にチェックポイント」）。
  const tiles = createBoard('chinu');
  const special = tiles.filter((t) => t.type !== TileType.LAND).map((t) => t.id);
  assert.deepEqual(special, [0, 10, 19], 'スタート・中央CP・終端CPの3つが特殊マス');

  // 土地マスだけを辿ると、中央CPで左右に分断されていること。
  const landIds = new Set(tiles.filter((t) => t.type === TileType.LAND).map((t) => t.id));
  const reach = (from) => {
    const seen = new Set([from]); const st = [from];
    while (st.length) {
      for (const n of tiles[st.pop()].neighbors) {
        if (landIds.has(n) && !seen.has(n)) { seen.add(n); st.push(n); }
      }
    }
    return seen;
  };
  const left = reach(1);
  assert.ok(!left.has(11), 'くぐつは中央CPを越えて右半分へ渡れない');
  assert.deepEqual([...left].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual([...reach(11)].sort((a, b) => a - b), [11, 12, 13, 14, 15, 16, 17, 18]);

  // くぐつの剣豪が実際にこの制約を持つカードであることも押さえておく。
  assert.equal(MONSTER_CATALOG.kugutsuNoKengou.effect.type, 'autoInvadeEachTurn');
  assert.match(MONSTER_CATALOG.kugutsuNoKengou.effectDescription, /特殊マスは通れず/);
});

test('⑯の割り込み会話は敵1人が4000Gに届いた時だけ、1回だけ発火する', async () => {
  const stage = STORY_STAGES.find((entry) => entry.key === 'chinu');
  const players = [
    { id: 0, name: '主人公', isCPU: false, defeated: false, allianceId: null },
    { id: 1, name: 'ウサギン', isCPU: true, defeated: false, allianceId: null },
    { id: 2, name: 'ムール', isCPU: true, defeated: false, allianceId: null },
  ];
  const g = makeStub([], players);
  const assets = new Map([[0, 900], [1, 1200], [2, 1500]]);
  let shown = 0;
  let allyAdded = 0;
  Object.assign(g, {
    storyEnded: false,
    _isCancelled: false,
    storyAssistTriggered: false,
    storyAssistEvent: { enemyAssetsAtLeast: stage.midBattleEvent.enemyAssetsAtLeast, allyConfig: null, lines: stage.midBattleEvent.lines },
    _totalAssetsOf: (player) => assets.get(player.id),
    onStoryAssistEvent: async () => { shown += 1; },
    _addStoryAssistPlayer: () => { allyAdded += 1; return { name: 'ally' }; },
  });
  await g._maybeTriggerStoryAssistEvent();
  assert.equal(shown, 0, '4000G未満では発火しない');
  assets.set(2, 4000);
  await g._maybeTriggerStoryAssistEvent();
  assert.equal(shown, 1);
  assert.equal(allyAdded, 0, '⑯は会話だけ＝味方は参戦しない');
  await g._maybeTriggerStoryAssistEvent();
  assert.equal(shown, 1, '1回きり');
});

// ---- 合体ロボ・ガシャーンの図鑑登録（自分で合体させた時だけ） ----

test('ギアの合体はonCardSeenへ「誰が合体させたか」を渡す', () => {
  const gearA = MONSTER_CATALOG.kodaiNoGearA;
  const tiles = [
    makeTile(0, { element: 'neutral' }),
    makeTile(1, { element: 'neutral' }),
    makeTile(2, { element: 'neutral' }),
  ];
  const player = { id: 3, name: 'テスト', color: 1, currency: 0, isCPU: false };
  const g = makeStub(tiles, [player]);
  const seen = [];
  Object.assign(g, {
    onCardSeen: (def, meta) => seen.push({ name: def.name, meta }),
    _paintTile: () => {},
    _repaintTileToElement: () => {},
  });
  // 残り2種のギアが自分の土地に配置済み。
  tiles[1].unit = unit(MONSTER_CATALOG.kodaiNoGearB, player.id);
  tiles[1].owner = player.id;
  tiles[2].unit = unit(MONSTER_CATALOG.kodaiNoGearC, player.id);
  tiles[2].owner = player.id;

  g._maybeFuseGear(tiles[0], player, { ...gearA, catalogId: 'kodaiNoGearA' });

  assert.equal(tiles[0].unit.def.name, '合体ロボ・ガシャーン', '合体していない');
  assert.equal(tiles[1].unit, null, '素材のギアは消える');
  assert.equal(tiles[2].unit, null, '素材のギアは消える');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].name, '合体ロボ・ガシャーン');
  // byPlayerIdが無いと、main.js側で「敵が合体させたのを見ただけ」と区別できない。
  assert.equal(seen[0].meta?.byPlayerId, player.id);
});

test('ギアが揃っていなければ合体もonCardSeenも起きない', () => {
  const gearA = MONSTER_CATALOG.kodaiNoGearA;
  const tiles = [makeTile(0, { element: 'neutral' }), makeTile(1, { element: 'neutral' })];
  const player = { id: 0, name: 'テスト', color: 1, currency: 0, isCPU: false };
  const g = makeStub(tiles, [player]);
  const seen = [];
  Object.assign(g, { onCardSeen: (def) => seen.push(def.name), _paintTile: () => {}, _repaintTileToElement: () => {} });
  tiles[1].unit = unit(MONSTER_CATALOG.kodaiNoGearB, player.id); // Cが無い
  tiles[1].owner = player.id;

  g._maybeFuseGear(tiles[0], player, { ...gearA, catalogId: 'kodaiNoGearA' });

  assert.equal(tiles[0].unit, null);
  assert.equal(tiles[1].unit.def.name, '古代のギアB', '素材は消さない');
  assert.deepEqual(seen, []);
});

// ---- 盤面四隅のプレイヤーパネル（誰をどの隅に出すか） ----

test('⑯の1vs3（敵3人が同盟）でも4人全員がパネルに出る', () => {
  // 2026-09-01のユーザー報告「邪神ヒトデマソの手持ちG・総資産が出ていない」。
  // 陣営ごとに[左0,右0,左1,右1]と並べるだけだと、3人目の敵がどの枠にも
  // 入らず表示が丸ごと消えていた。
  const players = [
    { id: 0, name: '主人公', allianceId: null },
    { id: 1, name: 'ウサギン', allianceId: 'chinu' },
    { id: 2, name: 'ムール', allianceId: 'chinu' },
    { id: 3, name: '邪神ヒトデマソ', allianceId: 'chinu' },
  ];
  const slots = computePlayerSlots(players);
  assert.equal(slots.filter(Boolean).length, 4, '4隅すべて埋まる');
  for (const player of players) {
    assert.ok(slots.includes(player), `${player.name}がどの枠にも入っていない`);
  }
  assert.equal(slots[0], players[0], '主人公は左上のまま');
});

test('2vs2は従来どおり左列＝自陣営・右列＝敵陣営に並ぶ', () => {
  const players = [
    { id: 0, name: '主人公', allianceId: 'red' },
    { id: 1, name: '朕', allianceId: 'red' },
    { id: 2, name: '「彼」', allianceId: 'white' },
    { id: 3, name: '段ボール男', allianceId: 'white' },
  ];
  const slots = computePlayerSlots(players);
  assert.deepEqual(slots.map((p) => p.name), ['主人公', '「彼」', '朕', '段ボール男']);
});

test('同盟なし（FFA）は手番順のまま4隅へ', () => {
  const players = [0, 1, 2, 3].map((id) => ({ id, name: `P${id}`, allianceId: null }));
  assert.deepEqual(computePlayerSlots(players).map((p) => p.name), ['P0', 'P1', 'P2', 'P3']);
});

test('1vs1は2枠だけ埋まり、残りは空のまま', () => {
  const slots = computePlayerSlots([
    { id: 0, name: '主人公', allianceId: null },
    { id: 1, name: '川田', allianceId: null },
  ]);
  assert.equal(slots[0].name, '主人公');
  assert.equal(slots[1].name, '川田');
  assert.equal(slots[2], undefined);
  assert.equal(slots[3], undefined);
});

// ---- ネット弁慶（statOverrideInBattle）の表示 ----

test('ネット弁慶は戦闘画面の基礎ステだけ20/20になり、盤面表示は50/50のまま', () => {
  const g = makeStub([], []);
  const netBenkei = unit(MONSTER_CATALOG.netBenkei, 0);
  // 盤面（HPバー・土地情報）はカードどおりの素の値。
  assert.deepEqual(g._baseStats(netBenkei), { atk: 50, hp: 50 });
  // 戦闘画面は上書き後。ここが素の値のままだと「弱体化していないように
  // 見えるのに実際は20/20で戦う」＝ダメージ表示と減り方が食い違う。
  assert.deepEqual(g._baseStats(netBenkei, { inBattle: true }), { atk: 20, hp: 20 });
  // 実ダメージ計算（battle.jsのstatTotals）と戦闘画面の基礎ステが一致すること。
  const totals = battle.statTotals(netBenkei);
  assert.equal(totals.atk, 20);
  assert.equal(totals.maxHp, 20);
});

test('上書きを持たないモンスターはinBattleでも値が変わらない', () => {
  const g = makeStub([], []);
  const ninja = unit(MONSTER_CATALOG.ninja, 0);
  assert.deepEqual(g._baseStats(ninja), g._baseStats(ninja, { inBattle: true }));
});

// ---- 瞬間移動の直後にバックファイアで駒が飛ばないこと ----

test('帰巣本能でゴールへ戻すと着地履歴がリセットされる', async () => {
  const tiles = [
    { id: 0, type: TileType.START, position: { x: 0, z: 0 }, neighbors: [1] },
    ...[1, 2, 3, 4].map((id) => makeTile(id, { neighbors: [id - 1, id + 1] })),
  ];
  const player = {
    id: 0, name: '主人公', currency: 0, tileId: 4, previousTileId: 3,
    homeGoalTileId: 0, lapsCompleted: 0, passedCheckpoints: new Set(),
    // ゴールへ飛ぶ直前まで 4←3←2←1←0 と歩いてきた履歴。
    tileHistory: [4, 3, 2, 1, 0],
  };
  const g = makeStub(tiles, [player]);
  Object.assign(g, { _grantGoalBonus: async () => {}, _notifyState: () => {} });

  await g._spellReturnPlayerToStart(player, 250);

  assert.equal(player.tileId, 0, 'ゴールへ戻る');
  // ここが [4,3,2,1,0] のまま残ると、直後のバックファイアで
  // ゴール(0)→4 と盤面の隣接を無視して飛ぶ（CPも踏み飛ばす）。
  assert.deepEqual(player.tileHistory, [0], '履歴は飛び先だけにリセットされる');
});

test('履歴がリセットされていればバックファイアで駒は飛ばない', async () => {
  const tiles = [
    { id: 0, type: TileType.START, position: { x: 0, z: 0 }, neighbors: [1] },
    ...[1, 2, 3, 4].map((id) => makeTile(id, { neighbors: [id - 1, id + 1] })),
  ];
  const player = { id: 0, name: '主人公', tileId: 0, previousTileId: null, tileHistory: [0], passedCheckpoints: new Set() };
  const g = makeStub(tiles, [player]);
  Object.assign(g, {
    _turnPathIds: [], _segmentPathIds: [],
    onMoveDestination: () => {},
    _isForcedStopFor: () => false,
    _emitPieceStep: () => {},
    _stepWithCamera: async () => {},
    _visitCheckpoint: async () => {},
    _broadcastPieceMove: async () => {},
  });

  await g._movePlayerBackward(player, 5);

  assert.equal(player.tileId, 0, '履歴が尽きているのでその場に留まる（飛ばない）');
});

// ---- ネット弁慶: 盤面スケール(50)と戦闘スケール(20)の橋渡し ----

test('ネット弁慶は盤面で削られた分だけ戦闘HPから引かれる', () => {
  const fresh = unit(MONSTER_CATALOG.netBenkei, 0);
  battle.prepareForBattle(fresh);
  assert.equal(fresh.currentHp, 20, '無傷なら戦闘HPは上書き後の20');

  const scratched = unit(MONSTER_CATALOG.netBenkei, 0);
  scratched.currentHp = 40; // 盤面で10喰らっている（盤面スケールは50）
  battle.prepareForBattle(scratched);
  assert.equal(scratched.currentHp, 10, '盤面ダメージ10ぶん引かれる');

  const dying = unit(MONSTER_CATALOG.netBenkei, 0);
  dying.currentHp = 30; // 盤面で20喰らっている＝戦闘HPは0
  battle.prepareForBattle(dying);
  // 0以下のまま渡し、resolveBattleの開幕死亡チェックで明示的に倒す
  // （下限1で誤魔化すと「1HPで開幕して初撃で落ちる」という別の挙動になる）。
  assert.equal(dying.currentHp, 0, '20喰らっていれば開幕HPは0＝開始と同時に死亡');
});

test('ネット弁慶は無傷で戦闘を終えても盤面HPが減らない', () => {
  const harmless = { id: 'kakashi', name: 'カカシ', element: 'fire', rarity: 'N', hp: 5, atk: 0, cost: 0 };
  const nb = unit(MONSTER_CATALOG.netBenkei, 0);
  battle.resolveBattle(nb, unit(harmless, 1));
  // 修正前は「戦闘スケールの20」で頭打ちにしていたため50→20に落ちていた。
  assert.equal(nb.currentHp, 50, '一度戦っただけで盤面HPが落ちない');

  const nb2 = unit(MONSTER_CATALOG.netBenkei, 0);
  battle.resolveBattle(nb2, unit({ ...harmless, hp: 60, atk: 5 }, 1));
  assert.equal(nb2.currentHp, 45, '戦闘で受けた5ダメージだけ盤面へ返る');
});

test('通常モンスターの盤面HP持ち越しは従来どおり（シールドは盤面HPを守る）', () => {
  const foe = { id: 'foe', name: 'カカシ', element: 'fire', rarity: 'N', hp: 200, atk: 10, cost: 0 };
  const ninja = unit(MONSTER_CATALOG.ninja, 0);
  ninja.currentHp = 30; // def.hp=40 に対して10喰らっている
  battle.resolveBattle(ninja, unit(foe, 1));
  assert.equal(ninja.currentHp, 20, '素のHPを下回った分だけ盤面へ返る');

  const armored = unit(MONSTER_CATALOG.ninja, 0);
  armored.currentHp = 30;
  armored.items.push(ITEM_CATALOG.heikeNoYoroi); // HP+40
  battle.resolveBattle(armored, unit(foe, 1));
  assert.equal(armored.currentHp, 30, 'シールドが吸った分は盤面HPを削らない');
});

// ---- 開幕死亡（開始HPが0以下） ----

test('盤面ダメージで開始HPが0以下なら戦闘開始と同時に死亡する', () => {
  const nb = unit(MONSTER_CATALOG.netBenkei, 0);
  nb.currentHp = 30; // 盤面で20喰らっている＝戦闘HPは20-20=0
  assert.equal(battle.previewBattleEntryHp(nb), 0, '装備前の時点でもう0');

  const foe = unit({ id: 'foe', name: 'カカシ', element: 'fire', rarity: 'N', hp: 60, atk: 50, cost: 0 }, 1);
  const result = battle.resolveBattle(nb, foe);
  assert.equal(result.startingDeath, true);
  assert.equal(result.attackerSurvived, false);
  assert.equal(result.defenderSurvived, true, '相手は無傷');
  assert.equal(result.exchanges.length, 1, '死亡の表示だけで殴り合いは起きない');
  assert.equal(result.exchanges[0].message, 'ネット弁慶は死亡した');
  // 攻撃モーションと属性ビームを出さないための印。
  assert.equal(result.exchanges[0].aftermath, true);
  assert.equal(result.exchanges[0].targetDied, true);
  assert.equal(result.dmgToDefender, 0, '一撃も入れずに死ぬ');
});

test('マイナスHP装備で0以下になる場合も先手の攻撃前に死亡する', () => {
  const frail = { id: 'frail', name: 'ひよわ', element: 'fire', rarity: 'N', hp: 20, atk: 30, cost: 0 };
  const u = unit(frail, 0);
  battle.equipItem(u, ITEM_CATALOG.morohaNoTsurugi); // ATK+40 / HP-20
  assert.equal(battle.previewBattleEntryHp(u), 0, '装備してから0以下になる');

  const foe = unit({ id: 'foe', name: 'カカシ', element: 'fire', rarity: 'N', hp: 60, atk: 50, cost: 0 }, 1);
  const result = battle.resolveBattle(u, foe);
  assert.equal(result.startingDeath, true);
  assert.equal(result.attackerSurvived, false);
  assert.equal(result.exchanges[0].message, 'ひよわは死亡した');
  assert.equal(foe.currentHp, 60, 'ATK+40があっても一撃も入らない');
});

test('開始HPが1以上あれば従来どおり殴り合う', () => {
  const ninja = unit(MONSTER_CATALOG.ninja, 0);
  const foe = unit({ id: 'foe', name: 'カカシ', element: 'fire', rarity: 'N', hp: 60, atk: 10, cost: 0 }, 1);
  const result = battle.resolveBattle(ninja, foe);
  assert.ok(!result.startingDeath);
  assert.ok(result.exchanges.length >= 2);
});

// ---- キャンセルカルチャーのCPU狙い方（アイテム最優先） ----

function makeCancelCultureGame() {
  const g = Object.create(Game.prototype);
  const casts = [];
  Object.assign(g, {
    players: [
      { id: 0, name: 'CPU', isCPU: true, allianceId: 'enemy', defeated: false, currency: 500, spellUsedThisTurn: false,
        hand: [{ ...SPELL_CATALOG.cancelCulture, id: 'cc', type: CardType.SPELL }] },
      { id: 1, name: '味方CPU', isCPU: true, allianceId: 'enemy', defeated: false,
        hand: [{ ...ITEM_CATALOG.zangokuKen, id: 'ally-item', type: CardType.GEAR }] },
      { id: 2, name: '主人公', isCPU: false, allianceId: null, defeated: false, hand: [] },
    ],
    _totalAssetsOf: () => 1000,
    _cpuCastSpell: async (player, card, opts) => { casts.push(opts); },
  });
  return { g, casts, hero: g.players[2] };
}

// 実物のデッキのカードは duplicateForDeck が catalogId を付けたうえで id を
// 振り直す（catalogIdOf は catalogId ?? id を返す）。カード種別で引く判定を
// 検証できるよう、ヘルパも同じ形にしておく。
const asItem = (def, id) => ({ ...def, catalogId: def.id, id, type: CardType.GEAR });
const asSpell = (def, id) => ({ ...def, catalogId: def.id, id, type: CardType.SPELL });

test('キャンセルカルチャーは高コストのスペルより先にアイテムを潰す', async () => {
  const { g, casts, hero } = makeCancelCultureGame();
  // 千本桜100G（スペル）とナイフ5G（アイテム）。コスト順ならスペルを狙うが、
  // 戦闘の勝敗を直接ひっくり返すのは装備なのでアイテムを優先する。
  hero.hand = [asSpell(SPELL_CATALOG.senbonZakura, 's1'), asItem(ITEM_CATALOG.knife, 'i1')];
  await g._cpuMaybeUseCancelCultureSpell(g.players[0]);
  assert.equal(casts.at(-1)?.targetCardId, 'i1');
  assert.equal(casts.at(-1)?.targetPlayerId, 2, '同盟外だけを狙う（味方CPUの装備は対象外）');
});

test('アイテムが複数あれば高い方から、尽きたらスペルへ移る', async () => {
  const { g, casts, hero } = makeCancelCultureGame();
  hero.hand = [asItem(ITEM_CATALOG.knife, 'i1'), asItem(ITEM_CATALOG.zangokuKen, 'i2'), asSpell(SPELL_CATALOG.senbonZakura, 's1')];
  await g._cpuMaybeUseCancelCultureSpell(g.players[0]);
  assert.equal(casts.at(-1)?.targetCardId, 'i2', '斬〇剣130G > ナイフ5G');

  hero.hand = [asSpell(SPELL_CATALOG.fireball, 's1'), asSpell(SPELL_CATALOG.senbonZakura, 's2')];
  await g._cpuMaybeUseCancelCultureSpell(g.players[0]);
  assert.equal(casts.at(-1)?.targetCardId, 's2', 'アイテムが無ければ高コストのスペル');
});

test('キャンセルカルチャーはアイテムより先にパンデミックを潰す', async () => {
  // パンデミックは盤面のモンスターを全てゾンビ(HP20/ATK20)へ置き換える＝
  // 積み上げた盤面を一撃で更地にするので、通した時の損失が最大
  // （ユーザー指定、2026-09「キャンセルカルチャーはパンデミック優先」）。
  const { g, casts, hero } = makeCancelCultureGame();
  hero.hand = [asItem(ITEM_CATALOG.zangokuKen, 'i1'), asSpell(SPELL_CATALOG.pandemic, 'p1')];
  await g._cpuMaybeUseCancelCultureSpell(g.players[0]);
  assert.equal(casts.at(-1)?.targetCardId, 'p1', '斬〇剣130G > パンデミック100G でもパンデミックが上');

  // パンデミックが無ければ従来どおりアイテム優先（既存挙動を壊していない）。
  hero.hand = [asItem(ITEM_CATALOG.zangokuKen, 'i1'), asSpell(SPELL_CATALOG.senbonZakura, 's1')];
  await g._cpuMaybeUseCancelCultureSpell(g.players[0]);
  assert.equal(casts.at(-1)?.targetCardId, 'i1');
});

test('パンデミックを持つ相手が総資産1位でなくても、そちらを狙う', async () => {
  // 対象プレイヤーの選定にも優先を効かせないと、パンデミックを握っているのが
  // 別の相手だった時に永久に抜けない。
  const { g, casts } = makeCancelCultureGame();
  const rich = { id: 3, name: '金持ち', isCPU: false, allianceId: null, defeated: false,
    hand: [asItem(ITEM_CATALOG.zangokuKen, 'rich-item')] };
  const poor = { id: 4, name: '貧乏', isCPU: false, allianceId: null, defeated: false,
    hand: [asSpell(SPELL_CATALOG.pandemic, 'poor-pandemic')] };
  g.players = [g.players[0], rich, poor];
  g._totalAssetsOf = (p) => (p.id === 3 ? 99999 : 1);
  await g._cpuMaybeUseCancelCultureSpell(g.players[0]);
  assert.equal(casts.at(-1)?.targetPlayerId, 4, '総資産1位の金持ちではなくパンデミック持ちを狙う');
  assert.equal(casts.at(-1)?.targetCardId, 'poor-pandemic');
});

test('潰せる手札を持つ相手がいなければ撃たない', async () => {
  const { g, casts, hero } = makeCancelCultureGame();
  hero.hand = [{ ...MONSTER_CATALOG.ninja, id: 'm1', type: CardType.MONSTER }]; // モンスターは対象外
  await g._cpuMaybeUseCancelCultureSpell(g.players[0]);
  assert.equal(casts.length, 0);
});

// ---- 聖域はモンスターへの呪い（2026-09、ユーザー指定） ----

/** 聖域の効果適用だけを叩く最小のGame。土地は2枚（0=自分、1=相手）。 */
function makeSanctuaryGame() {
  const g = Object.create(Game.prototype);
  const own = makeTile(0, { element: 'fire' });
  own.owner = 0;
  own.unit = unit(MONSTER_CATALOG.fireStarter, 0);
  const logs = [];
  Object.assign(g, {
    tiles: [own],
    players: [
      { id: 0, name: 'CPU', isCPU: true, allianceId: null, defeated: false, currency: 500 },
      { id: 1, name: '主人公', isCPU: false, allianceId: null, defeated: false, currency: 500 },
    ],
    onLog: (m) => logs.push(m),
    _notifyState: () => {},
  });
  return { g, tile: own, logs };
}

test('聖域はモンスターへの呪いとして付く（土地フラグではない）', async () => {
  const { g, tile } = makeSanctuaryGame();
  await g._applySpellEffect(g.players[0], SPELL_CATALOG.sanctuary, { targetTileId: 0 });

  // 土地側のフラグは立てない。判定は必ず_isTransparentTile経由。
  assert.equal(tile.transparentCursed, undefined, '土地フラグは使わない');
  assert.equal(tile.unit.curses.length, 1, 'モンスターの呪い枠に入る');
  assert.equal(tile.unit.curses[0].name, '聖域');
  assert.ok(g._isTransparentTile(tile), '侵略不能・通行料ゼロの判定は効く');
  assert.ok(g._isSpellUntargetableUnit(tile.unit), '単体スペルの対象にならない');
  assert.ok(!g._isSingleTargetImmuneUnit(tile.unit), '土地コマンドの特殊効果までは止めない');
});

test('聖域は別の呪いで上書きされて消える', async () => {
  const { g, tile } = makeSanctuaryGame();
  await g._applySpellEffect(g.players[0], SPELL_CATALOG.sanctuary, { targetTileId: 0 });
  assert.ok(g._isTransparentTile(tile));

  // unit.cursesは1つしか保持しない（battle.jsのsetCurse）。別の呪いをかければ
  // 聖域は上書きされ、侵略不能も単体スペル耐性も同時に切れる。
  battle.applyCurse(tile.unit, { name: '別の呪い', addedAtk: 5, addedHp: 0 });
  assert.equal(tile.unit.curses.length, 1);
  assert.equal(tile.unit.curses[0].name, '別の呪い');
  assert.ok(!g._isTransparentTile(tile), '上書きで侵略不能が解ける');
  assert.ok(!g._isSpellUntargetableUnit(tile.unit), '上書きで単体スペル耐性も解ける');
});

test('聖域はモンスターが居なくなれば自動的に消える（土地に残らない）', async () => {
  const { g, tile } = makeSanctuaryGame();
  await g._applySpellEffect(g.players[0], SPELL_CATALOG.sanctuary, { targetTileId: 0 });
  assert.ok(g._isTransparentTile(tile));
  // 戦闘で落ちた／移動した等でunitが外れた状態。土地フラグを片付ける処理は
  // 一切通していないのに、透過状態も一緒に消えている必要がある。
  tile.unit = null;
  assert.ok(!g._isTransparentTile(tile), 'モンスターが居なければ透過も消える');
});

test('聖域中のモンスターは単体スペルの対象一覧に出ないが、全体スペルは通る', async () => {
  const { g, tile } = makeSanctuaryGame();
  await g._applySpellEffect(g.players[0], SPELL_CATALOG.sanctuary, { targetTileId: 0 });

  // 単体スペル(target:'anyMonster')の対象収集から外れる。
  g.onPickAbilityTarget = async () => { throw new Error('対象選択まで来てはいけない'); };
  g._browseTileSummary = (t) => ({ id: t.id });
  const cast = await g._resolveSpellCast(g.players[1], SPELL_CATALOG.senbonZakura);
  assert.equal(cast, null, '対象がいない扱いになる');

  // 全体スペルはtarget:'none'で対象選択を経由しないので普通に当たる。
  assert.equal(SPELL_CATALOG.pandemic.target, 'none');
  assert.equal(SPELL_CATALOG.meteor?.target ?? 'none', 'none');
});
