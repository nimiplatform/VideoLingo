import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { sourceAssetPath, projectId } from '../src-electron/project-types.ts';

const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('media upload names cannot overwrite another project or an earlier upload', () => {
  assert.notEqual(sourceAssetPath(first, 'clip.mp4', first), sourceAssetPath(second, 'clip.mp4', first));
  assert.notEqual(sourceAssetPath(first, 'clip.mp4', first), sourceAssetPath(first, 'clip.mp4', second));
  assert.throws(() => projectId('../other-project'));
  assert.throws(() => sourceAssetPath(first, 'script.exe', second));
  assert.throws(() => sourceAssetPath(first, 'clip.mp4', '../other'));
});

test('the Python consumer preserves real timestamps and rejects missing alignment', () => {
  const python = path.join(process.cwd(), '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  execFileSync(python, ['-X', 'utf8', '-m', 'unittest', 'tests.test_nimi_result', 'tests.test_separation_media', 'tests.test_nimi_model_boundaries', 'tests.test_streamed_media', 'tests.test_import_tasks', 'tests.test_product_media_settings'], {
    stdio: 'pipe', windowsHide: true, env: { ...process.env, PATH: path.join(process.cwd(), '.nimi/local/media-bin') + path.delimiter + process.env.PATH },
  });
});
