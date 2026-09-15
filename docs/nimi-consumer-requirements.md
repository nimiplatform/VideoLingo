# VideoLingo 直接消费要求

状态：**平台能力迭代协作中**。完整适配是目标；平台缺口由 manager 推进，实际验收通过后再进入发布。以下来自当前 Python 消费链的静态阅读，是业务要求，不是拟造的 Nimi API。基线为 `5cb55d850561ae6a10a325ece411993db6acc8c1`。SDK 0.14.0 / Kit 0.10.0 已跑通一次真实英文 demo 转写到原字幕匹配的短路径；具体已执行范围及其余 NOT-VERIFIED 路径见 README。

## 1. 逐词识别与对齐

入口为 [transcribe](../core/_2_asr.py)，经 [audio_preprocess](../core/asr_backend/audio_preprocess.py) 写入 `cleaned_chunks.xlsx`，由 [get_sentence_timestamps / align_timestamp](../core/_6_gen_sub.py) 映射字幕和配音时间。原本地路径先识别 raw 音频，再用同一时间范围的人声音频做 WhisperX forced alignment；云路径直接识别人声音频。产品所需结果是与实际音频对齐的词，不要求平台复刻供应商的返回包装。

| 消费内容 | 实际要求 |
| --- | --- |
| 音频输入 | App 预处理为 16 kHz、单声道；通常为 32 kbps MP3，缺 libmp3lame 时 `raw.mp3` 实际装 PCM WAV。`audio_slice_wav` 可将指定时间段确定性转为 16 kHz、单声道、PCM s16le WAV。MIME 应依据实际内容。源视频和音频均经 `aresample=async=1:first_pts=0` 对齐到媒体呈现时间零点。 |
| 原文词序列 | 当前投影为 `segments[].words[].word`，落表为 `text`，保留源语言、词序、拼写及标点，不能翻译、改写或把整句话伪装成一个有时间的词。分段包装可在 App 转换；最终需要足够细的词边界以支持后续切句。 |
| 起止时间 | 当前字段 `start` / `end` 为数值**秒**，相对整段预处理媒体的零点。底层识别返回片段相对时间时，两个原适配器都加一次分块起点；不得漏加或重复加。实际语音词需要有限、非负、起点不晚于终点的真实对齐时间，按媒体顺序消费。SRT 输出才截取到毫秒；中间值保留原精度。 |
| 识别语言 | `language` 写入 `whisper.detected_language`；自动检测后必须是实际语言，不能为空或 `auto`。当前分句/joiner 支持 `en/es/fr/de/it/ru`（空格）与 `zh/ja`（无空格），并据此加载语言模型。ElevenLabs 适配器把 `eng/fra/deu/ita/spa/rus/jpn/zho` 转为对应二字母码，也将 `kor→ko`、`yue→zh`；但当前 joiner 不支持 `ko`，映射存在不等于全流程支持。手动指定语言时以用户指定值作为后续源语言。 |
| 可选说话人 | `segment.speaker_id` 会落表，缺省为 None；ElevenLabs 用说话人变化和超过 1 秒的词间隔分组。当前字幕对齐和配音不据此做多角色选声，稳定多说话人识别不是核心流程的新增硬前提。 |
| 未消费数据 | 置信度、声学分数、字符级时间、词级语言标签、供应商原始响应不是当前直接消费要求。 |

**词与标点。** `process_transcription` 去除法文 `«»`，丢弃超过 30 字符的词，`save_results` 去掉空字符串；这些是现有清理行为，不是允许丢词的质量标准。NLP 使用仍带标点的原文。时间对齐时 `get_sentence_timestamps` 对词和待匹配原句小写化、去标点，按字符序列找到首尾词并取其 start/end；不匹配就抛错。词内嵌入一整句的空格会破坏该匹配。标点可以附着在词上或保留为原文边界，不需要捏造独立的发音时段。已有小于 1 秒的字幕间隙合并是 App 展示规则，不替代词的真实对齐。

