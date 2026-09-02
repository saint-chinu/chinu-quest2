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
      { speaker: 'お肉', text: 'ワイは北の海のコンビニ店長、お肉や。店も客もずっとお前に好き放題されてきた。反撃のチャンスを待っとったんや！' },
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
      { speaker: 'お肉', text: 'わかったんならええんや。これからは暴君やのうて、北の海の仲間としてやっていこや。店にもちゃんと客として来いや。' },
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
      { speaker: '主人公', text: '助かった。これからどこへ行くんだ？' },
      { speaker: '朕', text: '朕は朕の道を行く。今回は、たまたま敵が同じだっただけじゃ。' },
      { speaker: '主人公', text: 'そうか。まあ、またどこかで会いそうだな。' },
      { speaker: '朕', text: '次に道を塞げば、お前も容赦なく退かせる。行くぞ、酢。' },
      { speaker: '酢', text: 'パオ。' },
      { speaker: '???', text: '朕と酢は主人公とは別の道へ去り、回遊魚の旅は続く。' },
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
  {
    key: 'chin-harbor',
    title: '⑧ 朕と酢の花火港',
    format: '1vs1',
    goalCurrency: 12000,
    heroStartGoalIndex: 0,
    intro: [
      { speaker: '???', text: '「彼」との激闘を終えた帰り道。主人公は港のきれいな夜景と水面を彩る花火を眺めていた。' },
      { speaker: '主人公', text: '夏も終わりか……。花火が終わる瞬間ってのは、なんだか寂しいもんだな。' },
      { speaker: '???', text: 'その時、道路の真ん中に紫色のワームホールが開き、涙を流す象魚にまたがった少女が飛び出してきた。' },
      { speaker: '酢', text: 'パオ……！' },
      { speaker: '主人公', text: '朕！？ お前、あのあと別の道へ行ったはずだろ！' },
      { speaker: '朕', text: '偶然居合わせただけじゃ。朕がお前を追って来たと思うな。' },
      { speaker: '朕', text: 'そこの魚、どけ。ここは朕の通り道じゃ。' },
      { speaker: '主人公', text: 'いやいやいや！ 公道だから！ その乗り物、いいのかよ！？' },
      { speaker: '朕', text: '道路交通法では、馬その他の動物に乗る者は軽車両として扱われる。酢も同じようなものじゃ。ゆえに問題ない。' },
      { speaker: '主人公', text: '象魚を馬と同じ扱いにするな！ そもそもワームホールから出てきただろ！' },
      { speaker: '朕', text: 'どかぬなら、退かせるまでよ。覚悟はできておろう？' },
      { speaker: '主人公', text: '上等だ！ 法律の話は盤面のあとにしようぜ！' },
      { speaker: '酢', text: 'パオ！' },
    ],
    outro: [
      { speaker: '朕', text: '見事じゃ。今宵は道を譲ってやろう。' },
      { speaker: '主人公', text: '最初からそうしてくれよ。でも、悪くない花火だったな。' },
      { speaker: '朕', text: '勘違いするでない。朕は朕の道へ行く。行くぞ、酢。' },
      { speaker: '酢', text: 'パオ……。' },
      { speaker: '???', text: '花火が港を照らす中、朕と酢はワームホールへ消え、主人公も再び自分の旅路へ戻った。' },
    ],
    opponents: [
      {
        name: '朕',
        color: 0xec407a,
        deckKey: 'chin',
        startGoalIndex: 1,
        theme: { elements: [Element.WATER, Element.FIRE, Element.NEUTRAL], featuredMonster: MONSTER_CATALOG.su },
      },
    ],
    reward: null,
    replay: {
      intro: [
        { speaker: '朕', text: '花火は何度見てもよい。勝負も同じじゃ。' },
        { speaker: '主人公', text: '今度こそ、どっちが先にこの道を通るか決めようぜ！' },
        { speaker: '酢', text: 'パオ！' },
      ],
      outro: [{ speaker: '朕', text: 'よい余興であった。次も朕を退屈させるでないぞ。' }],
    },
  },
  {
    key: 'tax-audit',
    title: '⑨ 暴君と税務調査',
    format: '2vs2',
    goalCurrency: 14000,
    heroAllianceId: 'red',
    enemyAllianceId: 'white',
    boardDialogue: true,
    overlaySpeakerSides: {
      主人公: 'right',
      '暴君マダイ': 'right',
      ムール: 'left',
      専門調査官・A: 'left',
    },
    ally: {
      name: '暴君マダイ',
      color: 0xffd166,
      deckKey: 'madai',
      theme: { elements: [Element.WATER, Element.THUNDER] },
    },
    intro: [
      { speaker: '???', text: '花火港を離れた主人公は、海底に沈む古い都市へ迷い込んだ。崩れた庁舎の前では、暴君マダイが青紫の貝を背負った調査官に詰め寄られていた。' },
      { speaker: 'ムール', text: '申告された漁場収入と、北の海で確認された領地評価額に差があります。帳簿をもう一度確認させてください。' },
      { speaker: '暴君マダイ', text: '何度見せれば気が済む！ 税金は期限どおり、きっちり全部納めたぞ！' },
      { speaker: 'ムール', text: '納税済みであることと、調査が終わることは別問題です。私は税務調査官のムール。疑問が一つでも残る限り確認します。' },
      { speaker: '暴君マダイ', text: 'おい、ちょうどいいところに来たな！ ライバル、こいつを何とかしてくれ！' },
      { speaker: '主人公', text: '税務調査に俺を巻き込むな。じゃあな、俺は何も見てない。' },
      { speaker: 'ムール', text: 'お待ちください。あなたには、以前モンスターを召喚した土地の固定資産税に未納記録があります。' },
      { speaker: '主人公', text: '魚に固定資産税かかるん！？' },
      { speaker: '暴君マダイ', text: '一緒にするな！ 俺はきっちり納めとる！' },
      { speaker: '主人公', text: 'さっきまで助けを求めてた奴が、急に税務署側に立つな！' },
      { speaker: '専門調査官・A', text: 'そこまでゆ。修羅の国・税務課の少女Aゆ。' },
      { speaker: '主人公', text: 'また税金関係かよ！' },
      { speaker: '専門調査官・A', text: 'それは表の顔。裏の顔は沈没都市の専門調査官・A。さすがに脱税は見逃せないゆ。' },
      { speaker: 'ムール', text: '専門調査官・A。対象者二名を確認しました。' },
      { speaker: '暴君マダイ', text: '二名！？ だから俺は納税しとる言うとるやろ！' },
      { speaker: '専門調査官・A', text: '疑いが晴れるまでは、まとめて調査対象ゆ。' },
      { speaker: '主人公', text: 'こうなったら一時休戦だ、マダイ！ 二人まとめて追い返すぞ！' },
      { speaker: '暴君マダイ', text: '俺まで脱税扱いされた借りは高くつくぞ。沈没都市ごとひっくり返してやる！' },
      { speaker: '???', text: '主人公と暴君マダイの紅組、ムールと専門調査官・Aの白組。沈没都市を舞台に、税務調査という名の同盟戦が始まった！' },
    ],
    outro: [
      { speaker: 'ムール', text: '調査を終了します。暴君マダイの申告と納付記録に問題はありませんでした。' },
      { speaker: '暴君マダイ', text: '最初からそう言っとるやろ！' },
      { speaker: '主人公', text: 'じゃあ俺も無罪ってことで、帰っていいか？' },
      { speaker: '専門調査官・A', text: 'お前の未納は本物ゆ。勝敗と納税義務は関係ないゆ。' },
      { speaker: '主人公', text: 'そこは戦って勝ったら帳消しになる流れだろ！' },
      { speaker: 'ムール', text: 'なりません。ただし故意の隠蔽は確認できませんでした。分割納付の申請書をお渡しします。' },
      { speaker: '暴君マダイ', text: '助けに来たつもりが、最後までお前の税金の話じゃねえか。' },
      { speaker: '主人公', text: 'そもそも助けを求めたのはお前だろ！' },
      { speaker: '専門調査官・A', text: '次に会う時までに払っておくゆ。延滞すると、また特命調査に行くゆ。' },
      { speaker: 'ムール', text: '帳簿は逃げません。もちろん、未納者も逃がしません。' },
      { speaker: '???', text: '潔白を証明したマダイと、納付書を背負わされた主人公。奇妙な共闘を終え、二匹は沈没都市をあとにした。' },
    ],
    opponents: [
      {
        name: 'ムール',
        color: 0x3949ab,
        deckKey: 'muuru',
        theme: { elements: [Element.WATER], featuredMonster: MONSTER_CATALOG.kaikyouSekishoKurage },
      },
      {
        name: '専門調査官・A',
        color: 0x4caf6e,
        // ③修羅の国の少女Aとは別のデッキ・別のAI。あちらは慎重な序盤の相手
        // のままにしたいので、⑨だけ攻撃的な専用プロファイルを引かせる。
        deckKey: 'investigatorA',
        theme: { elements: [Element.THUNDER, Element.FOREST] },
      },
    ],
    reward: 'toughness',
    replay: {
      intro: [
        { speaker: 'ムール', text: '再調査を開始します。今回は前回より短時間で終わらせましょう。' },
        { speaker: '専門調査官・A', text: '未納が残っている限り、何度でも調査するゆ。' },
        { speaker: '暴君マダイ', text: '俺は今回も納税済みだからな！' },
        { speaker: '主人公', text: 'わかったわかった。勝負してから話そうぜ！' },
      ],
      outro: [{ speaker: 'ムール', text: '再調査終了です。納付書は再発行しておきます。' }],
    },
  },
  {
    key: 'hitodemaso',
    title: '⑩ 成れの果て',
    format: '1vs1',
    goalCurrency: 16000,
    overlayNpc: '邪神ヒトデマソ',
    intro: [
      { speaker: '???', text: '沈没都市のさらに奥。光の届かない大海溝の底に、古い神殿が沈んでいた。' },
      { speaker: '主人公', text: 'ここが最深部か……。水が重い。まるで海そのものが怒っているみたいだ。' },
      { speaker: '???', text: '神殿の中心で、巨大な影が蠢いた。赤黒く膨れ上がった五つの腕。その中心には、見覚えのある小さな姿が埋もれていた。' },
      { speaker: '主人公', text: 'ヒトデ……？ お前なのか！？' },
      { speaker: '邪神ヒトデマソ', text: 'コロシテ...コロシテクレメンス...' },
      { speaker: '???', text: 'それは、チュートリアル代わりに何度も倒され続けたヒトデの無念が集まった成れの果て。邪神ヒトデマソだった。' },
      { speaker: '主人公', text: 'ふざけんな。そんな姿にされるために、あいつは俺を送り出したんじゃない。' },
      { speaker: '邪神ヒトデマソ', text: 'コロシテ...タスケテ...' },
      { speaker: '主人公', text: 'わかった。俺が終わらせる。お前を倒して、ヒトデを取り戻す！' },
      { speaker: '???', text: '深海の神殿が震え、無念の集合体が咆哮する。主人公は単身、かつての腐れ縁を救うため邪神へ挑む。' },
    ],
    outro: [
      { speaker: '邪神ヒトデマソ', text: 'ア...アァ......' },
      { speaker: '???', text: '崩れ落ちる邪神の体から、小さなヒトデが静かに浮かび上がった。' },
      { speaker: '主人公', text: 'ヒトデ！ しっかりしろ！' },
      { speaker: 'ヒトデ', text: '……うるせえな。そんな大声出さなくても聞こえてるよ。' },
      { speaker: '主人公', text: '戻ったのか……よかった。' },
      { speaker: 'ヒトデ', text: '体が動かねえ。少し眠る。回復したら、故郷の南の海に帰るさ。' },
      { speaker: '主人公', text: 'ああ。帰ったら、また勝負だ。今度はチュートリアル扱いじゃなく、本気でな。' },
      { speaker: 'ヒトデ', text: 'へっ……言ってろ。次は、俺が勝つ……。' },
      { speaker: '???', text: 'ヒトデは深い眠りについた。主人公は「ヒトデの魂」を手に入れ、さらに深い旅路へ泳ぎ出す。' },
    ],
    opponents: [
      {
        name: '邪神ヒトデマソ',
        color: 0x6a1b2a,
        deckKey: 'hitodemaso',
        theme: { elements: [Element.NEUTRAL] },
      },
    ],
    breedPartReward: 'part-hitode-regeneration',
    replay: {
      intro: [
        { speaker: 'ヒトデ', text: '悪夢の残り香ってやつか。もう一度だけ、付き合ってくれ。' },
        { speaker: '主人公', text: '何度でも付き合う。今度は飲まれるなよ、ヒトデ！' },
      ],
      outro: [{ speaker: 'ヒトデ', text: '少しずつ、体が戻ってきた気がする。ありがとな。' }],
    },
  },
  {
    key: 'mahjong-duo',
    title: '⑪ ふたりは○○',
    format: '1vs2→2vs2',
    goalCurrency: 17000,
    heroAllianceId: 'red',
    enemyAllianceId: 'white',
    boardDialogue: true,
    overlaySpeakerSides: {
      主人公: 'right',
      ウサギン: 'right',
      '闇・ホフク': 'left',
      '暗・少女A': 'left',
      サーティー: 'right',
    },
    intro: [
      { speaker: '???', text: '海底神殿の奥。奇妙なワープポイントが、泡も音も飲み込みながら口を開けていた。主人公は抵抗する間もなく、その渦へ吸い込まれていく。' },
      { speaker: '主人公', text: 'うおっ！？ なんだこれ、海流じゃない……！' },
      { speaker: '???', text: '目を覚ますと、そこには見慣れた顔が並んでいた。だが、空気が違う。水音に混じって、ジャラジャラと牌の鳴る音が響く。' },
      { speaker: '暗・少女A', text: '――ロンゆ。リーチ一発メンホンチートイ赤。16,000。' },
      { speaker: 'ウサギン', text: 'な、なんだよその待ち！！' },
      { speaker: '暗・少女A', text: 'どうせ安牌で1枚抱えてたゆ？ タダで出るんだからリーチ一択だゆ。' },
      { speaker: 'ウサギン', text: 'つ、次だ！！ 倍プッシュだ！！' },
      { speaker: '闇・ホフク', text: '何度やっても結果は見えてるわ。いいカモね。' },
      { speaker: 'ウサギン', text: 'う、うるさい！！' },
      { speaker: '闇・ホフク', text: '――ポン。' },
      { speaker: 'ウサギン', text: 'ぐっ……テンパイか。1枚切れの白、これを通せば……リーチぃぃぃぃ！！' },
      { speaker: '闇・ホフク', text: '――ロン。48,000。' },
      { speaker: 'ウサギン', text: 'だ、大三元……？ 槓子から白打ちだと……？' },
      { speaker: '???', text: 'ウサギンは泡を吹き、静かに卓へ沈んだ。' },
      { speaker: '闇・ホフク', text: '1局打ってくかい？ メンツが欠けちゃってね。' },
      { speaker: '主人公', text: 'いや、遠慮しとく。忙しいから。' },
      { speaker: '暗・少女A', text: 'うるさいゆ。黙って座れゆ。' },
      { speaker: '闇・ホフク', text: 'そんな根性無しが魚群の王になるって？ 笑わせるなよ、チキンは失せな。' },
      { speaker: '主人公', text: 'は！？ いまなんつった！？' },
      { speaker: '闇・ホフク', text: '坊やは失せろって言ったのよ。その辺の海で遊んでな。' },
      { speaker: '主人公', text: 'は！？ コンビ打ちでもなんでもかかってこいや！！' },
      { speaker: '暗・少女A', text: '二言はないゆ？' },
      { speaker: '闇・ホフク', text: '遊んであげるよ。沈むまでね。' },
      { speaker: '???', text: '闇・ホフクと暗・少女Aがゆらりと立ち上がる。夢とも現実ともつかない雀卓の海で、変則同盟戦が始まった！' },
    ],
    midBattleAssist: {
      ratio: 2.5,
      ally: {
        name: 'サーティー',
        color: 0x232323,
        deckKey: 'thirty',
        theme: { elements: [Element.NEUTRAL, Element.THUNDER] },
      },
      lines: [
        { speaker: 'サーティー', text: 'おいおいお嬢ちゃん達。フェアじゃねえな。' },
        { speaker: '闇・ホフク', text: 'あ？ 誰よアンタ。' },
        { speaker: 'サーティー', text: '俺はサーティー。しがない暗殺者だ。弱いものイジメは好きじゃねえ。' },
        { speaker: '暗・少女A', text: 'フン、何人いようが変わらないゆ。まとめてやっつけてやるゆ！' },
        { speaker: 'サーティー', text: 'なら決まりだ。坊主、背中は預かる。ここからは二対二だ。' },
      ],
    },
    outro: [
      { speaker: 'サーティー', text: 'さあ、元の世界に帰りな。ここに長居しちゃいけねえ。お嬢ちゃん達のことは俺に任せとけ。' },
      { speaker: '???', text: 'サーティーは不敵に笑った。煙草の煙の向こうで、闇・ホフクと暗・少女Aの視線だけが鋭く光る。' },
      { speaker: '主人公', text: 'あ、あんたは一体……' },
      { speaker: '???', text: '言いかけた瞬間、急にめまいがした。視界がぐにゃりと歪み、牌の音が遠ざかっていく。' },
      { speaker: '???', text: '主人公は目を覚ました。すべては夢だった――はずだった。' },
      { speaker: '主人公', text: '……なんで、こんなもの握ってるんだよ。' },
      { speaker: '???', text: '主人公の手には、北の麻雀牌が握りしめられていた。' },
    ],
    opponents: [
      {
        name: '闇・ホフク',
        color: 0x8d2149,
        deckKey: 'darkHofuku',
        theme: { elements: [Element.FIRE] },
      },
      {
        name: '暗・少女A',
        color: 0x6044ff,
        deckKey: 'darkShoujoA',
        theme: { elements: [Element.THUNDER] },
      },
    ],
    replay: {
      intro: [
        { speaker: '闇・ホフク', text: 'あの負けはアンタのせいよ。リーチひとつ読めない木偶が隣に座ってたんだから。' },
        { speaker: '暗・少女A', text: 'はあ？ 姐さんこそ振り込みまくってたゆ。もうアンタとは組まないゆ。' },
        { speaker: 'サーティー', text: '（おい、修羅場だぞ。……で、なんで俺たちが呼ばれたんだ？）' },
        { speaker: '主人公', text: '（知らないよ……）なあ、俺たちは関係ないだろ。帰っていいか？' },
        { speaker: '闇・ホフク', text: '関係大アリよ。アンタたちに負けたせいでこうなったんだから、責任を取りなさい。' },
        { speaker: '暗・少女A', text: '全員まとめて沈めて、あたしが一番だって証明するゆ。同盟なんかいらないゆ。' },
        { speaker: 'サーティー', text: '……こうなったら仕方ない。全員敵ってわけだ。悪いが俺も勝たせてもらうぜ。' },
        { speaker: '主人公', text: '巻き込まれ損にもほどがある……！ こうなったら勝って帰る！' },
      ],
      outro: [
        { speaker: '闇・ホフク', text: '……はぁ。アンタと組んでた時のほうが、まだマシだったかもね。' },
        { speaker: '暗・少女A', text: '……次はまた姐さんと組むゆ。それで今度こそ勝つゆ。' },
        { speaker: '主人公', text: 'あっさり仲直りかよ。じゃあこの戦いは何だったんだ……。' },
        { speaker: 'サーティー', text: '世の中そんなもんだ。ま、いい勝負だったけどな。' },
      ],
      // 本編は「闇の2人が同盟／サーティーは途中参戦の味方」だが、再戦は
      // 敗北をきっかけに闇の2人が仲違いした四つ巴（同盟なしFFA）。
      // midBattleAssistは再戦では発火しないため、サーティーは味方ではなく
      // 独立した対戦者としてopponentsに入れる。
      format: '1vs1vs1vs1',
      ally: null,
      heroAllianceId: null,
      enemyAllianceId: null,
      opponents: [
        {
          name: '闇・ホフク',
          color: 0x8d2149,
          deckKey: 'darkHofuku',
          theme: { elements: [Element.FIRE] },
        },
        {
          name: '暗・少女A',
          color: 0x6044ff,
          deckKey: 'darkShoujoA',
          theme: { elements: [Element.THUNDER] },
        },
        {
          name: 'サーティー',
          color: 0x232323,
          deckKey: 'thirty',
          theme: { elements: [Element.NEUTRAL, Element.THUNDER] },
        },
      ],
    },
  },
  {
    key: 'ofuda-field',
    title: '⑫ 海上金融街のフィクサー',
    format: '1vs1',
    goalCurrency: 15000,
    boardDialogue: true,
    // boardDialogueのオーバーレイ会話は、overlayNpcかこのマップが無いと
    // どちらの立ち絵も出ない（playOverlayDialogueLines参照）。話者名は
    // NPC_PORTRAIT_URL/主人公アイコンの引き当てキーも兼ねる。
    // 「???」はここに載せない = 地の文なので立ち絵なし・吹き出し中央。
    overlaySpeakerSides: {
      主人公: 'right',
      クエ: 'left',
    },
    intro: [
      { speaker: '???', text: '海底都市を抜けた主人公は、激しい水流に巻き上げられ、きらびやかな海上大都会へ放り出された。' },
      { speaker: '主人公', text: 'うおっ……なんだここ。ビルも船もピカピカで、歩いてる奴ら全員ビジネスマンみたいだぞ。' },
      { speaker: '???', text: '場違いな空気におびえながら泳いでいると、銀のスーツを着たクエ頭の男にぶつかってしまった。' },
      { speaker: 'クエ', text: 'おいコラ魚ァ。今の一撃でワイの仕掛けが遅れたやないか。相場操作が間に合わんで、1億円飛んだわ。' },
      { speaker: '主人公', text: 'いやいや、ぶつかっただけで1億円は無理があるだろ。だいたい誰だよあんた。' },
      { speaker: 'クエ', text: 'は！？ワイを知らんとは、キサマモグリか！？ワイはクエ、この大都会のフィクサーや。' },
      { speaker: '主人公', text: 'フィクサー……。さっき自分の口で相場操作って言ってたよな？' },
      { speaker: 'クエ', text: '細かいこと気にすな。弁償せえ。ここは海上金融街、数字読めん奴から沈む街や。' },
      { speaker: '主人公', text: '突っぱねるに決まってるだろ。そんな因縁に付き合ってられるか。' },
      { speaker: 'クエ', text: 'お前金融素人の貧乏人か？F/Sも読めないくせにこの街にくんじゃねえ、ワイが処刑してやる。' },
      { speaker: '???', text: 'この街では火・水・雷・森それぞれの「お札」が売買されている。土地と並ぶ、もうひとつの資産だ。' },
      { speaker: '???', text: 'お札の値段を決めるのは盤面そのもの。その属性の土地が増え、レベルが上がるほど値上がりする。開始時はどれも1枚12G、上限は120G――最大10倍だ。' },
      { speaker: '???', text: '売買でも相場は動く。150Gぶん買えば1G上がり、同じだけ売れば1G下がる。買い占めて自分で高値を作ることもできる。' },
      { speaker: '???', text: '取引所はゴールと各チェックポイントにある。通過するたびに相場が開き、売買できる。持っているお札は時価で総資産に加算され、周回ボーナスにも評価額の8%が上乗せされる。' },
      { speaker: '???', text: '相場そのものは画面右の「相場」ボタンでいつでも確認できる。安い属性を仕込み、自分の土地を育てて吊り上げろ。' },
      { speaker: '???', text: '土地とお札の両方で総資産15,000Gを目指せ！　ただしここはサドンデス、破産した時点で敗北が確定する。' },
    ],
    outro: [
      { speaker: 'クエ', text: 'このワイが....負ける？素人に...！？何かの間違いだ...' },
      { speaker: '???', text: 'クエは株価チャートの幻のように揺らめき、ぶつぶつ言いながら金融街の人波へ消えていった。' },
      { speaker: '主人公', text: '……怖い街だった。けど、お札の動きは覚えたぞ。土地だけ見てたら足元をすくわれるな。' },
      { speaker: '主人公', text: 'あいつ負けを認めねえなぁ、もし破産させたらどうなるんだろ...？' },
    ],
    opponents: [
      // themeはdeckKey持ちのNPCでは表示・保険用のメタ情報（デッキはdeckKeyの
      // 固定40枚）。森軸＋避雷針侍(雷)＋混沌の頭(無)の現デッキに合わせておく。
      { name: 'クエ', color: 0xc0c0c0, deckKey: 'que', theme: { elements: [Element.FOREST, Element.THUNDER, Element.NEUTRAL] } },
    ],
    replay: {
      intro: [
        { speaker: 'クエ', text: 'また来たんか。ちょうどええ、相場も熱うなってきたところや。' },
        { speaker: 'クエ', text: 'ただし今回は遊びやない。目標は20,000G。前より長い勝負になる分、お札の仕込みが物を言うで。' },
        { speaker: 'クエ', text: 'ワイの土俵で、ワイの流儀で、今度こそ沈めたる。' },
        { speaker: '主人公', text: '望むところだ。相場の読み方なら、あんたを見て一番学んだからな。' },
      ],
      outro: [
        { speaker: 'クエ', text: '……ワイの負けや。お前、ほんまに数字が読める魚になったんやな。' },
        { speaker: 'クエ', text: 'また相場が動いたら来い。この街は、勝ち続ける奴に一番冷たいからな。' },
      ],
      // 目標を本編の15,000Gから引き上げ、決着までの周回数を増やす。
      // 長期戦ほどお札の仕込み（安値買い→土地育成→高値売り）と利回りが
      // 効くため、相場ステージの再戦を「本気の相場戦」にする狙い。
      // サドンデス（破産＝即敗北）と破産隠し報酬は本編と同じく有効。
      goalCurrency: 20000,
    },
  },
  {
    key: 'kessan',
    title: '⑬ 豪華客船',
    format: '2vs2',
    // 同盟合算の目標。長丁場ほど敵側の複利（通行料網・お札の含み益・
    // 周回収入）が効く、という設計なのでやや高めにしてある。
    goalCurrency: 20000,
    // 全員500Gスタート（主人公・お肉・クエ・Q共通）。ここは4人とも完全に
    // 同額で、キャラによる開始時の有利不利を作らない。お札の初期値が全属性
    // 3G（相場の下限）、土地も全マス無属性なので、開幕は「安い札を仕込む」か
    // 「空き地に色を付ける」かの選択がそのまま資産の伸びを決める、という設計。
    startingCurrency: 500,
    heroAllianceId: 'gold',
    enemyAllianceId: 'audit',
    boardDialogue: true,
    overlaySpeakerSides: {
      主人公: 'right',
      'お肉': 'right',
      クエ: 'left',
      Q: 'left',
    },
    intro: [
      { speaker: '???', text: '海上都市をあとにした主人公は、豪華客船に乗って王都へ向かっていた。潮風の気持ちいい甲板で、見覚えのある顔と鉢合わせる。' },
      { speaker: 'クエ', text: 'キサマは！！なんでこんなとこにおるんや！！' },
      { speaker: '主人公', text: 'お前こそなんでいるんだよ！' },
      { speaker: 'クエ', text: 'この船はワイの船や！キサマのような下賤の出が乗れるもんやないぞ！！' },
      { speaker: '主人公', text: 'いや、下賤の出ってお前も魚やんけ！！' },
      { speaker: 'クエ', text: 'フン、ワイはハタ類の王、クエや。高級魚や。キサマのようなどこにでもいる魚とは「格」が違うんや。ホラ、さっさと降りろ。' },
      { speaker: '主人公', text: 'はぁ！？こっちも金払ってんだよ！！お前、自称資本主義の権化なら、契約事くらい守れよ！！' },
      { speaker: 'クエ', text: 'この世はワイがルールや！！力ずくでも追い出してやる！！' },
      { speaker: '主人公', text: 'またボコボコにすんぞ！？' },
      { speaker: 'クエ', text: 'チッチッチッ。今回は「先生」がワイにはついちょるからな。' },
      { speaker: '主人公', text: '先生？どんなやつだ？' },
      { speaker: 'クエ', text: 'Q先生！！コイツやっちまいやしょう！' },
      { speaker: 'Q', text: 'おやおや。先日遊んだお魚さんではないですか。' },
      { speaker: '主人公', text: 'あ！！電車マニア！！' },
      { speaker: 'Q', text: 'なにを隠そう、私がクエりんの先生、Qです' },
      { speaker: '主人公', text: '先生ってなんだよ！！' },
      { speaker: 'Q', text: '先生は先生です。それ以上でもそれ以下でもありません。では、しばきますよ？' },
      { speaker: '主人公', text: '無茶苦茶だっ！！' },
      { speaker: '???', text: '騒ぎを聞きつけて、船底の食堂からお肉がのそりと出てきた。' },
      { speaker: 'お肉', text: 'なんや騒がしいなあ。……お、主人公やんけ。なんかおもろい事しとるん？' },
      { speaker: '主人公', text: 'お肉！ちょうどいい、二対二だ、手を貸してくれ！' },
      { speaker: 'お肉', text: 'ええで。船賃のぶんくらいは働いたるわ。' },
      { speaker: 'Q', text: '結構。では二対二、正式な対戦ダイヤを組みましょう。' },
      { speaker: '???', text: '王都を目前にした豪華客船の甲板で、下船を賭けた勝負が始まった。目標は同盟合わせて総資産20,000G！' },
    ],
    outro: [
      { speaker: 'クエ', text: 'ハァ……ハァ……なんでや……先生までついとったのに……。' },
      { speaker: 'Q', text: '私の見立てが甘かったようです。帰りのダイヤは組み直します。' },
      { speaker: '主人公', text: 'で、俺は降りなくていいんだよな？' },
      { speaker: 'クエ', text: '……好きにせえ。次の港までや。次の港までやからな！' },
      { speaker: 'お肉', text: 'ワイの船賃も込みでええか？' },
      { speaker: 'クエ', text: '図々しいわ！！' },
      { speaker: '???', text: '甲板に潮風が戻ってくる。豪華客船はそのまま、王都へ向けて進んでいった。' },
    ],
    ally: {
      name: 'お肉',
      color: 0x8e5ce6,
      deckKey: 'oniku',
      theme: { elements: [Element.FOREST, Element.FIRE] },
    },
    opponents: [
      {
        name: 'クエ',
        color: 0xc0c0c0,
        deckKey: 'queKessan',
        theme: { elements: [Element.THUNDER, Element.NEUTRAL] },
        // 高速周回・お札の買い占め特化（aiProfile.ofudaStyle:'fixer' +
        // lapRacer）。⑫と同じ経済エンジンを、コンビ戦用に少し積極化する。
        // Qとの役割分担: Qの属性（雷）のお札を最優先で買い集め、
        // 値上がっても手放さず溜め続ける（ofudaAllyPumpElements）。
        // Qが仕込み具合を見て土地を上げると、この保有分がまとめて跳ね上がる。
        // 戦闘は徹底して避ける(minWinProbabilityToInvade/itemGambleChance)。
        // Gは侵略ではなくお札に回すのが仕事なので、空き地には最強ではなく
        // 「最安の同属性」を置いて数だけ稼ぐ(scatterSummons)。
        aiProfile: {
          lapRacer: true,
          scatterSummons: true,
          minWinProbabilityToInvade: 0.95,
          itemGambleChance: 0,
          highValueAvoidance: 0.9,
          ofudaAllyPumpElements: [Element.THUNDER],
          // 対抗買い: 雷を初めて買った次の取引機会に一度だけ、主人公側の
          // デッキで一番多い属性のお札を20枚買う。相手が土地を育てるほど
          // その属性の相場が上がるので、敵の成長を含み益に変える保険。
          // 相手のデッキでも雷が一番多いなら寄り道せず雷を買い続ける。
          counterOfudaBuy: { sheets: 20 },
          // 同盟の盤上モンスターが8体に達したら、無属性のままの自陣を
          // 放電で一気に雷へ塗り替える（＝仕込んだお札が値上がりし、
          // Qの土地レベルアップと雷神の連鎖ボーナスが同時に立ち上がる）。
          neutralRepaintAfter: 8,
        },
      },
      {
        name: 'Q',
        color: 0xc62828,
        deckKey: 'qKessan',
        theme: { elements: [Element.THUNDER] },
        // 「土地をあげていく」純粋な籠城型。侵略はほぼ放棄し、聖域・不死鳥・
        // アリジゴク・火口の不動明王で固めた土地の通行料とレベルで資産を積む。
        // クエとの役割分担(levelPumpSignal): クエが雷のお札を
        // 25枚集めたらLv2まで、50枚集めたら上限を外して一気に注ぎ込む。
        // 地価が跳ねると同時にクエの保有お札も値上がりする、狙って作る
        // タイミングの一致。単一の高い閾値だと合図が来ないまま試合が
        // 終わることが多かったため、2段階へ分けて確実に効かせる。
        aiProfile: {
          minWinProbabilityToInvade: 0.85,
          itemGambleChance: 0.1,
          highValueAvoidance: 0.85,
          offElementSummonChance: 0.05,
          scatterSummons: true,
          // 1のダイスで主人公の足を止める。ほかのCPUを狙って同盟戦の駆け引きを
          // 崩さないよう、人間プレイヤーを優先する。
          diceHarassHuman: true,
          // 聖域はアリジゴク対策として温存する。相手が関所（強制停止＋通行料）
          // を張ってきたら聖域を上書きして通行料をゼロにし、関所を無力化する。
          // 相手の山札・手札にアリジゴクが残っている間は自陣には使わない。
          sanctuaryCounterForcedStop: true,
          neutralRepaintAfter: 8,
          counterOfudaBuy: { sheets: 20 },
          levelPumpSignal: {
            allyName: 'クエ',
            elements: [Element.THUNDER],
            toLevel2: 25,
            unleash: 50,
          },
        },
      },
    ],
    replay: {
      intro: [
        { speaker: 'クエ', text: 'また甲板に上がってきよったな。今度こそ叩き出したる。' },
        { speaker: 'Q', text: '今回の目標は22,000Gです。長い航海になるほど、私たちに分があります。' },
        { speaker: 'お肉', text: '望むところや、何回でも相手したるわ！' },
      ],
      outro: [
        { speaker: 'クエ', text: '……また負けか。おかしいな、今度こそ完璧なはずやったのに。' },
        { speaker: 'Q', text: '記録しておきます。次のダイヤ改正で修正します。' },
      ],
      // 長期戦ほど相場と周回が効く敵側有利の条件で、再戦を本気の決算戦にする。
      goalCurrency: 22000,
    },
  },
  {
    key: 'royal-guard',
    title: '⑭ 王都の番人？？',
    format: '1vs1',
    goalCurrency: 15000,
    startingCurrency: 500,
    boardDialogue: true,
    overlayNpc: '塞ぎ込んだ男',
    overlaySpeakerSides: {
      主人公: 'right',
      '塞ぎ込んだ男': 'left',
    },
    intro: [
      { speaker: '主人公', text: '長い船旅だった、ここが王都か。・・・ん？' },
      { speaker: '???', text: '目の前には、黒ずくめの男が塞ぎ込んでいる。' },
      { speaker: '主人公', text: '（なんかやばそうなヤツだな、さっさと通り過ぎよう。道が狭いな・・・）' },
      { speaker: '???', text: 'ぎゅ' },
      { speaker: '主人公', text: 'ｷﾞｮｯ' },
      { speaker: '塞ぎ込んだ男', text: '俺は、神だ' },
      { speaker: '主人公', text: '（離せよ！！ヒレを掴むな！！）' },
      { speaker: '塞ぎ込んだ男', text: 'ルールは俺が決める' },
      { speaker: '主人公', text: 'やめてください' },
      { speaker: '塞ぎ込んだ男', text: 'お前も俺を無視するのか？ぶっ殺すぞ？' },
      { speaker: '主人公', text: 'やめてください' },
      { speaker: '塞ぎ込んだ男', text: 'ケリをつけよう' },
      { speaker: '主人公', text: 'いやぁぁぁぁぁぁぁ' },
    ],
    outro: [
      { speaker: '塞ぎ込んだ男', text: '神に勝つとは、お前やるな。ライバルとして認めてやる。' },
      { speaker: '主人公', text: '結構です。' },
      { speaker: '???', text: 'ぎゅ' },
      { speaker: '主人公', text: 'ｷﾞｮｯ！！！' },
    ],
    opponents: [
      {
        name: '塞ぎ込んだ男',
        color: 0x28202f,
        deckKey: 'fusagikonda',
        theme: { elements: [Element.NEUTRAL, Element.THUNDER, Element.FOREST] },
        aiProfile: {
          scatterSummons: true,
          diceHarassHuman: true,
          offElementSummonChance: 1,
          // 相手のデッキにアリジゴクがある間は毒霧を温存し、使い切ってから
          // 通常運用に戻す（_cpuMaybeUsePoisonSpell, game.js）。
          poisonMistCounterAntlion: true,
          // サイコキネシスは敵地のアリジゴク(forcedStopCursed)を最優先で狙う。
          // 守備モンスターを引き剥がせばその土地は空き地に戻り罠が無力化する
          // （_cpuMaybeUsePsychokinesisSpell, game.js）。無ければ通常どおり
          // 高額地優先。
          psychokinesisTargetAntlion: true,
        },
      },
    ],
    replay: {
      intro: [
        { speaker: '塞ぎ込んだ男', text: '……また来たのか。今度こそ、カード全部おいていけ。' },
        { speaker: '主人公', text: 'そこを通るたびに絡まれるのかよ。さっさと終わらせるぞ！' },
      ],
      outro: [
        { speaker: '塞ぎ込んだ男', text: '……また灰になった。' },
        { speaker: '主人公', text: 'その作戦一本で来る根性だけは認めるよ。' },
      ],
      goalCurrency: 17000,
    },
  },
  {
    key: 'kawada',
    title: '⑮ 是々非々のマーモット（自称）',
    // board.jsにid:'kawada'の専用マップを追加済み（8×8の外周ループ、
    // 火水雷森が各6マスの真四角、お札あり）。背景・川田の立ち絵・盤面駒も
    // 実装済み。マップ自体はwip:trueでPvPの対戦モードマップ選択からは
    // 除外中（board.js参照）。
    format: '1vs1',
    goalCurrency: 13000,
    // 2026-08、シミュレーションでのバランス調整（CLAUDE.md「⑮の勝率
    // シミュレーション結果」参照）。両者700Gスタート。
    startingCurrency: 700,
    intro: [
      { speaker: '???', text: '塞ぎ込んだ男から命からがら逃げ出した主人公は、気づけば見知らぬ裏路地に迷い込んでいた。' },
      { speaker: '主人公', text: 'ハァ…ハァ…なんとか撒いたか…？ここ、どこなんだ…' },
      { speaker: '???', text: '路地の奥から、聞き覚えのない声がかかった。' },
      { speaker: '川田', text: 'こっちだ。' },
      { speaker: '???', text: '突然現れたビーバーに手を引かれ、主人公は路地裏のアジトへ連れて行かれた。' },
      { speaker: '川田', text: 'お前、見ない顔だな。塞ぎ込んだ男と揉めたのか？アイツとは関わっちゃいけない。' },
      { speaker: '主人公', text: '俺は主人公。魚群の王になる魚だ。' },
      { speaker: '川田', text: 'ほう？　大きく出たな。田舎魚は怖いもの知らずとはこのことか。俺は川田、レジスタンスのリーダーだ。しがないマーモットだが、裏社会に精通している。王政に疑問を抱き、同志を集めて抵抗する者。' },
      { speaker: '主人公', text: 'マ、マーモッ…？' },
      { speaker: '川田', text: 'そこまでだ。お前は目の前のものしか見えていないな。そんなことじゃ王には勝てないぞ。して、お前は王になってどうするつもりだ？' },
      { speaker: '主人公', text: '？　考えたこともない。それは王になってから考える。' },
      { speaker: '川田', text: '……フッ。面白いやつだ。本当に王の器か、俺が見定めてやる！！' },
    ],
    outro: [
      { speaker: '川田', text: '……負けたか。理由も持たん奴に、な。' },
      { speaker: '主人公', text: '理由なんて後付けでいいだろ。強ければ勝つし、勝てば考える暇もできる。' },
      { speaker: '川田', text: 'それも一つの筋か。俺は是々非々だ。王政にも、レジスタンスにも、お前にも肩入れはしない。筋が通っている方につくだけだ。' },
      { speaker: '川田', text: '……ただし、な。玉座に近づくほど、筋というものが通らなくなっていく。心しておけ。' },
      { speaker: '主人公', text: '（コイツ、何か知ってそうだったな……）' },
    ],
    opponents: [
      {
        name: '川田',
        color: 0x4a6d8c,
        deckKey: 'kawada',
        theme: { elements: [Element.WATER] },
      },
    ],
  },
  {
    key: 'chinu',
    title: '⑯ 魚群の王チヌ',
    // 主人公 vs ウサギン・ムール・邪神ヒトデマソ。
    // **下僕3体は1チーム（同盟）**、主人公は単独（ユーザー指定 2026-09-01
    // 「3vs1でCPU同士は同盟。主人公圧倒的不利」）。
    // ⚠️ この構成では総資産が同盟内で合算される（`_totalAssetsOf`）ため、
    // 敵側は3人ぶんの資産で目標5,000Gへ届く＝主人公の3倍速で伸びる。
    // 「圧倒的不利」はこれで作っている。決着が早すぎると感じた場合に
    // 触るのはgoalCurrencyであって、この同盟設定ではない。
    format: '3vs1',
    heroAllianceId: null,
    enemyAllianceId: 'chinu',
    goalCurrency: 5000,
    // ⚠️ **絶対敗北にはしない**（2026-08ユーザー指定）。勝てば下の隠し
    // メッセージ(outro)が出る。難度は敵3体の専用デッキ（chinuUsagin等）
    // と人数差だけで作り、勝利を握り潰す仕掛けは入れない。
    // 負けてもクリア扱いにして⑰へ進める（clearOnDefeat）。
    clearOnDefeat: true,
    // 主人公は最後に行動する（ユーザー指定）。
    heroGoesLast: true,
    // 盤面開始時の大バナー（2行）。
    eventBattleBanner: ['イベントバトル！！', '何があっても諦めるな！'],
    // 盤面途中の割り込み会話。CPUの誰か1人の総資産が4,000G（目標の8割）へ
    // 届いた時点で1回だけ発火する（game.jsの_maybeTriggerStoryAssistEvent）。
    // ⑪のmidBattleAssistと違い味方は参戦しない＝会話だけ。
    midBattleEvent: {
      enemyAssetsAtLeast: 4000,
      overlay: { leftName: '魚群の王', rightName: '主人公' },
      lines: [
        { speaker: '魚群の王', text: 'フハハハハハ！！無様よのう。力のない者は何も成し遂げられないのだよ。' },
        { speaker: '主人公', text: 'こんなの無茶苦茶だ！！' },
        { speaker: '魚群の王', text: 'その程度でよくもまぁワイに噛みついてきたものよ。身の程知らずにはお似合いの身分をプレゼントしてやる。楽しみにしておれ' },
        { speaker: '主人公', text: 'ぐぬぬ…' },
      ],
    },
    overlaySpeakerSides: {
      主人公: 'right',
      '魚群の王': 'left',
    },
    intro: [
      { speaker: '主人公', text: '川田が教えてくれた抜け道で、無事王の間まで辿りつけたぞ。…ん？謁見申請書？' },
      { speaker: '暗・少女A', text: '謁見を希望される方はこちらにお名前をご記入ください' },
      { speaker: '主人公', text: 'や、やけにやさぐれた受付だな。えーと、俺の名前をここに書くだけか。主人公、っと。' },
      { speaker: '暗・少女A', text: 'お通りください' },
      { speaker: '主人公', text: 'え！？こんだけ！？' },
      { speaker: '暗・少女A', text: 'はい。' },
      { speaker: '主人公', text: 'ま、まぁええか。セキュリティ、ザルやな…' },
      { speaker: '???', text: 'お前が主人公か。' },
      { speaker: '主人公', text: 'あんたが魚群の王か' },
      { speaker: '魚群の王', text: 'いかにも。ワイが魚群の王、チヌである' },
      { speaker: '主人公', text: '俺は王になりにきた。' },
      { speaker: '魚群の王', text: 'キサマのような田舎魚が王になる…？妄言を。現実をわからせやる。いでよ、下僕達よ！！' },
      { speaker: 'ウサギン', text: 'は。' },
      { speaker: 'ムール', text: '参上致しました' },
      { speaker: '邪神ヒトデマソ', text: '逃ゲロ…逃ゲテ…' },
      { speaker: '主人公', text: 'ウサギン！？ムール！？ヒトデまで！！' },
      { speaker: '魚群の王', text: 'キサマごとき、ワイの手を煩わせるほどでない。虫ケラ、いや魚ケラよ！！' },
      { speaker: '主人公', text: 'てめぇきたねーぞ！！' },
      { speaker: '魚群の王', text: '夢？友情？努力？…そんなものは全てワイが否定する。「力」の差を思い知るがいい、雑魚よ。自身の無力を悔いて、底辺に甘んじるがいい。キサマのヒレはワイには届かない。さあゆけ、下僕共。' },
      { speaker: 'ウサギン', text: '御意。全てのフェ◯ニストは俺が駆逐する。' },
      { speaker: '主人公', text: 'ちがうんだが！？' },
      { speaker: 'ムール', text: '固定資産税、払ってくださいね。' },
      { speaker: '主人公', text: 'アーアー聞こえない！！' },
      { speaker: '邪神ヒトデマソ', text: 'うぎょぎょぎょぎょ…' },
      { speaker: '主人公', text: 'ヒトデ、待ってろ。俺が今、楽にしてやる' },
    ],
    // 敗北時（想定される通常の結末）。再生後に画面が暗転してクリア扱いになる。
    defeatOutro: [
      { speaker: '魚群の王', text: '…フン。余興にもならなかったな。おい、お前ら、そこの負け犬を地下にぶちこんどけ' },
      { speaker: '主人公', text: 'うわぁ！近づくな！！やめろ！やめてくれ！！らめええええ' },
    ],
    // 勝ってしまった場合の隠しメッセージ。⚠️ **仮実装中はメッセージだけで、
    // EXカードは実際には配らない**（ユーザー指定）。配る時はmain.jsの
    // handleStoryBattleEnd側に付与処理を足すこと。
    outro: [
      { speaker: '???', text: 'こんなのクリアするなんて◯チガイですか？暇なんですか？' },
      { speaker: '???', text: 'EXカードを全て1枚ずつ手に入れた' },
    ],
    opponents: [
      {
        name: 'ウサギン',
        color: 0xe63946,
        deckKey: 'chinuUsagin',
        theme: { elements: [Element.FOREST] },
      },
      {
        name: 'ムール',
        color: 0x3949ab,
        deckKey: 'chinuMuuru',
        theme: { elements: [Element.WATER] },
      },
      {
        name: '邪神ヒトデマソ',
        color: 0x6a1b2a,
        deckKey: 'chinuHitodemaso',
        theme: { elements: [Element.NEUTRAL] },
      },
    ],
  },
  {
    key: 'roudou',
    title: '⑰ 海底労働施設',
    format: '2vs2',
    // 同盟合算の目標（_totalAssetsOfはチーム合算）。本編で現行最高。
    goalCurrency: 24000,
    heroAllianceId: 'red',
    enemyAllianceId: 'white',
    ally: {
      name: '川田',
      color: 0x4a6d8c,
      // ⑮の`kawada`をそのまま流用（ユーザー指定「川田はそのままで仮実装して」）。
      deckKey: 'kawada',
      theme: { elements: [Element.WATER] },
    },
    intro: [
      { speaker: '???', text: '劣悪な岩穴。囚人たちは鞭の下で、来る日も来る日も藻を採取させられていた。' },
      { speaker: '主人公', text: 'はぁ、はぁ。今日のノルマまであと15往復…' },
      { speaker: '???', text: 'おい、主人公。タラタラやってんじゃねえぞ！！' },
      { speaker: '主人公', text: 'ヒッ、係長！！申し訳ありません…' },
      { speaker: 'マダイ係長', text: 'チャキチャキやれ！！ノルマ分を納めないと看守にしばかれるぞ！！' },
      { speaker: '主人公', text: 'は、はい。急ぎます' },
      { speaker: 'マダイ係長', text: '無茶はすんなよ。いつここから出られるかはわかんねえが、俺だって真面目にやってるんだ。チクショウ、チヌの野郎…' },
      { speaker: '主人公', text: '（俺は…もうダメだ…チヌに逆らわず、田舎で遊んでりゃ良かった）' },
      { speaker: '主人公', text: '（いつになったら出られるんだろう…はらへった…）' },
      { speaker: '???', text: '随分と、しょぼくれた顔になったじゃないか。' },
      { speaker: '主人公', text: 'だれだっ！！…川田？お前もここに居たのか！' },
      { speaker: '川田', text: 'なんだ、まだ死んでないじゃないか。俺はお前を手引きした罪でしょっ引かれたよ。' },
      { speaker: '主人公', text: '俺のせいで…面目ねぇ…' },
      { speaker: '川田', text: 'いや、かえって好都合だがね。ここに来る必要があったから。' },
      { speaker: '主人公', text: 'どういう意味だ？' },
      { speaker: '川田', text: 'ここには、仲間が、たくさんいる。お前が掘ってる岩の向こう側だけどな。' },
      { speaker: '主人公', text: '岩の向こう…？　毎日削ってたのに、気づきもしなかった' },
      { speaker: '主人公', text: 'どうするつもりだ？' },
      { speaker: '川田', text: '決まっているだろう。仲間と結託し、海底労働施設を壊す。チヌの力の源泉はここから生み出されるＧだ。ほれ、どいてろ。ちょいちょいっとな。' },
      { speaker: '主人公', text: 'お、おい！　何する気だ！？' },
      { speaker: '主人公', text: '岩が崩れた！！' },
      { speaker: '川田', text: '俺は今から暴れてくる。お前も来るか？' },
      { speaker: '主人公', text: 'あたりまえだっ！！' },
      { speaker: '???', text: '囚人達は一斉に蜂起した！！' },
      { speaker: '???', text: '随分と騒がしいですね。' },
      { speaker: 'ムール', text: 'おや、また貴方達ですか。懲りないですね。' },
      { speaker: '主人公', text: 'てめぇ！！今度こそやってやる！！' },
      { speaker: 'ムール', text: 'フフフ、何度やっても無駄ですけどね。そうそう、面白い人が仲間に加わったんですよ。' },
      { speaker: '川田', text: '誰だ？' },
      { speaker: 'ムール', text: 'ダンボールさん、この者達を始末しなさい' },
      { speaker: 'ダンボール男', text: 'ぐ…俺が…殺る…' },
      { speaker: '主人公', text: 'ダンボール男まで…！！チヌの野郎、許せねえ！！' },
      { speaker: 'ムール', text: '私達2人相手に貴方達で勝てますかね？身の程を教えてあげましょう' },
    ],
    outro: [
      { speaker: 'ダンボール男', text: 'おれ　は　しょうき　に　もどった　のか！？' },
      { speaker: '主人公', text: '知らねえよ！！元ネタが古いんだよ！！' },
      // ⚠️「主人公」は丸括弧を付けずそのまま書く。withHeroName(main.js)が表示直前に
      // プレイヤーのキャラ名へ置換する（⑬でお肉が「お、主人公やんけ」と呼ぶのと同じ）。
      { speaker: '川田', text: 'レジスタンスの解放にご協力ありがとう。主人公はチヌのもとに行くんだろう？配下は俺たちに任せろ。' },
      { speaker: 'ムール', text: '...やれやれ。あなた達では王には勝てないでしょうけど、がんばってください。' },
      { speaker: '主人公', text: '止めないのか？' },
      { speaker: 'ムール', text: '私は『プロ』として職務を全うしたまでです。ルールはルールであり、それ以上でも以下でもない。それが私の正義。' },
      { speaker: '主人公', text: 'ムールらしいな。' },
      { speaker: 'ムール', text: 'あなたの延滞税はどんどん加算されてますけどね' },
      { speaker: '主人公', text: '！？！？！？' },
    ],
    opponents: [
      {
        name: 'ムール',
        color: 0x3949ab,
        deckKey: 'roudouMuuru',
        theme: { elements: [Element.WATER] },
      },
      {
        name: 'ダンボール男',
        color: 0x8d6e63,
        deckKey: 'roudouDanball',
        theme: { elements: [Element.NEUTRAL, Element.THUNDER, Element.FIRE] },
      },
    ],
  },
];

export function isStageUnlocked(character, index) {
  // 制作中のステージ(wip)は進行度に関係なく常にロック。
  if (STORY_STAGES[index]?.wip) return false;
  return index <= (character.storyProgress || 0);
}

/** 制作中で未公開のステージか（一覧の表示文言を分けるために使う）。 */
export function isStageWip(index) {
  return !!STORY_STAGES[index]?.wip;
}

export function isStageCleared(character, index) {
  return index < (character.storyProgress || 0);
}
