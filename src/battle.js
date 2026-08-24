import { WEAK_AGAINST } from './battleCards.js';

// 演出側と解決側で同じ戦闘前効果を共有する。特に確率効果を引き直さない。
const preAttackEffectCache = new WeakMap();

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
  // 属性特効武器は「相手の属性」ではなく「装備するモンスターの属性」が
  // 一致した時に固定ATKを追加する。装備コピーのatkBonusへ反映しておけば、
  // 実ダメージ・装備演出のゲージ・戦闘シミュレーションが同じ値を使える。
  if (equipped.effect?.type === 'wielderElementAtkBonus'
      && unit.def.element === equipped.effect.wielderElement) {
    equipped.atkBonus = (equipped.atkBonus || 0) + (equipped.effect.atkBonus || 0);
  }
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
export function statTotals(unit, bonus = {}) {
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
  const baseAtk = (override ? override.atk : unit.def.atk)
    + Number(unit.regenAtkBonus || 0)
    + Number(unit.lapGrowthAtkBonus || 0);
  // タフネスで空地へ召喚された個体のHP加算は、その盤面上の個体だけが持つ
  // 基礎HPとして扱う。カード定義やデッキへは書き戻さない。
  const summonBaseHpBonus = Number(unit.summonBaseHpBonus || 0);
  const baseHp = (override ? override.hp : unit.def.hp)
    + summonBaseHpBonus
    + Number(unit.lapGrowthHpBonus || 0);
  // ダンボールの鎧(forceZeroAtk): 装備中はATKが常に0になる（他の加算要素も
  // 含め完全に上書き）。装備アイテムは常に最大1個なのでsome()で十分。
  const forcesZeroAtk = unit.items.some((i) => i.forceZeroAtk);
  const additiveAtk = baseAtk + curseAtk + itemAtk + (bonus.atk || 0);
  return {
    // 狂戦士などのATK倍率は、基礎値だけでなく呪い・装備・応援等をすべて
    // 加算した最終ATKへ掛ける。属性相性はこの後のダメージ計算で別途適用。
    atk: forcesZeroAtk ? 0 : Math.round(additiveAtk * (bonus.atkMultiplier || 1)),
    maxHp: baseHp + curseHp + itemHp + (bonus.hp || 0),
  };
}

/** カード自身の効果、または装備中アイテムの効果から、指定typeのものを1つ返す（無ければnull）。目出し帽/斬〇剣のような「モンスター効果としても既存だがアイテムとしても同じ効果を持たせたい」ケースをまとめて拾うためのヘルパー。 */
function getEffect(unit, type) {
  if (unit.def.effect?.type === type) return unit.def.effect;
  const item = unit.items.find((i) => i.effect?.type === type);
  return item ? item.effect : null;
}

/** 素の最大HP（呪い・アイテム・属性地などの一時加算を一切含まない、def由来の
 *  HP）。盤面に居る間の「持ち越しダメージ」はこのスケールで測る。ネット弁慶の
 *  statOverrideInBattleだけは素のHP自体を固定値に差し替えるので考慮する。 */
function baseMaxHp(unit) {
  const baseHp = unit.def.effect?.type === 'statOverrideInBattle' ? unit.def.effect.hp : unit.def.hp;
  return baseHp
    + Number(unit.summonBaseHpBonus || 0)
    + Number(unit.lapGrowthHpBonus || 0);
}

/**
 * Call once right before a battle to lock in this fight's max HP.
 * 盤面に配置されている間に受けたダメージ（素の最大HPに対する不足分）は戦闘へ
 * 持ち越す（毎戦闘フル回復しない）。属性地・アイテム・呪いによるHP上乗せは
 * この戦闘限りの"シールド"として満タン側から乗る（＝持ち越しダメージを引いた
 * 上で戦闘用の最大HPになる）。手札に戻ったカードは新規インスタンス化される
 * ので、その時点で自動的に全快扱いに戻る（resolveBattle末尾の再格納も参照）。
 */
export function prepareForBattle(unit, bonus = {}) {
  // 戦闘前の盤面HPを保存する。避雷針侍の身代わりなどで戦闘結果を無効化する
  // 場合も、全快させずこの値へ戻すために使う。
  unit._boardHpBeforeBattle = unit.currentHp;
  const battleMax = statTotals(unit, bonus).maxHp;
  const carriedDamage = Math.max(0, baseMaxHp(unit) - unit.currentHp);
  // マイナスHPアイテム（諸刃の剣-20/鉄パイプ-5）やアイテム効果2倍(Ninja)・
  // ステータス上書き(ネット弁慶)の組み合わせで最大HPが0以下になると、
  // resolveBattleの攻撃ループが「currentHp > 0」ガードで全ての一撃をスキップし、
  // 演出もダメージも撃破も出ないまま戦闘が無音で終わってしまう。最低でも1は
  // 残し、必ず一度は戦えるようにする（諸刃の剣の"大振りできるが脆い"性質は維持）。
  unit.currentHp = Math.max(1, battleMax - carriedDamage);
  unit._battleMaxHp = battleMax;
}

