# HearMe

HearMe 的语音主机和正式产品文档在这个仓库。官网、App 和账号系统单独实现。

产品规则见 `docs/prd/PRD.md`。架构见 `docs/architecture/VOICE_ARCHITECTURE.md`。任务见 `docs/tasks/MVP_TASKS.md`。

对话语言策略是自动识别。首发语言是英语、普通话、日语、韩语、西班牙语和法语。P50 ≤ 1.2 秒、打断 ≤ 300 ms 和 30 分钟通话是验收目标。2026-11-22 的远程实测在 `docs/reports/2026-11-22-remote-results.md`，P50 是 1284 ms，目标尚未达到。

业务 Web 在 `web/`。本地开发：

```bash
cd web && npm run dev
```

语音网关通过 `VOICE_API_BASE` 访问，默认 `http://127.0.0.1:18200`。界面不保存录音或转录。
