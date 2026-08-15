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
        deckKey: 'danball',
        // 無属性の古代のギア/レインボーカメレオン主体に、火・雷のSクラスも
        // 混ぜた構成（chinu-quest2-deck-danball_1.md）。
        theme: { elements: [Element.NEUTRAL, Element.FIRE, Element.THUNDER] },
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
  {
    key: 'kare',
    title: '⑥ 彼とかネ申と呼ばれている男',
    format: '1vs1vs1',
    goalCurrency: 12000,
    intro: [
      { speaker: '???', text: '段ボール男を退けた主人公の前に、世界の継ぎ目のような黒い裂け目が現れた。' },
      { speaker: '主人公', text: 'まだ終わってないのか……？ この先にいる奴が、すべての元凶なんだな。' },
      { speaker: '彼', text: 'よく来たな、回遊魚。私は彼とかネ申と呼ばれている。この世界の創造主だ。' },
      { speaker: '主人公', text: '創造主だと？ じゃあ段ボール男に世界を操らせていたのも、お前なのか！' },
      { speaker: '彼', text: 'あれは優秀な管理人だった。お前が泳いだ海も、修羅の国も、あの男を介して私が観測していた。' },
      { speaker: '主人公', text: '俺たちを暇つぶしの駒にしてたってことか。ふざけやがって！' },
      { speaker: '彼', text: '駒に意思が芽生え、創造主へ牙をむく。実に興味深い。ならば、その自由が本物か試してやろう。' },
      { speaker: '???', text: 'その瞬間、背後の闇が激しく脈打ち、潰れた段ボールのような影が這い出した。' },
      { speaker: 'ダンボール男', text: 'ｸﾞ..ｶﾞｶﾞ..ｵﾚﾊ...何度ﾃﾞﾓ...蘇ルｯｯｯ！！' },
      { speaker: '主人公', text: '段ボール男！？ まだ生きていたのか！' },
      { speaker: '彼', text: '……ほう。面白い。これが魚群とやらの影響か。' },
      { speaker: '彼', text: 'いいだろう。不完全な管理人も交えて、最後の観測を始めよう。' },
      { speaker: 'ダンボール男', text: 'ｵﾚﾊ...管理人...何度ﾃﾞﾓ...戦ウｯ！' },
      { speaker: '主人公', text: 'まとめて来い！ 俺は誰の駒でもない。魚群の王になる男だ！' },
      { speaker: '???', text: '創造主、蘇った管理人、そして自由を求める回遊魚。最後の三つ巴の戦いが始まる！' },
    ],
    outro: [
      { speaker: '彼', text: 'なるほど……観測不能なほどの意思。それがお前の言う魚群の力か。' },
      { speaker: '主人公', text: '俺一人の力じゃない。ここまで出会った奴らとの腐れ縁が、俺を泳がせてるんだ。' },
      { speaker: 'ダンボール男', text: 'ｶﾞ...管理...終、了......' },
      { speaker: '彼', text: '管理人よ、もう休め。お前は創造主の命令を越えて、自ら蘇ることを選んだ。' },
      { speaker: '主人公', text: 'お前もどうするんだ。まだ俺たちを操るつもりか？' },
      { speaker: '彼', text: 'いや。創造した世界が創造主の手を離れる瞬間も、悪くない。好きに泳げ、魚群の王よ。' },
      { speaker: '???', text: '闇は晴れ、世界に再び風と波の音が戻った。主人公の旅は終わらない。今度こそ、誰にも決められていない海へ。' },
    ],
    opponents: [
      {
        name: '彼',
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
        { speaker: '彼', text: '再び観測されに来たか。ならば前回と同じ条件で始めよう。' },
        { speaker: 'ダンボール男', text: 'ｵﾚﾊ...何度ﾃﾞﾓ...蘇ルｯｯｯ！！' },
        { speaker: '主人公', text: '望むところだ。二人まとめてもう一度相手してやる！' },
      ],
      outro: [{ speaker: '彼', text: '何度繰り返しても、お前は予測を越える。実に面白い。' }],
    },
  },
];

export function isStageUnlocked(character, index) {
  return index <= (character.storyProgress || 0);
}

export function isStageCleared(character, index) {
  return index < (character.storyProgress || 0);
}
