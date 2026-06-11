# 构建日志

按模块推进，每个模块完成即自验 + 提交。

- [x] M0 脚手架：git init、package.json、docs、env 模板
- [x] M1 服务核心：config / lib(http,crypto,clock,log) / db schema —— 4 测试
- [x] M2 日语解析内核：jp/datetime + textnorm + format —— 20 测试
      （修复：截止语境跨行泄漏 → 限定行内；远日期 fmtWhen 重复 → 相对词白名单）
- [x] M3 邮件理解：classify + extract + 高仿真 fixtures —— 7 测试
      （修复：候补③被邻行「ご回答期限」误标为締切）
- [x] M4 企業リサーチ：wikipedia-ja / google news rss / 站点 meta + Claude 可选简报 —— 3 测试
- [x] M5 Bot：channel 抽象、telegram(长轮询)/line(webhook)/console、日文文案、命令路由
- [x] M6 调度与管道：持久化提醒、pipeline 全意图分支、imap watcher、HTTP API、demo 注入/SSE
      —— 集成 7 测试 + API 1 测试；并以 `npm run demo` 实机验证完整弧线
      （实机发现并修复：fmtWhen 日期重复、地图按钮缺真实住址 → events.address 列）
- [x] M7 前端：落地页（hero/嘈杂→安静/しくみ/できること/注册流/FAQ/页脚）+ /demo 演练场
      —— 预览截图逐区自验（含移动端、表单全流程、SSE 实时通知、压缩提醒到达）
- [x] M8 收尾：README、DESIGN、最终全量测试与提交

最终状态：41 tests green；演示模式零凭证可完整体验；真实模式需 .env。
