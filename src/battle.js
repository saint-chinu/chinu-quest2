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

/**
 * 常にitemDefのコピーをitemsへ積む（共有カタログの元オブジェクトを直接
 * 参照しない）。ナンカのお守り/ライフジャケットのような「1戦闘1回」系は
 * 消費済みフラグをこのコピー自身に立てるため、共有参照のままだと他の
 * プレイヤー・他の戦闘にまで消費済み状態が漏れてしまう。ペーの杖の
 * atkBonusRangeは、その延長でこの装備時に範囲内のATKボーナスを1回だけ抽選する。
 */
export function equipItem(unit, itemDef) {
  if (itemDef.atkBonusRange) {
    const [min, max] = itemDef.atkBonusRange;
    const rolled = min + Math.floor(Math.random() * (max - min + 1));
    const equipped = { ...itemDef, atkBonus: rolled };
    unit.items.push(equipped);
    return equipped;
  }
  const equipped = { ...itemDef };
  unit.items.push(equipped);
  return equipped;
}

// 呪い状態は常に1つしか保持されない: 新しい呪いをかけると、モンスターに
// 既にかかっていた呪い（種類問わず）は上書きされて消える。以下の
// apply系関数は全てこのsetCurseを経由し、unit.cursesを「置き換え」る
// （追加ではない）。
function setCurse(unit, curse) {
  unit.curses = [
    {
      addedAtk: 0,
      addedHp: 0,
      traits: [],
      ...curse,
    },
  ];
}

/** Casts a spell onto a monster already on the field ("curse" status)。既存の呪いは上書きされる。 */
export function applyCurse(unit, spellDef) {
  setCurse(unit, {
    name: spellDef.name,
    addedAtk: spellDef.addedAtk || 0,
    addedHp: spellDef.addedHp || 0,
    traits: spellDef.traits || [],
  });
}

/** 毒状態を付与する（カエンタケ参照）。addedAtk/addedHpを持たないcurseなのでstatTotalsのステータス計算には影響しない。既存の呪いは上書きされる。 */
export function applyPoison(unit, ratio) {
  setCurse(unit, { name: '毒', poisonRatio: ratio });
}

/** 感電状態を付与する（雷雲参照）。以後この個体が攻撃する度に一定確率で攻撃そのものが不発になる（目くらましと違い1回で消費されず、入れ替え/死亡/移動まで持続）。既存の呪いは上書きされる。 */
function applyShock(unit, chance) {
  setCurse(unit, { name: '感電', shockChance: chance });
}

/** ATKダウンの呪い（静電気野郎参照）。既存のaddedAtk汎用curseをそのまま流用。既存の呪いは上書きされる（以前は重ね掛けだったが、呪いは1つしか保持できない仕様に変更）。 */
function applyAtkDown(unit, amount) {
  setCurse(unit, { name: 'ATKダウン', addedAtk: -amount });
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
  // Ninja(doubleItemEffect): 装備アイテムのatk/hpボーナスだけを2倍にする
  // （プラスもマイナスも対象）。ネット弁慶(statOverrideInBattle): 素の
  // def.atk/hpの代わりに固定値20/20を基準にする（アイテム・呪い・状況
  // ボーナスはその上にそのまま乗る＝弱体化はあくまで「素の数値」だけ）。
  const itemMultiplier = unit.def.effect?.type === 'doubleItemEffect' ? 2 : 1;
  const itemAtk = unit.items.reduce((sum, i) => sum + (i.atkBonus || 0), 0) * itemMultiplier;
  const itemHp = unit.items.reduce((sum, i) => sum + (i.hpBonus || 0), 0) * itemMultiplier;
  const curseAtk = unit.curses.reduce((sum, c) => sum + (c.addedAtk || 0), 0);
  const curseHp = unit.curses.reduce((sum, c) => sum + (c.addedHp || 0), 0);
  const override = unit.def.effect?.type === 'statOverrideInBattle' ? unit.def.effect : null;
  const baseAtk = override ? override.atk : unit.def.atk;
  const baseHp = override ? override.hp : unit.def.hp;
  // ダンボールの鎧(forceZeroAtk): 装備中はATKが常に0になる（他の加算要素も
  // 含め完全に上書き）。装備アイテムは常に最大1個なのでsome()で十分。
  const forcesZeroAtk = unit.items.some((i) => i.forceZeroAtk);
  return {
    atk: forcesZeroAtk ? 0 : baseAtk + curseAtk + itemAtk + (bonus.atk || 0),
    maxHp: baseHp + curseHp + itemHp + (bonus.hp || 0),
  };
}

