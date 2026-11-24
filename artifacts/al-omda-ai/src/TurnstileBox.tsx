import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY, loadTurnstile, registerTurnstileBox, setTurnstileToken } from '@/lib/turnstile';

// Renders the Cloudflare Turnstile widget. A spinner shows until verification is done.
export default function TurnstileBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    let widget = '';
    let dead = false;
    const key = 'w' + Math.random().toString(36).slice(2);
    let api: Awaited<ReturnType<typeof loadTurnstile>> | null = null;
    const reset = () => { setVerified(false); if (api && widget) { try { api.reset(widget); } catch { /* ignore */ } } };
    registerTurnstileBox(1);
    void loadTurnstile().then((t) => {
      if (dead || !ref.current) return;
      api = t;
      widget = t.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token: string) => { setVerified(true); setTurnstileToken(key, token); },
        'expired-callback': () => { setVerified(false); setTurnstileToken(key, null); },
        'error-callback': () => { setVerified(false); setTurnstileToken(key, null); },
      });
    }).catch(() => { /* script blocked: login stays unavailable until the check can load */ });
    window.addEventListener('turnstile-reset', reset);
    return () => { registerTurnstileBox(-1); dead = true; window.removeEventListener('turnstile-reset', reset); setTurnstileToken(key, null); if (api && widget) { try { api.remove(widget); } catch { /* ignore */ } } };
  }, []);
  return (
    <div data-testid="turnstile-box">
      <div ref={ref} style={{ minHeight: 65, display: 'flex', justifyContent: 'center' }} />
      {!verified && (
        <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, opacity: 0.8, marginTop: 6 }}>
          <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', display: 'inline-block', animation: 'tsspin 0.8s linear infinite' }} />
          <span>جاري التحقق الأمني…</span>
          <style>{'@keyframes tsspin{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}
    </div>
  );
}
