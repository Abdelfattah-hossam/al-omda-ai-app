export function preferredDeviceVoice(voices:SpeechSynthesisVoice[],language:string){
 const ar=language.startsWith('ar');
 return voices.map(voice=>({voice,score:(ar?(voice.lang.toLowerCase()==='ar-eg'?100:voice.lang.toLowerCase().startsWith('ar')?50:-100):(voice.lang.toLowerCase()==='en-us'?100:voice.lang.startsWith('en')?50:-100))+( /premium|enhanced|natural/i.test(voice.name)?20:0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)[0]?.voice;
}
export function playFreeSpeech(text:string,language:string,options:{context?:AudioContext;output?:AudioNode;onSource?:(source:string)=>void;onDone:()=>void}){
 const controller=new AbortController();let cancelled=false,finished=false,source:AudioBufferSourceNode|null=null,utterance:SpeechSynthesisUtterance|null=null;
 const OwnContext=window.AudioContext||(window as any).webkitAudioContext;
 const own=!options.context;const context:AudioContext|undefined=options.context||(OwnContext?new OwnContext():undefined);
 void context?.resume().catch(()=>{});
 const timeout=window.setTimeout(()=>controller.abort(),20000);
 const finish=()=>{if(finished)return;finished=true;window.clearTimeout(timeout);if(own)void context?.close();if(!cancelled)options.onDone();};
 void(async()=>{
  try{
   options.onSource?.('free');
   const response=await fetch('/api/ai/speech',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({text,language}),signal:controller.signal});
   if(!response.ok||!response.headers.get('content-type')?.startsWith('audio/'))throw new Error('Free speech unavailable');
   if(!context)throw new Error('No audio context');
   const buffer=await context.decodeAudioData(await response.arrayBuffer());
   window.clearTimeout(timeout);if(cancelled)return;
   await context.resume();if(cancelled)return;
   source=context.createBufferSource();source.buffer=buffer;source.connect(options.output??context.destination);source.onended=finish;source.start();
  }catch{
   window.clearTimeout(timeout);if(cancelled)return;
   if(!('speechSynthesis' in window)){finish();return;}
   options.onSource?.('device');
   utterance=new SpeechSynthesisUtterance(text);utterance.lang=language;utterance.rate=.96;
   const voice=preferredDeviceVoice(window.speechSynthesis.getVoices(),language);if(voice)utterance.voice=voice;
   utterance.onend=finish;utterance.onerror=finish;window.speechSynthesis.speak(utterance);
  }
 })();
 return()=>{cancelled=true;controller.abort();if(source){source.onended=null;try{source.stop();}catch{}}if(utterance)window.speechSynthesis.cancel();finish();};
}
