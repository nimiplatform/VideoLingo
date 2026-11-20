// @nimi-authority: rule.nimi.platform.app-ecosystem.scaffold-web-carrier
import {createWebNimiAppSession,type NimiRemoteAppConfig} from '@nimiplatform/kit/auth/app/web';
import {mountRemoteVideoLingo} from './remote-shell.js';
declare const __NIMI_APP_WEB_CONFIG__:NimiRemoteAppConfig;
const dispose=mountRemoteVideoLingo(createWebNimiAppSession(__NIMI_APP_WEB_CONFIG__),'web');
if(import.meta.hot)import.meta.hot.dispose(dispose);
