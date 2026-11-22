# HearMe AI MVP 开发任务

依据：`docs/prd/PRD.md` 与 `docs/architecture/VOICE_ARCHITECTURE.md`。  
语音主机任务同时遵守 `ai02-remote:/bigdata/hearme-ai/REALTIME_VOICE_IMPLEMENTATION.md`。

业务系统和语音主机分开。下面 M1 属于业务仓库。本仓库实现 M2 到 M4 的语音主机部分，以及 M6 里可以在语音主机上做的验收。

## M1 国际化基础设施

负责人：业务系统。本仓库不实现官网和 App。

- 六种界面语言资源：en、zh-CN、ja、ko、es、fr。
- 界面语言和对话语言分成两个设置。
- 首次界面语言跟随浏览器。
- 偏好持久化在业务库，不把自动识别历史写入数据库。

## M2 本地多语言 ASR

状态：本仓库已实现协议和 0.5 秒流式适配。远程实测以 `reports/realtime/` 为准。

- 使用已安装的 `qwen_asr` 0.0.6。
- 分块 0.5 秒。
- 不安装 vLLM，不升级 CUDA。
- 官方 `streaming_transcribe` 在非 vLLM 后端会拒绝。拒绝后走 transformers 分块识别，仍使用 `state.text`。
- 普通话、英语、粤语、日语、韩语、法语分别测量。粤语不能充当普通话。
- 西班牙语额外测量，不替换上述六种。
- 转录不落盘、不进日志。实验室报告里的对照文本只用于验收，不是用户会话存储。

## M3 多语言 LLM

- 统一语言上下文由网关传入。
- 固定倾听人格：温柔、耐心、不评判、优先倾听、少给建议、不强迫继续、不主动翻译。
- 同一次会话可以切换语言，切换后不重开对话。
- 不同会话不共享文本。
- 语义片段在句号或达到长度的逗号处立刻送出，不等整段生成结束。

## M4 多语言 TTS

- `non_streaming_mode=False` 不作为音频分块手段。
- 每个完整语义片段调用一次 `generate_custom_voice`。
- 不传 instruct。
- 说话人来自探测结果 `speakers.json`。探测失败的语言不填假说话人。
- 没有对应语言声音时返回不可用，不用另一种语言的声音顶上。
- 支持打断。网关停止向外发送该 `request_id` 的后续音频。

## M5 云端多语言适配

本阶段不实现。开始前必须核对当时的官方实时语音文档和实测结果。不能假定存在某个未验证的语言参数。云端切换仍要用户明确授权，新会话必须是干净会话。

## M6 集成验收

在 `ai02-remote` 上执行，本机用 SSH 映射 `18200` 检查 HTTP 接口。

- 六种产品语言的端到端测试。
- 普通话切换英语，英语切换日语。
- 中英混合不因一个外语词跳变。
- 噪声和低置信度保持当前语言。
- 打断、会话清理。
- 本地与云端切换留到 M5。
- 通话结束后上下文清理，GPU 回到约 70 MiB。

语音主机上的执行顺序：

1. TTS 首包计时。
2. 流式 ASR。
3. LLM 第一段语义片段计时。
4. 可取消的 TTS。
5. CPU VAD。
6. Go 网关、回环 P50、打断。
7. 七种语言样本。普通话另备样本。
8. 30 分钟单用户，然后才看并发。
9. 隐私清理。

失败时只允许调整分块长度、ASR `chunk_size_sec`、TTS 片段长度和取消路径。不允许换 GPU、重装三个模型、升级 CUDA 或改系统服务。

## 本仓库当前代码

| 路径 | 职责 |
| --- | --- |
| `realtime/workers/splitter.py` | 语义片段 |
| `realtime/workers/asr_stream.py` | 0.5 秒流式识别适配 |
| `realtime/workers/asr_worker.py` | ASR socket |
| `realtime/workers/llm_worker.py` | LLM socket |
| `realtime/workers/tts_worker.py` | TTS socket |
| `realtime/workers/vad_worker.py` | CPU VAD socket |
| `realtime/internal/language` | 首发语言和切换策略 |
| `realtime/internal/api` | 第三方风格语音 API |
| `realtime/cmd/gateway` | 只绑定 `127.0.0.1:18200` |
| `deploy/realtime-up` | 启动语音进程 |
| `deploy/realtime-down` | 只停止本项目进程并删除临时目录 |
