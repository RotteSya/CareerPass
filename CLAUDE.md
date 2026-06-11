# GooJob — project rules

- Runtime: Node >= 22.5, ESM (`"type": "module"`). No build step, no bundler.
- Dependencies stay project-local and minimal (currently: imapflow, mailparser). Never add global tools.
- Database: built-in `node:sqlite` (`DatabaseSync`), file lives in `./data/` (gitignored).
- Frontend is hand-written vanilla HTML/CSS/JS in `web/` — no framework. Keep it that way.
- All user-facing product copy is Japanese; repo docs are Chinese; code identifiers/comments are English.
- Times: store epoch ms, format with `Intl.DateTimeFormat` + `Asia/Tokyo` explicitly. Never rely on process TZ.
- Verify with `npm test` (node:test) after touching server code.
- Keep `docs/PROGRESS.md` updated when finishing a module.
