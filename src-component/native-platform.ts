import { createNimiClient } from '@nimiplatform/sdk';
import { createNimiLocalAppStandardShellSurface, installNimiShellRuntimeBridge, invoke, openNimiLocalAppAssetMediaUrl } from '@nimiplatform/kit/shell/renderer/bridge';
import { readStartupAccess } from './startup-access.js';
import type { VideoLingoPlatform } from './platform.js';

export function createNativeVideoLingoPlatform(): VideoLingoPlatform {
  installNimiShellRuntimeBridge();
  const client = createNimiClient({ localApp: { standardShell: createNimiLocalAppStandardShellSurface() } });
  return {
    kind: 'desktop',
    checkAccess: async signal => { const status = await readStartupAccess(() => client.auth.status(), signal); if (!status.sessionBound) throw new Error(`${status.reasonCode}: ${status.actionHint}`); },
    command: (name, payload = {}) => invoke(`videolingo.${name}`, payload) as never,
    aiConfig: client.aiConfig,
    storage: { assets: {
      write: ({ relativePath, body, mediaType }) => client.storage.assets.write({ relativePath, body, mediaType }),
      remove: relativePath => client.storage.assets.remove(relativePath),
      reveal: relativePath => client.storage.assets.reveal(relativePath),
    } },
    listVoices: async kind => {
      if (kind === 'preset') { const result = await client.aiConfig.listOptions({ kind: 'preset-voices' }); return result.kind === 'preset-voices' ? result.options.map(voice => ({ id: voice.voiceId, label: voice.name })) : []; }
      return (await client.ai.voiceAssets.list({ pageSize: 100 })).assets.filter(asset => asset.status === 'active').map(asset => ({ id: asset.voiceAssetId, label: asset.voiceAssetId }));
    },
    openMedia: relativePath => openNimiLocalAppAssetMediaUrl(relativePath),
  };
}
