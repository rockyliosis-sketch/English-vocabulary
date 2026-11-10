# Cloudflare D1 词库正本、排期与历史数据规范（词库助手 ↔ 闪卡网站契约）

> **版本演进说明（第 3 轮更新）**：根据最新分工，词库正本迁入用户的 Cloudflare 账号，排期由闪卡网站在按钮点击时当场计算，词库助手直接通过已连接的 Cloudflare 集成读写数据（无需单独配置 API 令牌）。为严格满足**“同一天对同一个词按多次只算最后一次，且从当天第一次按之前的状态算起”**、**“保留每次复习历史记录”**以及**“助手每天早上最少请求拿到今日到期词数”**，底层存储由 Cloudflare KV 升级为强一致性的 **Cloudflare D1（Serverless SQLite，Pages 绑定变量名约定为 `VOCAB_DB`）**。

---

## 1. 角色分工与通用约定

1. **闪卡网站（Cloudflare Pages + Pages Functions + D1 `VOCAB_DB`）**：
   - 打开固定网址即查询当日到期词（`paused = 0` 且 `next_review_date <= 今日北京时间`），按正面（`english`、`ipa`、`pos`）→ 点击翻开背面（`chinese_sense`、`original_context`、`usage_notes`、当日轮换的 1 条 `"示例"` 例句）→ 显示底部三按钮（记住了 / 有点熟 / 忘了）的顺序交互。
   - 用户每次按下按钮，网站在 D1 事务中当场计算并更新该词的 `stage`、`next_review_date`、`last_feedback`、`last_feedback_at`，同时写入/更新 `review_logs` 复习历史表。
   - 完成页保留「一键复制今日结果」按钮作为极端断网兜底。
2. **词库助手（Grok Bot，通过已连接的 Cloudflare 直接读写 D1）**：
   - **首次迁移**：网站建好后，将现有 14 个词（连同每个词补齐的 3～5 条例句及现有排期状态）一次性写入 D1 `words` 表。
   - **日常收新词**：将新词写入 D1 `words` 表（初始 `stage = 0`，`next_review_date = 添加次日`）。
   - **每天早上提醒**：执行 **1 条 SQL 计数查询**拿到今天到期词数，在 Grok Bot 聊天里发一句话（含固定链接与今天有几张）。
   - **备份**：助手侧仅保留词库备份，不再每天生成“当日卡片清单”。
3. **时区与时间格式**：
   - 一律使用 **北京时间（UTC+08:00，`Asia/Shanghai`）**。
   - 日期格式：`YYYY-MM-DD`（如 `2026-11-10`）。
   - 时间戳格式：带 `+08:00` 的 ISO 8601 字符串 `YYYY-MM-DDTHH:mm:ss+08:00`（如 `2026-11-10T08:14:26+08:00`）。

---

## 2. D1 数据库表结构与 JSON 数据格式

数据库共包含两张表：`words`（单词主表 / 词库正本）和 `review_logs`（按钮历史记录表）。

### 2.1 建表 SQL（Schema）

```sql
-- 1. 单词主表（词库正本）
CREATE TABLE IF NOT EXISTS words (
  id TEXT PRIMARY KEY,
  english TEXT NOT NULL,
  ipa TEXT NOT NULL,
  pos TEXT NOT NULL,
  chinese_sense TEXT NOT NULL,
  original_context TEXT,
  usage_notes TEXT,
  examples_json TEXT NOT NULL CHECK (json_valid(examples_json) AND json_array_length(examples_json) >= 1),
  added_at TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 5),
  next_review_date TEXT NOT NULL,
  last_feedback TEXT CHECK (last_feedback IN ('remembered', 'familiar', 'forgotten') OR last_feedback IS NULL),
  last_feedback_at TEXT,
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_words_due
  ON words(paused, next_review_date);

-- 2. 按钮复习历史表（按 词ID + 复习日期 唯一，记录当天首次按之前的基准状态与最终有效结果）
CREATE TABLE IF NOT EXISTS review_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id TEXT NOT NULL REFERENCES words(id),
  review_date TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('remembered', 'familiar', 'forgotten')),
  stage_before INTEGER NOT NULL CHECK (stage_before BETWEEN 0 AND 5),
  next_review_date_before TEXT NOT NULL,
  stage_after INTEGER NOT NULL CHECK (stage_after BETWEEN 0 AND 5),
  next_review_date_after TEXT NOT NULL,
  first_reviewed_at TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  press_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(word_id, review_date)
);

CREATE INDEX IF NOT EXISTS idx_review_logs_date
  ON review_logs(review_date);
```