**空输入与缺时间。** 无效/零长音频、有效静音但没有语音词、识别失败和识别成功却无法对齐，需要可区分。原 `elev2whisper` 无词时返回空 segments，但后续空 DataFrame 在 `save_results` 访问 `text` 会失败，尚无正常的“无语音”完成分支。原清理函数会将没有 words 的 segment 合成一个词；没有 start/end 时借用邻词时间，部分缺字段还可能抛 KeyError/传出 None。这些残留不能作为 Nimi 成功判据。正式输出若缺实际语音词的时间，App 必须能识别并停止/报告该步，而不是补估算值或生成假完成字幕。缓存校验目前也不足以证明每个词都有时间。

**分块与恢复。** `split_audio` 默认目标 1800 秒，在附近 ±60 秒窗口找至少 1 秒静音，切在静音开始后 0.5 秒，否则按目标时间切；区间首尾相接，无重叠。`transcribe` 依次拼接各块 segments，没有跨块去重、重对齐或时钟修正。因此结果必须明确片段时间原点，保留静音和边界处词序，不重复返回上一块文本。缓存以源内容、ASR/模型/语言/分离配置和分块范围区分，并保存语言；取消检查后才写块结果。当前自动语言以后处理到的块覆盖配置，并未支持多语言词级编排。平台若限制更小载荷，可由 App 确定性重新分块，但需验收边界处无重复/遗漏，默认半小时不是平台载荷要求。

## 2. 人声与背景音分离

入口为 [demucs_audio](../core/asr_backend/demucs_vl.py)。[extract_refer_audio_main](../core/_9_refer_audio.py) 在配音阶段无条件调用它；即使 ASR 的分离增强开关关闭，完整配音仍需要分离。

| 项目 | 源码行为与真实消费限制 |
| --- | --- |
| 输入 | `separator.separate_audio_file(_RAW_AUDIO_FILE)` 接收完整预处理音频文件，内容为上述 mono/16 kHz MP3 或 PCM WAV。App 没有先做分离分块；模型内部如何切块不是业务接口要求。 |
| 输出语义 | 两路：`vocals`，以及**所有非 vocals stem 的和**作为 background。App 不分别消费 drums/bass 等乐器 stem，也不需要供应商或模型同名。背景用于保留音乐/环境声，不能用原混合音直接冒充。 |
| 输出格式 | 目前保存到 `vocal.mp3` / `background.mp3`，参数为 bitrate=128、preset=2、clip=rescale、as_float=False、bits_per_sample=16。文件名/编码是当前 App 落盘约定，平台不必复刻；转换须为真实、确定性的媒体转码。人声要能被 soundfile/FFmpeg 解码，背景要能被 FFmpeg 混音。 |
| 采样率与声道 | 当前代码从 `model.samplerate` 和 `model.audio_channels` 获取，**没有硬编码 44100 Hz 或双声道**。`sf.read(vocal)` 读取实际采样率与声道，`sf.write` 保留；参考片段索引使用 `int(seconds * sr)`。后续 ASR loader 按其 ASR 采样率读取，FFmpeg 混音处理音频格式。真实要求是正确、可读取的采样率、声道和样本序列，而非固定某一模型规格。 |
| 长度/对齐 | 两路须保留同一个原点、语速、停顿和完整媒体时间轴。人声用字幕的全局 start/end 直接索引，没有额外 offset；背景在最终 `[1:a][2:a]amix=inputs=2:duration=first` 中是第一路，其长度决定混音时长。不可自行裁静音、拼掉空隙、变速或引入未声明的前缀延迟。需要等时长、可对齐的两路成品，而非只有人声。 |

时间要求来自索引与混音的直接依赖；原代码**没有**两路样本数/长度一致性断言，也没有规定数值容差，不能声称已有检查证明了对齐。原分离缓存仅检查两个输出路径存在，不能证明同一输入、完整写入或同一成功 Job。接入时要避免取消/失败留下半套文件后被当成可恢复的成功结果；这仍是 App 落盘/恢复职责。

