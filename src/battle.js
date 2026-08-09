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

function dealDamage(attacker, defender, log, attackerBonus) {
  const atkStats = statTotals(attacker, attackerBonus);
  const multiplier = incomingDamageMultiplier(defender, attacker.def.element);
  const damage = Math.round(atkStats.atk * multiplier);
  defender.currentHp -= damage;
  const message = `${attacker.def.name} → ${defender.def.name} に${damage}ダメージ（倍率${multiplier}）`;
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
 * Sequential single exchange: the attacker strikes first; only if the
 * defender survives that hit does it get to strike back. A defender killed
 * outright never counters, so the attacker takes zero damage in that case
 * (this is why "mutual destruction" can no longer happen in ordinary
 * combat - it would need a special ability that damages the attacker
 * outside of a counter-attack, none of which exist yet). Unless a future
 * special grants 先制/後攻, the attacker always goes first. Items are
 * consumed regardless of outcome; curses persist unless their unit died.
 * `attackerBonus`/`defenderBonus` ({atk, hp}) carry this battle's 同属性
 * ボーナス/応援ボーナス (see Game._elementHpBonus/Game._cheerAtkBonus) -
 * purely situational, never stored on the unit.
 */
export function resolveBattle(attacker, defender, gold, attackerBonus = {}, defenderBonus = {}) {
  const log = [];
  prepareForBattle(attacker, attackerBonus);
  prepareForBattle(defender, defenderBonus);
  log.push(
    `${attacker.def.name}(ATK${statTotals(attacker, attackerBonus).atk}/HP${attacker.currentHp}) vs ` +
      `${defender.def.name}(ATK${statTotals(defender, defenderBonus).atk}/HP${defender.currentHp})`
  );

  const attackResult = dealDamage(attacker, defender, log, attackerBonus);
  const dmgToDefender = attackResult.damage;
  const defenderSurvived = defender.currentHp > 0;

  const counterResult = defenderSurvived ? dealDamage(defender, attacker, log, defenderBonus) : null;
  const dmgToAttacker = counterResult ? counterResult.damage : 0;
  const attackerSurvived = attacker.currentHp > 0;

  if (catalogIdOf(attacker.def) === 'minatoJoshi' && dmgToDefender > 0) {
    gold.transfer(defender.ownerId, attacker.ownerId, dmgToDefender);
    log.push(`${attacker.def.name}が${dmgToDefender}Gを奪った`);
  }
  if (catalogIdOf(defender.def) === 'minatoJoshi' && dmgToAttacker > 0) {
    gold.transfer(attacker.ownerId, defender.ownerId, dmgToAttacker);
    log.push(`${defender.def.name}が${dmgToAttacker}Gを奪った`);
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

  return {
    log,
    dmgToAttacker,
    dmgToDefender,
    attackerSurvived,
    defenderSurvived,
    attackMessage: attackResult.message,
    counterMessage: counterResult ? counterResult.message : null,
  };
}
