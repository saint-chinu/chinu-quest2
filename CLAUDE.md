# チヌクエスト2 (chinu-quest2)

Culdcept／桃鉄風の3Dボード×カードゲーム。魚群の王を目指す魚が旅する
ストーリーモード＋CPU戦＋オンライン対人戦(PvP)。

## Stack / deploy
- Vite + Three.js + Firebase(Auth/Firestore) + PWA。
- GitHub Pages へ `.github/workflows/deploy-pages.yml` が **`master` ブランチ**から
  自動デプロイ。masterへpushするとデプロイが走る。
- Service Worker (`public/sw.js`) の `CACHE_NAME` を**毎デプロイbumpする**
  （現在 `chinuquest2-v159`）。bumpしないと古いJS/CSSがキャッシュから配信される。
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
- **破産 ※仕様変更(cb14266)**: 判定は隠し正味財産(通貨+清算価値)。処理は
  **全モード共通**になった—ストーリーでも脱落せず(`defeated=false`)、残存土地を
  全清算（モンスター消滅・**土地Lvも1へ**）→500Gを受け取り**自分のhomeGoal**から
  再スタート。破産では`_checkStoryWinCondition`は呼ばれない。
- **未知との遭遇(encounterUnknown)** EXスペル: デッキ内の未ドロー無属性モンスターを
  1体**手札へ移動**(複製ではない—`_reclaimCardFromDeck`でデッキから除去)。ギア
  (`fusionSummon`)とガシャーンは候補除外。全種遭遇済みなら200G+2ドロー。
- **占術(divination)** N40G(Codex追加): モンスター/アイテム/スペルから1種選び、
  デッキ内の該当をランダム1枚手札へ。
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
- でかいツール結果(actions_list等)はファイル保存→`python3`でパース。
