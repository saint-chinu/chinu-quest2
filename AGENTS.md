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
- デプロイに影響する変更では `public/sw.js` の `CACHE_NAME` を bump する（現在 v305）。

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
