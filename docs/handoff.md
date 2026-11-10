# 项目交接文档（Handoff）

## 基本信息
- **当前工作分支**：`feat/20261110-flashcards`（严禁直接修改或合并入 `main`）
- **基线提交号**：`1487118`（`main` 初始提交）
- **最新提交号**：`eed5381`（完整哈希 `eed538180df238d5d98343a4040cd2dd79921874`，修复 `POST /api/review` 失败时的“待重试”状态隔离、刷新不跳过未同步卡片、自动重传与导出 JSON 的 `stage_after` / `next_review_date_after` 计算及 `synced: false` 标注；其之上的 HEAD 为更新本交接文档的收尾提交）
- **本地和远端是否已同步**：已同步（本地 `feat/20261110-flashcards` 与远端 `origin/feat/20261110-flashcards` 完全一致，`main` 未触碰）

## 本轮完成内容（第 5 轮：修复 `POST /api/review` 失败时的待重试暂存与导出计算）
1. **将已确认写入 D1 的记录与失败的“待重试”记录彻底分离（`public/app.js`）**：
   - `state.receiptsMap`（`vocab_flashcards_receipts:{date}`）仅存放服务端 D1 已确认的记录（`synced: true, sync_status: "synced"`）。
   - 当 `POST /api/review` 失败（断网、服务端报错或 Cloudflare Access 会话过期）时，点击结果仅写入独立的 `state.pendingRetriesMap`（`vocab_flashcards_pending:{date}`，标记 `synced: false, sync_status: "pending_retry"`），**绝不算进已完成**，且界面继续停留在当前卡片，显示 `待重试：记住了（未同步）` 徽标与重试提示横幅。
2. **刷新页面自动重传与不跳过未同步卡片（`public/app.js`）**：
   - 页面加载（`init()`）拿到今日卡片后，若本地存在 `pendingRetriesMap` 待重试记录，先调用 `retryPendingSubmissions()` 自动尝试向 `/api/review` 重传；重传成功的移入 `receiptsMap`（`synced: true`）并从待重试队列移除。
   - 若仍处于断网或鉴权失效状态，判定已完成的函数 `isCardSyncedAndComplete` 对所有处于 `pendingRetriesMap` 的卡片一律返回 `false`，因此刷新后始终停留在该待重试卡片上（自动展开背面并提示重试），绝不会跳过该卡片，也绝不会误显示“今日复习已完成”。
3. **导出 JSON 按同一套排期公式计算新档位与下次日期并标注未同步（`public/app.js`、`docs/kv-data-spec.md`）**：
   - 新增前端纯函数 `computeClientReviewTransition`，严格按 `[1, 3, 7, 14, 30, 60]` 阶梯和 `stage_before`（当天首次按之前的档位）计算 `stage_after` 与 `next_review_date_after`。
   - `buildExportJson` 导出时，若包含尚未同步的待重试项，自动按该公式填好准确的 `stage_after` 与 `next_review_date_after`，并明确标出 `"synced": false, "sync_status": "pending_retry"`（同时顶层标出 `"all_synced": false, "unsynced_count": N`）。

## 测了什么
- 运行 `npm test`（`node --test tests/*.test.mjs`），共 3 个测试文件、8 组测试套件全部通过（0 失败、0 警告）：
  - 新增端到端测试 `Failed POST /api/review stays as pending_retry (not skipped on refresh, never falsely completed, accurate stage_after in export)`（`tests/e2e.test.mjs`）：
    1. 模拟 `POST /api/review` 断网失败，验证点击「记住了」后仍停留在第 1 张卡片、不进入完成页、`receiptsMap` 为空、`pendingRetriesMap` 中 `stage_after`（`1 -> 2`）与 `next_review_date_after`（`2026-11-17`）计算准确且 `synced: false`；
    2. 模拟断网状态下刷新页面，验证仍停留在第 1 张卡片且自动翻开提示“待重试”，未跳过卡片也未误显示完成页；
    3. 验证断网状态下复制出的 JSON 中 `all_synced: false`、`unsynced_count: 1`，且 `stage_after: 2`、`next_review_date_after: "2026-11-17"`、`synced: false`；
    4. 模拟网络恢复后刷新页面，验证自动重传写入 D1 成功、`pendingRetriesMap` 清空、`synced: true` 并正常进入完成页。

## 还剩什么（均需你批准后再执行）
- 业务代码与 8 组自动化测试已全部通过；按规则**未执行任何线上部署、未创建线上存储、未连接自动部署、未触碰 `main`**。
- 待你批准上线后，按 `docs/cloudflare-setup.md` 依次创建 D1 数据库、由词库助手迁入 14 个现有词、确定 Cloudflare Pages 生产分支并绑定 `VOCAB_DB`、开启 Cloudflare Access。