---

### 2.2 单词条目与例句格式（`words` 表字段说明）

| 字段名 | SQLite 类型 | JSON 类型 | 必填 | 说明与网站展示规则 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | `string` | 是 | 主键，词条唯一标识（如 `"crave-v-1"`） |
| `english` | `TEXT` | `string` | 是 | 英文单词或短语（**翻开前正面显示**） |
| `ipa` | `TEXT` | `string` | 是 | 带重音的音标，如 `"/kreɪv/"`（**翻开前正面显示**） |
| `pos` | `TEXT` | `string` | 是 | 词性，如 `"v."`、`"adj."`（**翻开前正面显示**） |
| `chinese_sense` | `TEXT` | `string` | 是 | 中文意思（**翻开后背面显示**） |
| `original_context` | `TEXT` | `string \| null` | 否 | 遇到该词的原场景。**为 `NULL` 或空字符串时，网站固定显示 `"原场景未提供"`** |
| `usage_notes` | `TEXT` | `string \| null` | 否 | 近义词辨析或用法注解（为空时显示 `"暂无辨析注解"`） |
| `examples_json` | `TEXT` | `array<object>` | 是 | 词库助手一次写好的 **3～5 条例句**，在库中存为 JSON 数组字符串，每项含 `en`（英文例句）与 `zh`（中文翻译）。网站每天轮换展示其中 1 条，并固定标 **`"示例"`** |
| `added_at` | `TEXT` | `string` | 是 | 收词时间（北京时间 `+08:00`，如 `"2026-11-10T09:00:00+08:00"`；既有词若仅知日期可填 `"YYYY-MM-DDT00:00:00+08:00"`） |
| `stage` | `INTEGER` | `number` | 是 | 当前档位，整数 `0`～`5`，对应间隔阶梯 `[1, 3, 7, 14, 30, 60]` 天；新词固定从 `0` 开始 |
| `next_review_date` | `TEXT` | `string` | 是 | 下次复习日期 `YYYY-MM-DD`（北京时间）；新词固定为**添加当天的下一天** |
| `last_feedback` | `TEXT` | `string \| null` | 否 | 最近一次按钮结果：`"remembered"` / `"familiar"` / `"forgotten"`，新词未复习前为 `null` |
| `last_feedback_at` | `TEXT` | `string \| null` | 否 | 最近一次按下按钮的时间 `YYYY-MM-DDTHH:mm:ss+08:00`，新词未复习前为 `null` |
| `paused` | `INTEGER` | `boolean` | 是 | 是否暂停复习：库中存 `0`（正常）或 `1`（暂停）；`paused = 1` 的词不出现在每日复习中 |

#### 单词条目完整 JSON 示例（含 3～5 条例句）
```json
{
  "id": "crave-v-1",
  "english": "crave",
  "ipa": "/kreɪv/",
  "pos": "v.",
  "chinese_sense": "渴望，热望；恳求",
  "original_context": "读饮食心理文章时看到：People often crave sugar when sleep-deprived.",
  "usage_notes": "比 want 语气强烈得多，常指生理或心理上难以抑制的迫切渴望；可直接接宾语（crave attention）或接 for。",
  "examples": [
    {
      "en": "After weeks on the road, she craved a quiet evening at home.",
      "zh": "连续奔波几周后，她无比渴望能在家度过一个安静的夜晚。"
    },
    {
      "en": "Young children naturally crave approval from their parents.",
      "zh": "年幼的孩子天性渴望得到父母的认可。"
    },
    {
      "en": "My body was craving sleep after the overnight flight.",
      "zh": "熬夜红眼航班之后，我的身体极度渴求睡眠。"
    }
  ],
  "added_at": "2026-11-01T21:15:00+08:00",
  "stage": 1,
  "next_review_date": "2026-11-10",
  "last_feedback": "remembered",
  "last_feedback_at": "2026-11-07T08:12:00+08:00",
  "paused": false
}
```
> 注：写入 D1 `words.examples_json` 列时，将上述 `examples` 数组序列化为 JSON 字符串即可。

