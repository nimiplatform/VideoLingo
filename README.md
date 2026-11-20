## Upstream v3.2.0 sync, published Nimi 0.24/0.16 upgrade, and 0.2.0 PC/Web candidates — 2026-11-21

Merged upstream `Huanshere/VideoLingo` `main` commit `d2d5a046d97526ae4950294cc5663ad520b22f52` (`v3.2.0` series, merge-base `11048cc4a78e2a36e657224566305ff7bb1a1ad9`, fork baseline `5b3075253da58abb0c3f5f570ca5c76c6c525f45`) into `nimi`, retaining upstream Apache-2.0 attribution and bundled SIL OFL subtitle fonts (`fonts/` + `fonts/licenses/`). Adopted v3.2.0 rendered-width bilingual subtitle splitting (`core/_5_split_sub.py`), HarfBuzz/BudouX/fontTools ASS typesetting (`core/utils/typeset.py`, `subtitle_style.py`, `subtitle_fonts.py`), `ffprobe` resolution probing without `opencv-python`, cross-drive Windows `fontsdir` staging, packaged `VIDEOLINGO_FONTS_DIR` cache seeding, and dubbing LUFS loudness normalization (`core/_12_dub_to_vid.py`). New projects default to `subtitleMaxLength: 80` and `subtitleTargetMultiplier: 1.0`, while existing projects retain legacy `75 / 1.2` fallbacks so prior translation hashes remain valid.

Removed all local `.tgz` workspace overrides and upgraded to published npm pre-release packages: `@nimiplatform/app-tools` `0.16.0-rc.10`, `@nimiplatform/sdk` `0.24.0-rc.10`, `@nimiplatform/kit` and `@nimiplatform/kit-protected-local-win32-x64` `0.24.0-rc.16`, `@nimiplatform/nimi-coding` `0.7.0`, `electron` `45.4.1`, and `vite` `8.3.8`. Declared `public_slug: videolingo` and `build:web:release`, placing `workspace.html` and `videolingo-media-worker.js` under `/_releases/0.2.0/` in hosted Web builds so Service Worker scope and Registry `verifyHostedBundle` checks pass without custom response headers. Bounded subtitle/text/workbook Web exports use standard browser downloads (`<= 32 MiB`) while large media exports retain streaming `showSaveFilePicker` handles.

Local candidates (not yet published to production or Registry):
- Windows PC `0.2.0`: `dist/nimi-app/ai.nimi.videolingo-0.2.0-windows-x86_64.nimiapp` (`1,129,727,560` bytes, SHA-256 `7733ee6480878131e2295f8b81e2a2a273f1443eeba0484dd767433af1e6cd6b`), verified with `test:packaged-backend` (including frozen HarfBuzz + ASS subtitle burn).
- Hosted Web `0.2.0`: `.nimi/local/nimi-web-0.2.0.zip` (`4,184,769` bytes, SHA-256 `03536ea0c29d2be1bb6245e8a13599f0f61dac104b6206402ac274b95fb2bfa2`), verified with Registry `verifyHostedBundle` and plain Node `http` static serving.
- Minimum PC version for Web users: **0.2.0+** (the currently admitted Catalog `0.1.9` descriptor only declares `runtime.consume` and does not expose `integration.provide` / `videolingo.workspace.v1`).