/** カード自身の効果、または装備中アイテムの効果から、指定typeのものを1つ返す（無ければnull）。目出し帽/斬〇剣のような「モンスター効果としても既存だがアイテムとしても同じ効果を持たせたい」ケースをまとめて拾うためのヘルパー。 */
function getEffect(unit, type) {
  if (unit.def.effect?.type === type) return unit.def.effect;
  const item = unit.items.find((i) => i.effect?.type === type);
  return item ? item.effect : null;
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

  const bonusEffect = getEffect(attackerUnit, 'elementDamageBonus');
  if (bonusEffect && defenderUnit.def.element === bonusEffect.targetElement) {
    multiplier *= bonusEffect.multiplier;
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

  // 貫通(pierce): 反射・無効化系（ナンカのお守り/くねくね/ハリネズミの服）を
  // 全て無視して素通りする。同属性ボーナス（土地レベルのHP加算）を無視する
  // 側の処理はgame.js側で別途行う（_runBattleScene参照）。
  const pierces = hasTrait(attackerUnit, 'pierce');

  // ナンカのお守り(negateNextDamage): このアイテムで1回だけダメージを
  // 完全無効化する（アイテム本体にconsumedを立てて再発動を防ぐ - itemsは
  // 戦闘終了時に必ずクリアされるので使い回しの心配は無い）。
  const negateItem = !pierces && defenderUnit.items.find((i) => i.effect?.type === 'negateNextDamage' && !i.consumed);
  if (negateItem && damage > 0) {
    negateItem.consumed = true;
    const message = `${defenderUnit.def.name}は「${negateItem.name}」でダメージを無効化した`;
    log.push(message);
    return { damage: 0, message };
  }

  // くねくね(reflectDamage): 攻撃をそのまま跳ね返す - 自身はノーダメージ、
  // 攻撃側がその分のダメージを受ける。攻撃自体が「届かなかった」扱いなので
  // 命中時オンヒット効果（毒付与など）は発動させない - damage:0を返す。
  if (!pierces && defenderUnit.def.effect?.type === 'reflectDamage' && damage > 0) {
    attackerUnit.currentHp -= damage;
    const message = `${defenderUnit.def.name}が反射！ ${attackerUnit.def.name}に${damage}ダメージ`;
    log.push(message);
    return { damage: 0, message, reflectedDamage: damage, reflectedTargetHp: attackerUnit.currentHp };
  }

  defenderUnit.currentHp -= damage;
  let message = `${attackerUnit.def.name} → ${defenderUnit.def.name} に${damage}ダメージ（倍率${multiplier}）`;

  // ライフジャケット(surviveLethalDamage): 致死ダメージでもHP1で踏みとどまる
  // （1戦闘1回のみ - アイテム本体にconsumedを立てて再発動を防ぐ）。
  if (defenderUnit.currentHp <= 0) {
    const lifeJacketItem = defenderUnit.items.find((i) => i.effect?.type === 'surviveLethalDamage' && !i.consumed);
    if (lifeJacketItem) {
      lifeJacketItem.consumed = true;
      defenderUnit.currentHp = 1;
      message += `／${defenderUnit.def.name}は「${lifeJacketItem.name}」でHP1で踏みとどまった`;
    }
  }

  // ハリネズミの服(reflectHalfDamage): くねくねと違い自分も普通にダメージを
  // 受けたうえで、その半分を追加で攻撃側にも返す。
  let resultReflectedDamage = 0;
  const halfReflectItem = !pierces && defenderUnit.items.find((i) => i.effect?.type === 'reflectHalfDamage');
  if (halfReflectItem && damage > 0) {
    const reflected = Math.round(damage / 2);
    attackerUnit.currentHp -= reflected;
    message += `／${defenderUnit.def.name}が${reflected}ダメージを反射した`;
    resultReflectedDamage = reflected;
  }

  log.push(message);
  return {
    damage,
    message,
    reflectedDamage: typeof resultReflectedDamage === 'number' ? resultReflectedDamage : 0,
    reflectedTargetHp: attackerUnit.currentHp,
  };
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
    const stealMultipleEffect = getEffect(attackerUnit, 'stealDamageMultiple');
    if (stealMultipleEffect) {
      const stolen = result.damage * stealMultipleEffect.multiplier;
      gold.transfer(defenderUnit.ownerId, attackerUnit.ownerId, stolen);
      log.push(`${attackerUnit.def.name}が${stolen}Gを奪った`);
    }
    if (defenderUnit.currentHp > 0 && attackerEffect?.type === 'chanceSetHpOnHit' && Math.random() < attackerEffect.chance) {
      defenderUnit.currentHp = attackerEffect.hp;
      log.push(`${defenderUnit.def.name}のHPが${attackerEffect.hp}に固定された`);
    }
    const instantKillEffect = getEffect(attackerUnit, 'instantKillOnHit');
    if (
      defenderUnit.currentHp > 0 &&
      instantKillEffect &&
      (!instantKillEffect.targetElement || defenderUnit.def.element === instantKillEffect.targetElement) &&
      Math.random() < instantKillEffect.chance
    ) {
      defenderUnit.currentHp = 0;
      log.push(`${defenderUnit.def.name}は即死した`);
    }
    // 電流ムチ(chanceBlindOnHit): 命中時、一定確率で相手を1ターン行動不能
    // にする（目くらまし=blindedと同じ「次の自分の攻撃を1回潰す」仕組み）。
    const chanceBlindEffect = getEffect(attackerUnit, 'chanceBlindOnHit');
    if (chanceBlindEffect && Math.random() < chanceBlindEffect.chance) {
      defenderUnit.blinded = true;
      log.push(`${defenderUnit.def.name}は行動不能になった`);
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

// 先制(firstStrike)は+1、後攻(lastStrike)は-1、どちらも無ければ0。スコアが
// 高い方が先に攻撃する（同スコア同士は下のresolveBattleが従来通り攻撃側を
// 先にする）。先制と後攻が同じ戦闘に両方出てきても、単純に「先制側が先・
// 後攻側が後」で矛盾なく解決できる設計。
function strikeOrderScore(unit) {
  if (hasTrait(unit, 'firstStrike')) return 1;
  if (hasTrait(unit, 'lastStrike')) return -1;
  return 0;
}

/**
 * Sequential single exchange: whoever goes first strikes, and only if their
 * target survives that hit does it get to strike back. A target killed
 * outright never counters, so the first striker takes zero damage in that
 * case (this is why "mutual destruction" can't happen in ordinary combat -
 * it would need a special ability that damages the first striker outside of
 * a counter-attack, none of which exist). The attacker goes first UNLESS the
 * defender's strikeOrderScore is higher than the attacker's (先制/firstStrike
 * = +1, 後攻/lastStrike = -1 - see strikeOrderScore) - ties (including the
 * common "neither has either trait" case, or both having the same trait)
 * revert to the normal attacker-first order. Items are consumed regardless
 * of outcome; curses persist unless their unit died. `attackerBonus`/
 * `defenderBonus` ({atk, hp}) carry this battle's 同属性ボーナス/応援
 * ボーナス/カード固有の連鎖・レアリティ補正 (see Game._battleBonus/
 * _applyEffectBonus) - purely situational, never stored on the unit.
 * `exchanges` lists each strike in the order it actually happened ({side,
 * message, damage, targetDied}), so the caller's UI can animate them in the
 * right sequence regardless of who went first.
 */
export function resolveBattle(attacker, defender, gold, attackerBonus = {}, defenderBonus = {}) {
  const log = [];

  // 攻撃開始前効果: アイテム破壊（海賊S/ステゴロ）。prepareForBattleより
  // 前でないと破壊したアイテムのHPボーナスがmaxHpに残ってしまう。
  if (getEffect(attacker, 'destroyItemBeforeAttack') && defender.items.length > 0) {
    defender.items = [];
    log.push(`${attacker.def.name}が${defender.def.name}のアイテムを破壊した`);
  }
  if (getEffect(defender, 'destroyItemBeforeAttack') && attacker.items.length > 0) {
    attacker.items = [];
    log.push(`${defender.def.name}が${attacker.def.name}のアイテムを破壊した`);
  }

  // 攻撃開始前効果: アイテム強奪（真剣白刃取り）。破壊と同じタイミングで
  // 判定する（相手のアイテムを消す代わりに自分の装備に加える）。
  if (getEffect(attacker, 'stealItemBeforeAttack') && defender.items.length > 0) {
    attacker.items = [...attacker.items, ...defender.items];
    defender.items = [];
    log.push(`${attacker.def.name}が${defender.def.name}のアイテムを奪い装備した`);
  }
  if (getEffect(defender, 'stealItemBeforeAttack') && attacker.items.length > 0) {
    defender.items = [...defender.items, ...attacker.items];
    attacker.items = [];
    log.push(`${defender.def.name}が${attacker.def.name}のアイテムを奪い装備した`);
  }

  prepareForBattle(attacker, attackerBonus);
  prepareForBattle(defender, defenderBonus);
  log.push(
    `${attacker.def.name}(ATK${statTotals(attacker, attackerBonus).atk}/HP${attacker.currentHp}) vs ` +
      `${defender.def.name}(ATK${statTotals(defender, defenderBonus).atk}/HP${defender.currentHp})`
  );

  const defenderGoesFirst = strikeOrderScore(defender) > strikeOrderScore(attacker);
  const first = defenderGoesFirst
    ? { unit: defender, target: attacker, bonus: defenderBonus, side: 'defender' }
    : { unit: attacker, target: defender, bonus: attackerBonus, side: 'attacker' };
  const second = defenderGoesFirst
    ? { unit: attacker, target: defender, bonus: attackerBonus, side: 'attacker' }
    : { unit: defender, target: attacker, bonus: defenderBonus, side: 'defender' };

  // 通常（攻撃側が先）から順番が入れ替わった時だけ、先制/後攻が実際に
  // 発動したこととして明示する（ユーザー向けの「特殊効果が発動」演出の
  // トリガーに使う - resolveBattleの戻り値exchangesの最初の要素のspecial
  // に載せる）。
  let orderSpecial = null;
  if (defenderGoesFirst) {
    if (hasTrait(defender, 'firstStrike')) orderSpecial = `${defender.def.name}の先制発動！`;
    else if (hasTrait(attacker, 'lastStrike')) orderSpecial = `${attacker.def.name}は後攻に回った`;
    if (orderSpecial) log.push(orderSpecial);
  }

  // ツインハンマー(doubleStrike): 装備している側は自分の番に1回ではなく
  // 連続2回攻撃する（相手が1発目で力尽きれば2発目は撃たない）。単発の場合
  // strikeCount=1なのでループは従来通り1回で終わる。
  const strikeCount = (unit) => (unit.items.some((i) => i.effect?.type === 'doubleStrike') ? 2 : 1);

  // performStrike/dealDamageは特殊効果が発動するたびに専用のlog行を
  // 追加で積む（毒付与・G略奪・即死・反射・無効化等）。この一撃の間に
  // 増えたlog行のうち、通常のダメージ行（strike.message、それ自体が
  // returnされる）以外を「特殊効果の発動メッセージ」として拾う - 個々の
  // 効果分岐を1つずつ書き換えなくて済むよう、既存のlog.push呼び出しを
  // そのまま再利用する設計。
  const exchanges = [];
  let firstTargetSurvived = true;
  for (let i = 0; i < strikeCount(first.unit) && firstTargetSurvived && first.unit.currentHp > 0; i++) {
    const beforeLen = log.length;
    const strike = performStrike(first.unit, first.target, first.bonus, log, gold);
    firstTargetSurvived = first.target.currentHp > 0;
    const special = log.slice(beforeLen).filter((line) => line !== strike.message);
    if (i === 0 && orderSpecial) special.unshift(orderSpecial);
    exchanges.push({
      side: first.side,
      message: strike.reflectedDamage > 0
        ? (strike.damage > 0 ? strike.message.split('／')[0] : `${first.target.def.name}が攻撃を反射した！`)
        : strike.message,
      damage: strike.damage,
      element: first.unit.def.element,
      targetHp: first.target.currentHp,
      targetDied: !firstTargetSurvived,
      special,
    });
    if (strike.reflectedDamage > 0) {
      exchanges.push({
        side: first.side === 'attacker' ? 'defender' : 'attacker',
        message: `${first.target.def.name}が反射！ ${first.unit.def.name}に${strike.reflectedDamage}ダメージ`,
        damage: strike.reflectedDamage,
        element: first.target.def.element,
        targetHp: strike.reflectedTargetHp,
        targetDied: strike.reflectedTargetHp <= 0,
        special: ['反射！'],
        reflected: true,
      });
    }
  }

  if (firstTargetSurvived && first.unit.currentHp > 0) {
    let secondTargetSurvived = true;
    for (let i = 0; i < strikeCount(second.unit) && secondTargetSurvived && second.unit.currentHp > 0; i++) {
      const beforeLen = log.length;
      const strike = performStrike(second.unit, second.target, second.bonus, log, gold);
      secondTargetSurvived = second.target.currentHp > 0;
      const special = log.slice(beforeLen).filter((line) => line !== strike.message);
      exchanges.push({
        side: second.side,
        message: strike.reflectedDamage > 0
          ? (strike.damage > 0 ? strike.message.split('／')[0] : `${second.target.def.name}が攻撃を反射した！`)
          : strike.message,
        damage: strike.damage,
        element: second.unit.def.element,
        targetHp: second.target.currentHp,
        targetDied: !secondTargetSurvived,
        special,
      });
      if (strike.reflectedDamage > 0) {
        exchanges.push({
          side: second.side === 'attacker' ? 'defender' : 'attacker',
          message: `${second.target.def.name}が反射！ ${second.unit.def.name}に${strike.reflectedDamage}ダメージ`,
          damage: strike.reflectedDamage,
          element: second.target.def.element,
          targetHp: strike.reflectedTargetHp,
          targetDied: strike.reflectedTargetHp <= 0,
          special: ['反射！'],
          reflected: true,
        });
      }
    }
  }

  const dmgToDefender = exchanges.filter((e) => e.side === 'attacker' && !e.reflected).reduce((sum, e) => sum + e.damage, 0);
  const dmgToAttacker = exchanges.filter((e) => e.side === 'defender' && !e.reflected).reduce((sum, e) => sum + e.damage, 0);

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
