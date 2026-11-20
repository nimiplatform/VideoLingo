import React from 'react';
import {createRoot} from 'react-dom/client';
import {NimiThemeProvider,TooltipProvider} from '@nimiplatform/kit/ui';
import {Workspace} from '../src-component/component.js';
import {VideoLingoPlatformProvider} from '../src-component/platform.js';
import {createRemoteWorkspacePlatform} from './workspace-platform.js';
import './remote.css';
let bound=false;
window.addEventListener('message',event=>{
  if(bound||event.source!==parent||event.origin!==location.origin||event.data?.type!=='videolingo-connect'||!event.ports[0])return;
  bound=true;const platform=createRemoteWorkspacePlatform(event.ports[0],event.data.kind==='android'?'android':'web',event.data.drafts||{});
  createRoot(document.getElementById('root')!).render(<NimiThemeProvider accentPack="nimi-accent"><TooltipProvider><VideoLingoPlatformProvider platform={platform}><Workspace locale={event.data.locale==='zh'?'zh':'en'}/></VideoLingoPlatformProvider></TooltipProvider></NimiThemeProvider>);
});
parent.postMessage('videolingo-ready',location.origin);
