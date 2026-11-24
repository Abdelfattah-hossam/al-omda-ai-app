import{Router,type IRouter}from'express';
import{requireSameOrigin,resolveSession,clearSessionCookies}from'../lib/supabase';
const router:IRouter=Router();
async function call(body:unknown,token?:string){
 const r=await fetch(process.env.SUPABASE_URL+'/functions/v1/account-recovery',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 const d=await r.json()as {error?:string;token?:string;expiresAt?:string;saved?:boolean};return{r,d};
}
router.post('/admin/recovery-link',requireSameOrigin,async(req,res)=>{
 res.setHeader('cache-control','no-store');
 try{const session=await resolveSession(req,res);if(!session){res.status(401).json({error:'Sign in required'});return;}
 const{r,d}=await call({action:'issue',targetId:req.body?.targetId,confirmed:req.body?.confirmed},session.accessToken);
 if(!r.ok||!d.token){res.status(r.ok?502:r.status).json({error:d.error??'تعذر إصدار الرابط'});return;}
 res.json({url:'https://zahin.pages.dev/reset-password#ticket='+d.token,expiresAt:d.expiresAt});
 }catch{res.status(503).json({error:'تعذر الاتصال بخدمة الاستعادة. حاول لاحقًا.'});}
});
router.post('/auth/assisted-reset',requireSameOrigin,async(req,res)=>{
 res.setHeader('cache-control','no-store');
 const{ticket,password}=req.body??{};if(typeof ticket!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(ticket)||typeof password!=='string'||password.length<8||password.length>128){res.status(400).json({error:'رابط غير صالح أو كلمة المرور قصيرة.'});return;}
 try{const{r,d}=await call({action:'redeem',ticket,password});if(r.ok&&d.saved){clearSessionCookies(req,res);res.json({saved:true});return;}res.status(r.ok?502:r.status).json({error:d.error??'تعذر استعادة الحساب'});}catch{res.status(503).json({error:'تعذر الاتصال. اطلب رابطًا جديدًا إذا استُخدم الرابط الحالي.'});}
});
export default router;
