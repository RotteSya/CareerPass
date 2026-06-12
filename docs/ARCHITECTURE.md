# GooJob 架构

> しずかな、就活。— 把就活的嘈杂邮件，变成恰到好处的一条消息。

## 总览

```
                 ┌──────────────────────────────────────────────┐
                 │                  GooJob Server                │
                 │              (Node 24, zero-framework)        │
                 │                                              │
  学生のメール ──▶│  mail/watcher (IMAP IDLE / demo inject)       │
                 │        │                                     │
                 │        ▼                                     │
                 │  mail/classify ──▶ mail/extract               │
                 │   (求人関連判定)    (会社名・日時・URL・締切)     │
                 │        │                                     │
                 │        ▼                                     │
                 │  pipeline ──▶ db (node:sqlite)                │
                 │   │   │                                      │
                 │   │   └──▶ research (Wikipedia/News/HP/Claude)│
                 │   ▼                                          │
                 │  reminders (scheduler, JST)                   │
                 │        │                                     │
                 │        ▼                                     │
                 │  bot/channel ──┬─ telegram (long polling)     │
                 │                ├─ line     (webhook, 部署后)  │
                 │                └─ console  (demo/无凭证)      │
                 │                                              │
                 │  lib/http ──▶ web/ 静态页 + /api/* + SSE       │
                 └──────────────────────────────────────────────┘
```

## 模块

| 路径 | 职责 |
|---|---|
| `server/index.js` | 启动：装配 config → db → channels → watcher → scheduler → http |
| `server/config.js` | 环境变量解析，demo 开关 |
| `server/lib/http.js` | 极小路由器 + 静态文件 + JSON/SSE 工具（零依赖） |
| `server/lib/crypto.js` | IMAP 密码 AES-256-GCM 加密存储 |
| `server/lib/clock.js` | 可注入时钟（测试 / demo 时间压缩） |
| `server/db.js` | node:sqlite schema + 全部查询 |
| `server/jp/datetime.js` | 日语日期时间解析（全角、和暦、範囲、曜日校验、年推断） |
| `server/mail/classify.js` | 邮件意图分类：invite_confirmed / candidates / reschedule / rejection / ack / deadline / ignore |
| `server/mail/extract.js` | 公司名（发件人/署名/本文）、日时、会場/URL、締切 提取 |
| `server/mail/watcher.js` | ImapFlow IDLE 监听 + 重连；demo 模式走注入 |
| `server/mail/samples.js` | 高仿真日语就活邮件 fixtures（demo + 测试共用） |
| `server/research/research.js` | Wikipedia JA 概要 + Google News RSS + 公式サイト meta → 企業ブリーフ |
| `server/research/llm.js` | 可选 Claude 增强（邮件结构化抽取 + ブリーフ撰写），无 key 自动跳过 |
| `server/bot/channel.js` | 通道抽象 + 注册表；按用户偏好路由 |
| `server/bot/telegram.js` | 原生 fetch 长轮询，deep-link 绑定，命令与按钮 |
| `server/bot/line.js` | Messaging API push/reply + webhook 签名校验 |
| `server/bot/console.js` | 控制台通道（开发/demo），同时向 SSE 广播 |
| `server/bot/messages.js` | 全部日文文案模板（品牌语气统一在这里） |
| `server/bot/commands.js` | /today /week /companies /brief /connect /settings /help |
| `server/reminders.js` | 持久化提醒调度（前日・直前・朝のダイジェスト） |
| `server/pipeline.js` | 邮件 → 事件/公司 → 调研 → 即时通知 + 排程，去重与改期处理 |
| `server/api.js` | POST /api/register、POST /api/imap、demo 注入、SSE |
| `web/` | 落地页（品牌 + 注册）与 /demo 演练场，纯手写 |

## 关键决策

1. **零框架**：HTTP 路由、调度器、Telegram 客户端均手写（各 ~100 行），仅 IMAP/MIME 解析用库。依赖面最小，全部可审计。
2. **规则优先，LLM 增强**：无任何 API key 时规则引擎端到端可用；设 `ANTHROPIC_API_KEY` 后 Claude 接管语义抽取与ブリーフ撰写。优雅降级。
3. **通道抽象**：`send(user, msg)` 一个接口，Telegram/LINE/console 三实现。Telegram 长轮询本地即可全流程；LINE 需公网 webhook（部署后配置）。
4. **时间一律 JST**：存 epoch ms，展示用 `Intl` + `Asia/Tokyo`；年份缺省按「最近的未来」推断。
5. **demo 模式**：`npm run demo` 注入仿真邮件、提醒时间压缩为秒级、bot 输出走 SSE 到 /demo 页面——无需任何凭证即可看到完整闭环。

## 数据模型（sqlite）

- `users` — email、grad_year、channel、chat_id、link_code、imap_*（加密）、settings_json
- `companies` — user_id、name、domain、research_json、researched_at
- `events` — user_id、company_id、type(説明会/面接/面談/締切)、starts_at、location、url、status、source
- `reminders` — event_id、fire_at、kind(day_before/soon/morning)、sent_at
- `seen_mail` — user_id、message_id（幂等防重复处理）

## 安全

- IMAP 密码 AES-256-GCM（key 由 APP_SECRET scrypt 派生）静态加密。
- 推荐使用应用专用密码（Gmail アプリパスワード），仅 IMAP 只读操作。
- LINE webhook 校验 `x-line-signature`。
- 账号操作需注册时返回的 token；无密码体系（v1 范围，见 roadmap）。

## Roadmap（超出 v1 的明确边界）

- Gmail OAuth（替代应用密码）、转发别名收件（`u_xxx@in.goojob.app`）
- 多日程候选的一键回答、カレンダー（ics/Google Calendar）导出
- OG 图片、多语言 UI
