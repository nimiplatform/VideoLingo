import type {CapacitorConfig} from '@capacitor/cli';
import type {NimiRemoteAppConfig} from '@nimiplatform/kit/core/app-session';
import {resolveDevelopmentRealm} from '@nimiplatform/app-tools/development';
const realm=resolveDevelopmentRealm();
if(realm.name!=='local')throw new Error('VideoLingo Android currently has only a local test source. Select --realm local; official App Links are not admitted.');
export const mobileAccess:Omit<NimiRemoteAppConfig,'fetch'>={appId:'ai.nimi.videolingo',clientId:'ai.nimi.videolingo.android.dev',realmEnvironmentId:realm.environmentId,realmBaseUrl:realm.apiOrigin,officialWebBaseUrl:realm.webOrigin,redirectUri:'ai.nimi.apps.videolingo.dev:/oauth/callback'};
const config:CapacitorConfig={appId:'ai.nimi.apps.videolingo.dev',appName:'VideoLingo',webDir:'dist-mobile',loggingBehavior:'none',server:{androidScheme:'https'},android:{useLegacyBridge:false,resolveServiceWorkerRequests:true,minWebViewVersion:120},plugins:{NimiAppAccess:{realmBaseUrl:mobileAccess.realmBaseUrl,clientId:mobileAccess.clientId,redirectUri:mobileAccess.redirectUri}}};
export default config;
