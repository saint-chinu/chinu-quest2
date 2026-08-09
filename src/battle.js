import { WEAK_AGAINST, catalogIdOf } from './battleCards.js';

/** A monster once it's on the board: base stats plus equipped items/curses. */
export function createFieldUnit(monsterDef, ownerId) {
  return {
    ownerId,
    def: monsterDef,
    items: [], // weapon/armor - removed after every battle
    curses: [], // spell effects - removed only when the unit dies
    currentHp: monsterDef.hp,
  };
}

export function equipItem(unit, itemDef) {
  unit.items.push(itemDef);
}

/** Casts a spell onto a monster already on the field ("curse" status). */
export function applyCurse(unit, spellDef) {
  unit.curses.push({
    name: spellDef.name,
    addedAtk: spellDef.addedAtk || 0,
    addedHp: spellDef.addedHp || 0,
    traits: spellDef.traits || [],
  });
}

// `bonus` carries battle-context modifiers the unit itself doesn't know
// about (同属性ボーナス's land-level HP, 応援's adjacent-ally ATK) - the
// caller (Game, which has the board) computes these per-battle and passes
// them in, same shape as items/curses but never persisted on the unit.
function statTotals(unit, bonus = {}) {
  const itemAtk = unit.items.reduce((sum, i) => sum + (i.atkBonus || 0), 0);
  const itemHp = unit.items.reduce((sum, i) => sum + (i.hpBonus || 0), 0);
  const curseAtk = unit.curses.reduce((sum, c) => sum + (c.addedAtk || 0), 0);
  const curseHp = unit.curses.reduce((sum, c) => sum + (c.addedHp || 0), 0);
  return {
    atk: unit.def.atk + curseAtk + itemAtk + (bonus.atk || 0),
    maxHp: unit.def.hp + curseHp + itemHp + (bonus.hp || 0),
  };
}

/** Call once right before a battle to lock in this fight's max HP. */
export function prepareForBattle(unit, bonus = {}) {
  unit.currentHp = statTotals(unit, bonus).maxHp;
}

/** Traits may come from the monster itself, its one-use item, or a persistent spell curse. */
function hasTrait(unit, trait) {
  return !!unit.def.traits?.includes(trait)
    || unit.items.some((item) => item.traits?.includes(trait))
    || unit.curses.some((curse) => curse.traits?.includes(trait));
}

// Per-monster incoming-damage multiplier. Only 港区女子 has a declared
// weakness/resistance trait so far; everyone else just takes the standard
// weakness bonus (1.2x) or a neutral 1x otherwise.
function incomingDamageMultiplier(defenderUnit, attackerElement) {
  const weakness = WEAK_AGAINST[defenderUnit.def.element];
  const isWeaknessHit = attackerElement === weakness;

  if (catalogIdOf(defenderUnit.def) === 'minatoJoshi') {
    return isWeaknessHit ? 1.2 : 0.8;
  }
  return isWeaknessHit ? 1.2 : 1.0;
}

/** 被ダメージ半減 halves incoming damage - unless the attacker has 貫通, which nullifies it entirely. */
function damageReductionMultiplier(defenderUnit, attackerUnit) {
  if (hasTrait(defenderUnit, 'halfDamage') && !hasTrait(attackerUnit, 'pierce')) return 0.5;
  return 1;
}

function dealDamage(attackerUnit, defenderUnit, log, attackerBonus) {
  const atkStats = statTotals(attackerUnit, attackerBonus);
  const multiplier = incomingDamageMultiplier(defenderUnit, attackerUnit.def.element) * damageReductionMultiplier(defenderUnit, attackerUnit);
  const damage = Math.round(atkStats.atk * multiplier);
  defenderUnit.currentHp -= damage;
  const message = `${attackerUnit.def.name} → ${defenderUnit.def.name} に${damage}ダメージ（倍率${multiplier}）`;
  log.push(message);
  return { damage, message };
}

/** Minimal gold ledger so battle abilities have somewhere to move currency. */
export class GoldLedger {
  constructor(initialBalances = {}) {
    this.balances = { ...initialBalances };
  }
  add(ownerId, amount) {
    this.balances[ownerId] = (this.balances[ownerId] || 0) + amount;
  }
  transfer(fromOwnerId, toOwnerId, amount) {
    this.add(fromOwnerId, -amount);
    this.add(toOwnerId, amount);
  }
}