Dual-end acceptance on project `c285d538-89a2-4e39-baf5-ca60c906fcbc` (`v3.2.0 双端对照验收`, self-authored `20.54s` 1280×720 Chinese spoken clip `own-short-speech-zh.mp4`, SHA-256 `eceed693f7d5360af102eb08a5c659da6aafe54946d1b01fb9131239adfb1948`): PC completed Whisper ASR (`57` alignment units), `spacy/text-annotate/v1` Chinese sentence splitting, Gemma 4 26B `zh → English` 5-step translation, manual Cue 2 bilingual proofreading saved to user revision `aa0351fdec51d05b7d353c13d92b0287664f284304caa1434f9df837a6f987ef`, v3.2.0 HarfBuzz ASS subtitle video re-burn (`380,099` bytes, SHA-256 `57da0127d9ab1cc81f4492297db6bea405eb1faa623c7bced708080480f58b45`, verified in player and extracted frames), and HTDemucs + `qwen3-tts-flash` (`Cherry`) full dubbing & synthesis (`529,696` bytes, SHA-256 `49e9a10abb49758c43b57dfd1e8ace08d5621060fdabb3832a1658a228afc1a8`, H.264 1280×720 + 44.1 kHz stereo AAC, `mean_volume -30.0 dB`). Web (`https://127.0.0.1:4492/`) signed in with the same Nimi account (`Halliday`), connected to `videolingo.workspace.v1`, read back the original project and user subtitle revision, streamed both videos over Service Worker HTTP 206 ranges, completed explicit Disconnect → Connect and page reload reconnections without re-running AI, and exported openable UTF-8 `src_trans.srt` (`478` bytes, SHA-256 `66251d0fd62af808100dff9d9c1a718236ef30b42525c0e64a41b9ee31c73550`) and `subtitles.zip` (`2,304` bytes, SHA-256 `057b2869ea7ee5aa076e314354ee602df54a3aa28ab50e8b0b174a9362e49c26`). Production `https://videolingo.nimi.xyz` deployment, Registry admission, installed `0.1.9 → 0.2.0` Catalog upgrade, macOS/Linux, Android physical device, and 4 GiB real transfers remain **NOT-VERIFIED**.

## Local Web / Android companion — 2026-11-15
The complete `integration-20261114-android-http-rc.4` set is retained in `.nimi/local/`; only the Kit override changes to rc.4, while the declaration stays `^0.24.0-rc.1` as supported by App Tools. SDK, App Tools and Windows native bytes remain the previous frozen versions. This consumes the shared Android HTTP connection fix; no App retry loop or TLS bypass was added. Frozen offline install, typecheck, App Tools check, mobile build/sync and Android assembly passed. The original registration was normally stopped in Home and resumed. Existing AI/media acceptance remains recorded below. The rc.4 candidate passed the coordinated emulator reread: normal official login restored project d78a2eb7-4d4a-42e5-b606-498a26fd9efa with its completed 1/1 chunk, 14 units, en choice and Unreported language status. After more than two minutes of natural idle, the first explicit Disconnect → Connect succeeded and retained the same project and terminal result, without another AI call. The former first-connect network failure did not recur in this check.


This development tree uses the complete frozen integration set: SDK **0.24.0-rc.2**, Kit **0.24.0-rc.4** / native **0.24.0-rc.1**, App Tools **0.16.0-rc.2**, Nimi Coding **0.7.0**, and Electron **45.3.2**. The four original npm archives remain under `.nimi/local/integration-20261113-rc.2/`; explicit workspace overrides and the root lockfile select the current combination, including the later RC4 Kit delivery. App version **0.1.9**, existing project/batch formats, original registration and historical published artifacts are unchanged. This local iteration is not a public release.

The original Streamlit Desktop renderer still mounts the same React workspace. Native SDK/Kit access is now an explicit App platform adapter; Web and Android mount that same workspace through official Kit session factories and `videolingo.workspace.v1`. The PC `Projects`, `Batches`, managed assets, model operations and Python/FFmpeg helpers remain the execution and persistence owners. No mobile worker, generic Runtime proxy, private bridge injection or copied Host authentication material is introduced. Browser work does not become authoritative project or Job state.

Use `pnpm exec nimi-app dev --list-registrations`, then `pnpm dev -- --resume <current-selector> --cdp-port 58494` to retain the existing development registration. Native Streamlit now uses **1471** because **1467** is already occupied by DeepTutor; no other service was stopped. The local Web source is **https://127.0.0.1:4492/**, client `ai.nimi.videolingo.web.dev`, with that exact callback. With trusted certificate paths in `NIMI_WEB_TLS_KEY` / `NIMI_WEB_TLS_CERT`, `pnpm run dev:web` selects local Realm explicitly. `NIMI_DEV_REALM=local pnpm run build:web` builds this local source. Root coordinates Registry admission, official login and Home source/Integration grants; a running server is not admission or AI acceptance.

