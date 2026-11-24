import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY, loadTurnstile, setTurnstileClientError, setTurnstileToken } from '@/lib/turnstile';

// Renders the Turnstile widget. When the widget cannot run on this browser at
// all (it errors twice in a row, or its script is blocked), the box swaps to a
// quiet note and marks the client-error state: the API server then lets the
// auth request through without a token instead of locking the person out.
export default function TurnstileBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let widget = '';
    let dead = false;
    let retried = false;
    const key = 'w' + Math.random().toString(36).slice(2);
    let api: Awaited<ReturnType<typeof loadTurnstile>> | null = null;
    let hang: ReturnType<typeof setTimeout> | undefined;
    // Some old browsers (e.g. Huawei Browser) never fire the error callback:
    // the widget just hangs. If no token arrives in time, treat it as failed.
    const armHang = () => { if (hang) clearTimeout(hang); hang = setTimeout(() => giveUp('hang-timeout'), 20000); };
    const reset = () => { if (api && widget) { try { api.reset(widget); } catch { /* ignore */ } } };
    const giveUp = (code: string) => {
      if (dead) return;
      setTurnstileClientError(code || 'unknown');
      setFailed(true);
    };
    void loadTurnstile().then((t) => {
      if (dead || !ref.current) return;
      api = t;
      widget = t.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token: string) => { if (hang) clearTimeout(hang); setTurnstileToken(key, token); },
        'expired-callback': () => { setTurnstileToken(key, null); armHang(); },
        'unsupported-callback': () => { setTurnstileToken(key, null); giveUp('unsupported'); },
        'timeout-callback': () => { setTurnstileToken(key, null); armHang(); },
        'error-callback': (code: string) => {
          setTurnstileToken(key, null);
          if (!retried) {
            retried = true;
            // One retry: transient challenge failures often clear on a reset.
            setTimeout(() => {
              if (dead || !api || !widget) return;
              try { api.reset(widget); } catch { giveUp(String(code || 'unknown')); }
            }, 1500);
          } else {
            giveUp(String(code || 'unknown'));
          }
        },
      });
      armHang();
    }).catch(() => giveUp('script-load'));
    window.addEventListener('turnstile-reset', reset);
    return () => { dead = true; if (hang) clearTimeout(hang); window.removeEventListener('turnstile-reset', reset); setTurnstileToken(key, null); if (api && widget) { try { api.remove(widget); } catch { /* ignore */ } } };
  }, []);
  if (failed) {
    return (
      <div data-testid="turnstile-box" style={{ minHeight: 65, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, opacity: 0.65, textAlign: 'center', lineHeight: 1.7 }}>
          تعذّر عرض التحقق الأمني على هذا المتصفح، يمكنك المتابعة مباشرة.
          <br />
          Security check unavailable on this browser; you can continue.
        </p>
      </div>
    );
  }
  return <div ref={ref} data-testid="turnstile-box" style={{ minHeight: 65, display: 'flex', justifyContent: 'center' }} />;
}
