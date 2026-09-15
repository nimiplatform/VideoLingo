import type { NimiAppAuthProjection } from '@nimiplatform/sdk/app';
import { extractNimiErrorFields } from '@nimiplatform/sdk/types';

const ACCESS_DENIALS = new Set([
  'access-denied', 'runtime-permission-denied', 'runtime-unauthenticated', 'forbidden-renderer-access',
  'owner-authority-missing', 'protected-carrier-required', 'session-invalid', 'permission-denied', 'unauthenticated',
  'app-authorization-denied', 'action-permission-denied', 'principal-unauthorized', 'runtime-grpc-permission-denied',
  'auth-denied', 'sdk-host-capability-denied',
]);
const normalized = (value: string | undefined) => (value || '').toLowerCase().replaceAll('_', '-');

function denied(code?: string, reason?: string): boolean {
  return ACCESS_DENIALS.has(normalized(code)) || ACCESS_DENIALS.has(normalized(reason));
}

async function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function readStartupAccess(
  read: () => Promise<NimiAppAuthProjection>,
  signal: AbortSignal,
  wait: (milliseconds: number, signal: AbortSignal) => Promise<void> = pause,
): Promise<NimiAppAuthProjection> {
  const delays = [500, 1500];
  for (let attempt = 0; ; attempt += 1) {
    signal.throwIfAborted();
    try {
      const status = await read();
      signal.throwIfAborted();
      if (status.sessionBound || status.retryable !== true || denied(undefined, status.reasonCode)
        || !['unavailable', 'runtime-restarted'].includes(status.state) || attempt === delays.length) return status;
    } catch (error) {
      signal.throwIfAborted();
      const fields = extractNimiErrorFields(error);
      if (fields.retryable !== true || denied(fields.code, fields.reasonCode) || attempt === delays.length) throw error;
    }
    await wait(delays[attempt]!, signal);
  }
}
