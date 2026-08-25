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
  // 火水雷森は入手可能枚数が N11/S8/R5 で揃っていること（無属性だけ別枠）。
  for (const element of ['fire', 'water', 'thunder', 'forest']) {
    const live = Object.values(MONSTER_CATALOG)
      .filter((c) => c.element === element && !c.wip && !c.npcExclusive);
    const n = (r) => live.filter((c) => c.rarity === r).length;
    assert.deepEqual([n('N'), n('S'), n('R')], [11, 8, 5], `${element}の枚数が揃っていない`);
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
  assert.equal(count('pandemic'), 2);
  assert.equal(count('horizon'), 2);
  assert.equal(count('landlessOne'), 2);
  assert.equal(count('shinkenShirahadori'), 4);
  assert.equal(count('poisonMist'), 2);
  assert.equal(count('delayTactics'), 2);
  assert.equal(count('diceOne'), 2);
});

test('ステージ14は専用マップ・会話・塞ぎ込んだ男へ正しく接続されている', () => {
  const stage = STORY_STAGES.find((entry) => entry.key === 'royal-guard');
  const map = MAPS.find((entry) => entry.id === 'royal-guard');
  assert.ok(stage && map);
  assert.equal(stage.title, '⑭ 王都の番人？？（仮公開）');
  assert.equal(stage.opponents[0].deckKey, 'fusagikonda');
  assert.equal(stage.opponents[0].name, '塞ぎ込んだ男');
  assert.equal(map.rows.join('').split('C').length - 1, 4, 'CPは4か所');
  for (const symbol of ['F', 'W', 'M', 'T']) {
    assert.equal(map.rows.join('').split(symbol).length - 1, 6, `${symbol}属性は6マス`);
  }
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
  const ashGame = makeCpuStub(makeOwned(7, 2, true), [ashPlayer]);
  await ashGame._cpuMaybeUseFusagikondaCombo(ashPlayer);
  assert.equal(ashGame.casts[0].name, '灰塵');

  const horizonPlayer = { ...ashPlayer, spellUsedThisTurn: false, hand: comboHand };
  const horizonGame = makeCpuStub(makeOwned(7, 1, true), [horizonPlayer]);
  await horizonGame._cpuMaybeUseFusagikondaCombo(horizonPlayer);
  assert.equal(horizonGame.casts[0].name, 'ホライズン');

  const pandemicPlayer = { ...ashPlayer, spellUsedThisTurn: false, hand: comboHand };
  const pandemicGame = makeCpuStub(makeOwned(6, 1, false), [pandemicPlayer]);
  await pandemicGame._cpuMaybeUseFusagikondaCombo(pandemicPlayer);
  assert.equal(pandemicGame.casts[0].name, 'パンデミック');
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
