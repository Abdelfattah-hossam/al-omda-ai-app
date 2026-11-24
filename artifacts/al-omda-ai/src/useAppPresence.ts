import {useEffect} from 'react';

// Account-level counts, not sessions or page views. Hidden/offline apps do not pulse.
export function useAppPresence(userId?:string){
 useEffect(()=>{
  if(!userId)return;
  let stopped=false,inFlight=false,lastAttempt=0;
  const pulse=async()=>{
   if(stopped||inFlight||document.visibilityState!=='visible'||!navigator.onLine||Date.now()-lastAttempt<45000)return;
   inFlight=true;lastAttempt=Date.now();
   try{await fetch('/api/presence/heartbeat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});}catch{/* Presence must never block the app. */}finally{inFlight=false;}
  };
  void pulse();
  const timer=window.setInterval(()=>void pulse(),60000);
  const resume=()=>void pulse();
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);window.addEventListener('pageshow',resume);
  return()=>{stopped=true;window.clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);window.removeEventListener('pageshow',resume);};
 },[userId]);
}
