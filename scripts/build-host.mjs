import { build } from 'esbuild';
const production = process.argv.includes('--production');
await build({ entryPoints: ['src-electron/main.ts'], outfile: 'dist-electron/main.js', bundle: true,
  platform: 'node', target: 'node24', format: 'esm', packages: 'external', define: { __NIMI_ELECTRON_PRODUCTION__: String(production) } });
await build({ entryPoints: ['src-electron/preload.cts'], outfile: 'dist-electron/preload.cjs', bundle: true,
  platform: 'node', target: 'node24', format: 'cjs', external: ['electron'] });
