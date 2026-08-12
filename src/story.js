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
        { speaker: '主人公', text: 'いいぜ。今度も一対一で決着をつけよう！' },
      ],
      outro: [{ speaker: 'ヒトデ', text: 'くそ、やっぱり強えな……また来いよ。' }],
      format: '1vs1',
      opponents: [
        {
          name: 'ヒトデ',
          color: 0xe63946,
          theme: { elements: [Element.WATER, Element.FOREST], featuredMonster: MONSTER_CATALOG.minatoJoshi, featuredItem: ITEM_CATALOG.potLid },
        },
      ],
    },
    // ステージ③クリア後にだけ現れるパラレルワールド由来の隠し再戦。
    secretReplay: {
      unlockProgress: 3,
      intro: [
        { speaker: 'ヒトデ', text: 'おっ、また来たな。今日も一対一で――' },
        { speaker: 'ウサギン', text: '待ちな！ 面白そうなケンカやってんじゃねえか。ワイも混ぜろ！' },
        { speaker: '主人公', text: 'ウサギン！？ なんでここにいるんだよ。' },
        { speaker: 'ヒトデ', text: 'この3人……どこかで一緒だったような……ウッ、頭が……。' },
        { speaker: 'ウサギン', text: '何ブツブツ言ってんだ。細けえことは勝ってから考えろ！' },
        { speaker: '主人公', text: '妙な感じはするが……上等だ。三人で決着をつけよう！' },
      ],
      outro: [
        { speaker: 'ヒトデ', text: 'また負けたか……でも、この三人で戦うのは妙に懐かしいな。' },
        { speaker: 'ウサギン', text: '次はワイが勝つ。腐れ縁なら、またどっかで会うやろ！' },
        { speaker: '主人公', text: '腐れ縁、か……。まあ悪くないな。また勝負しようぜ。' },
      ],
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
      { speaker: '???', text: '北の海をあとにした主人公は、ついに陸へとたどり着いた。' },
      { speaker: '主人公', text: 'ここが陸か……。ぱっと見は、ずいぶんのどかな場所だな。' },
      { speaker: '紫の魔女ホフク', text: 'あら、回遊魚さんですか？' },
      { speaker: '主人公', text: 'ああ、そうだ。ここはどこなんだ？' },
      { speaker: '紫の魔女ホフク', text: 'ここは修羅の国。この国で一番危険な地域と言われています。回遊魚さんは気をつけてください。' },
      { speaker: 'ウサギン', text: 'フェ〇ニストはいねーがー！' },
      { speaker: 'ウサギン', text: 'む！？ そこの紫の魔女、キサマ、フェ〇ニストだな！？' },
      { speaker: '紫の魔女ホフク', text: 'ち、ちがうわ！ 私は極右よ！？' },
      { speaker: 'ウサギン', text: 'いーや、ワイにはわかる。ここを通りたきゃ税金を払え。あとこのにんじん食え。' },
      { speaker: '???', text: 'ウサギンの相方らしい少女Aも姿を現した。' },
      { speaker: '少女A', text: 'ここの地価を計算し税制から計算すると通行料は10万Gゆ。そこの田舎者の回遊魚はさっさと帰るゆ。' },
      { speaker: '主人公', text: 'まずはおたくらの決算書を出せ。話はそれからや。' },
      { speaker: '少女A', text: '魚のくせに生意気ゆ！？ ウサギン、まとめてやっつけちゃおう！' },
      { speaker: '???', text: '主人公と紫の魔女ホフク、ウサギンと少女A。修羅の国で、二対二の戦いが始まる！' },
    ],
    outro: [
      { speaker: 'ウサギン', text: 'まあ話せばわかる奴らだったな。税金は払わなくていいからこのニンジン食えよ。' },
      { speaker: '少女A', text: '素人ではなかったようね。今度から対等として扱ってあげるゆ。' },
      { speaker: '紫の魔女ホフク', text: '回遊魚さん、助かったわ。これ余ってるからあげるわ。' },
      { speaker: '???', text: '「ペーの杖」を手に入れた！' },
      { speaker: '主人公', text: 'ありがとう。それにしても、この地域はなぜこんなに危険なんだ……？' },
      { speaker: '???', text: '修羅の国の謎を探るため、主人公はさらに中央へと向かうのだった。' },
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
        { speaker: '紫の魔女ホフク', text: 'あら、回遊魚さん。またこの危険な地域へ来たんですか？' },
        { speaker: '少女A', text: 'ちょうどいいところに来たゆ。前の決着には納得してないゆ。' },
        { speaker: '主人公', text: '俺も同じだ。今日は誰が一番強いのか、三人だけではっきりさせよう。' },
        { speaker: '紫の魔女ホフク', text: 'いいでしょう。今日は味方ではなく、二人とも私の相手です！' },
        { speaker: '少女A', text: 'まとめて地価ごと叩き下げてやるゆ！' },
      ],
      outro: [
        { speaker: '少女A', text: 'また負けたゆ……。でも次は税制から作戦を練り直すゆ。' },
        { speaker: '紫の魔女ホフク', text: 'やっぱり強いですね、回遊魚さん。次は私が勝ちますからね。' },
        { speaker: '主人公', text: 'いつでも受けて立つ。二人とも、また勝負しよう！' },
      ],
      format: '1vs1vs1',
      heroAllianceId: null,
      enemyAllianceId: null,
      ally: null,
      opponents: [
        {
          name: '紫の魔女ホフク',
          color: 0x8e5ce6,
          theme: { elements: [Element.WATER, Element.THUNDER], featuredItem: ITEM_CATALOG.knife },
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