#### 网站每日例句轮换规则（保证跨复习日必换、同日刷新不变）
设单词共有 $N$ 条例句（$3 \le N \le 5$），该词在今天之前已发生过 `past_review_days` 次有效复习（即 `SELECT COUNT(*) FROM review_logs WHERE word_id = ? AND review_date < today`），且截至今天首次打开时的逾期天数为 `overdue_days = max(0, today - next_review_date_before_today)`，则今天展示的例句下标为：
$$\text{index} = (\text{past\_review\_days} + \text{overdue\_days}) \bmod N$$
- **为什么不用“当前日期 mod $N$”**：因为间隔阶梯里有 `3` 天、`30` 天、`60` 天，若 $N=3$ 且按日期取模，隔 3 天、30 天或 60 天回来复习时余数相同，会永远看到同一条例句；而按 `past_review_days + overdue_days` 取模，既保证每次进入下一轮复习必定换下一条例句，又保证同一天内多次刷新或点按钮后例句固定不跳变。

---

### 2.3 按钮历史记录格式（`review_logs` 表字段说明）

每次按下按钮不仅更新 `words` 表当前状态，还会写入 `review_logs` 表。同一天（`review_date`）对同一个词（`word_id`）按多次时，**以 `(word_id, review_date)` 为唯一键只保留当天最后一次有效结果，但始终锁死当天第一次按之前的 `stage_before` 与 `next_review_date_before`**：

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | `INTEGER` | 自增主键 |
| `word_id` | `TEXT` | 对应 `words.id`（如 `"crave-v-1"`） |
| `review_date` | `TEXT` | 复习当日的北京日期 `YYYY-MM-DD` |
| `result` | `TEXT` | 当天最后一次按下的按钮值：`"remembered"`（记住了）/ `"familiar"`（有点熟）/ `"forgotten"`（忘了） |
| `stage_before` | `INTEGER` | **当天第一次按之前的档位**（同日后续重按时绝不覆盖此字段，作为重算的唯一基准） |
| `next_review_date_before` | `TEXT` | **当天第一次按之前的下次复习日期**（同日后续重按时绝不覆盖此字段） |
| `stage_after` | `INTEGER` | 基于 `stage_before` 与 `result` 算出的新档位（`0`～`5`） |
| `next_review_date_after` | `TEXT` | 基于 `stage_before`、`review_date` 与 `result` 算出的新下次复习日期 |
| `first_reviewed_at` | `TEXT` | 当天第一次按下按钮的北京时间（`+08:00`） |
| `reviewed_at` | `TEXT` | 当天最后一次按下按钮的北京时间（`+08:00`） |
| `press_count` | `INTEGER` | 当天对该词按下按钮的累计次数（首次为 `1`，同日每重按一次 `+1`） |

#### 按钮历史单条 JSON 示例
```json
{
  "id": 42,
  "word_id": "crave-v-1",
  "review_date": "2026-11-10",
  "result": "remembered",
  "stage_before": 1,
  "next_review_date_before": "2026-11-10",
  "stage_after": 2,
  "next_review_date_after": "2026-11-17",
  "first_reviewed_at": "2026-11-10T08:14:10+08:00",
  "reviewed_at": "2026-11-10T08:14:26+08:00",
  "press_count": 2
}
```

---

## 3. 排期计算规则与同日重按防连升机制

### 3.1 档位与间隔阶梯定义
- 档位范围：`0, 1, 2, 3, 4, 5`
- 间隔阶梯数组：`STAGE_DAYS = [1, 3, 7, 14, 30, 60]`
  - 第 `0` 档：`1` 天
  - 第 `1` 档：`3` 天
  - 第 `2` 档：`7` 天
  - 第 `3` 档：`14` 天
  - 第 `4` 档：`30` 天
  - 第 `5` 档：`60` 天

### 3.2 状态转移公式（严格基于当天首次按之前的 `base_stage` 计算）
设按下按钮当天的北京日期为 `review_date`（`YYYY-MM-DD`），当天第一次按之前的档位为 `base_stage`：