/** 戦闘後、盤面に生き残ったユニットのcurrentHpを「素のHPスケール」へ戻す。
 *  戦闘中の一時シールド分を剥がし、受けた総ダメージだけを盤面の状態として残す
 *  ことで、次の戦闘までダメージが持ち越され、盤面表示(def.hp基準)とも一致する。 */
function restoreOnBoardHp(unit) {
  const boardHpBefore = Math.max(1, Math.min(baseMaxHp(unit), unit._boardHpBeforeBattle ?? unit.currentHp));
  // アイテム・土地レベル・応援等で増えたHPは戦闘中だけのシールド。
  // そのシールドが削れただけなら、盤面に持ち越す基礎HPは減らさない。
  // 戦闘中HPが戦闘前の基礎HPを下回った分だけを実ダメージとして残す。
  return Math.max(1, Math.min(boardHpBefore, unit.currentHp));
}

/**
 * 戦闘中/戦闘後の「回復」を、戦闘用HPと盤面へ持ち越す基礎HPの両方へ効かせる。
 * restoreOnBoardHpは盤面HPを戦闘前の値で頭打ちにするので、currentHpだけ上げても
 * 回復分がまるごと消える（再生・selfHealAfterBattleが効かない）。回復した分は
 * 一時シールドではなく実際の回復なので、持ち越しの上限も一緒に引き上げる。
 * `amount`にInfinityを渡すと全回復（基礎最大HPまで）。
 */
function healUnit(unit, amount, battleMaxHp) {
  if (!(amount > 0)) return;
  unit.currentHp = Math.min(unit.currentHp + amount, battleMaxHp);
  const boardBefore = unit._boardHpBeforeBattle ?? unit.currentHp;
  unit._boardHpBeforeBattle = Math.min(baseMaxHp(unit), boardBefore + amount);
}

/** Traits may come from the monster itself, its one-use item, or a persistent spell curse. */
export function hasTrait(unit, trait) {
  return !!unit.def.traits?.includes(trait)
    // 周回成長型(lapGrowth)が覚醒して手に入れた特性。カード定義はデッキ間で
    // 共有されうるので、覚醒は必ず盤上の個体側(awakenedTraits)に持たせる。
    || !!unit.awakenedTraits?.includes(trait)
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
  let triggeredMessage = null;
  if (defenderUnit.def.effect?.type === 'chanceDamageReduction' && Math.random() < defenderUnit.def.effect.chance) {
    multiplier *= defenderUnit.def.effect.multiplier;
    triggeredMessage = `${defenderUnit.def.name}のダメージ半減が発動！`;
  }
  return { multiplier, triggeredMessage };
}

// ナンカのお守り(negateNextDamage): このユニットが次に受けるダメージを1回だけ
// 完全無効化するチャージ。あれば消費してメッセージ文字列を返す（＝呼び出し側は
// ダメージを0にする）。通常攻撃だけでなく、反射(くねくね/ハリネズミの服)や
// 道連れ(deathRetaliation)など dealDamage を通らない戦闘ダメージにも共通で使う。
// アイテム本体にconsumedを立てて再発動を防ぐ（itemsは戦闘終了時に必ずクリア）。
function consumeDamageNegation(unit, log) {
  const item = unit.items.find((i) => i.effect?.type === 'negateNextDamage' && !i.consumed);
  if (!item) return null;
  item.consumed = true;
  const message = `${unit.def.name}は「${item.name}」でダメージを無効化した`;
  log.push(message);
  return message;
}

/**
 * ライフジャケット: 通常攻撃だけでなく反射など、戦闘中の致死ダメージに
 * 共通適用する。ただし守るのは「一撃」だけで、1戦闘に1回きり(consumed)。
 *  ・ツインハンマー(doubleStrike)の2発目は、1発目で使い切った後なので
 *    そのまま通る（HP1で耐えた＝生存扱いなので2発目自体は必ず飛んでくる）。
 *  ・毒tickはこの関数を通らないので、HP1で耐えた直後に毒で倒れる。
 * どちらも仕様どおり（ユーザー指定、2026-08-23）。
 */
function consumeLethalSurvival(unit) {
  if (unit.currentHp > 0) return null;
  const item = unit.items.find((i) => i.effect?.type === 'surviveLethalDamage' && !i.consumed);
  const curseIndex = unit.curses.findIndex((curse) => curse.traits?.includes('surviveLethalDamage'));
  if (!item && curseIndex < 0) return null;
  if (item) item.consumed = true;
  // 不死鳥の呪いは戦闘後も残る装備品ではなく、発動した時だけ消える呪い。
  const source = item || unit.curses[curseIndex];
  if (!item) unit.curses.splice(curseIndex, 1);
  unit.currentHp = 1;
  return source;
}

