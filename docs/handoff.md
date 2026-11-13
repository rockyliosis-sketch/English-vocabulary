# 项目交接文档（Handoff）

## 基本信息
- **当前工作分支**：`feat/20261110-flashcards`（严禁直接修改或合并入 `main`）
- **基线提交号**：`1487118`（`main` 初始提交）
- **最新提交号**：`7bfb473`（完整哈希 `7bfb47318770b320a07a83591f63beb4bd2c228d`，专门完成 iPhone 17 Pro Max `440×956` 与 12.9 寸 iPad Pro 竖屏 `1024×1366` / 横屏 `1366×1024` 界面适配，未改动任何排期或数据逻辑；其之上的 HEAD 为更新本交接文档的收尾提交）
- **本地和远端是否已同步**：已同步（本地 `feat/20261110-flashcards` 与远端 `origin/feat/20261110-flashcards` 完全一致，`main` 未触碰）

## 本轮完成内容（第 6 轮：iPhone 17 Pro Max 与 12.9 寸 iPad Pro 竖/横屏界面专门适配）
1. **iPhone 17 Pro Max（`440 × 956`）单手操作与安全边距适配（`public/styles.css`）**：
   - **灵动岛与底部横条安全区**：补齐 `viewport-fit: cover` 下四向安全距离，顶部 `padding-top: max(14px, calc(env(safe-area-inset-top, 0px) + 10px))`、左右 `max(18px, calc(env(safe-area-inset-left/right, 0px) + 18px))`、底部 `max(20px, calc(env(safe-area-inset-bottom, 0px) + 14px))`。
   - **容器宽度与单手热区微调**：手机端容器 `max-width` 调为 `460px`（在 `440px` 视口下卡片实际宽度为 `404px`，左右留出 `18px` 舒适边距）；未翻开时（`aria-expanded="false"`）将单词与音标垂直居中，提示胶囊下沉至卡片底部拇指舒适区；翻开后正面收紧在顶部，底部三按钮采用 `sticky` 固定在底部横条之上，单按钮高度 `min-height: 58px`、间距 `12px`，并开启 `touch-action: manipulation`。
2. **12.9 寸 iPad Pro 竖屏（`1024 × 1366`）适配（`@media (min-width: 768px)`）**：
   - 将容器 `max-width` 扩展至 `820px`（卡片宽 `740px`），消除“小手机页浮在中间”的局促感。
   - 背面 `原场景` 与 `近义词辨析 / 注解` 采用双列并排卡片网格（`.field-pair-grid`，`grid-template-columns: repeat(2, minmax(0, 1fr))`），正文与例句限制 `max-width: 65ch`，保证视野开阔的同时单行文字绝不拉得过长；字号（英文 `2.9rem`、中文释义 `1.5rem`、例句 `1.16rem`）与底部三按钮（`max-width: 700px`、`min-height: 64px`、字号 `1.15rem`）同步放大。
3. **12.9 寸 iPad Pro 横屏（`1366 × 1024`）适配（`@media (min-width: 1180px)`）**：
   - 容器 `max-width` 扩展至 `1080px`；未翻开时展示居中 `780px` 宽卡；翻开后采用**左右主从双栏布局**（`grid-template-columns: 310px minmax(0, 1fr)`）——左栏 `310px` 固定锚定词性、英文单词与音标，右栏展示中文释义、双列原场景/辨析与示例例句，既充分利用 `1366px` 横向空间，又控制右栏单行阅读宽度与纵向总高度，底部配 `760px` 宽、`66px` 高的大尺寸三按钮。
4. **排期与数据逻辑零改动**：`functions/`、`migrations/` 与 `public/app.js` 保持未变。

## 测了什么
- 运行 `npm test`（`node --test tests/*.test.mjs`），共 3 个测试文件、9 组测试套件全部通过（0 失败、0 警告）。
- 启动本地服务并调用无头 Chromium 分别在 **`440×956`（iPhone 17 Pro Max 正面与翻开后）**、**`1024×1366`（12.9 寸 iPad Pro 竖屏翻开后）**、**`1366×1024`（12.9 寸 iPad Pro 横屏翻开后）** 四个真实视口下渲染截图并逐一核验版式、行宽与按钮热区。

## 还剩什么（均需你批准后再执行）
- 业务代码、双设备响应式适配与 9 组自动化测试已全部通过；按规则**未执行任何线上部署、未创建线上存储、未连接自动部署、未触碰 `main`**。
- 待你批准上线后，按 `docs/cloudflare-setup.md` 依次创建 D1 数据库、由词库助手迁入 14 个现有词、确定 Cloudflare Pages 生产分支并绑定 `VOCAB_DB`、开启 Cloudflare Access。

## 2026-11-13：示例去重与相关词（工作区已实施，提交受环境限制）

- 本条为最新交接；上方第 6 轮的分支、同步和上线记录为历史记录。本轮分支为 `feat/20261113-examples-and-word-family`，从 `7fa9dfe` 开出。
- 完成示例候选池过滤、相关词迁移/API/背面展示、两份待审 SQL（39 词共 117 项相关词）及内存 SQLite 保护验证。四个实现块的 `npm test` 均通过；最终 4 个测试文件、18 个用例通过。
- `.git` 只读导致暂存和提交失败，HEAD 仍为 `7fa9dfe`；五块改动及交接文档留在工作区，分块补丁在 `/tmp/vocab-change-blocks/`。没有 push、改 main、force、部署或连接远程 D1。
- 截图检查尝试受沙箱 listen/socket 权限阻止，待目标设备 Safari 补验。0002 必须在上线读取新列的代码之前执行；两个数据 SQL 均为“不执行、待 Rocky 审”。
- 详细文件清单、待创建的五个提交、测试与 SQL 顺序、快照例句不足词条见 [本轮交接](<交接 - 示例去重与相关词 - 2026-11-13.md>)。