1. **新词入库**：
   - `stage = 0`
   - `next_review_date = add_days(added_date, 1)`（添加当天的下一天）
2. **记住了（`result = "remembered"`）**：
   - `stage_after = min(base_stage + 1, 5)`
   - `next_review_date_after = add_days(review_date, STAGE_DAYS[stage_after])`
   - （第 5 档再记住：`stage_after = 5`，仍然隔 `60` 天）
3. **有点熟（`result = "familiar"`）**：
   - `stage_after = max(base_stage - 1, 0)`
   - `next_review_date_after = add_days(review_date, 1)`（第二天再复习）
4. **忘了（`result = "forgotten"`）**：
   - `stage_after = 0`
   - `next_review_date_after = add_days(review_date, 1)`（回到第 0 档，第二天再复习）

#### 全档位转移对照表
| 当天首次按之前的 `base_stage` | 点「记住了」(`remembered`) 后的 `(stage_after, 间隔)` | 点「有点熟」(`familiar`) 后的 `(stage_after, 间隔)` | 点「忘了」(`forgotten`) 后的 `(stage_after, 间隔)` |
| :---: | :---: | :---: | :---: |
| `0` | `1` 档，`review_date + 3 天` | `0` 档，`review_date + 1 天` | `0` 档，`review_date + 1 天` |
| `1` | `2` 档，`review_date + 7 天` | `0` 档，`review_date + 1 天` | `0` 档，`review_date + 1 天` |
| `2` | `3` 档，`review_date + 14 天` | `1` 档，`review_date + 1 天` | `0` 档，`review_date + 1 天` |
| `3` | `4` 档，`review_date + 30 天` | `2` 档，`review_date + 1 天` | `0` 档，`review_date + 1 天` |
| `4` | `5` 档，`review_date + 60 天` | `3` 档，`review_date + 1 天` | `0` 档，`review_date + 1 天` |
| `5` | `5` 档，`review_date + 60 天` | `4` 档，`review_date + 1 天` | `0` 档，`review_date + 1 天` |

### 3.3 同一天对同一个词按多次的原子处理流程
当网站收到 `(word_id, result)` 请求时（服务端取当前北京时间 `now_iso` 与北京日期 `today`）：
1. 查询 `words` 表当前行与 `review_logs` 表中 `(word_id, review_date = today)` 的记录。
2. **确定基准状态**：
   - 若 `review_logs` 中**尚无**今天该词的记录（当天第 1 次按）：
     - `base_stage = words.stage`
     - `base_due = words.next_review_date`
   - 若 `review_logs` 中**已有**今天该词的记录（当天第 2、3...N 次重按）：
     - **`base_stage = review_logs.stage_before`**（忽略已被第 1 次点击改过的 `words.stage`！）
     - **`base_due = review_logs.next_review_date_before`**
3. 用 `base_stage` 和本次 `result` 按 3.2 公式算出 `stage_after` 与 `next_review_date_after`。
4. 在单个 D1 事务（`db.batch`）中同时执行：
   ```sql
   -- 语句 1：写入或覆盖今日历史记录（注意 DO UPDATE 绝不修改 stage_before 与 next_review_date_before）
   INSERT INTO review_logs (
     word_id, review_date, result,
     stage_before, next_review_date_before,
     stage_after, next_review_date_after,
     first_reviewed_at, reviewed_at, press_count
   ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 1)
   ON CONFLICT(word_id, review_date) DO UPDATE SET
     result = excluded.result,
     stage_after = excluded.stage_after,
     next_review_date_after = excluded.next_review_date_after,
     reviewed_at = excluded.reviewed_at,
     press_count = review_logs.press_count + 1;

   -- 语句 2：将主表状态同步为今日最后一次按键算出的结果
   UPDATE words
   SET stage = ?6,
       next_review_date = ?7,
       last_feedback = ?3,
       last_feedback_at = ?8
   WHERE id = ?1;
   ```
这样哪怕同一天连按 5 次「记住了」，`stage_before` 始终等于当天第一次按之前的档位，最终只会升 1 档；若先按「记住了」又改按「忘了」，最终状态直接从当天首次按之前的状态重算为第 `0` 档、次日复习。

