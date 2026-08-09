// ストーリーモードのシナリオデータ（chinu-quest2-story-spec.md 準拠）。
// 立ち絵/背景グラフィックは未着手のため、`portrait`は今のところ常にnull
// (プレースホルダー表示) - 後日ここに画像パスを足すだけで差し替えられる
// ようにしておく（main.js側はハードコードせずこのフィールドを見るだけ）。
export const STORY_STAGES = [
  {
    key: 'hitode',
    title: '① ヒトデ戦',
    format: '1vs1',
    intro: [
      { speaker: '主人公', text: '魚群の王を目指して、俺は旅に出る。' },
      { speaker: 'ヒトデ', text: 'おいおい正気か？ そんな無茶、俺が止めてやる。' },
      { speaker: '主人公', text: '止めても無駄だ。行かせてもらうぞ。' },
      { speaker: 'ヒトデ', text: '……わかった。だったら俺を倒していけ！' },
    ],
    outro: [
      { speaker: '???', text: '突然、急流が二人を飲み込んだ……！' },
      { speaker: '主人公', text: 'うわあああ！？ ここは……北の海？' },
    ],
    opponents: [{ name: 'ヒトデ', color: 0xe63946, deckVariant: 'waterThunder' }],
    reward: null,
  },
  {
    key: 'madai',
    title: '② 暴君マダイ＆ニュウドウカジカ戦',
    format: '1vs1vs1',
    intro: [
      { speaker: '主人公', text: '流れ着いた先は、見知らぬ北の海だった。' },
      { speaker: '暴君マダイ', text: 'ここは俺の縄張りだ。よそ者は歓迎しないぜ。' },
      { speaker: 'ニュウドウカジカ（お肉）', text: 'おっ、面白そうな喧嘩だ。俺も混ぜろ！' },
      { speaker: '主人公', text: '三つ巴か……！ 上等だ！' },
    ],
    outro: [
      { speaker: '主人公', text: '二体とも倒した……。この先には何があるんだ？' },
    ],
    opponents: [
      { name: '暴君マダイ', color: 0xffd166, deckVariant: 'fireForest' },
      { name: 'ニュウドウカジカ（お肉）', color: 0x8e5ce6, deckVariant: 'waterThunder' },
    ],
    reward: null,
  },
  {
    key: 'budou',
    title: '③ ウサギ＆某不思議の国の少女 vs ぶどう＆主人公',
    format: '2vs2',
    intro: [
      { speaker: '主人公', text: '砂浜で何やら揉め事か……？' },
      { speaker: '農家のウサギ', text: 'てめえの魔法、目障りなんだよ！' },
      { speaker: 'ぶどう', text: 'ちょっと、二人がかりなんてズルいですよ！' },
      { speaker: '主人公', text: '見過ごせないな。俺も加勢する！' },
      { speaker: 'ぶどう', text: '助かります！ 一緒に戦いましょう！' },
    ],
    outro: [
      { speaker: 'ぶどう', text: '助けてくれてありがとうございます。これ、お礼に受け取ってください。' },
      { speaker: '???', text: '「ペーの杖」を手に入れた！' },
      { speaker: '主人公', text: 'これは……只者じゃない杖だ。' },
      { speaker: '???', text: 'アイテムを手にしたその時、突然世界が暗転する……。' },
    ],
    // 味方NPC（ぶどう）はheroAllianceId側、敵2体はenemyAllianceId側。
    // Game側は元々allianceIdの汎用集計だけで同盟戦を処理できる設計なので、
    // 文字列キーをそのまま渡すだけで2vs2として成立する。
    heroAllianceId: 'hero',
    enemyAllianceId: 'enemy',
    ally: { name: 'ぶどう', color: 0x8e5ce6, deckVariant: 'waterThunder' },
    opponents: [
      { name: '農家のウサギ', color: 0xe63946, deckVariant: 'fireForest' },
      { name: '某不思議の国の少女', color: 0x4caf6e, deckVariant: 'fireForest' },
    ],
    reward: 'peeStaff',
  },
  {
    key: 'danball',
    title: '④ ダンボール男戦',
    format: '1vs1',
    intro: [
      { speaker: '???', text: '世界が、暗転する。' },
      { speaker: 'ダンボール男', text: 'よくここまで来た。だがお前はずっと私の駒に過ぎなかった。' },
      { speaker: '主人公', text: '駒……？ 冗談じゃない。俺は俺の意志でここまで来たんだ！' },
      { speaker: 'ダンボール男', text: 'ならば証明してみせろ。真の自由とやらを。' },
    ],
    outro: [
      { speaker: '主人公', text: '……終わった、のか。' },
      { speaker: '???', text: '魚群の王を目指した魚の旅は、まだ続く。' },
    ],
    opponents: [{ name: 'ダンボール男', color: 0x333333, deckVariant: 'fireForest' }],
    reward: null,
  },
];

export function isStageUnlocked(character, index) {
  return index <= (character.storyProgress || 0);
}

export function isStageCleared(character, index) {
  return index < (character.storyProgress || 0);
}