The provider preserves explicit project and batch actions, subtitle proofreading and export guards, pause/cancel/resume and existing Job IDs. Sources retain the original **4 GiB** upload limit, streamed in 64 KiB chunks; reference audio, workbooks and website-cookie inputs retain their original smaller limits. Large four-SRT revisions and batch inputs are staged as caller-bound JSON instead of being truncated to the Integration request limit. Responses and media are read in bounded 128 KiB ranges. Media references require actual project membership and expose visible media/results; website cookie bytes and internal settings are excluded. An uncertain write is never automatically replayed. Temporary upload/result records and abandoned preview handles expire independently of persistent projects and Jobs; active previews renew their own handles without affecting another page from the same consumer.

Web and Android keep a separate document for every Runtime scope. The current public client is captured in that document's parent channel; old requests cannot be redirected to a new scope. UI drafts and Android file choices are held separately under Kit's real identity lifetime and exact PC target. Android's system picker may end the old Runtime connection: its main-frame file input stays mounted, and a selected file is sent only after the user explicitly chooses **Continue upload** with the original PC connected and the corresponding fresh input ready. A changed account clears the file/drafts; another PC cannot receive them. No SDK call or old callback is rebound. Source media, references, terminology, cookies, XLSX task sheets and per-row/batch media use this flow. Actual Android source-media picker acceptance is recorded below; the other file-type/device combinations remain NOT-VERIFIED.

Web exports use the browser's real Save File picker and stream to its writable handle; browsers without that streaming Save API must use PC export. Android uses an App-owned **Storage Access Framework Save** plugin, not a share chooser. It receives bounded chunks into private cache, then asks for a system destination and copies on a background thread; success is returned only after the destination stream closes with the full byte count. No account is required for a local Downloads destination. Integer and Long JSON values are validated exactly, including offsets above 2 GiB / at 4 GiB; strings, fractions, negatives and unsafe numbers are rejected. Device free space remains a real prerequisite, and failed saves retain the PC original.

Engineering: frozen install, App Tools check, typecheck, original component/Host build, Web/mobile build and Capacitor sync passed. The original App suite plus transport tests passed **61 tests**; the later identity/file-lifetime slice passed its **3 tests**, and the affected combined slice passed **13 tests**. Gradle `testDebugUnitTest` passed the two meaningful Integer/Long boundary cases; `assembleDebug` passed. JDK Maven TLS initially refused the JUnit jar download; the unchanged official Maven artifact was fetched with Windows certificate verification, placed in the existing content-addressed cache, and a subsequent standard online Gradle run recorded its metadata before offline assembly. No TLS validation or repository URL was changed.

Real native observation through the supervised **58494** target read the original **16 projects**, including `rainy-library.mp4` and its completed **4/4** subtitle workflow. The six saved resource selections were visible and unchanged. Formal Web login, the exact **4492** source approval and all **12** Integration grants were completed through the official account/Home interfaces. The Web workspace then read the same original projects and completed workflow; the original subtitle video played to its full **33.749 seconds**, with no media error.

The real Web file chooser imported the approved synthetic **6.88-second** `catalog-0.5.9-cloud.wav` into a new isolated project, `8a76d2ab-9003-4990-8c64-5d9a18b5b79d`. Only **Start transcription** was run, using the PC's existing Whisper selection and explicit input language **en**. It completed **1/1** audio chunk and **14** alignment units with the unchanged text: “A quiet morning brings a new story, and every voice deserves to be heard.” The model did **not** report a language; the UI preserves that distinction from the chosen language. Source playback reached **6.88 seconds / ended**, with no decoding error. Official Disconnect removed the workspace document; Connect created a new document and read the same completed result without another model call. The old projects and original completed workflow remain intact.

