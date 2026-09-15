import { spawn } from 'node:child_process';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { createNimiError, extractNimiErrorFields } from '@nimiplatform/sdk/types';

export type WorkerModelHandlers = {
  text?: (input: Record<string, unknown>) => Promise<unknown>;
  speech?: (input: Record<string, unknown>) => Promise<unknown>;
  annotate?: (input: Record<string, unknown>) => Promise<unknown>;
  checkpoint?: (input: Record<string, unknown>) => Promise<unknown>;
};

export function workerEnvironment(appRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['SystemRoot', 'WINDIR', 'SystemDrive', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.PYTHONUTF8 = '1';
  env.PYTHONNOUSERSITE = '1';
  env.PYTHONPATH = appRoot;
  env.PATH = [path.join(appRoot, 'media-bin'), path.join(appRoot, '.nimi/local/media-bin'),
    path.join(appRoot, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin'),
    ...(process.platform === 'win32' ? [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')] : ['/usr/bin', '/bin'])].join(path.delimiter);
  return env;
}

export async function runMediaWorker<T>(appRoot: string, input: Record<string, unknown>, signal: AbortSignal, packaged: boolean, models: WorkerModelHandlers = {}): Promise<T> {
  signal.throwIfAborted();
  const executable = packaged
    ? path.join(appRoot, 'backend', process.platform === 'win32' ? 'videolingo-backend.exe' : 'videolingo-backend')
    : path.join(appRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const args = packaged ? ['worker'] : ['-X', 'utf8', '-m', 'core.nimi_worker'];
  return new Promise<T>((resolve, reject) => {
    const child = spawn(executable, args, { cwd: appRoot, env: workerEnvironment(appRoot), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const decoder = new StringDecoder('utf8');
    let result: T | undefined;
    let failure: Error | undefined;
    const abort = () => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        const stop = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        stop.on('error', () => child.kill());
      } else child.kill('SIGTERM');
    };
    signal.addEventListener('abort', abort, { once: true });
    const receive = (line: string) => {
      if (!line.trim()) return;
      let frame: Record<string, unknown>;
      try { frame = JSON.parse(line); } catch { failure = new Error('Worker returned an invalid message'); abort(); return; }
      if (frame.type === 'result') { result = frame.value as T; child.stdin.end(); return; }
      if (frame.type === 'error') {
        failure = typeof frame.reasonCode === 'string' && frame.reasonCode
          ? createNimiError({ message: String(frame.message), reasonCode: frame.reasonCode, retryable: frame.retryable === true,
            ...(typeof frame.traceId === 'string' && frame.traceId ? { traceId: frame.traceId } : {}),
            ...(typeof frame.actionHint === 'string' && frame.actionHint ? { actionHint: frame.actionHint } : {}) })
          : new Error(String(frame.message));
        child.stdin.end(); return;
      }
      if (frame.type !== 'model-request' || typeof frame.id !== 'string' || !['text', 'speech', 'annotate', 'checkpoint'].includes(String(frame.kind))
        || !frame.input || typeof frame.input !== 'object' || Array.isArray(frame.input)) {
        failure = new Error('Worker requested an unknown business operation'); abort(); return;
      }
      const handler = models[frame.kind as keyof WorkerModelHandlers];
      void (async () => {
        try {
          signal.throwIfAborted();
          if (!handler) throw new Error('This worker operation is not admitted to call a model');
          const value = await handler(frame.input as Record<string, unknown>);
          signal.throwIfAborted();
          child.stdin.write(JSON.stringify({ id: frame.id, value }) + '\n');
        } catch (error) {
          if (!child.stdin.destroyed && !signal.aborted) child.stdin.write(JSON.stringify({ id: frame.id,
            error: { ...extractNimiErrorFields(error), message: error instanceof Error ? error.message : String(error) } }) + '\n');
        }
      })();
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += decoder.write(chunk);
      let end: number;
      while ((end = stdout.indexOf('\n')) >= 0) { const line = stdout.slice(0, end); stdout = stdout.slice(end + 1); receive(line); }
    });
    child.stdin.on('error', () => { /* close/error below reports the actual worker outcome. */ });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-12000); });
    child.once('error', (error) => { signal.removeEventListener('abort', abort); reject(error); });
    child.once('close', (code) => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) { reject(new Error('Task canceled')); return; }
      stdout += decoder.end();
      if (stdout.trim()) receive(stdout);
      if (failure || code !== 0) reject(failure || new Error(stderr || `Media helper exited ${code}`));
      else if (result === undefined) reject(new Error(`Media helper returned no valid result: ${stderr}`));
      else resolve(result);
    });
    child.stdin.write(JSON.stringify(input) + '\n');
  });
}
