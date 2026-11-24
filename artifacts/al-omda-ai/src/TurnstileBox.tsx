import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY, registerTurnstileBox, onPowReady, loadTurnstile, setTurnstileClientError, setTurnstileToken } from '@/lib/turnstile';

// Renders the Turnstile widget. When the widget cannot run on this browser at
// all (it errors twice in a row, or its script is blocked), the box swaps to a
// quiet note and marks the client-error state: the API server then lets the
// auth request through without a token instead of locking the person out.
export default function TurnstileBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [verified, setVerified] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [powReady, setPowReady] = useState(false);
  useEffect(() => {
    let widget = '';
    let dead = false;
    let retried = false;
    const key = 'w' + Math.random().toString(36).slice(2);
    let api: Awaited<ReturnType<typeof loadTurnstile>> | null = null;
    let hang: ReturnType<typeof setTimeout> | undefined;
    // Some old browsers (e.g. Huawei Browser) never fire the error callback:
    // the widget just hangs. If no token arrives in time, treat it as failed.
    const armHang = () => { if (hang) clearTimeout(hang); hang = setTimeout(() => giveUp('hang-timeout'), 8000); };
    const reset = () => { if (api && widget) { try { api.reset(widget); } catch { /* ignore */ } } };
    const giveUp = (code: string) => {
      if (dead) return;
      setTurnstileClientError(code || 'unknown');
      setFailed(true);
      onPowReady(() => { if (!dead) setPowReady(true); });
    };
    registerTurnstileBox(1);
    // Huawei Browser (no Google services) cannot run Turnstile: go straight to the built-in check.
    if (/HuaweiBrowser|HMSCore/i.test(navigator.userAgent)) { giveUp('huawei-ua'); return () => { registerTurnstileBox(-1); dead = true; }; }
    void loadTurnstile().then((t) => {
      if (dead || !ref.current) return;
      api = t;
      widget = t.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        appearance: 'interaction-only',
        'before-interactive-callback': () => { if (hang) clearTimeout(hang); setInteractive(true); },
        'after-interactive-callback': () => setInteractive(false),
        callback: (token: string) => { if (hang) clearTimeout(hang); setVerified(true); setTurnstileToken(key, token); },
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
    return () => { registerTurnstileBox(-1); dead = true; if (hang) clearTimeout(hang); window.removeEventListener('turnstile-reset', reset); setTurnstileToken(key, null); if (api && widget) { try { api.remove(widget); } catch { /* ignore */ } } };
  }, []);
  const busy = failed ? !powReady : !verified;
  const note = busy ? (
    <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, opacity: 0.8, marginTop: 6 }}>
      <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', display: 'inline-block', animation: 'tsspin 0.8s linear infinite' }} />
      <span>جاري التحقق الأمني…</span>
      <style>{'@keyframes tsspin{to{transform:rotate(360deg)}}'}</style>
    </div>
  ) : null;
  if (failed) return <div data-testid="turnstile-box">{note}</div>;
  return <div data-testid="turnstile-box"><div ref={ref} style={interactive ? { minHeight: 65, display: 'flex', justifyContent: 'center' } : { height: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center' }} />{note}</div>;
}
