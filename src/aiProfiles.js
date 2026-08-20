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
    // ⑧のボス。ダンボール男に迫る好戦性で、属性を厳密に守って連鎖・地価を
    // 積み上げ（連鎖条件付きの大型も出しやすくなる）、アイテム勝負も辞さない。
    offElementSummonChance: 0.1,
    levelUpReserve: 300,
    minWinProbabilityToInvade: 0.2,
    itemGambleChance: 0.9,
    highValueAvoidance: 0.1,
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
  // ムール: 水連鎖と関所クラゲを固める守り主体だが、⑨のボスとして机上の
  // 空論では終わらせない。侵略しきい値0.82・回避0.8では、Lv3以上への実効
  // しきい値が上限の0.97に張り付いて「育った土地には絶対手を出さない」AIに
  // なっていたため、確度が見えたら詰めに来る水準へ引き下げた。
  // 属性厳守(0)はキャラの芯なので維持する。
  ムール: {
    offElementSummonChance: 0,
    levelUpReserve: 400,
    minWinProbabilityToInvade: 0.5,
    itemGambleChance: 0.55,
    highValueAvoidance: 0.45,
  },
  // 専門調査官・A（⑨限定）: ③の少女Aと同一人物だが、こちらは裏の顔。
  // 序盤ステージの少女A（慎重）とは別プロファイルにして、詰めの速い
  // 調査官として振る舞わせる。
  '専門調査官・A': {
    offElementSummonChance: 0.05,
    levelUpReserve: 350,
    minWinProbabilityToInvade: 0.42,
    itemGambleChance: 0.6,
    highValueAvoidance: 0.4,
  },
  // 紫の魔女ホフク: 手管に長けた策士。属性の縛りにこだわらず、アイテムを絡めた勝負を好む。
  紫の魔女ホフク: {
    offElementSummonChance: 0.4,
    levelUpReserve: 400,
    minWinProbabilityToInvade: 0.45,
    itemGambleChance: 0.65,
    highValueAvoidance: 0.3,
  },
  '闇・ホフク': {
    offElementSummonChance: 0.08,
    levelUpReserve: 300,
    minWinProbabilityToInvade: 0.22,
    itemGambleChance: 0.9,
    highValueAvoidance: 0.12,
  },
  '暗・少女A': {
    offElementSummonChance: 0.03,
    levelUpReserve: 350,
    minWinProbabilityToInvade: 0.32,
    itemGambleChance: 0.75,
    highValueAvoidance: 0.35,
  },
  サーティー: {
    offElementSummonChance: 0.2,
    levelUpReserve: 350,
    minWinProbabilityToInvade: 0.28,
    itemGambleChance: 0.8,
    highValueAvoidance: 0.25,
  },
  // クエ（⑫海上金融街のフィクサー）: プロファイル未登録でDEFAULT
  // （侵略0.6・回避0.5 ＝ Lv3以上への実効しきい値0.75）にフォールバックして
  // おり、⑫のラスボスがステージ①のヒトデより弱腰になっていた。殴りの強度は
  // ⑪勢と同格まで引き上げる。ただし芯は「金と相場で勝つ」側にあり、そちらは
  // game.js のクエ専用分岐（お札の買い増し・保有属性の土地を優先強化）が担う。
  // 森に寄せたデッキなので属性はほぼ厳守 - 連鎖が地価とお札の両方に効く。
  クエ: {
    offElementSummonChance: 0.1,
    levelUpReserve: 300,
    minWinProbabilityToInvade: 0.3,
    itemGambleChance: 0.85,
    highValueAvoidance: 0.15,
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
  // 邪神ヒトデマソ: ほぼ侵略専用。高額地へ突っ込み、奪った土地を強制成仏で換金する。
  邪神ヒトデマソ: {
    offElementSummonChance: 0.95,
    levelUpReserve: 300,
    minWinProbabilityToInvade: 0.1,
    itemGambleChance: 0.95,
    highValueAvoidance: 0.05,
  },
};

/** キャラ名（無ければデフォルトのCPU）とデッキテーマの属性配列から、実行時に使うAIプロファイルを組み立てる。 */
export function resolveAiProfile(name, preferredElements = null) {
  const override = AI_PROFILES[name] || {};
  return { ...DEFAULT_AI_PROFILE, ...override, preferredElements };
}
