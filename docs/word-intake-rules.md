# 收词规则与操作手册（任何 Agent 通用）

> 版本：2026-11-23。适用于所有替 Rocky 收新词的 Agent（Grok Bot「生词本」、Codex、Claude、Gemini、Cursor 等）。
> 目标：Rocky 把一个词、短语或一句话发给任何一个 Agent，结果都和发给「生词本」一样：一张格式正确的新卡写进 D1 权威库，第二天出现在 [闪卡网站](https://english-vocabulary-cw0.pages.dev)，并且绝不打爆 D1 额度。
>
> 这里只整理生词本的现行做法，不新增规则。和仓库里其他文档冲突时，以本文件和 `migrations/` 为准，并把冲突告诉 Rocky。

---

## 0. 一页速查

1. 读懂 Rocky 发来的内容，确定要收哪些词、各自是哪个义项（§1）。
2. 按 §3 填好每张卡的字段：原句原样保存，没给就留 `NULL`，绝不编造。
3. 写 3–5 条「示例」例句，并在本地查重（§5）。
4. 写库：每个词一条参数化 `INSERT … ON CONFLICT(id) DO NOTHING`，再按主键 `LIMIT` 读回（§7）。没有 Cloudflare 写权限，就放进 `data/inbox/` 并 push（§7.3）。
5. 用一两句中文告诉 Rocky：意思、首次复习日期、这次读写了多少行（§9）。

每次收词，D1 只该读个位数行。估算超过几百行就先停下（§6）。

---

## 1. 输入：Rocky 怎么给词

- Rocky 发什么都行：一个单词、一个短语、一段带生词的原话，或者「这个 X 是什么意思」。**不要求他填表**，也不要让他补格式。
- 他问「是什么意思」时，先讲解；他说「收进生词本」「加入单词表」之类的话时，才写库。他只是问意思、没说收录的，讲完可以问一句要不要收。
- 一句话里有多个生词，或者他点名同一个词的多种形式（如 accompany 和 accompaniment），每个词或义项各建一张卡。
- **含义不明，而且会影响讲解时**（例如不知道是哪个义项），只问一个短问题。不影响讲解的，按最自然的理解直接收。
- **明显拼写错误**：先说明「你写的是 X，应该是 Y」，卡片的 `english` 用正确拼写。他的原句仍原样存进 `original_context`，**不悄悄改他的原话**。
- 他提出的特别要求要照做，例如「用法和场景多一些」「名词形式也加进来」「多举例子」：用法写进 `usage_notes`，例句仍按 3–5 条的上限。

## 2. 收词流程

1. **查重**：用本地快照（§5.2）确认这个 `id` 不存在，并且确认库里没有同词同义的卡。同词同义的情况按 §4 处理。
2. **起草**：按 §3 填全部字段。`added_at` 取写库这一刻的真实时间（`+08:00`），`next_review_date` 取它的下一个自然日。
3. **自检**：运行 `node scripts/import-inbox.mjs --check --inbox <放草稿的目录> --snapshot <快照>`，它会检查字段、日期、例句数量，以及例句有没有和原句或库里其他词重复。不用脚本也行，但要逐条人工核对同样的项目。
4. **写库**并**读回验证**（§7、§8）。
5. **回显**给 Rocky（§9）。如果你是 Grok Bot，还要更新本地备份（§11）。

## 3. 字段规则（`words` 表，以 `migrations/0001_init.sql` + `0002_add_related_words.sql` 为准）

| 字段 | 规则 | 例子 |
| --- | --- | --- |
| `id` | `<英文小写，空格换连字符>-<词性代码>-<序号>`。词性代码：`n` `v` `adj` `adv` `phrase`（少见的还有 `prep` `conj` `pron` `interj` `det` `num`）。同一个词、同一词性、另一个义项用 `-2`、`-3`。 | `spend-v-1`、`make-sense-phrase-1`、`separate-adj-1` 和 `separate-v-1` |
| `english` | 词条原形（lemma）或短语，拼写正确。 | `make sense` |
| `ipa` | 美式 IPA，用 `/…/` 包住，多音节要标重音（`ˈ` 主重音，`ˌ` 次重音）。一个词的不同词性读音不同（如 separate），分卡并分别标音。 | `/ˈvælɪd/`、`/əˈkʌmpəni/` |
| `pos` | 主卡写英文全称，沿用近期写法：`noun`、`verb`、`adjective`、`adverb`、`phrase (verb)`。 | `adverb` |
| `chinese_sense` | **本次**这个义项的中文意思，多个近义用「，」，不同侧面用「；」。不要把字典里所有义项都塞进来。 | `合理的，站得住脚的；有效的` |
| `original_context` | Rocky 给的原句，**一字不改**（含表情、标点、他的语法），只去掉他附带的提问（如「这个 valid 是什么意思？」）。**没给就是 `NULL`**，网站会显示「原场景未提供」。**绝不编造原场景。** | `Indeed, I don't know why and how. We rarely get singing lessons 😂` |
| `usage_notes` | 用法、常见搭配、易错点、近义辨析、注解。原句不自然时，在这里说明更自然的说法，但不改原句。 | 见 `data/templates/word-entry.example.json` |
| `examples_json` | 3–5 条 `{"en","zh"}`，规则见 §5。网站每天轮换展示一条，并标「示例」。 | |
| `related_words_json` | 只作参考展示：`[{english, ipa, pos, zh, relation}]`，`pos` 用缩写（`n.` `v.` `adj.` `adv.` `phrase`），`relation` 用库里已有的词：`衍生`、`同词族`、`近义`、`反义`、`易混`、`搭配`、`复合词`、`相关`。**不会自动建复习卡**，要复习就单独收成一张卡。没有就写 `[]`。 | `{"english":"invalid","ipa":"/ɪnˈvælɪd/","pos":"adj.","zh":"无效的","relation":"反义"}` |
| `added_at` | 写库时的真实时间，ISO 8601，带 `+08:00`。 | `2026-11-17T18:47:29+08:00` |
| `stage` | `0` | |
| `next_review_date` | `added_at` 按 `+08:00` 计的**下一个自然日**，`YYYY-MM-DD`。 | 11-17 晚上收，就是 `2026-11-18` |
| `last_feedback` / `last_feedback_at` | `NULL` | |
| `paused` | `0` | |

完整的真实例子：[`data/templates/word-entry.example.json`](../data/templates/word-entry.example.json)（2026-11-17 收的 indeed）。

## 4. 同一个词又出现时

- **同词同义**（`id` 已存在，意思也一样）：**不新建卡，也不重置进度**。只能用一条按主键的 `UPDATE` 补充 `usage_notes`（例句可以补，但总数不超过 5 条、不能重复），**绝不改** `stage`、`next_review_date`、`last_feedback`、`last_feedback_at`、`added_at`、`paused`。
  ```sql
  UPDATE words SET usage_notes = ?2 WHERE id = ?1;   -- 按主键，读 1 行
  ```
  这类修改不是收新卡，应先告诉 Rocky 你要补什么。没有写库权限的 Agent 不做这一步，告诉 Rocky 即可。
- **同词不同义**（如 approach 的名词和动词，或同一词性的另一义项）：分开建卡，`id` 用不同的词性代码或序号。
- **拼写相近但不同词族**（如 respond 和 responsibility）：分开建卡，并在 `usage_notes` 里说明它们不是一家。

## 5. 例句（`examples_json`）

### 5.1 写法

- 3–5 条，每条是一个完整、自然的美式英语句子，配一句中文翻译。
- 每条展示一种不同的用法或场景。Rocky 的生活场景以出行、酒店、机场、订餐、工作沟通为主，例句可以贴近这些。
- 例句是**示例**，不是 Rocky 的经历。不要写成「你上次在成都……」。
- **不能和他的原句重复**，也**不能和库里任何其他卡的例句或原句重复**。网站比较时会把文本去首尾空白、合并空格、转小写、去掉句末标点（`functions/_lib/scheduler.js` 的 `normalizeExampleText`），查重按同样的方式比较。
- 存进 D1 的每一项只有 `en` 和 `zh` 两个键。

### 5.2 本地查重（不要在 D1 里查）

查重全部在本地做，D1 只负责存。可用的快照来源，按优先顺序：

1. 本次会话里已经有的库快照文件。
2. 有 D1 读权限时：**每次会话最多跑一次**下面这条有上限的快照查询，存成本地文件再用。它按主键顺序读，读行数约等于词数（2026-11-23 约 46 行）：
   ```sql
   SELECT id, english, original_context, examples_json FROM words ORDER BY id LIMIT 1000;
   ```
3. Grok Bot 盒子上的备份 `/workspace/vocabulary/words.json`（只有 Grok Bot 能用）。注意：最早的 16 个词在备份里只存了部分例句，完整例句只在 D1 里，所以它只能作补充。
4. 什么都拿不到（例如只能 push 到 inbox 的 Agent）：照常写，在 inbox 里注明「未对库查重」，由导入方用快照查（§7.3）。

`node scripts/import-inbox.mjs --snapshot <文件>` 能读上面任何一种格式（D1 查询结果、行数组、words.json）。

## 6. D1 读行数预算（铁律，2026-11-13 定）

- **D1 按扫描的行数计费，不是按返回的行数。**
- `english-vocab-db` 和 Scout Bazaar、omnidesk-db 共用同一个 Cloudflare 账户**每天 500 万行**的免费读取额度。打满之后三个项目都写不进去。
- **禁止**：全表 `COUNT`、不带 `LIMIT` 的 `SELECT`、没有索引的 `WHERE`、递归 CTE（`WITH RECURSIVE`）、在 SQL 里逐字符或逐行处理文本、在循环里一条一条地查。
- 正常收一个词的开销：`INSERT … ON CONFLICT(id) DO NOTHING` 约读 2 行、写 3 行（数据行加两个索引）；按主键读回约读 1 行。**一次收词只读个位数行。**
- **任何批量操作之前**（导入、查重、迁移、重建索引、导出），先估算读行数：表行数 × 查询次数 × 子查询放大倍数。超过几十万行就停下，改成分批、加索引，或者在本地算完再写回简单的按主键 `UPDATE`。写进方案，并先在本地 SQLite 用 `EXPLAIN QUERY PLAN` 和计数验证。
- 查用量用 Cloudflare 控制台，或 `wrangler d1 info english-vocab-db` / `wrangler d1 insights english-vocab-db`，这两个命令不耗读取额度。
- **额度打满时不付费、不升级**，等 UTC 00:00（北京时间 08:00）自动重置。重置后先告诉 Rocky，不要自己反复重试。
- **事故教训**：2026-11-13 北京 20:08，`scripts/sql-drafts/03-top-up-examples.sql` 用 `WITH RECURSIVE` 把约 170 条文本逐字符拆开，每个字符再去扫 Unicode 区间表，一分钟读了约 **780 万行**（7,808,657），实际只改了 0 行，打穿了整个账户当天的额度，拖住了 Scout Bazaar 上线。普通页面查询每次只读 39–153 行。文本归一化这类事一律放在本地代码里做。

## 7. 写库通道

只碰 D1 **`english-vocab-db`**（id `c3909553-419e-4b52-889c-357fa4183004`）的 `words` 表。**不碰** omnidesk-db、scoutbazaar 或任何其他数据库和 Pages 项目。不清空、不覆盖、不批量重写，不改已有卡的档位，不写 `review_logs`。复习反馈只由 Rocky 在网站上按。

**密钥和 token 绝不写进仓库、聊天或文件，也不向 Rocky 要。** Rocky 不想处理 token 或权限，所以没有现成通道时直接走 §7.3，不要提出新的权限或访问控制方案。

### 7.1 已连接的 Cloudflare 连接器或 D1 查询 API（参数化，首选）

Grok Bot「生词本」就是这样写的：每条语句调用一次 D1 查询接口（`POST /accounts/{account_id}/d1/database/c3909553-419e-4b52-889c-357fa4183004/query`，body 为 `{"sql": "...", "params": [...]}`），认证用你已有的连接。

```sql
INSERT INTO words (id, english, ipa, pos, chinese_sense, original_context, usage_notes,
  examples_json, related_words_json, added_at, stage, next_review_date,
  last_feedback, last_feedback_at, paused)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
ON CONFLICT(id) DO NOTHING;
```

`node scripts/import-inbox.mjs` 生成的 `api.json` 就是这样的 `[{sql, params}]` 列表，可以逐条发送。**绝不使用 `INSERT OR REPLACE`。**

### 7.2 已登录的 wrangler

适合本机 `wrangler whoami` 能看到 Rocky 账户的 Agent。wrangler 不支持绑定参数，所以用脚本生成已转义的 SQL，不要手拼引号：

```bash
node scripts/import-inbox.mjs --inbox data/inbox --snapshot /path/to/snapshot.json
npx wrangler d1 execute english-vocab-db --remote --json --command "$(cat data/inbox/out/insert.sql)"
npx wrangler d1 execute english-vocab-db --remote --json --command "$(cat data/inbox/out/verify.sql)"
```

`--json` 输出里每条语句的 `meta.rows_read` / `meta.rows_written` 就是回显给 Rocky 的读写行数。wrangler 4 可以只凭数据库名在账户里找到库，仓库里不需要 `wrangler.toml`。wrangler 没登录、你又不能自己登录时，走 §7.3，不要让 Rocky 去配置。

### 7.3 没有 Cloudflare 写权限：放进待导入区（不需要任何密钥）

1. 每个词一个文件：`data/inbox/<YYYYMMDD>-<id>.json`，内容格式和 [`data/templates/word-entry.example.json`](../data/templates/word-entry.example.json) 完全相同（`added_at` 仍写 Rocky 交给你的真实时间）。一个词一个文件，几个 Agent 同时收词也不会改到同一个文件。
2. 运行 `node scripts/import-inbox.mjs --check` 自检通过。
3. 在当批的接力分支上 commit + push（不要直接 push 到 `main`）。
4. 告诉 Rocky：词已放进待导入区（写明分支），**还没进网站**，等能写库的 Agent 导入后才会出现在复习里。

**导入方**（能写 D1 的 Agent，通常是 Grok Bot「生词本」）：

1. 拉取该分支，准备快照（§5.2），运行 `node scripts/import-inbox.mjs --snapshot <快照>`。有错先修，不能修的告诉 Rocky。
2. 用 §7.1 或 §7.2 执行 `out/` 里的语句，再读回验证（§8）。
3. **`next_review_date` 已经过去的**（导入晚了），照原样导入也安全：网站会把它当作到期卡今天就出现。是否顺延由 Rocky 决定，不要擅自改。
4. 验证通过后，把已导入的文件 `git mv` 到 `data/imported/`，commit + push，并告诉 Rocky。

选择用脚本而不是只写文档，理由是：它在本地完成所有校验、查重和 SQL 转义，生成的每条语句都是单行 `INSERT … ON CONFLICT DO NOTHING` 或一次主键查询，读行数可以事先算出来（每个词约 3 行）；它不连 Cloudflare、不读任何密钥，不需要 Rocky 做任何配置。`tests/import-inbox.test.mjs` 在内存 SQLite 里验证了：重复执行无害、已有卡的进度不变、读回查询走主键索引而不是全表扫描。

## 8. 读回验证

```sql
SELECT id, english, stage, next_review_date, paused FROM words WHERE id = ?1 LIMIT 1;
```

确认 `stage = 0`、`next_review_date` 正确、`paused = 0`。如果 `INSERT` 的 `changes = 0`，说明这个 `id` 早就存在：**不要覆盖**，告诉 Rocky，并按 §4 处理。

## 9. 回显给 Rocky

用一两句中文，写明意思、首次复习日期、这次读写了多少行。例如：

> spend 收好了，意思是「度过（时间）、花（钱、精力）」，明天 11-15 第一次复习。这次读了 3 行、写了 3 行。

如果原句不自然或有拼写错误，可以再补一句更自然的说法。走 §7.3 的，要说清「已放进待导入区，还没进网站」。不要贴 SQL、JSON 或技术细节，除非他问。

## 10. 共享工作规则

- 每批改动用一个接力分支 `feat/<日期>-<主题>`；每完成一个能独立检查的部分就 commit + push；脱敏的交接文档放 `docs/`。
- 不 force push，不改写历史；**没有 Rocky 批准，不合并 `main`、不部署**。
- 网站是 Cloudflare Pages 的 Direct Upload 项目，不跟 Git 分支自动部署；只改文档和 `data/inbox/` 不需要部署。
- 网站 <https://english-vocabulary-cw0.pages.dev> 和这个仓库都是公开的，词库内容本身不保密，但密钥、token、账户凭据一律不进仓库。

## 11. Grok Bot 专属：本地备份

Grok Bot「生词本」写库成功后，还要在盒子上同步备份：`/workspace/vocabulary/words.json`、`words.md`、`reviews.jsonl`（追加 `word_added` 事件，记下 `rows_read` / `rows_written`）、`/workspace/memory/vocabulary.md`。其他 Agent 没有这些文件，跳过这一步。
