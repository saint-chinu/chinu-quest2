import { Element } from './cards.js';
import { MONSTER_CATALOG, ITEM_CATALOG } from './battleCards.js';

// ストーリーモードのシナリオデータ（chinu-quest2-story-spec.md 準拠）。
// 立ち絵/背景グラフィックは未着手のため、`portrait`は今のところ常にnull
// (プレースホルダー表示) - 後日ここに画像パスを足すだけで差し替えられる
// ようにしておく（main.js側はハードコードせずこのフィールドを見るだけ）。
//
// 各NPCの`theme`はbuildThemedDeckList（battleCards.js）にそのまま渡す
// デッキサンプル定義 - elementsで属性2種に絞った上でfeaturedMonster/
// featuredItem（既存カタログから1体1種、任意）を4枚ずつ混ぜ、キャラごと
// に個性のあるデッキにする（以前は全員が同じ2種の初期ブックを使い回し
// ていた）。カード規模がまだ小さいため名前付きカードの使い回しはあるが、
// 属性の組み合わせだけでもキャラ差別化になるようにしてある。
export const STORY_STAGES = [
  {
    key: 'hitode',
    title: '① ヒトデ戦',
    format: '1vs1',
    // 目標G（2026-08-12実装）: 盤面右下に表示するそのステージのG目標値。
    // 現状は表示のみで勝敗判定には使わない（main.jsのstage-goal-display）。
    goalCurrency: 4000,
    intro: [
      { speaker: '主人公', text: '魚群の王を目指して、俺は旅に出る。' },
      { speaker: 'ヒトデ', text: 'おいおい正気か？ そんな無茶、俺が止めてやる。' },
      { speaker: '主人公', text: '止めても無駄だ。行かせてもらうぞ。' },
      { speaker: 'ヒトデ', text: '……わかった。だったら俺を倒していけ！' },
    ],
    outro: [{ speaker: 'ヒトデ', text: '俺の・・・屍を・・・超えていけ・・・ガクっ' }],
    opponents: [
      {
        name: 'ヒトデ',
        color: 0xe63946,
        theme: { elements: [Element.WATER, Element.FOREST], featuredMonster: MONSTER_CATALOG.minatoJoshi, featuredItem: ITEM_CATALOG.potLid },
      },
    ],
    reward: null,
    // クリア済みステージをもう一度選んだ時の専用シナリオ（本編のintro/outro/
    // opponentsとは別物）。format以外の未指定フィールドは元のstageの値を
    // そのまま使う（見た目のクリア済み印は本編の完了状態を指すのでreplay
    // 自体の勝敗はstoryProgress/rewardに一切影響しない - 何度でも遊べる
    // おまけ戦闘という位置づけ）。
    replay: {
      intro: [
        { speaker: 'ヒトデ', text: 'おっ、よく来たな。遊んでいくか？ ボコボコにしてやるよ！！' },
        { speaker: 'ウサギン', text: 'ヒトデのくせに調子にのるなよ。俺がボコボコにしてやるよ。' },
        { speaker: '主人公', text: '二人がかりかよ……上等だ、まとめて相手してやる！' },
      ],
      outro: [{ speaker: 'ヒトデ', text: 'くそ、やっぱり強えな……また来いよ。' }],
      format: '1vs1vs1',
      opponents: [
        {
          name: 'ヒトデ',
          color: 0xe63946,
          theme: { elements: [Element.WATER, Element.FOREST], featuredMonster: MONSTER_CATALOG.minatoJoshi, featuredItem: ITEM_CATALOG.potLid },
        },
        {
          name: 'ウサギン',
          color: 0xffd166,
          theme: { elements: [Element.FOREST, Element.FIRE], featuredItem: ITEM_CATALOG.potLid },
        },
      ],
    },
  },
  {
    key: 'madai',
    title: '② 暴君マダイ＆ニュウドウカジカ戦',
    format: '1vs1vs1',
    goalCurrency: 5000,
    intro: [
      { speaker: '主人公', text: 'ヒトデを越えて、ずいぶん遠くまで泳いできたな。海はどこまでも続いている……！' },
      { speaker: '???', text: 'その時、穏やかだった海が突然うなりを上げた。' },
      { speaker: '主人公', text: 'な、なんだこの流れは！？ 体が持っていかれる！' },
      { speaker: '???', text: '激流が主人公をのみ込み、視界が真っ暗になる……。' },
      { speaker: '主人公', text: '……うっ。ここは？ 水が冷たい。さっきまでいた海とはまるで違うぞ。' },
      { speaker: '???', text: '流れ着いた先は、暴君マダイが君臨する北の海だった。' },
      { speaker: '暴君マダイ', text: 'おい。俺の海で勝手に泳いでいるのは、どこの命知らずだ？' },
      { speaker: '主人公', text: '俺は魚群の王を目指して旅をしている。流されてきただけだ、すぐに出ていく。' },
      { speaker: '暴君マダイ', text: '魚群の王だと？ 笑わせるな。この北の海では俺が王だ。よそ者は、まず俺に叩きのめされる決まりなんだよ！' },
      { speaker: '主人公', text: 'ずいぶん勝手な決まりだな。そっちがケンカを売るなら、喜んで買ってやる！' },
      { speaker: 'ニュウドウカジカ（お肉）', text: 'そのケンカ、ワイも混ぜてもらうで！' },
      { speaker: '暴君マダイ', text: 'お肉……てめえ、俺に逆らうつもりか？' },
      { speaker: 'ニュウドウカジカ（お肉）', text: 'ワイはずっとお前に虐げられてきたんや。反撃のチャンスを待っとった。今日こそ好きにはさせへんで！' },
      { speaker: '主人公', text: '俺とマダイだけの勝負じゃなくなったか。面白い、二人ともまとめて相手になれ！' },
      { speaker: '暴君マダイ', text: '上等だ！ 北の海で一番強いのが誰か、思い知らせてやる！' },
      { speaker: '???', text: '主人公、暴君マダイ、そしてお肉。北の海を揺るがす三つ巴の戦いが始まる！' },
    ],
    outro: [
      { speaker: '暴君マダイ', text: 'くそっ……俺が負けるとはな。だが、これほど熱くなったのは久しぶりだ。' },
      { speaker: '暴君マダイ', text: 'お前の強さは本物だ。今日からお前を、俺のライバルとして認めてやる！' },
      { speaker: '主人公', text: '偉そうなのは気に入らないが、お前も強かった。俺もマダイをライバルとして認める。次は負けないぞ。' },
      { speaker: 'ニュウドウカジカ（お肉）', text: 'おいおい、二人だけで話まとめんといてや。ワイかて、ずっとマダイに立ち向かいたかったんや。' },
      { speaker: '暴君マダイ', text: '……悪かったな、お肉。力で押さえつければ誰も逆らわないと思っていた。だが、お前にも意地があったんだな。' },
      { speaker: 'ニュウドウカジカ（お肉）', text: 'わかったんならええんや。これからは暴君やのうて、北の海の仲間としてやっていこや。' },
      { speaker: '暴君マダイ', text: 'ふん、仕方ねえ。お肉、この海を一緒に守るぞ。今度は俺の隣でな。' },
      { speaker: 'ニュウドウカジカ（お肉）', text: 'へへっ、そうこなくっちゃな！' },
      { speaker: '???', text: 'マダイとお肉は和解し、北の海で仲良く暮らすことになった。' },
      { speaker: '主人公', text: '二人なら、この海はもう大丈夫そうだな。俺はまだ見ぬ世界を探しに行く。' },
      { speaker: '暴君マダイ', text: '次に会う時まで弱くなるんじゃねえぞ、ライバル！' },
      { speaker: '主人公', text: 'もちろんだ。海の外には何があるんだろう……よし、次は陸に上がってみるか！' },
      { speaker: '???', text: '新たな世界を求め、主人公は海をあとにして陸へ向かった。' },
    ],
    opponents: [
      {
        name: '暴君マダイ',
        color: 0xffd166,
        theme: { elements: [Element.FIRE, Element.THUNDER], featuredMonster: MONSTER_CATALOG.salarymander, featuredItem: ITEM_CATALOG.knife },
      },
      {
        name: 'ニュウドウカジカ（お肉）',
        color: 0x8e5ce6,
        theme: { elements: [Element.THUNDER, Element.FOREST] },
      },
    ],
    reward: null,
    replay: {
      intro: [
        { speaker: '暴君マダイ', text: 'また来たのか。今度は仲間を連れてきたぜ。' },
        { speaker: 'ニュウドウカジカ（お肉）', text: 'また暴れさせてもらうで！' },
        { speaker: '少女A', text: 'あら、面白そうな戦い。わたしも交ぜてくださらない？' },
        { speaker: '主人公', text: '三つ巴どころか四つ巴かよ……上等だ！' },
      ],
      outro: [{ speaker: '暴君マダイ', text: 'ちくしょう、今度もやられたか……また挑んでこいよ。' }],
      format: '1vs1vs1vs1',
      opponents: [
        {
          name: '暴君マダイ',
          color: 0xffd166,
          theme: { elements: [Element.FIRE, Element.THUNDER], featuredMonster: MONSTER_CATALOG.salarymander, featuredItem: ITEM_CATALOG.knife },
        },
        {
          name: 'ニュウドウカジカ（お肉）',
          color: 0x8e5ce6,
          theme: { elements: [Element.THUNDER, Element.FOREST] },
        },
        {
          name: '少女A',
          color: 0x4caf6e,
          theme: { elements: [Element.WATER, Element.FOREST], featuredMonster: MONSTER_CATALOG.minatoJoshi },
        },
      ],
    },
  },
  {
    key: 'budou',
    title: '③ ウサギン＆少女A vs 紫の魔女ホフク＆主人公',
    format: '2vs2',
    goalCurrency: 7000,
    intro: [
      { speaker: '主人公', text: '砂浜で何やら揉め事か……？' },
      { speaker: 'ウサギン', text: 'てめえの魔法、目障りなんだよ！' },
      { speaker: '紫の魔女ホフク', text: 'ちょっと、二人がかりなんてズルいですよ！' },
      { speaker: '主人公', text: '見過ごせないな。俺も加勢する！' },
      { speaker: '紫の魔女ホフク', text: '助かります！ 一緒に戦いましょう！' },
    ],
    outro: [
      { speaker: '紫の魔女ホフク', text: '助けてくれてありがとうございます。これ、お礼に受け取ってください。' },
      { speaker: '???', text: '「ペーの杖」を手に入れた！' },
      { speaker: '主人公', text: 'これは……只者じゃない杖だ。' },
      { speaker: '???', text: 'アイテムを手にしたその時、突然世界が暗転する……。' },
    ],
    // 味方NPC（紫の魔女ホフク）はheroAllianceId側、敵2体はenemyAllianceId側。
    // Game側は元々allianceIdの汎用集計だけで同盟戦を処理できる設計なので、
    // 文字列キーをそのまま渡すだけで2vs2として成立する。
    heroAllianceId: 'hero',
    enemyAllianceId: 'enemy',
    ally: {
      name: '紫の魔女ホフク',
      color: 0x8e5ce6,
      theme: { elements: [Element.WATER, Element.THUNDER], featuredItem: ITEM_CATALOG.knife },
    },
    opponents: [
      {
        name: 'ウサギン',
        color: 0xe63946,
        theme: { elements: [Element.FOREST, Element.FIRE], featuredItem: ITEM_CATALOG.potLid },
      },
      {
        name: '少女A',
        color: 0x4caf6e,
        theme: { elements: [Element.WATER, Element.FOREST], featuredMonster: MONSTER_CATALOG.minatoJoshi },
      },
    ],
    reward: 'peeStaff',
    replay: {
      intro: [
        { speaker: '紫の魔女ホフク', text: 'また会いましたね！ 今日はもっと強い相手が待ち構えていますよ。' },
        { speaker: 'ヒトデ', text: 'おっと、俺も混ぜてくれよ！ 恩返しさせてくれ！' },
        { speaker: 'ウサギン', text: 'チッ、また数で勝負かよ。上等だ！' },
        { speaker: '主人公', text: '心強いな……三人がかりで叩き潰すぞ！' },
      ],
      outro: [{ speaker: '紫の魔女ホフク', text: '今日も助かりました！ また力を貸してくださいね。' }],
      format: '3vs2',
      heroAllianceId: 'hero',
      enemyAllianceId: 'enemy',
      ally: {
        name: '紫の魔女ホフク',
        color: 0x8e5ce6,
        theme: { elements: [Element.WATER, Element.THUNDER], featuredItem: ITEM_CATALOG.knife },
      },
      // 2人目の味方はallyフィールド1つでは表現できないため、opponents同様
      // extraAllyという専用フィールドに乗せ、main.js側で組み立てる。
      extraAlly: {
        name: 'ヒトデ',
        color: 0x2ec4b6,
        theme: { elements: [Element.WATER, Element.FOREST], featuredMonster: MONSTER_CATALOG.minatoJoshi, featuredItem: ITEM_CATALOG.potLid },
      },
      opponents: [
        {
          name: 'ウサギン',
          color: 0xe63946,
          theme: { elements: [Element.FOREST, Element.FIRE], featuredItem: ITEM_CATALOG.potLid },
        },
        {
          name: '少女A',
          color: 0x4caf6e,
          theme: { elements: [Element.WATER, Element.FOREST], featuredMonster: MONSTER_CATALOG.minatoJoshi },
        },
      ],
    },
  },
  {
    key: 'danball',
    title: '④ ダンボール男戦',
    format: '1vs1',
    goalCurrency: 10000,
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
    opponents: [
      {
        name: 'ダンボール男',
        color: 0x333333,
        // ラスボスは属性の有利/不利を受けないNEUTRALのみで構成 - 誰の
        // デッキとも噛み合わない、正体不明な強敵という位置づけ。
        theme: { elements: [Element.NEUTRAL], featuredMonster: MONSTER_CATALOG.salarymander, featuredItem: ITEM_CATALOG.knife },
      },
    ],
    reward: null,
    // ラスボスの再戦は乱入キャラを足す理由が弱いので、フォーマットは変え
    // ず1vs1のまま。opponents/ally/formatを指定しなければ本編のものを
    // そのまま使う（main.jsのbuildBattlePlayerConfigsのフォールバック）。
    replay: {
      intro: [
        { speaker: 'ダンボール男', text: 'また来たか。何度でも相手をしてやろう。' },
        { speaker: '主人公', text: '受けて立つ。今度こそ完全に決着をつけてやる！' },
      ],
      outro: [{ speaker: 'ダンボール男', text: '……また負けたか。だが、何度でも待っているぞ。' }],
    },
  },
];

export function isStageUnlocked(character, index) {
  return index <= (character.storyProgress || 0);
}

export function isStageCleared(character, index) {
  return index < (character.storyProgress || 0);
}
