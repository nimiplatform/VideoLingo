# Nimi 开发入口与当前迁移范围

真实 App 为 `ai.nimi.videolingo`，入口是本仓库根目录；`.nimi/local/admission` 只保留早期接口探测，不是产品入口。当前已实际通过项目、受管理媒体、逐词转写、音源分离、原 NLP 规则、全文字幕链和首段参考的整片配音，短样例导出 15 条双语字幕及约 50.64 秒混合视频。逐段/上传参考策略、长视频、YouTube/批量和安装运行仍需分别验收，不能用首段策略替代全部任务范围。

## 独立安装与运行

当前开发组合：Node 24、pnpm 10.34.5、Python 3.14；App Tools 0.7.0、SDK 0.14.0、Kit/native 0.10.0、nimi-coding 0.6.3。四个平台归档现均来自 manager 的 `dev-a6d8067d0` 交付。本 App 的 `pnpm-workspace.yaml` 指定完整本地归档，`pnpm-lock.yaml` 固定实际解析；Python 依赖固定在 `requirements-nimi.lock`。不借用主仓或父工作区依赖。以下历史构建/pack 成功属于 `dev-01c151ff1`；升级后的 a6 组合尚未重建生产包。

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements-nimi.lock
pnpm install --frozen-lockfile
pnpm exec nimi-app sync
pnpm exec nimi-app check
pnpm dev
```

使用实际存在的交付包路径。`pnpm install` 的 App-owned postinstall 调用公开的 `install-electron --no` 安装 Electron binary；Electron 42.10.1 本身没有 postinstall，`pnpm rebuild electron` 不能代替它。首次 adoption 已完成，普通开发无需反复 init。新平台包按随包 upgrade 指南显式选版本、sync/check，再验证受影响路径。

`dev:renderer` 启动本 App 的 `.venv` 与真实 Streamlit `st.py`，由 Desktop 监督生命周期；不是 Vite 开发服务器。Vite 仅编译 Streamlit v2 组件的 SDK/Kit 资源。Host 从官方生成源码接入 Kit main/preload；只使用该 App 官方 dev 输出所报告的 loopback CDP。组件资源正在由 renderer 启动流程构建时，不要同时对同一目录运行另一个组件构建；Windows 上曾观察到这类热更新时的文件访问拒绝。

保留开发数据时，先 `pnpm dev -- --list-registrations`，再用返回的明确 selector 执行 `pnpm dev -- --resume <selector>`。selector 不写进项目文件。独立打开 renderer URL 不建立 Nimi Access。

## 自动数据流与最小业务接口

| 入口 | 职责 |
| --- | --- |
| `st.py` / `core/st_utils/nimi_workspace.py` / `src-component` | 原 Streamlit renderer 承载 SDK/Kit；通过文件选择、项目选择和 Kit AIConfig 操作业务。无新增业务注册体系。 |
| `src-electron/main.ts` | 注册标准 Kit Host，限定 renderer origin 和固定 `videolingo.project.*` App 命令。未开放通用 Runtime/provider 转发接口。 |
| `src-electron/projects.ts` | 使用 `bridge.services.storage` 保存项目和媒体、`services.aiConfig` 观察配置、`services.ai.scenarioJobs` 提交/恢复/取消转写。结果从 API 自动流向 worker。 |
| `core/nimi_worker.py` | `prepare` 用原 FFmpeg 提取与静音分块策略生成不超过 300 秒的 WAV；`consume` 自动接收实际 typed transcription，调用原 cleanup/matcher并生成词表和原文。 |
| `core/asr_backend/nimi_result.py` | 验证真实时间、语言和 no-speech，映射成原业务词结构；只加一次分块偏移，不估时、不借邻词时间、不用整句伪造词。 |
| `core/separation_media.py` | 验证已接收的两路 WAV 格式、帧数及输入时间轴，流式组合分块；不执行 Demucs 或其它推理。 |

项目记录位于 SDK JSON storage 的 `projects/` 命名空间。媒体与结果位于 SDK managed assets；每次导入使用新的项目内文件名，完成后才挂接输入，避免覆盖处理中的源文件。Python helpers 只收到受限工作目录、业务数据和明确环境，没有 Nimi 凭据或 Runtime endpoint。临时处理数据使用 App 创建的 OS temp 目录，任务结束后清理；它不是持久化项目数据库。

转写按完整准备计划和完成分块保存 checkpoint。Runtime Job ID 用于现有 Job 恢复；Source hash、语言与公开 AIConfig 选择用于判断缓存是否仍适用，不用于指定 Runtime 执行资源。Local intent 始终为 `local: {}`，模型由 Nimi 当前 Loadout 选择提供。会话失效会中止 App 工作并防止旧结果写入新会话。Host 中已无对应任务的 working 记录显示为待恢复，不自动伪造完成。

当前 `consume` 只确认完整原文与真实词时间能进入原 matcher；不会用标点切句替代未交付的 NLP，也不制作假翻译字幕。转写结果为 `cleaned_chunks.xlsx`、`words.csv`、`transcript.txt`，后续分句/翻译应读取同一项目的这些结果。

`audio-separate` 使用同一准备音频，通过正式 `audio.separate` Local intent 提交。只按完成 Job 的 `audioSeparation.vocalsArtifactId/backgroundArtifactId` 认定角色；用 `storage.assets.adoptArtifact` 接收，再用 `assets.read` 流读取大 WAV，不调用 inline artifact read。两路均完整接收、可解码且时间轴匹配后才标记完成。分块放置仅允许输入/输出采样量化导致的样本级边界差异，不填补未覆盖的大段时间。已完成分块可恢复使用，原 ASR 数据不会被分离覆盖。

## 已运行与未运行

- 官方 root `init --adopt`、sync/check、相关 TS/Python tests、组件和 Host 编译已通过；未生成 fresh scaffold intent/lock。
- 真实根 App 已通过监督启动、Kit AIConfig、项目创建、SDK 媒体上传/预览、Host AI→Python 自动转写、受管理结果保存、CSV 下载；demo 为 `en`，106 个时间单元。
- 同一 dev 注册重启后，完成项目的媒体与结果仍可用。第二个项目初始没有前项目数据；它的真实转写在进行中停止，随后恢复完成。主动取消时底层 AbortError 的显示已修正。
- b29 分离 Job `01M2GR2NS5BAWRDV2JNDCQR61S` 已由根 App 页面真实完成。两项 artifact 各 17,866,856 bytes，FLOAT WAV，44100 Hz、双声道、2,233,346 frames、50.64276644 s；SDK 流接收字节数完整，页面两路预览 readyState=4。统一解码到 16 kHz 后三路均 810,284 samples，两路之和对输入相关系数 0.99998424、相关峰 lag=0，背景对输入相关系数 -0.10384，明显不是原混合音。原 ASR Local intent 与 en/106 结果保留。此人声为主的单块 demo 不证明所有背景/音乐分离质量或长源边界；必要文件保留在 `.nimi/local/separation-acceptance`。
- 启动访问只对公开状态/错误实际标记 `retryable=true` 的暂态最多读取三次（等待 500/1500 ms）；明确拒绝及未标记错误不自动重试。读取成功后清除旧错误并重新加载项目；相关边界测试通过。
- Host 在任务运行中断后的恢复检查尚未完成。旧 Host 曾在同页 `auth.status()` 已绑定、Renderer SDK 可读两个项目时，由 Host 项目命令返回 `session-invalid`。临时诊断加载后的新 Host 上 reload→单次刷新成功，未捕获拒绝位置。按 manager 要求已移除临时诊断代码；旧实例问题仍未定位，未宣称 SDK 已修复，也未放宽跨会话边界。
- 随后为 Host 中断场景发起的一次任务，在状态观察超时后已完成，未能在运行中停止 Host，故该恢复场景仍 **NOT-VERIFIED**，没有循环重做。为 b29 环境更新正常停止根 App 后，已使用更新后 list 返回的 selector 恢复原注册，未新建注册。
- 大文件/更多媒体格式、跨账户、分块边界、CJK、no-speech 真实推理及完整翻译/配音仍 **NOT-VERIFIED**。根 App Windows payload、冻结后端检查和本地 `.nimiapp` 打包现已通过；安装运行和正式发布准入仍需分别验证。早期临时 scaffold 的 Windows payload 成功不能外推到本 App。

发布位于开发验收之后。当前生成的 GitHub workflow 未推送或执行；发布前仍需完成 App 信息、Python 构建环境及公开版本解析等实际发布工作。本地包验收不依赖先发布。

## 翻译与配音接口 checkpoint（2026-09-15）

`core/utils/ask_gpt.py` 已硬切至 App-owned worker 消息，Host 只接受声明的翻译步骤，使用 SDK `createNimiLocalAppTextModel`。保留原忠实翻译→反思润色、JSON 校验、源文与行数对齐；平台拒绝不进入业务重试。`tts_main.py` 使用同一受限消息通道请求 Host 的正式 `voice-create` / `speech-synthesize`，按完成 VoiceAsset 和 managed artifact 接收。单字也走实际合成；空白、缺参考音频、模型失败或无有效音频均明确失败，不制造静音。参考裁剪读取已完成的人声 WAV，不再从此处启动 Demucs。配音文本缩短不再把所有异常改称敏感内容并删除标点。

预览使用每项目、每次运行独立的临时目录和 managed asset 前缀。取消传递 AbortSignal 并请求取消已提交 Job；中断后重发前读取已有 Job，仍运行时要求先停止。平台错误的 reasonCode/retryable/actionHint 保留经过 Python 的往返。参考音频只从本项目 managed assets 读取。预览不写入正常字幕分句结果，不能代替未交付的 NLP。完整预览 Host 中断恢复尚未验收。

实际根 App 通过 Kit 保存 `audio.synthesize` On-device intent，显示 `Qwen3 CustomVoice audio.cpp Q8`。默认声音预览真实调用返回 `ai-media-option-unsupported`，没有音频产物。请求为 `audioFormat='wav'`、`timingMode='none'`、空 language/emotion、null voiceRef/voiceRenderHints；现有失败记录仅有该 message，无 Job ID。已向 manager 反馈生成源码的 Cloud-only 标注差异；manager 确认本机支持 WAV/none，故不将它们判为拒绝原因，也未改值重试。默认音色拒绝原因仍待查明。翻译预览、成功 TTS、参考 VoiceAsset 创建仍 **NOT-VERIFIED**，不根据类型检查宣称业务可用。

原 `_8` 读速估计中的 `g2p_en.G2p` 推理分支已按 manager 裁决移除：保留原确定性 syllables/pypinyin 等预算，英文词估算异常保留 cause 并明确失败。App 未安装或执行 G2P/spaCy，不补造音节数或语言标注。

## 语言分析与声音验收（dev-01c151ff1）

四包通过完整 tarball overrides 显式升级，同版本旧归档没有新 NLP 合同。已执行 install、sync/check、typecheck、相关测试和组件/Host 编译。包内新增发布指南已投影；App-owned Electron 打包器改为同时展开 node/dylib/dll，并保留根 LICENSE 字节。根 Windows build 实际发现 PyInstaller 的相对 add-data 从 `.nimi/local` spec 目录解析错误，已改为本 App 绝对输入路径，构建重跑仍待完成。

根 App 原注册项目 `b833eecf-8f23-465e-8a92-efe60a4bf924` 复用已有 en/106 转写结果。Kit 中选择 `text.annotate` Local intent，当前模型为 English language analysis。4 个真实分析 Job：`01M2HMNAKRR76F8MPF7KMB489T`、`01M2HMNDCMBNRFMJ114A9SR0EK`、`01M2HMNDMAFT4Q0YWTAZA9TXAE`、`01M2HMNDVH53VGAJ6F8YFVWPVN`。typed textAnnotation 自动进入原 mark/comma/connector/long-by-root，生成 12 行，源词完整性与原 ASR matcher 均通过；结果保存在该项目 managed assets。`core/nimi_annotation.py` 只投影真实 token/POS/依存/句界，Python 直接按 Unicode 标量偏移切片；不创建语言模型结果。

公开 preset 查询返回 `Vivian`，选择后相同 WAV/none 参数的 TTS 真实生成“这是 VideoLingo 的配音预览。”，产物 2.56 s、24000 Hz、单声道。完整 managed artifact 流接收、soundfile 解码及页面 audio readyState=4 通过；此前 null voiceRef 的拒绝不再阻止使用正式预置音色。音色创建仍待实际验证。

语言分析按原完整文档先分析，再按原规则重复分析分段，批量请求及 Job ID 由 App 保存。该阶段随包限额为 64 KiB/8192 tokens，后续容量升级见下节；未擅自把原文切成改变句法上下文的块。短 demo 成功不证明长文档范围。全文翻译接入原 meaning/tokenize_sentence→summary→translation→subtitle-splitting→timestamps，以完成步骤和原模型缓存保存 checkpoint，不用预览文本冒充全片结果。

第一次全文尝试使用正式 Local `Gemma 4 E2B Q4 text-only v2`：meaning 前的 tokenize_sentence 经真实 annotation Job `01M2HN417EYV1NMFYGTYEKP718` 执行，随后原 get_split_prompt 的 `generateText(responseFormat=json-object)` 收到 `Nimi text generation failed: ai-output-invalid.`。没有完成步骤或翻译产物；保留失败，不修改原 prompt 或造 JSON 过关。此失败已反馈 manager，改用正式 Kit 可选 Cloud 资源的验证单独记账。

Cloud 分支通过 Kit 选择公开列出的 `Deepseek / deepseek-v4-flash`，配置显示 set up，但相同 JSON 请求返回 `ai-text-behavior-unsupported`。manager 确认当前平台未登记该目标的结构化文本行为，正在以正常交付包修复；未直连供应商或轮换资源绕过。Local 的 ai-output-invalid 仍单独未定位。全文 meaning/summary/translation/subtitle/timestamp 接口已实现，真实完成步骤仍为 0/5；原 get_split_prompt、摘要与翻译 prompt 保留。

根 Windows 构建已实际生成 payload，冻结后端检查先后发现并修正 `syllables` 元数据缺失、`core.__init__` 在工作目录配置前急切导入全部步骤，以及过早开启阻塞 stdin 读取线程后 NumPy 原生初始化卡住。构建加入所需元数据，core 改为显式任务导入，读取线程在首次模型消息时启动，批处理消费者同步调整。原失败步骤重跑通过。`pnpm test:packaged-backend` 从最终 payload 验证真实冻结后端能加载翻译/估时模块并把 Host 拒绝完整传回；它不运行或冒充 AI 成功。修正后的 `nimi-app build --target windows-x86_64` 及该检查已通过，安装运行、正式发布及整片翻译/配音仍 NOT-VERIFIED。

`nimi-app pack --target windows-x86_64` 已通过。首次 pack 要求补齐正常 App 信息，现复用原仓库 `docs/public/apple-touch-icon.png`（180×180）、Apache-2.0 LICENSE 及本开发说明，并在简介中声明当前验证范围。本地候选产物位于 `dist/nimi-app/ai.nimi.videolingo-0.1.0-windows-x86_64.nimiapp`。未发布、未安装或提交 Registry；此包用于当前未发布依赖组合的开发迭代。

## 当前短字幕链与容量验收（dev-a6d8067d0）

先显式安装 `dev-3d654343b`，再安装修正 renderer Job 提交入口的 a6 四包。随包文档给出 NLP 512 KiB 输入、65536 tokens、16 MiB 结果，以及 DeepSeek V4 JSON-object 行为。App 输入边界同步扩容，原 prompt 和已选 Cloud `deepseek-v4-flash` 保持不变；没有使用旧脚手架 routeMatrix 限制已有能力，也没有绕过 Kit validator。JSON-object 结果严格解析，失败不提取片段或修补成成功。

重跑先遇到旧 tokenize Job `01M2HNBCMDQQM11GT09BXCDXSX` 的明确 `not-found`。App 只在用户继续动作下将该 ID 记为失效引用、保留输入并重新提交未完成步骤；权限与会话错误不触发此处理，不反复查询已失效 ID。新 tokenize Jobs `01M2HR2H744QF5GV7QC3C45PF2` / `01M2HR2KSMJ2JPMG8CY6SH0KM2` 完成，随后原 Cloud JSON 请求及五步字幕链全部完成。已完成的 ASR、分离、原四步 NLP 成品未重跑。错误中的 reasonCode/actionHint/traceId 保留经过 worker 的往返；11 项相关测试通过。

在根 App 精确 CDP 所属 renderer，以已安装 SDK/Kit 的公开 client 创建方式提交一份完整连续文本：120 份原 demo transcript 以换行连接，不切成多个文档。3d 曾在 Electron 白名单处拒绝 `text-annotate`；a6 重跑成功。Job `01M2HR0R95PX1JCJRV0F5MX8AD`、trace `01M2HR0R95PX1JCJRV0JZEN4C2`，输入 70079 bytes、结果 1896234 bytes、1 文档、14519 tokens、1080 sentences，en。原文完全一致、Unicode 标量切片及头索引、句界分区全部通过。只证明该规模公开路径容量，不证明长视频完整验收；临时公开 client bundle 留在 `.nimi/local`，没有增加生产 Host 的通用转发接口。

项目 `b833eecf-8f23-465e-8a92-efe60a4bf924` 的 managed translation 目录以 `25ffe0ab9b4c6f3df478a1f1903e1d073bea52cee1436ae5916e74ab97d96bdd` 为本次缓存标识，保存术语、三类翻译表、四种显示字幕及两种配音用字幕。真实页面下载到 `.nimi/local/subtitle-acceptance/src_trans.srt`、`trans.srt`、`words.csv`。15 条字幕完整保留 106 个原词，两份译文/时间一致、时间单调且来自原 ASR 端点，最后结束 49.2 s；未估算音频对齐。另一项目仍为 en/106，未出现这批 NLP 或翻译结果。

语义抽查发现 cue 14 的人体生物学语境中 “balls” 被模型译为“球”；保留实际输出，尚未做术语修订复验。上述格式、完整性与时间校验不等于逐句语义质量通过。参考音色创建、整片配音/背景混合、长视频/批量、升级后生产重建、Nimi 安装及正式发布均仍 NOT-VERIFIED；Local Gemma 的 ai-output-invalid 也未宣称修复。

## 首段参考的完整短片配音（dev-a6d8067d0）

公开 AIConfig 查询确认 `voice.create` Local Qwen3 local voice clone 支持 `input.audio`，当前 `audio.synthesize` 为兼容 Qwen3 TTS Base synthesis。通过 Kit 保存 App voice.create Local intent；不复用旧 CustomVoice/Vivian 作为 Base 默认声音。首段参考 Job/active VoiceAsset `01M2HS5BQK1G8C2BJK411G9T5A`（trace `01M2HS5BQK1G8C2BJK42SJDR5Q`）取自原已分离 vocals 和原字幕生成的首个配音任务。首条合成 Job `01M2HS5JJ6D9TPRAJVFASNCC7Q`、artifact `01M2HS6JWHJA8XT25W0BYGXZWX`，157484 bytes 完整接收，实际解码 3.28 s。Artifact 的时长/采样字段为 0 时按未知处理，使用实际解码时长。

原 `_8` 合并/读速预算、`_9` 裁剪、`_10` 实测音频/速度/间隙、`_11` 拼接、`_12` 背景混合及烧录规则均经过真实首段策略短片运行。15 条模型音频、9 个配音任务，原始合成时长合计 34.0 s，调整后字幕最后结束于 49.04 s。首段参考始终绑定首段原文；音频缺失或模型失败明确失败，不补静音当结果。关闭烧录字幕改为输出真实视频画面；分辨率由 FFprobe 读取，无需 OpenCV 加载。

首次确定性视频混合在部分 MP4 后停住，未标完成。停止过程中出现一次 `runtime-service-unavailable`（actionHint `check_runtime_daemon`、retryable=true），manager 确认 Runtime 未重启且仍存活；此暂态未定位。新 Host 在同注册下读取到 interrupted/speech 与全部 15 条缓存。给后台 FFmpeg 增加 `-nostdin`/DEVNULL 后，仅恢复确定性处理，原 15 个 TTS Job ID 未增加或替换；最终 renderer SDK 和 Host project.get 均读到 completed。该事实不证明某个 Kit 修复或消除所有会话问题。

通过真实页面下载 `.nimi/local/dubbing-acceptance/output_dub.mp4`（1589391 bytes）、`dub.srt`、`tts_tasks.xlsx`、`dub.mp3` 和 `dub_with_background.wav`。视频为 H.264 640×480 + AAC 44100 Hz 双声道，总时长 50.641995 s，完整 FFmpeg 解码无错误；混合 WAV 为 44100 Hz 双声道、2233346 frames、50.64276644 s。实际页面播放从 12 s 推进到 34.16 s，readyState=4，无媒体错误；画面确认中文烧录字幕。15 条配音字幕与任务表台词/时间一致，时间单调且在媒体范围内。既有“balls→球”误译保留；未宣称声音相似度或全部语义质量通过。

首段整片路径已通过上述范围。逐段参考、用户上传参考、音频单独输入、不烧录分支、配音时运行中取消/跨账户、长视频/批量、最新生产重建与 Nimi 安装仍 NOT-VERIFIED。此前字幕链和容量结论不重复扩证。

## 逐段与上传参考的必要验证

逐段策略使用同项目原声的两个真实范围：0–5.36 s 与 5.36–10.08 s。按实际 WAV bytes+对应原文计算的缓存标识分别为 `2a9994…` 与 `c70c84…`，与 Host 接收记录一致，创建两个不同 active VoiceAsset `01M2HSYKQ90CSRZKGWM5HQEPDZ`、`01M2HT0WAY5162MHKEVT7YQXEC`。三条已完成合成包括第二来源的 Job `01M2HT152G7N66FZ00NZYWQ60J`；收到真实音频后主动停止后续队列，项目显示 canceled、已接收音频数 3，未把它标为整片完成。该验证不重复 50 秒全片，却证明参考来源随任务变化；更后面的短参考范围仍未穷举。

上传策略通过实际文件输入上传不同来源片段 23.52–30.56 s，7.04 s、24000 Hz 单声道 WAV，337998 bytes；App managed asset 的 SHA-256 与本地文件均为 `0827b93229ef097dedf4f399def578e3c3cb597a0d937f962fbe855b99a4dc59`。输入该段真实原文，创建 VoiceAsset `01M2HT4QJ20VJWZ4E5X5T8EPQQ`，生成 138284 bytes、2.88 s、24000 Hz 单声道配音预览，页面 readyState=4。另一项目请求使用此参考路径时在 Host 被拒绝 `The voice reference belongs to another project`，没有推理。实际参考文件位于 `.nimi/local/reference-acceptance/uploaded-reference.wav`。

修正界面仅查询当前选择模式需要的预置/已有音色列表，避免 Base 的不适用 preset 查询错误干扰 reference 模式。三种策略各自真实来源→VoiceAsset→合成路径已覆盖上述必要范围；仅首段策略完成全片导出。用户上传参考与逐段策略的全片、长视频批量和安装验收仍不外推。
