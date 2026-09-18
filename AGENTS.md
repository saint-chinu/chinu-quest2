# AGENTS.md（Codex 向け）

このリポジトリの仕様・注意点・過去の判断はすべて **`CLAUDE.md`** にある。
まずそれを読むこと（Claude Code と Codex が同じ master で並行開発している。
`CLAUDE.md` の「⚠️ 並行開発 (Codex)」節の手順を守る）。

## 直近の引き継ぎ（2026-09-16、対人戦の Cloudflare 移行）
コミット `662b355`「PvP通信エンジンをCloudflare Workers + Durable Objectsへ移行」。
詳細は `CLAUDE.md` の「対人戦のCloudflare移行」節。

### 状態
- 実装・ヘッドレステスト・`wrangler dev` 上のボット対戦まで完了。
- 2026-09-17: Worker公開・GitHub Actions変数設定済み。接続先は `https://chinu-quest2-pvp.doppel-tag.workers.dev`。
- **実機（2ブラウザ）の通し確認は未実施。**

### 残作業（この順）
1. `npx wrangler login` → `npm run cf:deploy`。出力の `workers.dev` URL を控える。
2. GitHub → Settings → Secrets and variables → Actions → **Variables** に
   `VITE_PVP_SERVER_URL=<そのURL>` を登録し、master を再デプロイ
   （`.github/workflows/deploy-pages.yml` が拾う）。
3. 2ブラウザで部屋作成→参加→開始→決着まで通す。見るところ:
   歩行と土地コマンドの順序、召喚・戦闘演出、切断→AI代行→再接続で復帰、
   ホストの BAN／待機カット／退出、終了時の報酬表示。
4. 問題があれば `tests/pvpCloud.test.mjs` のボットで再現してから直す
   （`npm run test:cloud`）。

### 触るときの約束
- game.js に `onXxx` フックを足したら `cloudflare/roomCore.js` の
  `ASK_HOOKS` / `BROADCAST_HOOKS` にも足す（無いと演出が誰にも届かない）。
- `src/game.js` は three.js / Firebase を import しない状態を保つ
  （`tests/pvpCloud.test.mjs` が静的に見張っている）。
- `wrangler.jsonc` の `vars` に `DEV_ALLOW_UNVERIFIED_UID` を入れない（`.dev.vars` 専用）。
- デプロイに影響する変更では `public/sw.js` の `CACHE_NAME` を bump する（現在 v309）。

### 確認コマンド
```
npm run lint && npm run build
npm run test:cards && npm run test:pvp && npm run test:cloud
npm run cf:dry-run
```

## 2026-09-17 公開作業
- Worker version: `3b00be5e-3822-4c18-89e4-3ee64e80a132`。`/health` 正常応答確認済み。
- GitHub Actionsの `VITE_PVP_SERVER_URL` は上記URLを登録済み。Pagesビルドがこの値を取り込む。
- lint/build、カード162件、PvP5件、Cloudflare15件、cf:dry-runを通過。
- Windows CRLFで静的検査が失敗したため、テストのソース比較をLFに正規化。
- 2ブラウザの実ログイン対戦（演出・復帰・報酬）は未確認。ヘッドレス検証とは区別する。
## 2026-09-17 公開後のレビュー（Claude）
- 切断猶予15秒（`DISCONNECT_GRACE_MS`）を追加。以前は WS が切れた瞬間に AI 化していた。
- 再接続時に ACK 水位と直近の回答を送り直す（切断中の回答が失われない）。
- サイコロ待ちで AI 化した時に CPU 手番を起動する `_kickCpuIfStalled`（停止バグ）。
- iconDataUrl の途中切り詰めをやめた（壊れた data URL を載せない）。
- CLAUDE.md「対人戦のCloudflare移行」節に反映済み。**Worker の再デプロイ
  （`npm run cf:deploy`）が必要**。クライアント側も変わったので Pages も再デプロイ（push で自動）。