---

## 4. 词库助手的 D1 操作规范（最少请求 & 防冲突）

### 4.1 每天早上获取“今天有几张”（仅需 1 次请求）
词库助手每天早上只需对 D1 执行 **1 条 SQL 查询**（将 `?1` 替换为当天北京日期，如 `'2026-11-10'`）：

```sql
SELECT COUNT(*) AS due_count
FROM words
WHERE paused = 0
  AND next_review_date <= ?1;
```
- **返回结果示例**：
  ```json
  [
    {
      "due_count": 6
    }
  ]
  ```
- 若希望即使在当天你已经提前背了几张后，助手仍能同时知道“今日总任务数”与“剩余未按数”，可用：
  ```sql
  SELECT
    COUNT(*) AS total_due_today,
     COALESCE(SUM(CASE WHEN r.word_id IS NULL THEN 1 ELSE 0 END), 0) AS remaining_due_today
  FROM words w
  LEFT JOIN review_logs r
    ON r.word_id = w.id AND r.review_date = ?1
  WHERE w.paused = 0
    AND (w.next_review_date <= ?1 OR r.word_id IS NOT NULL);
  ```

### 4.2 写入新词（如何避免与网站同时改到同一个词）
通过以下 3 层机制保证助手写词与网站背词**零冲突**：
1. **日期天然错开**：新词 `next_review_date` 设为添加次日（`tomorrow`），而网站只拉取 `next_review_date <= today` 的到期词，因此当天新入库的词不会出现在当天复习界面中。
2. **D1 行级隔离**：每个单词是 `words` 表中独立的一行，助手 `INSERT` 新词与网站 `UPDATE` 既有词操作的是不同行，不会发生整包覆盖。
3. **同 ID 防误洗档位（严禁 `INSERT OR REPLACE`）**：
   - 助手新增单词时，统一使用 `ON CONFLICT(id) DO NOTHING`（若该 `id` 已存在则不覆盖既有复习进度）：
     ```sql
     INSERT INTO words (
       id, english, ipa, pos, chinese_sense,
       original_context, usage_notes, examples_json,
       added_at, stage, next_review_date,
       last_feedback, last_feedback_at, paused
     ) VALUES (
       ?1, ?2, ?3, ?4, ?5,
       ?6, ?7, ?8,
       ?9, 0, ?10,
       NULL, NULL, 0
     )
     ON CONFLICT(id) DO NOTHING;
     ```
   - 若助手需要为已存在的词**修正释义、音标、辨析或补充例句**，只允许更新静态内容列，**绝不触碰 `stage`、`next_review_date`、`last_feedback`、`last_feedback_at`**：
     ```sql
     UPDATE words
     SET english = ?2,
         ipa = ?3,
         pos = ?4,
         chinese_sense = ?5,
         original_context = ?6,
         usage_notes = ?7,
         examples_json = ?8
     WHERE id = ?1;
     ```

### 4.3 现有 14 个词的一次性搬迁格式
网站就绪后，助手将现有 14 个词迁入 D1 时，保留每个词现有的 `id`、`english`、`ipa`、`pos`、`chinese_sense`、`original_context`、`usage_notes`、`added_at`、`stage`、`next_review_date`、`last_feedback`、`last_feedback_at`、`paused`，并为每个词补齐 3～5 条例句填入 `examples_json` 即可。

---

## 5. 完成页“一键复制今日结果”兜底格式

当全部到期卡片复习完毕后，完成页除展示今日统计（记住了 / 有点熟 / 忘了 各几张）外，仍提供 **「一键复制今日结果」** 按钮，导出如下包含前因后果的 JSON（可供备份或发给 Grok Bot 核对）：

```json
{
  "schema_version": 2,
  "date": "2026-11-10",
  "exported_at": "2026-11-10T08:20:00+08:00",
  "results": [
    {
      "word_id": "crave-v-1",
      "review_date": "2026-11-10",
      "result": "remembered",
      "stage_before": 1,
      "next_review_date_before": "2026-11-10",
      "stage_after": 2,
      "next_review_date_after": "2026-11-17",
      "reviewed_at": "2026-11-10T08:14:26+08:00",
      "press_count": 1
    }
  ]
}
```
