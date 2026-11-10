# Cloudflare KV 数据格式与键名规范（词库助手 ↔ 闪卡网站契约）

本文档定义生词词库助手（Grok Bot 侧）与闪卡网站（Cloudflare Pages 侧）之间通过 **Cloudflare Workers KV** 交换数据的唯一格式规范。两边均严格按本文档的键名、字段名、枚举值与时区格式读写。

---

## 1. 整体流转与通用约定

1. **职责边界**：
   - **词库助手**：每天排期后，将当日待复习生词写入 KV（`daily:{YYYY-MM-DD}`），并在 Grok Bot 聊天中发送早安提醒与复习链接；次日排期前，从 KV 读取前一日（或未归档日期）的按钮结果（`result:{YYYY-MM-DD}:*`），合并更新词库复习间隔。
   - **闪卡网站**：部署于 Cloudflare Pages（外层由 Cloudflare Access 限制仅本人邮箱可访问），通过 Pages Functions 原生 KV 绑定（绑定变量名约定为 `VOCAB_KV`）读取当日卡片并写入每次按钮点击结果；同时在完成页提供“一键复制今日结果”作为断网/异常兜底。
2. **时区与时间格式**：
   - 所有日期（`YYYY-MM-DD`）与时间戳均以 **北京时间（UTC+08:00，`Asia/Shanghai`）** 为准。
   - 时间戳统一采用带 `+08:00` 偏移量的 ISO 8601 格式：`YYYY-MM-DDTHH:mm:ss+08:00`（例如 `2026-11-10T08:15:30+08:00`）。
3. **编码与保留策略**：
   - 所有 KV Value 均为 UTF-8 编码的合法 JSON 字符串。
   - 建议不设过短 TTL（可永久保留，或统一设置 `expiration_ttl = 7776000` 即 90 天自动清理历史缓存），避免词库助手隔天未及时读取导致数据过期。

---

## 2. 当日卡片数据（词库助手写 → 网站读）

### 2.1 KV 键名（Key）
```text
daily:{YYYY-MM-DD}
```
- 示例：`daily:2026-11-10`
- 配套早安消息链接格式：`https://<你的 Pages 域名>/?date=2026-11-10`（若 URL 未带 `date` 参数，网站默认按当前北京时间取今日日期）。

### 2.2 JSON 结构示例（KV Value）
```json
{
  "schema_version": 1,
  "date": "2026-11-10",
  "generated_at": "2026-11-10T07:30:00+08:00",
  "cards": [
    {
      "id": "crave-v-1",
      "english": "crave",
      "ipa": "/kreɪv/",
      "pos": "v.",
      "chinese_sense": "渴望，热望；恳求",
      "original_context": "读饮食心理文章时看到：People often crave sugar when sleep-deprived.",
      "usage_notes": "比 want 语气强烈得多，常指生理或心理上难以抑制的迫切渴望；可直接接宾语（crave attention）或接 for。",
      "example": {
        "en": "After weeks on the road, she craved a quiet evening at home.",
        "zh": "连续奔波几周后，她无比渴望能在家度过一个安静的夜晚。"
      }
    },
    {
      "id": "candid-adj-1",
      "english": "candid",
      "ipa": "/ˈkændɪd/",
      "pos": "adj.",
      "chinese_sense": "坦率的，直言不讳的；抓拍的",
      "original_context": null,
      "usage_notes": "强调真诚不隐瞒，即使内容未必中听（如 candid feedback）；区别于 frank（更偏直白不客气）。",
      "example": {
        "en": "He gave a candid assessment of why the project fell behind schedule.",
        "zh": "他对项目为何延期给出了坦率的评估。"
      }
    }
  ]
}
```

### 2.3 字段说明与网站展示规则