## 2026-09-17 ホスト初手停止の調査（未解決の再現差あり）
- 報告条件: ステージ8（chin-harbor）、人間2人、ホストの最初のサイコロ5。ホストだけ1マスで止まる。
- ローカルWorkers + 実WebSocket 2接続、および実UIの2タブではホストが土地コマンドまで到達。報告端末の停止そのものは再現できておらず、完全解消とは扱わない。
- 確認できた別の不具合: Cloudflareの onMoveComplete 配信が無く、サイコロの移動中表示が残る。配信とUI受信を追加。
- tween の onUpdate 例外で Promise が永久に未解決になる経路を修正。途中/最終/保険タイマーの例外を reject してキュー側で復旧する。
- クライアント再生エラーを握りつぶさず、イベント種別・ID・部屋コードだけをWorkerの警告ログに送る（カード内容/トークンは送らない）。
- 回帰: tests/pvpAnimation.test.mjs、tests/pvpCloud.test.mjs のステージ8/初手5。実WS: `node tools/cloud-smoke.mjs`（先にlocalhost:8791でwrangler dev、ローカル限定DEV_ALLOW_UNVERIFIED_UID=1）。
- キャッシュ v306。今回ロビー/アカウントのデータ移行はしていない。対戦開始後は既にCloudflare単一路。
- 次回同症状があれば発生時刻・部屋番号・端末と pvp-client-playback-error を照合。実端末の原因確認が残る。

## 2026-09-17 実機報告「サイコロ5で1マス進んで止まる／スペルが使えない」の対応（Claude）
- 原因: 分岐選択の質問に45秒答えないとサーバーがそのプレイヤーを AI 化し、
  接続したままだと**二度と人間に戻らなかった**（旧版はハートビートで復帰していた）。
  AI が代行するので本人の画面ではサイコロもスペルも出ず、フリーズに見える。
- 修正: タイムアウト60秒に延長、接続中なら次の手番で人間へ復帰＋通知トースト、
  分岐時に「進みたいマスをタップ」のトースト。
- 2ブラウザ E2E で分岐タップ→着地→召喚→手番交代を確認済み。
- **`npm run cf:deploy` で Worker を更新しないと直らない**（Pages は push で自動）。

## 2026-09-17 「やはり止まった」への対応（Claude）
- 演出の番犬 `PLAYBACK_STALL_MS`（12秒）: 演出イベントが終わらなければ飛ばして進み、
  `clientStall` を Worker のログへ送る。原因が画像／音声／tween のどれでも盤面は止まらない。
  次に止まったら `npx wrangler tail` で `pvp-client-playback-stall` の `type` を見る。
- 静的サイトも同じ Worker から配信（`wrangler.jsonc` の `assets`、`npm run build:cf`）。
  `.github/workflows/deploy-cloudflare.yml` が push で Worker + サイトを自動デプロイ
  （Secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` が必要）。
  対戦は `https://chinu-quest2-pvp.doppel-tag.workers.dev/` から遊ぶ（GitHub Pages も残る）。
- ⚠️ **Secrets を登録するまでは Worker は更新されない。** それまでは手元で
  `npm run cf:deploy`（build:cf 込み）。

## 2026-09-18 Cloudflare配信の実地検証（Claude）
- **Worker がサイトもWSも配信する構成（本番と同じ同一オリジン）で、2ブラウザの対戦が
  最後まで通ることを確認**（18ロール・分岐2・召喚4、停止なし、コンソールエラー0）。
  手順: `CF_BUILD=1` でビルド → `npx wrangler dev --port 8790` → playwright で2タブ。
- Worker は音声（6.7MBのmp3も）・画像を200で配信。`/bgm/` も開く。
- 接続先URLの埋め込みをやめ、Cloudflareビルドは `location.origin` を使う
  （`__PVP_SAME_ORIGIN__`）。独自ドメインに移しても設定変更不要。CIの
  `VITE_PVP_SERVER_URL` は任意になった。
- ⚠️ `wrangler dev` は起動時に assets 一覧を読む。再ビルドしたら dev も再起動する。
- **デプロイはこの環境からは不可**（egressポリシーで `*.cloudflare.com` / `*.workers.dev`
  が遮断、Cloudflareトークンも無い）。実行するのは `npm run cf:deploy` の1コマンド。
