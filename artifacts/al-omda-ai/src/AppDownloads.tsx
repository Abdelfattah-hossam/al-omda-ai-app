import {useState} from 'react';
import './app-downloads.css';

const ROOT='https://github.com/Abdelfattah-hossam/al-omda-ai-app/releases/download/preview-1.0.0/';
export const APP_PACKAGES=[
 {id:'android',name:'Android',ar:'أندرويد',file:'AL-OMDA-Ai-Android-preview-1.0.0.apk',size:'33 KB'},
 {id:'windows',name:'Windows 64',ar:'ويندوز 64',file:'AL-OMDA-Ai-win-x64-1.0.0.zip',size:'127 MB'},
 {id:'mac-arm',name:'Mac · Apple Silicon',ar:'ماك · Apple Silicon',file:'AL-OMDA-Ai-mac-arm64-1.0.0.zip',size:'105 MB'},
 {id:'mac-intel',name:'Mac · Intel',ar:'ماك · Intel',file:'AL-OMDA-Ai-mac-x64-1.0.0.zip',size:'110 MB'},
];
function DeviceIcon({device}:{device:string}) {
 return <svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
  {device==='android'?<><path d="M8 13h16v10a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3zm0-2a8 8 0 0 1 16 0M10 3 8 0m14 3 2-3M4 13v11m24-11v11M12 26v5m8-5v5"/><circle cx="12" cy="8" r=".8" fill="currentColor"/><circle cx="20" cy="8" r=".8" fill="currentColor"/></>:device==='windows'?<><path d="m3 6 11-1.5V15H3zm14-2 12-2v13H17zM3 18h11v10.5L3 27zm14 0h12v13l-12-2z" fill="currentColor" stroke="none"/></>:device==='iphone'?<><rect x="8" y="1.5" width="16" height="29" rx="4"/><path d="M13 5h6m-5 22h4"/></>:<><path d="M21 7c-2-1-3 1-5 1s-4-2-7 0C2 13 8 29 13 29c2 0 2-1 4-1s2 1 4 1c3-1 5-5 6-8-6-2-6-9-1-11-1-2-3-3-5-3Z" fill="currentColor" stroke="none"/><path d="M17 6c0-3 2-5 5-5 0 3-2 5-5 5Z" fill="currentColor"/></>}
 </svg>;
}
export default function AppDownloads({isAr}:{isAr:boolean}) {
 const [iphoneOpen,setIphoneOpen]=useState(false);
 return <section className="app-downloads panel" aria-label={isAr?'تحميل التطبيق على جهازك':'Download the app'} data-testid="app-downloads">
  <div className="app-downloads-heading"><h2>{isAr?'حمّل العمدة على جهازك':'Get AL OMDA Ai on your device'}</h2><span>{isAr?'تحميل مباشر':'Direct download'}</span></div>
  <div className="app-downloads-devices">
   {APP_PACKAGES.map(item=><a key={item.id} className="app-downloads-device" href={ROOT+item.file} download data-testid={'download-'+item.id} aria-label={(isAr?'تحميل ':'Download ')+(isAr?item.ar:item.name)}><DeviceIcon device={item.id}/><strong>{isAr?item.ar:item.name}</strong><small dir="ltr">{item.size}</small></a>)}
   <button type="button" className="app-downloads-device" onClick={()=>setIphoneOpen(v=>!v)} aria-expanded={iphoneOpen} data-testid="install-iphone"><DeviceIcon device="iphone"/><strong>{isAr?'آيفون وiPad':'iPhone & iPad'}</strong><small>{isAr?'تثبيت من Safari':'Install from Safari'}</small></button>
  </div>
  {iphoneOpen&&<div className="app-downloads-iphone" role="status"><strong>{isAr?'تثبيت الآيفون بدون ملف':'Install on iPhone, no file needed'}</strong><p>{isAr?'افتح موقع العمدة في Safari، اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية»، وفعّل «فتح كتطبيق ويب» إذا ظهر. لا يوجد ملف IPA أو إصدار App Store.':'Open AL OMDA Ai in Safari. Tap Share, then Add to Home Screen. Enable Open as Web App if shown. There is no IPA or App Store version.'}</p></div>}
  <p className="app-downloads-note">{isAr?'نسخ تجريبية تحتاج إنترنت. أندرويد بمفتاح اختبار، وويندوز وماك غير موقّعين. لم تُختبر هذه النسخ على أجهزة فعلية. لا تعطّل حماية الجهاز. على ويندوز فكّ الضغط كاملًا. على ماك اختر Apple Silicon أو Intel حسب معالجك.':'Preview builds require internet. Android is debug-signed; Windows and Mac are unsigned. These builds have not been tested on physical target devices. Do not disable device security. Extract the full Windows ZIP. Choose your Mac processor: Apple Silicon or Intel.'}</p>
 </section>;
}
