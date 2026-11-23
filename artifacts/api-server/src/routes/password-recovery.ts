import {Router,type IRouter}from 'express';
import {randomBytes,createHash}from 'node:crypto';
import {supabaseFetch,requireSameOrigin,readSupabaseJson,reportSupabaseError}from '../lib/supabase';
const router:IRouter=Router();
const APP='https://al-omda-ai-app.abdelfattahhossam1.workers.dev';
const verifierCookie='omda_recovery_verifier',accessCookie='omda_recovery_access',cooldownCookie='omda_recovery_wait';
const cookie={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/api/auth',maxAge:15*60*1000};
export function validRecoveryEmail(value:unknown):value is string{return typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}
export function validRecoveryPassword(value:unknown):value is string{return typeof value==='string'&&value.length>=8&&value.length<=128;}
router.post('/auth/forgot-password',requireSameOrigin,async(req,res)=>{
 const email=req.body?.email;if(!validRecoveryEmail(email)){res.status(400).json({error:'أدخل بريدًا إلكترونيًا صحيحًا.'});return;}
 const wait=Number(req.cookies?.[cooldownCookie]);if(Number.isFinite(wait)&&Date.now()-wait<60000){res.status(429).json({error:'انتظر دقيقة قبل طلب رابط آخر.'});return;}
 const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
 try{const response=await supabaseFetch('/auth/v1/recover?redirect_to='+encodeURIComponent(APP+'/api/auth/recovery-callback'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:email.trim().toLowerCase(),code_challenge:challenge,code_challenge_method:'s256'})});await readSupabaseJson(response);
 res.cookie(verifierCookie,verifier,{...cookie,secure:true,maxAge:60*60*1000});res.cookie(cooldownCookie,String(Date.now()),{...cookie,secure:true,maxAge:60000});res.json({requested:true,message:'إذا كان البريد مسجلاً ومسموحاً لخدمة البريد، ستصلك رسالة الاستعادة. افتحها في نفس المتصفح خلال ساعة. تحقق من البريد غير المرغوب أيضاً.'});
 }catch(error){reportSupabaseError(req,res,error,'تعذر إرسال رابط الاستعادة. جرّب لاحقًا أو تواصل مع صاحب التطبيق.');}
});
router.get('/auth/recovery-callback',async(req,res)=>{
 res.setHeader('cache-control','no-store');res.setHeader('referrer-policy','no-referrer');
 const code=typeof req.query.code==='string'?req.query.code:'',verifier=req.cookies?.[verifierCookie];
 res.clearCookie(verifierCookie,{...cookie,secure:true});
 if(!code||code.length>3000||typeof verifier!=='string'){res.redirect(303,APP+'/reset-password?error=invalid');return;}
 try{const response=await supabaseFetch('/auth/v1/token?grant_type=pkce',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({auth_code:code,code_verifier:verifier})});const data=await readSupabaseJson<{access_token?:string}>(response);if(!data.access_token)throw new Error('No recovery session');res.cookie(accessCookie,data.access_token,{...cookie,secure:true});res.redirect(303,APP+'/reset-password');}catch{res.redirect(303,APP+'/reset-password?error=expired');}
});
router.get('/auth/recovery-status',(req,res)=>{res.setHeader('cache-control','no-store');res.json({ready:typeof req.cookies?.[accessCookie]==='string'});});
router.post('/auth/reset-password',requireSameOrigin,async(req,res)=>{
 res.setHeader('cache-control','no-store');const access=req.cookies?.[accessCookie],password=req.body?.password;
 if(typeof access!=='string'){res.status(401).json({error:'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.'});return;}
 if(!validRecoveryPassword(password)){res.status(400).json({error:'اختر كلمة مرور من8إلى128حرفًا.'});return;}
 try{const result=await supabaseFetch('/auth/v1/user',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({password})},access);await readSupabaseJson(result);res.clearCookie(accessCookie,{...cookie,secure:true});
 // Revoke recovery sessions after use, then require a normal explicit sign-in.
 try{await supabaseFetch('/auth/v1/logout?scope=global',{method:'POST'},access);}catch{/* Password is already saved; do not report a false failure. */}
 res.json({saved:true});}catch(error){reportSupabaseError(req,res,error,'تعذر تغيير كلمة المرور. قد يكون الرابط منتهيًا أو كلمة المرور ضعيفة.');}
});
export default router;