The earlier original-file Web export reached the real browser Save File dialog, but no completed disk write was observed; that canceled attempt remains an incomplete result. The Windows automation tool could not reliably target the owned dialog. During the later waiting period the provider became unavailable; the UI showed `INTEGRATION_PROVIDER_UNAVAILABLE`, cleared cached projects and disabled task entry instead of presenting stale results as ready. The original registration was subsequently resumed, and Android's formal provider journey below confirmed it available again.

After the source environment recovered on **2026-11-15**, a fresh official registration list and explicit resume restored the original **18 projects** under Native CDP 58494. Project `80bc00cc-2fc3-45d0-9918-7ae762e843a1` (**Windows dev CDP 验收**) retained `rainy-library.mp4` and its completed **4/4** subtitle workflow. The existing 4492 Web tab completed formal Halliday sign-in, reused its source approval and 12 Integration grants, and played the original subtitle video through **33.749 seconds / ended** without a media error. Screenshot `.nimi/local/ui-audit/2026-11-15-web/01-original-playback-ended.jpg` records the endpoint.

The original **output_sub.mp4** button then completed a real foreground-browser system Save to `.nimi/local/exports/videolingo-web-original-20261115.mp4`. The UI explicitly reported that the file was saved and export completed. Its **7,210,248 bytes** and SHA-256 **`93bbdb2c0725e5b4cc68165d9554d19b93869fc966474d86dc85b0068f57e570`** match the original PC output and the previously verified Android export. The old files were preserved; no AI or rendering was repeated. An earlier background click in this check was canceled and is not counted as success; normal foreground page/dialog activation completed the save. The automation targeting and input-escaping issues do not establish an App defect. Full subtitle/translation/dubbing work in this Web iteration, active-Job cancellation/recovery and 4 GiB transfers remain **NOT-VERIFIED**. Builds and unit tests do not establish those paths.

The **412 × 915** Web review found a clipped inline translation option; it now uses the existing wrapping row layout. Android Save results now remain visible under the identity lifetime after the system destination closes, even when that local action ends the previous Runtime scope. These final UI changes passed typecheck, mobile build/sync and Android assembly; device verification is still separate. The newest candidate is `.nimi/local/android-candidates/videolingo-0.1.9-integration-kit-rc4-20261114-180401-debug.apk` (**12,319,720 bytes**, SHA-256 `27ee21314bfad9e5d6d147f64a7ad44a14fd809c151854f4490c3c8ccf18b013`); earlier candidates remain preserved. The Web development watcher excludes this App's Android/generated build directories and `.nimi/local` after actual Android report/copied HTML changes were observed reloading the Web page.

### Actual Android acceptance, coordinated on the emulator

Official Android sign-in, source confirmation and all **12** Integration permissions passed. Home confirmed the existing v1 provider available. Android read the **17** projects then present and the original **Windows dev CDP 验收 / rainy-library.mp4 / 4 of 4** result. The original subtitle video played to **33.749333 seconds / ended**, with no media error. The real output button opened **ACTION_CREATE_DOCUMENT**; system Save wrote `Downloads/output_sub.mp4`, **7,210,248 bytes**, SHA-256 `93bbdb2c0725e5b4cc68165d9554d19b93869fc966474d86dc85b0068f57e570`. A single read of the original PC project's file independently matched both size and hash. The identity shell displayed Saved, and the fresh Runtime scope returned to the same original project and completed workflow. This Android journey is separate from the completed desktop Web Save check above.

A separate new project, **Android ASR acceptance 20261114** (`d78a2eb7-4d4a-42e5-b606-498a26fd9efa`), exercised the actual system WAV picker. Its file, project and **en** choice survived the background disconnect. Explicit Continue uploaded the file; a separate **Start transcription** action ran the existing Whisper route. It completed **1/1** chunk, **14** alignment units, and the same unchanged synthetic sentence recorded above; model language remained **Unreported / 1 chunk**. Actual system Save then wrote `transcript.txt`, **73 bytes**, with the correct original text. Both saved files and device screenshots are retained under `.nimi/local/ui-audit/2026-11-14-android/`.

