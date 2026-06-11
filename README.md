# ◎ GooJob — しずかな、就活。

针对日本新卒的自动化就活平台：**网页只负责品牌与注册，之后的一切交给 Bot**。
系统在后台读取就活邮件，自动提取説明会・面接・締切，自动完成企业调研，
并在恰当的时间（前日・直前）把「30 秒企業ブリーフ」连同提醒一起推送到 Telegram / LINE。

```
メール受信 → 意図分類 → 日時/会社/会場 抽出 → 企業リサーチ → 予定登録
                                                      ↓
            Telegram / LINE / console  ←  前日・直前リマインド（ブリーフ付き）
```

## 30 秒体验（无需任何凭证）

```bash
npm install
npm run demo        # → http://localhost:3000  （落地页）
                    # → http://localhost:3000/demo （演练场）
```

在 `/demo` 点击「メールを受信させる」：后端会真实地解析邮件、登记日程、
附上企业简报，并把 Bot 消息实时推到页面右侧的手机里（提醒被压缩到十几秒）。

## 真实运行

```bash
cp .env.example .env   # 填入配置
npm start
```

| 环境变量 | 作用 |
|---|---|
| `APP_SECRET` | IMAP 密码静态加密密钥（必填，任意长随机串） |
| `TELEGRAM_BOT_TOKEN` | @BotFather 创建后填入；长轮询，本地即可全流程 |
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` | LINE 推送 + webhook 签名（webhook 需公网 URL：`/webhooks/line`） |
| `ANTHROPIC_API_KEY` | 可选。Claude（`claude-opus-4-8`）增强邮件理解并撰写企业简报；不填则走规则引擎，全功能可用 |
| `PORT` / `DB_PATH` / `DEMO` | 见 `.env.example` |

用户侧流程：网页注册 → 拿到 6 位连携码 → Telegram 里 `/start 码` 完成绑定 →
（可选）在网页或之后任何时候提交 IMAP 应用密码 → 系统开始静默监听。

Bot 命令：`/today` `/week` `/companies` `/brief 会社名` `/connect` `/settings` `/help`。

## 技术形态

- **Node ≥ 22.5，零框架**：HTTP 路由、调度器、Telegram 客户端均手写；仅 4 个本地依赖
  （`imapflow`、`mailparser`、`@anthropic-ai/sdk` + 传递依赖），删除 `node_modules` 即彻底卸载。
- **node:sqlite** 持久化（`data/`，已 gitignore）；提醒落库，重启自动复原。
- **日语解析内核** `server/jp/datetime.js`：全角、和暦（令和）、时间范围、曜日校验、
  年份按「最近的未来」推断、行内截止语境（提出期限/までに）识别。
- **规则优先、LLM 增强**：无 key 时端到端可用；有 key 时 Claude 负责语义兜底与简报撰写。
- **前端纯手写**（无框架/无构建）：液态玻璃、极光场、磁性按钮、手机模拟对话、
  逐字浮现的连携码；字体自托管（Instrument Serif，30KB），日文走 Hiragino 系统栈；
  支持 `prefers-reduced-motion`。

目录与模块职责见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，
设计系统见 [docs/DESIGN.md](docs/DESIGN.md)，构建日志见 [docs/PROGRESS.md](docs/PROGRESS.md)。

## 验证

```bash
npm test    # 41 个测试：日期内核 / 邮件理解 / 调研 / 调度+管道集成 / API / 核心层
```

集成测试覆盖完整故事线：收信 → 检测通知 → 背景调研 → 前日富提醒（简报+地图）→
直前提醒 → 重复邮件幂等 → 设置开关 → 候选日程 → 締切 → お祈り → 噪声忽略 → Bot 命令全集。

## 边界与路线图（v1 刻意不做）

- 邮箱接入走 IMAP 应用密码（Gmail OAuth、转发别名收件为后续项）
- 注册无密码体系（凭 token/连携码；邮箱所有权验证为后续项）
- LINE 需部署后配置 webhook；Telegram 开箱即用
- 日程候选的一键回复、ics 日历导出、OG 图片 → roadmap
