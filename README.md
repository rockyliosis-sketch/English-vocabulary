# English-vocabulary 私人英语生词闪卡

面向手机端单手复习的私人英语生词闪卡网站，基于 **Cloudflare Pages + Pages Functions + Cloudflare D1（`VOCAB_DB`）+ Cloudflare Access** 构建。

## 目录结构
- `public/`：移动端单页前端静态资源（`index.html`、`styles.css`、`app.js`、`robots.txt`）
- `functions/`：Cloudflare Pages Functions 服务端接口与排期核心逻辑
  - `functions/_lib/scheduler.js`：北京时间（`+08:00`）、`0..5` 档（`1/3/7/14/30/60` 天）排期状态机、同日重按防连升与例句轮换纯函数
  - `functions/_lib/vocab-repo.js`：D1 数据库读写封装（含早安 `LEFT JOIN` 计数、今日到期队列与原子事务提交）
  - `functions/api/today.js`：`GET /api/today` 获取今日到期及今日已复习卡片
  - `functions/api/review.js`：`POST /api/review` 提交按钮结果并当场更新排期与历史记录
- `migrations/0001_init.sql`：Cloudflare D1 初始化建表 SQL（`words` 主表与 `review_logs` 复习历史表）
- `tests/`：基于 Node.js 内置测试运行器与 `node:sqlite` 的单元测试、接口集成测试与前后端端到端测试
- `docs/`：
  - `docs/kv-data-spec.md`：D1 表结构、排期规则、例句轮换与词库助手 SQL 契约规范
  - `docs/cloudflare-setup.md`：需用户批准执行的 D1 创建、14 词迁入、Pages 绑定与 Access 配置步骤
  - `docs/handoff.md`：每轮开发交接记录

## 本地运行测试
```bash
npm test
```