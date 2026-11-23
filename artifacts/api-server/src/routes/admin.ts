import {Router,type IRouter} from 'express';
import {readSupabaseJson,reportSupabaseError,requireSameOrigin,resolveSession,supabaseFetch} from '../lib/supabase';
const router:IRouter=Router();
const READS=new Set(['users','projects','project','audit','settings']);
const WRITES:Record<string,string[]>={update_user:['displayName','organization','suspended'],update_project:['title','request','status','expectedUpdatedAt'],update_setting:['value']};
export function validAdminWrite(action:unknown,data:unknown):boolean{
 if(typeof action!=='string'||!WRITES[action]||!data||typeof data!=='object'||Array.isArray(data))return false;
 const entries=Object.entries(data);return entries.length>0&&entries.every(([key,value])=>WRITES[action].includes(key)&&(key==='suspended'?typeof value==='boolean':typeof value==='string'));
}
router.get('/app-content',async(_req,res)=>{try{const result=await supabaseFetch('/rest/v1/rpc/omda_shared_content',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});res.json(await readSupabaseJson(result));}catch{res.json({});}});
router.get('/admin/access',async(req,res)=>{
 try{const session=await resolveSession(req,res);if(!session){res.status(401).json({error:'Sign in required.'});return;}const result=await supabaseFetch('/rest/v1/rpc/omda_account_access',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},session.accessToken);res.json(await readSupabaseJson(result));}catch(error){reportSupabaseError(req,res,error,'Could not check admin access.');}
});
router.get('/admin/:action',async(req,res)=>{
 if(!READS.has(req.params.action)){res.status(404).json({error:'Unknown admin view.'});return;}
 try{const session=await resolveSession(req,res);if(!session){res.status(401).json({error:'Sign in required.'});return;}const offset=Number(req.query.offset??0);if(!Number.isInteger(offset)||offset<0){res.status(400).json({error:'Invalid offset.'});return;}const result=await supabaseFetch('/rest/v1/rpc/omda_admin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_action:req.params.action,p_id:typeof req.query.id==='string'?req.query.id:null,p_offset:offset})},session.accessToken);res.status(result.status===403?403:result.ok?200:400).json(await result.json());}catch(error){reportSupabaseError(req,res,error,'Could not load admin data.');}
});
router.post('/admin/action',requireSameOrigin,async(req,res)=>{
 const {action,id,data}=req.body??{};if(typeof id!=='string'||!id||id.length>80||!validAdminWrite(action,data)){res.status(400).json({error:'Invalid admin change.'});return;}
 try{const session=await resolveSession(req,res);if(!session){res.status(401).json({error:'Sign in required.'});return;}const result=await supabaseFetch('/rest/v1/rpc/omda_admin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_action:action,p_id:id,p_data:data})},session.accessToken);res.status(result.status===403?403:result.ok?200:409).json(await result.json());}catch(error){reportSupabaseError(req,res,error,'Could not save admin change.');}
});
export default router;
