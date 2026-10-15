import type { NimiLocalAppScenarioJob } from '@nimiplatform/sdk/app';

export function isMissingJob(error: unknown): boolean {
  const value = error as { reasonCode?: string; code?: string };
  const reason = (value?.reasonCode || value?.code || '').toUpperCase().replaceAll('-', '_');
  return reason === 'NOT_FOUND' || reason === 'AI_MEDIA_JOB_NOT_FOUND';
}

export async function retainedJob(
  get: (id: string) => Promise<{ job: NimiLocalAppScenarioJob }>, id: string | undefined, expired: (id: string) => Promise<void>,
): Promise<NimiLocalAppScenarioJob | undefined> {
  if (!id) return undefined;
  try { return (await get(id)).job; }
  catch (error) {
    if (!isMissingJob(error)) throw error;
    await expired(id);
    return undefined;
  }
}
