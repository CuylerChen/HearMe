# HearMe AI 语音技术架构

本文件把已确认的 PRD v1.1 落到语音主机。业务 Web / App 不部署在语音主机上。

## 主机边界

`ai02-remote` 只运行语音相关服务。它监听 `127.0.0.1:18200`，不监听 `0.0.0.0`。本机通过 SSH 端口映射访问这个地址做验收。

```text
业务系统 Web / PWA / 未来 App
        |
        |  HTTPS 或内网调用，像调用第三方语音 API
        v
HearMe Voice API  127.0.0.1:18200
        |
        +-- 会话、同意、打断、语言状态
        |
        +-- Unix socket
                |
                +-- Silero VAD        CPU
                +-- Qwen3-ASR-0.6B    GPU
                +-- Qwen3-4B-AWQ      GPU
                +-- Qwen3-TTS-0.6B    GPU
```

云端 Realtime 仍是产品架构的另一条链路。本阶段不安装、不调用未经验证的云端实时接口。云端语言参数以当时官方文档和实测为准。

## 语言层

语言策略由独立的 Language Intelligence Layer 管理，不写进某个 ASR、LLM 或 TTS 供应商的业务分支。以后替换模型，不重做产品的语言规则。

产品语言代码：

```text
en  zh-CN  ja  ko  es  fr
```

本地模型使用的英文名：

```text
Chinese  English  Japanese  Korean  Spanish  French
```

粤语在模型里的名字是 `Cantonese`。它不映射到 `zh-CN`。普通话验收必须使用单独的普通话样本。现有粤语音频不能算普通话通过。西班牙语是首发语言，在当前 GPU 阶段按额外测量记录，不替换上面六种引擎测量语言中的任何一种。

引擎测量六种是：普通话、英语、粤语、日语、韩语、法语。产品首发六种是：英语、普通话、日语、韩语、西班牙语、法语。两份清单职责不同，不能互相覆盖。

切换规则：

- 当前语言为空时，一段足够长且稳定的首发语言可以设定第一次回复语言。
- 从已有语言切走，需要连续两个确认片段，置信门槛 0.80，短于约 1.5 秒的片段不单独触发。
- 混合语言标签和粤语标签不触发切换。
- 不确定时保持当前语言。首选语言只在不确定时作参考。
- 语言状态只在当前会话内存中，通话结束即清理。

## 本地处理链路

```text
客户端音频
    |
    v
VAD
    |
    v
Streaming ASR，分块 0.5 秒
    |
    v
Language Policy
    |
    v
Local LLM，固定倾听人格
    |
    v
语义片段
    |
    v
Multilingual TTS，每个完整片段立刻合成
    |
    v
第一段音频立即返回
```

已安装的 `qwen_asr` 0.0.6 带有 `streaming_transcribe`。该实现只接受 vLLM 后端。本阶段不安装 vLLM，也不升级 CUDA。驱动 570.169 只支持 CUDA 12.8，两个虚拟环境保持 `torch 2.11.0+cu128`。

因此流式识别先调用 `init_streaming_state` / `streaming_transcribe` / `finish_streaming_transcribe`。若返回 vLLM-only 错误，就用已安装的 transformers `transcribe()`，按同样的 0.5 秒分块重放已积累音频，并把结果写入 `state.text`。这不是更换模型，也不是安装新后端。

`generate_custom_voice(..., non_streaming_mode=False)` 只模拟流式文本，不吐出音频块。首包延迟按「LLM 出一个完整语义片段就立刻合成」测量。0.6B 模型不传 instruct。

用户一开口，网关取消当前 `request_id` 的后续音频。已经在 GPU 上的合成可以跑完，但结果不再向外发送。

## 接口

语音 API 与第三方语音 API 的用法相同。状态接口不返回转录、回复文本或语言识别历史。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/healthz` | 进程健康，不含对话 |
| GET | `/v1/languages` | 六种首发语言和测试状态 |
| GET | `/v1/voices` | 四种声音目录，未通过测试的语言保持关闭 |
| POST | `/v1/sessions` | 创建会话，读取本次语言偏好 |
| GET | `/v1/sessions/{id}` | 会话状态，不返回对话内容 |
| DELETE | `/v1/sessions/{id}` | 结束并清理内存状态 |
| POST | `/v1/sessions/{id}/turns` | 提交 16 kHz PCM，按 NDJSON 返回音频块 |
| POST | `/v1/sessions/{id}/interrupt` | 停止当前回复 |

创建会话的语言字段：

```json
{
  "conversation_language_mode": "auto",
  "preferred_conversation_locale": null,
  "voice_key": "gentle"
}
```

`conversation_language_mode` 只接受 `auto` 或 `preferred`。

业务系统自己的设置 API、用户表和界面国际化不在语音主机上。建议业务库保留：

```text
interface_locale
conversation_language_mode
preferred_conversation_locale
```

`current_locale` 和 `detected_locale` 不写数据库，不建语言识别历史表。

## 部署约束

- 代码源在本机仓库，部署目录是 `/bigdata/hearme-ai/realtime`。
- 不重装、不移动这三个模型：`Qwen3-ASR-0.6B`、`Qwen3-4B-AWQ`、`Qwen3-TTS-12Hz-0.6B-CustomVoice`。
- 不修改 Nginx、Ollama、Redis、Docker、DICOM/MinIO、系统 CUDA 或 DNS。
- 不 `apt install`。Go 装到 `/bigdata/hearme-ai/tools/go`。
- GPU 进程启动前运行 `gpu-guard.sh`。退出码 2 表示 GPU 已被占用，立即停止，不杀其他进程。
- 测试结束释放 GPU，显存回到约 70 MiB。
- 日志只记会话标识、事件名和毫秒延迟。

## 验收时钟

用户停顿到第一段可播放音频，从 VAD `speech_end` 或已完成话语进入网关开始，到第一块 TTS PCM 写出为止。整段合成时间不是这个指标。

阶段一实测的 3.83 秒是整段批量时间，不是本阶段成绩。P50 ≤ 1.2 秒、打断 ≤ 300 ms、30 分钟单用户，都要等远程实测报告，不能提前写成已通过。
