import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { Game } = await vite.ssrLoadModule('/src/game.js');
const { MONSTER_CATALOG: M, ITEM_CATALOG: I } = await vite.ssrLoadModule('/src/battleCards.js');
const B = await vite.ssrLoadModule('/src/battle.js');
test.after(() => vite.close());
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const generic = { id: 'test-water', name: 'テスト', hp: 40, atk: 30, element: 'water', traits: [] };
function el() {
  const flags = new Set();
  return { textContent: '', dataset: {}, style: {}, classList: {
    add(...names) { names.forEach(n => flags.add(n)); }, remove(...names) { names.forEach(n => flags.delete(n)); },
    contains(n) { return flags.has(n); }, toggle(n, on) { on ? flags.add(n) : flags.delete(n); },
  }, replaceChildren() {}, appendChild() {} };
}
function display() {
  const side = () => Object.fromEntries(['el', 'card', 'item', 'atk', 'hp', 'atkBonus', 'hpBonus', 'atkFill', 'hpFill'].map(k => [k, el()]));
  const ctx = vm.createContext({ document: { createElement: el }, battleSide: { attacker: side(), defender: side() },
    battleMessageText: el(), battleMessageWait: async () => {}, renderCardEl() {}, requestAnimationFrame: cb => cb() });
  for (const [start, end] of [['async function promptBattleEquip(', '/** ステゴロ/海賊S:'],
    ['async function promptBattleTraitReveal(', '/** 避雷針侍:']]) {
    const s = source.indexOf(start), e = source.indexOf(end, s);
    assert.ok(s >= 0 && e > s);
    vm.runInContext(source.slice(s, e), ctx);
  }
  return ctx;
}

for (const [name, def, item, hp, atk] of [
  ['通常の装備HPは貫通後も残る', generic, I.fushichoNoTate, 60, 40],
  ['Ninjaの装備HP/ATKは表示も2倍', M.ninja, I.fushichoNoTate, 80, 60],
  ['くぐつの剣豪は装備HP増加を表示もしない', M.kugutsuNoKengou, I.fushichoNoTate, 50, 60],
  ['HP減少装備でも土地HPだけを除去', generic, { id: 'negative', hpBonus: -20, atkBonus: 10 }, 20, 40],
  ['土地と装備HPが相殺してチップ0でも貫通は土地分を除去', generic, { id: 'negative30', hpBonus: -30 }, 10, 30],
]) test(name, async () => {
  const u = B.createFieldUnit(structuredClone(def), 1);
  const g = Object.create(Game.prototype), ctx = display();
  const delta = B.equipmentStatDelta(u, [], item);
  const original = structuredClone(u);
  await ctx.promptBattleEquip({ side: 'defender', item, unitName: def.name, baseAtk: def.atk, baseHp: def.hp,
    baseCurrentHp: def.hp, existingHpBonus: 30, ...delta });
  await ctx.promptBattleTraitReveal({ side: 'attacker', labels: ['怨念の集合体：貫通'], stripHpBonus: { side: 'defender', amount: 30 } });
  assert.deepEqual(u, original, '表示計算はユニットを変更しない');
  u.items = [structuredClone(item)];
  const bonus = g._pierceAdjustedBonus({ hp: 30, atk: 0 }, 30);
  B.prepareForBattle(u, bonus);
  assert.equal(u.currentHp, hp);
  assert.equal(B.statTotals(u, bonus).atk, atk);
  assert.equal(Number(ctx.battleSide.defender.hp.dataset.current), hp);
  assert.equal(Number(ctx.battleSide.defender.hp.dataset.max), hp);
  assert.equal(Number(ctx.battleSide.defender.hpBonus.textContent || 0), hp - def.hp);
  assert.equal(Number(ctx.battleSide.defender.atkBonus.textContent || 0), atk - def.atk);
});

test('強奪した複数装備も実計算と同じ累計差分で表示できる', () => {
  for (const def of [M.ninja, M.kugutsuNoKengou, generic]) {
    const u = B.createFieldUnit(structuredClone(def), 1), shown = [];
    let hp = 0, atk = 0;
    for (const item of [{ hpBonus: -20, atkBonus: 15 }, I.fushichoNoTate, I.fushichoNoTate]) {
      const d = B.equipmentStatDelta(u, shown, item);
      hp += d.appliedHpBonus; atk += d.appliedAtkBonus; shown.push(item);
      const actual = B.statTotals({ ...u, items: shown });
      assert.equal(def.hp + hp, actual.maxHp); assert.equal(def.atk + atk, actual.atk);
    }
  }
});

test('異次元ソケット交換後のNinja能力を装備表示に使う', () => {
  const a = B.createFieldUnit(structuredClone(generic), 0), d = B.createFieldUnit(structuredClone(M.ninja), 1);
  a.items = [structuredClone(I.dimensionalSocket)]; d.items = [structuredClone(I.fushichoNoTate)];
  B.applyPreAttackItemEffects(a, d);
  try {
    assert.equal(a.def.effect.type, 'doubleItemEffect');
    assert.equal(B.equipmentStatDelta(a, [], a.items[0]).appliedHpBonus, (a.items[0].hpBonus || 0) * 2);
    assert.equal(B.equipmentStatDelta(d, [], d.items[0]).appliedHpBonus, 20);
  } finally { B.abortPreAttackItemEffects(a, d); }
});

test('実戦の装備公開3経路すべてで実加算量を渡す', () => {
  const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  const region = game.slice(game.indexOf('const shownItems ='), game.indexOf('// 装備が確定した"後"'));
  assert.equal((region.match(/equipmentStatDelta\(/g) || []).length, 3);
  assert.equal((region.match(/onBattleEquip\(\{\s*\.\.\.delta/g) || []).length, 3);
});
