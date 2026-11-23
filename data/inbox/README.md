# 待导入区（data/inbox）

没有 Cloudflare 写权限的 Agent，把 Rocky 的新词放在这里，由能写 D1 的 Agent 导入。完整规则见 [docs/word-intake-rules.md](../../docs/word-intake-rules.md) §7.3。

- 一个词一个文件：`<YYYYMMDD>-<id>.json`，格式同 [`data/templates/word-entry.example.json`](../templates/word-entry.example.json)。
- 自检：`node scripts/import-inbox.mjs --check`
- 生成导入语句：`node scripts/import-inbox.mjs --snapshot <库快照>`，输出到 `data/inbox/out/`（不进 Git）。
- 导入并读回验证后，把文件 `git mv` 到 `data/imported/`。
