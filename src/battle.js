import { WEAK_AGAINST } from './battleCards.js';

/** A monster once it's on the board: base stats plus equipped items/curses. */
export function createFieldUnit(monsterDef, ownerId) {
  return {
    ownerId,
    def: monsterDef,
    items: [], // weapon/armor - removed after every battle
    curses: [], // spell effects/毒 - removed only when the unit dies (入れ替えは新しいcreateFieldUnitに置き換わるので別途クリア不要)
    currentHp: monsterDef.hp,
    blinded: false, // 目くらまし: 次の自分の攻撃を1回だけ潰す（アオリイカ参照）
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

/** 毒状態を付与する（カエンタケ参照）。addedAtk/addedHpを持たないcurseなのでstatTotalsのステータス計算には影響しない。既に毒なら上書きしない（重ね掛け不可）。 */
function applyPoison(unit, ratio) {
  if (unit.curses.some((c) => c.poisonRatio != null)) return;
  unit.curses.push({ name: '毒', poisonRatio: ratio, addedAtk: 0, addedHp: 0, traits: [] });
}

/** 感電状態を付与する（雷雲参照）。以後この個体が攻撃する度に一定確率で攻撃そのものが不発になる（目くらましと違い1回で消費されず、毒同様に入れ替え/死亡まで持続）。既に感電なら上書きしない。 */
function applyShock(unit, chance) {
  if (unit.curses.some((c) => c.shockChance != null)) return;
  unit.curses.push({ name: '感電', shockChance: chance, addedAtk: 0, addedHp: 0, traits: [] });
}

/** ATKダウンの呪い（静電気野郎参照）。既存のaddedAtk汎用curseをそのまま流用 - 通常の永続呪いと全く同じ仕組みで、重ね掛けもされる（複数回被弾すればその分下がり続ける）。 */
function applyAtkDown(unit, amount) {
  unit.curses.push({ name: 'ATKダウン', addedAtk: -amount, addedHp: 0, traits: [] });
}

function randomStep(min, max, step) {
  const stepsCount = Math.floor((max - min) / step) + 1;
  return min + step * Math.floor(Math.random() * stepsCount);
}

// `bonus` carries battle-context modifiers the unit itself doesn't know
// about (同属性ボーナス's land-level HP, 応援's adjacent-ally ATK, カード
// 固有の連鎖/レアリティ補正 - Game._battleBonus/_applyEffectBonus参照) -
// the caller (Game, which has the board) computes these per-battle and
// passes them in, same shape as items/curses but never persisted on the unit.
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

// 属性ごとの被ダメージ倍率。WEAK_AGAINSTの弱点属性（1.2倍）に加えて、
// カード固有の「特定属性に2倍」のような効果（ファイヤーマン参照）も
// ここでまとめて掛け合わせる。
function incomingDamageMultiplier(defenderUnit, attackerUnit) {
  const weakness = WEAK_AGAINST[defenderUnit.def.element];
  const isWeaknessHit = attackerUnit.def.element === weakness;
  let multiplier = isWeaknessHit ? 1.2 : 1.0;

  const attackerEffect = attackerUnit.def.effect;
  if (attackerEffect?.type === 'elementDamageBonus' && defenderUnit.def.element === attackerEffect.targetElement) {
    multiplier *= attackerEffect.multiplier;
  }
  return multiplier;
}

/** 被ダメージ半減 (halfDamage trait) is a flat modifier; マグマンの「1/2の確率で半減」はヒット毎の抽選なのでtraitとは別枠で判定する。貫通(pierce)はtraitの半減だけ無効化する（確率半減は対象外）。 */
function damageReductionMultiplier(defenderUnit, attackerUnit) {
  let multiplier = 1;
  if (hasTrait(defenderUnit, 'halfDamage') && !hasTrait(attackerUnit, 'pierce')) multiplier *= 0.5;
  if (defenderUnit.def.effect?.type === 'chanceDamageReduction' && Math.random() < defenderUnit.def.effect.chance) {
    multiplier *= defenderUnit.def.effect.multiplier;
  }
  return multiplier;
}

function dealDamage(attackerUnit, defenderUnit, log, attackerBonus) {
  const atkStats = statTotals(attackerUnit, attackerBonus);
  const multiplier = incomingDamageMultiplier(defenderUnit, attackerUnit) * damageReductionMultiplier(defenderUnit, attackerUnit);
  // ATKダウンの呪い（静電気野郎）が重なって0未満になっても、マイナスダメージ
  // （＝相手を回復させてしまう）にはならないようクランプする。
  const damage = Math.max(0, Math.round(atkStats.atk * multiplier));
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
 * 1回の攻撃（先制側・後攻側どちらの1手も同じ形）を解決する。目くらまし
 * （アオリイカ）を受けていれば0ダメージでスキップして消費、そうでなければ
 * 挑戦者オッズ系（炎のチャレンジャー: 自分の攻撃が1/3の確率で失敗 / 相手が
 * 1/3の確率で無効化）を判定してからdealDamageを呼ぶ。命中時だけ発動する
 * オンヒット効果（毒付与・目くらまし付与・G略奪）、撃破時効果（賠償金・
 * 道連れ）、攻撃終了時に無条件で発動する自傷系もここでまとめて処理する。
 */
function performStrike(attackerUnit, defenderUnit, bonus, log, gold) {
  if (attackerUnit.blinded) {
    attackerUnit.blinded = false;
    const message = `${attackerUnit.def.name}は目くらましで攻撃できなかった`;
    log.push(message);
    return { damage: 0, message };
  }

  const shockCurse = attackerUnit.curses.find((c) => c.shockChance != null);
  if (shockCurse && Math.random() < shockCurse.shockChance) {
    const message = `${attackerUnit.def.name}は感電で攻撃できなかった`;
    log.push(message);
    return { damage: 0, message };
  }

  const attackerEffect = attackerUnit.def.effect;
  const defenderEffect = defenderUnit.def.effect;

  if (attackerEffect?.type === 'challengeOdds' && Math.random() < attackerEffect.attackFailureChance) {
    const message = `${attackerUnit.def.name}の攻撃は外れた`;
    log.push(message);
    return { damage: 0, message };
  }
  if (defenderEffect?.type === 'challengeOdds' && Math.random() < defenderEffect.negateIncomingChance) {
    const message = `${defenderUnit.def.name}が攻撃を無効化した`;
    log.push(message);
    return { damage: 0, message };
  }

  const result = dealDamage(attackerUnit, defenderUnit, log, bonus);

  if (result.damage > 0) {
    if (attackerEffect?.type === 'stealGoldOnHit') {
      gold.transfer(defenderUnit.ownerId, attackerUnit.ownerId, attackerEffect.amount);
      log.push(`${attackerUnit.def.name}が${attackerEffect.amount}Gを奪った`);
    }
    if (attackerEffect?.type === 'poisonOnHit') {
      applyPoison(defenderUnit, attackerEffect.baseHpRatio);
      log.push(`${defenderUnit.def.name}は毒状態になった`);
    }
    if (attackerEffect?.type === 'blindOnHit') {
      defenderUnit.blinded = true;
      log.push(`${defenderUnit.def.name}は目くらまし状態になった`);
    }
    if (attackerEffect?.type === 'atkDownOnHit') {
      applyAtkDown(defenderUnit, attackerEffect.amount);
      log.push(`${defenderUnit.def.name}のATKが${attackerEffect.amount}下がった`);
    }
    if (attackerEffect?.type === 'shockOnHit') {
      applyShock(defenderUnit, attackerEffect.chance);
      log.push(`${defenderUnit.def.name}は感電状態になった`);
    }
    if (attackerEffect?.type === 'stealDamageMultiple') {
      const stolen = result.damage * attackerEffect.multiplier;
      gold.transfer(defenderUnit.ownerId, attackerUnit.ownerId, stolen);
      log.push(`${attackerUnit.def.name}が${stolen}Gを奪った`);
    }
    if (defenderUnit.currentHp > 0 && attackerEffect?.type === 'chanceSetHpOnHit' && Math.random() < attackerEffect.chance) {
      defenderUnit.currentHp = attackerEffect.hp;
      log.push(`${defenderUnit.def.name}のHPが${attackerEffect.hp}に固定された`);
    }
    if (
      defenderUnit.currentHp > 0 &&
      attackerEffect?.type === 'instantKillOnHit' &&
      (!attackerEffect.targetElement || defenderUnit.def.element === attackerEffect.targetElement) &&
      Math.random() < attackerEffect.chance
    ) {
      defenderUnit.currentHp = 0;
      log.push(`${defenderUnit.def.name}は即死した`);
    }
  }

  if (defenderUnit.currentHp <= 0) {
    if (attackerEffect?.type === 'payOnKill') {
      gold.transfer(attackerUnit.ownerId, defenderUnit.ownerId, attackerEffect.amount);
      log.push(`${attackerUnit.def.name}は${defenderUnit.def.name}を倒したが賠償金${attackerEffect.amount}Gを支払った`);
    }
    if (attackerEffect?.type === 'goldOnKillElement' && defenderUnit.def.element === attackerEffect.targetElement) {
      gold.add(attackerUnit.ownerId, attackerEffect.amount);
      log.push(`${attackerUnit.def.name}は${defenderUnit.def.name}を倒して${attackerEffect.amount}Gを得た`);
    }
    if (defenderEffect?.type === 'deathRetaliation' && defenderEffect.trigger === 'enemyAttack') {
      attackerUnit.currentHp -= defenderEffect.damage;
      log.push(`${defenderUnit.def.name}は道連れに${attackerUnit.def.name}へ${defenderEffect.damage}ダメージ！`);
    }
  }

  if (attackerEffect?.type === 'selfDamageAfterAttack') {
    attackerUnit.currentHp -= attackerEffect.damage;
    log.push(`${attackerUnit.def.name}は攻撃の反動で${attackerEffect.damage}ダメージを受けた`);
  }
  if (attackerEffect?.type === 'chanceSelfDamageOnAttack' && Math.random() < attackerEffect.chance) {
    attackerUnit.currentHp -= attackerEffect.damage;
    log.push(`${attackerUnit.def.name}は自らの攻撃で${attackerEffect.damage}ダメージを受けた`);
  }
  if (attackerEffect?.type === 'chanceSelfDestructAfterAttack' && Math.random() < attackerEffect.chance) {
    attackerUnit.currentHp = 0;
    log.push(`${attackerUnit.def.name}は暴発して自滅した`);
  }

  return result;
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
 * ({atk, hp}) carry this battle's 同属性ボーナス/応援ボーナス/カード固有の
 * 連鎖・レアリティ補正 (see Game._battleBonus/_applyEffectBonus) - purely
 * situational, never stored on the unit. `exchanges` lists each strike in
 * the order it actually happened ({side, message, damage, targetDied}), so
 * the caller's UI can animate them in the right sequence regardless of who
 * went first.
 */
export function resolveBattle(attacker, defender, gold, attackerBonus = {}, defenderBonus = {}) {
  const log = [];

  // 攻撃開始前効果: アイテム破壊（海賊S）。prepareForBattleより前でないと
  // 破壊したアイテムのHPボーナスがmaxHpに残ってしまう。
  if (attacker.def.effect?.type === 'destroyItemBeforeAttack' && defender.items.length > 0) {
    defender.items = [];
    log.push(`${attacker.def.name}が${defender.def.name}のアイテムを破壊した`);
  }
  if (defender.def.effect?.type === 'destroyItemBeforeAttack' && attacker.items.length > 0) {
    attacker.items = [];
    log.push(`${defender.def.name}が${attacker.def.name}のアイテムを破壊した`);
  }

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
  const firstStrike = performStrike(first.unit, first.target, first.bonus, log, gold);
  const firstTargetSurvived = first.target.currentHp > 0;
  exchanges.push({ side: first.side, message: firstStrike.message, damage: firstStrike.damage, targetDied: !firstTargetSurvived });

  const secondStrike = firstTargetSurvived ? performStrike(second.unit, second.target, second.bonus, log, gold) : null;
  if (secondStrike) {
    exchanges.push({
      side: second.side,
      message: secondStrike.message,
      damage: secondStrike.damage,
      targetDied: second.target.currentHp <= 0,
    });
  }

  const dmgToDefender = (first.side === 'attacker' ? firstStrike : second.side === 'attacker' ? secondStrike : null)?.damage ?? 0;
  const dmgToAttacker = (first.side === 'defender' ? firstStrike : second.side === 'defender' ? secondStrike : null)?.damage ?? 0;

  // 強盗: 実際に与えたダメージの3倍を奪う（どちら側が持っていても効く）。
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

  // 毒tick: この時点でまだ生きている側だけ、保持している毒でさらに
  // ダメージを受ける（基礎HP=def.hp基準、呪い等のボーナスは含まない）。
  // これで力尽きることもある（カエンタケの毒はこの一撃の中でも即発動）。
  for (const unit of [attacker, defender]) {
    if (unit.currentHp <= 0) continue;
    const poison = unit.curses.find((c) => c.poisonRatio != null);
    if (!poison) continue;
    const poisonDamage = Math.round(unit.def.hp * poison.poisonRatio);
    unit.currentHp -= poisonDamage;
    log.push(`${unit.def.name}は毒で${poisonDamage}ダメージを受けた`);
  }

  const attackerSurvived = attacker.currentHp > 0;
  const defenderSurvived = defender.currentHp > 0;

  if (defenderSurvived && defender.def.effect?.type === 'survivalGold') {
    const bonus = defender.currentHp * defender.def.effect.multiplier;
    gold.add(defender.ownerId, bonus);
    log.push(`${defender.def.name}は土地に生き残り${bonus}Gを獲得`);
  }
  if (attackerSurvived && attacker.def.effect?.type === 'survivalGold') {
    const bonus = attacker.currentHp * attacker.def.effect.multiplier;
    gold.add(attacker.ownerId, bonus);
    log.push(`${attacker.def.name}は土地に生き残り${bonus}Gを獲得`);
  }

  // 戦闘終了時に生死を問わず発動する系（ランダムゴールド）。
  if (attacker.def.effect?.type === 'randomGoldAfterBattle') {
    const g = randomStep(attacker.def.effect.min, attacker.def.effect.max, attacker.def.effect.step);
    gold.add(attacker.ownerId, g);
    log.push(`${attacker.def.name}は戦闘後に${g}Gを得た`);
  }
  if (defender.def.effect?.type === 'randomGoldAfterBattle') {
    const g = randomStep(defender.def.effect.min, defender.def.effect.max, defender.def.effect.step);
    gold.add(defender.ownerId, g);
    log.push(`${defender.def.name}は戦闘後に${g}Gを得た`);
  }
  if (attacker.def.effect?.type === 'chanceGoldAfterBattle' && Math.random() < attacker.def.effect.chance) {
    gold.add(attacker.ownerId, attacker.def.effect.amount);
    log.push(`${attacker.def.name}は戦闘後に${attacker.def.effect.amount}Gを得た`);
  }
  if (defender.def.effect?.type === 'chanceGoldAfterBattle' && Math.random() < defender.def.effect.chance) {
    gold.add(defender.ownerId, defender.def.effect.amount);
    log.push(`${defender.def.name}は戦闘後に${defender.def.effect.amount}Gを得た`);
  }

  // 生存時のみの自己完結効果（回復・自傷）。ここでさらに力尽きることもある
  // ので、items/cursesのクリア判定は最後にfinalXSurvivedで再計算する。
  if (attackerSurvived && attacker.def.effect?.type === 'selfHealAfterBattle') {
    const eff = attacker.def.effect;
    const maxHp = statTotals(attacker, attackerBonus).maxHp;
    attacker.currentHp = Math.min(attacker.currentHp + eff.healAmount, maxHp);
    gold.add(attacker.ownerId, -eff.cost);
    log.push(`${attacker.def.name}は戦闘後にHP${eff.healAmount}回復した (-${eff.cost}G)`);
  }
  if (defenderSurvived && defender.def.effect?.type === 'selfHealAfterBattle') {
    const eff = defender.def.effect;
    const maxHp = statTotals(defender, defenderBonus).maxHp;
    defender.currentHp = Math.min(defender.currentHp + eff.healAmount, maxHp);
    gold.add(defender.ownerId, -eff.cost);
    log.push(`${defender.def.name}は戦闘後にHP${eff.healAmount}回復した (-${eff.cost}G)`);
  }
  if (attackerSurvived && attacker.def.effect?.type === 'selfDamageAfterBattle') {
    attacker.currentHp -= attacker.def.effect.damage;
    log.push(`${attacker.def.name}は戦闘後に${attacker.def.effect.damage}ダメージを受けた`);
  }
  if (defenderSurvived && defender.def.effect?.type === 'selfDamageAfterBattle') {
    defender.currentHp -= defender.def.effect.damage;
    log.push(`${defender.def.name}は戦闘後に${defender.def.effect.damage}ダメージを受けた`);
  }

  const finalAttackerSurvived = attacker.currentHp > 0;
  const finalDefenderSurvived = defender.currentHp > 0;

  attacker.items = [];
  defender.items = [];
  if (!finalAttackerSurvived) attacker.curses = [];
  if (!finalDefenderSurvived) defender.curses = [];

  return { log, dmgToAttacker, dmgToDefender, attackerSurvived: finalAttackerSurvived, defenderSurvived: finalDefenderSurvived, exchanges };
}