#### 顶层字段
| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `schema_version` | `number` | 否 | 协议版本号，当前固定为 `1`（缺省按 `1` 处理） |
| `date` | `string` | 是 | 复习批次日期，格式 `YYYY-MM-DD`（北京时间），需与键名后缀一致 |
| `generated_at` | `string` | 否 | 词库助手生成该清单的时间（ISO 8601，`+08:00`） |
| `cards` | `array` | 是 | 当日待复习词卡数组；网站严格按数组顺序一次展示一张。若当日无复习任务可传 `[]` |

#### `cards[]` 单卡字段
| 字段名 | 类型 | 必填 | 展示时机 | 说明与空值兜底规则 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | 是 | 内部标识 | 词条唯一 ID（如 `"crave-v-1"`），同一天数组内不重复；回传结果时原样填入 `word_id` |
| `english` | `string` | 是 | **翻开前（正面）** | 英文单词或短语 |
| `ipa` | `string` | 是 | **翻开前（正面）** | 带重音符号的音标（如 `"/ˈkændɪd/"`） |
| `pos` | `string` | 是 | **翻开前（正面）** | 词性（如 `"v."`、`"n."`、`"adj."`） |
| `chinese_sense` | `string` | 是 | **翻开后（背面）** | 中文释义 |
| `original_context` | `string \| null` | 否 | **翻开后（背面）** | 遇到该词的原场景。**若字段缺失、为 `null` 或去掉首尾空白后为 `""`，网站固定显示 `"原场景未提供"`** |
| `usage_notes` | `string \| null` | 否 | **翻开后（背面）** | 近义词辨析或用法注解（为空或缺失时显示 `"暂无辨析注解"`） |
| `example` | `object` | 是 | **翻开后（背面）** | 每天生成的一条新例句，网站在界面上固定标注 **`"示例"`** 标签 |
| `example.en` | `string` | 是 | **翻开后（背面）** | 英文例句 |
| `example.zh` | `string` | 是 | **翻开后（背面）** | 例句中文翻译 |

> **交互顺序约定**：每张卡初始仅展示 `english`、`ipa`、`pos`，底部三个评分按钮处于隐藏状态；用户点击卡片翻开背面内容后，才显示底部的「记住了 / 有点熟 / 忘了」三个按钮。

---

## 3. 按钮结果数据（网站写 → 词库助手读）

### 3.1 为什么按「日期 + 单词」拆键（而不把整天结果塞进同一个键）
Cloudflare KV 属于最终一致性存储，不支持跨请求的原子“读-改-写”锁。若把整天所有词的结果合存在单个键里，连续快速点击两张卡会出现后一次读取到旧缓存、把前一张卡结果覆盖丢失的问题。

因此，按钮结果采用 **“一词一键（按日期+词 ID 独立覆盖）”** 方案：
- 不同单词写入不同键，快速连点互不干扰、零并发覆盖丢失；
- 同一天对同一个词重复提交时，直接覆盖同一个键，天然保证 **“同一天同一个词只保留最后一次”**；
- 网站写入时将同一份小 JSON（约 110 字节）**同时写入 KV Value 和 KV Metadata**，词库助手只需调用 **1 次**前缀列表接口即可拿齐整天全部结果。

### 3.2 KV 键名（Key）
```text
result:{YYYY-MM-DD}:{word_id}
```
- 示例：`result:2026-11-10:crave-v-1`

### 3.3 结果枚举映射表
| 界面按钮文字 | JSON `result` 字段值 | 含义说明 |
| :--- | :--- | :--- |
| **记住了** | `"remembered"` | 认识且释义准确 |
| **有点熟** | `"familiar"` | 有印象但不够笃定或释义不全 |
| **忘了** | `"forgotten"` | 想不起来或记错 |

### 3.4 JSON 结构示例（KV Value 与 KV Metadata 内容完全一致）
```json
{
  "word_id": "crave-v-1",
  "date": "2026-11-10",
  "result": "remembered",
  "reviewed_at": "2026-11-10T08:14:26+08:00"
}
```

