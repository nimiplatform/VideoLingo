import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';
// Build Streamlit's actual component assets; the renderer server remains Streamlit.
await build({ configFile: false, plugins: [tailwindcss()], define: { 'process.env.NODE_ENV': '"production"' },
  build: { outDir: 'dist-component', target: 'chrome140', minify: false,
    lib: { entry: 'src-component/component.tsx', formats: ['es'], fileName: 'component', cssFileName: 'component' },
    rollupOptions: { output: { inlineDynamicImports: true }, onwarn(warning, warn) {
      if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
      warn(warning);
    } } } });
