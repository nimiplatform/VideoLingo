import { copyFile, mkdir, rename } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, mergeConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { parse as parseYaml } from 'yaml';
import { nimiWebViteConfig } from '@nimiplatform/app-tools/web';

export default defineConfig(({ command, mode }) => {
  const root = import.meta.dirname;
  const env = { ...loadEnv(mode, root, ''), ...process.env };
  const release = mode === 'web-release';
  const manifest = parseYaml(readFileSync(path.join(root, 'nimi.app.yaml'), 'utf8')) as { version: string };
  const version = env.NIMI_WEB_VERSION ?? manifest.version;
  const webScope = release ? `/_releases/${version}/` : '/';
  return mergeConfig({
    base: release ? '/' : './',
    publicDir: release ? false : 'web-public',
    define: { __VIDEOLINGO_WEB_SCOPE__: JSON.stringify(webScope) },
    plugins: [
      tailwindcss(),
      ...(release ? [{
        name: 'videolingo-hosted-web-workspace',
        async writeBundle(options: { dir?: string }) {
          if (!options.dir) throw new Error('Hosted Web build requires an output directory.');
          const releaseDir = path.join(options.dir, '_releases', version);
          await mkdir(releaseDir, { recursive: true });
          await rename(path.join(options.dir, 'workspace.html'), path.join(releaseDir, 'workspace.html'));
          await copyFile(path.join(root, 'web-public/videolingo-media-worker.js'), path.join(releaseDir, 'videolingo-media-worker.js'));
        },
      }] : []),
    ],
    resolve: { dedupe: ['react', 'react-dom'] },
    cacheDir: '.nimi/local/vite-web',
    // Android build reports and copied HTML are not Web source documents.
    server: { watch: { ignored: ['**/.nimi/local/**', '**/android/**', '**/dist-*/**'] } },
    build: { emptyOutDir: true, outDir: 'dist-web', rollupOptions: { input: { index: 'index.html', workspace: 'workspace.html' } } },
  }, nimiWebViteConfig({ root, env, serve: command === 'serve', release }));
});