### 3.5 字段说明与幂等覆盖规则
| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `word_id` | `string` | 是 | 对应当日卡片中的 `cards[].id`（如 `"crave-v-1"`） |
| `date` | `string` | 是 | 所属复习批次日期 `YYYY-MM-DD`（与所打开卡片清单的 `date` 一致） |
| `result` | `string` | 是 | 仅限 `"remembered"` / `"familiar"` / `"forgotten"` 三个固定值之一 |
| `reviewed_at` | `string` | 是 | 按下按钮瞬间的北京时间，格式 `YYYY-MM-DDTHH:mm:ss+08:00`（无论手机系统处于何种时区，统一换算为 `+08:00` 输出） |

- **去重与最后一次优先规则**：
  - 唯一键为 `(date, word_id)`，对应唯一 KV 键 `result:{date}:{word_id}`。
  - 若同一天同一个词被提交多次，服务端若检测到已有旧记录且旧记录 `reviewed_at` 更新，则忽略乱序旧包；否则以最新一次按下结果直接覆盖 Value 与 Metadata，确保最终只保留最后一次有效点击。

---

## 4. 词库助手读写 Cloudflare KV 的接口参考

以下路径中的 `<ACCOUNT_ID>` 与 `<NAMESPACE_ID>` 由词库助手在自身运行环境中配置，**切勿写入本代码仓库**。

### 4.1 每天早上写入当日卡片
- **请求**：
  ```http
  PUT https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/storage/kv/namespaces/<NAMESPACE_ID>/values/daily:2026-11-10
  Authorization: Bearer <CLOUDFLARE_API_TOKEN>
  Content-Type: application/json
  ```
- **请求体**：第 2.2 节定义的完整 JSON 字符串。

### 4.2 第二天排期前读取按钮结果（推荐：1 次请求批量读取）
- **请求**：按日期前缀列出结果键（Cloudflare 会在 `result[].metadata` 中直接返回每条结果对象）：
  ```http
  GET https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/storage/kv/namespaces/<NAMESPACE_ID>/keys?prefix=result:2026-11-10:
  Authorization: Bearer <CLOUDFLARE_API_TOKEN>
  ```
- **响应结构摘录**：
  ```json
  {
    "success": true,
    "result": [
      {
        "name": "result:2026-11-10:candid-adj-1",
        "metadata": {
          "word_id": "candid-adj-1",
          "date": "2026-11-10",
          "result": "familiar",
          "reviewed_at": "2026-11-10T08:15:02+08:00"
        }
      },
      {
        "name": "result:2026-11-10:crave-v-1",
        "metadata": {
          "word_id": "crave-v-1",
          "date": "2026-11-10",
          "result": "remembered",
          "reviewed_at": "2026-11-10T08:14:26+08:00"
        }
      }
    ],
    "result_info": {
      "count": 2,
      "cursor": ""
    }
  }
  ```
- **兼容回退**：若某条目的 `metadata` 为空，词库助手可对该键名再调一次单值读取 `GET .../values/result:2026-11-10:crave-v-1` 获取相同的 JSON 内容；若单日复习词数超过 1000 条（日常一般远少于此），按返回的 `result_info.cursor` 翻页即可。

---

## 5. 兜底“一键复制今日结果”文本格式（粘贴至 Grok Bot 聊天用）

当遇到极端网络异常未能自动写入 KV 时，网站完成页点击 **「一键复制今日结果」** 会复制如下标准 JSON 文本（单条元素结构与第 3.4 节完全一致，同一天同一词仅含最后一次结果）：

```json
{
  "schema_version": 1,
  "date": "2026-11-10",
  "exported_at": "2026-11-10T08:20:00+08:00",
  "results": [
    {
      "word_id": "crave-v-1",
      "date": "2026-11-10",
      "result": "remembered",
      "reviewed_at": "2026-11-10T08:14:26+08:00"
    },
    {
      "word_id": "candid-adj-1",
      "date": "2026-11-10",
      "result": "familiar",
      "reviewed_at": "2026-11-10T08:15:02+08:00"
    }
  ]
}
```
词库助手在 Grok Bot 聊天收到该段 JSON 后，可直接按相同的 `(date, word_id)` 覆盖规则合入词库。
