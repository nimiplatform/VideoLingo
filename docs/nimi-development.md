# Nimi 开发入口与当前迁移范围

本项目的目标是通过真实第三方应用验证和修复Nimi平台及接入能力，并交付可构建、经Desktop安装启动和使用的生态App。当前只修平台缺陷和适配引入的接线、依赖、生命周期、存储、权限及构建安装问题；上游App行为和模型内容质量按限制记录，不再做泛化产品优化、质量调参或场景矩阵。长片验收验证功能与校对流程，不要求生成内容无需人工校对。

## 当前 Windows 交付状态（2026-10-15）

当前已发布 [0.1.8](https://github.com/nimiplatform/VideoLingo/releases/tag/v0.1.8)，完整分支 CI 与正式 tag 工作流均成功。Registry 已下载核验许可证、摘要和构建 provenance，[PR 109](https://github.com/nimiplatform/nimi-app-registry/pull/109) 的候选检查通过；用户已明确决定暂缓准入，先修复配音前置问题，尚未进入 Catalog。v0.1.6 的 Windows CI 在媒体测试中找不到 ffprobe；0.1.7 初始化加入既有 `prepare-media.mjs` 后该问题消失，但两个直接调用 Python 函数的测试将 `RUNNER~1` 短路径与已解析的长路径混用。产品 `core.nimi_worker.main` 原本已对工作目录执行 `resolve(strict=True)`；0.1.8 仅让测试夹具遵循同一入口前置条件，不削弱路径包含检查。两个失败 tag 均保留且未发布 Release。业务代码与下述 0.1.6 验收输入未改变，结果按其实际范围复用；不重复 AI 调用冒充新增覆盖。

既有未提交的平台接入、音频资源与会话恢复改动已保存为 `3a8621f`，类型检查与 48 项测试通过。0.1.6 阶段升级到 npm 正式 SDK/Kit/native 0.21.0、App Tools 0.13.1、Nimi Coding 0.6.5 和 Electron 44，当前 0.1.8 继续使用该组合；Vite 8 满足当前工具依赖。0.1.5 冻结候选及其历史记录保留，不以新字节替换。当前组合的安装态和 Catalog 验收仍待准入后实际完成。

独立环境使用 Node 24、pnpm 10.34.5、固定 Python 3.14.4 与 `requirements-nimi.lock`。正常设置命令为 `pnpm install --frozen-lockfile`、`pnpm setup:business`、`pnpm sync`、`pnpm check`；`pnpm dev` 继续由 Desktop 监督真实 Streamlit/Electron。测试与生产构建显式调用同一业务依赖设置脚本，CI 不再依赖作者机已有 `.venv`。启动产品本身不安装依赖。下面的历史独立安装命令和本地 tgz 组合只属于其标注阶段。

Windows 生产构建、冻结后端检查和生产打包已通过；冻结检查实际覆盖 UTF-8、Streamlit 健康、任务表和 loopback 下载及 Host 拒绝传播，不冒充 AI 成功。固定服务的 Nimi 0.2.5-rc.2 没有本项目当前主机的旧开发注册，因此创建了独立验收注册；原源码主机注册、旧 0.1.5 导入包与数据均保留。通过该 App 自身 CDP，在项目 `b42075e3-07b7-4027-8bcc-9efa10eac1ef` 正常导入既有公开 demo.mp4，重选固定服务上的 Deepseek V4 Flash，完成真实 Whisper 转写、语言分析、翻译/对齐和烧录，得到 14 对字幕及 50.642993 秒视频。播放器到达结尾、无解码错误；刷新后项目及结果保留。原生导出显示“导出完成”，文件 `.nimi/local/exports/0.1.6-subtitles.mp4` 为 1,851,462 bytes，FFprobe 时长一致。

预置音色独立路径：通过公开配置明确选择 `qwen3-tts-flash` / Cherry，Job `01M4Y86MQKZZ37FPJCS5YYQGQS` 完成，4.16 秒、24 kHz、单声道试听播放到结尾且刷新后仍可用。没有用这份试听冒充整片配音或参考音色合成。rc.3 目录更新后，旧 Cloud 选择正确显示 catalog stale；通过 App 的 AI 配置重新选择同一 `qwen3-tts-flash` 并保存后，音色列表恢复。新文本实际生成 Job `01M4Z0HYMC9ZPY1RQMX238F555`（trace `01M4Z0HYMDHT0EHV36EHPAB9TK`）完成，得到 5.2 秒、24 kHz、单声道音频，播放器到达结尾、无解码错误。旧 Voice Create 的下线模型未自动替换，整片与克隆路径没有由预览代替。

当前限制分开记录：
- 完整分离/混音在当前固定服务环境下为 NOT-VERIFIED。Home 对既有 HTDemucs 配置执行“仅准备”时，CUDA 13 用户态依赖失败：`LOCAL_ENVIRONMENT_DEPENDENCY_JOB_FAILED` / `host accelerator profile does not admit Windows NVIDIA CUDA dependency`。普通用户的 nvidia-smi 能识别 RTX 5090、驱动 610.88；普通用户在 System32 工作目录下的 Go LookPath 与显卡查询也成功，不能把当前目录查找假设当成已证实根因。固定服务的 GPU 探测失败原因尚未确认，不据此断言硬件不支持或修改驱动/安全配置。进一步在普通用户下对比 Go Run 与捕获输出，均在约 40–50 ms 成功。用户重新授权后，一次性 SYSTEM 计划任务实际运行：Go Run、捕获输出及无窗口捕获输出均识别 RTX 5090，分别耗时 43/41/41 ms；任务已清理。固定 Nimi 服务另有 `SERVICE_SID_TYPE_RESTRICTED`，普通 SYSTEM 任务不等同于该令牌环境。首次受限服务对比的 UAC 被取消；用户随后从 Windows 资源管理器手动运行诊断，成功复现：同为 SYSTEM 且 `restricted=true`，普通 Run/捕获输出分别在 15/9 ms 以 `0xc0000142` 失败，无控制台 Run/捕获输出分别在 43/37 ms 成功并识别 RTX 5090。临时服务已删除、结果文件权限已恢复，Nimi 服务权限和驱动未改。GPU 探测遗漏了引擎既有的 `configureManagedCommand`；本地提交 `ef3e160cb` 补齐该配置，Engine 包测试通过，与这次受限服务对比结果吻合。
- 仅 Windows 的 Nimi 本地候选 `0.2.5-rc.3` 已从干净提交 `b0ee5c52e4001d87cbfea5d06e38229e2926b639` 构建，包含 GPU 启动修复及语音目录清理。复用了原隔离工作目录，未包含主目录其他未提交工作，也未启动双平台或公开发布。产品身份签名、来源/组件组合、unsigned-beta 姿态及安装包摘要已核验；文件为 209,345,952 bytes，SHA-256 `651b197d4e457a7f7f17f80cfa4f44c2f73083946299479cafd8747e907f8354`，位于 Nimi 的 `.nimi/local/product-release/windows-apps-rc3/`。用户已安装 rc.3，固定服务路径与签名身份均匹配。Home 首次通过启动工具打开时报告 `runtime_service_untrusted`；从确切 rc.3 路径正常重启并打开既有只记录阶段的诊断后，服务身份、gRPC 和 Desktop 会话全部通过，账户与原项目可用。首次拒绝原因未确证，不放宽信任检查，也不据重开成功宣称这条暂态已修复。Gemma 下载原本已是 paused，未取消或重启。
- rc.3 的 Home 原入口复验在 `ApplyLocalEnvironmentPlan` 阶段返回 `AI_LOCAL_MODEL_UNAVAILABLE`：旧 CUDA 修复 Job 是 `failed/not_retryable`，当前 selected source 仍为 `repair_required`，计划错误地尝试重试旧 Job，尚未执行新的 GPU/CUDA 准备。新增回归在旧代码实际失败；提交 `984222247` 让用户明确确认的当前计划调用同一 selected source 的 repair owner，保留旧 Job、不将其改成可重试、不用新安装替代受管修复。完整 LocalService 测试通过；相关 Mac 保护检查仍禁止 fresh setup，已保留来源仅可走 repair。
- 含上述恢复修复的 Windows 本地候选 `0.2.5-rc.4` 已从干净提交 `98422224746cd2fa17c850c888dbc04b6f103ec3` 构建并核验。安装包 209,346,559 bytes，SHA-256 `0cbbbbd977bb062216444cccce03451e252c846d5d2cbe38d262501cb52bb9ee`，位于 Nimi `.nimi/local/product-release/windows-apps-rc4/`，用户已手动安装，固定服务与签名身份均匹配，Home 正常首次启动。原能力入口 Review and retry → Prepare only 实际通过，显示 Prepared, not in use；CUDA 修复 Job `localenv_job_01m4z18rzdrpbg9mwmkaze4vf7` 为 `ready_managed`，旧失败 Job 仍保留，设备默认未替换。VideoLingo 原项目配置恢复为 HTDemucs set up。
- 显式启动该项目预置 Cherry 的整片配音后，复用了已完成字幕，但分离输入准备报 `ai-media-codec-unavailable`。Home Shared components 正常修复下载了受管 FFmpeg；Job `localenv_job_01m4z1fbvd075c646jjtk4x1sk` 在实际版本校验时失败：`run ffmpeg.exe: exit status 0xc0000142`。审阅整条相关进程链确认 audiomedia 解码和 audio.cpp 推理已有无控制台配置，遗漏集中于 videomedia 的版本校验、探测、编码/封装、末帧提取五处调用。提交 `e00913125` 将这些调用统一经 Windows 无控制台命令构造器执行，其余系统保持原行为；未放宽程序摘要、下载校验或服务权限。videomedia/audiomedia/engine 包测试通过，启用受管 FFmpeg 的真实编码/探测集成测试以及子进程无控制台检查通过。这些工程测试不冒充受限服务产品验收。
- Windows 本地候选 `0.2.5-rc.5` 已从干净提交 `e0091312574ed0b7cb7399e6e73e48bc6ff42f38` 构建并核验产品身份签名、组件来源、unsigned-beta 姿态及摘要。安装包 209,347,389 bytes，SHA-256 `772a0cd5b8afd8545e0d9d2a03c2b2f97aaf4ad8953a80ff4bcecf75ad6d8416`，位于 Nimi `.nimi/local/product-release/windows-apps-rc5/`，已交用户手动安装，未公开发布。Home/VideoLingo 已正常关闭；rc.5 媒体组件修复、分离及完整配音仍待真实复验。
- 参考音色试验中的 Qwen Audio 3.0 拒绝本地字节输入；现有目录声明该克隆工作流只接收公共 URL，不能将其描述为字节路径成功。随后明确选择支持字节输入的 `qwen3-tts-vc` 并清空该模型不接收的可选参考原文；声音创建 Job `01M4Y81A4F2GBC6DM4HXFCBZYH` 成功，但合成 Job `01M4Y81C4M8VV1W0XRS9HPC9VS` 对实际模型 `qwen3-tts-vc-2026-01-22` 返回 `AI_MODEL_NOT_FOUND`。保留失败与新声音资产，不自动切换模型、不伪造声音产物。2026-10-15 进一步通过 Chrome 核对[官方公告 118434](https://www.aliyun.com/notice/118434)：该准确模型 ID 已在 2026-10-10 下线，并非待修复的 endpoint 拼写问题。Nimi 本地提交 `8b10b9f64` 移除同一公告中失效的 Qwen3 VC/VD/Instruct 和日期版 Flash 目录入口及失效克隆绑定，保留仍可用的无日期 Flash、Qwen Audio、CosyVoice 和既有声音资产；不自动改绑资产或配置。目录生成/漂移检查、25 项生成器测试、目录解析/AI 服务/Connector 包测试及相关 Runtime Agent 绑定测试通过。旧配置拒绝执行、资产重开及不改绑已覆盖；这些是源码检查；下述 rc.3 本地候选已包含修复，但安装与产品复验尚未完成，未公开发布 Nimi。
- 上述都是固定服务监督的开发 App 验收；新包的安装态、Catalog、其他平台及新的完整配音仍不由这些结果证明。历史长片与完整配音结果仅在其原组合范围内复用，字幕和声音质量仍需人工校对。Nimi 0.2.5-rc.2 仅为本机候选，未公开发布。

## 历史正式依赖升级与验收（2026-10-11）

当前使用 npm 正式 App Tools 0.11.4、SDK 0.21.0、Kit/native 0.18.1 和 Nimi Coding 0.6.5；已移除 Nimi 本地归档覆盖并更新锁文件。Host 在加载 Kit 前绑定当前 Host profile，技术会话恢复后重新绑定服务；异步音频任务使用 Uint8Array、移除已废弃的提交超时，并在观察终态后 Get 完整结果。人声分离通过公开 artifacts.upload 将 App 音频规范化为受管资源；仅在必要时对已规范化资源重采样至 44100 Hz 或将单声道转为双声道，再以 sourceAudio 提交。类型检查、48 项 App 测试、Host 构建、App Tools check 及冻结锁验证通过。

本次通过 Desktop 正式监督启动原开发注册并读回既有项目。两次真实 Runtime 重启后，通过原“刷新”入口恢复连接和原项目，没有重放业务。独立项目“正式包升级验收 2026-10-11”通过原链接下载入口导入公开 `demo.mp4`；直接文件源的固定分辨率筛选被拒绝，改选“最佳画质”后成功。实际完成本地转写、语言分析、DeepSeek 翻译/对齐及烧录，生成 14 对原文/中文字幕和 50.642993 秒字幕视频，App 播放器播放到结尾且无解码错误。翻译阶段发现旧云端目录选择失效，重新选择同一 `deepseek-v4-flash` 后点击“继续”，复用已完成转写与分句。

用户手动处理了 Windows 安全中心提示，并完成 `Export VideoLingo result` 原生保存。App 显示“导出完成”，实际文件 `../openwhispr/.nimi/local/output_sub.mp4` 为 1,859,735 bytes。原生控制工具无法激活保存框，未将该工具失败解释为产品导出失败。安装态仍为 **NOT-VERIFIED**；不得用下面历史冻结候选代替。未改写旧项目、发布 App 或执行安装态更新。

同一新项目实际完成本地人声分离、首段参考音色创建、12 段语音生成和背景混音，工作流显示完成 2/2。`output_dub.mp4` 时长 50.641995 秒，App 播放器从头播放至结尾，画面实际推进且无解码错误；刷新后项目、12 段结果和成片仍保留。原视频自带的字幕没有移除，新生成字幕叠加其上；这次验证功能闭环，不声明字幕内容或配音质量无需人工校对。

## 历史开发依赖：dev-48981dec4

按manager交付，将四个完整本地tarball override及锁文件切到 `dev-48981dec4`。App Tools 0.7.0、SDK 0.14.0、Kit/native 0.10.0及nimi-coding 0.6.3矩阵不变；native复用上一组合字节，其他三包更新。已核对目标矩阵与随包README/CHANGELOG：renderer按音频本身字节预算校验，多行及pending/no-speech转录内容按合同保留，app-tools校验已安装包与所选tarball及锁定integrity一致。

`pnpm install --offline --no-frozen-lockfile`、目标CLI的sync dry-run（无managed文件改动）、sync/check及既有47项App测试全部通过。本轮只更新当前开发依赖，没有启动App、重跑长片/AI、重启Runtime、执行新build/pack或发布；新组合的真实App业务运行仍为 **NOT-VERIFIED**。下述已验收0.1.5冻结包继续对应 `dd7b1d5` / `dev-28353e9c9`，其字节及原构建、安装验收记录不变，不能将旧包结果算成新组合验收。

## 0.1.5 冻结候选交付状态

已接入实际VideoLingo产品工作台、Python业务流程和Nimi SDK/Kit Host，不是独立接口测试页。该冻结候选使用的完整本地归档组合为 `dev-28353e9c9`：App Tools 0.7.0、SDK 0.14.0、Kit/native 0.10.0、nimi-coding 0.6.3；固定Node 24和pnpm 10.34.5及锁文件。安装、sync/check及47项App测试（含Python检查）通过；0.1.5 Windows生产构建、实际冻结后端检查和 `pack --production` 已通过，0.1.5本地更新、安装态启动与Nimi Access、既有字幕视频播放及原生导出已由Desktop owner验收通过；安装态全部AI流程没有逐项重跑，公开Release、Registry准入及Catalog下载仍为 **NOT-VERIFIED**。旧0.1.4及更早冻结包保持不变。

构建源码为 `dd7b1d5ee67143d04d8474e736d95b966b8883e0`。唯一0.1.5候选为 `dist/nimi-app/ai.nimi.videolingo-0.1.5-windows-x86_64.nimiapp`，1071656147 bytes，SHA-256 `977adff370b33dab724569c741ef9ccccdca0946ccda45cca2220109cacb836d`。冻结检查实际验证UTF-8配置、Host请求与拒绝、Streamlit健康、任务表解析及真实loopback媒体下载，没有AI成功替身。构建后的本次文档记录不改变包内执行代码。用户已将整理后的3个提交推送至 `nimi` 并设为默认分支；后续工作使用该分支，本次交付记录仅本地提交，不重写已推送历史。

Desktop owner反馈的本地安装验收：用户在Desktop确认0.1.4→0.1.5更新，Job `apj_v1_VDks_wCmXCWPRGXnE4SNVqxD5YO4ZPefNggqXwZ9bWQ`，releaseRef `local-package:v1:38ad7e650f9ed9b0febdeb250e93f227dccc50db6e4b1c48`。已观察实际安装目录exe正式启动、Desktop运行中/Nimi Access已就绪、产品“Nimi已连接”。保留的 `video-no-burn.mp4` 和字幕视频可用，安装版播放器从0:00/0:10实际播放至0:10/0:10且画面变化。通过产品 `output_sub.mp4` 按钮及 `Export VideoLingo result` 原生保存对话框导出，UI显示完成；owner报告文件497275 bytes，SHA-256 `f13e91f91233b50f6b312c9c3113119041f39c13a7b955276c25a9a10565db0f`，与本App `.nimi/local/installed-acceptance/output_sub.mp4` 升级前备份一致。Desktop部分使用CDP，安装版未增加调试端口，必要播放/保存采用原生操作；没有重跑AI、改业务数据或执行清理。这些结果证明本次安装、保留媒体和原生导出，不外推为安装态全部AI流程已重跑。

长片功能链已完成：在原752项目保留旧ASR/翻译及真实时间，只通过正常校对修改显示文本。SDK对公开number[]输入的容量缺陷经manager交付9d修复包解决，原5块44100Hz双声道输入全部完成分离，未缩小输入规避。48段真实语音及混合视频完成；其中一次Qwen3语音生成达到2048 codec token上限，保留原失败记录，在一次明确继续后成功，原20段缓存及VoiceAsset保持不变。没有更换模型、调整生成上限或重做ASR。

最终配音视频为167431817 bytes、734.166667秒，H.264 1280×534和AAC 44100Hz双声道；全量解码通过。可见的Desktop监督App在5、360、720秒处均实际推进播放且无媒体错误。此结果只证明需人工校对样片的功能闭环，不证明旧字幕内容质量；SDK读取产物不等于原生导出。当前清理确认和项目隔离的相关验证已完成，开发Host已通过Desktop正常停止。以下为此前阶段记录；“当前”“尚未”等时间表述均以其阶段为准，最新状态以本节为准。

## 长片功能链继续：分离提交遇到SDK容量缺陷

Runtime环境恢复后，仍使用752项目的原259词及旧识别结果，不重跑ASR或翻译。正常校对界面仅将显示译文“主发动机已启动”改为“主引擎已启动”，保存到用户revision `0e95b9e2ffb6c4ce50965208520f93dad636dfb01446d719f4dc46e7c0029df1`，不更改时间或回填参考。随后以原首段参考方式启动完整配音/背景工作流 `242c833e-0b65-4286-84c8-822003f41bb1`，样片仍需内容校对。

首块人声分离提交前发生 `RangeError: Too many properties to enumerate`，尚无分离Job或配音结果。实际输入44100Hz双声道、156.038095秒、27525164 bytes，在公开300秒/32MiB限额内；原输入保留在本项目separation/inputs/a8727117-c9fb-4504-b104-5df9483c170f/0.wav，SHA-256 `2cdf5a89b6a4c0a8e2c79a2683bdbdcd71864c878565edabdeafb64bed882184`。一次无推理复现通过公开SDK/Kit构造client，并以始终拒绝执行的carrier隔离，提交同长度number[]时carrierCalls=0且同样失败。堆栈定位SDK `assertNoAuthorityMaterial` 的Reflect.ownKeys（validation.js:185），经validateScenarioSpec（ai.js:282）到scenarioJobs.submit（ai.js:63）。公开输入类型要求readonly number[]；没有用类型旁路、缩短音轨或调小产品限额规避。该平台接入缺陷已反馈manager，保留原失败任务，正常修复包到达后只继续分离/配音。

## 完整长片单轮验收：字幕流程完成，质量检查未通过

使用4f82e3494包组及Desktop正式选择的“Whisper transcription with voice activity detection”，新建独立项目 `752bbd37-d78e-4800-a1c2-8067e043f1f2`。原公开Tears of Steel MOV完整导入372178639 bytes，SHA-256仍为 `efa9062d9cdb7a338e40ad530dfdf234806743f29ae6a1a136b97ece4e588e8f`；en提示、简体中文目标、原始音轨、转写前增强关闭，未在App命名或指定Driver。正常字幕工作流 `f3019d1a-06a1-4181-8bb1-283a847927c2` 一次完成ASR、NLP、五步翻译和字幕视频。实际4块offset为0/240.651/480.651/725.161秒，词数150/89/20/0，末块明确no-speech，共259词。所有原报告language均为空，业务语言en仅来自用户明确提示。

48条显示及配音字幕通过现有格式、正时长、配对、顺序和媒体范围检查。但按真实startSeconds/endSeconds核对，chunk1中的“It”起止均为143.31秒，全局383.961秒；其他词未发现非正时长、越界或重叠。该块Job `01M2K2WJW6Z5D8YQ45E42WNVPJ` 状态completed，trace `01M2K2WJW6Z5D8YQ45E61QCJMT`，不是平台拒绝。

仅作评估的官方参考还提示多处疑似漏句：chunk1在全局392.111秒后无词，参考6:36–7:11的若干台词不在结果中；chunk2首词到507.021秒才出现，参考8:13、8:24及8:54–8:59的部分台词也未出现。生成字幕把“We already tried that one It broke my heart!”连为366.701→384.821秒一条，形式有效但内容与停顿仍需核对。没有将参考SRT输入模型、回填字词或补造时间。因此本轮保留已完成字幕结果，将词时间及漏句问题集中反馈manager，未开始该长片的分离、配音和最终配音播放，也未循环重跑或换模型。

原始4份transcription JSON、实际SRT及项目记录保存在 `.nimi/local/long-vad-acceptance/`，并保留CC BY 3.0署名。供定位的chunk1/2 WAV通过SDK直接读取原输入，未重切或转码：chunk1为7680044 bytes、SHA-256 `f27887846c8e4f1dab9457d1c4d884878c0d8677432afc29b897dc75f1a3e0cc`；chunk2为7824364 bytes、SHA-256 `b44cf67ed800877f80070ea4d15a2c5ea46ae7ce6a05f2f6e978679a72b6c18e`。旧84cf、fddb及原TOS失败项目未操作；没有生产打包、App版本升级或发布。

## 当前开发依赖：dev-4f82e3494

在manager正常停止上一开发Host后，按随包升级指南一次性将四个本地归档override切到dev-4f82e3494并更新lock。App Tools0.7.0、SDK0.14.0、Kit/native0.10.0及nimi-coding0.6.3矩阵不变；锁文件除归档路径外，仅Kit的包integrity变化，其他依赖版本没有漂移。目标包的矩阵和SDK/Kit migration notes已核对，安装、sync dry-run、sync/check、类型检查、9项相关启动/清理确认测试及renderer编译通过。

随后通过fresh registration恢复Desktop监督的App，从正常项目选择入口读取原84cf项目，页面显示Nimi已连接、原文、保存的provided参考方式和3段已完成配音/成品入口，无错误提示。仅验证启动与原项目读取，没有运行AI、改动原项目、做十分钟空闲观察或注入旧包的读取client。manager交付的Kit包包含维护恢复修复；这次读取通过不代表已解释此前两次异常的全部原因，也不替代长片质量验收。App版本仍为0.1.4，79f22a2的冻结安装包未改，清理确认源码1f60b42保留，未生产重建或发布。

## 清理确认与入口收尾（源码，尚未打包）

针对安装验收误触暴露的不可逆清理风险，源码使用现有Kit ConfirmDialog增加确认步骤，并把配音清理放入独立的“管理配音文件”区域。确认内容展示项目名称和ID摘要、全部删除范围、保留范围及可能再次推理的成本；取消只撤销请求，确认才调用原有clear。请求绑定展示时的projectId/kind，提交中防重复并锁定关闭，失败保留原请求供明确重试，不做自动重试、备份或撤销框架。

同一次有边界收尾补齐两处具体入口问题：媒体清空复用同一确认步骤，已有源媒体不能通过文件选择框直接替换并重置结果；归档项目的原文语言、转写、分离、分句和翻译等高级处理控件按只读状态禁用，后端原有保护不变。8项针对性确认/清理隔离测试、类型检查、renderer编译和app-tools check通过。

必要CDP验证使用193组合和新监督Host60456。已有84cf项目仅打开配音确认并点击“取消”：项目元数据及全部8项配音资源与前完全一致，没有修改或删除旧验收数据。Dialog进入closed状态时窗口visibilityState为hidden，Page.bringToFront未恢复可见，标准Browser.getWindowForTarget返回-32601不支持。manager仅激活一次实际开发窗口后，visibility恢复visible，取消弹窗正常退出；没有将后台动画现象判为Kit故障，也没有设置viewport。

随后通过正常页面新建无AI临时项目 `21904bac-853d-48e2-831a-1f0adf39354d` 并导入467926 bytes真实媒体，确认已有源文件的直接替换入口禁用。归档并从历史打开后，字幕处理、转写、分离、分句、翻译及原文语言等控件禁用，恢复按钮可用。恢复此临时项目后，打开媒体清理确认，核对项目名/ID和范围，再点击“确认清空媒体”：项目回到empty、source不存在、项目资产为零、弹窗关闭。旧84cf元数据及8项配音资源仍完全不变。未确认删除任何已有配音结果、未运行AI。79f22a2对应的0.1.4包保持冻结，当前源码改动不在该包内。

当前尚未闭合的具体事项是更新后候选的集中安装/原生导出，以及manager负责的技术会话失效与长片ASR质量；已导出成片与安装事故边界按后文保留。没有重新开启全面审计、模型矩阵或生产打包。

## 0.1.4统一Windows本地候选

当前App版本统一为0.1.4，包含356de45的集中回归修复及完整工作台/批量接线。依赖仍使用dev-193f2888a完整本地归档，沿用冻结lock；根App版本本身不改变pnpm依赖解析。按现有脚本执行sync/check、`nimi-app build --target windows-x86_64`、`pnpm test:packaged-backend`和`nimi-app pack --target windows-x86_64 --production`，复用已通过的44项App测试，不重跑业务推理。旧0.1.3/f32284安装包保留。

manager已通过Desktop正常更新0.1.3→0.1.4，安装Job `apj_v1_hqy3FnUmqXQfXGJmyoS23CPbDAFjJSMmYBpC7PAnb0A`，releaseRef `local-package:v1:8473a95d8ddb7061e4f8b485e2793e1c54bdb89a294a7a4b`。正式启动后Access就绪，原“安装态短片验收”项目保留4段配音，既有成片实际从0播放到0:10并变化画面。这个结果证明更新、启动和既有成品访问，不等于本版新业务全链已在安装态重跑。

随后manager尝试通过原生坐标点击 `output_dub.mp4`，实际页面清除了配音结果且没有保存对话框，疑似滚动布局变化后误触“删除配音文件”。manager已披露事故并停止原生操作，之后通过Desktop正常停止App，确认未运行。本次原生导出为NOT-VERIFIED，不将先前备份算作本次导出成功，也不把疑似误触描述成已确认的程序自行删除。

本轮只读核对确认：正常删除配音命令移除该项目 `dubbing/` 下各次成品及逐段缓存，并清除dubbing映射、workflowId/runId；保留源媒体、ASR/NLP、翻译与校对、分离、字幕视频和配音设置。它不删除Runtime Job、artifact或VoiceAsset；批次历史中的输出路径只是引用，并非资源字节备份。现有 `.nimi/local/installed-acceptance/` 仅有先前实际原生导出的 `output_dub.mp4`（544866 bytes，SHA-256 `da4f981f5706429a8d0f0a62a96ddecf9886f80fb2f1c51ddb775c7dacfe2601`）和 `output_sub.mp4`（497275 bytes，SHA-256 `f13e91f91233b50f6b312c9c3113119041f39c13a7b955276c25a9a10565db0f`），未在本App现有安装相关记录中找到该安装项目完整metadata及逐段缓存备份。已有成片可不经推理继续使用，但仅凭两份MP4不能完整还原App配音状态；Runtime原始资源是否仍可取回尚未查询，不能承诺恢复或断言绝对不可恢复。没有修改Runtime存储、项目状态或重跑AI，开发84cf/fddb未操作，程序与安装包保持冻结。

构建准备时，dev CLI收到Ctrl+C后退出1但Host仍存活，manager随后通过Desktop正常停止入口完成关闭；原Host、CDP54418及renderer1467均已退出。该CLI行为只保留为实际记录，本轮不扩展工具链修复。会话偶发失效未定位、长片自动字幕质量失败和人工音质待答复仍保留；未发布或提交Registry。

## 集中开发回归结果

在同一监督Host和193包组合下，已完成本轮指定的代表性工作台与批量回归。独立84cf项目的4条显示字幕在校对页仅将“有时候”改为“有时”，所有时间不变，保存为用户revision `5189512061b15cf5640ada11a730527a7fd7db468ce53974e337c08210ae2aa0`，原模型文件保留；正常生成的字幕视频绑定此revision。原生保存对话框未操作，不能把下述SDK产物读取当作原生导出。

这一步暴露出确定性接线错误：`_8_1`从配音字幕组创建任务，`_8_2`却拿显示字幕匹配，独立显示修订导致 `Matching failed`，发生在任何音色/TTS生成前。已将`_8_2`接到同一配音字幕对，保留原匹配、时长及编排算法；语音细分以配音字幕组为准，显示组不再决定语音段落。针对不同显示/配音文本的任务匹配测试旧代码实际失败、修复后通过，并加入正常App测试入口；其中固定音轨时长只覆盖文本来源边界。

随后只在原失败配音工作流 `9caf16df-5abc-4aa3-9bb4-4382d648d6bd` 点击“继续”，复用已有ASR/NLP/翻译/分离。保存的7.04秒上传参考创建VoiceAsset `01M2JWHT98GR0MWQVPPRZDRGB1`，3段真实合成及混合完成；配音key为 `e8c14fa83b9df8a486a221ee1a3aa565c634ea74350365ef002af506b8cb5b1f`。App视频从0播放到10.982993秒结束、readyState=4、329帧；SDK读取的 `output_dub.mp4` 为544729 bytes，H.264 640×480/AAC 44100Hz双声道，全量解码通过。3条配音字幕时间为正、顺序正确且在媒体范围内；实际任务表仍用“有时候”配音原文，没有把显示修订混入语音。必要结果在 `.nimi/local/concentrated-acceptance/`，人工音质未代为判定。

fddb批次通过真实停止按钮由ready变为canceled，再正常恢复至completed，保留1条实际选择及20个结果引用。前后所有ASR/NLP/翻译/用户修订/分离/配音对象及音频Job引用完全相同，没有新推理；从批次项目链接返回工作台，修订和配音结果可访问。重新选择批次曾显示缓存的ready，已改为选择时读取当前保存状态，复测显示completed及实际结果列表。44项App测试、类型检查、相关renderer编译通过；新候选尚未生产打包或安装，正式发布未进行。

此前两次技术会话失效仍保留为未定位风险；无AI窗口内未复发，以及随后业务完成，都不等于平台已修复。长片自动字幕质量失败仍保留，短片集中回归不外推长片质量。以下阶段记录说明发生顺序，其中先前“暂停/未执行”的条目由本节已完成范围更新。

## 集中开发回归：会话失效待收敛

本轮按04cdb1c候选进行集中CDP回归，复用实际10.966667秒视频，独立项目 `84cf0138-7e75-4e3b-8a7c-45dbed396176` 正常导入467926 bytes。页面保存en/简体中文、24/90参数后完成28词ASR和NLP。翻译到meaning checkpoint时项目轮询出现 `session-invalid`，但随后公开auth仍为session-bound；正常刷新后Host将原任务投影为interrupted。按manager确认的恢复安排，只在原任务 `06225022-5f3c-4984-a275-c4d796ca7168` 点击“继续”，完成五步翻译及字幕视频，没有从头重做ASR/NLP。

新的共享配音控件实际上传7.04秒参考音频并加载至readyState=4，保存provided方式、对应原文及关闭配音再次烧录。原五列XLSX经页面导入，空状态行选中、Done行跳过；关联当前项目后，批次 `fddb88e2-11a7-4bd7-baa5-34614cd911ab` 保存为ready，实际继承en/简体中文、24/90和同项目上传参考及原文，没有改成首段策略。此后又出现一次同类项目读取失效，按manager安排暂停新AI。新配音、校对保存、队列控制/结果访问及原生导出均仍NOT-VERIFIED，不以底层文件读取替代原生步骤。

App修复区分“项目读取中断，请刷新恢复”和确定未绑定；读取失败后停止原轮询，保守隐藏前端业务缓存，等待明确刷新重新确认其归属，不放宽鉴权或自动重放任务。普通console记录首次失败的method、公开错误字段、脱敏reasonMetadata及Host原堆栈，现有onSessionInvalidated回调记录时间。类型检查、6项相关恢复/诊断测试及renderer/Host编译通过。前两次失败的原堆栈和reasonMetadata未被旧代码保留，不能补造；后续脚本对空批次ID的错误也不作为会话失败原因。

修复后仅做一次无AI观察：Host5 PID65360于UTC2026-09-15 15:35:41.976启动，真实工作台保持选中上述项目并运行原project.get轮询，console监听按15:45:57截止，窗口内未复发。15:47:19收尾确认页面仍已连接并清除项目选择，结束自然轮询。CLI输出未提供新的get/list失败堆栈与失效回调，因此本轮没有可配对的前后顺序。manager已确认Runtime/Desktop未重启，并指出技术会话generation切换后旧读取可能被保护拒绝，即使后续auth已重新bound；最初失效来源仍未定位。未更换平台包、改鉴权、生产重建或升级版本，也未宣称平台已修复。

## 整体接线候选：待集中验收

当前主树继续完成产品接线，区别于下文已经冻结并安装的0.1.3包。单项目工作台与批量任务各有入口，项目/历史和原处理设置位于侧栏；字幕、校对、配音及成品仍使用既有真实业务链。链接导入和任务表URL先进入完整下载设置页，再开始网络请求，代理与网站Cookie可在首次下载前配置。批次草稿跨页面保留，批量停止已接通，语言和参数继承实际项目设置。

单项目与批量复用同一声音设置控件，提供预置音色、已有音色、首段/逐段/上传参考、参考播放及配音输出设置；可先保存项目配音选择再用于任务表和批次，不再强制首段参考。Host在创建队列前校验输入与参考所属项目，保存设置不会改动已完成媒体或调用AI。媒体文件导入统一显示进度并支持取消，失败时仅移除该次尚未绑定的上传路径。分离进度使用独立的分离块数，工作流显示实际阶段进度。

相关工程检查已通过：43项App测试、类型检查、renderer/Host编译与app-tools check。新增检查覆盖配音设置持久化不改成品、跨项目参考在派发前拒绝，以及取消导入不绑定部分媒体。本次没有执行模型调用、CDP产品试跑、原生界面操作、生产重建或版本升级；193本地完整包组合与冻结0.1.3安装包保持不变。此前的真实运行结果仍只覆盖原已测试版本和路径。

集中验收入口为仓库根的 `pnpm dev -- --list-registrations`，选择fresh结果后 `pnpm dev -- --resume <selector>`，仅连接本次输出的精确App CDP。以一个冻结候选集中验证“视频翻译”工作台的导入→设置→字幕→校对/导出→配音→恢复，以及“批量处理”的任务表/媒体关联→配置继承→队列控制→结果导出；复用已通过的基础接入结果。开发回归后统一构建一次候选，再由Desktop owner执行安装及必要的原生步骤。当前没有已确认必须扩展平台接口才能闭合上述接线的阻塞；长片自动字幕质量失败和人工音质待答复仍保留，不靠补造时间或更换模型消除。

## 当前接入与验收范围

完整 VideoLingo 适配是本轮目标。0.1.3目前仍是本地Nimi适配候选版，不代表完整原产品对接已验收完成。它已接入真实单项目字幕和配音流程，保留Streamlit renderer、SDK/Kit Host及原Python业务算法，并完成下表范围的开发态及安装态任务；不是只有独立接口探测页。早期局部候选、构建、Access及短片通过均不能外推为全部产品路径通过。长片自动字幕质量未通过，部分完整策略组合及人工音质验收未完成；公开包发行验收另外计账。后文保留此前阶段记录，当前结果以下表为准。

下表除明确标注安装态的条目外，业务验证均指开发态；生产构建与公开发行单独列出。

| 原产品能力 | 当前状态 |
| --- | --- |
| 导入后一次操作完成字幕链及烧录 | 新项目实际完成，106 词、15 条有效字幕 |
| 业务参数与字幕长度调节 | 页面24/90与配音时长1.8秒已传入实际流程；未逐一实测全部配置组合 |
| 转写前人声增强 | 实际完成：源分离输入 44100 Hz 双声道，ASR 使用对应人声的 16000 Hz 单声道副本 |
| 一键配音与暂停/恢复 | 实际完成 15 条语音；暂停前两条及 VoiceAsset 在恢复后保持不变 |
| 播放与导出 | 配音视频 H.264/AAC、50.641995 秒完整解码，App 实际播放；原生字幕 ZIP 六份内容与 managed assets 完全相同 |
| 归档、恢复、删除配音、清空重选 | 新项目实际操作通过，源/成品归档不变；删除与清空不影响 B/TOS 旧项目 |
| URL与原XLSX批处理 | 受控 HTTP 及公开 HTTPS 下载通过；独立 XLSX 导入、Done 跳过、参数继承、缓存复用与错误隔离已实际通过。YouTube 示例在固定稳定版下载器后从 App 原失败入口重试成功，旧403记录保留 |
| 音频单独输入、不烧录 | 独立音频完成字幕及4段配音，实际播放，仅音频/SRT/XLSX；独立视频关闭烧录后完成字幕，无 subtitleVideo。配音视频的烧录开关另有真实 FFmpeg 帧验证 |
| 长片自动字幕质量 | 未通过；保留零时长及原诊断，不自动填时长或参考答案 |
| 生产构建与本地安装包 | `70511ba` 的0.1.3已完成官方build、冻结后端检查及pack --production；40项App测试通过，采用显式交付的本地实验包组合 |
| Nimi安装态业务 | Desktop完成0.1.2→0.1.3更新及Access；原失败任务保留ASR/NLP，从“继续”完成翻译、字幕视频，再完成首段参考配音、混合、App播放及原生导出。Runtime/Desktop/App进程结束并恢复环境后，重新启动已安装App，成品仍可用并实际播放，无新AI调用 |
| 人工音质及未跑组合 | 人工试听待回复；逐段参考整片已生成并在App播放，原生导出未确认。上传参考整片、增强长片字幕链及完整长片配音仍为NOT-VERIFIED；后续界面验收已按用户Escape停止信号暂停 |
| 正式发布准入 | NOT-VERIFIED；未发布、未提交Registry，本地实验包验收不等于公开包最终验收 |

本次正常单项目验收位于 `.nimi/local/full-app-acceptance/`。新项目 `da30ee95-93e4-4e0a-aca3-e2523b1be411` 已在导出后通过真实清理动作回到 empty；必要产物已保留，旧 B/TOS 未覆盖。启用增强或改变实际 ASR 输入必须重新处理对应输入，不复用原轨结果；相关拒绝/恢复测试覆盖该边界。

当前工具组合已显式升级到 manager 交付的 `dev-193f2888a`（App Tools 0.7.0、SDK 0.14.0、Kit 0.10.0、nimi-coding 0.6.3），固定锁文件；SDK/Kit/native 执行包与 cd1 相同。现有 `.nimi/local/admission` 保持独立身份与 studio-voice 最小 closure，正常升级/sync/check；已按其 Host、preload、renderer bootstrap、public client 与 AIConfig 源码对齐基础接线，没有将参考 UI 复制成目标产品。参考 0.1.0 已正常 build/pack --production；manager 通过真实 Desktop 原生选包、预检、安装和启动确认 installed running / accessAvailable=true / ACTION_EXECUTED。同包参考的安装态 Access 基线通过，不替代目标 App 的业务验收。

已冻结0.1.2为 `dist/nimi-app/ai.nimi.videolingo-0.1.2-windows-x86_64.nimiapp`，1071597021 bytes，SHA-256 `589585e68a59e58620a99ec4f6fb2d1bdebe156c842c0da2b59d6473a9df3c4f`。该包包含固定的yt-dlp2026.8.19及上述业务接入代码；此前同名局部候选不代表此包。2026-09-15，manager通过Desktop正常本地更新完成，安装Job为 `apj_v1_gkiTk7wj4Q6dJ9F3dpXfcACGNCLZdIooMUjC2_QPDew`。该包保持不变，后续修复使用0.1.3。

安装态新项目使用10.966667秒视频，ASR完成28词、NLP完成；翻译阶段实际报 `'utf-8' codec can't encode character '\udc80' in position 111: surrogates not allowed`。以0.1.2的本地冻结payload做一次无推理拒绝检查，确认正常Host传入的“简体中文”在Python配置中变为 `绠\uDC80浣撲腑鏂\uDC87`，中文selectionKey也损坏；标准流错误编码往返会掩盖此损坏，严格UTF-8缓存写入才暴露错误。证据保留在 `.nimi/local/installed-encoding/frozen-probe/config.yaml`。0.1.3改为显式严格UTF-8字节协议，开发与冻结入口复用相同实现；不是丢弃异常字符、修改模型输出或更换模型。原安装失败任务及其ASR/NLP保留，修复后只继续未完成阶段。

0.1.3冻结程序来自 `70511ba`；包为 `dist/nimi-app/ai.nimi.videolingo-0.1.3-windows-x86_64.nimiapp`，1071602027 bytes，SHA-256 `f32284fe326f144ce7bf1462f3fc38172ab05033892162465d8042beb594e2e5`。Desktop实际更新Job `apj_v1__PHntWrsbKxsaGkUc2jE7JiauXZ5R7G2JLIApxi_nN8` 完成，正常启动running/Access ready；Deploy入口已隐藏。manager在原失败任务“继续”后完成翻译及字幕视频，随后正常一键首段参考配音完成4段语音及混合。原生导出位于 `.nimi/local/installed-acceptance/`：`output_sub.mp4` 为497275 bytes，`output_dub.mp4` 为544866 bytes；均为H.264 640×480、AAC 44100Hz双声道、10.982993秒，全量解码exit0。配音视频在安装App实际播放0:00至0:10并变换画面，非静音音轨mean -30.3dB/max -13.7dB。输入本身已有字幕，本次配音关闭再次烧录；看到输入字幕不能证明新烧录。该结果证明本次安装态短片业务及原失败恢复，不证明人工音质或长片质量。

持久化复验由manager完成：原Runtime、Desktop和App进程均已结束后，通过各自正式入口恢复环境，再由Desktop启动已安装0.1.3。Access重新就绪，原完成项目、4段音频、混合音轨及XLSX/SRT/MP3/MP4产物均保留；最终视频再次从0:00播放至0:10并变化画面，没有新AI调用。此处复用manager原生操作结果，不增加生产CDP或启动开发App来代替安装态证据。文档收尾不改变上述冻结程序、安装包和测试范围。

## 剩余分支继续验证与用户暂停

按manager指定范围，复用0.1.3程序，从fresh registration恢复Desktop监督开发App，在专用HTTPS项目 `b289d5c4-f07a-4952-8e30-ce93f0088cba` 的正常界面选择“逐段匹配人声”并开始整片配音。实际工作流 `a0329e30-60f0-4d3c-a945-a7a259caedbe` 完成源分离、10个对应原声片段的音色创建、16段合成音频及最终混合；配音key为 `26e29c825e78cebf1237c9d1cfbdd3339399e75a67143e4d9a44a2091f403ff8`。App最终视频duration为50.641995秒、readyState=4，实际播放12→37.867358秒，解码帧199→972；截图与实际项目、任务表、SRT保存在 `.nimi/local/remaining-branches/per-segment/`。

实际前后比较确认chunks、NLP、translation、transcript、wordCount、outputPaths及source完全相同。项目runId由 `a6063735-c542-4fce-bb58-f2780d0bd3c4` 变为 `c76cc022-f5d8-427a-9b42-a45102017ed3`，这是既有dub入口新建Activity的正常更新，不是固定ASR身份。先前“runId也相同”的汇报已经更正；本次没有重做ASR/NLP/字幕。旧B/TOS项目未操作。

正常 `output_dub.mp4` 按钮打开原生保存对话框后，manager收到用户物理Escape停止Computer Use的信号，未完成或确认保存。因此逐段整片原生导出仍NOT-VERIFIED，不把管理存储中的成品或本地任务表/SRT读取当作此导出已通过。后续依赖界面的验收暂停，未开始上传参考整片及新项目的人声增强长片任务，也不重跑AI；等待用户继续。当前结果不改变人工音质、长片自动字幕质量和公开发行的限制。


已交付的冻结 **0.1.1** 候选为隔离提交 `b2f03f8`，基于 `852c127` 的短片功能，只修复冻结 renderer 启动和启动错误可见性。主树已整合此修复并保留后续长视频/批量代码；这些后续代码不在已交付候选中。使用 `dev-72951f582` 完整本地包组合，SDK/Kit/native 执行代码与原 a6 相同，更新包含正常交付的本地安装及 Job 恢复文档。后续主树产包应使用新的候选版本与独立输出目录，不覆盖此 0.1.1 包。

0.1.0 的真实安装已由 manager 完成，但启动后退出。按原 Host 环境诊断已装 backend，得到 `server.port does not work when global.developmentMode is true`；冻结路径不含 `site-packages`，使 Streamlit 的默认值误判为开发模式。0.1.1 在包内入口显式传 `--global.developmentMode=false`，不改 Nimi 信任或权限判断。Host 启动异常使用标准原生对话框展示并可复制详情，不新建日志存储。

旧 `test:packaged-backend` 只走 worker 分支，未覆盖 renderer 健康启动。新版测试补上原 Host 环境与仅端口 argv 的 renderer 检查，禁止额外注入该修复环境变量。安装包用普通 check/build 后再 `pack --target windows-x86_64 --production`，由工具观察原生签名/权限事实；安装态启动与 Access 仍由 Desktop 实际更新后单独验收。

0.1.1 的独立 Windows 构建已完成，增强后的冻结检查实际通过：包内 renderer 健康启动，原 worker 拒绝边界通过，诊断子进程已退出。无额外环境修复注入。manager 已报告实际 user_imported N→N+1 更新 completed（Job `apj_v1_i2gDIzVnU0UplzlAGwtAujhx-cbdJBBKuSdoL0qA_ko`），Desktop 显示已安装 0.1.1；稳定启动与 App Access 仍待其实际检查结果。以下保留 `852c127` / 0.1.0 的历史业务验证范围，不能替代安装态业务验收。

真实 App 为 `ai.nimi.videolingo`，入口是本仓库根目录；`.nimi/local/admission` 只保留早期接口探测，不是产品入口。当前已实际通过项目、受管理媒体、逐词转写、音源分离、原 NLP 规则、全文字幕链和首段参考的整片配音，短样例导出 15 条双语字幕及约 50.64 秒混合视频。逐段/上传参考各有必要来源与真实合成验证；这些策略的完整长片、YouTube/批量和安装运行仍需分别验收。

## 独立安装与运行

当前开发组合：Node 24、pnpm 10.34.5、Python 3.14；App Tools 0.7.0、SDK 0.14.0、Kit/native 0.10.0、nimi-coding 0.6.3。主树四个平台归档均来自 manager 的 `dev-4f82e3494` 交付，冻结0.1.1仍使用原729组合。本 App 的 `pnpm-workspace.yaml` 指定完整本地归档，`pnpm-lock.yaml` 固定实际解析；Python依赖固定在 `requirements-nimi.lock`。不借用主仓或父工作区依赖。当前0.1.3的生产构建与冻结后端检查已通过；旧阶段的未验证记录以下保留，当前状态以上表为准。

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

最新 a6 `nimi-app build --target windows-x86_64` 与 `test:packaged-backend` 通过。根 App dev 已正常停止，准备将该组合的 `.nimiapp` 交由 manager 使用 Nimi 的“从本地包导入”路径验证 Runtime 安装、Desktop 启动及产品交互；不直接启动 build 目录，不开启生产 CDP，不发布或提交 Registry。本地导入验收与公开目录发行准入是不同结果。

停止开发 App 的输出还出现过一次 `runtime-service-untrusted` 随后恢复 running；该事件与上述单次 service-unavailable 均保留为未定位暂态，没有放宽信任判断、修复系统服务或宣称自动恢复等于已修复。

## 主树后续长视频与批量接线（尚未真实业务验收）

ASR/分离现在共用精确 NOT_FOUND 分类，失效 Job ID 被记录并清除，用户继续时以原输入重新提交未完成块，已完成块保留。权限、会话错误不重提；无活动时也能停止遗留引用。相关负向测试同时覆盖 ASR 与分离。全局时间偏移与原块边界规则未改。

长片内存热点改为静默搜索窗口解码、参考音频按帧区间读取、配音 PCM 磁盘拼接、RMS 归一化分块两遍扫描。确定性测试确认原静默切点、参考切片字节、PCM16 增益和毫秒间隙与原规则一致；尚未测量真实长片峰值。导出改为 Host 读取 SDK asset stream，写入用户通过原生保存对话框选择的文件；不在 renderer 构建完整 Blob，失败的临时文件不会替换已有导出。

批量使用当前 Projects Host 方法，按独立项目持久化条目顺序、输入身份、阶段错误及结果引用；一次顺序执行，显式暂停/恢复，重启只显示 interrupted，不自动重跑。活动批次占用其项目，已完成条目跳过，失败条目在显式继续时重试。字幕视频使用原烧录规则和 FFprobe 分辨率，未调用旧批量全局 config/output 或旧 ASR 入口。当前提供本地多文件/既有项目的批次编辑；旧 XLSX 任务表与 URL 导入尚未接入此新入口，不宣称完整批量迁移完成。

类型检查、24 项 TS 入口测试（含 Python 确定性测试）与组件/Host 编译通过。真实长素材为 manager 提供的 Tears of Steel 连续影片，必须保留 CC BY 3.0 署名及片尾；原参考字幕仅供人工对照。长片多块/取消恢复/内存峰值、批量真实队列、流式导出原生交互均 NOT-VERIFIED。此主树工作不改变已固定的 852c127 或 0.1.1 安装候选。

## 真实长片批次：部分通过，第三块推理失败

在 Desktop 监督的独立 dev 注册中创建批次 `f8846a7f-6070-4c4a-9121-0d7a1db90671`：Tears of Steel 原片项目 `25fee7cb-fc91-43b5-9188-550f43ec9a8a`、明确不可解码的 MP4 项目 `43248e79-f8dd-41d3-bbf2-e1b4218be0aa`、复用已有短片项目 `b833eecf-8f23-465e-8a92-efe60a4bf924`。批次条目单独持久化，顺序/状态头不携带全部输出数据，避免超过 SDK 单 JSON 文档容量。没有调用旧 batch 全局配置路径。

实际分块 offset 为 0、240.649、480.649、725.161 s；duration 为 240.649、240、244.512、8.9320625 s。末端 734.0930625 s 与原 MP3 音轨 734.093061 s 一致；视频本身为 734.166667 s，不把容器中视频多出的约 73.6 ms 当作音频丢失。首块保存后在第二块运行中暂停，批次 paused、后续条目 queued；显式继续从第二块开始，再于实际 running Job 中正常停止 dev。新 Host 项目/批次为 interrupted，首块保留，没有自动派发；显式恢复后第二块完成。

第三块 ASR Job `01M2HYSBJ18KMAX87S87BFWQCM` 返回 `ai-local-execution-inference-failed` / `local inference failed`，trace `01M2HYSBJ18KMAX87S87J8GCCY`，未重试或改变切分。manager 从 Runtime 日志定位到识别语言不在已捕获 aligner 支持范围，继续检查平台结果；没有以请求 en 强改未知识别语言。原受管 `chunks/2.wav` 已通过公开 SDK stream 完整导出 `.nimi/local/asr-diagnostic/chunk-2.wav`（7824428 bytes，SHA-256 `c55f7a3e63933de23a465cdd68384d0d6d86590231e31d764e01f7c3f9ad2006`），不重切、不转码、不替代正式复验。前两块保持保存；无效文件随后准确失败，已有短片条目继续 completed，批次 completed-with-errors，未污染其他项目。

已保存块0/1分别为 en/160词、en/134词。第一处跨块时间从 240.4 s 到下一块全局 241.529 s，无倒退，偏移仅加一次。但存在语义/对齐质量限制：“Be tender to her”附近识别为“Be, be on the tour”；块1尾部多词 start=end=局部182.08 s，并有重复“Out of time”。没有删词或估时间，不能称长片语义/逐词对齐质量通过；全片字幕、分离与配音还未运行。

只对本 App Host/Streamlit 进程树进行本次 2 秒采样，排除 Runtime/模型进程：第一阶段143次样本，观测合计工作集峰值1543872512 bytes；重启后97次样本，峰值1263149056 bytes。结果在 `.nimi/local/long-acceptance/memory-*-phase.json`。这证明此次已执行上传/准备/前几块转写的 App 范围，不是机器总峰值，也未覆盖尚未运行的长片拼接/归一化。原片 CC BY 3.0 来源说明保留在该目录 README。

## MOV 兼容预览

公开 Kit 文档确认 video/quicktime 不受管预览 API 接纳；原调用实际返回 invalid-payload / use_typed_local_app_asset_media。App 保留原 MOV 处理输入，用 FFmpeg 生成真实 MP4：先探测编解码器，H.264/YUV420p 才复用视频，其他编码转 H.264，音轨转换 AAC，并验证输出编解码器/视频起点/时长。结果按原 sourceHash 缓存在项目 managed assets；失败只写预览状态，不改 ASR 结果。

本长片实际 preview 完成，视频复用、1280×534、734.166667 s，与原视频一致。同一 Kit URL 加载到 readyState=4，实际播放240.649→241.110 s、解码帧9→20，拖动480.649 s成功，无媒体错误。截图在 `.nimi/local/long-acceptance/compatible-preview.png`；第二次准备请求复用相同 runId/assetPath，没有再转码。原源 SHA 与前两块 ASR 保留。非 H.264 MOV 的真实确定性测试也验证会转码而非盲目 copy；这些测试不替代长片 AI 验收。

## 模型未报告语言的消费边界

manager 对失败第三块作原输入/模型诊断，发现有实际英文文本但模型未报告语言。App 现将 `sourceLanguage`（显式用户选择或可用模型报告）与 `detectedLanguage` / `reportedLanguages` / `unreportedLanguageChunks` 分开；typed chunk result 中空 `language` 保持为空，不伪装成“检测到 en”。只有显式 source-language hint 可在空报告时用于后续 NLP/业务配置；auto 缺报告、未支持的已报告语言仍失败。原逐词时间只来自真实 alignment，不重新估算。

针对性测试覆盖空报告+显式 en、auto 缺报告、未支持报告、混合报告及最终持久结果的来源区分，类型检查和24项入口测试通过。`dev-1c64ec080` 完整四包已显式安装并同步/check，通过随包 SDK README 核对了相同语义；等待 Runtime/ASR 环境就绪通知。这部分代码尚未以第三块正式调用复验，前两块与失败输入仍保留，dev 已按更新协调正常停止。冻结0.1.1包不变。

## 上游同步及长片翻译恢复（dev-cd1ebd388）

按用户要求以 `git pull --rebase --autostash` 同步至 `origin/main` 的 `11048cc`，重放 16 个本地提交并恢复未提交工作。冲突保留上游 FFmpeg DLL 初始化、32 kHz / 128 kbps 提取、峰值受限音量与 AAC 192k；同时保留任务按需导入、分块媒体处理与后台 FFmpeg 无 stdin。音频专项 23 项通过，1 项可选 PyYAML 配置检查跳过；类型检查、25 项 App 入口测试及官方 sync 后 check 通过。原冻结安装包未修改，本次未重新生产构建。

显式选用 manager 交付的 cd1 四包并冻结 lockfile；SDK 修复失败事件 trace 传播。App 沿原 gpt_log 在每次成功模型调用后持久缓存，失败记录原请求、业务块索引及同一次公开 stream 事件，不重放请求来收集诊断。Desktop 监督的真实 renderer 对长片项目 `25fee7cb-fc91-43b5-9188-550f43ec9a8a` 仅恢复一次翻译，原 ASR / NLP / meaning / terminology 保留，原 Deepseek-v4-flash 配置、prompt 和参数不变。实际完成 5/5，忠实翻译和润色缓存各 9 条。本次未出现 AI_OUTPUT_INVALID，首次错误根因仍未定位，不宣称修复。

本次实际导出的 85 条字幕在 `.nimi/local/long-acceptance/translation/`。其中 28、29、30、32、35、76、77、78 为零持续时间，保留实际 ASR 端点；还有原文错识别 `Be, be on the tour` 导致“去 去巡演”，以及上下文误译 `We're done` 为“完成了”。字幕生成完成不等于字幕质量通过，未改写时间或以参考字幕冒充识别。长片整片配音、完整批次、当前主线生产构建与安装态 Access / 业务仍 NOT-VERIFIED；正式发布准入未执行。

## 字幕校对与回流

有界审查 `origin/main` 的实际 `st.py`、`core/st_utils`、`_6_gen_sub.py` 与 `_8_1_audio_task.py`：原界面仅提供媒体导入、SRT 下载及归档，没有内嵌字幕编辑或 SRT 上传入口。原下游读取可写 `output` 文件，外部修订可以通过显示用 SRT 和配音用 SRT 回流。SDK 管理存储接入后，这个交接现由字幕校对面板承接；不创建通用时间轴编辑器。

翻译完成后选择“显示与烧录字幕”或“配音输入字幕”，分别校对原文、译文和 `HH:MM:SS,mmm` 起止时间，也可导入外部编辑的 UTF-8 SRT（每文件最多 256 KiB）。两种用途保留原先各自分句，不互相覆盖。可保存格式可解析但时间/配对尚未修正的草稿；草稿始终能另存为 `draft-*.srt` 继续外部校对。成品导出、烧录、配音由 Host 对实际使用的字幕组检查正持续时间、原译配对、重叠/顺序和媒体范围。保存用户版本不会修改原 ASR 或模型文件；新的字幕版本使此前衍生视频/配音失效，其他项目不变。并发版本变更、未停止配音 Job 或活动批次会拒绝覆盖。

真实 Desktop-supervised 会话已读取长片原稿，经实际文件输入导入相同原文草稿并保存为独立用户版本 `9967e0a4…`。没有修改任何字幕文字/时间；该导入仅将原文显示 SRT 的 CRLF 规范为 LF，另外三份原稿保持一致。原 ASR 4 块、NLP 和模型 translation key 均保留。8 条零时长在显示/配音的原译四份文件中共报告 32 个位置，真实页面请求烧录在 Host 被拒绝，未执行 FFmpeg 或 AI。原生草稿导出已交 manager 按 owner 支持路径验证；结果未返回前仍为 NOT-VERIFIED。真实人工修正后的长片成品与配音也仍 NOT-VERIFIED。

类型检查、30 项入口测试和官方 check 通过。相关测试验证草稿出口、不更改原端点、存储失败不激活半成品、失效版本与项目隔离。真实原稿额外发现多空行被 SRT parser 误拒，已修正并重跑受影响测试；原文件若确有格式问题，仍保留原文可供校对。没有重跑 AI 为首次 provider 错误寻找新证据。

校对正向功能测试另使用已有短片 B 的有效原字幕，通过真实 file input 保存用户版本 `69bb8633…`（不修改字词/时间），生成绑定此版本的烧录视频。SDK 流读回文件 `.nimi/local/subtitle-review/short-user-version.mp4`，1842546 bytes、H.264 640×480 / AAC、50.642993 s，完整 FFmpeg 解码无错误；此操作未重跑 ASR/NLP/翻译/TTS。长片成品导出及配音在精确 App renderer 通过公开 Kit 固定 Host 命令实际被 `Subtitle proofreading required` 拒绝；配音先校验字幕，再要求源分离，以免已知无效字幕诱发不必要的前置 AI。原生草稿保存对话框已交 manager，仍单独等待落盘结果。

## 原生草稿导出与单块 ASR 质量对照

manager 经原生保存对话框导出的 `.nimi/local/subtitle-review/exported-draft-src.srt` 与本次实际导入的原文草稿逐字节相等：4722 bytes、无 CRLF。该原生落盘步骤已通过，不重复打开对话框。

由 Desktop 正式配置的 Qwen3 ASR 1.7B 资源对原第 0 块仅提交一次：Job `01M2J4JG6TH06MQK3BMJ8QYVPS`、trace `01M2J4JG6TH06MQK3BMM5FQBE7`。输入为原 SDK asset 的 7700812 bytes、240.649 s，SHA-256 `3b763598d1d7ff3b41002c642080d08bc693a52f94fd9f7fe2776083bd179a22`，en hint / timestamps=true，无重切或重编码。结果独立存于 SDK `quality/asr-1.7b-chunk0-result.json` 和 `.nimi/local/asr-quality-1.7b/`，原项目 ASR/翻译不变。

1.7B 返回 en/171 词，原 0.6B 为160词；零时长词由15增至22（不同于字幕条数）。尾部“be on the tour”改善成“be tender to her”，但末词仍为零时长；Tom 228.32 s仍零时长，新增 Whatever/Tom/We're/done 全挤在50.08 s，giant robotic claws 被识别为 glass。提供的参考字幕只用于评估，未写回。该对照未通过自动字幕质量验收，manager 已通过 Desktop 恢复原0.6B正式选择；不做整片替换或继续盲目对照。

## URL 与原任务表接入（真实入口待验）

“从链接下载”保留原 yt-dlp 的分辨率、代理、Netscape Cookie 文件和文件命名规则；工具使用锁定版本，下载时不再调用 pip 自动升级。下载结果经 Host 工作目录检查及 SDK asset 流写入，完成后才成为项目输入，不会启动 AI。停止/会话失效取消工作进程和正在写入的源流；未完成下载在原项目保留设置，明确重试。

批次可导入原五列 XLSX，保留源/目标语言、Dubbing 和 Status，默认选择空/Error 行。表中 Done 不成为 Nimi 完成证据；用户显式选择每行关联项目、导入对应本地媒体或将URL下载到独立项目，再加入现有队列。此过程不解析父目录路径、不执行公式、不运行旧供应商AI。空目标语言在预览中显示简体中文默认值；同媒体多任务使用各自项目。原AI队列及取消/恢复逻辑继续复用。

类型检查、31项App入口测试、9项原下载代理测试及官方check通过。表格测试使用实际XLSX文件验证列、状态、路径、公式和Dubbing边界；下载尚未以真实Nimi入口运行。开发Host已停止，等待manager安装来源身份修复及Runtime恢复，再进行真实URL/表格验收。当前生产重建、正式发布与安装态业务仍不由这些检查证明。

## URL / XLSX 实际验证及选材纠正

正常 App 的 URL 入口把受控 HTTP demo.mp4 写入 SDK 管理存储，1385961 bytes、SHA-256 与本仓原视频一致。慢速同内容传输在实际“停止下载”后为 canceled、source 不存在、input assets 为零；同项目同 URL 明确重试后 ready，完整字节与来源一致。这只证明受控 HTTP 媒体流转，不证明外部 YouTube 已可用。界面已修正下载完成后媒体项目列表未更新及重试遗留停止提示的问题。

原五列 XLSX 已从真实文件输入导入，空状态行选中、Done 行跳过，逐行关联媒体并保存/执行批次。该次我错误地把表格 en 行关联到旧 B（其实际 hint 原为空/自动识别），所以触发了符合新输入规则的实际重转写及后续流程，不能计作缓存复用。B 行完成，invalid 行在 FFmpeg 准备阶段失败；未把失败行冒充成功。后续验证一律使用独立项目。

核对得到：新 B 原文完全相同，words.csv 与原实际导出逐字节一致；全部106个词/起止时间/报告语言也与原导出一致。原 source/NLP/翻译/用户修订/视频等25个路径仍存在，随后通过当前 App 的公开 SDK 恢复确实捕获的原项目元数据与引用，updatedAt记录恢复时刻。新调用、before/after、新 ASR 和批次结果均保留于 `.nimi/local/full-app-acceptance/`，不捏造旧推理、不抹掉重跑，不声称未比对的 Excel 包装字节完全还原。当前缓存复用声明仍待独立项目验证。

停止开发入口时实际返回 runtime-service-unavailable，已知Host48500随后只读确认不存在；未标监督清理成功，未kill或操作Runtime。平台恢复由manager处理，期间无活动AI。

## 独立分支最终开发验收

独立音频项目 `afa42f67-9af7-4598-96be-882a77d1d0c1` 使用从原 demo 提取的真实10.96秒 WAV，正常界面一键完成28词转写/字幕；烧录选项禁用，未生成字幕视频。随后选择正常列出的既有 VoiceAsset，完成4段真实合成及背景混合，没有新增音色，也没有视频输出。实际 WAV 为 PCM16 / 44100 Hz双声道 / 10.959977秒，App播放1→1.963594秒、readyState=4。人工试听由manager统一询问，未得到答复前不宣称主观音质已验收。

公开 HTTPS：正常 URL 入口从本 fork 的 raw.githubusercontent.com 原视频地址下载到独立项目 `b289d5c4-f07a-4952-8e30-ce93f0088cba`，1385961 bytes / SHA-256与本地demo一致。此独立视频随后关闭烧录，一键字幕完成，未产生 subtitleVideo。原任务表示例 YouTube 地址另在独立项目 `d3054ee1-ef32-42bb-b7d9-d07a0fc6e74b` 实际尝试360p，返回 `HTTP Error 403: Forbidden`，未添加规避或启动AI；YouTube成功下载仍 NOT-VERIFIED，不扩成构建阻塞。

独立任务表 `batch-independent.xlsx` 通过实际页面文件输入导入。空源/目标语言继承独立音频项目已核对的en/简体中文，Done行未入队。批次 `96f3eb93-fef6-4b5e-b6cd-ab759d602971` 中音频行完成，独立invalid项目 `6e3e1f82-3fac-4d46-bed1-ee096113bfce` 仅在FFmpeg准备阶段失败。音频项目runId、chunks、translation及dubbing对象前后完全一致，本次缓存复用实际通过；不改写之前B选材失误的分类。结果与产物在 `.nimi/local/full-app-acceptance/`。

当前193工具包合并了正常Desktop停止退出码修正，SDK/Kit/native与4a/af保持同一执行包；未因此重跑既有AI。新的本地0.1.2候选将覆盖完整业务恢复代码，原4aa2a96局部0.1.2包已另存 `.nimi/local/partial-4aa2a96/`，冻结0.1.1和852产物不动。当前工作树的安装态业务仍待manager真实验收，正式发布未进行。

YouTube 的一次等价正常调用核对使用同一 App `.venv`、`workerEnvironment` 和360p下载选项，仍返回 HTTP403 / exit1。verbose实际识别到 yt-dlp2026.06.09、yt_dlp_ejs0.8.0、Deno2.8.1，以及本App的FFmpeg/FFprobe；没有缺JS runtime的诊断。超过90天的版本提示已记录，但不足以归因为版本或网站限制。日志位于 `.nimi/local/full-app-acceptance/youtube-normal/download.log`。此核心URL路径未通过，原因未定位；不采用绕过、不把它扩大为独立构建阻塞。

## 固定稳定版下载器后的原入口复验

在当前候选构建结束后，依据 [yt-dlp 2026.08.19 官方发布说明](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19)，于本 App `.nimi/local/ytdlp-20260819` 独立环境固定2026.8.19及其声明的EJS0.8.0，以同一参数对同一URL只重测一次，成功下载并合并视频。其它网络库沿主lock固定，Deno2.8.1满足其>=2.6.6要求。随后仅固定主App的yt-dlp2026.8.19，未启用自动更新器、nightly或额外规避参数。

正常监督App中选择原失败的独立项目d3054ee1-ef32-42bb-b7d9-d07a0fc6e74b，保持同URL与360p，从“下载或重试”入口成功到ready：managed MP4 22223529 bytes，SHA-256 b675b676e79e4b4168c22ad5c3ee93919b4b025aa6c4845a553ee8a42fb2cc20，页面媒体readyState=4、duration=432.661s。没有AI调用。原403是历史真实失败；现在只把这个原失败步骤在固定组合下标为通过，不外推所有网站/链接，也不凭发布说明断定每个403的原因。独立与App记录在 `.nimi/local/full-app-acceptance/youtube-20260819/` 和 `youtube-app-project.json`。
