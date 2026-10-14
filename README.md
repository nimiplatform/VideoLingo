<div align="center">

<img src="/docs/logo.png" alt="VideoLingo Logo" height="140">

# Connect the World, Frame by Frame

<a href="https://trendshift.io/repositories/12200" target="_blank"><img src="https://trendshift.io/api/badge/repositories/12200" alt="Huanshere%2FVideoLingo | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

[**English**](/README.md)｜[**简体中文**](/translations/README.zh.md)｜[**繁體中文**](/translations/README.zh-TW.md)｜[**日本語**](/translations/README.ja.md)｜[**Español**](/translations/README.es.md)｜[**Русский**](/translations/README.ru.md)｜[**Français**](/translations/README.fr.md)

</div>

## 🌟 Overview ([Try VL Now!](https://videolingo.io))

VideoLingo combines speech recognition, subtitle translation, segmentation and dubbing in a Streamlit interface. It produces subtitle files and optionally subtitled or dubbed videos. Translation quality depends on the source audio, language and chosen models.

Key features:
- 🎥 YouTube video download via yt-dlp

- Word-level speech recognition and alignment with WhisperX

- **📝 NLP and AI-powered subtitle segmentation**

- **📚 Custom + AI-generated terminology for coherent translation**

- Direct translation with optional reflection and natural rewriting

- Subtitle segmentation with configurable length limits

- **🗣️ Dubbing with GPT-SoVITS, Azure, OpenAI, and more**

- 🚀 One-click startup and processing in Streamlit

- 🌍 Multi-language support in Streamlit UI

- 📝 Detailed logging with progress resumption

- 🔍 Model searchbox with API auto-fetch — search and filter from your provider's full model list

- ⏯️ Task control — pause, resume, or stop processing at any step

The workflow combines transcription, translation, subtitle layout and dubbing in one project.

## 🎥 Demo

<table>
<tr>
<td width="33%">

### Dual Subtitles
---
https://github.com/user-attachments/assets/a5c3d8d1-2b29-4ba9-b0d0-25896829d951

</td>
<td width="33%">

### Cosy2 Voice Clone
---
https://github.com/user-attachments/assets/e065fe4c-3694-477f-b4d6-316917df7c0a

</td>
<td width="33%">

### GPT-SoVITS with my voice
---
https://github.com/user-attachments/assets/47d965b2-b4ab-4a0b-9d08-b49a7bf3508c

</td>
</tr>
</table>

### Language Support

**Input Language Support(more to come):**

🇺🇸 English 🤩 | 🇷🇺 Russian 😊 | 🇫🇷 French 🤩 | 🇩🇪 German 🤩 | 🇮🇹 Italian 🤩 | 🇪🇸 Spanish 🤩 | 🇯🇵 Japanese 😐 | 🇨🇳 Chinese* 😊

> *For local Chinese recognition, explicitly select Chinese to use the punctuation-enhanced Belle Whisper model.

Translation languages depend on the selected LLM; dubbing languages depend on the selected TTS method.

## Installation

