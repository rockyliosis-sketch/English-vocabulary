# AGENTS.md — 给所有 Agent 的入口

这是 Rocky 的私人英语生词闪卡项目：Cloudflare Pages + Pages Functions + D1。网站（公开）：<https://english-vocabulary-cw0.pages.dev>

## Rocky 给你一个新词时

照 **[docs/word-intake-rules.md](docs/word-intake-rules.md)** 做，效果要和他发给 Grok Bot「生词本」一样。要点：

1. 他发一个词、短语或一句话就算数，不要求填表。含义不明且影响讲解时，只问一个短问题；明显拼错要先说明再纠正，不改他的原句。
2. 每个词或义项一张卡：`id` 形如 `spend-v-1`、`make-sense-phrase-1`；美式 IPA 带重音；本次中文义项；`original_context` 原样保存，**没给就 `NULL`，绝不编造**；`usage_notes` 写用法和辨析；`examples_json` 3–5 条「示例」例句加中文，不重复原句或库里其他卡的例句；`related_words_json` 只作参考；`stage 0`，`next_review_date` 为添加后的下一个自然日（`+08:00`）。模板：[data/templates/word-entry.example.json](data/templates/word-entry.example.json)。
3. 同词同义只补注解，不重置进度；不同义项分开建卡。
4. 写库：每个词一条参数化 `INSERT … ON CONFLICT(id) DO NOTHING`，再按主键 `LIMIT 1` 读回。没有 Cloudflare 写权限就放进 `data/inbox/` 并 push 到接力分支，由能写库的 Agent 用 `scripts/import-inbox.mjs` 导入。
5. 用一两句中文回复 Rocky：意思、首次复习日期、这次读写了多少行。

## 铁律

- **D1 读行数预算**：D1 按扫描行数计费，`english-vocab-db` 与 Scout Bazaar、omnidesk 共用每天 500 万行免费额度。禁止全表扫描、不带 `LIMIT` 的 `SELECT`、递归 CTE、逐字符处理、循环里逐条查询。一次收词只读个位数行；任何批量操作先估算读行数，超过几十万行就停。额度打满不付费、不升级，等北京时间 08:00 重置。（2026-11-13 一个递归 CTE 脚本读了约 780 万行，见规则文档 §6。）
- 只碰 D1 `english-vocab-db`（`c3909553-419e-4b52-889c-357fa4183004`）。不碰 omnidesk-db、scoutbazaar 或其他 Pages 项目。不清空、不覆盖、不批量重写，不改已有卡的档位；复习反馈只由 Rocky 在网站上按。
- 密钥和 token 绝不进仓库、聊天或文件，也不向 Rocky 要。
- Git：每批一个接力分支 `feat/<日期>-<主题>`，做完一块就 commit + push，交接写在 `docs/`。不 force push；没有 Rocky 批准不合并 `main`、不部署。

## 改代码时

- 先读 `README.md`、`docs/kv-data-spec.md`、`docs/handoff.md` 和最新的交接文档；表结构以 `migrations/` 为准。
- `npm test`（Node 24，`node:sqlite`）必须通过。涉及数据的改动，方案里要写读行数估算，并先在本地 SQLite 用 `EXPLAIN QUERY PLAN` 和计数验证。
