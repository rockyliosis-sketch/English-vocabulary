# 项目交接文档（Handoff）

## 基本信息
- **当前工作分支**：`feat/20261110-flashcards`（严禁直接修改或合并入 `main`）
- **基线提交号**：`1487118`（`main` 初始提交）
- **最新提交号**：`9f6d184`（完整哈希 `9f6d184f8ad1255469c92b0f90645a1bfaf4fc9d`，新增 KV 数据格式与键名规范 `docs/kv-data-spec.md`；其之上的 HEAD 为更新本交接文档的收尾提交。本轮按要求仍未编写任何业务代码）
- **本地和远端是否已同步**：已同步（本地 `feat/20261110-flashcards` 与远端 `origin/feat/20261110-flashcards` 完全一致，`main` 未触碰）

## 本轮完成内容（第 2 轮：敲定 Cloudflare KV 架构与数据契约，不写业务代码）
- 按用户反馈锁定了全部架构与交互细节：
  1. **卡片两段式翻面**：初始仅展示 `english`、`ipa`、`pos`，隐藏底部按钮；点击翻开后展示 `chinese_sense`、`original_context`（空值兜底显示 `"原场景未提供"`）、`usage_notes` 及标有 `"示例"` 的 `example`（`en` + `zh`），翻开后再显示「记住了 / 有点熟 / 忘了」三个按钮。
  2. **数据存储与回传闭环**：采用 **Cloudflare Pages + Pages Functions + Cloudflare KV**（绑定名 `VOCAB_KV`），放弃 GitHub 文件写入与口令方案；访问控制统一交由 **Cloudflare Access**（仅放行本人邮箱）；保留完成页「一键复制今日结果」作为粘贴回 Grok Bot 聊天的兜底。
  3. **数据规范落盘**：新增 `docs/kv-data-spec.md`，明确了当日卡片键 `daily:{YYYY-MM-DD}`、按词拆分的按钮结果键 `result:{YYYY-MM-DD}:{word_id}`（同时写入 Value 与 Metadata，规避 KV 最终一致性并发丢单并实现同一天同一词只保留最后一次，且支持词库助手 1 次 `list` 请求批量取回）、枚举映射（`remembered` / `familiar` / `forgotten`）及北京时间 `+08:00` 时间戳格式。
  4. **开发拆分规划**：将后续业务编码拆分为 3 个可独立验收、独立提交推送的模块，等待用户及词库助手确认 `docs/kv-data-spec.md` 无误后启动编码。

## 测了什么
- 本轮按约定未编写业务代码，暂无前后端构建或运行测试。
- 使用 Python 脚本对 `docs/kv-data-spec.md` 中全部 4 段 JSON 示例进行了严格语法解析校验，全部合法通过。
- 核验仓库不含任何密钥、Account ID、Namespace ID 或个人邮箱等敏感信息；核验 `main` 分支保持在 `1487118` 未改动，本地与 `origin/feat/20261110-flashcards` 推送同步正常。

## 还剩什么（待确认数据规范后按 3 块推进）
1. **待用户确认**：确认 `docs/kv-data-spec.md` 中的键名、字段结构及 `result` 枚举值（`remembered` / `familiar` / `forgotten`）与词库助手侧完全对齐。
2. **第 1 块编码（前端单卡页面与翻面交互）**：实现移动端单卡 UI、两段式翻面展示（翻开后才出三按钮）、`"原场景未提供"` 兜底、`"示例"` 标识、`localStorage` 本地防丢缓存与完成页「一键复制今日结果」（`+08:00` JSON）。
3. **第 2 块编码（Pages Functions 与 KV 自动读写）**：实现 `GET /api/daily` 与 `POST /api/result`（绑定 `VOCAB_KV`，幂等覆盖 `result:{date}:{word_id}` 的 Value 与 Metadata），前端接入自动回传、弱网重试与 Cloudflare Access 会话过期友好提示。
4. **第 3 块编码（配置说明与联调自测收尾）**：补充不含敏感信息的项目配置模板、Cloudflare Pages / KV / Access 绑定操作说明及自动化边界校验脚本。