## 3. spaCy 分句的直接消费

[split_by_spacy](../core/_3_1_split_nlp.py) 调用 [init_nlp](../core/spacy_utils/load_nlp_model.py)，从 `config.yaml::spacy_model_map` 选择八种语言的 md 模型，再执行 mark → comma → connector → long-by-root。另一个入口是 [_3_2_split_meaning.py::tokenize_sentence](../core/_3_2_split_meaning.py)。这些入口调用 `spacy.load(...); nlp(text)`；此轮未加载/下载模型或执行旧引擎。

| 消费者 | 直接读取的字段/结构 | 保留的 App 规则 |
| --- | --- | --- |
| [split_by_mark](../core/spacy_utils/split_by_mark.py) | `doc.has_annotation("SENT_START")`、`doc.sents`、`sent.text` | 根据语言 joiner 合并词；合并 `-` / `...` 相连句子；标点独占行时附着上一句。**初始句界来自语言 pipeline**，不是只按句号 split。 |
| [split_by_comma](../core/spacy_utils/split_by_comma.py) | 有序可索引 tokens，`text/i/is_punct/dep_/pos_`，`doc[a:b].text` | `,`/`，` 的左右最多各 9 token；右侧含 `nsubj/nsubjpass` 或 `PRON`，并含 `VERB/AUX`；两边非标点词数均须大于 3。满足条件时去掉切点逗号并切分。 |
| [split_by_connectors](../core/spacy_utils/split_by_connector.py) | `doc.lang_`、`doc.text`、tokens 的 `text/i/is_punct/dep_`、`token.head.pos_`、可还原原文的 span | 按八种语言连接词表分支；英语 that 使用 `mark`＋head `VERB`，排除语言相关的 `det/pron/case`＋head `NOUN/PROPN`；避开缩略词后缀，每边至少 5 个非标点 token，切后对子句再次分析。 |
| [split_long_sentence](../core/spacy_utils/split_long_by_root.py) | tokens 的 `text/pos_/dep_/is_sent_end`、长度和顺序；切后重新 `nlp` 计数 | 超过 60 token 才进入；动态规划使用 `VERB/AUX/ROOT` 和句末候选点及 30 token 下限，仍长则按 token 数均分；按语言 joiner 还原。 |
| [tokenize_sentence](../core/_3_2_split_meaning.py) | 只消费有序 `token.text` 和 token 数量，虽然实际调用完整 `nlp` | 按长度决定 LLM 语义切句份数，LLM 返回 `[br]` 后由 `SequenceMatcher` 查找原文切点。token 计数规则与语言分词需保持一致。 |

需保留 token 的文档内次序和 head 关系，以及 NLP 输入的原文片段/空白，使 `doc[a:b].text` 可还原；仅 token 字符串列表不足以支持全部规则。没有直接消费 lemma、NER、词向量、概率、morph、tag、children 或完整依存子树。`dep_` 的实际分支值为 `nsubj/nsubjpass/mark/det/pron/case/ROOT`，`pos_` 为 `PRON/VERB/AUX/NOUN/PROPN`；其他标签仍可存在，按“不命中规则”处理。标签、head 和句界来自语言模型分析；tokenizer 的实现依赖语言 pipeline，不能一概视为统计推理或用空格规则替换。得到正式分析结果后的筛选、切分、动态规划、joiner 和文本匹配是 App 纯规则。正式合同与模型承载方式由 manager 交付，本文不拟造接口，也不宣称 LLM JSON 与原模型等价。

## 4. 现有素材与可复用媒体入口