function dealDamage(attackerUnit, defenderUnit, log, attackerBonus, gold) {
  const atkStats = statTotals(attackerUnit, attackerBonus);
  const reduction = damageReductionMultiplier(defenderUnit, attackerUnit);
  const multiplier = incomingDamageMultiplier(defenderUnit, attackerUnit) * reduction.multiplier;
  if (reduction.triggeredMessage) log.push(reduction.triggeredMessage);
  // ATKダウンの呪い（静電気野郎）が重なって0未満になっても、マイナスダメージ
  // （＝相手を回復させてしまう）にはならないようクランプする。
  const damageCut = defenderUnit.def.effect?.type === 'nonNeutralDamageCut'
    && attackerUnit.def.element !== 'neutral'
    ? Number(defenderUnit.def.effect.damage || 0)
    : 0;
  const damage = Math.max(0, Math.round(atkStats.atk * multiplier) - damageCut);

  // 貫通(pierce): 反射・無効化系（ナンカのお守り/くねくね/ハリネズミの服）を
  // 全て無視して素通りする。同属性ボーナス（土地レベルのHP加算）を無視する
  // 側の処理はgame.js側で別途行う（_runBattleScene参照）。
  const pierces = hasTrait(attackerUnit, 'pierce');

  // 札束ガード(payDamageToEndBattle): 受けるはずだったダメージ×倍率のGを
  // 攻撃側へ払い、自分はノーダメージのまま戦闘そのものを打ち切る（endsBattle）。
  // 「無効化」ではなく「支払い」なので貫通では抜けられない — ナンカのお守りや
  // 反射より前に判定するのはそのため。1戦闘1回だけ（consumedを立てる）。
  // 真剣白刃取りで奪われた場合はアイテムごと相手へ移るので、この判定も
  // 自動的に奪った側にかかる＝奪われた側が支払いを受け取る形になる。
  const moneyGuard = defenderUnit.items.find((i) => i.effect?.type === 'payDamageToEndBattle' && !i.consumed);
  if (moneyGuard && damage > 0) {
    moneyGuard.consumed = true;
    const paid = damage * (moneyGuard.effect.multiplier || 1);
    gold?.transfer(defenderUnit.ownerId, attackerUnit.ownerId, paid);
    const message = `${defenderUnit.def.name}は「${moneyGuard.name}」で${paid}Gを払い、戦闘を打ち切った`;
    log.push(message);
    return {
      damage: 0,
      message,
      endsBattle: true,
      moneyGuard: { unitName: defenderUnit.def.name, itemName: moneyGuard.name, amount: paid },
    };
  }

  // アイランドホエールの3周目覚醒「1/2無効化」。通常の無効化と違い、
  // 貫通でも突破できない固有防御なのでpiercesの判定より先に処理する。
  // 連続攻撃は1打ごとに抽選し、無効化した打撃の命中時効果も発動しない。
  if (hasTrait(defenderUnit, 'unpierceableChanceNegate') && damage > 0 && Math.random() < 0.5) {
    const message = `${defenderUnit.def.name}の1/2無効化が発動！ ダメージを完全に防いだ`;
    log.push(message);
    return { damage: 0, message };
  }

  // ナンカのお守り(negateNextDamage): このアイテムで1回だけダメージを完全無効化。
  if (!pierces && damage > 0) {
    const negatedMsg = consumeDamageNegation(defenderUnit, log);
    if (negatedMsg) return { damage: 0, message: negatedMsg };
  }

  // くねくね(reflectDamage): 攻撃をそのまま跳ね返す - 自身はノーダメージ、
  // 攻撃側がその分のダメージを受ける。攻撃自体が「届かなかった」扱いなので
  // 命中時オンヒット効果（毒付与など）は発動させない - damage:0を返す。
  if (!pierces && defenderUnit.def.effect?.type === 'reflectDamage' && damage > 0) {
    // 反射ダメージを受ける攻撃側がナンカのお守りを持っていれば無効化する。
    const negatedMsg = consumeDamageNegation(attackerUnit, log);
    if (negatedMsg) return { damage: 0, message: negatedMsg };
    attackerUnit.currentHp -= damage;
    const lifeJacket = consumeLethalSurvival(attackerUnit);
    const message = `${defenderUnit.def.name}が反射！ ${attackerUnit.def.name}に${damage}ダメージ`
      + (lifeJacket ? `／${attackerUnit.def.name}は「${lifeJacket.name}」でHP1で踏みとどまった` : '');
    log.push(message);
    return { damage: 0, message, reflectedDamage: damage, reflectedTargetHp: attackerUnit.currentHp };
  }

  // ハリネズミの服(reflectHalfDamage): 受けるダメージを半減し、半減した分を
  // 攻撃側へ返す（痛みの折半 - 合計は元のダメージと同じ）。以前は「全部
  // 受けたうえで半分を追加で返す」実装だったが、カードの説明文どおり
  // 装備側の被ダメージそのものを軽減する仕様に改めた。端数は防御側が
  // 多めに受ける（1ダメージなら反射0）ので、命中時効果の判定が消えない。
  const hasHalfReflect = !pierces && (
    defenderUnit.items.some((i) => i.effect?.type === 'reflectHalfDamage')
    || hasTrait(defenderUnit, 'reflectHalfDamage')
  );
  const halfReflected = hasHalfReflect && damage > 0 ? Math.floor(damage / 2) : 0;
  const damageTaken = damage - halfReflected;

  defenderUnit.currentHp -= damageTaken;
  let message = `${attackerUnit.def.name} → ${defenderUnit.def.name} に${damageTaken}ダメージ（倍率${multiplier}${damageCut ? `・軽減${damageCut}` : ''}${halfReflected > 0 ? '・反射半減' : ''}）`;

  // ライフジャケット(surviveLethalDamage): 致死ダメージでもHP1で踏みとどまる
  // （1戦闘1回のみ - アイテム本体にconsumedを立てて再発動を防ぐ）。
  const lifeJacketItem = consumeLethalSurvival(defenderUnit);
  if (lifeJacketItem) message += `／${defenderUnit.def.name}は「${lifeJacketItem.name}」でHP1で踏みとどまった`;

  let resultReflectedDamage = 0;
  if (halfReflected > 0) {
    // 反射分を受ける攻撃側がナンカのお守りを持っていれば無効化する。
    if (consumeDamageNegation(attackerUnit, log)) {
      message += `／${defenderUnit.def.name}の反射は${attackerUnit.def.name}のお守りで無効化された`;
    } else {
      attackerUnit.currentHp -= halfReflected;
      message += `／${defenderUnit.def.name}が${halfReflected}ダメージを反射した`;
      const reflectedLifeJacket = consumeLethalSurvival(attackerUnit);
      if (reflectedLifeJacket) {
        message += `／${attackerUnit.def.name}は「${reflectedLifeJacket.name}」でHP1で踏みとどまった`;
      }
      resultReflectedDamage = halfReflected;
    }
  }

  log.push(message);
  return {
    damage: damageTaken,
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
 * 挑戦者オッズ系（炎のバクチ打ち: 自分の攻撃が1/3の確率で失敗 / 相手が
 * 1/3の確率で無効化。ただし貫通攻撃はこの無効化を素通り）を判定してからdealDamageを呼ぶ。命中時だけ発動する
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
  const pierces = hasTrait(attackerUnit, 'pierce');

  if (attackerEffect?.type === 'challengeOdds' && Math.random() < attackerEffect.attackFailureChance) {
    const message = `${attackerUnit.def.name}の攻撃は外れた`;
    log.push(message);
    return { damage: 0, message };
  }
  if (!pierces && defenderEffect?.type === 'challengeOdds' && Math.random() < defenderEffect.negateIncomingChance) {
    const message = `${defenderUnit.def.name}が攻撃を無効化した`;
    log.push(message);
    return { damage: 0, message };
  }

  const result = dealDamage(attackerUnit, defenderUnit, log, bonus, gold);

  // 札束ガードで戦闘そのものが打ち切られた場合は、この一撃に紐づく後処理
  // （強奪・命中時効果・攻撃後の自傷）を一切走らせずに抜ける。
  if (result.endsBattle) return result;

  // 与ダメージ比例の強奪（テンホウ／目出し帽）は、相手を倒した一撃でも成立
  // させる。毒や目くらましと違って相手の生存を前提にした状態異常ではなく、
  // 「与えたダメージ分だけ奪う」効果だからで、全ダメージから計算する強盗
  // (robber)とも揃う。ツインハンマーの2回攻撃で2発目が致命打になると
  // 1回分しか徴収されなかったのはこの取りこぼしが原因。
  const stealMultipleEffect = getEffect(attackerUnit, 'stealDamageMultiple');
  if (stealMultipleEffect && result.damage > 0) {
    const stolen = result.damage * stealMultipleEffect.multiplier;
    gold.transfer(defenderUnit.ownerId, attackerUnit.ownerId, stolen);
    log.push(`${attackerUnit.def.name}が${stolen}Gを奪った`);
    result.stolenGold = stolen;
  }

  // 通常攻撃のダメージだけで相手が倒れた場合、毒・目くらまし・
  // 即死判定などの「攻撃成功時」効果は発動しない。撃破時効果はこの下の
  // 専用ブロックで別途処理する。
  if (result.damage > 0 && defenderUnit.currentHp > 0) {
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
      // 道連れダメージも攻撃側のナンカのお守りで1回無効化できる。
      if (!consumeDamageNegation(attackerUnit, log)) {
        attackerUnit.currentHp -= defenderEffect.damage;
        const retaliationMessage = `${defenderUnit.def.name}は道連れに${attackerUnit.def.name}へ${defenderEffect.damage}ダメージ！`;
        log.push(retaliationMessage);
        // 反射(reflectedDamage)と同様、resolveBattleが専用のexchangeとして
        // ダメージ数値・HP減少を演出できるよう結果へ載せる。載せないと
        // 相打ち時に道連れ分のエフェクトが一切出ず、決着メッセージだけになる。
        result.retaliationDamage = defenderEffect.damage;
        result.retaliationTargetHp = attackerUnit.currentHp;
        result.retaliationMessage = retaliationMessage;
      }
    }
  }

  if (attackerEffect?.type === 'selfDamageAfterAttack') {
    attackerUnit.currentHp -= attackerEffect.damage;
    log.push(`${attackerUnit.def.name}は攻撃の反動で${attackerEffect.damage}ダメージを受けた`);
  }
  if (attackerEffect?.type === 'selfDamageRatioAfterAttack') {
    const recoil = Math.max(1, Math.round(attackerUnit.def.hp * attackerEffect.ratio));
    attackerUnit.currentHp -= recoil;
    log.push(`${attackerUnit.def.name}は攻撃の反動で${recoil}ダメージを受けた`);
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

// 先制(firstStrike)は+1、後攻(lastStrike)は-1で、両方持っていれば打ち消し
// 合って0。スコアが高い方が先に攻撃する（同スコア同士は下のresolveBattleが
// 従来通り攻撃側を先にする）。
//
// 以前は先制を先に判定して即+1を返していたため、素で先制を持つモンスターが
// 後攻のアイテムを装備しても後攻が黙って無視され、デメリットが無いまま
// 先制し続けていた。加算方式にして、両方付いた時は素直に打ち消すようにした。
export function strikeOrderScore(unit) {
  // 溶岩竜の3周目覚醒。相手の先制や装備による後攻補正を比較せず、常に
  // 通常の先制より上へ置く。両者が絶対先制なら従来どおり攻撃側を先にする。
  if (hasTrait(unit, 'absoluteFirstStrike')) return 100;
  return (hasTrait(unit, 'firstStrike') ? 1 : 0) + (hasTrait(unit, 'lastStrike') ? -1 : 0);
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
/**
 * 攻撃開始前効果（アイテム破壊: 海賊S/ステゴロ、アイテム強奪: 真剣白刃取り）を
 * attacker/defenderへ即座に適用する（items配列を直接書き換える）。
 * prepareForBattleより前に呼ぶ必要がある（破壊/強奪したアイテムのHPボーナスが
 * maxHpに残ってしまうため）。
 *
 * resolveBattleが内部でも呼ぶが、その前に呼び出し側（game.jsの戦闘演出）が
 * 明示的に一度呼んでおくと、その判定結果をWeakMap経由でresolveBattleが再利用する。
 * これにより確率効果を含めて二重適用・二重抽選にはならない。
 * こうすることで、演出側は「装備公開（ATK+20等の補正演出）」より前に
 * 破壊・強奪の演出を挟める——攻撃前に奪われた/壊されたアイテムの補正演出が
 * 元の持ち主側に出てしまい、見た目上何も奪えていないように見える問題を防ぐ。
 */
export function applyPreAttackItemEffects(attacker, defender) {
  const cached = preAttackEffectCache.get(attacker);
  if (cached?.defender === defender) return cached.result;

  const log = [];
  const itemSteals = [];
  const itemDestructions = [];

  if (getEffect(attacker, 'destroyItemBeforeAttack') && defender.items.length > 0) {
    const destroyedItems = [...defender.items];
    const source = attacker.items.find((i) => i.effect?.type === 'destroyItemBeforeAttack') || attacker.def;
    defender.items = [];
    itemDestructions.push({ targetSide: 'defender', sourceName: source.name, items: destroyedItems });
    log.push(`${attacker.def.name}が${defender.def.name}のアイテムを破壊した`);
  }
  if (getEffect(defender, 'destroyItemBeforeAttack') && attacker.items.length > 0) {
    const destroyedItems = [...attacker.items];
    const source = defender.items.find((i) => i.effect?.type === 'destroyItemBeforeAttack') || defender.def;
    attacker.items = [];
    itemDestructions.push({ targetSide: 'attacker', sourceName: source.name, items: destroyedItems });
    log.push(`${defender.def.name}が${attacker.def.name}のアイテムを破壊した`);
  }
  const attackerItemNullify = getEffect(attacker, 'chanceDestroyItemBeforeAttack');
  if (attackerItemNullify && defender.items.length > 0 && Math.random() < attackerItemNullify.chance) {
    const destroyedItems = [...defender.items];
    defender.items = [];
    itemDestructions.push({ targetSide: 'defender', sourceName: attacker.def.name, items: destroyedItems });
    log.push(`${attacker.def.name}の予報が的中し、${defender.def.name}のアイテムを無効化した`);
  }
  const defenderItemNullify = getEffect(defender, 'chanceDestroyItemBeforeAttack');
  if (defenderItemNullify && attacker.items.length > 0 && Math.random() < defenderItemNullify.chance) {
    const destroyedItems = [...attacker.items];
    attacker.items = [];
    itemDestructions.push({ targetSide: 'attacker', sourceName: defender.def.name, items: destroyedItems });
    log.push(`${defender.def.name}の予報が的中し、${attacker.def.name}のアイテムを無効化した`);
  }

  if (getEffect(attacker, 'stealItemBeforeAttack') && defender.items.length > 0) {
    const stolenItems = [...defender.items];
    attacker.items = [...attacker.items, ...defender.items];
    defender.items = [];
    itemSteals.push({ fromSide: 'defender', toSide: 'attacker', items: stolenItems });
    log.push(`${attacker.def.name}が${defender.def.name}のアイテムを奪い装備した`);
  }
  if (getEffect(defender, 'stealItemBeforeAttack') && attacker.items.length > 0) {
    const stolenItems = [...attacker.items];
    defender.items = [...defender.items, ...attacker.items];
    attacker.items = [];
    itemSteals.push({ fromSide: 'attacker', toSide: 'defender', items: stolenItems });
    log.push(`${defender.def.name}が${attacker.def.name}のアイテムを奪い装備した`);
  }

  const result = { log, itemSteals, itemDestructions };
  preAttackEffectCache.set(attacker, { defender, result });
  return result;
}

export function resolveBattle(attacker, defender, gold, attackerBonus = {}, defenderBonus = {}, preAttackEffects = null) {
  // 盤面演出側が先に攻撃前効果を再生した場合は、その判定結果をそのまま使う。
  // とくに落雷予報士の50%判定をresolveBattle内で引き直さないための受け渡し。
  const cached = preAttackEffectCache.get(attacker);
  const resolvedPreAttackEffects = preAttackEffects
    || (cached?.defender === defender ? cached.result : applyPreAttackItemEffects(attacker, defender));
  preAttackEffectCache.delete(attacker);
  const { log, itemSteals, itemDestructions } = resolvedPreAttackEffects;

  // ロシアンルーレット: どちらかが装備していたら通常の殴り合いを一切行わず、
  // 攻撃側→守備側の順にサイコロを振り、出目の大きい方が勝つ。ATK/HP・土地
  // ボーナス・先制/後攻・ライフジャケット等の戦闘中効果はすべて無視され、
  // 負けた側は即死する。同じ出目なら両者死亡＝呼び出し側で土地が無人になり、
  // 「払う相手がもういない」ため通行料も発生しない（_settleLandingToll参照）。
  // 真剣白刃取りより後に判定するので、奪われたルーレットもそのまま機能する。
  const rouletteEquipped = attacker.items.some((i) => i.effect?.type === 'russianRoulette')
    || defender.items.some((i) => i.effect?.type === 'russianRoulette');
  if (rouletteEquipped) {
    const rollDie = () => 1 + Math.floor(Math.random() * 6);
    const attackerRoll = rollDie();
    const defenderRoll = rollDie();
    const rouletteLabel = `ロシアンルーレット！ ${attacker.def.name}の出目${attackerRoll} vs ${defender.def.name}の出目${defenderRoll}`;
    log.push(rouletteLabel);
    // 演出用のダメージ数値は「HPを全部持っていかれた」ことを示すための値で、
    // 実際の勝敗は出目だけで決まっている。
    const attackerHpBefore = Math.max(1, attacker.currentHp);
    const defenderHpBefore = Math.max(1, defender.currentHp);
    const attackerWins = attackerRoll >= defenderRoll;
    const defenderWins = defenderRoll >= attackerRoll;
    const rouletteExchanges = [];
    if (attackerWins) {
      defender.currentHp = 0;
      rouletteExchanges.push({
        side: 'attacker',
        message: `${defender.def.name}はルーレットに負けて倒れた`,
        damage: defenderHpBefore,
        element: attacker.def.element,
        targetHp: 0,
        targetDied: true,
        special: [rouletteLabel],
      });
    }
    if (defenderWins) {
      attacker.currentHp = 0;
      rouletteExchanges.push({
        side: 'defender',
        message: `${attacker.def.name}はルーレットに負けて倒れた`,
        damage: attackerHpBefore,
        element: defender.def.element,
        targetHp: 0,
        targetDied: true,
        special: rouletteExchanges.length === 0 ? [rouletteLabel] : ['同じ出目！ 両者とも倒れた'],
      });
    }
    if (attackerWins && defenderWins) log.push('同じ出目のため両者とも倒れた');
    attacker.items = [];
    defender.items = [];
    if (attacker.currentHp <= 0) attacker.curses = [];
    if (defender.currentHp <= 0) defender.curses = [];
    return {
      log,
      dmgToAttacker: defenderWins ? attackerHpBefore : 0,
      dmgToDefender: attackerWins ? defenderHpBefore : 0,
      attackerSurvived: attacker.currentHp > 0,
      defenderSurvived: defender.currentHp > 0,
      exchanges: rouletteExchanges,
      itemSteals,
      itemDestructions,
      robberEffects: [],
      stealEffects: [],
      moneyGuardEffects: [],
      russianRoulette: { attackerRoll, defenderRoll },
    };
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
  // 与ダメージ比例の強奪が発動した回数分を積む（強盗と同じく、攻撃再生の
  // 直後に1件ずつ大きく見せる）。2回攻撃なら2件並ぶ。
  const stealEffects = [];
  // 札束ガードが発動した一撃を記録する。発動した時点で戦闘は打ち切りなので、
  // 以降の攻撃（2発目・反撃）は行わない。
  const moneyGuardEffects = [];
  let battleEnded = false;
  let firstTargetSurvived = true;
  for (let i = 0; i < strikeCount(first.unit) && firstTargetSurvived && first.unit.currentHp > 0; i++) {
    const beforeLen = log.length;
    const attackPower = statTotals(first.unit, first.bonus).atk;
    const elementMultiplier = first.unit.def.element === WEAK_AGAINST[first.target.def.element] ? 1.2 : 1;
    const strike = performStrike(first.unit, first.target, first.bonus, log, gold);
    firstTargetSurvived = first.target.currentHp > 0;
    const special = log.slice(beforeLen).filter((line) => line !== strike.message && line !== strike.retaliationMessage);
    if (i === 0 && orderSpecial) special.unshift(orderSpecial);
    if (strike.stolenGold > 0) {
      stealEffects.push({ side: first.side, unitName: first.unit.def.name, amount: strike.stolenGold });
    }
    if (strike.endsBattle) {
      battleEnded = true;
      // 札束ガードを持っているのは「殴られた側」＝この一撃の標的。
      moneyGuardEffects.push({ side: first.side === 'attacker' ? 'defender' : 'attacker', ...strike.moneyGuard });
    }
    exchanges.push({
      side: first.side,
      message: strike.reflectedDamage > 0
        ? (strike.damage > 0 ? strike.message.split('／')[0] : `${first.target.def.name}が攻撃を反射した！`)
        : strike.message,
      damage: strike.damage,
      element: first.unit.def.element,
      attackPower,
      elementMultiplier,
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
    if (strike.retaliationDamage > 0) {
      // 道連れ（花火師など）: 倒された側から一撃側へ入る追加ダメージを、
      // 反射と同じく専用exchangeとして再生する（ダメージ数値とHP減少を見せる）。
      // reflected扱いにして強盗の与ダメージ集計からは除外する。
      exchanges.push({
        side: first.side === 'attacker' ? 'defender' : 'attacker',
        message: strike.retaliationMessage,
        damage: strike.retaliationDamage,
        element: first.target.def.element,
        attackPower: statTotals(first.target, second.bonus).atk,
        targetHp: strike.retaliationTargetHp,
        targetDied: strike.retaliationTargetHp <= 0,
        special: ['道連れ発動！'],
        reflected: true,
      });
    }
    if (battleEnded) break;
  }

  if (!battleEnded && firstTargetSurvived && first.unit.currentHp > 0) {
    let secondTargetSurvived = true;
    for (let i = 0; i < strikeCount(second.unit) && secondTargetSurvived && second.unit.currentHp > 0; i++) {
      const beforeLen = log.length;
      const attackPower = statTotals(second.unit, second.bonus).atk;
      const elementMultiplier = second.unit.def.element === WEAK_AGAINST[second.target.def.element] ? 1.2 : 1;
      const strike = performStrike(second.unit, second.target, second.bonus, log, gold);
      secondTargetSurvived = second.target.currentHp > 0;
      const special = log.slice(beforeLen).filter((line) => line !== strike.message && line !== strike.retaliationMessage);
      if (strike.stolenGold > 0) {
        stealEffects.push({ side: second.side, unitName: second.unit.def.name, amount: strike.stolenGold });
      }
      if (strike.endsBattle) {
        battleEnded = true;
        moneyGuardEffects.push({ side: second.side === 'attacker' ? 'defender' : 'attacker', ...strike.moneyGuard });
      }
      exchanges.push({
        side: second.side,
        message: strike.reflectedDamage > 0
          ? (strike.damage > 0 ? strike.message.split('／')[0] : `${second.target.def.name}が攻撃を反射した！`)
          : strike.message,
        damage: strike.damage,
        element: second.unit.def.element,
        attackPower,
        elementMultiplier,
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
      if (strike.retaliationDamage > 0) {
        // 道連れ: 相打ち（守備側の反撃で攻撃側が倒れつつ道連れ発動、または
        // その逆）で最も起きやすいのがこちらの経路。専用exchangeで演出する。
        exchanges.push({
          side: second.side === 'attacker' ? 'defender' : 'attacker',
          message: strike.retaliationMessage,
          damage: strike.retaliationDamage,
          element: second.target.def.element,
          attackPower: statTotals(second.target, first.bonus).atk,
          targetHp: strike.retaliationTargetHp,
          targetDied: strike.retaliationTargetHp <= 0,
          special: ['道連れ発動！'],
          reflected: true,
        });
      }
      if (battleEnded) break;
    }
  }

  const dmgToDefender = exchanges.filter((e) => e.side === 'attacker' && !e.reflected).reduce((sum, e) => sum + e.damage, 0);
  const dmgToAttacker = exchanges.filter((e) => e.side === 'defender' && !e.reflected).reduce((sum, e) => sum + e.damage, 0);
  const robberEffects = [];

  // 攻防が終わった"後"に入るダメージ（毒tick・氷柱の自傷）は、これまでログ
  // 1行に出るだけで戦闘画面には一切現れなかった。そのため「画面上は生き
  // 残ったのに土地を取られた」という、原因の見えない結果になっていた。
  // 反射・道連れと同じくexchangeとして積み、ダメージ数値とHP減少、力尽きた
  // 場合は撃破演出まで見せる。reflected扱いにして強盗の与ダメ集計からは除く。
  const pushAftermath = (unit, damage, message, special) => {
    if (!(damage > 0)) return;
    exchanges.push({
      side: unit === attacker ? 'defender' : 'attacker',
      message,
      damage,
      element: unit.def.element,
      targetHp: unit.currentHp,
      targetDied: unit.currentHp <= 0,
      special: [special],
      reflected: true,
      aftermath: true,
    });
  };

  // 強盗: 実際に与えたダメージの3倍を奪う（どちら側が持っていても効く）。
  if (hasTrait(attacker, 'robber') && dmgToDefender > 0) {
    const stolen = dmgToDefender * 3;
    gold.transfer(defender.ownerId, attacker.ownerId, stolen);
    log.push(`${attacker.def.name}が強盗で${stolen}Gを奪った`);
    robberEffects.push({ side: 'attacker', unitName: attacker.def.name, amount: stolen });
  }
  if (hasTrait(defender, 'robber') && dmgToAttacker > 0) {
    const stolen = dmgToAttacker * 3;
    gold.transfer(attacker.ownerId, defender.ownerId, stolen);
    log.push(`${defender.def.name}が強盗で${stolen}Gを奪った`);
    robberEffects.push({ side: 'defender', unitName: defender.def.name, amount: stolen });
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
    const message = `${unit.def.name}は毒で${poisonDamage}ダメージを受けた`;
    log.push(message);
    pushAftermath(unit, poisonDamage, message, '毒が回った！');
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
    healUnit(attacker, eff.healAmount, statTotals(attacker, attackerBonus).maxHp);
    gold.add(attacker.ownerId, -eff.cost);
    log.push(`${attacker.def.name}は戦闘後にHP${eff.healAmount}回復した (-${eff.cost}G)`);
  }
  if (defenderSurvived && defender.def.effect?.type === 'selfHealAfterBattle') {
    const eff = defender.def.effect;
    healUnit(defender, eff.healAmount, statTotals(defender, defenderBonus).maxHp);
    gold.add(defender.ownerId, -eff.cost);
    log.push(`${defender.def.name}は戦闘後にHP${eff.healAmount}回復した (-${eff.cost}G)`);
  }
  if (attackerSurvived && hasTrait(attacker, 'regenerate')) {
    attacker.regenAtkBonus = Number(attacker.regenAtkBonus || 0) + 5;
    healUnit(attacker, Infinity, statTotals(attacker, attackerBonus).maxHp);
    log.push(`${attacker.def.name}は再生でHPが全回復し、ATKが5上昇した`);
  }
  if (defenderSurvived && hasTrait(defender, 'regenerate')) {
    defender.regenAtkBonus = Number(defender.regenAtkBonus || 0) + 5;
    healUnit(defender, Infinity, statTotals(defender, defenderBonus).maxHp);
    log.push(`${defender.def.name}は再生でHPが全回復し、ATKが5上昇した`);
  }
  for (const unit of [attacker, defender]) {
    const survived = unit === attacker ? attackerSurvived : defenderSurvived;
    if (!survived || unit.def.effect?.type !== 'selfDamageAfterBattle') continue;
    const damage = unit.def.effect.damage;
    unit.currentHp -= damage;
    const message = `${unit.def.name}は戦闘後に${damage}ダメージを受けた`;
    log.push(message);
    pushAftermath(unit, damage, message, '戦闘後の反動！');
  }

  const finalAttackerSurvived = attacker.currentHp > 0;
  const finalDefenderSurvived = defender.currentHp > 0;

  attacker.items = [];
  defender.items = [];
  if (!finalAttackerSurvived) attacker.curses = [];
  if (!finalDefenderSurvived) defender.curses = [];

  // 生き残った側は素のHPスケールへ戻し、受けたダメージを盤面に持ち越す。
  // 倒された側は盤面から消える/手札に戻る際に新規化されるので触らない。
  if (finalAttackerSurvived) attacker.currentHp = restoreOnBoardHp(attacker);
  if (finalDefenderSurvived) defender.currentHp = restoreOnBoardHp(defender);

  return { log, dmgToAttacker, dmgToDefender, attackerSurvived: finalAttackerSurvived, defenderSurvived: finalDefenderSurvived, exchanges, itemSteals, itemDestructions, robberEffects, stealEffects, moneyGuardEffects };
}
