import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  Globe2,
  Home,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { Pane, Workspace } from '../../types';
import { useStore } from '../../store';
import { IconButton } from '../ui';

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (/^rm:\/\//i.test(value) || /^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.\w{2,}(\/|$)/.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

export function BrowserPane({ pane, workspace }: { pane: Pane; workspace: Workspace }) {
  const { state, setState, info, toast } = useStore();
  const initial = pane.url || info?.browserHome || 'rm://home/';
  const [address, setAddress] = useState(initial);
  const [current, setCurrent] = useState(initial);
  const [title, setTitle] = useState('Local browser sandbox');
  const [reader, setReader] = useState<{ title: string; url: string; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    const onNavigate = (event: any) => {
      const url = event?.url || webview.getURL?.() || '';
      setCurrent(url);
      setAddress(url);
      setLoading(false);
      setLoadError('');
      if (url && !url.startsWith('about:')) {
        setState((prev) => ({
          ...prev,
          browserHistory: [
            { id: crypto.randomUUID(), url, title: webview.getTitle?.() || url, createdAt: Date.now() },
            ...prev.browserHistory.filter((entry) => entry.url !== url),
          ].slice(0, 100),
        }));
      }
    };
    const onStart = () => setLoading(true);
    const onStop = () => setLoading(false);
    const onTitle = (event: any) => setTitle(event?.title || '');
    const onFail = (event: any) => {
      if (event?.errorCode === -3) return;
      setLoading(false);
      setLoadError(`${event?.errorDescription || 'Could not load the page'} (${event?.errorCode ?? 'unknown'})`);
    };
    webview.addEventListener('did-navigate', onNavigate);
    webview.addEventListener('did-navigate-in-page', onNavigate);
    webview.addEventListener('did-start-loading', onStart);
    webview.addEventListener('did-stop-loading', onStop);
    webview.addEventListener('page-title-updated', onTitle);
    webview.addEventListener('did-fail-load', onFail);
    return () => {
      webview.removeEventListener('did-navigate', onNavigate);
      webview.removeEventListener('did-navigate-in-page', onNavigate);
      webview.removeEventListener('did-start-loading', onStart);
      webview.removeEventListener('did-stop-loading', onStop);
      webview.removeEventListener('page-title-updated', onTitle);
      webview.removeEventListener('did-fail-load', onFail);
    };
  }, [setState]);

  const go = (raw?: string) => {
    const url = normalizeUrl(raw || address);
    if (!url) return;
    setAddress(url);
    setReader(null);
    setLoading(true);
    try {
      webviewRef.current?.loadURL(url);
    } catch (error) {
      toast('Could not load page', String((error as Error)?.message || error), 'error');
      setLoading(false);
    }
  };

  const readPage = async () => {
    try {
      const scriptInfo = await window.rm.browserReaderScript();
      const webview = webviewRef.current;
      const result = await webview.executeJavaScript(scriptInfo.script);
      setReader(result);
      toast('Page captured', `${String(result.text || '').length} characters saved to the pane`, 'success');
    } catch (error) {
      toast('Could not read page', String((error as Error)?.message || error), 'error');
    }
  };

  return (
    <div className="browser-shell" data-testid="browser-pane">
      <div className="browser-bar">
        <IconButton label="Back" onClick={() => webviewRef.current?.canGoBack?.() && webviewRef.current.goBack()}>
          <ArrowLeft size={13} />
        </IconButton>
        <IconButton label="Forward" onClick={() => webviewRef.current?.canGoForward?.() && webviewRef.current.goForward()}>
          <ArrowRight size={13} />
        </IconButton>
        <IconButton label="Reload" onClick={() => { setLoading(true); webviewRef.current?.reload?.(); }}>
          {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
        </IconButton>
        <IconButton label="Home" onClick={() => go(info?.browserHome || 'rm://home/')}>
          <Home size={13} />
        </IconButton>
        <div className="browser-address">
          {current.startsWith('rm://') ? <Globe2 size={12} /> : <Globe2 size={12} />}
          <input
            value={address}
            aria-label="Address"
            data-testid="browser-url"
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go();
            }}
          />
        </div>
        <button type="button" className="button button-subtle button-sm" onClick={() => go()} data-testid="browser-go">
          Go
        </button>
        <IconButton label="Read page" onClick={() => void readPage()} data-testid="browser-read">
          <BookOpen size={13} />
        </IconButton>
        <IconButton
          label="Open in system browser"
          onClick={() => {
            if (current.startsWith('http')) window.rm.shell.openExternal(current);
            else toast('Local page', 'The built-in sandbox page only opens inside ReverseMind.', 'info');
          }}
        >
          <ExternalLink size={13} />
        </IconButton>
      </div>
      <div className="browser-page">
        {React.createElement('webview', {
          ref: webviewRef,
          src: initial,
          className: 'browser-webview',
          partition: 'persist:rm-browser',
          'data-testid': 'browser-webview',
        })}
        {loadError && (
          <div className="browser-load-error" data-testid="browser-load-error">
            <strong>Page could not load</strong>
            <span>{loadError}</span>
            <button type="button" className="button button-subtle button-sm" onClick={() => go()}>
              Try again
            </button>
          </div>
        )}
      </div>
      {reader && (
        <div className="browser-reader" data-testid="browser-reader">
          <div className="browser-reader-head">
            <div>
              <h4>{reader.title || title}</h4>
              <span className="faint small mono">{reader.url || current}</span>
            </div>
            <span className="spacer" />
            <span className="faint small">{reader.text.length} chars</span>
          </div>
          <pre data-testid="browser-reader-text">{reader.text.slice(0, 12000)}</pre>
        </div>
      )}
      <div className="browser-status">
        <span>{title || 'Browser'}</span>
        <span className="spacer" />
        <span className="mono">{workspace.name}</span>
        <span>·</span>
        <span>{current.startsWith('rm://') ? 'Local sandbox' : 'Web'}</span>
        {state.browserHistory.length > 0 && <span>· {state.browserHistory.length} visited</span>}
      </div>
    </div>
  );
}
