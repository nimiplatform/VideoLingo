import { translator } from './localization.js';
import React, { useState } from 'react';
import { Button } from '@nimiplatform/kit/ui';
import { errorText, type DownloadInput, type VideoLingoProject } from '../src-electron/project-types.js';

export function DownloadPanel({ project, disabled, locale, uploadCookies, run, stop }: {
  project: VideoLingoProject; disabled: boolean; locale: string;
  uploadCookies: (file: File) => Promise<string>; run: (input: DownloadInput) => Promise<void>; stop: () => Promise<void>;
}) {
  const t = translator(locale);
  const initial = project.downloadInput;
  const [url, setUrl] = useState(initial?.url || ''), [resolution, setResolution] = useState<DownloadInput['resolution']>(initial?.resolution || '1080');
  const [proxyMode, setProxyMode] = useState(initial?.proxy === undefined ? 'system' : initial.proxy ? 'custom' : 'direct');
  const [proxy, setProxy] = useState(initial?.proxy || ''), [cookies, setCookies] = useState(initial?.cookiesAssetPath || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const working = project.state === 'downloading';
  if (project.source) return null;
  return <section className="vl-section"><h3>{t('Download from a link', '从链接下载')}</h3>
    <p>{t('Download the original media with yt-dlp, then start transcription separately. A stopped download can be retried with the saved settings.', '使用 yt-dlp 下载原媒体，完成后再单独开始转写。下载停止后可按保存的设置重试。')}</p>
    <div className="vl-row"><input aria-label="media-url" value={url} disabled={disabled || busy} onChange={event => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" style={{ flex: 1 }} />
      <select aria-label="download-resolution" value={resolution} disabled={disabled || busy} onChange={event => setResolution(event.target.value as typeof resolution)}>
        {['360', '480', '720', '1080', 'best'].map(value => <option key={value} value={value}>{value === 'best' ? t('Best available', '最佳画质') : `${value}p`}</option>)}</select></div>
    <details><summary>{t('Download connection and website account', '下载网络与网站账户')}</summary>
      <p>{t('These are website download settings. Upload a Netscape-format cookies.txt only when the website requires your business account.', '这些设置用于媒体网站下载。网站需要业务账户时，可上传 Netscape 格式的 cookies.txt。')}</p>
      <div className="vl-row"><select aria-label="download-proxy-mode" value={proxyMode} disabled={disabled || busy} onChange={event => setProxyMode(event.target.value)}>
        <option value="system">{t('System proxy discovery', '使用系统代理设置')}</option><option value="direct">{t('Direct connection', '直接连接')}</option><option value="custom">{t('Specified proxy', '指定代理')}</option></select>
        {proxyMode === 'custom' && <input aria-label="download-proxy" value={proxy} disabled={disabled || busy} onChange={event => setProxy(event.target.value)} placeholder="http://127.0.0.1:7890" />}</div>
      <input type="file" accept=".txt" aria-label="download-cookies" disabled={disabled || busy} onChange={event => {
        const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError('');
        void uploadCookies(file).then(setCookies).catch(error => setError(errorText(error))).finally(() => setBusy(false));
      }} />{cookies && <div className="vl-row"><span>{t('Cookie file selected', '已选择 Cookie 文件')}</span><Button tone="secondary" disabled={disabled || busy} onClick={() => setCookies('')}>{t('Do not use cookies', '不使用 Cookie')}</Button></div>}
    </details>
    <div className="vl-row"><Button disabled={disabled || busy || !url.trim() || proxyMode === 'custom' && !proxy.trim()} onClick={() => {
      setBusy(true); setError(''); void run({ url: url.trim(), resolution, ...(proxyMode === 'system' ? {} : { proxy: proxyMode === 'direct' ? '' : proxy.trim() }), ...(cookies ? { cookiesAssetPath: cookies } : {}) })
        .catch(error => setError(errorText(error))).finally(() => setBusy(false));
    }}>{working ? t('Downloading…', '正在下载…') : t('Download / retry', '下载或重试')}</Button>
      <Button tone="secondary" disabled={!working} onClick={() => void stop()}>{t('Stop download', '停止下载')}</Button></div>
    {error && <p className="vl-error" role="alert">{error}</p>}
    {project.error && <p className="vl-error" role="alert">{project.error}</p>}
  </section>;
}
