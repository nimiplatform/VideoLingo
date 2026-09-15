import { extractNimiErrorFields } from '@nimiplatform/sdk/types';

/** Keep the failed Host operation observable without logging input or credentials. */
export function hostReadFailure(method: 'videolingo.project.get' | 'videolingo.projects.list', error: unknown) {
  const value = error as { reasonMetadata?: unknown; details?: { reasonMetadata?: unknown }; envelope?: { reasonMetadata?: unknown } };
  const metadata = value?.reasonMetadata ?? value?.details?.reasonMetadata ?? value?.envelope?.reasonMetadata;
  const redact = (data: unknown, depth = 0): unknown => {
    if (depth > 3) return '[truncated]';
    if (typeof data === 'string') return data.slice(0, 512);
    if (Array.isArray(data)) return data.slice(0, 16).map(item => redact(item, depth + 1));
    if (data && typeof data === 'object') return Object.fromEntries(Object.entries(data).slice(0, 32).map(([key, item]) => [key,
      /token|secret|credential|password|cookie|proof|lease|bootstrap|account|session|owner|grant|prompt|body/iu.test(key) ? '[redacted]' : redact(item, depth + 1)]));
    return data;
  };
  return { method, ...extractNimiErrorFields(error), ...(metadata === undefined ? {} : { reasonMetadata: redact(metadata) }) };
}