本仓库已有 [docs/public/videos/demo.mp4](public/videos/demo.mp4)，被三个语言首页作为演示视频引用。文件 1,385,961 bytes，MP4 `mvhd` 时长 50.643 秒，含视频和音频轨。已由 App 原媒体函数解码为 50.64275 秒的 mono/16 kHz PCM WAV，并检查了带中英字幕的 10 秒画面。真实 Nimi 转写识别为 `en`，返回 106 个带实际时间的单元，已通过原字幕匹配。语音细节的逐词人工声学校准、背景分离质量及完整多语言产品适用性仍 **NOT-VERIFIED**；本素材未被替换或重新下载。

| 可复用入口 | 确定性业务处理 |
| --- | --- |
| [audio_preprocess.py](../core/asr_backend/audio_preprocess.py) 的 `convert_video_to_audio`、`prepare_audio_for_asr`、`audio_slice_wav`、`split_audio`、`normalize_audio_volume` | 提取、时钟规整、重采样、时间切片、静音检测与音量调整。 |
| [_6_gen_sub.py](../core/_6_gen_sub.py) 的 `get_sentence_timestamps`、`align_timestamp`、`convert_to_srt_format` | 消费真实逐词时间生成字幕，不产生声学对齐结果。 |
| [_9_refer_audio.py](../core/_9_refer_audio.py) 的 `time_to_samples`、`extract_audio` | 已有分离结果上的参考片段裁切；上层 `extract_refer_audio_main` 夹带 Demucs 调用，不能整段当作纯媒体入口。 |
| [_10_gen_audio.py](../core/_10_gen_audio.py) 的 `adjust_audio_speed`、`process_chunk`、`merge_chunks` | 依据实际生成音频时长计算变速、间隙和新字幕轴；生成 TTS 的上层流程不是纯媒体。 |
| [_11_merge_audio.py](../core/_11_merge_audio.py) 的 `process_audio_segment`、`merge_audio_segments`、`create_srt_subtitle` | 编码、按时间轴补间隙/合并、导出配音字幕。 |
| [_7_sub_into_vid.py](../core/_7_sub_into_vid.py)、[_12_dub_to_vid.py](../core/_12_dub_to_vid.py) 的视频合成部分 | 烧录字幕、缩放、背景与新配音混合；关闭烧录时已有占位视频分支不构成真实导出验收，接入需按受支持任务处理。 |

