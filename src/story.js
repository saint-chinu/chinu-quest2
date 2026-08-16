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
// に個性のあるデッキにする（以前は全員が同じ2種の初期デッキを使い回し
// ていた）。カード規模がまだ小さいため名前付きカードの使い回しはあるが、
// 属性の組み合わせだけでもキャラ差別化になるようにしてある。
export const STORY_STAGES = [
  {
    key: 'hitode',
    title: '① はじまりの海',
    format: '1vs1',
    // 目標G（2026-08-12実装）: 盤面右下に表示するそのステージのG目標値。
    // 現状は表示のみで勝敗判定には使わない（main.jsのstage-goal-display）。
    goalCurrency: 4000,
    // 盤面を隠さず会話をオーバーレイ表示する演出（2026-08-12実装、②にも
    // 2026-08-13拡張）用: 会話左側に立ち絵を出すNPCの名前
    // （NPC_PORTRAIT_URLのキーと一致させる）。未指定のステージは今まで
    // 通り全画面の会話→盤面、の順で進む。
    overlayNpc: 'ヒトデ',
    intro: [
      { speaker: '???', text: '穏やかな海の片隅。いつもと変わらない潮の流れを眺めながら、主人公はひとつの決意を固めていた。' },
      { speaker: '主人公', text: 'この海にいるだけじゃ、見える景色はずっと同じだ。俺はもっと広い世界を見てみたい。' },
      { speaker: '主人公', text: 'そして、いつかすべての魚を従える魚群の王になる。今日、俺は旅に出る！' },
      { speaker: 'ヒトデ', text: '……朝っぱらから何を大声で叫んでるんだ。近所の貝が全部閉じちまったぞ。' },
      { speaker: '主人公', text: 'ヒトデか。ちょうどいい、しばらくこの海を留守にする。みんなに伝えておいてくれ。' },
      { speaker: 'ヒトデ', text: 'おいおい、本気だったのか？ 外の海はここみたいに穏やかじゃない。お前より強い奴なんて、いくらでもいるぞ。' },
      { speaker: '主人公', text: 'だから行くんだ。強い奴らと戦わなきゃ、魚群の王になんてなれないだろ。' },
      { speaker: 'ヒトデ', text: '夢だけは立派だが、勢いで飛び出して帰ってこなかった奴を、俺は何匹も見てきた。' },
      { speaker: '主人公', text: '心配してくれてるのか？' },
      { speaker: 'ヒトデ', text: 'ち、違う！ お前が無様にやられたら、この海の評判まで落ちるって言ってるんだ！' },
      { speaker: '主人公', text: 'だったら俺が外でも通用するか、ここで確かめてみろよ。' },
      { speaker: 'ヒトデ', text: '……言ったな？ 俺を越えられない奴が、魚群の王を名乗る資格はない。' },
      { speaker: '主人公', text: '望むところだ。勝って、堂々とこの海を出ていく！' },
      { speaker: 'ヒトデ', text: '手加減はしないぞ。旅立ちたいなら、この俺を倒して道をこじ開けてみろ！' },
      { speaker: '???', text: 'こうして、主人公の長い旅は、腐れ縁のヒトデとの真剣勝負から幕を開けた。' },
    ],
    outro: [
      { speaker: 'ヒトデ', text: 'ぐああっ！ まさか、本当に俺を倒すとはな……。' },
      { speaker: '主人公', text: 'これで文句はないな。俺は先へ行く。' },
      { speaker: 'ヒトデ', text: 'ああ。今のお前なら、外の海でも簡単にはやられないだろう。' },
      { speaker: '主人公', text: 'ずいぶん素直じゃないか。' },
      { speaker: 'ヒトデ', text: '勘違いするなよ。次に会う時まで、勝ち逃げは許さないってことだ。' },
      { speaker: '主人公', text: 'いいぜ。その時は、もっと強くなった俺がまた勝つ。' },
      { speaker: 'ヒトデ', text: 'へっ、言ってろ。……俺の・・・屍を・・・超えていけ・・・ガクっ' },
      { speaker: '主人公', text: 'いや、生きてるだろ。しかも屍の横を普通に泳いでいくからな。' },
      { speaker: 'ヒトデ', text: 'そこは雰囲気を出させろよ！ ……まあいい。行ってこい、魚群の王。' },
      { speaker: '???', text: 'ヒトデに見送られ、主人公は生まれ育った海をあとにした。まだ見ぬ世界へ向けて、その尾びれを大きく動かす。' },
    ],
    opponents: [
      {
        name: 'ヒトデ',
        color: 0xe63946,
        deckKey: 'hitode',
        theme: { elements: [Element.WATER, Element.NEUTRAL] },
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
          deckKey: 'hitode',
          theme: { elements: [Element.WATER, Element.NEUTRAL] },
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
          deckKey: 'hitode',
          theme: { elements: [Element.WATER, Element.NEUTRAL] },
        },
        {
          name: 'ウサギン',
          color: 0xffd166,
          deckKey: 'usagin',
          theme: { elements: [Element.FOREST, Element.FIRE], featuredItem: ITEM_CATALOG.potLid },
        },
      ],
    },
  },
  {
    key: 'madai',
    title: '② 北の暴君と７',
    format: '1vs1vs1',
    goalCurrency: 5000,
    overlayNpc: '暴君マダイ',
    overlayRightNpcOnSpeaker: 'お肉',
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
      { speaker: 'お肉', text: 'そのケンカ、ワイも混ぜてもらうで！' },
      { speaker: '暴君マダイ', text: 'お肉……てめえ、俺に逆らうつもりか？' },
      { speaker: 'お肉', text: 'ワイはずっとお前に虐げられてきたんや。反撃のチャンスを待っとった。今日こそ好きにはさせへんで！' },
      { speaker: '主人公', text: '俺とマダイだけの勝負じゃなくなったか。面白い、二人ともまとめて相手になれ！' },
      { speaker: '暴君マダイ', text: '上等だ！ 北の海で一番強いのが誰か、思い知らせてやる！' },
      { speaker: '???', text: '主人公、暴君マダイ、そしてお肉。北の海を揺るがす三つ巴の戦いが始まる！' },
    ],
    outro: [
      { speaker: '暴君マダイ', text: 'くそっ……俺が負けるとはな。だが、これほど熱くなったのは久しぶりだ。' },
      { speaker: '暴君マダイ', text: 'お前の強さは本物だ。今日からお前を、俺のライバルとして認めてやる！' },
      { speaker: '主人公', text: '偉そうなのは気に入らないが、お前も強かった。俺もマダイをライバルとして認める。次は負けないぞ。' },
      { speaker: 'お肉', text: 'おいおい、二人だけで話まとめんといてや。ワイかて、ずっとマダイに立ち向かいたかったんや。' },
      { speaker: '暴君マダイ', text: '……悪かったな、お肉。力で押さえつければ誰も逆らわないと思っていた。だが、お前にも意地があったんだな。' },
      { speaker: 'お肉', text: 'わかったんならええんや。これからは暴君やのうて、北の海の仲間としてやっていこや。' },
      { speaker: '暴君マダイ', text: 'ふん、仕方ねえ。お肉、この海を一緒に守るぞ。今度は俺の隣でな。' },
      { speaker: 'お肉', text: 'へへっ、そうこなくっちゃな！' },
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
        deckKey: 'madai',
        theme: { elements: [Element.WATER, Element.THUNDER] },
      },
      {
        name: 'お肉',
        color: 0x8e5ce6,
        deckKey: 'oniku',
        theme: { elements: [Element.FOREST, Element.FIRE] },
      },
    ],
    reward: null,
    replay: {
      intro: [
        { speaker: '暴君マダイ', text: 'また来たのか。今度は仲間を連れてきたぜ。' },
        { speaker: 'お肉', text: 'また暴れさせてもらうで！' },
        { speaker: '少女A', text: 'あら、面白そうな戦い。わたしも交ぜてくださらない？' },
        { speaker: '主人公', text: '三つ巴どころか四つ巴かよ……上等だ！' },
      ],
      outro: [{ speaker: '暴君マダイ', text: 'ちくしょう、今度もやられたか……また挑んでこいよ。' }],
      format: '1vs1vs1vs1',
      opponents: [
        {
          name: '暴君マダイ',
          color: 0xffd166,
          deckKey: 'madai',
          theme: { elements: [Element.WATER, Element.THUNDER] },
        },
        {
          name: 'お肉',
          color: 0x8e5ce6,
          deckKey: 'oniku',
          theme: { elements: [Element.FOREST, Element.FIRE] },
        },
        {
          name: '少女A',
          color: 0x4caf6e,
          deckKey: 'shoujoA',
          theme: { elements: [Element.WATER, Element.FOREST], featuredMonster: MONSTER_CATALOG.minatoJoshi },
        },
      ],
    },
  },
  {
    key: 'budou',
    title: '③ 修羅の国のA',
    format: '2vs2',
    goalCurrency: 7000,
    boardDialogue: true,
    overlaySpeakerSides: {
      主人公: 'right',
      '紫の魔女ホフク': 'right',
      ウサギン: 'left',
      少女A: 'left',
    },
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
    // 同盟戦の色: 主人公側=紅組(0)、敵側=白組(1)。
    heroAllianceId: 0,
    enemyAllianceId: 1,
    ally: {
      name: '紫の魔女ホフク',
      color: 0x8e5ce6,
      deckKey: 'hofuku',
      theme: { elements: [Element.WATER, Element.THUNDER], featuredItem: ITEM_CATALOG.knife },
    },
    opponents: [
      {
        name: 'ウサギン',
        color: 0xe63946,
        deckKey: 'usagin',
        theme: { elements: [Element.FOREST, Element.FIRE], featuredItem: ITEM_CATALOG.potLid },
      },
      {
        name: '少女A',
        color: 0x4caf6e,
        deckKey: 'shoujoA',
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
          deckKey: 'hofuku',
          theme: { elements: [Element.WATER, Element.THUNDER], featuredItem: ITEM_CATALOG.knife },
        },
        {
          name: '少女A',
          color: 0x4caf6e,
          deckKey: 'shoujoA',
          theme: { elements: [Element.WATER, Element.FOREST], featuredMonster: MONSTER_CATALOG.minatoJoshi },
        },
      ],
    },
  },
  {
    key: 'q-train',
    title: '④ 暴走列車Q号',
    format: '1vs1',
    goalCurrency: 8500,
    overlayNpc: 'Q',
    intro: [
      { speaker: '???', text: '修羅の国をあとにした主人公は、中央部へ向かう電車に乗り込んだ。' },
      { speaker: '主人公', text: '電車ってのは便利だな。泳がなくても景色が勝手に流れていく。' },
      { speaker: 'Q', text: 'その窓から見える架線柱、実にいい間隔でしょう。ちなみにこの車両の台車は――' },
      { speaker: '主人公', text: 'お、おう。ずいぶん詳しいな。あんた、電車が好きなのか？' },
      { speaker: 'Q', text: '好きなどという軽い言葉では足りません。私はQ。この路線の音、揺れ、匂い、そのすべてを愛しています。' },
      { speaker: '主人公', text: 'Qか。俺は魚群の王を目指して旅をしてる。ここから中央までは遠いのか？' },
      { speaker: 'Q', text: '次の急行なら二駅です。ですが、この列車は各駅停車。のんびり話す時間は十分ありますよ。' },
      { speaker: '主人公', text: 'へえ。見た目はちょっと怖いが、話せば普通にいい奴だな。' },
      { speaker: 'Q', text: 'ありがとうございます。ところで――あなたは今、進行方向に背を向けて座りましたね？' },
      { speaker: '主人公', text: 'え？ 空いてる席に座っただけだぞ。' },
      { speaker: 'Q', text: '許せません。鉄道への敬意が足りない。次の停車駅まで、私の列車デッキで矯正します。' },
      { speaker: '主人公', text: 'いきなり何なんだよ！？ さっきまで普通に話してただろ！' },
      { speaker: 'Q', text: 'ドアが閉まります。駆け込み乗車――いえ、駆け込みバトルを開始します！' },
      { speaker: '???', text: 'ほのぼのとした車内は一変し、レールを震わせる突然の戦いが始まった！' },
    ],
    outro: [
      { speaker: 'Q', text: '見事です。あなたの戦い方、急行列車のように迷いがない。' },
      { speaker: '主人公', text: '褒める前に、いきなり襲ってきたことを謝れ！' },
      { speaker: 'Q', text: '失礼しました。お詫びに中央部まで最速でお送りします。次は乗り換えなしです。' },
      { speaker: '主人公', text: '最初からそうしてくれ……。でも、その合体列車は面白かった。また勝負しようぜ。' },
      { speaker: 'Q', text: 'ええ。次の対戦ダイヤも、きっちり組んでおきましょう。' },
      { speaker: '???', text: '列車は夕暮れの修羅の国を駆け抜け、主人公をさらに深い世界へと運んでいった。' },
    ],
    opponents: [
      {
        name: 'Q',
        color: 0xc62828,
        deckKey: 'q',
        theme: { elements: [Element.THUNDER, Element.NEUTRAL] },
      },
    ],
    reward: null,
    replay: {
      intro: [
        { speaker: 'Q', text: 'お待ちしていました。本日の臨時列車は、対戦専用です。' },
        { speaker: '主人公', text: '今度は最初からバトル目的なんだな。わかりやすくて助かるぜ！' },
      ],
      outro: [{ speaker: 'Q', text: '本日も定刻どおりの敗北です。次便でまたお会いしましょう。' }],
    },
  },
  {
    key: 'danball',
    title: '⑤ 最果ての怪人',
    format: '1vs1',
    goalCurrency: 10000,
    intro: [
      { speaker: '???', text: 'Qの列車を降り、主人公が先へ進もうとしたその時――空が突如、暗雲に覆われた。' },
      { speaker: '主人公', text: 'なんだ、この雲は！？ 海も陸も、全部飲み込まれていく……！' },
      { speaker: '???', text: '暗雲を抜けた先は、音も光もない殺伐とした闇世界。そこに、段ボールをかぶった男がひとり佇んでいた。' },
      { speaker: '主人公', text: 'お前は何者だ！？' },
      { speaker: 'ダンボール男', text: 'この世界のヌシみたいなもんさ。管理人だと思ってくれ。' },
      { speaker: 'ダンボール男', text: 'お前が自由に泳ぎ回っていたこの世界は、実は俺が操っていたんだ。' },
      { speaker: '主人公', text: 'ふざけるな！ 海も修羅の国も、Qとの出会いも……全部お前の仕業だっていうのか？ なぜそんなことをする！' },
      { speaker: 'ダンボール男', text: '決まってるだろ？ ヒマだったんだ。' },
      { speaker: '主人公', text: 'ヒマつぶしで、俺たちの世界を好き勝手にしやがったのか……！' },
      { speaker: 'ダンボール男', text: 'いい顔になったじゃないか。だから、ガチで〇りあおうぜ？' },
      { speaker: '主人公', text: '上等だ！ お前の筋書きじゃない。俺自身の意志で、そのケンカを買ってやる！' },
      { speaker: '???', text: '闇世界の管理人と、自由を求める回遊魚。世界の行方を懸けた戦いが始まる。' },
    ],
    outro: [
      { speaker: '主人公', text: '俺の勝ちだ。もうこの世界を好き勝手に操るのはやめろ！' },
      { speaker: 'ダンボール男', text: '言っただろ……ヒマだったんだ。' },
      { speaker: 'ダンボール男', text: '俺は何度でもよみがえる、必ずな……' },
      { speaker: '???', text: 'そう言い残すと、段ボール男は凄まじい垂直跳びで画面の外へ消えていった。', action: 'verticalExit' },
      { speaker: '主人公', text: '……なんだったんだ、あいつ。だが、この闇のさらに奥に……まだ何かいる。' },
      { speaker: '???', text: '闇世界に走る、黒い亀裂。主人公はすべての創造主が待つ最深部へ進む。' },
    ],
    opponents: [
      {
        name: 'ダンボール男',
        color: 0x333333,
        deckKey: 'danball',
        // 無属性の古代のギア/レインボーカメレオン主体に、火・雷のSクラスも
        // 混ぜた構成（chinu-quest2-deck-danball_1.md）。
        theme: { elements: [Element.NEUTRAL, Element.FIRE, Element.THUNDER] },
      },
    ],
    reward: null,
    // 段ボール男との再戦は乱入キャラを足さず、フォーマットは変え
    // ず1vs1のまま。opponents/ally/formatを指定しなければ本編のものを
    // そのまま使う（main.jsのbuildBattlePlayerConfigsのフォールバック）。
    replay: {
      copyHeroDeck: true,
      intro: [
        { speaker: '???', text: '空から段ボール男が垂直に降ってきた。' },
        { speaker: 'ダンボール男', text: '待たせたな。おまえのすべてをパクることにした。' },
        { speaker: 'ダンボール男', text: 'カードも戦い方も、すべてだ。自分に食われるがいい。' },
        { speaker: '主人公', text: '俺のデッキを丸ごとコピーしたのか。なら、自分自身を超えてみせる！' },
      ],
      outro: [
        { speaker: 'ダンボール男', text: '同じデッキでも、同じ旅まではパクれないってことか……。' },
        { speaker: '主人公', text: '何度コピーしても同じだ。俺はその先へ進み続ける！' },
      ],
    },
  },
  {
    key: 'kare',
    title: '⑥ 「彼」との邂逅',
    format: '1vs1vs1',
    goalCurrency: 12000,
    intro: [
      { speaker: '???', text: '段ボール男を退けた主人公の前に、世界の継ぎ目のような黒い裂け目が現れた。' },
      { speaker: '主人公', text: 'まだ終わってないのか……？ この先にいる奴が、すべての元凶なんだな。' },
      { speaker: '「彼」', text: 'よく来たな、回遊魚。私は「彼」とかネ申と呼ばれている。この世界の創造主だ。' },
      { speaker: '主人公', text: '創造主だと？ じゃあ段ボール男に世界を操らせていたのも、お前なのか！' },
      { speaker: '「彼」', text: 'あれは優秀な管理人だった。お前が泳いだ海も、修羅の国も、あの男を介して私が観測していた。' },
      { speaker: '主人公', text: '俺たちを暇つぶしの駒にしてたってことか。ふざけやがって！' },
      { speaker: '「彼」', text: '駒に意思が芽生え、創造主へ牙をむく。実に興味深い。ならば、その自由が本物か試してやろう。' },
      { speaker: '???', text: 'その瞬間、背後の闇が激しく脈打ち、潰れた段ボールのような影が這い出した。' },
      { speaker: 'ダンボール男', text: 'ｸﾞ..ｶﾞｶﾞ..ｵﾚﾊ...何度ﾃﾞﾓ...蘇ルｯｯｯ！！' },
      { speaker: '主人公', text: '段ボール男！？ まだ生きていたのか！' },
      { speaker: '「彼」', text: '……ほう。面白い。これが魚群とやらの影響か。' },
      { speaker: '「彼」', text: 'いいだろう。不完全な管理人も交えて、今回の観測を始めよう。' },
      { speaker: 'ダンボール男', text: 'ｵﾚﾊ...管理人...何度ﾃﾞﾓ...戦ウｯ！' },
      { speaker: '主人公', text: 'まとめて来い！ 俺は誰の駒でもない。魚群の王になる男だ！' },
      { speaker: '???', text: '創造主、蘇った管理人、そして自由を求める回遊魚。互いの思惑がぶつかる三つ巴の戦いが始まる！' },
    ],
    outro: [
      { speaker: '「彼」', text: 'なるほど……観測不能なほどの意思。それがお前の言う魚群の力か。' },
      { speaker: '主人公', text: '俺一人の力じゃない。ここまで出会った奴らとの腐れ縁が、俺を泳がせてるんだ。' },
      { speaker: 'ダンボール男', text: 'ｶﾞ...管理...終、了......' },
      { speaker: '「彼」', text: '不完全な復活ゆえ、私の命令にも雑音が混じったか。だが、仕組みは理解した。' },
      { speaker: '主人公', text: '何をするつもりだ。そいつはもう、お前の思いどおりにはならないぞ。' },
      { speaker: '???', text: '「彼」が静かに手をかざすと、黒い糸のような光が段ボール男の全身へ食い込んだ。' },
      { speaker: 'ダンボール男', text: 'ｵﾚ...ﾊ……自由……ｶﾞｯ……管理人……命令、受諾。' },
      { speaker: '主人公', text: '段ボール男！ おい、しっかりしろ！' },
      { speaker: '「彼」', text: '安心しろ。壊れた管理人を、本来あるべき私の支配下へ戻しただけだ。' },
      { speaker: '「彼」', text: '今日の観測はここまでだ。次に会う時は三つ巴ではない。創造主と管理人――二つの意志で、お前の自由を消去する。' },
      { speaker: '主人公', text: '逃げるのか！ 次はそいつごと、お前の支配から引きずり出してやる！' },
      { speaker: '「彼」', text: 'その言葉まで含めて観測済みだ。次の盤面で会おう、魚群の王。' },
      { speaker: '???', text: '電脳空間が閉じ、「彼」と完全に支配された段ボール男は闇の奥へ消えた。戦いは、まだ終わっていない。' },
    ],
    opponents: [
      {
        name: '「彼」',
        color: 0x263238,
        deckKey: 'kare',
        theme: { elements: [Element.WATER, Element.FOREST] },
      },
      {
        name: 'ダンボール男',
        color: 0x5d4037,
        deckKey: 'danball',
        theme: { elements: [Element.NEUTRAL, Element.FIRE, Element.THUNDER] },
      },
    ],
    reward: null,
    replay: {
      intro: [
        { speaker: '「彼」', text: '再び観測されに来たか。ならば前回と同じ条件で始めよう。' },
        { speaker: 'ダンボール男', text: 'ｵﾚﾊ...何度ﾃﾞﾓ...蘇ルｯｯｯ！！' },
        { speaker: '主人公', text: '望むところだ。二人まとめてもう一度相手してやる！' },
      ],
      outro: [{ speaker: '「彼」', text: '何度繰り返しても、お前は予測を越える。実に面白い。' }],
    },
  },
  {
    key: 'final-alliance',
    title: '⑦ 支配の終焉',
    format: '2vs2',
    goalCurrency: 15000,
    heroAllianceId: 'red',
    enemyAllianceId: 'white',
    ally: {
      name: '朕',
      color: 0xec407a,
      deckKey: 'chin',
      theme: { elements: [Element.WATER, Element.FIRE, Element.NEUTRAL], featuredMonster: MONSTER_CATALOG.su },
    },
    intro: [
      { speaker: '???', text: '電脳空間の最深部。法廷を思わせる空間で、「彼」の隣には黒い糸に操られた段ボール男が立っていた。' },
      { speaker: '主人公', text: '段ボール男を返せ。「彼」、今度こそ全部終わらせる。' },
      { speaker: '「彼」', text: '管理人は初めから私の所有物だ。今度は完全に支配し直した。' },
      { speaker: '段ボール男', text: '命令受諾……対象、回遊魚。排除スル。' },
      { speaker: '主人公', text: '二人まとめて相手してやる！' },
      { speaker: '「彼」', text: 'お前一匹で何ができる。' },
      { speaker: '???', text: '重い足音が響く。涙を流すピンク色の象魚、その上に黒髪の少女が片足を組んで座っていた。' },
      { speaker: '酢', text: 'パオ……。' },
      { speaker: '朕', text: '道を空けよ。朕のお通りじゃ。' },
      { speaker: '主人公', text: '朕？　名前か？　一人称か？' },
      { speaker: '朕', text: '両方じゃ。こちらは象魚の酢。' },
      { speaker: '主人公', text: 'なんで泣いてるんだ？' },
      { speaker: '朕', text: '常に泣いておる。たぶん。' },
      { speaker: '「彼」', text: '余興は終わりだ。創造主に従え。' },
      { speaker: '朕', text: '断る。朕に命令できる者は朕だけじゃ。' },
      { speaker: '主人公', text: 'なら俺と組め！' },
      { speaker: '朕', text: '不敬な誘いじゃが、今回だけ隣を許す。' },
      { speaker: '「彼」', text: '即席同盟で支配に抗うか。面白い。' },
      { speaker: '段ボール男', text: '命令……絶対。' },
      { speaker: '主人公', text: '思い出せ、段ボール男！　お前の意志を蘇らせろ！' },
      { speaker: '朕', text: 'まず鎖を引く者から引きずり下ろす。進め、酢。' },
      { speaker: '酢', text: 'パオ！' },
      { speaker: '???', text: '主人公と朕の紅組、「彼」と段ボール男の白組。同盟戦が始まる！' },
    ],
    outro: [
      { speaker: '「彼」', text: '支配系統、切断……あり得ない。' },
      { speaker: '朕', text: '支配とは鎖ではない。従わせたいなら、せめて堂々と顔を見せよ。' },
      { speaker: '主人公', text: '酢は自分から従ってるのか？' },
      { speaker: '酢', text: '……パオ。' },
      { speaker: '朕', text: 'そこは今、大事ではない。' },
      { speaker: '段ボール男', text: '命令……消失。オレハ……。' },
      { speaker: '主人公', text: '思い出せ。ヒマだからケンカを売って、垂直跳びで消えたお前を！' },
      { speaker: '段ボール男', text: '……俺は何度でも蘇る。今度は俺がお前をパクる番だ、「彼」。' },
      { speaker: '???', text: '段ボール男を縛っていた黒い糸が砕け散った。' },
      { speaker: '「彼」', text: '管理人ごときが創造主を裏切るか。だが観測は終わらない。' },
      { speaker: '主人公', text: '次は逃がさない。お前が作った道だけを泳ぐと思うな。' },
      { speaker: '???', text: '「彼」は法廷の闇へ消えた。戦いは終わったが、世界の謎はまだ残っている。' },
      { speaker: '朕', text: '愉快な旅になりそうじゃ。征服すべき世界も広い。' },
      { speaker: '主人公', text: 'お前も支配する側じゃねえか！' },
      { speaker: '???', text: '新たな腐れ縁を乗せ、回遊魚の旅は続く。' },
    ],
    opponents: [
      {
        name: '「彼」',
        color: 0x263238,
        deckKey: 'kare',
        theme: { elements: [Element.WATER, Element.FOREST] },
      },
      {
        name: '段ボール男',
        color: 0x5d4037,
        deckKey: 'danball',
        theme: { elements: [Element.NEUTRAL, Element.FIRE, Element.THUNDER] },
      },
    ],
    reward: null,
    replay: {
      intro: [
        { speaker: '朕', text: '再び法廷か。酢、今度も一気に攻め落とすぞ。' },
        { speaker: '酢', text: 'パオ！' },
        { speaker: '主人公', text: 'よし、紅組でもう一度決着だ！' },
      ],
      outro: [{ speaker: '朕', text: '朕と酢の進撃、しかと覚えておけ。' }],
    },
  },
];

export function isStageUnlocked(character, index) {
  return index <= (character.storyProgress || 0);
}

export function isStageCleared(character, index) {
  return index < (character.storyProgress || 0);
}
