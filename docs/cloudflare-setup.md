# Cloudflare D1 存储创建、绑定与部署审批指南

> **重要原则**：
> 1. 本仓库遵循“不擅自部署、不合并入 `main`、不在仓库中存放任何敏感信息（Account ID、Database ID、邮箱、密钥）”的开发规则。
> 2. 线上 **D1 数据库的创建、建表、Pages 部署及 Cloudflare Access 启用，均需在业务代码完成本地验收后由你明确批准**。

---

## 上线审批与配置五步清单

### 步骤 1：创建 Cloudflare D1 数据库并初始化表结构（需你批准）
1. 登录 Cloudflare Dashboard → **Workers & Pages** → **D1 SQL Database** → 点击 **Create**。
2. 数据库名称建议填：`english-vocab-db`（或你喜欢的名称）。
3. 进入新建的 D1 数据库 → **Console** 标签页，粘贴并执行 `docs/kv-data-spec.md` 第 2.1 节中的建表 SQL，创建：
   - `words` 表（单词主表 / 词库正本）及 `idx_words_due` 索引；
   - `review_logs` 表（按钮复习历史表）及 `idx_review_logs_date` 索引。
4. **验收检查**：在 D1 Console 执行 `SELECT name FROM sqlite_master WHERE type='table';`，确认存在 `words` 和 `review_logs`。

---

### 步骤 2：词库助手一次性搬入现有 14 个词（由 Grok Bot 词库助手执行）
1. 词库助手通过已连接的 Cloudflare 集成连接到 `english-vocab-db`。
2. 为现有 14 个词补齐每个词 3～5 条例句（填入 `examples_json`），保留原有的 `id`、`english`、`ipa`、`pos`、`chinese_sense`、`original_context`、`usage_notes`、`added_at`、`stage`、`next_review_date`、`last_feedback`、`last_feedback_at`、`paused` 字段，执行 `INSERT INTO words ... ON CONFLICT(id) DO NOTHING;`。
3. **验收检查**：执行 `SELECT COUNT(*) AS total_words FROM words;`，确认返回 `14`。

---

### 步骤 3：创建 Cloudflare Pages 项目并绑定 `VOCAB_DB`（需你批准）
1. 在 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**，选择私有仓库 `rockyliosis-sketch/English-vocabulary`。
2. 构建设置（无构建打包依赖，直接托管静态前端 + `functions/` 接口）：
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Build output directory**：`/`（或代码中约定的静态目录，以第 3 块代码交付为准）
3. 绑定 D1 数据库：
   - 进入 Pages 项目 → **Settings** → **Functions** → **D1 database bindings**（注意同时为 Production 和 Preview 环境配置）。
   - **Variable name（变量名，必须严格一致）**：`VOCAB_DB`
   - **D1 database**：选择步骤 1 创建的 `english-vocab-db`。
4. **注意**：配置过程全部在 Cloudflare 网页后台完成，无需在代码仓库的配置文件里写入真实的 `database_id`。

---

### 步骤 4：开启 Cloudflare Access 邮箱白名单保护（需你批准）
1. 在 Pages 项目 → **Settings** → **General** → 开启 **Access Policy**（或前往 **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**）。
2. 保护域名：填入你的 Pages 生产域名（及预览域名 `*.<你的项目名>.pages.dev`）。
3. 配置访问规则（Policy）：
   - **Action**：`Allow`
   - **Session Duration**：建议设为 `1 month (30 days)`（手机验证一次后一个月内免重复输验证码）
   - **Include 规则**：选择 `Emails`，仅填入你本人的邮箱地址。
4. **验收检查**：用未授权浏览器/隐身窗口打开网址会被拦截在 Cloudflare Access 登录页；用你自己的手机邮箱收一次验证码登录后即可正常进入。

---

### 步骤 5：词库助手早安消息联调验证
1. 词库助手每天早上对 D1 `english-vocab-db` 执行 1 条查询：
   ```sql
   SELECT COUNT(*) AS due_count
   FROM words
   WHERE paused = 0
     AND next_review_date <= ?1;
   ```
   （其中 `?1` 为当天北京时间日期 `YYYY-MM-DD`）。
2. 在 Grok Bot 聊天中发送早安提醒，例如：
   > 早安！今天有 **6** 张生词卡到期，点此开始复习：`https://<你的 Pages 域名>/`