Official Disconnect removed the iframe while PC Host **125020** and Runtime **76316** remained running. The first explicit reconnect reported `NIMI_MOBILE_NETWORK_UNAVAILABLE`; a second explicit Connect succeeded and kept the same project and terminal ASR result without resubmission. This cross-App connection symptom is under separate shared-layer diagnosis; no App-side retry loop or package bypass was added. Physical-device/cross-network use, 4 GiB input/output, rotation, active-Job cancellation/recovery and full Android subtitle/translation/dubbing workflows remain **NOT-VERIFIED**.

Android local identity: package `ai.nimi.apps.videolingo.dev`, client `ai.nimi.videolingo.android.dev`, origin `ai.nimi.apps.videolingo.dev:/`, callback `ai.nimi.apps.videolingo.dev:/oauth/callback`; debug certificate SHA-256 `756e56a08527a94e830921233bc80f31121fd0fe57dccef1535e27e9eb0a6585`. It uses JDK 21, min API 31, compile API 37 and target API 36. Official App Links/distribution are not configured; official Realm selection fails explicitly. `NIMI_DEV_REALM=local pnpm run sync:android` prepares assets, then `android/gradlew.bat assembleDebug --no-daemon` builds. `pnpm run dev:mobile` is the explicit device launch command; it was not used during preparation. Candidates are separately timestamped under `.nimi/local/android-candidates/`; earlier archives and installed data are preserved.

Earlier native/install/release notes below retain their own package versions and acceptance scope.

[App introduction and usage](NIMI_APP.md)

> **Nimi fork:** Use [Nimi development and delivery](docs/nimi-development.md) for this Windows Electron/Streamlit App. AI execution and model credentials belong to Nimi; the upstream standalone setup and provider-key instructions retained below are historical reference, not this fork's launch path.

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

- Word-level speech recognition and alignment with Qwen3-ASR + Qwen3-ForcedAligner

- **📝 NLP and AI-powered subtitle segmentation**

- **📚 Custom + AI-generated terminology for coherent translation**

- Direct translation with optional reflection and natural rewriting

- Subtitle segmentation with configurable length limits

- **🗣️ Dubbing with GPT-SoVITS, OpenAI, Edge TTS, and more**

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

**Input languages:**

🇺🇸 English 🤩 | 🇷🇺 Russian 😊 | 🇫🇷 French 🤩 | 🇩🇪 German 🤩 | 🇮🇹 Italian 🤩 | 🇪🇸 Spanish 🤩 | 🇯🇵 Japanese 😊 | 🇨🇳 Chinese 🤩

Dubbing languages depend on the selected TTS method.

## Installation

VideoLingo supports Windows, macOS (Apple Silicon / Intel), and Linux.

### Ask your local AI agent 🤖

If you use an AI agent that can operate your computer, send it this prompt:

> Install and launch GitHub's Huanshere/VideoLingo on my computer.

### Windows: one-click install 🎉

1. Download **Source code (zip)** from the [latest Release](https://github.com/Huanshere/VideoLingo/releases/latest), extract it to your Desktop or another folder, and open the folder.
2. Double-click `OneKeyStart.bat` and keep the window open. On the first run, it automatically installs uv, Python 3.12, the app dependencies, and FFmpeg. An internet connection is required.
3. After installation, VideoLingo opens automatically in your browser. Enter your API URL, key, and model in the sidebar to start using it.

### Install from source (Windows, macOS, Linux)

```bash
git clone https://github.com/Huanshere/VideoLingo.git && cd VideoLingo
uv run start.py
```

To start it later, run `uv run start.py` again from the VideoLingo folder. Apple Silicon uses MLX; Intel Macs use CPU recognition. By default, Intel Mac dubbing uses the new voice without the original background sound.

#### Docker (optional)

For a Linux NVIDIA container deployment, install Docker, a compatible GPU driver and the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). The image uses the same Python 3.12 setup and application dependencies, with CUDA 12.8.1/cu128 by default. See [Docker docs](/docs/pages/docs/docker.en-US.md) for the matched CUDA 12.6 alternative and persistence settings.

```bash
docker build -t videolingo .
docker run -d -p 8501:8501 --gpus all videolingo
```

## HTTP API (replaces Excel batch mode)

