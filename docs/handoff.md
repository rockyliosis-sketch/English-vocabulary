# 项目交接文档（Handoff）

## 基本信息
- **当前工作分支**：`feat/20261110-flashcards`（严禁直接修改或合并入 `main`）
- **基线提交号**：`1487118`（`main` 初始提交）
- **本轮分块提交号**：
  - 第 1 块（排期状态机与例句轮换纯函数 + 单测）：`29caad7`
  - 第 2 块（D1 建表迁移 + `/api/today` 与 `/api/review` 接口 + 14 词集成测试）：`88da6d4`
  - 第 3 块（移动端单卡前端 + 前后端 E2E 联调测试 + 文档定稿）：`22639f5`（完整哈希 `22639f5bd317fe40c7939dae47bdc3a085912716`，其之上的 HEAD 为更新本交接文档的收尾提交）
- **本地和远端是否已同步**：已同步（本地 `feat/20261110-flashcards` 与远端 `origin/feat/20261110-flashcards` 完全一致，`main` 未触碰）

## 本轮完成内容（第 4 轮：按 3 块完成全部业务代码开发、测试验收与逐块推送）
1. **第 1 块：排期状态机与例句轮换核心模块（`functions/_lib/scheduler.js` + `tests/scheduler.test.mjs`）**
   - 实现北京时间（`+08:00`）日期与时间戳格式化、`0..5` 档对应 `[1, 3, 7, 14, 30, 60]` 天间隔阶梯计算、新词 `stage=0` 次日到期计算。
   - 实现 `resolveBaseStateForDay`：当天首次按下时取 `words` 表当前状态，同日后续重按时强制读取 `review_logs.stage_before` 与 `next_review_date_before`，保证同日多次按键只算最后一次且从当天首次按之前的状态算起。
   - 实现 `selectDailyExample`：逾期天数严格基于当天第一次按之前的下次复习日期（`COALESCE(r.next_review_date_before, w.next_review_date)`）计算，`past_review_days` 严格统计 `review_date < today`，确保按完按钮刷新页面时当日例句绝不跳变。
2. **第 2 块：D1 建表迁移与服务端接口（`migrations/0001_init.sql`、`functions/_lib/vocab-repo.js`、`functions/api/today.js`、`functions/api/review.js` + `tests/api.test.mjs`）**
   - 落盘 `migrations/0001_init.sql`（创建 `words` 主表、`idx_words_due` 索引、`review_logs` 按钮历史表及 `idx_review_logs_date` 索引）。
   - 早安计数统一采用带 `LEFT JOIN review_logs` 的 SQL（同时返回 `total_due_today` 和 `remaining_due_today`），即使当天已提前按过几张也不会少报全天总数。
   - 实现 `GET /api/today`（返回今日到期及今日已按卡片、当日稳定轮换的 `"示例"` 例句、`"原场景未提供"` 兜底及今日回执）与 `POST /api/review`（D1 `db.batch` 原子事务更新 `review_logs` 与 `words` 主表）。
3. **第 3 块：移动端单卡闪卡页面与端到端联调（`public/index.html`、`public/styles.css`、`public/app.js`、`public/robots.txt` + `tests/e2e.test.mjs`）**
   - 正面仅显示 `english`、`ipa`、`pos`，隐藏背面与底部三按钮；点击卡片翻开后展示 `chinese_sense`、`original_context`（空时显示 `"原场景未提供"`）、`usage_notes` 及标 `"示例"` 的轮换例句，并亮出「记住了 / 有点熟 / 忘了」三按钮。
   - 支持中途刷新自动定位到第一张未按卡片、支持点击「← 上一张」或完成页「回看 / 修改今日卡片」在当天重按改评（自动基于 `stage_before` 重算）、支持 `localStorage` 本地备份与完成页「一键复制今日结果」JSON 兜底。
   - 在 `docs/cloudflare-setup.md` 中明确补充：“Cloudflare Pages 的生产分支等我批准上线时再定，在此之前不要连接自动部署。”

## 测了什么
- 运行 `npm test`（`node --test tests/*.test.mjs`），共 3 个测试文件、7 组测试套件全部通过（0 失败、0 警告）：
  1. `tests/scheduler.test.mjs`：验证 `+08:00` 跨日换算、新词初始排期、`0..5` 全档位 × 3 按钮状态转移、第 5 档封顶 60 天、同日重按防连升、同日按完刷新例句不跳变。
  2. `tests/api.test.mjs`：基于内置 SQLite 灌入 14 个词仿真数据（6 个到期/逾期、2 个暂停、6 个未到期），验证早安 `LEFT JOIN` 计数在按键前后 `total_due_today` 恒为 `6`、`GET /api/today` 过滤暂停词与未到期词、`"原场景未提供"` 兜底、`POST /api/review` 同日连按与改按重算、历史表跨天留痕。
  3. `tests/e2e.test.mjs`：前后端联调验证翻面前三按钮隐藏、翻开后显示释义与三按钮、点击按钮写库并切下一张、刷新页面续接进度、回看上一张例句不变且同日重评不连升、完成页一键复制 `+08:00` JSON。
- 全仓敏感信息扫描：确认无任何 API Token、Account ID、Database ID 或个人邮箱写入仓库。

## 还剩什么（均需你批准后再执行）
- 业务代码与测试已全部就绪；按规则**未执行任何线上部署、未创建线上存储、未连接自动部署、未触碰 `main`**。
- 后续上线步骤（详见 `docs/cloudflare-setup.md`，等你批准后按序操作）：
  1. 批准在 Cloudflare 创建 D1 数据库并执行 `migrations/0001_init.sql` 建表；
  2. 由 Grok Bot 词库助手将现有 14 个词（含每词 3～5 条例句）一次性写入 D1 `words` 表；
  3. 批准确定 Cloudflare Pages 的生产分支，创建 Pages 项目（构建输出目录填 `public`）并绑定 D1 变量 `VOCAB_DB`；
  4. 批准开启 Cloudflare Access 邮箱白名单并完成手机端与早安计数联调。
