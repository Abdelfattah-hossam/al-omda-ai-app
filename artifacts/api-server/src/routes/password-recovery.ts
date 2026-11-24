import {Router,type IRouter}from 'express';
import {randomBytes,createHash}from 'node:crypto';
import {supabaseFetch,requireSameOrigin,readSupabaseJson,reportSupabaseError,SupabaseHttpError,resolveSession,clearSessionCookies}from '../lib/supabase';
const router:IRouter=Router();
const CANONICAL='https://zahin.pages.dev';
const PUBLIC_HOSTS=new Set(['zahin.pages.dev','al-omda-ai.pages.dev']);
function recoveryOrigin(req:{get(name:string):string|undefined}){const host=req.get('x-forwarded-host')?.split(',')[0]?.trim();return host&&PUBLIC_HOSTS.has(host)?CANONICAL:'https://al-omda-ai-app.abdelfattahhossam1.workers.dev';}
const verifierCookie='omda_recovery_verifier',accessCookie='omda_recovery_access',cooldownCookie='omda_recovery_wait';
const cookie={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/api/auth',maxAge:15*60*1000};
export function validRecoveryEmail(value:unknown):value is string{return typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}
export function validRecoveryPassword(value:unknown):value is string{return typeof value==='string'&&value.length>=8&&value.length<=128;}
router.post('/auth/forgot-password',requireSameOrigin,async(req,res)=>{
 const APP=recoveryOrigin(req);const email=req.body?.email;if(!validRecoveryEmail(email)){res.status(400).json({error:'أدخل بريدًا إلكترونيًا صحيحًا.'});return;}
 const wait=Number(req.cookies?.[cooldownCookie]);if(Number.isFinite(wait)&&Date.now()-wait<60000){res.status(429).json({error:'انتظر دقيقة قبل طلب رابط آخر.'});return;}
 const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
 try{const response=await supabaseFetch('/auth/v1/recover?redirect_to='+encodeURIComponent(APP+'/api/auth/recovery-callback'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:email.trim().toLowerCase(),code_challenge:challenge,code_challenge_method:'s256'})});await readSupabaseJson(response);
 res.cookie(verifierCookie,verifier,{...cookie,secure:true,maxAge:60*60*1000});res.cookie(cooldownCookie,String(Date.now()),{...cookie,secure:true,maxAge:60000});res.json({requested:true,message:'إذا كان البريد مسجلاً ومسموحاً لخدمة البريد، ستصلك رسالة الاستعادة. افتحها في نفس المتصفح خلال ساعة. تحقق من البريد غير المرغوب أيضاً.'});
 }catch(error){
 const payload=error instanceof SupabaseHttpError?error.payload as {code?:string;error_code?:string}:null;const code=payload?.code??payload?.error_code;
 if(code==='over_email_send_rate_limit'||code==='email_address_not_authorized'){
  res.status(code==='over_email_send_rate_limit'?429:503).json({error:'خدمة البريد الحالية محدودة وقد لا تسمح بإرسال الاستعادة لهذا العنوان. تواصل مع صاحب التطبيق لربط خدمة بريد. إذا كنت مسجل الدخول وتعرف كلمة المرور الحالية، يمكنك تغييرها من نفس الصفحة.'});return;
 }
 reportSupabaseError(req,res,error,'تعذر إرسال رابط الاستعادة. جرّب لاحقًا أو تواصل مع صاحب التطبيق.');}

});
router.get('/auth/recovery-callback',async(req,res)=>{
 const APP=recoveryOrigin(req);res.setHeader('cache-control','no-store');res.setHeader('referrer-policy','no-referrer');
 const code=typeof req.query.code==='string'?req.query.code:'',verifier=req.cookies?.[verifierCookie];
 res.clearCookie(verifierCookie,{...cookie,secure:true});
 if(!code||code.length>3000||typeof verifier!=='string'){res.redirect(303,APP+'/reset-password?error=invalid');return;}
 try{const response=await supabaseFetch('/auth/v1/token?grant_type=pkce',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({auth_code:code,code_verifier:verifier})});const data=await readSupabaseJson<{access_token?:string}>(response);if(!data.access_token)throw new Error('No recovery session');res.cookie(accessCookie,data.access_token,{...cookie,secure:true});res.redirect(303,APP+'/reset-password');}catch{res.redirect(303,APP+'/reset-password?error=expired');}
});
router.get('/auth/recovery-status',async(req,res)=>{
 res.setHeader('cache-control','no-store');const access=req.cookies?.[accessCookie];
 if(typeof access!=='string'){res.json({ready:false});return;}
 try{const response=await supabaseFetch('/auth/v1/user',{},access);
  if(response.status===401||response.status===403){res.clearCookie(accessCookie,{...cookie,secure:true});res.json({ready:false});return;}
  const user=await readSupabaseJson<{id?:string}>(response);res.json({ready:typeof user.id==='string'});
 }catch{res.status(503).json({ready:false,error:'تعذر التحقق من صلاحية الرابط الآن. أعد المحاولة.'});}
});
router.post('/auth/change-password',requireSameOrigin,async(req,res)=>{
 res.setHeader('cache-control','no-store');const {currentPassword,password}=req.body??{};
 if(typeof currentPassword!=='string'||!currentPassword||currentPassword.length>128||!validRecoveryPassword(password)){
  res.status(400).json({error:'أدخل كلمة المرور الحالية وكلمة مرور جديدة من 8 إلى 128 حرفًا.'});return;
 }
 if(currentPassword===password){res.status(400).json({error:'اختر كلمة مرور مختلفة عن الحالية.'});return;}
 try{const session=await resolveSession(req,res);if(!session){res.status(401).json({error:'سجّل الدخول أولًا أو استخدم رابط استعادة البريد.'});return;}
  const verified=await supabaseFetch('/auth/v1/token?grant_type=password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:session.user.email,password:currentPassword})});
  const data=await readSupabaseJson<{access_token?:string;user?:{id?:string}}>(verified);
  if(!data.access_token||data.user?.id!==session.user.id){res.status(403).json({error:'تعذر تأكيد كلمة المرور الحالية.'});return;}
  let saved=false;
  try{await readSupabaseJson(await supabaseFetch('/auth/v1/user',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({password})},data.access_token));saved=true;}
  finally{try{await supabaseFetch('/auth/v1/logout?scope='+(saved?'global':'local'),{method:'POST'},data.access_token);}catch{/* Best-effort remote revocation. */}if(saved)clearSessionCookies(req,res);}
  res.json({saved:true});
 }catch(error){reportSupabaseError(req,res,error,'تعذر تغيير كلمة المرور. تحقق من الكلمة الحالية ثم حاول مرة أخرى.');}
});
router.post('/auth/reset-password',requireSameOrigin,async(req,res)=>{
 res.setHeader('cache-control','no-store');const access=req.cookies?.[accessCookie],password=req.body?.password;
 if(typeof access!=='string'){res.status(401).json({error:'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.'});return;}
 if(!validRecoveryPassword(password)){res.status(400).json({error:'اختر كلمة مرور من 8 إلى 128 حرفًا.'});return;}
 try{const result=await supabaseFetch('/auth/v1/user',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({password})},access);await readSupabaseJson(result);res.clearCookie(accessCookie,{...cookie,secure:true});clearSessionCookies(req,res);
 // Revoke recovery sessions after use, then require a normal explicit sign-in.
 try{await supabaseFetch('/auth/v1/logout?scope=global',{method:'POST'},access);}catch{/* Password is already saved; do not report a false failure. */}
 res.json({saved:true});}catch(error){reportSupabaseError(req,res,error,'تعذر تغيير كلمة المرور. قد يكون الرابط منتهيًا أو كلمة المرور ضعيفة.');}
});
export default router;
