import {normalizeModelProviderBase} from './model-providers.js';
export function normalizeLocalModelConfig(value:unknown):{baseUrl:string;model:string}{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid local model settings.');
 const v=value as Record<string,unknown>;if(Object.keys(v).some(k=>!['baseUrl','model'].includes(k)))throw new Error('Only a local endpoint and model name are accepted; no API keys.');
 if(typeof v.baseUrl!=='string'||typeof v.model!=='string'||!v.model.trim()||v.model.trim().length>200||/[\r\n\0]/.test(v.model))throw new Error('Enter a local endpoint and model name.');
 const baseUrl=normalizeModelProviderBase(v.baseUrl);const u=new URL(baseUrl);
 if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw new Error('Only a model on this computer is allowed.');
 return{baseUrl,model:v.model.trim()};
}
