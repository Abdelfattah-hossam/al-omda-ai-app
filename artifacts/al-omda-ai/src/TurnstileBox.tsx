import { useEffect, useRef } from 'react';
import { TURNSTILE_SITE_KEY, loadTurnstile, setTurnstileToken } from '@/lib/turnstile';

export default function TurnstileBox() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widget = '';
    let dead = false;
    const key = 'w' + Math.random().toString(36).slice(2);
    let api: Awaited<ReturnType<typeof loadTurnstile>> | null = null;
    const reset = () => { if (api && widget) { try { api.reset(widget); } catch { /* ignore */ } } };
    void loadTurnstile().then((t) => {
      if (dead || !ref.current) return;
      api = t;
      widget = t.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token: string) => setTurnstileToken(key, token),
        'expired-callback': () => setTurnstileToken(key, null),
        'error-callback': () => setTurnstileToken(key, null),
      });
    }).catch(() => { /* Server will reject with a clear message if the check cannot load. */ });
    window.addEventListener('turnstile-reset', reset);
    return () => { dead = true; window.removeEventListener('turnstile-reset', reset); setTurnstileToken(key, null); if (api && widget) { try { api.remove(widget); } catch { /* ignore */ } } };
  }, []);
  return <div ref={ref} data-testid="turnstile-box" style={{ minHeight: 65, display: 'flex', justifyContent: 'center' }} />;
}