/**
 * Sequential single exchange: whoever goes first strikes, and only if their
 * target survives that hit does it get to strike back. A target killed
 * outright never counters, so the first striker takes zero damage in that
 * case (this is why "mutual destruction" can't happen in ordinary combat -
 * it would need a special ability that damages the first striker outside of
 * a counter-attack, none of which exist). The attacker goes first UNLESS
 * the defender carries 先制 (firstStrike) and the attacker doesn't (if both
 * do, it reverts to the normal attacker-first order - no concrete card has
 * ever exercised that tie yet). Items are consumed regardless of outcome;
 * curses persist unless their unit died. `attackerBonus`/`defenderBonus`
 * ({atk, hp}) carry this battle's 同属性ボーナス/応援ボーナス (see
 * Game._elementHpBonus/Game._cheerAtkBonus) - purely situational, never
 * stored on the unit. `exchanges` lists each strike in the order it
 * actually happened ({side, message, damage, targetDied}), so the caller's
 * UI can animate them in the right sequence regardless of who went first.
 */
export function resolveBattle(attacker, defender, gold, attackerBonus = {}, defenderBonus = {}) {
  const log = [];
  prepareForBattle(attacker, attackerBonus);
  prepareForBattle(defender, defenderBonus);
  log.push(
    `${attacker.def.name}(ATK${statTotals(attacker, attackerBonus).atk}/HP${attacker.currentHp}) vs ` +
      `${defender.def.name}(ATK${statTotals(defender, defenderBonus).atk}/HP${defender.currentHp})`
  );

  const defenderGoesFirst = hasTrait(defender, 'firstStrike') && !hasTrait(attacker, 'firstStrike');
  const first = defenderGoesFirst
    ? { unit: defender, target: attacker, bonus: defenderBonus, side: 'defender' }
    : { unit: attacker, target: defender, bonus: attackerBonus, side: 'attacker' };
  const second = defenderGoesFirst
    ? { unit: attacker, target: defender, bonus: attackerBonus, side: 'attacker' }
    : { unit: defender, target: attacker, bonus: defenderBonus, side: 'defender' };

  const exchanges = [];
  const firstStrike = dealDamage(first.unit, first.target, log, first.bonus);
  const firstTargetSurvived = first.target.currentHp > 0;
  exchanges.push({ side: first.side, message: firstStrike.message, damage: firstStrike.damage, targetDied: !firstTargetSurvived });

  const secondStrike = firstTargetSurvived ? dealDamage(second.unit, second.target, log, second.bonus) : null;
  if (secondStrike) {
    exchanges.push({
      side: second.side,
      message: secondStrike.message,
      damage: secondStrike.damage,
      targetDied: second.target.currentHp <= 0,
    });
  }

  const attackerSurvived = attacker.currentHp > 0;
  const defenderSurvived = defender.currentHp > 0;
  const dmgToDefender = (first.side === 'attacker' ? firstStrike : second.side === 'attacker' ? secondStrike : null)?.damage ?? 0;
  const dmgToAttacker = (first.side === 'defender' ? firstStrike : second.side === 'defender' ? secondStrike : null)?.damage ?? 0;

  if (catalogIdOf(attacker.def) === 'minatoJoshi' && dmgToDefender > 0) {
    gold.transfer(defender.ownerId, attacker.ownerId, dmgToDefender);
    log.push(`${attacker.def.name}が${dmgToDefender}Gを奪った`);
  }
  if (catalogIdOf(defender.def) === 'minatoJoshi' && dmgToAttacker > 0) {
    gold.transfer(attacker.ownerId, defender.ownerId, dmgToAttacker);
    log.push(`${defender.def.name}が${dmgToAttacker}Gを奪った`);
  }

  // 強盗: steals 3x the damage it actually dealt (unlike 港区女子's 1x above) - works for either side, whichever carries the trait.
  if (hasTrait(attacker, 'robber') && dmgToDefender > 0) {
    const stolen = dmgToDefender * 3;
    gold.transfer(defender.ownerId, attacker.ownerId, stolen);
    log.push(`${attacker.def.name}が強盗で${stolen}Gを奪った`);
  }
  if (hasTrait(defender, 'robber') && dmgToAttacker > 0) {
    const stolen = dmgToAttacker * 3;
    gold.transfer(attacker.ownerId, defender.ownerId, stolen);
    log.push(`${defender.def.name}が強盗で${stolen}Gを奪った`);
  }

  if (defenderSurvived && catalogIdOf(defender.def) === 'salarymander') {
    const bonus = defender.currentHp * 4;
    gold.add(defender.ownerId, bonus);
    log.push(`${defender.def.name}は土地に生き残り${bonus}Gを獲得`);
  }
  if (attackerSurvived && catalogIdOf(attacker.def) === 'salarymander') {
    const bonus = attacker.currentHp * 4;
    gold.add(attacker.ownerId, bonus);
    log.push(`${attacker.def.name}は土地に生き残り${bonus}Gを獲得`);
  }

  attacker.items = [];
  defender.items = [];
  if (!attackerSurvived) attacker.curses = [];
  if (!defenderSurvived) defender.curses = [];

  return { log, dmgToAttacker, dmgToDefender, attackerSurvived, defenderSurvived, exchanges };
}
