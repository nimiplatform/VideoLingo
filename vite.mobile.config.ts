import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';
import {mobileAccess} from './capacitor.config.ts';
export default defineConfig({base:'./',publicDir:'web-public',plugins:[tailwindcss(),{name:'videolingo-mobile',transformIndexHtml:{order:'pre',handler:(html:string)=>html.replace('/src-web/main.web.tsx','/src-web/main.mobile.tsx')}}],resolve:{dedupe:['react','react-dom']},cacheDir:'.nimi/local/vite-mobile',define:{__NIMI_APP_MOBILE_CONFIG__:JSON.stringify(mobileAccess)},build:{outDir:'dist-mobile',rollupOptions:{input:{index:'index.html',workspace:'workspace.html'}}}});
