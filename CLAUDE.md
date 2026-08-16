# チヌクエスト2 (chinu-quest2)

Culdcept／桃鉄風の3Dボード×カードゲーム。魚群の王を目指す魚が旅する
ストーリーモード＋CPU戦＋オンライン対人戦(PvP)。

## Stack / deploy
- Vite + Three.js + Firebase(Auth/Firestore) + PWA。
- GitHub Pages へ `.github/workflows/deploy-pages.yml` が **`master` ブランチ**から
  自動デプロイ。masterへpushするとデプロイが走る。
- Service Worker (`public/sw.js`) の `CACHE_NAME` を**毎デプロイbumpする**
  （現在 `chinuquest2-v61`）。bumpしないと古いJS/CSSがキャッシュから配信される。
- ビルド確認: `npx vite build`。

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
- **破産**: 隠し正味財産(通貨+清算価値)。
- **未知との遭遇(encounterUnknown)** EXスペル: デッキ内の未ドロー無属性モンスターを
  1体**手札へ移動**(複製ではない—`_reclaimCardFromDeck`でデッキから除去)。ギア
  (`fusionSummon`)とガシャーンは候補除外。全種遭遇済みなら200G+2ドロー。
- **占術(divination)** N40G(Codex追加): モンスター/アイテム/スペルから1種選び、
  デッキ内の該当をランダム1枚手札へ。
- **キャンセルカルチャー** Nスペル: 敵の手札のスペル/アイテム1枚を捨てさせる。
- **魔力抽出(extractManaFromHandCard)** S100G: 自分含む手札のある1人を選び、その手札を
  見て1枚捨てさせ、**捨てられた本人が+200G**。target=`anyPlayerHandCard`。詠唱中の
  魔力抽出自身は候補外。CPUは所持G≤400なら自分のN/Sを換金、>400なら敵のR/EXを潰す。
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
- **NPC専用カード**: `npcExclusive: true`を付けると`getCardCatalog`が図鑑・デッキ編集から
  除外する（酢が該当）。
- **twoStepMove特性**(酢のみ): 土地コマンドの移動が最大2マス。経路の特殊マスを1つだけ
  飛び越え可（特殊マスには着地不可）。判定は`_moveCommandCandidates(tile, player)`に集約
  され、人間移動・サイコキネシス・CPU移動が全部これを通る。2マス移動時のUIは方向選択
  ではなく`onPickAbilityTarget`のリスト（「Nマス先・◯属性の土地」）。
- **ステージ7の左右固定ワープ**: マップ記号`I/J`(卍側=entrance)と`K/L`(下段直線側=return)。
  I↔K・J↔Lで左右を保ったまま相互転移。`createBoard`末尾でリンク付け。
- 新モンスター効果(Codex): `selfDamageRatioAfterAttack`(反動), `chanceDestroyItemBeforeAttack`(予報でアイテム無効化)等。

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
- **途中再開は廃止**（Setがシリアライズで壊れ再開時フリーズしていた）。退室時は
  `clearStoryResume()`で保存を消し、次回は必ず盤面リセットで最初から。

## テスト（ヘッドレス）
- Vite SSRローダで単体検証:
  ```js
  const vite = await createServer({server:{middlewareMode:true}, appType:'custom', logLevel:'error'});
  const { Game } = await vite.ssrLoadModule('/src/game.js');
  ```
  `.mjs`は**プロジェクト直下**に置いて`node`実行（`node_modules`のvite解決のため）。
  `Object.create(Game.prototype)`＋必要メソッドbind＋callbackモックで部分テスト可。
  フルGameは`requestAnimationFrame`/`performance`のNodeポリフィルが必要。
- でかいツール結果(actions_list等)はファイル保存→`python3`でパース。
