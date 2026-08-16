/**
 * CPUの「性格」パラメータ。キャラ名（story.jsのopponent.name）ごとに
 * 個性を出すための数値セットで、game.jsのCPU意思決定ロジック
 * （_cpuChooseSummonCard/_cpuMaybeLevelUp/_cpuDecideInvasion/_cpuChooseNextTile）
 * から参照される。全て確率・閾値であり、固定パターンの分岐ではない
 * （同じ状況でも毎回同じ行動になるとは限らない）。
 *
 * - offElementSummonChance: 土地属性と違うモンスターを、同属性の選択肢が
 *   あるのにあえて選ぶ確率（0=常に同属性優先、高いほど属性を気にしない）
 * - levelUpReserve: 互換用の旧設定。現在の土地レベルアップAIは全CPU共通で
 *   手持ち300G以上を開始条件にし、1〜3段階を抽選するため参照しない
 * - minWinProbabilityToInvade: 侵略を決断する基本の勝率しきい値
 * - itemGambleChance: 「アイテムを使えば勝てるが、使わなければ勝てない」
 *   場面で、それでも侵略に踏み切る確率
 * - highValueAvoidance: 相手の高額マス（Lv3以上）をどれだけ避けたがるか
 *   （0=気にしない、1=強く避ける）。侵略しきい値の上乗せと、分岐点での
 *   経路選択の両方に使う
 * - preferredElements: 実行時にキャラのデッキテーマ（story.jsのtheme.elements）
 *   から差し込む（このファイルには持たせない）。nullなら「どの属性でも
 *   マッチ扱い」（無属性デッキ等、テーマの無い汎用CPU用）
 */
export const DEFAULT_AI_PROFILE = {
  offElementSummonChance: 0.15,
  levelUpReserve: 500,
  minWinProbabilityToInvade: 0.6,
  itemGambleChance: 0.4,
  highValueAvoidance: 0.5,
  preferredElements: null,
};

/** キャラ名 → DEFAULT_AI_PROFILEからの上書き差分。story.jsのSTORY_STAGESに登場する名前と一致させる。 */
export const AI_PROFILES = {
  朕: {
    offElementSummonChance: 0.2,
    levelUpReserve: 300,
    minWinProbabilityToInvade: 0.25,
    itemGambleChance: 0.85,
    highValueAvoidance: 0.15,
  },
  // ①ヒトデの縄張り: チュートリアル格の相手なので、ほぼデフォルト通りのバランス型。
  ヒトデ: {
    offElementSummonChance: 0.15,
    levelUpReserve: 500,
    minWinProbabilityToInvade: 0.55,
    itemGambleChance: 0.35,
    highValueAvoidance: 0.55,
  },
  // ウサギン: 向こう見ずで直感的なタイプ。属性を気にせず、分の悪い勝負にも突っ込みがち。
  ウサギン: {
    offElementSummonChance: 0.45,
    levelUpReserve: 300,
    minWinProbabilityToInvade: 0.25,
    itemGambleChance: 0.7,
    highValueAvoidance: 0.2,
  },
  // 暴君マダイ: 名前通りの暴君。勝算が少しでもあれば力尽くで攻め、土地への投資も惜しまない。
  暴君マダイ: {
    offElementSummonChance: 0.1,
    levelUpReserve: 300,
    minWinProbabilityToInvade: 0.2,
    itemGambleChance: 0.75,
    highValueAvoidance: 0.15,
  },
  // お肉（ニュウドウカジカ）: 深く考えていないマイペースタイプ。良くも悪くも平均的で、たまに気まぐれに属性を無視する。
  'お肉': {
    offElementSummonChance: 0.35,
    levelUpReserve: 500,
    minWinProbabilityToInvade: 0.5,
    itemGambleChance: 0.5,
    highValueAvoidance: 0.4,
  },
  // 少女A: 慎重で計算高い。属性を厳密に守り、Gにも余裕を持たせ、確実に勝てる時しか動かない。
  少女A: {
    offElementSummonChance: 0.05,
    levelUpReserve: 700,
    minWinProbabilityToInvade: 0.9,
    itemGambleChance: 0.2,
    highValueAvoidance: 0.85,
  },
  // 紫の魔女ホフク: 手管に長けた策士。属性の縛りにこだわらず、アイテムを絡めた勝負を好む。
  紫の魔女ホフク: {
    offElementSummonChance: 0.4,
    levelUpReserve: 400,
    minWinProbabilityToInvade: 0.45,
    itemGambleChance: 0.65,
    highValueAvoidance: 0.3,
  },
  Q: {
    offElementSummonChance: 0.8,
    levelUpReserve: 300,
    minWinProbabilityToInvade: 0.45,
    itemGambleChance: 0.8,
    highValueAvoidance: 0.7,
  },
  '「彼」': {
    offElementSummonChance: 0.05,
    levelUpReserve: 300,
    minWinProbabilityToInvade: 0.55,
    itemGambleChance: 0.6,
    highValueAvoidance: 0.65,
  },
  // ダンボール男: ラスボス格。ほぼ手加減なし、勝算が少しでもあれば仕掛け、土地には惜しみなく投資する。
  ダンボール男: {
    offElementSummonChance: 0.1,
    levelUpReserve: 300,
    minWinProbabilityToInvade: 0.15,
    itemGambleChance: 0.85,
    highValueAvoidance: 0.1,
  },
};

/** キャラ名（無ければデフォルトのCPU）とデッキテーマの属性配列から、実行時に使うAIプロファイルを組み立てる。 */
export function resolveAiProfile(name, preferredElements = null) {
  const override = AI_PROFILES[name] || {};
  return { ...DEFAULT_AI_PROFILE, ...override, preferredElements };
}
