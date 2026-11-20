import React, { createContext, useContext, type ReactNode } from 'react';
import type { NimiLocalAppClient } from '@nimiplatform/sdk/app';

export type AssetWrite = { relativePath: string; body: Blob | AsyncIterable<Uint8Array>; mediaType: string; size?: number; signal?: AbortSignal };
export type VideoLingoAssets = {
  write(input: AssetWrite): Promise<unknown>;
  remove(relativePath: string): Promise<unknown>;
  reveal(relativePath: string): Promise<unknown>;
};
export type VideoLingoPlatform = {
  kind: 'desktop' | 'web' | 'android';
  checkAccess(signal: AbortSignal): Promise<void>;
  command<T>(name: string, payload?: Record<string, unknown>): Promise<T>;
  aiConfig: Pick<NimiLocalAppClient['aiConfig'], 'get' | 'listOptions' | 'overwrite'>;
  storage: { assets: VideoLingoAssets };
  listVoices(kind: 'preset' | 'asset'): Promise<{ id: string; label: string }[]>;
  openMedia(relativePath: string): Promise<{ url: string; revoke(): Promise<void> }>;
  files?: import('./workspace-files.js').WorkspaceFiles;
  drafts?: import('./workspace-files.js').WorkspaceDrafts;
};
const Context = createContext<VideoLingoPlatform | null>(null);
export function VideoLingoPlatformProvider({ platform, children }: { platform: VideoLingoPlatform; children: ReactNode }) { return <Context.Provider value={platform}>{children}</Context.Provider>; }
export function useVideoLingoPlatform() { const value = useContext(Context); if (!value) throw new Error('VideoLingo requires its current workspace connection'); return value; }
