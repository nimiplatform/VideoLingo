// Verify frozen imports and the real worker transport. This never asserts AI success.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNimiError } from '@nimiplatform/sdk/types';
import { runMediaWorker } from '../src-electron/media-worker.ts';

const root = path.resolve('dist-electron-package/videolingo-shell-win32-x64/resources/videolingo');
const workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-packaged-boundary-'));
try {
  await mkdir(path.join(workspace, 'output/log'), { recursive: true });
  await writeFile(path.join(workspace, 'output/log/split_by_nlp.txt'), 'A source line.');
  for (const operation of ['translate-preview', 'translate-subtitles']) {
    let requests = 0;
    const refuse = async () => {
      requests += 1;
      throw createNimiError({ message: 'Expected packaged Host refusal', reasonCode: 'APP_AUTHORIZATION_DENIED', retryable: false });
    };
    await assert.rejects(runMediaWorker(root, { operation, workspace, text: 'A source line.', sourceLanguage: 'en',
      targetLanguage: '简体中文', reflect: true, selectionKey: 'packaged-negative-check',
      businessSettings: { max_workers: 4, max_split_length: 20, summary_length: 8000, speed_factor: { min: 1, accept: 1.2, max: 1.4 },
        min_trim_duration: 3.5, subtitle: { max_length: 75, target_multiplier: 1.2 } } },
    AbortSignal.timeout(30000), true, { text: refuse, annotate: refuse }), /Expected packaged Host refusal/);
    assert.equal(requests, 1);
  }
  console.log('Packaged Python imports and framed Host refusal passed; model and installed App journeys remain separate.');
} finally { await rm(workspace, { recursive: true, force: true }); }
