# VideoLingo 0.1.5 — consolidated local candidate

Integrates the real VideoLingo workspace, subtitle proofreading, reference-voice dubbing and batch workflows with the Nimi SDK/Kit Host. Project-scoped confirmation protects media and dubbing cleanup; archived projects remain read-only. Uses the explicitly delivered dev-28353e9c9 package set and frozen dependency locks, including session-maintenance recovery, large-audio SDK validation and packaged-worker UTF-8 guidance.

The development long-film workflow completed five source-separation chunks, 48 speech clips, mixing and actual App playback. An explicit continuation recovered one model generation-limit failure while retaining successful clips. The 734.166667-second output decoded completely. Original recognition results still require human proofreading; this is functional acceptance, not a subtitle or voice-quality guarantee. The related 47 App test entries passed.

The 0.1.5 production build and frozen-backend checks are pending this concentrated packaging run. **0.1.5 installation, native export and public release admission are NOT-VERIFIED.** Earlier frozen packages remain unchanged; no release or Registry submission is performed. The following notes describe earlier candidate stages.

# VideoLingo 0.1.4 — consolidated local candidate

Brings the single-project workspace, project history, processing settings and batch page together. Link imports allow connection and website-cookie settings before downloading. Single and batch tasks share saved voice settings, including uploaded references. Media imports show progress and support cancellation.

Fixes independent subtitle proofreading: dubbing tasks now consume the dubbing subtitle pair, so changing display text cannot break or silently change spoken input. Reopening a saved batch reads its current state. Interrupted Host reads are distinguished from confirmed access denial, stop polling and expose redacted diagnostic fields without changing authorization rules.

Concentrated development regression completed import, settings, subtitles, a separate display revision, uploaded-reference dubbing, full playback, and batch stop/resume with reused results and Job references. The related App tests passed (44 test entries, including Python checks). Earlier Nimi foundation and unaffected business results are reused.

This candidate retains the explicitly delivered dev-193f2888a dependency set and frozen locks. Its production build and frozen-backend checks are separate from installation: **0.1.4 installation and installed business behavior are NOT-VERIFIED** until the Desktop owner runs them. The earlier 0.1.3 package remains unchanged. Two intermittent technical-session read failures remain unexplained; a later bounded observation without recurrence is not a platform fix. Long-film automatic subtitle quality failed, human audio-quality review is pending, and representative short-film results do not cover every language, website or voice combination. No public release, Registry submission or remote-setting change is performed.

## Earlier 0.1.3 changes

Fixes the installed Windows worker's locale-dependent decoding of Host JSON. Chinese AI configuration could become mojibake with lone surrogates, then fail during UTF-8 translation-cache persistence. Host messages now use strict UTF-8 binary pipes in both directions; no characters or model responses are repaired or discarded. Existing ASR/NLP checkpoints remain available for an explicit translation retry. The packaged Streamlit entry also applies the existing viewer toolbar setting so deployment controls do not appear in the product.

The frozen-worker check now inspects the actual Unicode configuration, outbound request and retained Host refusal without supplying an AI success. Installed recovery of the original failed task remains a separate acceptance step.

## Retained 0.1.2 scope

Restores the original single-project subtitle and dubbing workflows, processing controls, vocal enhancement before recognition, subtitle ZIP export, archive/restore, scoped cleanup, URL downloads and the original Excel task-sheet handoff. Source separation preserves source sample rate and channels; ASR uses its separate 16 kHz mono input. Nimi sessions, App Access, AI configuration, consumption and managed storage use the SDK/Kit carrier.

Development acceptance completed real one-click subtitles and video dubbing, pause/resume with retained audio, playback, native ZIP export, archive/restore and cleanup. Independent audio-only and video-without-burned-subtitles paths passed; the independent task-sheet batch reused completed results and isolated invalid media. Public HTTPS download and cancellation/retry passed. The YouTube example initially returned HTTP 403; after an isolated fixed-version comparison, pinning yt-dlp 2026.8.19 made the original App URL retry succeed. This does not certify all external links. Long-film automatic subtitle quality did not pass; original results and proofreading drafts are retained. Human audio-quality review is pending.

This package uses explicitly selected manager-delivered local platform archives. Local installation, installed business journeys and public release admission remain separate checks. The earlier partial 0.1.2 and frozen 0.1.1 packages remain preserved. No release or Registry submission is performed.