For agents and scripts, use the local HTTP API instead of the former Excel batch mode.
It shares the Streamlit pipeline and processes one operation at a time using `output/`.
Configure `config.yaml` and start it from the project root. The command also installs missing dependencies on first use:

```bash
uv run start.py --api
```

See the **[HTTP API guide](docs/api.md)** for input, processing, progress, downloads,
retries and serial batch processing. Interactive endpoint docs: [localhost:8000/docs](http://localhost:8000/docs).

## LLM, ASR and TTS providers
VideoLingo supports OpenAI-Like API format and various TTS interfaces:
- LLM: choose an OpenAI-compatible Chat Completions provider and model that can return the structured JSON required by the workflow. [OpenLux](https://www.openlux.ai/register?aff=wKYu) is recommended; set the API URL to `https://api.openlux.ai/v1`. Prefer GPT-6 Luna with model ID `gpt-6-luna` for best value, GPT-6 Sol with `gpt-6-sol` for better quality, or Claude Opus 5.5 with `claude-opus-5-5` for best quality. OpenLux relay rates are in the install docs. Configure the API URL, key and model in the sidebar.
- Speech recognition: run Qwen3-ASR + ForcedAligner locally (default), or choose ElevenLabs or MAI-Transcribe-2 in the sidebar. MAI supports an Azure Speech key or an OpenRouter key entered in the sidebar; audio is sent to the selected provider and may incur charges. WhisperX is not installed by the installer; to use it as a backend, follow [WhisperX (manual install)](docs/pages/docs/whisperx-manual.en-US.md).
- TTS: OpenAI, Fish Audio, SiliconFlow Fish/CosyVoice2, GPT-SoVITS, Edge TTS, F5-TTS and a custom adapter in `core/tts_backend/custom_tts.py`.

For detailed installation, LLM configuration, and usage instructions, please refer to the documentation: [English](/docs/pages/docs/start.en-US.md) | [中文](/docs/pages/docs/start.zh-CN.md)

## Current Limitations

1. Background noise and language-specific alignment models affect recognition and word timestamps. Vocal separation may help. Numbers and symbols may lack reliable word timings; inspect the resulting subtitles.

2. LLM output must satisfy the workflow's JSON structure. For failures, inspect `output/gpt_log/error.json`. Existing successful response caches and completed outputs can be reused on retry; changing the model alone does not regenerate every completed stage. Do not delete all output as the first troubleshooting step.

3. Dubbing quality and timing depend on translation, the TTS service and speech rate. Speed adjustment does not guarantee natural delivery or perfect synchronization.

4. Local recognition uses one primary recognition/alignment language per audio segment. Mixed-language speech is not guaranteed to retain accurate text and timing in every language.

5. The dubbing workflow does not automatically assign a separate voice to each speaker.

## 📄 License

This project is licensed under the Apache 2.0 License. Special thanks to the following open source projects for their contributions:

[Qwen3-ASR](https://github.com/Qwen/Qwen3-ASR), [MLX Audio](https://github.com/Blaizzy/mlx-audio), [whisperX](https://github.com/m-bain/whisperX), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [json_repair](https://github.com/mangiucugna/json_repair), [BELLE](https://github.com/LianjiaTech/BELLE)

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
App Tools 0.13.1, SDK 0.21.0, Kit/native 0.21.0 and Nimi Coding 0.6.5 with
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

**Local chrome teardown patch — 2026-10-26.** The explicit `pnpm-workspace.yaml` override selects the complete Kit 0.21.1 development archive at `.nimi/local/platform-icons/nimiplatform-kit-0.21.1-chrome.tgz`. It backports canonical fix `6b3ef1116` onto published Kit 0.21.0: window/WebContents destruction cleanup is idempotent and never reads a destroyed BrowserWindow getter. SDK 0.21, public chrome declarations and native carrier dependencies retain their existing versions. This archive is unpublished; clean development checkouts need the same complete archive, and production preflight still requires registry resolutions. App-specific business journeys and Windows interaction with this patch remain NOT-VERIFIED.