Meet any problem? Chat with our free online AI agent [**here**](https://share.fastgpt.in/chat/share?shareId=066w11n3r9aq6879r4z0v9rh) to help you.

Install [Git](https://git-scm.com/downloads), [uv](https://docs.astral.sh/uv/getting-started/installation/) and [FFmpeg](https://ffmpeg.org/download.html) first. Reopen your terminal after installation and check `git --version`, `uv --version` and `ffmpeg -version`.

For NVIDIA acceleration, install a driver compatible with your GPU. The host installer selects PyTorch `cu128` when `nvidia-smi` reports CUDA >=12.8, otherwise `cu126`; without NVIDIA it selects CPU packages. This selects Python packages, not a system CUDA Toolkit. Local WhisperX GPU recognition also needs CUDA 12 cuBLAS and cuDNN 9 libraries available to the process; see [GPU prerequisites](docs/pages/docs/start.en-US.md#gpu-runtime).

> **Note:** FFmpeg is required. Please install it via package managers:
> - Windows: choose a **shared-library build** from the Windows builds linked on the [FFmpeg download page](https://ffmpeg.org/download.html), then add its `bin` directory to PATH.
> - macOS: ```brew install ffmpeg``` (via [Homebrew](https://brew.sh/))
> - Linux: ```sudo apt install ffmpeg``` (Debian/Ubuntu)

### Install with uv

uv downloads Python 3.13 and creates an isolated `.venv`. No preinstalled Python is needed for the command below. The application supports Python 3.10–3.13. Use **FFmpeg 7 shared libraries** for the pinned TorchCodec 0.7; FFmpeg 8/9 alone is not compatible. See the [verified Windows build](docs/pages/docs/start.en-US.md#ffmpeg-runtime).

1. Clone the repository

```bash
git clone https://github.com/Huanshere/VideoLingo.git
cd VideoLingo
```

2. Create the environment and install dependencies

```bash
uv run --no-project --python 3.13 setup_env.py
```

3. Start the application

```bash
.venv\Scripts\streamlit run st.py        # Windows
.venv/bin/streamlit run st.py            # macOS / Linux
```

Or double-click `OneKeyStart.bat` on Windows. It prefers `~/.venvs/videolingo` when present, then the project `.venv`. Open `http://localhost:8501` and enter your API URL, key and model in the sidebar.

### Docker
For a Linux NVIDIA container deployment, install Docker, a compatible GPU driver and the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). The image uses the same Python 3.13 setup and application dependencies, with CUDA 12.8.1/cu128 by default. See [Docker docs](/docs/pages/docs/docker.en-US.md) for the matched CUDA 12.6 alternative and persistence settings.

```bash
docker build -t videolingo .
docker run -d -p 8501:8501 --gpus all videolingo
```

## APIs
VideoLingo supports OpenAI-Like API format and various TTS interfaces:
- LLM: choose an OpenAI-compatible Chat Completions provider and model that can return the structured JSON required by the workflow. Configure the API URL, key and model in the sidebar.
- Speech recognition: run WhisperX locally or use the ElevenLabs API.
- TTS: Azure, OpenAI, Fish TTS, SiliconFlow Fish/CosyVoice2, GPT-SoVITS, Edge TTS, F5-TTS and a custom adapter in `core/tts_backend/custom_tts.py`.

For detailed installation, API configuration, and batch mode instructions, please refer to the documentation: [English](/docs/pages/docs/start.en-US.md) | [中文](/docs/pages/docs/start.zh-CN.md)

## Current Limitations

1. Background noise and language-specific alignment models affect recognition and word timestamps. Vocal separation may help. Numbers and symbols may lack reliable word timings; inspect the resulting subtitles.

2. LLM output must satisfy the workflow's JSON structure. For failures, inspect `output/gpt_log/error.json`. Existing successful response caches and completed outputs can be reused on retry; changing the model alone does not regenerate every completed stage. Do not delete all output as the first troubleshooting step.

3. Dubbing quality and timing depend on translation, the TTS service and speech rate. Speed adjustment does not guarantee natural delivery or perfect synchronization.

4. Local WhisperX uses one recognition/alignment language per segment. Mixed-language speech is not guaranteed to retain accurate text and timing in every language.

5. The dubbing workflow does not automatically assign a separate voice to each speaker.

## 📄 License

This project is licensed under the Apache 2.0 License. Special thanks to the following open source projects for their contributions:

[whisperX](https://github.com/m-bain/whisperX), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [json_repair](https://github.com/mangiucugna/json_repair), [BELLE](https://github.com/LianjiaTech/BELLE)

## 📬 Contact Me

- Submit [Issues](https://github.com/Huanshere/VideoLingo/issues) or [Pull Requests](https://github.com/Huanshere/VideoLingo/pulls) on GitHub
- DM me on Twitter: [@Huanshere](https://twitter.com/Huanshere)
- Email me at: team@videolingo.io

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Huanshere/VideoLingo&type=Timeline)](https://star-history.com/#Huanshere/VideoLingo&Timeline)

---

<p align="center">If you find VideoLingo helpful, please give me a ⭐️!</p>

## Nimi integration status (2026-09-14)

**平台能力迭代协作中 — platform capability iteration in progress.** The user has
authorized complete VideoLingo adaptation with the manager owning the required
Nimi capability work. This supersedes the earlier decision to stop this candidate
when a new capability was needed. The App remains a third-party consumer and
waits for manager-delivered local development packages and formal interface and
installation guidance. Development and real acceptance do not depend on an npm,
GitHub or Registry release; publication comes after acceptance. No new capability
is assumed available. The root App now has a working project/media/transcription
and source-separation integration; the full translation and dubbing product is still being migrated. The
baseline is fork `https://github.com/nimiplatform/VideoLingo`, commit
`5cb55d850561ae6a10a325ece411993db6acc8c1`; the upstream is
[Huanshere/VideoLingo](https://github.com/Huanshere/VideoLingo). The Apache-2.0
license, Streamlit product, Python algorithms, and existing business scope remain
the baseline for this evaluation. No business account or registration flow exists
in the local product, so Nimi access must not introduce one.

The root `package.json` now defines the actual adopted App, with its Streamlit
renderer, Electron Host, tests and build commands. It now uses the published
App Tools 0.11.4, SDK 0.21.0, Kit/native 0.18.1 and Nimi Coding 0.6.5 with
Electron 44; the package lock pins registry resolutions. See [Nimi development](docs/nimi-development.md)
for the independent Python/Node setup, product interfaces and current results.
The original admission baseline was App Tools 0.6.0 / SDK 0.13.0 / Kit 0.9.0;
the earlier temporary results below remain separate. No parent workspace
dependencies or Nimi source checkout were used.

The bounded [business input/output requirements](docs/nimi-consumer-requirements.md)
describe word timing, source separation, the exact spaCy consumers, an existing
short media sample, and reusable media processing. They are consumer requirements,
not a proposed SDK contract. Both projects consume explicit manager deliveries;
the root App is the current product migration target.
If local packages are rejected by app-tools, report the tool defect to the manager;
do not disable checks or disguise a local package as a public release.

### Product requirements and public mapping

| User task | Actual product path and necessary result | Nimi admission evidence |
| --- | --- | --- |
| Import video or audio, or download a YouTube video | `st.py` → `core/st_utils/download_video_section.py` and `core/_1_ytdlp.py`; preserve source media, format handling and preview | Download, decode, resample and bounded slicing remain App media work. Managed persistent project data must use SDK/Kit storage. |
| Recognize and time speech | `core/_2_asr.py` → WhisperX transcription **and forced alignment**, or ElevenLabs word timestamps → `process_transcription` → `core/_6_gen_sub.py`; needs source text, detected language, and real word start/end times | Initial SDK 0.13.0 lacked the required formal result projection. Local development SDK 0.14.0 / Kit 0.10.0 now deliver typed `job.transcription`. A real English demo produced 106 aligned units and passed the original cleanup/matcher into source SRT; see the dated result below. Other languages, chunk boundaries, no-speech and full product use remain unverified. |
| Produce coherent single-line translated subtitles | spaCy linguistic segmentation → LLM split/summarize/terminology/translate/reflect/adapt → long-line split and exact source-word alignment; export four SRT variants and optionally burn subtitles | `createNimiLocalAppTextModel` supports structured `responseFormat`; prompts, validation, terminology and splitting algorithms were identified for reuse. Formal model configuration and real structured output remain untested. spaCy uses a learned linguistic model, not automatically authorized deterministic media processing; LLM JSON is not evidence of equivalent behavior. Direct token/POS/dependency/sentence-boundary requirements have been documented for manager-owned platform work. |
| Dub a video while retaining its background audio | The upstream dubbing chain unconditionally separates vocals and summed non-vocal sources before reference extraction and final mixing | Manager delivery `dev-b29f12026` adds the public `audio-separate` Job. The root App has completed a real paired-WAV separation of the existing demo through Nimi, streamed artifact adoption and deterministic assembly. No App-local Demucs inference was used. Reference extraction, synthesis and final dubbing remain separate unverified work. |
| Use preset or reference/cloned voices | `core/tts_backend/tts_main.py`, `sf_fishtts.py`, `sf_cosyvoice2.py`, `gpt_sovits_tts.py`; original reference, first-clip and per-clip voice modes; actual synthesized duration, retiming, concatenation and video/audio export | Local App `voice-create` accepts reference audio and returns a VoiceAsset; `speech-synthesize` accepts preset/VoiceAsset references. The generated `studio-voice` module demonstrates both. Eligible configured routes and reference-to-synthesis behavior remain untested. Different provider names do not establish a capability gap. |
| Pause, resume, stop, retry, archive and batch-process | `core/st_utils/task_runner.py`, `transcription_cache.py`, `ask_gpt.py`, `onekeycleanup.py`, `batch/utils/video_processor.py`; cooperative cancellation, per-stage files, ASR/LLM caches, batch error/retry state | Local App jobs expose submit/get/subscribe/cancel; SDK/Kit provide storage and session invalidation. Workflow checkpoints remain App-owned. The current singleton task pointer and shared relative `output`/configuration paths require project/session isolation during a future adaptation; no isolation or recovery acceptance has run. |

Package references: [SDK integration guide](node_modules/@nimiplatform/sdk/README.md),
[Local App AI types](node_modules/@nimiplatform/sdk/dist/core/app/local-app-runtime-platform-ai.d.ts),
[AIConfig types](node_modules/@nimiplatform/sdk/dist/core/ai/capability-configuration.d.ts),
[Kit Host guide](node_modules/@nimiplatform/kit/shell/electron/README.md), and
[lifecycle/adapt/acceptance guides](node_modules/@nimiplatform/app-tools/skills/nimi-app-lifecycle/SKILL.md).
The [public multimodal guide](https://docs.nimi.ai/runtime/multimodal) describes
voice cloning and artifact contracts, but does not resolve the word-timing or
source-separation questions above. Internal source/spec links were not followed.

### Bounded execution and manager handoff

App Tools generated a temporary `studio-voice` App under `.nimi/local/admission`
with App ID `ai.nimi.videolingo.admission`, version 0.1.0. Its generated Host and
product module were retained. Its own lockfile resolves the same four Nimi
versions plus Electron 42.10.1. Fresh scaffold validation requires the exact
matrix **range declarations** (for example `^0.13.0`); compatible exact
declarations are rejected. The probe therefore retains generated ranges and a
frozen lockfile. The root tooling manifest retains exact versions.

Probe-only results: `init`, `sync`, `check`, `typecheck`, and `build:electron`
passed. A frozen install also passed. This establishes the temporary Host's
engineering preparation, not VideoLingo business behavior or installation.

Initial launch from `.nimi/local/admission`, before the environment was ready:

```text
pnpm exec nimi-app dev --shell electron
[nimi-app] failed: Nimi is not running. Open Nimi, sign in, and run this command again.
```

Expected: Desktop-supervised Electron with this exact App's loopback CDP target.
At that point the official launcher exited before a protected session was
available; no AI configuration or consume call ran. This was an environment
prerequisite failure, not an AI capability rejection. After manager confirmed
Desktop/Runtime readiness, the same official command launched the supervised
App successfully; the current protected-session result is recorded below.

Manager owns capability implementation and delivery. The App does not read the
Nimi main repository/private specifications, implement Runtime, guess artifact
schemas, or run the old AI engines as a substitute. Work before the next delivery
is limited to the bounded consumer requirements and necessary independent
integration preparation. The fixed combination and generated admission project
are retained. The first local tool delivery below does not include the new speech
capabilities. An unpublished
support-boundary documentation correction alone does not establish a new
capability or an accepted product path.

A non-blocking tooling warning was also observed with pnpm 10.34.5 in the nested
probe: `pnpm.onlyBuiltDependencies` in generated `package.json` was reported as
ignored. The frozen install and Host build completed; this warning has not been
promoted to a capability or launch failure.

### First local development package iteration

The first completed local tool iteration used manager deliveries: App Tools 0.6.1 from
`dev-6f5b08567`, and SDK 0.13.0, Kit 0.9.0 and its Windows native 0.9.0 package
from `dev-1f40dc7e1`, with nimi-coding 0.6.3 unchanged. Its independent
`pnpm-workspace.yaml` retains
`packages: ['.']`, the prior build-script allowlist, and four explicit local
tarball overrides. The native package remains Kit's optional dependency.
Initial install, new-tool sync preview/apply, and reinstall passed; sync retained
all four overrides and updated the managed App Tools declaration to `^0.6.1`.

With the initial `dev-1f40dc7e1` App Tools archive, the first failed step was
ordinary `pnpm exec nimi-app check --json`:
`Local Nimi package is not installed: @nimiplatform/kit-protected-local-win32-x64`.
The native entry actually resolves from Kit's installed public Electron entry
and exists in this App's pnpm store; the lock and Kit optional-dependency snapshot
both resolve the supplied local archive. There is no root direct-dependency link.
This discrepancy was reported to the manager and corrected through the new
`dev-6f5b08567` App Tools archive, without an App-side checker edit or direct
native dependency. Changing only that override, reinstalling and rerunning the
original check succeeded. Typecheck and Host compilation then passed.

`pnpm exec nimi-app build --target windows-x86_64 --json` passed and executed
the actual `build:electron:production` owner command, including renderer/Host
build, isolated production dependency staging and Electron packaging. Output is
`.nimi/local/admission/dist-electron-package/videolingo-admission-shell-win32-x64/`.
The executable and ASAR exist. SDK README/public entry, Kit manifest/public
Electron entry and the native `.node` binary in the actual payload matched the
selected local archive bytes. This verifies the temporary scaffold payload's
local-package build; it is not a VideoLingo business build or installation.

After Desktop/Runtime became ready, the original `nimi-app dev --shell electron`
reported a supervised Electron Host. Only its reported loopback App CDP target
was used, with title `VideoLingo Admission` and the declared renderer origin.
The generated SDK client returned `auth.status(): state=session-bound,
sessionBound=true`; the protected `aiConfig.get()` returned revision `0` with
empty capabilities/effective selections. No account action was required for
these reads. No model was selected and no AI consume call or new speech
capability was tested. Public-release preflight, `.nimiapp` packaging,
installation and VideoLingo's real user task remain outside this result.

### Aligned transcription delivery (2026-09-15)

The current admission App uses all four archives from manager delivery
`dev-69274f455`: App Tools 0.7.0, SDK 0.14.0, Kit 0.10.0 and Windows native
0.10.0. Nimi-coding remains 0.6.3. The delivered version matrix, SDK
README/CHANGELOG, Kit generation README and upgrade guide were read. Explicit
override installation, sync preview/apply, reinstall, ordinary check, typecheck
and Host compilation passed. The previous dev session was stopped normally for
the environment update; a new official supervised dev session is running.

The delivered completed-job contract now includes `transcription` with
`status: transcribed | no-speech`, original text, model-reported language and
ordered `{ text, startSeconds, endSeconds }` alignment units. The documented
local recipe requires `timestamps: true` for actual alignment, accepts at most
300 seconds, reports times relative to submitted audio zero with 80 ms granularity,
and can return character units. The bounded English source-subtitle result is
recorded below; it does not establish the other language or full product paths.

The repository's `docs/public/videos/demo.mp4` was decoded using the actual
VideoLingo `convert_video_to_audio` and `audio_slice_wav` functions in an isolated
App-local case directory. The prepared seekable PCM WAV is 50.64275 seconds,
16 kHz mono, 1,620,612 bytes, with source offset zero. It is served only by the
temporary probe at `public/admission/demo.wav`; the source media is unchanged.
Normal imports of `process_transcription`, `get_sentence_timestamps` and
`align_timestamp` succeeded in `.nimi/local/media-env`; no AST extraction,
replacement function, old AI inference or model download was used. Environment
dependencies are retained in `.nimi/local/media-requirements.txt`.

The initial selection mismatch was resolved as a manager configuration-guidance
error: Local intent is `{}` and carries no Loadout reference; App options expose
Nimi's current selection, not all saved Loadouts. Manager made the selection
through Nimi's model configuration. The App then queried the same public options,
observed `语音转文字 · Qwen3 ASR with word alignment` ready, and saved only the
normal `audio.transcribe` Local intent at revision `1`. The clarification was
read from the SDK README in documentation-only delivery `dev-87d6bbefb`; current
running overrides remain `dev-69274f455`, as instructed. No App API was invented
or extended to carry a resource selector.

Real request: `speech-transcribe`, prepared WAV bytes, `timestamps: true`, empty
language hint/prompt/responseFormat, timeout 300000 ms, source chunk offset `0`.
Protected Job `01M2GCWJ93TG96W2Q6JSWP2VT1` completed with
`transcription.status=transcribed`, `language=en`, 106 ordered alignment units and
the original punctuation-bearing text. `transcriptionText` matched the same
text. Times ranged from the first word `Sometimes` at 0–0.56 s to `Period.` at
48.72–49.20 s, within the actual 50.64275-second input. The largest inter-unit
gap was 4.64 s. Five units had equal start/end; these are actual model outputs
at the documented granularity, not App-generated timings or a claim of perfect
word-level acoustic accuracy.

The actual typed result was fed through normal imports of the unchanged
`process_transcription`, `get_sentence_timestamps` and `align_timestamp` functions.
All 106 units survived cleanup, and 9 source sentence rows matched and exported
to `.nimi/local/demo-transcription/source.srt`. The rows were a deterministic
punctuation split of the actual source text for this bounded timing check;
spaCy segmentation, translated rows and final single-line product formatting
were not substituted or claimed. The actual result, source text and word table
are retained alongside the SRT; `.nimi/local/match-demo-transcript.py` runs this
specific consumer check without mocks, AST extraction or timestamp estimation.
This is one successful real transcription-to-source-subtitle path. CJK/other
languages, nonzero chunk offsets/boundaries, no-speech, cancellation/recovery,
full translation, source separation and dubbing remain **NOT-VERIFIED**.

| Acceptance claim | Status |
| --- | --- |
| VideoLingo development business journey through Nimi | **NOT-VERIFIED** |
| VideoLingo production build/package | **NOT-VERIFIED** |
| Formal release/Registry admission | **NOT-VERIFIED** |
| Nimi installation and installed App operation | **NOT-VERIFIED** |

Only admission preparation has been performed. No VideoLingo product rewrite,
provider bypass, estimated subtitle timing, release, Registry submission, remote
setting change or push was performed.
