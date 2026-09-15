import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNimiError } from '@nimiplatform/sdk/types';
import { parse } from 'yaml';
import { runMediaWorker } from '../src-electron/media-worker.ts';
import { DEFAULT_BUSINESS_SETTINGS, pythonBusinessSettings } from '../src-electron/business-settings.ts';

// No AI result is supplied: inspect the real request and retained refusal.
export async function checkWorkerEncoding(appRoot: string, packaged: boolean) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-utf8-'));
  const source = 'An English source line for the subtitle workflow.';
  const targetLanguage = '简体中文';
  const selectionKey = '语言分析 · English / 日本語 🎬';
  const message = 'Explicit Host refusal; no inference';
  let textRequests = 0, checkpoints = 0;
  try {
    await mkdir(path.join(workspace, 'output/log'), { recursive: true });
    await writeFile(path.join(workspace, 'output/log/split_by_meaning.txt'), source, 'utf8');
    await copyFile(path.resolve('custom_terms.xlsx'), path.join(workspace, 'custom_terms.xlsx'));
    await assert.rejects(runMediaWorker(appRoot, { operation: 'translate-subtitles', workspace,
      sourceLanguage: 'en', targetLanguage, selectionKey, reflect: true,
      completedSteps: ['meaning'], businessSettings: pythonBusinessSettings(DEFAULT_BUSINESS_SETTINGS) },
    AbortSignal.timeout(30000), packaged, {
      text: async input => {
        textRequests++;
        assert.equal(input.step, 'summary');
        assert.ok(String(input.prompt).includes(source));
        assert.ok(String(input.prompt).includes(targetLanguage));
        throw createNimiError({ message, reasonCode: 'APP_AUTHORIZATION_DENIED', retryable: false });
      },
      checkpoint: async input => {
        assert.deepEqual(input, { stage: 'model-cache', step: 'error' });
        // The acknowledgment only follows a real, readable diagnostic file.
        const cache = JSON.parse(await readFile(path.join(workspace, 'output/gpt_log/error.json'), 'utf8'));
        assert.equal(cache.length, 1);
        assert.equal(cache[0].model, selectionKey);
        assert.equal(cache[0].message, `summary: ${message}`);
        assert.ok(cache[0].prompt.includes(source));
        assert.equal(cache[0].resp, null);
        checkpoints++;
        return { saved: true };
      },
    }), error => {
      assert.ok(String(error).includes(message), String(error));
      assert.ok(!String(error).includes('Could not retain request diagnostics'));
      return true;
    });
    const config = parse(await readFile(path.join(workspace, 'config.yaml'), 'utf8'));
    assert.equal(config.target_language, targetLanguage);
    assert.equal(config.nimi_text_cache_key, selectionKey);
    assert.equal(textRequests, 1);
    assert.equal(checkpoints, 1);
  } finally { await rm(workspace, { recursive: true, force: true }); }
}
