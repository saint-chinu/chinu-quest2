# チヌクエスト2 (chinu-quest2)

Culdcept／桃鉄風の3Dボード×カードゲーム。魚群の王を目指す魚が旅する
ストーリーモード＋CPU戦＋オンライン対人戦(PvP)。

## Stack / deploy
- Vite + Three.js + Firebase(Auth/Firestore) + PWA。
- GitHub Pages へ `.github/workflows/deploy-pages.yml` が **`master` ブランチ**から
  自動デプロイ。masterへpushするとデプロイが走る。
- Service Worker (`public/sw.js`) の `CACHE_NAME` を**毎デプロイbumpする**
  （現在 `chinuquest2-v246`）。bumpしないと古いJS/CSSがキャッシュから配信される。
- ビルド確認: `npx vite build`。

## 未実装: Firebase App Check
- Web版のFirebase App Check（reCAPTCHA Enterprise）は未設定。現在はSecurity Rulesと
  Firebase Authenticationでアクセスを制御しているが、不正クライアントからの
  Firestore/対戦ルームへの大量リクエストをApp Checkでは弾けない。
- 導入時はreCAPTCHA EnterpriseのWebキーを発行し、Firebase Consoleの
  Security > App CheckでWebアプリを登録する。GitHub ActionsのSecretへ
  `VITE_FIREBASE_APPCHECK_SITE_KEY`として登録してからデプロイする。
- 先にApp Checkのリクエスト指標を監視し、正規プレイヤーのトークン送信を確認してから
  Firestore等のenforcementを有効化する。キー未設定のまま強制化してはいけない。

## 未実装カード構想（メモ）
まだ実装しない、構想段階のカードアイデアを置いておく場所。実装する時はここから
外し、対応するカタログファイルとCLAUDE.mdの該当セクションへ書き起こす。

（現在、構想段階のカードはありません。オートコマンダーは「くぐつの剣豪」として
実装済み＝下記「新カード『くぐつの剣豪』」参照）

## 新ストーリー「川田」(⑮、実装済み・プレイ可能。仮公開扱い)
⑭「王都の番人？？」の次、王都に入った直後のステージ⑮`key:'kawada'`。
**ステージ本体（intro/outro会話・opponents・デッキ・新アイテム・専用マップ）は
実装済みでプレイ可能**。story.js側の`wip`ロックは外してあり、⑬⑭と同じ
「（仮公開）」のタイトル表記のみ（背景画像等の素材待ち、下記「残っている
不足分」）。

### キャラクター設定・確定ダイアログ
- **川田**: ビーバーだが本人はマーモットだと信じて疑わない。「俺は是々非々だ」
  が口癖の生真面目な議論好き。王都のレジスタンス所属で王政に懐疑的。
  口調は標準語寄り（「俺は」「〜だ」）。対する主人公はこの場面だけ
  「ワイは」「〜や」寄りの口調（story.js`kawada`のintro/outro参照、
  ユーザー指定の口調）。
- **導入**: ⑭で塞ぎ込んだ男から命からがら逃げた主人公が裏路地に迷い込み、
  川田に「こっちだ。」と手を引かれてアジトへ。「塞ぎ込んだ男とは関わるな」
  と忠告される。主人公が「ワイは（プレイヤー名）。魚群の王になる魚だ」と
  名乗ると、川田は「大きく出たな」と茶化しつつ自己紹介（レジスタンスの
  リーダー、しがないマーモット、裏社会に精通、王政に疑問）。主人公が
  「マ、マーモッ…？」と口を挟もうとすると制止し、「王になってどうする
  つもりだ？」と問う。「王になってから考える」という答えに「面白いやつだ。
  本当に王の器か、俺が見定めてやる！！」と対戦開始（**純粋な殴り合い**＝
  1vs1、専用の妨害トリック無し、というユーザー要望を反映）。
- **対戦後**（プレイヤー勝利想定）: 川田は是々非々の立場を明言（王政にも
  レジスタンスにも主人公にも肩入れしない）しつつ、「玉座に近づくほど筋が
  通らなくなる」と示唆——これは次の展開（下記）への伏線。レジスタンス
  所属＝反王政という立場上、後のステージで再登場させて主人公の味方に
  回す扱いが自然（地下労働施設での再会・脱獄協力など）。
- 実際の台詞・演出順（narration含む）はstory.js`STORY_STAGES`の
  `key:'kawada'`エントリそのものを参照（このメモはあらすじ）。

### この後に続く展開（川田のさらに後）
- 川田のステージの後、主人公は魚群の王チヌ（新キャラ、既存の「魚群の王」
  という主人公自身の目標称号を現に名乗っている人物）と謁見する。
- こじれて王の特権を発動され、**ウサギン・ムール・チヌの3人がかり（1vs3）**
  になる。ウサギン・ムールは既存の再登場キャラ（story.js参照、ウサギンは
  ⑦②系、ムールは⑨税務調査官）。
- **これは負けが前提の強制敗北バトル**（1vs3、意図的に不利な構成）。負けると
  ストーリーが進み、主人公は**地下労働施設に閉じ込められる**。
- ここもまだ何一つコード化していない（story.js未着手）。上の川田のステージ
  より後に着手する前提で、このメモだけ残す。

### 新アイテム「属性神の盾」4種（実装済み）
- `suijinNoTate`（水神の盾）/`kajinNoTate`（火神の盾）/`raijinNoTate`
  （雷神の盾）/`shinrinjinNoTate`（森神の盾）——battleCards.jsのITEM_CATALOG。
  いずれもR防具、**80G、ATK+10/HP+20、貫通**（2026-08、初期案の110G/
  ATK+0/HP+15はコストが高すぎるというユーザー指摘で修正）、
  `effect: {type:'wielderElementReflect', wielderElement: <対応する属性>}`。
- ATK+10/HP+20・貫通は属性を問わず常に乗る。装備するモンスターの属性が
  一致した時だけ、`equipItem`（battle.js）が効果を実際の反射
  (`reflectDamage`、くねくねと同じ全反射)へ差し替える。一致しない場合は
  反射だけが乗らない（ステータス・貫通は変わらず有効）。
- ⚠️ **`reflectDamage`の判定をgetEffect経由に変更した**（battle.js）。
  以前は`defenderUnit.def.effect?.type==='reflectDamage'`とモンスター
  自身のdefしか見ておらず、アイテム由来の反射（この属性神の盾）を
  拾えなかった。`getEffect(defenderUnit,'reflectDamage')`に変えることで
  def由来(くねくね)・item由来(属性神の盾)の両方を同じ判定で拾える。
- 画像は**未実装**（`imageDataUrl: null`、cardArt.jsの共通防具絵へ
  フォールバック）。4枚とも専用画像が必要——Codexが対応できるならここが
  「画像」の不足分。
- 回帰テストは`npm run test:cards`（水属性一致で反射・不一致でもATK+10/
  HP+20・貫通は乗ること・火/雷/森3種の一般化）。

### 川田の専用デッキ（実装済み、`CHARACTER_DECKS.kawada`）
water中心・専用モンスター無し・「純粋な殴り合い」の40枚固定デッキ。
内訳と設計意図はbattleCards.jsの`kawada`エントリのインラインコメント参照。
概要:
- **モンスター21**: アイランドホエール×2(成長型の壁)・ゆきおんな×3
  (全水属性ATK+30オーラ+先制)・半魚人×2(先制アタッカー)・
  リャンメンすくな×3(2回攻撃、オーラで実質倍化)・関所クラゲ×1・
  嵐を呼ぶ〇女×1(素50/50の高火力、攻撃時1/2で自傷10)・水風呂修行僧×1
  (連鎖1、対Rarity.R+40%ATK)・ビッグマーメイド×1・水神×1(水連鎖×7)・
  くぐつの剣豪×3(自動侵略、無属性だが採用)・混沌の頭×2(全連鎖×5)・
  くねくね×1(反射)。（2026-08、ユーザー指摘でファイヤーマン・まんぼーを
  嵐を呼ぶ〇女・水風呂修行僧へ差し替え。リャンメンすくなを2→3に増量）
- **アイテム11**: 水神の盾×3・異次元ソケット×2・ツインハンマー×2・
  真剣白刃取り×1・ナンカのお守り×1・ライフジャケット×1・不死鳥の剣×1
  (使用して効果発動時のみ手札に戻る、ダイヤモンドの盾から差し替え)。
  水神の盾は2→3に増量。
