# チヌクエスト2 (chinu-quest2)

Culdcept／桃鉄風の3Dボード×カードゲーム。魚群の王を目指す魚が旅する
ストーリーモード＋CPU戦＋オンライン対人戦(PvP)。

## Stack / deploy
- Vite + Three.js + Firebase(Auth/Firestore) + PWA。
- GitHub Pages へ `.github/workflows/deploy-pages.yml` が **`master` ブランチ**から
  自動デプロイ。masterへpushするとデプロイが走る。
- Service Worker (`public/sw.js`) の `CACHE_NAME` を**毎デプロイbumpする**
  （現在 `chinuquest2-v34`）。bumpしないと古いJS/CSSがキャッシュから配信される。
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
  [4]danball(段ボール男/ラスボス) [5]kare(「彼」)。
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
- 新モンスター効果(Codex): `selfDamageRatioAfterAttack`(反動), `chanceDestroyItemBeforeAttack`(予報でアイテム無効化)等。

## AI (game.js)
- **ダンボール男(ラスボス, stage5)** `_isDanballBoss`: 召喚は
  `_cpuChooseSummonCardForDanball`でギア最優先(合体狙い)。分岐は未回収CP絶対優先(×10000)、
  同点タイブレークで「ギアを置ける空き地」(`_nearestGearPlaceableEmptyLandTileId`, 次点×10)
  へ誘導。`_cpuMaybeUseGashaanTactics`(ガシャーン移動侵略), `_cpuMaybeUseEncounterSpell` 等。
- レインボーカメレオン(`elementHpBonusIgnoreElement`)は属性地に積極召喚(無色地は避ける)。
- CPU捨て札: 不死鳥の剣が2枚なら1枚優先で捨てる。

## 演出 (main.js)
- `showTargetEffectMessage`: 複数行(タイトル\n説明)は**逐次表示**（タイトル→消える→
  説明→消える）。単一行はそのまま。フォント`.fx-target-effect-message`は
  `clamp(16px,2.5vw,26px)`。ほこら/スペルの説明見切れ対策。
- `tween`(utils.js)は`setTimeout`ウォッチドッグ付き（rAF停止=バックグラウンド/画面回転
  でもフリーズしない）。

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
