# VideoLingo 0.1.3 — local integration patch

Fixes the installed Windows worker's locale-dependent decoding of Host JSON. Chinese AI configuration could become mojibake with lone surrogates, then fail during UTF-8 translation-cache persistence. Host messages now use strict UTF-8 binary pipes in both directions; no characters or model responses are repaired or discarded. Existing ASR/NLP checkpoints remain available for an explicit translation retry. The packaged Streamlit entry also applies the existing viewer toolbar setting so deployment controls do not appear in the product.

The frozen-worker check now inspects the actual Unicode configuration, outbound request and retained Host refusal without supplying an AI success. Installed recovery of the original failed task remains a separate acceptance step.

## Retained 0.1.2 scope

Restores the original single-project subtitle and dubbing workflows, processing controls, vocal enhancement before recognition, subtitle ZIP export, archive/restore, scoped cleanup, URL downloads and the original Excel task-sheet handoff. Source separation preserves source sample rate and channels; ASR uses its separate 16 kHz mono input. Nimi sessions, App Access, AI configuration, consumption and managed storage use the SDK/Kit carrier.

Development acceptance completed real one-click subtitles and video dubbing, pause/resume with retained audio, playback, native ZIP export, archive/restore and cleanup. Independent audio-only and video-without-burned-subtitles paths passed; the independent task-sheet batch reused completed results and isolated invalid media. Public HTTPS download and cancellation/retry passed. The YouTube example initially returned HTTP 403; after an isolated fixed-version comparison, pinning yt-dlp 2026.8.19 made the original App URL retry succeed. This does not certify all external links. Long-film automatic subtitle quality did not pass; original results and proofreading drafts are retained. Human audio-quality review is pending.

This package uses explicitly selected manager-delivered local platform archives. Local installation, installed business journeys and public release admission remain separate checks. The earlier partial 0.1.2 and frozen 0.1.1 packages remain preserved. No release or Registry submission is performed.