- **スペル8**: アイキャンフライ×2・バックファイア×2・放水×1・
  青色の魔法陣×1(デッキの水属性をランダム召喚)・占術×1・サイコキネシス×1
  (配置モンスターを1マス強制移動、game.js`_cpuMaybeUsePsychokinesisSpell`が
  owner/同盟/勝率だけで判断する汎用ロジックなのでCPUデッキでも死に札に
  ならない）。鋼体×2を撤去し占術を2→1へ減量した分をサイコキネシス追加に
  充てた。
- 回帰テストは`npm run test:cards`（`buildCharacterDeckList('kawada')`が
  ちょうど40枚であること）。AIプロファイル（story.jsのopponents[].aiProfile）
  は未設定——是々非々の気質（優勢なら畳みかけ、劣勢なら守りに回る、
  くらいの単純な切り替え）を検討する。

### ⚠️ ⑮の勝率シミュレーション結果（2026-08、要バランス調整）
`npm run simulate`でひなんじょのデッキ2（実プレイヤー、雷属性軸）と当てた
結果、**川田の勝率は約22〜31%**（各120試合: seed=1で21.7%、攻守入替で25.0%、
seed=7で30.8%）。席順バイアスでもシード依存でもない一貫した負け越し。
- ⚠️ **原因は「コストカーブ」ではない（初期の診断は誤りだったので訂正）。**
  `--start`を500G→1000G→2000Gと4倍にしても勝率は22.5%/21.7%とまったく動かず、
  土地も8.4〜8.8枚のまま＝**資金は律速ではない**。同様にビッグマーメイド120G→
  嵐を呼ぶ〇女100G、くぐつの剣豪1枚→逆流カジキ30Gへ差し替えてカーブを下げても
  21.7%/25.8%で変化なし。
- **真因は1Gあたりのステータス効率**。盤面は24マスで飽和する（8.4+14.4≒24）
  ので、勝敗を決めるのは「買えるか」ではなく「同じGでどれだけ戦闘に勝てるか」。
  - 川田: モンスター21体 合計ATK+HP 1335／合計1670G ＝ **0.80 pts/G**
  - ひなんじょ: 21体 合計1290／1165G ＝ **1.11 pts/G**（約39%効率が上）
  - ひなんじょはエレキ輝30G 30/30(2.00)・Ninja 50G 40/40(1.60)・テンホウ/
    サンダーバード50G 30/30(1.20)と1.20 pts/G以上を16枚積む。川田側で対抗
    できるのは逆流カジキ(2.00)とアイランドホエール(1.63)だけで、くぐつの剣豪
    150G(0.67)・混沌の頭150G(0.40)・水神150G(0.43)が平均を大きく下げている。
- **避雷針侍の侵略ロックが副次要因（+5.8pt相当）**。`_defenderProtectedBy
  LightningRod`は「所有者が避雷針侍を1体でも場に持っていれば、その人の他の
  全土地の侵略勝率を0とみなす」実装（game.js 6469行付近。
  `_estimateWinProbability`/`_estimateUnitBattleWinProbability`が即0を返す）。
  ひなんじょは2枚積むためCPU川田がほぼ侵略しなくなる。避雷針侍2枚をテンホウ
  2枚（同50Gで格上の30/30）へ置換すると川田は21.7%→**27.5%**へ上昇した。
- **川田のデッキ自体は壊れていない**。同じマップ・同条件で⑭塞ぎ込んだ男に
  当てると川田が**74.2%**で勝ち、土地も14.7枚 vs 4.9枚と圧倒する。
  ひなんじょのデッキが単に高効率なだけ。
- ひなんじょの「ブリモン」（自作ブリード合成モンスター）は実構成が不明なため
  上限級（無属性ATK70/HP60・245G・先制+貫通。`canEquipPart`で総当たりして
  求めた合法な最大構成——70/70+両特性はコスト上限250Gとパーツ9個制限により
  組めない）を仮定したが、**素体15/15へ差し替えても勝率21.7%で変化なし**＝
  この1枚は結論に影響しない。デッキは`tools/decks/hinanjo-deck2.json`。
- ⚠️ **これはCPU対CPUの数字**。実際の⑮は川田がCPU・主人公が人間なので、
  「人間が操作すればさらに勝ちやすい」＝**ステージが簡単すぎる可能性**を
  示す。ただし相手は実プレイヤー上位のデッキなので、この1本だけで難易度を
  判断しないこと。

#### ⚠️ 最大の要因は「土地獲得エンジンの非対称性」（2026-08、実ログで特定）
pts/Gの差よりこちらが本質。実ログの集計（4シード×1試合）:
- **ひなんじょのサンダーバード**(50G 30/30、×4枚): 土地コマンド90Gで
  **雷雲(30/30)をランダムな空き地へ召喚**＝戦闘なしで土地が増える。
  実測で1試合あたり平均7.5回発動し、これだけで土地13〜14枚に届く。
- **川田のくぐつの剣豪**(150G 50/50、×2枚): 自動侵略なので**戦闘に勝たないと
  土地が増えない**。相手のNinja(50G 40/40)等に勝てず、CPUが侵略を見送る回数は
  川田4.25回 vs ひなんじょ1.25回（**3.4倍**）。
- `summonMonsterOnEmptyLand`能力を持つのは**森のドリアードと雷のサンダーバード
  だけ**で、水属性には存在しない＝川田は構造的にこのエンジンを持てない。
- 検証: 混沌の頭2枚を**ドリアード**(森N・土地コマンド50Gで空き地にドリアード
  を自己増殖)へ差し替えると**21.7%→29.2% / 23.3%→40.0%**と初めて大きく動いた
  （土地9.3→10.5〜10.9枚）。3枚に増やしても32.5%/38.3%で頭打ちなので2枚で十分。
  **未適用**（森属性が水デッキのコンセプトに合うかはユーザー判断）。

#### 試した調整と効果
効率差(0.80 vs 1.11 pts/G)を狙った下記の調整はどれも勝率を動かせなかった。
効いたのは上記の展開エンジン追加だけ。

| 調整 | seed=1 | seed=7 |
|---|---|---|
| 調整前 | 21.7% | 30.8% |
| ビッグマーメイド→嵐を呼ぶ〇女、くぐつの剣豪1枚→逆流カジキ | 21.7% | 25.8% |
| ＋開始700G・川田が水お札20枚・アイキャンフライ→ファイヤーボール | 23.3% | 25.0% |
| ＋お札を15枚へ（現状） | 21.7% | 23.3% |
| （検証のみ・未適用）混沌の頭2→ドリアード2 | **29.2%** | **40.0%** |
| （検証のみ・未適用）さらに水神→ドリアード計3 | 32.5% | 38.3% |
| くぐつの剣豪120G×3・逆流カジキ撤去（土地神の怒り無し） | **28.3%** | **29.2%** |
| ＋土地神の怒り1枚・20ダメージ（混沌の頭2→1） | 22.5% | 20.0% |
| ＋土地神の怒りを15ダメージへ | 21.7% | 25.0% |
| 土地神の怒りを抜き、社会不適合1枚を採用 | **30.8%** | **30.8%** |
| ＋資本主義の権化1枚（混沌の頭を撤去） | 34.2% | 29.2% |
| ＋水神を撤去しアイランドホエール3枚目へ（現状） | 35.0% | 39.2% |

水神(150G)の撤去は4シード×120戦で **170勝/480(35.4%) vs 155勝/480(32.3%)**、
3/4のシードで改善。枠の候補は3案を同一シードで比較して選んだ:
アイランドホエール3枚目 37.1% ＞ 半魚人3枚目 34.6% ＞ 現状31.7% ＞
リャンメンすくな4枚目 30.0%（各2シード×120戦）。アイランドホエールは40Gで
1.63 pts/Gとデッキ最高効率。これでモンスター平均コストは73.7G→67.9Gになった。

#### 酢(su)は川田に入れられない（検証済み・不採用）
- `npcExclusive: true` かつ `exclusiveOwnerName: '朕'` なので、game.jsの
  デッキ構築フィルタ（`exclusiveOwnerName === cfg.name`）が**黙って除外する**。
  入れても川田は39枚デッキになる（実測: 41枚→川田40/朕41）。警告は出ない。
- 専用制限を一時解除して「くぐつの剣豪1枚→酢1枚」を測ると
  **135勝/480(28.1%)** と現状より4.2pt悪化。酢は300Gだが川田は決着時の
  所持Gが平均850G程度で慢性的に貧乏なため、ほぼ召喚できない。
  実績のある安い展開札(くぐつの剣豪120G)を出せない高級札と交換する形になる。

⚠️ 最後の行は**4シード×120戦で比較すると誤差の範囲**: 資本主義あり155勝/480
(32.3%) vs なし146勝/480(30.4%)で差は+1.9pt、差の標準誤差が約2.9ptなので
有意ではない。悪化はしておらず、構造的に欠けている「土地獲得エンジン」を
埋める札なので採用しているが、社会不適合のような明確な改善ではない。
資本主義の権化(EX30G `rewardOnly`)は召喚条件と生け贄を無視して手札の
モンスターを安い順に空き地へ連続召喚する。水連鎖1が要る水神/関所クラゲ/
水風呂修行僧を条件未達でも出せるのが噛み合っている。CPU判断は既存の
`_cpuMaybeUseCapitalismIncarnateSpell`（空き地2つ以上＋2体以上並べられる時）
がそのまま使え、実測で1試合3〜9回発動。`rewardOnly`はNPCデッキ構築では
除外されないのでそのまま持たせられる。枠は実測最低効率の混沌の頭
(150G 30/30 = 0.40 pts/G)を撤去して確保した。

#### 新カード「社会不適合」(shakaiFutekigou) — 実装済み・⑮に採用中
Rスペル70G `returnMismatchedMonstersToHand` target='enemyPlayer'。
**対象プレイヤーの配置モンスターのうち、立っている土地と属性が合わないものを
ランダムに最大2体、手札へ戻す**。土地神の怒り（ダメージ）と同じ「属性が
噛み合っていない」判定を、除去ではなく手札バウンスに使う対の1枚。
- 該当が1体なら1体だけ。**0体なら「対象がいなかった」と表示して終わり**
  （コストは戻らない＝撃ち損）。対象はランダム（ユーザー指定）。
- **手札上限を超える時は「1枚戻す→捨てる→もう1枚戻す→捨てる」の順**
  （ユーザー指定）。まとめて戻すと戻った2枚から好きな方を残せてしまうので、
  1体ごとに`_enforceHandLimit`を挟んで確定させている。
- 召喚時にカードは捨札へ行くので、不死鳥と同じく`_reclaimCardFromDeck`で
  1枚回収してから手札へ積む（回収しないとデッキの総枚数が増える）。
- CPUは`_cpuMaybeUseShakaiFutekigouSpell`で「**相手の属性違いが2体以上**
  配置されている時だけ」撃つ（ユーザー指定）。最も該当数の多い相手を選ぶ。
  実測で1試合あたり3回発動。
- **土地神の怒りと違い自分は巻き込まない**ため、無属性を多く積む川田でも
  デメリットが無い。⑮では21.7/25.0% → **30.8/30.8%** と過去最高かつ最も
  安定した数字になった（土地神の怒りを抜いただけの28.3/29.2%も上回る）。

#### 新カード「土地神の怒り」(tochigamiNoIkari) — 実装済み・⑮では逆効果
Rスペル60G `damageAllUnitsOnMismatchedLand` target='none'。
**自分の属性と異なる属性の土地にいる全モンスターに15ダメージ（自分のも対象）**。
- ⚠️ **ダメージを15から上げてはいけない**。ゾンビがちょうどHP20なので、20だと
  「パンデミックで全モンスターをゾンビ(無属性)化 → 無属性マスの無い盤面では
  全員が対象 → 盤面が丸ごと全滅」という150Gの即死コンボが成立する
  （2026-08、ユーザー指摘で20→15）。回帰テスト
  「土地神の怒りはパンデミック後のゾンビを全滅させない（コンボ防止の下限）」が
  `amount < ゾンビのHP` を強制するので、上げると必ず落ちる。
- ⚠️ **CPUは`target:'none'`の全体ダメージ系を一切詠唱しない**（小隕石・洪水も
  同じ死に札）。専用の`_cpuMaybeUseMismatchedLandDamageSpell`を追加して
  「①相手を自分より多く倒せる ②自分は無傷で相手だけ削れる」時だけ撃たせた。
  追加前は3試合で詠唱0回だった。
- ⚠️ **⑮では川田自身を強く巻き込むため勝率が約7pt下がる**（28.3/29.2% →
  22.5/20.0%）。kawadaマップに無属性マスが1つも無いので、無属性の
  **くぐつの剣豪×3・混沌の頭・くねくね**は常に該当して自爆する。
  くぐつの剣豪を3枚に増やした直後なので、主力エンジンを自分で削る形。
  カード自体は仕様どおり動作しており、**⑮のデッキとの相性が悪いだけ**。
  **2026-08、ユーザー判断で川田のデッキからは抜き、カードとしては残した**
  （代わりに下記の社会不適合を採用）。他の盤面・デッキ（単一属性で固めた
  構成や無属性マスの多いマップ）でなら強く働く。
- ⑭塞ぎ込んだ男戦は70.8%で悪影響なし（パンデミック持ち相手でも安全）。

- 初期資金は500G→1000G→2000Gと4倍にしても22.5%/21.7%で無反応（上記）。
- 開始700G＋水お札15枚は`story.js`の`startingCurrency`と
  `opponents[].startingOfuda`で指定。お札は`game.js`の`_applyStartingOfuda`が
  通常取引と同じ`_buyOfuda`で買うため、G支払い・5枚ロットの逐次約定・相場の
  押し上げまで実購入と同じ（実測: 開幕に約185Gで15枚）。
- ファイヤーボール(15ダメージ)は避雷針侍(HP15)・くねくね(HP10)をどちらも
  1撃で落とせる。`_cpuPickDamageTarget`はこの2種を総資産・土地レベルより
  優先して狙う（`INVASION_BLOCKER_IDS`）。**この優先度はCPU全体の共通変更**
  なので、他ステージのAIも同じ判断をする。実戦ログで発動を確認済み。

### 属性神の盾のCPU運用ロジック（2026-08、ユーザー指定を確認済み）
ユーザー要望「水属性なら装備、もしくは装備すれば絶対守れる状況なら異属性
でも装備。CPUは侵略の際は水属性なら反射効果込みで勝率計算」は、**新規の
特別分岐を書かずに既存の仕組みだけで既に満たされている**ことをテストで
確認した（`game.js`のCPU装備選択(`_chooseBattleItemByOutcome`)・侵略勝率
見積もり(`_estimateWinProbability`/`_estimateUnitBattleWinProbability`)は
どちらも「候補の装備を実際に`equipItem`→`resolveBattle`でシミュレートし、
結果が良くなる時だけ選ぶ」設計のため、一致属性の反射も、不一致でもHP+20が
致命傷を防ぐケースも、無条件で正しく評価される）。
- 唯一の実コード変更は`_itemPowerScore`（CPUの手札内アイテムを大まかに
  数値化するヒューリスティック）: 一致属性なら反射込みで高評価、不一致なら
  「effectがあれば+15」という汎用加点を付けない（実際には発動しない反射を
  過大評価しないようにするだけで、装備するかどうかの最終判断には影響しない
  ——最終判断は上記の実戦闘シミュレーションで決まる）。
- 回帰テストは`npm run test:cards`（`_itemPowerScore`の一致/不一致評価差・
  CPUの装備選択が一致属性で必ず装備/不一致で結果不変なら温存/不一致でも
  HP+20だけで守れるなら装備・侵略勝率見積もりが反射込みで負け筋を勝ち筋に
  変えること、の4テスト）。

### 川田の専用マップ（実装済み、`board.js`の`id:'kawada'`）
ユーザー指定「シンプルで、同属性マス3×2で6マスの通路が4本の真四角。
ただしお札がある」をそのまま反映。
- `KAWADA_ROWS`：8×8の外周だけのループ（内側は全部`.`＝マス無し、
  `HITODE_FIRST_ROWS`と同じ手法）。四隅がG(スタート)×1とC(CP)×3。
- 4辺それぞれが「3+3の同属性ペア」の6マス通路で、火→水→雷→森→火と
  一周する属性の輪（G/Cをまたいでも同じ属性同士が繋がるので、実質どの
  属性も6マスの連続した帯になる）。火水雷森が各6マスで完全に均等。
- `hasOfuda: true`でお札取引所を有効化（ユーザー指定）。
- マップ自体は`wip: true`のままPvPのマップ選択（`PVP_MAPS`）からは除外
  （story.js側の`wip`とは別物。ストーリーは既にプレイ可能）。
- 回帰テストは`tests/newCards.test.mjs`「ステージ15(川田)は専用マップ・
  会話・デッキへ正しく接続されている」（マップ実在・8×8・属性が各6マス・
  G1個C3個・`hasOfuda`・`stage.wip===undefined`を検証）。

### 残っている不足分（Codexが拾える範囲）
- **背景画像**（`/images/stage/stage15-kawada-alley.png`、まだファイル無し。
  舞台は「王都に入ってすぐの裏路地〜レジスタンスのアジト」）。
- **属性神の盾4種の専用画像**（`imageDataUrl: null`、上記参照）。
- **川田自身の立ち絵・NPCアイコン**（npcArt.jsのNPC_PORTRAIT_URL等、
  他の会話NPCと同様の形式）。
- **AIプロファイル**（story.jsのopponents[].aiProfile）は未設計。
- チヌ・ウサギン・ムールの1vs3強制敗北バトルと地下労働施設は、川田の
  ステージより後の別タスクとして着手する（このメモの下の節参照、まだ
  何もコード化していない）。

## ⑬のバランス調整ループ（ひなんじょ・29ch の実戦ログ）

- ストーリー対戦は終了時に Firestore の `battleLogs` へ1試合1ドキュメントで
  自動保存される（`recordStoryBattleLog`）。テストプレイと対人戦は記録しない。
  読めるのは管理者だけ（`firestore.rules`）。
- 取り出し方: 管理ダッシュボードの「📋 対戦ログ」で対戦を選び「この対戦をコピー」。
  最終資産・使用デッキ・通行料の収支・スペル/召喚の使用回数・全ログが入る。
- **セッションは毎回まっさらなコンテナなので、こちらから本番Firestoreは読めない。**
  解析を頼む時は、上のコピーを会話に貼ること。
- 調整の制約（ユーザー指定）: **基本ルールは変えない。デッキとAIの調整だけで**
  CPUがこの2人に勝てるようにする。盤面・勝利条件・カード効果の仕様には触らない。
- 検証は `scratchpad/pilotrun.mjs`（主人公を手動操作してCPUと戦わせる）。
  シード固定なので設定違いを同じ出目で比較できる。n=120未満の差は誤差。
- ⚠️ **`scratchpad/` はコミットされないので、この pilotrun.mjs は既に消失している。**
  代わりに **`tools/simulate.mjs`（`npm run simulate`）** を使うこと。両者CPUの
  ヘッドレス対戦で任意のデッキ×マップの勝率を測る。`--seed`固定で再現可能、
  `--deckB=@deck.json` で CHARACTER_DECKS に無い実プレイヤーのデッキも回せる。
  例: `npm run simulate -- --deckA=kawada --deckB=fusagikonda --map=kawada
  --games=50 --goal=13000 --start=500 --seed=1`（`--help`／`--list`あり）。
  こちらは人間役もCPUなので、出るのは「AIがそのデッキを回した時」の数字。
  主人公を定石で手動操作したい時は `tools/sim-stage14.mjs` の方を流用する。
  **どちらのハーネスも src/ には一切触らない（バランスに対して読み取り専用）。**

### ⑬の設計意図（調整前に必ず読む）
**スペルや特殊効果を駆使して、通常のゴリ押しではない方法でクリアするステージ**
（ユーザー明言、2026-08-24）。したがって次のものは「AIの隙を突いた抜け道」ではなく、
**想定された攻略**として扱う。塞がないこと。
- 籠城して通行料で資産を貯める（周回を捨てる戦い方）
- アリジゴクで関所を作る／帰巣本能でゴールへ飛ぶ／敵をスタートへ戻す
- CPUがほぼ侵略してこないことを前提に、安いモンスターで土地を保持する

調整のゴールは「CPUを強くすること」ではなく、**ゴリ押しは通らないが工夫すれば勝てる**
状態。CPUを強くしすぎて工夫の余地まで潰したら失敗。

なお `scratchpad/pilotrun.mjs` の主人公操作は経済一本（侵略ゼロ・スペルコンボ未使用）
なので、そこで出る敵側勝率は**定石プレイに対する数字**。スペルを駆使する上手い
プレイヤーに対してはCPUを過大評価している。実戦ログと突き合わせて補正すること。

### 仕様として残す（バグではない）
- **勝利条件はCP通過を要求しない。** `_checkGoalAchievement` は総資産だけを見る。
  そのため「資産を貯めて帰巣本能(50G)でゴールへ飛ぶ」と、周回もCPも踏まずに
  決着できる。これは調査のうえで**意図的に残す**と判断したもの（2026-08-24）。
  帰巣本能はSレアで、登録プレイヤーのデッキ3つ中1つに1枚あっただけ。この抜け道を
  塞ぐために勝利条件へCPを足すと、全13ステージのクリア感に影響するほうが大きい。
  修正しないこと。

## ⑭「王都の番人？？（仮公開）」(royal-guard)
- **1vs1**（vs 塞ぎ込んだ男）。goalCurrency 15000／再戦17000、startingCurrency 500、
  checkpointBonus 150。BGMは`stage14bgm.mp3`（`src/audio.js`の`TRACK_SRC.royalGuard`
  ＋`MAP_TRACK['royal-guard']`、2026-08登録）。
- 盤面`ROYAL_GUARD_ROWS`（2026-08、ユーザー指定の不整形マップへ全面差し替え。
  旧7×7の「田」型は廃止）: 8行×最大9列。上部は2本の櫛状通路(row1/2、串団子型)が
  1本の横通路(row3)へ収束し、右端の縦通路(col7、全8行を貫通)で下まで降りる。
  左下はGスタート直結の12マスのループ（無火火C→雷/水→雷/水→G森森無、
  `tile.fusagikondaLoop`でタグ付け、board.js `createBoard`参照）で、外へ出る道は
  row4のcol1一本のみ。全41マス（土地39／CP1／ゴール1）。属性は火水雷森が各9・
  無属性3。ヘッドレスBFSで全マス到達を確認済み。
- **敵の主戦術は「撒く→ゾンビ化→均す→灰塵」**。安い札を空き地へ広げ、
  パンデミックで全部ゾンビ（＝無属性）にし、ホライズンで全土地Lv2へ揃え、
  灰塵で自分の無属性地を地価の200%で一括換金する。`_cpuMaybeUseFusagikondaCombo`が
  灰塵＞ホライズン＞パンデミックの優先度で回す。
  検証時の実測（旧7×7盤面）: 灰塵1回で**9.3マス・4539G**、パンデミック1回で9体、
  ホライズン1回で10.3マス（新盤面での再計測はTODO）。
- ⚠️ **灰塵の発動条件から「全部同時にLv2」を撤去**（2026-08、ユーザー報告
  「相変わらず全然使わない」への対応。7→5緩和だけでは直らなかった）。
  効果本体の`cashOutAllNeutralMonsterLands`（1362行目付近）は**地価そのまま**
  で換金するだけでLv2を要求しない — AI側だけが持っていた「無属性土地7→5マスが
  “同時に”全部Lv2」という一瞬の窓は、プレイヤーの奪還や新規空き地の確保で
  すぐ外れて事実上発動しなくなっていた（旧24戦simで灰塵0.46回/試合、
  パンデミック/ホライズンは1.7〜1.8回/試合と桁違いに低かった）。今は
  `neutralOwned.length >= 5`のみを見る。修正後は同じ24戦simで1.08回/試合に
  改善（`_cpuMaybeUseFusagikondaCombo`, game.js）。
- **`fusagikonda`デッキ構成（2026-08時点、40枚）**: モンスター18
  （サンダーバード4／電柱を植える男4／混沌の頭2／戦闘列車2／供物車両2／
  ボムボックリ4）、アイテム4（真剣白刃取り1／斬〇剣1／ライフジャケット1／
  ナンカのお守り1）、スペル18（灰塵2／パンデミック3／ホライズン2／
  持たざる者1／毒霧2／遅延行為2／1のダイス2／サイコキネシス1／
  バックファイア2／千本桜1）。dryad/未知の侵略者/狂戦士は全廃し、戦闘列車・
  供物車両・ボムボックリ・サイコキネシスへ入れ替えた。鉄男は0枚に削り、
  代わりにボムボックリを最大枚数(4)へ、バックファイア(reverseNextDice、
  CPU判断は既存の`_cpuMaybeUseReverseDiceSpell`をそのまま流用、追加実装
  なし)を新規採用（真剣白刃取り3→1・持たざる者2→1で枠を確保）。
  枚数は初出後さらに調整済み: パンデミック4→3・バックファイア4→2へ減らし、
  遅延行為1→2・1のダイス1→2・千本桜0→1へ増やした（ユーザー指定）。
- **空き地への召喚優先順位はサンダーバード＞ボムボックリ＞電柱を植える男**
  （`_cpuChooseSummonCardForFusagikonda`, game.js。手札にある分だけで比較する
  ので2種でも3種でも順位は変わらない）。3枚とも無ければ戦闘列車/供物車両を
  安いほうから通常のばら撒き札として据える。
- 分岐ではCP未通過ならCP、全CP通過後はゴールへの最短を最優先したうえで、
  同距離の経路なら`fusagikondaLoop`内の空き地を優先する
  （`_nearestFusagikondaLoopEmptyLandTileId`, game.js）。
- **城(START)・CP到達時はサンダーバード/電柱を植える男の土地コマンドを
  最優先で撃つ**（`_cpuUseAccessibleLandCommand`先頭、game.js）。通常移動で
  通過しただけ（召喚コマンドを使わない時）も同様に最優先。
- **戦闘列車/供物車両の「変身」は戦闘中に相方を装備した瞬間に発生する**
  （`_trainFusionDef`）。CPU共通の`_chooseBattleItemByOutcome`/
  `_bestBattleItemFromHand`が装備候補として自動評価する（`isBattleItemCard`が
  dualUseItemを含めるため）ので、召喚時に温存する意味は無く追加実装も不要。
  被侵略時にアイテムとして使うのも同じ理由で既存ロジックがそのまま拾う。
- **ボムボックリ**（森S、HP1/ATK1、40G、2026-08新規）: 戦闘・スペル・
  土地コマンドいずれの死因でも（自分から侵略して死んでも）ランダムな空き地に
  「ボックリ」（森N、HP1/ATK0、召喚コスト0G、電柱と同じく図鑑非登録の
  専用モンスター、`BOKKURI_FIELD_MONSTER`, forestMonsters.js）を2体召喚する
  （`_handleUnitDeath`の`deathSummonScatter`, game.js）。空き地が無くなった
  時点で以降は不発（差し戻し等のフォールバックはしない）。演出はカード画像が
  空から降ってきて着地する専用アニメ（`scene.js`の`playCardDropSummon`、
  `onSummonEffect`に`cardImageUrl`を渡した時だけ発動。無指定時は従来通りの
  光の放射バースト）＋「◯◯が召喚された」のメッセージ。
  - **捨て駒運用**（`_cpuMaybeSacrificeBombBokkuri`, game.js）: 本来なら
    勝てず見送る侵略の代替として、手札にあれば必ず使う。装備は一切しない
    （召喚したカード自身に`sacrificeWithoutItem`を立て、`_cpuChooseBattleItem`
    がこれを見て即nullを返す＝延命させない）。Lv1の土地は普通に勝算があっても
    ボムボックリの的として優先的に狙う。
  - **強制売却時はボックリ入りの土地を最優先で売る**（`_resolveNegativeCurrency`
    のCPU分岐、game.js）。ボックリは死亡効果でこの土地コマンド判定より前に
    湧いているため、地価比較より先に問答無用で売る対象にする。
- **毒霧はアリジゴク対策として温存する**（`aiProfile.poisonMistCounterAntlion`,
  `_cpuMaybeUsePoisonSpell`, game.js）。相手のデッキ（手札・山札）にアリジゴク
  (`curseForcedStop`)が残っている間は撃たず、使い切ったら通常運用に戻る
  （`_opponentHoldsSpellEffect`、聖域のsanctuaryCounterForcedStopと同じ判定
  ヘルパーを流用）。相手のデッキに元々無ければ最初から通常運用のまま。
- **サイコキネシスは敵地のアリジゴクを最優先で剥がす**
  （`aiProfile.psychokinesisTargetAntlion`, game.js）。対象の敵ユニットを
  強制移動させれば土地が空き地に戻り罠が無力化する。無ければ従来通り
  高額地優先（既存のsource.level×1000＋地価のスコアリングそのまま）。
  - ⚠️ **`tile.forcedStopCursed`はtruthy判定してはいけない**（2026-08、
    Codex実装のバグを修正）。この値は`true`（ほこら）か**詠唱者のplayer.id
    （0始まり）**が入る（`curseForcedStop`, game.js）。詠唱者がid 0（＝
    通常は人間側）の時、`if (tile.forcedStopCursed)`や`!tile.forcedStopCursed`
    は`0`をfalsyとして「呪い無し」に誤判定する。初出のpsychokinesisTargetAntlion
    実装はまさにこれで、人間がid 0でアリジゴクを張った時だけサイレントに
    不発になっていた。必ず`_isForcedStopCursed(tile)`
    （`tile.forcedStopCursed != null && tile.forcedStopCursed !== false`）
    を経由すること。`_cpuMaybeUseSanctuarySpell`・`_cpuMaybeUseAntlionSpell`の
    候補地フィルタも同じ理由でこのヘルパーへ統一済み。
    回帰テスト: tests/newCards.test.mjs「詠唱者がid=0でも…」
    「サイコキネシスのアリジゴク対策は…」。
- ⚠️ **灰塵はrewardOnly必須**。付け忘れるとショップマス（①と⑩）の品揃えに
  100Gで並ぶ。`_resolveShopTile`は`card.cost`をそのまま請求するので、ペーの杖と
  同じ「実質バグ価格」になる。ステージ専用EXスペルは全てrewardOnlyで揃えること
  （回帰テスト: tests/newCards.test.mjs「ショップマスの品揃えに並ばない」）。
- 検証ハーネスは`tools/sim-stage14.mjs`（プロジェクト直下へコピーして実行）。
  **エンジンのコールバックは返り値の形を間違えると無限ループする**ので、
  ハーネス冒頭の注意書きを読んでから触ること。
  - ⚠️ **`onLandCommand`の'land'選択は「今ターン通過した土地」だけが候補**
    （`_turnPathIds`）。バックファイア(reverseNextDice)で人間側の後退距離が
    実際のtileHistoryより長く、実質0マスしか戻れなかったターンは候補が
    空になり、「選択できる土地がありません」→`continue`で同じ選択肢が
    返り続けて**ハーネスが無限ループ**する（ゲーム本体はモーダルの選び直しに
    なるだけで実害なし。2026-08、ボムボックリ/パンデミック/バックファイアを
    最大枚数に増やした際に発覚）。ハーネスの`levelUpTarget()`は今ターンの
    経路を見ずに全所有地から探すのが原因。`onLandCommand`側で「今ターンに
    'land'を一度試したら結果に関わらずlandActionDoneを立てる」ことで回避
    済み（該当箇所にコメントあり）。

## ⚠️ 盤面セッションの破棄（Codex追加, 2026-08）
分岐選択やモーダルの入力待ちPromiseは、退出・別セッション開始時に
`cancelAllActivePrompts()`が**nullで解決**する。つまり「キャンセルされた」と
「何も選ばなかった」が同じ形で返る。ここで`_isCancelled`を見ずに続行すると、
**破棄済みの旧Gameが新しい盤面と同じDOMへ土地コマンドを出し、次のプレイヤー
まで進めてしまう**（⑬の分岐で発生）。
- `rollDice`は**ユーザー入力を挟む各フェーズの直後**で必ず
  `if (this._isCancelled || this.storyEnded) return;` する。入力待ちを増やす
  時は同じガードを足すこと。
- `startBattle`は新しい盤面を作る**前**に、旧`game.cancel()`＋
  `cancelActiveBattleItemPicker`＋`cancelAllActivePrompts()`＋UIフラグ
  （`boardMovementActive`/`branchChoiceActive`/モーダル類）を全部落とす。
- ⚠️ **PvP参加者は`startBattle`を通らない**。`startPvpGuestBattle`でも同じく
  旧Game・入力待ち・盤面モーダル・ログ・ターン表示・ダイス状態を初期化すること。
  ストーリー途中データはlocalStorageに残し、実行時状態だけを捨てる。
- PvP参加者の`GuestHostListener`は**盤面構築後**に作る。ロビー入室時から購読すると、
  横持ち確認中に届いた演出が前回ストーリーのscene/DOMへ流れ込む。ロビー用room監視も
  盤面開始時に止め、盤面用publicState監視との二重購読を残さない。
- `deferInit`で会話後に`init()`する経路は、`game !== startedGame ||
  startedGame._isCancelled`なら**initしない**（会話中に別の盤面へ移った場合、
  グローバル`game`は既に別物なので二重initになる）。
- `cancel()`の呼び出し元は退出系だけ（チュートリアル終了・対人終了・
  途中退室・pagehide・startBattleの作り直し）。通常進行では絶対に立たない。

## ⚠️ 並行開発 (Codex) — 必ず守る
別のエージェント Codex（git author「セイントチヌ」/「saint-chinu」, 同一ユーザー
riskyedge7366@gmail.com）が**同じmasterで同時に作業している**。壊さないこと:
1. 編集前に `git fetch origin master` → `git merge --ff-only origin/master`。
2. push直前に再度 `git fetch origin master` し
   `git merge-base --is-ancestor origin/master HEAD` で origin/master が自分の
   HEADの祖先だと確認してから、feature branch push → `git push origin HEAD:master`
   （fast-forwardのみ）。祖先でなければ先にff-mergeしてやり直す。
3. Codexの変更を絶対にclobberしない。

## 🚫 制約
- コミット/PR/コード/コメントに **モデル識別子 `claude-opus-4-8` を書かない**
  （チャット返信のみ）。コミットのCo-Authored-Byは `Claude Opus 4.8` はOK。
- 開発ブランチ: `claude/chinu-quest-spec-1a82f6`（feature branchにpush後、上記手順で
  masterへff）。

## 主要ファイル
- `src/game.js` — ゲームエンジン（ターン進行・移動・戦闘オーケストレーション・
  CPU AI・スペル・土地コマンド）。最大。
- `src/battle.js` — 戦闘解決 `resolveBattle` / `prepareForBattle` / `createFieldUnit` /
  `statTotals` / `equipItem` / 呪い。
- `src/battleCards.js` — カードカタログ。`catalogIdOf(def) = def.catalogId || def.id`
  （nullで例外を投げる—train fusion系のnull対策に注意）。`MONSTER_CATALOG` /
  `ITEM_CATALOG` / `SPELL_CATALOG` / スターターデッキ。
- `src/*Monsters.js` — 属性別モンスター定義（fire/water/thunder/forest/neutral）。
  `GASHAAN_FIELD_MONSTER`（合体ロボ、`gashaan-field`、fusion専用でデッキに無い）。
- `src/cards.js` — `Deck`（drawPile/discardPile/draw/discard/resetShuffle）。デッキは
  循環（引き切ると捨札を再シャッフル）。
- `src/main.js` — UI/演出/callbacks/PvP/ストーリー進行/メール/ゴール選択。最大級。
- `src/board.js` — マップ定義。`TileType`は文字列('land','start','runaway'等)。
  `MAPS`の`requireAllCheckpoints`。stage.key = mapId。
- `src/story.js` — `STORY_STAGES` [0]hitode [1]madai [2]budou [3]q-train
  [4]danball(段ボール男) [5]kare(「彼」との邂逅) [6]final-alliance(⑦支配の終焉)
  [7]chin-harbor(⑧朕と酢の花火港)。
- `src/breedParts.js` — ブリードモンスター(`breedMonster`, 既定属性NEUTRAL)。
- `src/scene.js` — Three.js。`tween`(utils)ベースのカメラ演出。

## カード / 戦闘モデル
- Rarity {N,S,R,EX}。Element含NEUTRAL。`catalogId`はデッキ投入時に保持される
  （`duplicateForDeck`が `catalogId: def.id` を付与、`fromCardList`で維持）。
- **盤面HP持ち越し**（このセッションで実装, battle.js）: `prepareForBattle`が毎戦闘
  フル回復せず、盤上で受けたダメージ(`baseMaxHp - currentHp`)を持ち越す。属性地/
  アイテム/呪いのHPは戦闘限りのシールドとして満タン側に乗る。戦闘後
  `restoreOnBoardHp`で素のHPスケールへ戻す。手札に戻る(不死鳥/入替)と新規カード化
  で全快。`baseMaxHp`=def.hp(ネット弁慶のstatOverrideInBattleのみ考慮)。最低1HP保証
  （諸刃の剣等マイナスHPの無音戦闘防止）。Codexが`_boardHpBeforeBattle`を追加
  （避雷針侍の身代わりで全快させずこの値へ戻す）。
- `_placeUnit`が`fusionSummon`効果のカード召喚時に`_maybeFuseGear`を呼ぶ:
  古代のギアA/B/C 3種が自分の土地に揃うとガシャーンに合体（コスト払い戻し）。

## 主要メカニクス
- **チェックポイント制** (`requireAllCheckpoints`, 全ステージtrue): 全CP通過しないと
  ゴール(START)ボーナスが出ない。`player.passedCheckpoints`(Set)。CPU分岐選択
  `_cpuChooseNextTile`は「最寄り未通過CP→全通過後ゴール」への距離を×10000で絶対優先。
- **同盟(alliance)**: `player.allianceId`。両者non-null&同値で味方。妨害スペルは非味方へ、
  強化/連鎖/応援/通行料免除は味方も対象。
- **破産 ※仕様変更(cb14266)**: 判定は隠し正味財産(通貨+清算価値+お札評価額、
  `_netWorthOf`)。処理は**全モード共通**になった—ストーリーでも脱落せず
  (`defeated=false`)、残存土地を全清算（モンスター消滅・**土地Lvも1へ**）
  →500Gを受け取り**自分のhomeGoal**から再スタート。破産では
  `_checkStoryWinCondition`は呼ばれない。
  - ⚠️ **保有お札も土地と同時に手放す**（2026-08、ユーザー報告のバグ修正）。
    `_netWorthOf`はお札評価額を破産回避の材料として数えるのに、
    `_triggerBankruptcy`が`player.ofuda`をクリアし忘れていた。すると
    再スタート後も同じ保有枚数を抱えたままなので、次に`_netWorthOf`が
    評価される時も同じお札を「まだ価値がある」と数え続け、一度も
    売って現金化しないまま同じ枚数を抱えて即破産を繰り返せてしまう
    （⑬のような`hasOfuda`マップで再現）。土地と同じタイミングで
    `player.ofuda`/`ofudaAvgCost`を全属性0にリセットして解消。
    回帰テスト: tests/newCards.test.mjs「破産すると土地だけでなく
    保有お札もすべて手放す」。
- **未知との遭遇(encounterUnknown)** EXスペル: デッキ内の未ドロー無属性モンスターを
  1体**手札へ移動**(複製ではない—`_reclaimCardFromDeck`でデッキから除去)。ギア
  (`fusionSummon`)とガシャーンは候補除外。全種遭遇済みなら200G+2ドロー。
- **占術(divination)** N40G(Codex追加): モンスター/アイテム/スペルから1種選び、
  デッキ内の該当をランダム1枚手札へ。
- ⚠️ **土地側の「呪い」はunit.cursesに乗らない**（2026-08、ユーザー報告のバグ修正）。
  増税通知(taxHike)の`tile.tollReductionRatio`はカード自身が「通行料30%減の
  呪いをかける」と明言しているのに、呪い解除(cleanseCurses)・鉄火の料理人／
  海の家店長(healAllOwnedAndCleanse)はどれも`unit.curses`しかクリアしておらず、
  土地側のこのプロパティには触れていなかった。3箇所とも該当タイルの
  `tollReductionRatio`もあわせて解除するよう修正（CPU判断側の
  `needsHealing`判定にも追加し、HP/呪いが万全でも増税通知だけ残っている
  なら発動する）。回帰テスト: tests/newCards.test.mjs「呪い解除は
  増税通知(通行料30%減)も一緒に解除する」。
- **ステージ専用カードの図鑑登録（配布なし）**（2026-08）: 「開示請求」（EXスペル、
  「彼」＝stage.key `kare`専用デッキにのみ入っている）はショップ抽選が出せる上限が
  Rareまで（`shopPacks.js`の`rollRarity`にEXが無い）で、他に入手経路が無いため
  正規プレイでは永久に図鑑が埋まらなかった。⑥クリア時に`markCatalogSeen()`で
  `currentCharacter.catalogSeenCards[key]=true`だけ立てる（`ownedCards`は増やさない）。
  図鑑（`showCatalogScreen`）は`owned > 0 || isCatalogSeen(key)`で表示を判定するが、
  デッキ編集の追加ボタンは`ownedCountOf`基準のままなので実際の所持枚数は0＝
  デッキには入れられない。「見て詳細を確認できるだけ」を図鑑と所持で作り分ける
  時はこのパターン（ownedCardsとcatalogSeenCardsを別に持つ）を使うこと。
- **npcExclusiveカードの図鑑登録**（2026-08）: 酢のような`npcExclusive`モンスターは
  `getCardCatalog`が最初から除外している（開示請求と違い、そもそもカタログ配列に
  入らない）ので、上と同じ`markCatalogSeen`だけでは図鑑に出せない。図鑑専用の
  `sortedCatalog()`だけを拡張し、`MONSTER_CATALOG`から`npcExclusive && isCatalogSeen`
  なものを都度足し込んで表示する（`effectiveCatalog()`／デッキ編集は無改変のまま
  ＝そちらには絶対出ない）。⑧「朕と酢の花火港」クリアで`markCatalogSeen(su)`。
  - ⚠️ **`onCardSeen`（`handleCardSeen`）だけに頼ると空欄が埋まらないことがある**
    （2026-08、ユーザー報告）。EX/npcExclusive/rewardOnlyなカードは、盤面で
    実際に**使われた瞬間**（`Game`の召喚・詠唱・装備、game.js側の`onCardSeen`
    呼び出し4箇所）にも汎用的に`markCatalogSeen`される仕組みは既にあるが、
    これは「その試合でたまたま引かれて使われたら」しか発火しない。40枚デッキの
    中の数枚（強制成仏×3＝⑩邪神ヒトデマソ、国士無双！！×2×2＝⑪闇・ホフク／
    暗・少女A）は、ステージを倒しても引かれず終わることがあり、正規プレイで
    永久に図鑑が埋まらない事例が実際にあった。開示請求(⑥)/酢(⑧)と同じ
    「初回撃破で確実に`markCatalogSeen`する」安全網を、強制成仏(⑩)と
    国士無双！！(⑪)にも追加済み（`handleStoryBattleEnd`、`stage.key`が
    `hitodemaso`/`mahjong-duo`の時）。灰塵(⑭専用)はこの安全網が無いままだが、
    ⑭の`塞ぎ込んだ男`デッキは`ashToDust`を毎試合ほぼ確実に使う設計
    （`_cpuMaybeUseFusagikondaCombo`のコンボ核）なので、汎用検出だけで
    実質困らない想定。
- **キャンセルカルチャー** Nスペル: 敵の手札のスペル/アイテム1枚を捨てさせる。
- **魔力抽出(extractManaFromHandCard)** S100G: 自分含む手札のある1人を選び、その手札を
  見て1枚捨てさせ、**捨てられた本人が+200G**。target=`anyPlayerHandCard`。詠唱中の
  魔力抽出自身は候補外。CPUは所持G≤400なら自分のN/Sを換金、>400なら敵のR/EXを潰す。
- **ブルーオーシャン(warpToNearbyEmptyLand)** ※ターン送りの作法: 効果関数は
  ターンを自分で送らず`true`（endedTurn）を返すだけ。人間は`useSpell`の
  endedTurn分岐、CPUは`_runCPUTurn`の`_cpuMaybeWarpToHighValueLand`成功分岐が、
  **スペル演出を完全に閉じた後に一度だけ**ターンを送る。効果関数内で送ると
  onSpellCompleteが次プレイヤーのUIを消し、操作不能・二重ターン送りになる
  （ターンを終えるスペルを追加する時はこのパターンに従うこと）。
- **帰巣本能(returnPlayerToStart)** S50G ※仕様変更: target=`anyPlayer`。選んだプレイヤー
  をゴールへ戻し**+250G**、その後`_grantGoalBonus`を通す＝**全CP通過済みの時だけ**周回
  ボーナスも入る(未通過なら250Gのみ・CP記録は保持)。旧`returnToStartDoubleBonus`は廃止。
- **めたんまん(copyOnSummon)**: 変身先は**盤面に実在するモンスターのみ**をカード一覧
  (`onPickTransformTarget`)で選ぶ。catalogIdで重複排除。CPUはHP+ATK最大を自動選択。
  CPUの空き地召喚経路(`_cpuLandCommand`)でも発動する。
- **属性武器 ※仕様変更**: 旧`elementDamageBonus`(相手属性で1.5倍)→
  `wielderElementAtkBonus`(**装備した自分のモンスターの属性**が一致で+30固定)。
  火炎放射器=火 / 雷神剣=雷 / 人食い草=森 / 薄氷の剣=水。
  `equipItem`が装備コピーのatkBonusへ加算するので実ダメージ・演出・勝率シミュが一致。
  `_itemPowerScore(item, unit)`もunitを受け取るようになった。
- **不死鳥の盾** R90G ARMOR(ATK+10/HP+20, `returnsToHandIfUsed`)。剣と同じく戦闘後に手札へ。
- **真剣白刃取り(stealItemBeforeAttack)/海賊S・ステゴロ(destroyItemBeforeAttack)の
  演出順序を修正**（2026-08、ユーザー指摘）: 以前は「装備公開(ATK+20等の補正演出)」
  →`resolveBattle`内で強奪/破壊、という順で処理していたため、**奪われる/壊される
  側の補正演出が先に画面に出てしまい、見た目上は何も起きていないように見えた**
  （実ダメージ計算は元から正しい順序だった＝表示だけがズレていた）。
  `battle.js`の`applyPreAttackItemEffects(attacker, defender)`として強奪/破壊判定を
  `resolveBattle`から抽出・export。`game.js`の`_runBattleScene`は装備公開より
  **前**にこれを直接呼んで演出（`onBattleItemDestroy`/`onBattleItemSteal`）を先に
  流し、items配列を実際に書き換える。`resolveBattle`は内部でも同じ関数を呼ぶが、
  既にitems.length===0のため強奪/破壊判定は不発（二重適用にならない・
  シミュレーション用の直接呼び出しは従来どおり自己完結）。
  装備公開(`onBattleEquip`)は`unit.items.includes(元の手札のitem)`で判定し、
  奪われた/壊された側は自動的にスキップ（何も装備していないので演出のしようが
  ない）。奪った側には**奪ったアイテムぶんの装備公開をもう一段追加**し、
  `existingAtkBonus`/`existingHpBonus`を側ごとに積み上げて渡すことで、複数枚
  重なっても表示上の合計値が正しくなる。ヘッドレステストで検証済み:
  盗み演出→装備公開の順、防御側は装備公開ゼロ件、攻撃側に盗んだ分の補正
  （例: ナイフATK+10）が正しく乗って表示されること。
- **貫通(pierce)の表示文言を修正**（2026-08、ユーザー確認）: 「基礎HPに直接ダメージ」
  という旧文言は、アイテムのHP増加まで無視するように誤解させる書き方だった。
  実際の効果は**土地の同属性ボーナスHP・ダメージ無効化・反射だけを無視**し、
  **アイテムのHP増加（不死鳥の盾など）は一切無視できない**（`game.js`の
  `battleDefenderBonus`が`bonus.hp`＝土地/応援ボーナスだけを0化する実装のまま、
  挙動は変えていない）。`game.js`の戦闘中特性表示ラベルと、`battleCards.js`の
  イカサマのサイコロ/斬〇剣の`effectDescription`を、この正確な説明文へ統一。
  「不死鳥の盾に貫通耐性があるのでは」という問い合わせは、実際には耐性フラグは
  存在せず、表示文言が誤解を招いていただけと判明。
- **土地情報に戦闘時加算ボーナスを表示**（2026-08、ユーザー要望）: 配置モンスターの
  行に「戦闘時加算：土地HP+30、応援ATK+10、呪い「マ〇ジャロ」(ATK+10/HP+20)」
  のように、実戦闘で基礎値に乗る要素をまとめて見せる（該当なしの項目は出さない）。
  `getTileSummary(tile)`に`unitElementHpBonus`(`_elementHpBonus(tile.unit, tile)`)・
  `unitCheerAtkBonus`(`_cheerAtkBonus(tile.unit, tile)`、どちらもpositionTile＝
  battleTile＝そのマス自身)・`unitCurses`(`tile.unit.curses`をname/addedAtk/addedHp
  だけに整形)を追加。`renderTileInfo`（main.js）が`tileInfoMonsterDetail`に
  「戦闘時加算：」行として組み立てる。
  ⚠️ **ゲスト側（Gameを持たない）はこの計算をローカルで再現する必要がある**:
  `_pvpSnapshot`の`tiles[].unit`に`curses`を追加（土地HP/応援ATKは`tiles`配列の
  静的neighbors＋`applyPvpBoardState`が上書きするowner/unit/level/elementだけで
  計算できるので新規フィールド不要）。`tileSummaryForInfo`のフォールバック
  （main.js、`game`が無い時の分岐）が`_elementHpBonus`/`_cheerAtkBonus`と同じ条件を
  手計算し、`unitAtk`も呪いのaddedAtkを足し込む（旧実装は素のdef.atkのみで呪いを
  無視していた）。ヘッドレステストで、同属性土地Lv3→+30、隣接同盟ユニット→
  応援+10、属性不一致→+0、マ〇ジャロ付与でcurses/unitAtkが正しく出ることを確認済み。
- **NPC専用カード**: `npcExclusive: true`を付けると`getCardCatalog`が図鑑・デッキ編集から
  除外する（酢が該当）。
- **twoStepMove特性**(酢のみ): 土地コマンドの移動が最大2マス。経路の特殊マスを1つだけ
  飛び越え可（特殊マスには着地不可）。判定は`_moveCommandCandidates(tile, player)`に集約
  され、人間移動・サイコキネシス・CPU移動が全部これを通る。2マス移動時のUIは方向選択
  ではなく`onPickAbilityTarget`のリスト（「Nマス先・◯属性の土地」）。
- **ステージ7の左右固定ワープ**: マップ記号`I/J`(卍側=entrance)と`K/L`(下段直線側=return)。
  I↔K・J↔Lで左右を保ったまま相互転移。`createBoard`末尾でリンク付け。
- 新モンスター効果(Codex): `selfDamageRatioAfterAttack`(反動), `chanceDestroyItemBeforeAttack`(予報でアイテム無効化)等。

## 新カード（2026-08、スペル4／アイテム3）
カードアートは`tools/gen_card_art.py`（Pillow + numpy）で生成した
`public/images/card-art/<id>.jpg`。`item()`/`spell()`の既定パスにそのまま
乗るので、カード定義側で`imageDataUrl`を指定していない。**描き下ろしが
用意できたら同名で置き換えるだけ**でよく、作り直したい時は
`python3 tools/gen_card_art.py`を回す（seed固定なので同じ絵が出る）。
- 作り方の前提はスクリプト冒頭のdocstring参照（2:3・主題は上寄り・
  renderCardElが上から暗いグラデを重ねるので主題は明るめに）。
- 専用絵を持たせない運用にする場合、**`item()`/`spell()`のoptions経由で
  `imageDataUrl: null`を渡しても効かない**（`options.imageDataUrl ??
  assetUrl(...)`のnullish合体でURL側に落ち、存在しない.jpgを指してしまう）。
  その時は`{ ...item(...), imageDataUrl: null }`のスプレッド上書きで書くこと。
- 回帰テストは`npm run test:cards`（`tests/newCards.test.mjs`）。
  **imageDataUrlが指すファイルがpublic/に実在するかまで検証している**。

- **鋼体** Nスペル50G `boostBaseHp` target=anyMonster: 対象の配置モンスターの
  基礎HP+15（現在HPも+15）。呪い枠（1体1つ・上書きで消える）ではなく
  タフネスと同じ`unit.summonBaseHpBonus`へ加算するので、別の呪いを重ねても
  消えず、戦闘時の最大HPにもそのまま乗る。
- **パンデミック** Sスペル100G `replaceAllUnitsWithZombie` target=none: 盤面の
  配置モンスターを全部ゾンビ(20/20)へ差し替える。土地の所有者・レベル・属性は
  動かない＝地価も連鎖もお札の相場も変わらない。**死亡ではなく置換**なので
  `_handleUnitDeath`は通さない（不死鳥の手札戻り／ゾンビ再出現／ネクロマンサーの
  蘇生元には数えない）。既にゾンビの個体は作り直さない。詠唱時は盤面全体へ
  灰色の霧を流し、低い不吉な専用効果音を鳴らす（`effectType`を対人戦にも中継）。
- **ホライズン** Rスペル200G `setAllLandLevels` target=none: 所有されている土地を
  一律Lv2へ。上がる側も下がる側もあるので、総資産の変動額を
  `onTargetEffect({playerId, message})`で各プレイヤーの駒へズームして出す
  （`playerId`指定はその駒のマスへ寄る＝「頭上」表示）。お札の相場も属性ごとに提示。
- **遅延行為** Sスペル100G `lowerTileLevel` target=anyTile: 対象の土地レベルを1下げる。
  下げた分の`LEVEL_INVESTMENT`は所有者に返らない。Lv1には無効。
- **ロシアンルーレット** Sアイテム50G `russianRoulette`: どちらかが装備していると
  `resolveBattle`が通常の殴り合いを丸ごとスキップし、攻撃側→守備側の順にd6を振って
  出目の大きい方が勝つ。負けた側は即死。**ATK/HP・土地ボーナス・先制/後攻・
  ライフジャケット等はすべて無視**（`prepareForBattle`より前で分岐する）。同じ出目は
  両者死亡＝土地が無人になり、`_settleLandingToll`の「払う相手がもういない」経路で
  通行料も発生しない。`_runBattleScene`は`result.russianRoulette`を見て特性・倍率の
  表示ごと飛ばす（効かない特性を見せない）。
- **ダイヤモンドの盾** Sアイテム55G ARMOR ATK-20/HP+60/`lastStrike`: 後攻は
  「守備側が装備しても普段どおり相手が先に殴る」＝守備では実質デメリットなし、
  侵略に持ち出すと本当に先攻を譲る、という使い分けのアイテム。コストは指定が
  無かったため55G（S帯の45〜65Gの中央）で置いた。
- **札束ガード** Rアイテム60G `payDamageToEndBattle` multiplier=3: 受けるはずだった
  ダメージ×3Gを攻撃側へ払い、ノーダメージのまま**戦闘そのものを打ち切る**
  （`dealDamage`が`endsBattle`を返し、resolveBattleの両ループが`break`）。土地は
  取られないが侵略も止まるだけなので**通行料は通常どおり**発生する。
  「無効化」ではなく「支払い」なので**貫通では抜けない**（ナンカのお守り・反射より
  前に判定する）。真剣白刃取りで奪われるとアイテムごと相手へ移るので、判定も
  自動的に奪った側にかかる＝元の持ち主が受け取る側に回る。
- CPUの使用判断も同時に実装済み（`_cpuMaybeUseToughBodySpell` /
  `_cpuMaybeUseDelayTacticsSpell` / `_cpuMaybeUsePandemicSpell` /
  `_cpuMaybeUseHorizonSpell`）。遅延行為とホライズンは**実際に盤面を書き換えて
  地価・総資産を測り、必ず元へ戻してから**判断する。アイテム3種はCPU側の追加実装
  不要——`_chooseBattleItemByOutcome`が候補を実戦闘でシミュレートして選ぶため、
  ルーレットも札束ガードも勝敗への寄与で自動的に評価される。

## ストーリー⑦「支配の終焉」(final-alliance)
- **2vs2同盟戦**。紅組=主人公＋**朕**(味方CPU, deckKey `chin`)、白組=「彼」＋段ボール男。
  goalCurrency 15000。BGMは`stage7bgm.mp3`(`MAP_TRACK['final-alliance']`)。
- 盤面`FINAL_ALLIANCE_ROWS`: 上=中央ゴールから腕が伸びる卍型、下=独立した直線。
  全40マス(土地27/CP4/ほこら3/ワープ4/START/誹謗中傷1)。
- 新キャラ**朕**(一人称かつ名前)＋騎乗する象魚**酢**。立ち絵/駒は`chin-su.png`共用。
- 酢: 水EX 300G HP60/ATK60、`pierce`+`twoStepMove`、`npcExclusive`。
- ⑤の再戦は`replay.copyHeroDeck: true`＝**段ボール男が主人公のデッキを丸ごとコピー**
  (`buildBattlePlayerConfigs`が`heroDeckList`をそのまま渡す)。
- 演出: セリフ行に`action: 'verticalExit'`を付けると立ち絵が垂直跳びで画面外へ
  (`.story-portrait-vertical-exit`, style.css)。

## ストーリー⑧「朕と酢の花火港」(chin-harbor)
- **1vs1**（vs 朕）。goalCurrency 12000、checkpointBonus **250**、BGM `stage8bgm.mp3`。
  背景はGIF（`appEl.style.backgroundImage`＝CSS背景なのでアニメする）。
- 盤面`CHIN_HARBOR_ROWS`: 左右2本の縦路(各11マス)が**ワームホール(記号K)でのみ**
  接続されるシャトル型。全22マス(土地17/ゴール2/CP1/ワープ2)。両端のゴールが
  行き止まりで、そこで折り返す。
- **ワームホール** = `warpOnPass: true` の WARP。**通過した瞬間**に対の
  Kへ強制転移する（従来のV/Pは「ちょうど停止」時のみ）。最後の1歩でちょうど
  停止した時だけ `diceCurse = {type:'double'}` で次のサイコロ2倍。
  盤上マーカーは`WARP_MARKERS.wormhole`、ラベルは「ワームホール」。
- **複数ゴール**: `alternateGoalStarts: true` のマップは`_assignGoalStarts`が
  先攻順で各ゴールへ交互配置。story側の`heroStartGoalIndex`/`startGoalIndex`が優先。
  `player.homeGoalTileId`を持ち、帰巣本能と破産リスタートは**自分のゴール**へ戻る。
  `_nearestGoalTileId`は複数ゴールから最短を選ぶ。
- **`warpOnPass`を辿る必要がある経路計算**: `_forwardTileDistance`・`_tileDistance`・
  `_forwardDestinationIdsFrom`の3つ。入口ではなく出口idへ読み替え、転移後の
  previousIdはnullにする（新しい通過ワープを足す時はこの3つ全部を直すこと）。
- **経路バッファは2本ある。混同しないこと**:
  - `_turnPathIds` = **1ターン分を通しで**保持。土地コマンドの権限
    （`_runLandCommand`が「このターンに通った自分の土地」を出す）に使う。
    通過ワープを跨いでもリセットしない。
  - `_segmentPathIds` = 対人戦の駒移動配信（`_broadcastPieceMove`）専用。
    通過ワープのたびにリセットして「歩く→ワープ→歩く」を別イベントで送る。
    まとめて送るとゲスト側で駒がワープ入口へ戻ってしまうため分割が必要。
- **NPC専用カードの所有者ロック**: `exclusiveOwnerName`（酢=朕）。Game構築時に
  デッキから除外されるので、他プレイヤーへ混入しない。
- ⚠️ **`_resolveWarpTile`はワープ先を`tileHistory`へ積み忘れていた**（2026-08修正、
  ユーザー報告）。通常の1歩移動は着地するたびに`player.tileHistory.unshift(nextId)`
  するが、ワープ転移は`player.tileId`だけ書き換えて`tileHistory`を更新していなかった。
  そのためワープ直後にバックファイア(reverseNextDice)で後退させると、
  `tileHistory[0]`がワープ入口マスのまま取り残っており、ワープが無かった
  ことになってワープ前の経路をそのまま遡ってしまっていた（＝次のサイコロで
  ワープ前のマスから進むように見える）。`_resolveWarpTile`でもワープ先を
  `tileHistory.unshift(targetTile.id)`するよう修正。後退でこの入口まで
  遡った時は既存の1歩ずつ辿るロジックがそのままワープ入口マスへ戻すので、
  "再ワープ"の特別処理は不要（回帰テスト: tests/newCards.test.mjs
  「ワープ直後にバックファイア(後退)を使うと…」）。

## ストーリー会話画面（story-dialogue-screen）(2026-08 再デザイン)
- intro/outro/敗北の全画面会話（①②の盤面上オーバーレイ`story-overlay-dialogue`とは別物）。
  note.comのプロモ画像に合わせ、ステージ背景全面＋左（主人公）右（NPC）の立ち絵＋
  下部の会話ボックスへ全面刷新（旧: 単一立ち絵＋無地背景）。
- `playDialogueLines(lines, { background, stageBadgeText })`。背景は
  `getMapBackground(stage.key)`（board.jsの戦闘時と同じ画像）、バッジは
  `STORY${stage.title}`。呼び出し側（intro/outro/replay/敗北、計5箇所）が
  毎回渡す。
- 話者判定はハードコードの左右指定なし: `line.speaker === '主人公'`なら左を
  アクティブ化、`NPC_PORTRAIT_URL[line.speaker]`にあれば右をその立ち絵へ
  差し替えてアクティブ化。該当なし（`???`等のナレーション）は両方とも
  非アクティブに沈めるだけで、直前に表示していた立ち絵は消さない
  （段ボール男の`verticalExit`演出が「彼の立ち絵が退場する」に自然につながる）。
- ⚠️ **主人公の立ち絵は`resolveCharacterIcon(currentCharacter)`必須**（`.dataUrl`）。
  生のプリセット画像URLを直接`<img src>`に入れると白背景のまま出る
  （見た目確認時にハマった）。`resolveCharacterIcon`→`imageSourceToIcon`が
  外周から白をフラッドフィルで透過済みにしてから返すので、これを経由すれば
  背景画像の上にそのまま馴染む。

## 新カード「ボムボックリ／ボックリ」(2026-08、⑭塞ぎ込んだ男デッキ用)
- **ボムボックリ** 森Sモンスター40G、HP1/ATK1。死因を問わず
  （戦闘・スペル・土地コマンド、自分から侵略して死んだ場合も含む）
  `effect: { type: 'deathSummonScatter', monster: BOKKURI_FIELD_MONSTER, count: 2 }`
  が発動し、ランダムな空き地に「ボックリ」を2体まで召喚する
  （`_handleUnitDeath`, game.js）。空き地が無くなった時点でそれ以降は
  不発（G化などのフォールバックはしない）。カードアートは
  `tools/gen_card_art.py`の`bomb_bokkuri()`（爆弾×松ぼっくりのポップな
  炸裂バースト）で生成。
- **ボックリ**: 森N、HP1/ATK0、召喚コスト0G。電柱（`DENCHU_FIELD_MONSTER`）
  と同じく`BOKKURI_FIELD_MONSTER`(forestMonsters.js)として単体export
  されるだけで、`FOREST_MONSTER_CATALOG`には含めない＝図鑑・デッキ編集に
  出ない専用モンスター。アートは`gen_card_art.py`の`bokkuri()`（同じ
  鱗片モチーフを流用した簡素な絵）。
- **専用の召喚演出**: 「カードが空から降ってきて着地しモンスターとして
  展開する」専用アニメ（`scene.js`の`playCardDropSummon`、
  `playFireballImpact`と同じ加速度落下＋着地インパクトの型を流用し、
  画像は`loadUnitCardArt`経由）。`onSummonEffect`のペイロードに
  `cardImageUrl`を足しただけで既存の呼び出し元は無変更（未指定時は
  従来の光の放射バースト`playSummonBurst`のまま）。ログは
  「◯◯が召喚された」。
  画像の404・通信失敗時は通常の召喚光へフォールバックしてPromiseを必ず完了し、
  盤面をフリーズさせない（`loadUnitCardArt`の`onError`）。
- **塞ぎ込んだ男AIの運用**（詳細は⑭節参照）: 空き地への召喚は
  サンダーバード＞ボムボックリ＞電柱を植える男の順、侵略は「本来勝てず
  見送る局面の代替」＋「Lv1地は勝算があっても積極的に狙う」捨て駒運用、
  装備は一切させず（`sacrificeWithoutItem`）、強制売却時はボックリの
  土地を最優先で売る。
- 回帰テストは`npm run test:cards`に追加済み（死亡効果の2体召喚・
  空き地切れでの打ち切り・アイテム未装備・侵略見送りの代替）。

## デッキ編集: コピー / 全解除 / 保存枠4つ (2026-08)
- **保存枠は`MAX_DECKS`＝4**（3から+1）。タブは`renderDeckSlotTabs`が
  「保存済み＋（上限未満なら）＋新規作成」を並べるだけなので、定数を
  変えれば追随する（`#deck-slot-tabs`は`flex-wrap: wrap`なので5タブでも崩れない）。
  `promptDeckSelection`も`currentCharacter.decks`をそのまま列挙する実装で
  件数をハードコードしていない。
- **「他のデッキからコピー」**（`openDeckCopyPicker`）: 選んだデッキの中身を
  **編集中のデッキへ丸ごと写す**（コピー"元"を選ぶ向き）。空のスロットを
  作ってからコピーすれば「デッキの複製」にもなるので、この向きだけで足りる。
  ⚠️ 写す時に`min(枚数, MAX_COPIES_PER_CARD, ownedCountOf(key))`で必ず
  切り詰める。所持は全デッキ共有なので普通は素通りするが、コピー元を
  組んだ後にそのカードをショップで売っていると所持数が足りない。
  切り詰めた枚数はトーストで知らせる。
  ⚠️ **カタログに存在しないキーも`showDeckScreen`と同様に除外する**
  （2026-08修正）。この除外が抜けていると、壊れた保存データ由来のキーが
  `deckWorkingCounts`に混入して総数表示・保存ボタンの活性化には数えられる
  のに、`deckSave`側の`if (!def) continue;`（保険）で保存時だけ静かに
  消え、コピー直後に保存すると「40/40」のはずが40枚未満で保存される。
- **「全解除」**（`deckClearAll`）: 編集中の作業カウントを空にするだけ。
  確認ダイアログあり。
- ⚠️ **どちらも書き換えるのは作業中の`deckWorkingCounts`だけで、保存はしない。**
  実際にデッキが変わるのは従来どおり「保存」を押した時（40枚ちょうどでないと
  押せない）。
- ⚠️ **この2ボタンのハンドラは`showDeckScreen`内で`onclick`代入で配線する。**
  再描画関数`renderEditor`がその関数スコープのクロージャなので外からは
  呼べず、かつ`addEventListener`だとデッキ画面を開くたびにハンドラが
  積み上がって多重実行になる。
- コピー選択モーダル（`#deck-copy-modal`）は`#deck-screen`の**内側**にあるので、
  デッキ画面が閉じている間は親ごと非表示になる（`#shop-sell-confirm`と同じ
  構造）。スロット切り替え・「戻る」で明示的に閉じている。

## ショップ: 上限超過カードの自動リスト入れ (2026-08)
- ⚠️ **所持カードは全デッキで共有される**。デッキ編集の追加上限は
  `Math.min(MAX_COPIES_PER_CARD, ownedCountOf(key))`で、**他デッキの使用分を
  引かない**（main.js）。つまり同じ4枚を3つのデッキが同時に使える。
  ここを取り違えると売却まわりの計算を全部間違える。
- デッキ1つに積める同名カードは**4枚まで**（`MAX_COPIES_PER_CARD`）。共有プール
  なので**5枚目以降はどのデッキにも入れられない正真正銘の死蔵カード**。
  売却画面を開いた時点で自動的に売却リストへ入れる
  （`primeShopSellSelections`, main.js。自動選択数＝`所持 − 4`）。
- ⚠️ **自動なのは「リストに入れる」ところまで。売却の実行はしない。**
  実際に減るのは従来どおりプレイヤーが「一括売却」→確認ダイアログで
  「はい」を押した時だけ（`shopSellConfirmYes`）。枚数は±で自由に調整できる。
  EX（`RARITY_SELL_PRICE`がnull）は売却不可なので対象外。
- ⚠️ **売却可能枚数(surplus)は「全デッキの合算」ではなく「一番多く使っている
  デッキ1つぶん」を残した残り**＝`所持 − maxDeckUsageOf(key)`（2026-08修正）。
  旧実装は`inDeckCountOf`で全デッキを合算していたため、例えば
  **4枚を2デッキで使っているだけで「8枚必要」と誤判定**し、所持6枚のうち
  本当に死蔵している2枚まで売却不可にしていた（共有プールなので4枚残せば
  両方のデッキが今までどおり組める）。`inDeckCountOf`は誤解を招くので削除済み。
- ⚠️ **`primeShopSellSelections`を呼ぶのは「売却画面を開いた時」と
  「売却完了直後」の2箇所だけ**。±ボタンは押すたびに
  `showShopScreen('sell')`で再描画するため、描画側で呼ぶとプレイヤーが
  減らした枚数をその場で元に戻してしまう。

## 新カード「くぐつの剣豪」(2026-08、旧称オートコマンダー)
- **無属性R、HP50/ATK50、150G**（`kugutsuNoKengou`, neutralMonsters.js）。
  参考: サーティーのブリモン(R 55/55)が140G。
- **持ち主の手番開始時、隣接する敵モンスターの土地へ自動で移動侵略する**
  （`_runAutoInvaders`, game.js）。`_beginTurn`のサイコロ手前で発火するので
  **土地コマンド・召喚の権利を消費しない**。移動侵略なので**召喚コストも
  通行料も発生しない**。侵略に失敗しても生き残っていればその場に留まり、
  翌ターンまた仕掛ける＝死ぬまで止まらない（特別な停止処理は入れていない。
  引き分けで元の土地へ戻るのは既存の移動侵略と同じ挙動）。
- **進路はプレイヤーが選べない**（`_planAutoInvaderStep`）。隣接敵がいれば
  必ず即侵略。いなければ、**空き地だけで到達できる最短の敵へ毎手番1マス進む**。
  自分・同盟・敵を問わず配置モンスターのいるマス、特殊マス、侵略不能地は
  経路を塞ぐ。最短距離の敵が複数いる場合の優先順位:
  ①無装備での勝率が高い方 ②装備込みでの勝率が高い方 ③防衛側が土地の
  同属性HPボーナスを受けていない方（＝素で弱い方） ④そこから更に自動侵略を
  続けられるマスが多い方 ⑤tile.idの小さい方（決定性の担保）。
  勝率は`AUTO_INVADE_WIN_EPSILON`(0.05)未満の差を同点として次の基準へ送る
  （モンテカルロ20試行のゆらぎで毎ターン進路が揺れないように）。
  到達できる敵がいなければ動かず、味方の死亡などで道が開けば自動的に再開する。
- **土地コマンドの「移動」では動かせない**（`immovableByMoveCommand`）。
  自動侵略だけは`_cpuMoveOwnedUnit(..., { ignoreImmovable: true })`で
  この封じを明示的に迂回する。人間・CPUの移動コマンド経路は従来どおり弾かれる。
- **`noHpBoost`特性**: 戦闘中、**アイテム・スペル由来のHP増加を受けない**。
  実装は`statTotals`(battle.js)・`_baseStats`(game.js)・`baseMaxHp`(battle.js、
  持ち越しダメージの基準値)の**3箇所すべて**で`itemHp`/`curseHp`/
  `summonBaseHpBonus`を`Math.min(0, x)`に丸める（1箇所でも漏らすと下の
  ⚠️の事故になる）。
  - **減少は通す**（斬〇剣のHP-20、HPを削る呪い）＝「増やせない」のであって
    「HP補正を全部無視する」ではない。
  - **ナンカのお守り・ライフジャケットは有効**（どちらもhpBonus:0で、
    ダメージ無効化／生存保証はHP加算ではないため自然に素通りする）。
  - **土地の同属性ボーナス・応援は乗る**（`bonus.hp`経由。アイテムでも
    スペルでもないため対象外）。
- ⚠️ **`baseMaxHp`のnoHpBoost反映漏れ→鋼体連投で実質HP削り**（2026-08修正、
  Codex実装のレビューで発見）。`baseMaxHp`だけ`noHpBoost`を見ておらず、
  「持ち越しダメージの基準値」が鋼体(anyMonster対象＝敵からも撃てる)の
  `summonBaseHpBonus`加算をそのまま素通りさせていた。`statTotals`側の戦闘用
  最大HPは50に固定されたままなので、鋼体を連投されるほど基準値だけが
  実HPより先に膨らみ、その差分が丸ごとcarriedDamageとして次戦へ持ち越る。
  再現: ATK5の雑魚相手でも鋼体3連投+3戦で本来生きているはずの剣豪が死ぬ
  （`tests/newCards.test.mjs`「鋼体連投で実質HPを削られない」参照）。
- ⚠️ **`_rankAutoInvadeTargets`のepsilon同点判定は非推移的**（2026-08修正）。
  `|a-b|<=epsilonなら同点`という比較関数はepsilon刻みで隣同士だけ同点になり
  （0.40〜0.45〜0.50が全部隣接同点）、0.40と0.50を直接比較しないままsortされる
  ため、候補3件以上だと**勝率最悪の的を選ぶ**ことがあった。修正は
  `Math.round(value / AUTO_INVADE_WIN_EPSILON)`でバケットへ丸めてから通常の
  数値比較にする（同値関係になるので推移律を満たす）。
- ⚠️ **CPUの鋼体が同じ剣豪を無限に撃ち続ける事故を防止**（2026-08修正）。
  `_cpuMaybeUseToughBodySpell`の対象選定は「撃つと`_baseStats().hp`が伸びて
  スコアが下がる」前提だったが、noHpBoost持ちはHPが伸びずスコアが下がらない
  ため候補から除外した。
- 正式画像は`public/images/card-art/kugutsuNoKengou.png`。カタログから同ファイルを
  明示参照し、画像実在テストで404による盤面フリーズを防ぐ。
- 回帰テストは`npm run test:cards`（性能・noHpBoostの3方向・進路の優先順位・
  隣接敵なし時に動かないこと・移動コマンド拒否・鋼体連投でHPが削れないこと・
  候補3件以上でのepsilon非推移性・CPU鋼体の無限撃ち防止）。

## 新アイテム「異次元ソケット」(2026-08)
- **無属性防具S、ATK/HP+0、60G**（`dimensionalSocket`, battleCards.js）。
  効果は`{type: 'swapSpecialAbilities'}`。「戦闘中、自分と相手の特殊能力
  （先制・後攻・貫通・無効化・反射・強盗等・連鎖ボーナス加算等）を入れ替える。
  装備アイテムの効果も対象。ATK/HPの実数値そのものは入れ替わらない」。
- **実装は`applyDimensionalSocketSwap`（battle.js）**。入れ替え対象は
  ①モンスター自身のtraits/effect（def由来） ②装備アイテムのtraits/effect
  の2チャンネルを、attacker/defenderの間でそれぞれ独立に交換する
  （両方が同時に別の効果を持てるので、1つのフィールドへ統合すると
  片方が消えてしまう＝チャンネルを分けて交換するのがポイント）。ATK/HPの
  実数値（素のhp/atk、アイテムのatkBonus/hpBonus）は一切触らない。
  - ⚠️ **`unit.def`は共有されるカード定義そのもの**なので直接書き換えず、
    `{...元のdef, traits:, effect:}`で作った新しいオブジェクトへ`unit.def`
    自体を一時的に差し替える（元のdef自体は不変のまま）。装備アイテムは
    `equipItem`が装備するたびに複製したインスタンスなので、こちらは直接
    `traits`/`effect`を書き換えて問題ない。
  - **ソケット自身の入れ替え効果は相手へ渡さない**（渡す側の寄与は常に
    空扱い）。渡してしまうと相手の防具スロットが「入れ替え」効果を
    持つことになり、意味を持たない再帰になる。
  - ⚠️ **適用と復元のタイミングがずれている**。適用は`applyPreAttackItemEffects`
    の先頭（アイテム破壊/強奪の判定自体も入れ替え後の能力を基準にしたい
    ため）。`applyPreAttackItemEffects`は演出側が`resolveBattle`より前に
    単独で呼び、結果をWeakMapで受け渡す既存の仕組み（真剣白刃取り等の
    確率効果を二重に引き直さないため）があるので、そのWeakMapと同じ
    パターン（`specialAbilitySwapRestoreCache`、attacker基準のキー）で
    restore関数を受け渡す。復元は`resolveBattle`の**両方の出口**
    （ロシアンルーレットの早期return、通常の最終return直前）で必ず呼ぶ。
    戦闘後トリガー（自己回復・再生・戦闘後の反動等、いずれも`def.effect`
    参照）は入れ替え後の状態のまま発動させ、`restoreOnBoardHp`（持ち越し
    ダメージ計算）より前に復元する。
  - ロシアンルーレット・真剣白刃取り等、既存の確率/奪取効果も入れ替え後の
    状態を基準に判定される（例: 相手のロシアンルーレットを奪えば自分側で
    発動する）。
- 専用画像は未実装のため`imageDataUrl: null`（開示請求と同じ扱い。
  cardArt.jsの共通防具絵へフォールバックする。画像実在テストは
  `imageDataUrl == null`のカードをスキップするので404にはならない）。
- 回帰テストは`npm run test:cards`（カタログ内容・モンスター自身の特性
  (先制)の入れ替え・装備アイテムの効果(ナンカのお守りの無効化)の入れ替え・
  1戦闘限りの復元とATK/HP実数値が変わらないこと）。

## ブリードパターン保存（最大3件）とハイパーアップ (2026-08)
- **デッキ編集(decks配列/editingDeckIndex)と同じ発想**で、ブリードモンスターの
  構成（名前・装着パーツ・属性パッチ選択）を`character.breedMonsters`
  （配列、最大`BREED_MAX_PATTERNS`=3件）＋`character.breedMonsterIndex`
  （選択中インデックス）で管理する（旧来は`character.breedMonster`単数
  オブジェクト1つだけだった）。
- **画像は3パターン共通で1枚だけ**: `character.breedImageDataUrl`へ保存し、
  `buildBreedCardDef`はどのパターンでもこの共通画像を使う。旧パターン別画像は
  ログイン時に選択中の画像を優先して1枚へ統合し、余った画像データを削除する。
- **選択中パターンがそのまま「生きた」ブリモン**: `buildBreedCardDef`
  （breedParts.js）が`activeBreedMonster(character)`で選択中パターンを
  解決し、そのステータス・名前と共通画像でカード定義を作る。デッキ内の
  「ブリモン」枠は常にこれをライブ参照する既存の仕組み（`catalogId`固定）
  がそのまま活きるので、main.js側の呼び出し規約は変わっていない。
- **画面はデッキ編集のスロットタブと同じ`.deck-slot-tab`クラスを流用**
  （`#breed-slot-tabs`、`renderBreedSlotTabs`）。パターン間で**所持パーツ
  数は共有・消費されない**（decksが所持カード数をデッキ間で引き合わない
  のと同じ仕様 - 1個しか持っていないパーツでも各パターンに独立に装着できる。
  「所持」はアカウント全体の在庫、「装着」は各パターン内だけのカウント）。
- ⚠️ **旧セーブデータの移行は`ensureBreedFields`（main.js）で1回だけ**：
  `character.breedMonster`（単数）が残っていればそれを`breedMonsters[0]`
  として引き継ぎ、旧フィールド自体は削除する。`shrinkOversizedBreedImage`
  が旧パターン別画像の共通画像1枚への移行とログイン時の画像縮小を担当する。
- 新パーツ**「ハイパーアップ」**（R、ATK+15/HP+15、costDelta+40、
  `part-hyper-up`、breedParts.js）: 既存の「ダブルアップ」（+10/+10で
  costDelta25＝単純合計20の1.25倍）と同じ「両ステータス同時上昇の
  コスト割増し」の相場に合わせ、単純合計30×1.25＝37.5を切り上げて40。
- 実ブラウザ（Firebaseエミュレータ経由でログイン→キャラ作成→ショップで
  パーツパック購入→ブリード画面でタブ作成・改名・装着・パターン間の
  独立性）まで一通り動作確認済み。回帰テストは`npm run test:cards`
  （ハイパーアップの数値・`activeBreedMonster`のフォールバック・
  パターンごとのカード化）。

## チュートリアル (Codex追加)
- ログイン前のタイトルからも遊べるデモ。`mapId: 'tutorial'`（3×3外周の8マス、
  G/CP/土地6。`getMap`がMAPS外の`TUTORIAL_MAP`を返す＝対人マップ一覧には出ない）。
- `Game`の`tutorialMode`系オプション: `tutorialOpeningCardIds`（初期手札の指定）、
  `tutorialDiceQueues`（人間/CPUの固定サイコロ台本）、`onTutorialEvent`
  （召喚/戦闘/通行料等をmain.jsのチェックリストへ通知）。
- ⚠️ **チュートリアル用デッキは`duplicateForDeck`を通らない**ので、
  `tutorialCopies`が自前で`catalogId: def.id`を付ける。`Deck.fromCardList`が
  `id`を`card-N`へ振り直すため、これが無いと`catalogIdOf()`が`card-N`を返し、
  catalogIdで引く処理（初期手札指定など）が全て不発になる。
- 台本を使い切った後は`_tutorialDiceValue()`がnullを返して通常抽選へ戻る
  （固定値を返し続けると、表示されるダイスと実際の移動量が食い違う）。
- ⚠️ **`goalCurrency`を渡すなら`storyMode: true`と`onStoryBattleEnd`も必須**。
  `_checkGoalAchievement`は達成時に盤面を止める（isBusy=true）が、終了処理を
  呼ぶのは`storyMode`のときだけ。チュートリアルはこれが欠けていたため、
  目標達成（約8ターン）でCONGRATULATIONS表示後にフリーズしていた（2026-08修正:
  達成＝`finishTutorial(true)`で完了扱い・初回報酬も付与）。`storyMode: true`は
  破産決着（`_checkStoryWinCondition`）も有効にするので、ハンドラは勝敗
  どちらの経路でも呼ばれる前提で書くこと。
- **チュートリアルではCPUは決着させない**: 通常AIは土地を+3段階まで一気に
  強化するため2周程度で2000Gへ届き、レッスン途中で終了してしまっていた。
  `_checkGoalAchievement`は`tutorialMode && isCPU`なら不発、CPUの土地強化は
  Lv2まで・1段階ずつに制限（`_cpuMaybeLevelUp`）。プレイヤーの敗北経路は
  破産のみで、それも完了扱い（報酬あり）。
- **バランス（2026-08ユーザー指定）**: 初期配置ユニットなし・全土地Lv1・
  両者200Gスタート・目標5000G。以前（1000G＋CPU側Lv2土地に先住モンスター）は
  その土地を取る/取られるだけで総資産が跳ね、どちらが転んでも「何もしなくても
  決着」した。**tutorialDiceQueuesにnullを渡すとGame側の既定台本が生きる**ので、
  無効にしたい時は明示的に空配列を渡すこと。
- **誘導台本（2026-08、ユーザー脚本）**: 画面下の吹き出し（#tutorial-step-bubble、
  main.jsのTUTORIAL_FLOW_STEPS）が「次にやること」を1個ずつ提示し、
  onTutorialEventで完了を検知して進む。脚本: 自分がマス1に火付け役召喚→敵が同マスへ
  サラリーマンダー侵略（なべのふた防衛で引き分け撃退＋通行料獲得）→マス7にくねくね→
  敵がマス4に樹海の怨霊→占術→引いたアイキャンフライ×2移動で1周してマス7着地→
  土地コマンド「移動」で怨霊へ移動侵略、反射で撃破。これを成立させる仕掛け:
  - 固定ダイス: human [1,3,2,3] / cpu [1,2,2]（使い切ると通常抽選へ）
  - `tutorialDrawQueues`: ターンごとの固定ドロー（human: [null,'kunekune',null,'iCanFly']）
  - `tutorialCpuOpeningCardIds` + `tutorialCpuScript`（invade/summonの2手。前提が
    崩れたら消費せず通常AIへ委ねるので、プレイヤーが台本から外れても詰まない）
  - チュートリアルのCPUはスペル不使用、分岐はid最小側を自動選択（_chooseNextTile）
  - 反射はdealDamageの「打撃を受ける側」判定なので、くねくねが攻め込む形でも
    怨霊の先制40を跳ね返して倒せる（反射時は即死などのオンヒット効果も不発）
- **台本は強制**（2026-08追加）: 誘導中（TUTORIAL_FLOW_STEPSの最終`event: null`
  以外）は`tutorialGuidedStep()`を各プロンプトが参照し、台本の操作以外を
  disabled/フィルタする: 土地コマンド3ボタン、召喚ピッカー（requireCardのみ）、
  防衛アイテム（requireItemのみ・スキップ封じ）、スペル（requireCardのみ、
  ダイスはスペル未使用の間ブロック）、アイキャンフライ対象（targetSelf=自分のみ）、
  土地ブラウズ（くねくねの土地のみ）、移動先（敵ユニットの隣接地のみ）。
  **必要な対象が見つからない時は制限を外す安全弁**を必ず残すこと（ソフトロック
  防止）。全ステップ完了で`tutorialGuidedStep()`がnullを返し自由プレイへ。
  防衛レッスンの完了は戦闘開始の'battle'ではなく決着後の**'battleEnd'**
  （_runInvasion末尾で発火。開始時に発火する'battle'だとアイテム選択中に
  吹き出しが先へ進んでしまう）。

## PvPフレンド／招待 (Codex追加＋ハードニング)
- `src/pvpFriends.js`。対戦開始時に`registerPvpFriends`が同席者を自分の一覧へ自動登録。
- ⚠️ **`pvpFriends/{自分}`は自分で自由に書けるので、単独では認可の根拠にならない**。
  招待作成は**相互フレンド**（相手の一覧にも自分がいること）を要求する。相手の一覧は
  相手本人しか書けないため、これが唯一の偽装できない条件。
- `pvpPresence`の読み取りは「本人」か「自分の一覧に入れている相手」のみ。全ログイン
  ユーザーに開くと**絞り込み無しのlistでuid・名前を全件列挙できてしまう**（招待スパムの
  宛先収集に直結）。この形なら1件ずつのgetだけが通る。
- 部屋の`allow read`は`isJoinableWaitingRoom()`＝**待機中かつ参加枠が残っている**部屋だけ。
  `status=='waiting'`だけにすると、満室の3〜4人部屋がコードを知る第三者に読まれ、
  参加者名・uid・デッキ40枚・盤面が漏れる。入室判定(`isValidJoin`/`isValidRosterJoin`)は
  `isWaitingRoom()`のままなので3〜4人戦の入室は従来どおり動く。
- 在席判定は`lastSeenAt`の鮮度(120秒)。**相手の強制終了・回線断では書き込みが起きず
  スナップショットも来ない**ので、`listenToPvpPresence`が20秒ごとに自力で再評価する。
- **招待通知はハブ画面でのみ表示**(6feecc6): 盤面中（ストーリー/CPU戦含む、
  判定は`!appEl.classList.contains('hidden')`）と部屋待機中・対戦中は隠す。
  受信データは`pvpReceivedInvites`に保持し、`showHubScreen`で再表示する。
  `pvpSession`はゲスト側の対戦終了・エラー経路でも必ずnullへ戻す。
- 検証: ルールテストが`tests/firestore.rules.test.mjs`に恒久化された。
  **`npm run test:rules`**（firebase emulators:exec + node --test）で実行できる。
  フレンド/招待/プレゼンス/部屋可視性のケースを含む。ルール変更時は必ず回すこと。

## PvPゲスト切断復帰 (2026-08)
- **対象はゲスト参加のみ**。ホスト権威モデル（本物の`Game`はホストだけが持つ）
  なので、ホスト自身が落ちた場合の復帰は未対応（検知手段もまだ無い）。
- 復帰対象はlocalStorage（`chinuquest2-pvp-rejoin:{uid}`、`main.js`の
  `savePvpRejoinSession`/`loadPvpRejoinSession`/`clearPvpRejoinSession`）に
  `{roomCode}`だけを保存する。盤面自体はFirestoreの`publicState`が常に
  「今の完全な状態」を保持しており、`prompts/{uid}`の未読演出も
  `ackedThrough`基準で再購読時に再生されるため、ローカルに盤面を
  持ち直す必要はない。
- 保存は`startPvpGuestBattle()`冒頭、削除は3箇所（BAN検知・
  `status:'finished'`検知・`gameMenuExit`のゲスト分岐）。
- 復帰は**PvPメニュー上部の「復帰する」ボタン**（`#pvp-rejoin-button`）。
  `showPvpMenuScreen()`はメニューを即表示したうえで
  `refreshPvpRejoinOffer()`を投げっぱなしで呼び、`fetchPvpRoomOnce`で
  部屋を一度読んで「`status==='battling'` かつ `hostUid!==自分` かつ
  `participantUids`に自分がいる」時だけボタンを出す。押すと
  `enterPvpRoomScreen({roomCode, uid, isHost:false})`（`joinPvpRoom`の
  戻り値と同じ最小の形。`joinPvpRoom`自体は呼ばない＝参加者追加
  トランザクションを再実行しない）。無効なら黙って
  `clearPvpRejoinSession`。
- ⚠️ **メニューを開いた瞬間に確認モーダルを出す設計にしてはいけない**
  （2026-08、ユーザー報告「部屋が作れない・はいを押しても進まない」）。
  初版は`showPvpMenuScreen()`の先頭で`confirmYesNo`を`await`していたが、
  **部屋は`finishPvpRoom`が`status:'finished'`を書くまで`'battling'`のまま
  永久に残る**（ホストが落ちた部屋を片付ける仕組みは無い＝TTLも
  クリーンアップジョブも無い）。そのため古い記録が1つ残っているだけで
  メニューを開くたびにモーダルが割り込み、**「部屋を作る」へ一生
  たどり着けなくなる**。しかも「はい」を押すと既に死んでいる部屋へ
  ゲストとして入り、ホストのGameが存在しないので何も進まず固まる。
  復帰は必ず「任意で押せるボタン」にすること。
- ⚠️ **ホストは復帰対象から除外する**（`room.hostUid !== currentUserId`）。
  `participantUids`にはホスト自身も入っているので、この条件が無いと
  「自分がホストだった死んだ部屋」へ`isHost:false`で入ってしまい、
  本物のGameを持つ者が誰もいない盤面で固まる。
- ロビーの「退出」（`pvpRoomLeave`）でも`clearPvpRejoinSession`する
  ＝自分の意思で離れた部屋はもう復帰候補にしない。
- **AI化（`isCPU=true`）を復帰時に人間操作へ戻す**:
  `player.pvpAutoCpu`フラグを新設し、自動AI化した2箇所（30秒ハートビート
  切れの`HostParticipantActionListener`のonOffline、45秒応答タイムアウトの
  `relayable`）でだけ立てる。ホストの手動BAN（`main.js:3615`付近）は
  このフラグを立てないので、BAN済みプレイヤーは今まで通り永久にCPUのまま。
  heartbeatを受けたら`pvpHumanRestorePending`だけを立てる。`isCPU=false`への
  復帰は`Game._beginTurn`冒頭の`onTurnBoundary`でのみ行い、CPU実行途中の
  戦闘・選択処理へ人間UIが混ざらないようにする。

### 実戦で見つかった追加バグ3件（2026-08、ユーザー報告）

- ⚠️ **スマホでアプリ切り替えしただけでセッション全損していた**。
  `forceTerminateBoardSession`（pagehide/beforeunloadで発火）の早期returnは
  「ロビー待機画面（`#app`が非表示）ならセッションを壊さない」条件だけで、
  **対戦中（`#app`が表示中）は素通りしていた**。iOS Safari等はアプリ切替の
  たびbfcache退避で`pagehide`を出すことが多く（本当のクローズではない）、
  対戦中にDiscord等へ切り替えるたびに`game`/`pvpMatch`/`scene`/`tiles`を
  全部破棄してログイン画面まで戻していた。ゲスト参加中は`pvpMatch &&
  !pvpMatch.isHost`の時この早期returnを追加し、`pageshow`のbfcache復元強制
  ログアウトも同様にスキップするよう修正（ホストは本物のGameを手放すと
  復帰手段が無いため従来通り破棄）。localStorageの復帰セッション自体は
  以前から保存されていたが、**ログイン画面まで戻された後にPvPメニューへ
  たどり着かないと`maybeOfferPvpRejoin`が発火しない**ため、実質「部屋番号が
  わからず復帰できない」体験になっていた。
- ⚠️ **対戦中ハートビートがバックグラウンド化を考慮していなかった**。
  `GuestActionSender`（`src/pvp.js`）の10秒間隔ハートビートは素の
  `setInterval`で、ロビー在席（`updatePvpPresence`）と違い
  `visibilitychange`を一切見ていなかった。モバイルはバックグラウンドタブの
  タイマーを間引く/止めるため、一瞬のアプリ切替でも30秒無応答判定に
  引っかかりやすい。フォアグラウンド復帰時に即ハートビートを送るよう修正。
- ⚠️ **4人対戦でスペルを使うとタイムアウトでAI化しやすかった**。
  `GuestHostListener._pumpBatch`（`src/pvp.js`）は届いた演出イベントを
  厳密なFIFOで1件ずつawaitして処理する。ところが「自分への質問」
  （スペルの対象選択等、`wantValue`付き・ホストが発行した瞬間から45秒
  タイマーが動く）も、他プレイヤー分の演出（見ているだけのブロードキャスト）
  も同じキューに並ぶ。参加者が多いほど自分以外の演出がキューに積み上がり
  やすく、それを律儀に消化してから質問を処理したのでは間に合わず、
  画面に選択肢が出る前にタイムアウト→勝手にAI操作へ切り替わっていた。
  初版では質問を他の演出より先に取り出したが、分岐質問が駒の到着より先に
  出るうえ、大きいイベントidをACKして手前の未再生イベントまでホストから
  消す重大な欠陥になった。**質問を含め必ずFIFOを守る**。バックログ時は
  `pvpQueueAnimationScale`でゲストの歩行尺だけを短縮し、順序を変えず追いつく。
  ACKは`PvpContiguousAckTracker`で「連続して処理済みの水位」だけを返す。

## PvP体感速度のチューニング (2026-08、「めっちゃ重い」対応)
重さの主因は2つで、どちらもホストの進行がFirestore往復に直列ブロック
される構造だった。**ゲーム進行の因果順序はFIFOのまま維持し、送信量・重複
購読・再描画・演出尺だけを削る。質問イベントの追い越しは禁止。**
- **`onPieceMove`のawaitRemoteを撤去**（main.js）: 以前は移動区間ごとに
  「操作する本人のゲストが歩行を再生し終えてACKを書く」まで待っていた
  （＝区間ごとに往復1回、数百ms〜1秒超）。①歩行→分岐質問の順序はゲストの
  キュー自体が保証する ②publicStateが歩行より先に届く順序逆転は
  `guestPendingWalk`/`guestWalkWindow`が元々吸収している（観戦側は以前から
  この順序）③ホストのペースはローカル歩行アニメが引き続き律速、なので
  待ちを外しても壊れない。分岐選択の体感が主にこれで改善する。
  `onShrineEffect`のawaitRemoteは残した（低頻度・全員同期の見せ場）。
- **publicStateのtiles部分を400msに間引き**（`flushPvpSync`、
  `PVP_TILES_WRITE_INTERVAL_MS`）: tilesはpublicStateの9割超のサイズで、
  召喚・スペル解決中は`_notifyState`のたび数十KBの書き込みが直列に詰まり、
  後続の質問・演出（prompts/{uid}）の配信まで遅れていた＝「召喚・スペルが
  重い」の主犯。見送った分は必ずトレーリングタイマーで最終状態を再送する。
  ⚠️ **`_lastTilesJson`キャッシュは実際に送った時だけ更新する**こと。
  見送り分まで更新すると「送信済み」扱いになりトレーリング再送が空振りして
  盤面が古いまま固まる。軽い項目（awaitingRoll等、ダイスUIをゲートする）と
  turnHandは従来どおり即時。`tilesRevision`が変わらないroom更新では、ゲストは
  土地・モンスターの全再構築を省略し、駒位置だけ反映する。
- **質問は追い越さず、移動アニメだけ適応短縮**（`pvpQueue.js`）:
  待ち行列6件以上で歩行尺を段階的に短縮し、16件以上でも40%までに留める。
  イベント削除・順序変更はしない。`pieceMove`の経路まとめは再接続・欠落時の
  補修として残す。
- **heartbeatはactionを上書きしない**: `actions/{uid}`のheartbeatは
  `lastSeen`だけを部分更新する。heartbeatを新しいactionIdで書くと、直前の
  ダイス／スペル操作をFirestoreのスナップショット合体で消すため禁止。
  入力監視と切断監視は`HostParticipantActionListener`の1購読へ統合する。
- **切断中の古い質問を復帰後に出さない**: ホストがAI代行へ切り替えた時は
  対象ゲストの未ACK列をfast-forwardし、`GuestHostListener`はキュー内だけで
  なく現在回答待ちの古いモーダルも閉じる。最初のpublicStateで駒を
  生成する前に歩行イベントをACKしないよう、演出購読は初回盤面反映後に開始する。
- **再読込み時のID逆行を防ぐ**: 演出IDとゲスト入力IDは`Date.now()`の
  ミリ秒値を1,000倍した基準から採番する。前ブラウザーが同一セッションで
  多数のイベントを出した直後の再読込みでも、新しいIDを古い入力と誤判定しない。
- **自動AIからの復帰は手番境界だけ**: heartbeat復帰時は
  `pvpHumanRestorePending`を立て、`Game._beginTurn`冒頭の`onTurnBoundary`で
  人間操作へ戻す。進行中のCPU戦闘・移動の途中で`isCPU`を反転させない。

### このチューニングのレビューで見つかった追加バグ5件（2026-08修正）
- ⚠️ **`pvpMatch.listener.destroy()`がoptional chaining抜けでゲストを
  抜けられなくしていた**（`main.js`ゲスト退出処理）。このチューニングで
  `pvpMatch.listener`は入室直後`null`になり、最初の`publicState`が届いて
  初めて生成されるよう変わった。その窓（入室直後〜publicState到着まで）に
  メニューから退出しようとすると`.destroy()`が非optionalでTypeErrorを投げ、
  以降の後片付け（`pvpMatch = null`・画面遷移）が丸ごと止まって盤面へ
  取り残される。ファイル内の他の全呼び出し箇所は元から`?.destroy?.()`だった
  ので、ここだけ揃える形で修正。
- ⚠️ **オフライン参加者へのfire配信の握りつぶしで、スペル演出モーダルが
  開いたまま固まることがあった**（`enqueueParticipant`, `src/pvp.js`）。
  `spellCastEffect`（開く）と`spellComplete`（閉じる）はどちらもfire配信。
  開始だけ届いて30秒オフライン判定の間に終了イベントが握りつぶされると、
  手札パネル非表示・演出モーダル表示が復帰後も解除されない。`onFastForward`
  （フェイルセーフの強制終了経路）に`finishSpellPresentation()`を追加し、
  ゲスト側の対戦離脱処理（`startPvpGuestBattle`の旧盤面片付け）にも同様の
  クローズ呼び出しを足した。
- ⚠️ **`markParticipantOnline`がハートビートのたびに`degraded`まで解除して
  いた**（`src/pvp.js`）。`degraded`は「応答受信（キューに追いついた事実）」
  でのみ解除する設計（コード内コメントに明記）だが、約10秒ごとに飛んでくる
  ハートビートで毎回解除すると、演出待ちが詰まっているだけの参加者に対して
  ホストが`awaitRemote:true`（社の演出等）のたび4秒ブロッキング待ちを
  再武装してしまう。ハートビートからは`offline`だけを解除するよう修正。
- ⚠️ **`GuestHostListener.destroy()`後、実行中だった`_pumpBatch`が停止済み
  リスナーの名義でACKを書いてしまうことがあった**（`src/pvp.js`）。
  `handlers[event.type]`のawait中に`destroy()`されるとbatchQueueは空になり
  再購読も解除されるが、awaitから戻った直後の分岐は`destroyed`を見ておらず
  `promptResponses/{uid}`へ書き込んでいた。同じ部屋への入室し直しだと、この
  古いACKが新しいセッションの`ackedThrough`を不用意に進める。`destroyed`を
  見てACK書き込みを打ち切るガードを追加。
- ⚠️ **ロビー再入室で古い`GuestActionSender`が破棄されず、10秒
  `setInterval`と`visibilitychange`リスナーが二重に残る**（`main.js`）。
  対戦中の`pvpMatch`を残したまま`enterPvpRoomScreen`へ戻ると新しい
  `pvpMatch`（新しい`actionSender`込み）で上書きされ、古い方はページを
  閉じるまで残り続けていた。上書き前に古い`listener`/`actionSender`を
  `destroy()`するよう修正。

## AI (game.js)
- **ダンボール男(stage5)** `_isDanballBoss`: 召喚は
  `_cpuChooseSummonCardForDanball`でギア最優先(合体狙い)。分岐は未回収CP絶対優先(×10000)、
  同点タイブレークで「ギアを置ける空き地」(`_nearestGearPlaceableEmptyLandTileId`, 次点×10)
  へ誘導。`_cpuMaybeUseAssassinTactics`(ガシャーン移動侵略), `_cpuMaybeUseEncounterSpell` 等。
- **「彼」(stage6)** `_cpuChooseSummonCardForKare`: 未知の侵略者は守備召喚せず、敵Lv3+隣接
  時のみ前線配置。`_cpuMaybeUseAssassinTactics`がガシャーン/未知の侵略者を共通で運用
  （隣接なら移動侵略、離れていれば敵地の横へワープ／commandCost消費）。
- **朕(stage7)**: `_cpuMaybeUsePsychokinesisSpell`(敵の高Lv土地から守備を引き剥がし別所有者へ
  強制侵略。移動先は`destinationTileId`でcastに指定)、酢の2マス移動を侵略に優先使用
  (`_cpuUseAccessibleLandCommand`内、accessible制約は人間と同じ)。
- **盤上ユニットの勝率シミュ** `_estimateUnitBattleWinProbability(attackerUnit,
  attackerPositionTile, defenderTile)`: `_estimateWinProbability`（手札カード版）の
  配置済みユニット版。現在HP・装備・呪い込みの複製で実戦と同じボーナス計算を
  モンテカルロする。**移動侵略・強制侵略のAI判断は必ずこれを通すこと**:
  - サイコキネシス: 自陣迎撃は敵勝率≤`CPU_PSYCHOKINESIS_MAX_ATTACKER_WIN_RATE`(0.4)
    の時だけ。敵同士の同士討ちは勝率不問＋加点。同盟仲間の土地へは送らない。
  - 酢・アサシン(ガシャーン/未知の侵略者)の移動侵略:
    勝率≥`CPU_MOVE_INVASION_MIN_WIN_RATE`(0.5)とprofileしきい値の高い方。
    負けるとユニットと移動元の土地を両方失うため手札侵略より慎重。
    勝てない敵地の横へのワープ待ち伏せもしない。
- **帰巣本能の共通CPU判断** `_cpuMaybeUseHomingInstinctSpell`(`_runCPUTurn`の最初): ①敵が
  最後の未通過CPの1マス手前なら妨害で敵に使う ②自分の所持G≤300なら自分に使う(ただし
  未通過CPが残り1つの時は温存)。使ったらそのターンは終了。
- **開示請求は同盟者に絶対撃たない**: `_disclosureEligibleCards`の入口で自分/同盟者を
  空配列にする二重ガード。
- レインボーカメレオン(`elementHpBonusIgnoreElement`)は属性地に積極召喚(無色地は避ける)。
- CPU捨て札: 不死鳥の剣が2枚なら1枚優先で捨てる。
- `AI_PROFILES`に`朕`(offElement 0.2 / levelUpReserve 300 / minWinProbabilityToInvade 0.25 /
  itemGamble 0.85 / highValueAvoidance 0.15 = 攻撃的)。

## 演出 (main.js)
- `showTargetEffectMessage`: 複数行(タイトル\n説明)は**逐次表示**（タイトル→消える→
  説明→消える）。単一行はそのまま。フォント`.fx-target-effect-message`は
  `clamp(16px,2.5vw,26px)`。ほこら/スペルの説明見切れ対策。
- `tween`(utils.js)は`setTimeout`ウォッチドッグ付き（rAF停止=バックグラウンド/画面回転
  でもフリーズしない）。

## ⚠️ カード名とID・画像ファイル名は別物
既存作品を想起させるカード名は表示名(`name`)を改名済み（人食い草/薄氷の剣/
スイッチランド/炎のバクチ打ち/ヘチマ竜/鉄火の料理人/めたんまん/ロボ戦士/
超電磁科学者/出張スーツ）。ただし**`id`と画像ファイル名は旧名のまま**
（`hezumaDragon`, `gandamu`, `gomuGoNoPistol`, `mobileSuit` 等）。
- `id`はビルド後のJSにそのまま載り、画像URLもブラウザがそのままリクエストする
  ので、DevToolsからは旧名が見える。
- `id`を変えると**Firestoreに保存済みのデッキ・所持カード（`catalogId`参照）が
  壊れる**ので、変えるなら旧→新の読み替えマイグレーションが必須。
- 画像ファイル名だけなら、リネーム＋`imageDataUrl`の参照更新で安全に変えられる。

## ⚠️ カード画像の欠け＝盤面フリーズ
`neutralMonster()`等のファクトリは`imageDataUrl`を`/images/card-art/<id>.jpg`へ
既定設定する。**実ファイルが無いと404 → `<img>`がbroken
(`complete=true`/`naturalWidth=0`)になり、`ctx.drawImage`がInvalidStateErrorを
投げる**。その例外は`createUnitIcon`→`_syncUnitIcons`→`_notifyState`と遡って
召喚処理のawait連鎖を壊し、`isBusy=true`のまま盤面が固まる（＝未知の侵略者の
フリーズ原因）。
- 専用イラストが無いカードは`imageDataUrl: null`にして`cardArt.js`の
  種別/属性別プレースホルダーへ落とす。
- `scene.js`の`loadUnitCardArt`/`drawUnitCard`は失敗画像を弾くよう防御済み
  （`error`リスナでキャッシュ破棄＋`naturalWidth>0`チェック）。
- 新カード追加時は`public/images/card-art/<id>.*`の実在を必ず確認する。

## 報酬M
- 終了時総資産→M変換の計算基礎は`M_REWARD_BASE_RATE`(main.js, 現在**4%**)。
  相手が1人増えるごとに+3%、同盟戦のみ15%固定、最低50M。
- ⚠️ **改造クライアント対策の資産上限（`computeExitRewardM`の`assetCap`）**:
  `部屋の目標G × M_REWARD_ASSET_CAP_MULTIPLIER`（最低5000G相当）。以前は
  倍率3だったため、⑬「豪華客船」再戦（目標22,000G・2vs2＝報酬率10%）のような
  長期戦・限界チャレンジで総資産がこの上限に張り付き、獲得Mが実質6,600M
  （22,000×3×10%）で頭打ちになっていた（2026-08、ユーザー報告）。倍率を
  **5**に引き上げ済み（同条件で11,000M）。あくまで簡易対策なので、倍率を
  上げすぎると改造クライアント対策としての意味が薄れる点に注意。

## ストーリー途中退室
- ストーリー本編・再戦のみ途中再開対応（対人戦・通常CPU戦・チュートリアルは対象外）。
- `Game._notifyState()`が`awaitingRoll && !isBusy`の操作可能地点だけを
  `onResumeCheckpoint`へ渡し、途中退室ボタンを確定した時だけlocalStorageへ保存する。
  戦闘・移動・破産・対象選択の途中状態は保存しない。
- 保存はユーザー＋ステージ＋本編/再戦ごと。次回同じ話を選択した時だけ再開確認を出す。
  ログイン・ハブ表示・pagehideから盤面生成やBGM再生を開始してはいけない。
- 保存形式はschemaVersion 2／Game state version 2。手札、山札、捨て札、G、CP、
  呪い、現在HP、土地、配置モンスター、経過ターン、死亡モンスター履歴を保持する。

## テスト（ヘッドレス）
- Vite SSRローダで単体検証:
  ```js
  const vite = await createServer({server:{middlewareMode:true}, appType:'custom', logLevel:'error'});
  const { Game } = await vite.ssrLoadModule('/src/game.js');
  ```
  `.mjs`は**プロジェクト直下**に置いて`node`実行（`node_modules`のvite解決のため）。
  `Object.create(Game.prototype)`＋必要メソッドbind＋callbackモックで部分テスト可。
  フルGameは`requestAnimationFrame`/`performance`のNodeポリフィルが必要。
- **`npm run test:cards`**（`tests/newCards.test.mjs`）: 新カード7枚の回帰テスト。
  上のSSRローダ＋`Object.create(Game.prototype)`の実例でもある。カード効果を
  触った時はこれを回す。
- でかいツール結果(actions_list等)はファイル保存→`python3`でパース。
