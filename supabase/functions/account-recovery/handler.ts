// Narrow recovery endpoint. Service credentials never leave this function.
export function createRecoveryHandler(config:{url:string;key:string},request:typeof fetch=fetch){
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
 async function api(path:string,body:unknown,token=config.key){
  const r=await request(config.url+path,{method:'POST',headers:{apikey:config.key,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
  const d:any=await r.json().catch(()=>null);if(!r.ok)throw new Error('Provider request failed');return d;
 }
 async function digest(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
 return async(req:Request)=>{
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  const text=await req.text();if(text.length>2048)return reply({error:'Request too large'},413);
  let d:any;try{d=JSON.parse(text);}catch{return reply({error:'Invalid request'},400);}
  if(d?.action==='issue'){
   const authorization=req.headers.get('authorization')??'';if(!authorization.startsWith('Bearer ')||authorization==='Bearer '+config.key)return reply({error:'Sign in required'},401);
   if(d.confirmed!==true||typeof d.targetId!=='string'||!/^[a-f0-9-]{36}$/.test(d.targetId))return reply({error:'Confirm the account owner first'},400);
   try{
    const bytes=crypto.getRandomValues(new Uint8Array(32));const token=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const result=await api('/rest/v1/rpc/omda_issue_recovery',{p_target:d.targetId,p_hash:await digest(token)},authorization.slice(7));
    return reply({token,expiresAt:result.expiresAt});
   }catch{return reply({error:'غير مصرح، الحساب غير مؤهل، أو تجاوزت حد الإصدار. انتظر دقيقة وحاول.'},403);}
  }
  if(d?.action!=='redeem'||typeof d.ticket!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(d.ticket)||typeof d.password!=='string'||d.password.length<8||d.password.length>128)return reply({error:'رابط غير صالح أو كلمة المرور لا تحقق الشروط.'},400);
  let ticketId:string|undefined,access:string|undefined,saved=false;
  try{
   const target=await api('/rest/v1/rpc/omda_consume_recovery',{p_hash:await digest(d.ticket)});ticketId=target.ticketId;
   const link=await api('/auth/v1/admin/generate_link',{type:'recovery',email:target.email});
   if(link.user?.id!==target.targetId||typeof link.hashed_token!=='string')throw new Error('Unexpected account');
   const session=await api('/auth/v1/verify',{type:'recovery',token_hash:link.hashed_token});access=session.access_token;
   if(session.user?.id!==target.targetId||!access)throw new Error('Unexpected recovery session');
   const r=await request(config.url+'/auth/v1/user',{method:'PUT',headers:{apikey:config.key,authorization:'Bearer '+access,'content-type':'application/json'},body:JSON.stringify({password:d.password})});
   if(!r.ok)throw new Error('Password not saved');saved=true;
   return reply({saved:true});
  }catch{return reply({error:'الرابط انتهى أو استُخدم، أو تعذر حفظ كلمة المرور. اطلب رابطًا جديدًا من إدارة التطبيق واستخدم كلمة مرور قوية.'},400);}
  finally{
   if(access)try{await api('/auth/v1/logout?scope=global',{},access);}catch{/* Password update may already have succeeded. */}
   if(ticketId)try{await api('/rest/v1/rpc/omda_finish_recovery',{p_ticket:ticketId,p_success:saved});}catch{/* Started event remains recorded if finalization fails. */}
  }
 };
}
