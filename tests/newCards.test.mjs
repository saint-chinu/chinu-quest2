// 新規カード（スペル4種・アイテム3種）の回帰テスト。
// game.js は scene.js 経由で three を読むので、直接importせずViteのSSR
// ローダを通す（CLAUDE.md「テスト（ヘッドレス）」参照）。Gameは
// Object.create(Game.prototype) の部分インスタンスにモックを載せて叩く。
//   npm run test:cards
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { ITEM_CATALOG, SPELL_CATALOG, MONSTER_CATALOG, buildCharacterCardList, isRewardOnlyCard } = await vite.ssrLoadModule('/src/battleCards.js');
const { Game } = await vite.ssrLoadModule('/src/game.js');
const battle = await vite.ssrLoadModule('/src/battle.js');
const { TileType, MAPS } = await vite.ssrLoadModule('/src/board.js');
const { STORY_STAGES } = await vite.ssrLoadModule('/src/story.js');
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
    ...['kotai', 'pandemic', 'horizon', 'delayTactics', 'ashToDust', 'landlessOne'].map((id) => [id, SPELL_CATALOG[id]]),
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
  assert.equal(stage.title, '⑭ 王都の番人？？（仮公開）');
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
  assert.equal(tiles[0].unit.ownerId, 'A', 'モンスターの持ち主は変わらない');
  assert.equal(tiles[0].owner, 'A');
  assert.equal(tiles[1].owner, 'B');
  assert.equal(tiles[1].unit, alreadyZombie, '既にゾンビなら作り直さない');
  assert.equal(tiles[2].unit, null, '空き地には湧かない');
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
  assert.deepEqual([card.hp, card.atk, card.cost], [50, 50, 150]);
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
  const character = { breedMonsters: [patternA, patternB], breedMonsterIndex: 1 };

  assert.equal(breedParts.activeBreedMonster(character), patternB, '選択中(index=1)のパターンを返す');
  const cardB = breedParts.buildBreedCardDef(character);
  assert.equal(cardB.name, 'パターンB');
  assert.equal(cardB.atk, breedParts.BREED_BASE.atk + 30);
  assert.equal(cardB.hp, breedParts.BREED_BASE.hp + 30);
  assert.equal(cardB.catalogId, 'breedMonster', 'パターンが違っても図鑑/デッキ追跡用のcatalogIdは固定');

  character.breedMonsterIndex = 0;
  assert.equal(breedParts.activeBreedMonster(character), patternA, '切り替えると即座に別パターンを返す');
  assert.equal(breedParts.buildBreedCardDef(character).name, 'パターンA');

  // 無効なindex（未設定・範囲外）は先頭パターンへフォールバックする。
  character.breedMonsterIndex = 99;
  assert.equal(breedParts.activeBreedMonster(character), patternA);
  delete character.breedMonsterIndex;
  assert.equal(breedParts.activeBreedMonster(character), patternA);
});
