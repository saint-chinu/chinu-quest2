# チヌクエスト2 (chinu-quest2)

Culdcept／桃鉄風の3Dボード×カードゲーム。魚群の王を目指す魚が旅する
ストーリーモード＋CPU戦＋オンライン対人戦(PvP)。

## Stack / deploy
- Vite + Three.js + Firebase(Auth/Firestore) + PWA。
- GitHub Pages へ `.github/workflows/deploy-pages.yml` が **`master` ブランチ**から
  自動デプロイ。masterへpushするとデプロイが走る。
- Service Worker (`public/sw.js`) の `CACHE_NAME` を**毎デプロイbumpする**
  （現在 `chinuquest2-v225`）。bumpしないと古いJS/CSSがキャッシュから配信される。
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

- **オートコマンダー**（無属性モンスター、2026-08構想）: 隣接する敵地へ
  **毎ターン自動で侵略**し、自分の土地か特殊マス（CP/ゴール等の非LANDタイル）に
  当たるまで進み続ける。土地コマンドや召喚時能力ではなく、ターン開始時に
  自動発火する常時能力になる想定。実装時に詰める必要がある点：
  - 侵略に負けた場合どうなるか（そこで止まる／手札に戻る／消滅）
  - 分岐（隣接する敵地が複数）でどちらへ進むか選ぶ主体（本人固定？プレイヤー選択？）
  - 通行料・召喚コストの扱い（自動侵略にコストは発生するか）
  - 「特殊マスに当たるまで」は1ターンに複数マス進むことを意味するのか、
    それとも1ターン1マスで、そのマスが特殊マスなら止まるだけなのか

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
  蘇生元には数えない）。既にゾンビの個体は作り直さない。
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
