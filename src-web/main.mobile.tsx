import {createMobileNimiAppSession} from '@nimiplatform/kit/auth/app/mobile';
import type {NimiRemoteAppConfig} from '@nimiplatform/kit/core/app-session';
import {mountRemoteVideoLingo} from './remote-shell.js';
declare const __NIMI_APP_MOBILE_CONFIG__:Omit<NimiRemoteAppConfig,'fetch'>;
const dispose=mountRemoteVideoLingo(createMobileNimiAppSession(__NIMI_APP_MOBILE_CONFIG__),'android');
if(import.meta.hot)import.meta.hot.dispose(dispose);
