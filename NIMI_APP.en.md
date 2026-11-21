# VideoLingo

VideoLingo helps you transcribe, translate and subtitle videos, review bilingual subtitles, produce dubbing and run media tasks in batches. Generated content still needs your review, especially names and terminology, subtitle timing and dubbing quality.

## Process a video

1. Open VideoLingo on your PC from Nimi Home and keep Nimi running. The current release is for Windows x64 PCs.
2. Import a media file and, in the App's AI settings, choose the Nimi capabilities this task needs: transcription, language analysis, translation, vocal separation and speech synthesis.
3. Run the stages you need and check the recognition and translation results. Bilingual subtitles now wrap by their actual rendered width (default single-line target width 80%, translation multiplier 1.0; existing projects keep their saved settings, so earlier translations are not invalidated). After you proofread and save subtitles, you can regenerate the subtitle-burned video or continue to dubbing.
4. Preview the final media, check subtitle timing, line width, voice and picture, then save or export.

Batch and single tasks are complete only when the interface shows them as complete. If a stage fails or is interrupted, first review the failed stage and the results already kept, then explicitly decide whether to retry.

## Requirements and data

Models differ in their support for languages, voices and timing alignment. A model being selectable does not mean every parameter or language pair works (for example, the language-analysis model must match the source language, and a reference voice must be created for the matching speech-synthesis model). Voice references and input media should come from material you have the right to use.

AI requests follow the local or cloud resources you select in Nimi. When you choose a cloud service, the text, audio or other input needed for that task is sent to the selected provider and may incur that provider's charges. Projects, batches and media results stay on your PC.

For help, report the input format, the failed stage and the error message to the App provider; remove private information before sharing logs or material.

## Web and mobile companion status

The hosted Web entry (`https://videolingo.nimi.xyz`) and Android companion are **not yet publicly released**. VideoLingo **0.2.0** prepares the `videolingo.workspace.v1` workspace integration on Windows PC; once the hosted Web entry is separately published and admitted, or when connecting through a local development test entry, the following prerequisites apply:

- **PC version**: the PC must have **VideoLingo 0.2.0 or later** installed and running, with Nimi running. PC versions 0.1.9 and earlier do not provide the remote workspace and cannot serve Web connections.
- **Same account and permission**: sign in to the Web with the same Nimi account and connect your primary Runtime. A first-time source must be confirmed in Nimi Home on the PC, and access to the VideoLingo PC workspace (`videolingo.workspace.v1`) must be allowed under Integrations. Read permission shows the original projects and results; edit permission can modify those projects, create batches and use the AI resources already chosen on the PC.
- **Data and execution ownership**: video processing, AI inference, projects, batches and original outputs always stay on the PC. The Web reads and edits the original projects in the same PC workspace, and a single source file is still limited to 4 GiB; do not delete the PC data directory to fix a connection. After a disconnect or page refresh, reconnecting first reads back the existing projects and stage results before you decide whether to continue; long tasks are not re-run automatically. AI models and resources are still configured in the PC App.

## Export and known limitations

- On the Web, subtitles (`.srt` / ZIP), transcripts and spreadsheets are saved to the current device through standard browser downloads. Large audio/video outputs are preferably written straight to disk through the browser's streaming Save File dialog; if your browser cannot stream large files, use a desktop browser that supports it or export directly in the PC App.
- Unsaved subtitle and batch input is only a draft in the current interface; only content saved to the PC is the official project record.
- The Android companion is still limited to a local test entry and has not been publicly released. If the connection drops while you pick a file with the system picker, reconnect to the original PC and then explicitly tap "Continue upload".
- Hard subtitles already embedded in the source video are not erased automatically, so newly burned subtitles are shown on top of them. Cross-network transfer of very large (4 GiB-class) files and complete dubbing on physical mobile devices depend on your actual environment.