需求整理与复用点本身不证明产品路径通过。已执行的本地包、监督启动、真实英文转写及原字幕匹配结果，以及完整产品的四项 **NOT-VERIFIED** 状态见 [README](../README.md#nimi-integration-status-2026-09-14)。

## 5. 翻译与配音的后续接口边界（尚未实现）

以下只梳理既有业务输入/输出及已交付 SDK 入口，不执行推理，也不定义不存在的 NLP 接口。完整翻译入口依赖原规则生成的 `_3_2_SPLIT_BY_MEANING`；不得用任意标点切句或 LLM 伪造 token/dep/POS 代替该前置。

| 原业务入口 | 必须保留的直接消费 | 已有 Nimi 接入点 / 尚需实施 |
| --- | --- | --- |
| `_4_1_summarize.get_summary` | 有序分句文本按 `summary_length` 截取；`custom_terms.xlsx` 三列映射 `src/tgt/note`；返回 `theme` 与 `terms[]`，再追加用户术语。 | Host 可使用 `createNimiLocalAppTextModel(services.ai)` 和 `responseFormat: {type:'json-object'}`，沿用 `get_summary_prompt` 与结果校验。主题/术语、用户文件及缓存须放入同一项目的受管理存储。 |
| `_4_2_translate.translate_all` / `translate_lines` | 每块最多 600 字符、10 行；前块末 3 行、后块首 2 行、theme、匹配术语作为上下文。保留原编号、源文和目标语言。第一步各编号含 `origin/direct`；`reflect_translate` 打开时第二步保留 `origin/direct/reflect/free`。完成后按块顺序恢复，并检查行数与源文对应。 | 同一正式 `text.generate` 配置按原两步 prompt 分别执行；不是让模型接管整个 App workflow。原校验只检查部分字段，但下游直接读取 `origin`，适配输入/结果验证必须覆盖真实消费。 |
| `_5_split_sub.align_subs` 与字幕细分 | 字符加权长度、源/译字幕、已决定的源文切点；消费 `align[]` 中的 `target_part_1…n`，保留重新合并译文用于配音。最终时间仍由原词时间匹配生成。 | 可复用现有 JSON 文本模型调用；前置分句仍待正式 NLP 供给。不得让模型估计字幕时间或通过改写源句掩盖匹配失败。 |
| `_8_1_audio_task.check_len_then_trim` | 用既有阅读时长估计决定是否缩短文字；缩短结果字段是 `result`。 | 这是配音文字预算，不是 ASR 时间证据。文字缩短通过正式 text model；原“任何异常都解释为敏感拒绝并删标点”的兜底不能当成 Nimi 成功。 |
| `_8_1_audio_task` / `_8_2_dub_chunks` | 已对齐的源/译 SRT、编号、start/end、真实源时长、gap/tolerance、速度上限等；输出 TTS 任务、合并块与 cutoff。 | App 规则和调度继续留在 Python；将配置和中间表按项目隔离。估计值只服务规划，不能替代后续真实 TTS 音频时长。 |
| `_9_refer_audio` | 按任务的全局起止时间，从已完成分离的人声音频按 `int(seconds*sr)` 裁切；保留自带、首片段、逐片段参考策略。 | 消费现有项目的正式 vocals 结果和实际采样率；替换上层无条件调用旧 `demucs_audio` 的入口，复用裁切算法。不能再次运行 App-local Demucs。 |
| `tts_main` / 各参考音色模式 | 目标文字、目标语言、预置或参考音色；创建的音频必须可解码且时长大于零。原内容清理/有界重试策略可保留，但“生成失败后写 100ms 静音当成功”不可保留。 | `speech-synthesize` Job 已支持 text、language、audioFormat、voiceRef（preset / voice-asset）及可选速度等；参考音频经 `voice-create` 获得正式 VoiceAsset，再交给合成。真实可用模型、语言、音色有效期和单次限制仍待正式配置查询/验证，供应商同名不是前提。 |
| `_10_gen_audio` → `_11_merge_audio` → `_12_dub_to_vid` | 测量实际生成音频时长，再按原速度/间隙规则调整、合并，生成新配音字幕；最后混合正式 background。 | 合成 artifact 通过已有 adoptArtifact / asset streams 接收后进入 App 媒体处理。保留原输出算法，失效会话/取消/缺文件不能写完成标记，关闭烧录时的占位视频也不能算成品。 |

文本模型的公开结果是 `text/finishReason/outputItems…`；只对完整、正常结束的文本结果执行原 JSON 解析/修复和业务校验。`length/content-filter/error/unknown` 或中断不能作为已完成 JSON；不发送 App 内保存的旧供应商 key、base URL 或 model override。取消信号从 App 任务传入模型，原缓存改为项目/配置/输入有效性范围，不能让损坏响应或其它项目结果命中。

当前语音公开合同：参考创建使用 `voice-create` 的 `referenceAudio`（bytes/URI）、`referenceAudioMime`、`languageHints`、`preferredName`、参考文本；合成使用 `speech-synthesize` 的 `voiceRef`。译文目标语言是原 App 的产品设置，合成 language/voice 则需要按正式资源支持值映射，不能未经确认混用名称和编码。预置音色、参考克隆、逐片段克隆和配音质量均尚未执行。

最小接线顺序是：项目中的有效分句/术语与设置 → 原 prompt/校验算法 → Host 正式文本模型 → 同一项目的翻译/任务表 → 已接收人声的参考裁切 → 正式 VoiceAsset/TTS Job → 实际音频时长与原混音/字幕输出。业务数据通过 App 现有受限 worker/Host 接口自动传递，不在产品流程手抄 JSON，也不增设通用受保护 RPC 转发器。以上各段当前均 **NOT-VERIFIED / 未实现**；NLP 供给继续由 manager 处理。
