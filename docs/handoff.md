# 项目交接文档（Handoff）

## 基本信息
- **当前工作分支**：`feat/20261110-flashcards`（严禁直接修改或合并入 `main`）
- **基线提交号**：`1487118`（`main` 初始提交）
- **最新提交号**：`3a06509`（完整哈希 `3a06509cc388cbbc6539fa7d0b293d2fca4312df`，升级 `docs/kv-data-spec.md` 为 Cloudflare D1 词库正本与排期规范并新增 `docs/cloudflare-setup.md` 配置审批指南；其之上的 HEAD 为更新本交接文档的收尾提交。本轮按要求仍未编写任何业务代码）
- **本地和远端是否已同步**：已同步（本地 `feat/20261110-flashcards` 与远端 `origin/feat/20261110-flashcards` 完全一致，`main` 未触碰）

## 本轮完成内容（第 3 轮：词库正本迁入 Cloudflare D1 与网站自主排期架构定稿，不写业务代码）
1. **存储选型由 KV 升级为 Cloudflare D1（Serverless SQLite，绑定名 `VOCAB_DB`）**：
   - **选型理由**：词库正本搬上 Cloudflare 且词量持续增长后，需要按 `paused = 0 AND next_review_date <= today` 进行条件索引查询（KV 不支持按字段范围查询）；同时“同一天对同一个词按多次只算最后一次、且必须从当天第一次按之前的状态算起”及“每次按键必须留存历史记录并与主表状态同步”要求强一致性与单主节点事务（`db.batch`），D1 原生满足且让词库助手每天早上仅需 **1 条 `SELECT COUNT(*)` 请求**即可拿到今日到期张数。
   - **更正说明**：词库助手通过已连接的 Cloudflare 集成直接读写 D1，无需单独配置 API 令牌。
2. **数据格式与排期契约落盘（更新 `docs/kv-data-spec.md`）**：
   - 定义 `words` 单词主表（含 `id`、`english`、`ipa`、`pos`、`chinese_sense`、`original_context`、`usage_notes`、存 3～5 条例句的 `examples_json`、`added_at`、`stage`、`next_review_date`、`last_feedback`、`last_feedback_at`、`paused`）及每日例句轮换公式。
   - 定义 `review_logs` 按钮历史表（按 `(word_id, review_date)` 唯一，首次按下时锁死 `stage_before` 与 `next_review_date_before`，同日重按时仅以 `stage_before` 重新计算并更新 `result` / `stage_after` / `next_review_date_after` / `reviewed_at` / `press_count`）。
   - 固化排期规则：北京时间 `+08:00`、`0..5` 档对应 `1/3/7/14/30/60` 天、新词 `stage=0` 次日复习、记住了 `+1` 档（封顶 5 档 60 天）、有点熟 `-1` 档（保底 0 档）次日复习、忘了回 `0` 档次日复习。
   - 明确助手写新词与网站改状态的 3 层防冲突规则（新词次日到期天然错开、D1 行级隔离、`ON CONFLICT(id) DO NOTHING` 禁用 `REPLACE` 及静态列/排期列正交更新）。
3. **上线前审批与配置步骤落盘（新增 `docs/cloudflare-setup.md`）**：
   - 写明 D1 数据库创建与建表、14 个既有词一次性迁入、Cloudflare Pages 绑定 `VOCAB_DB`、Cloudflare Access 邮箱白名单启用及早安查询验证五步清单，明确存储创建与部署均需用户批准后执行。

## 测了什么
- 本轮按约定未编写业务代码，暂无前后端构建任务。
- 使用 Python + 内置 `sqlite3` 内存库对 `docs/kv-data-spec.md` 中的全部 4 个 JSON 块和 6 段 SQL（建表、新词插入、早安 `COUNT(*)` 查询、首次按键记录、同日第 2 次改按从 `stage_before` 重算并不连升档位）进行了自动化执行校验，全部通过。
- 核验仓库不含任何密钥、Account ID、Database ID 或个人邮箱等敏感信息；核验 `main` 分支保持在 `1487118` 未改动。

## 还剩什么（待确认 D1 数据格式后按 3 块推进编码）
1. **待用户确认**：确认更新后的 `docs/kv-data-spec.md`（D1 两张表结构、例句轮换与同日重按规则）及 `docs/cloudflare-setup.md` 无误。
2. **第 1 块编码（排期与例句轮换核心纯函数模块 + 单元测试）**：实现 `+08:00` 北京日期计算、`0..5` 档状态转移、同日重按基于 `stage_before` 重算、3～5 条例句轮换与 `"原场景未提供"` 兜底逻辑，配齐自动化单测覆盖全部边界。
3. **第 2 块编码（D1 建表 SQL 迁移文件 + Pages Functions 接口 + 本地 SQLite 模拟联调）**：提供 `migrations/0001_init.sql`、实现 `GET /api/today`（拉取今日到期及今日已背词条）与 `POST /api/review`（D1 原子事务写 `review_logs` + 改 `words`），并在本地 SQLite 环境跑通完整接口测试（含 14 词样例、同日连按防连升、逾期词展示、暂停词过滤）。
4. **第 3 块编码（移动端单卡前端界面 + 前后端集成验收）**：实现先显 `english/ipa/pos`、点击翻开显释义/原场景/辨析/`"示例"`例句后再出三按钮、实时提交 D1、本地缓存防丢与完成页「一键复制今日结果」，完成后等待你批准再进行线上 D1 创建与部署。
