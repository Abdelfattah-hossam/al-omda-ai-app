import { useEffect, useState } from 'react';
import './NetworkStatus.css';

export default function NetworkStatus({ ar }: { ar: boolean }) {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return <div role="status" aria-live="polite" className="network-status" style={{position:'fixed',zIndex:100,top:'calc(64px + env(safe-area-inset-top))',left:'50%',transform:'translateX(-50%)',width:'min(640px, calc(100% - 24px))',boxSizing:'border-box',padding:'10px 14px',border:'1px solid #513676',borderRadius:12,background:'#191224',color:'#ceb4f2',fontSize:12,lineHeight:1.7,textAlign:'center',boxShadow:'0 8px 24px #0006',pointerEvents:'none'}}>
    {ar ? 'الاتصال بالإنترنت مقطوع. الردود الجديدة والحفظ السحابي تحتاج اتصالًا. احتفظ بالصفحة مفتوحة ولا تحدّثها قبل عودة الاتصال.' : 'You are offline. New AI replies and cloud saves need a connection. Keep this page open and avoid reloading until the connection returns.'}
  </div>;
}
