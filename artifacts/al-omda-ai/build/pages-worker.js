const LEGACY='https://al-omda-ai-app.abdelfattahhossam1.workers.dev';
const PUBLIC='https://al-omda-ai.pages.dev';
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')){
   const origin=request.headers.get('origin');
   // Only the canonical browser app may send a mutation through this proxy.
   if(!['GET','HEAD','OPTIONS'].includes(request.method)&&origin!==PUBLIC)return new Response('Forbidden',{status:403});
   if(origin&&origin!==PUBLIC)return new Response('Forbidden',{status:403});
   const headers=new Headers(request.headers);
   headers.delete('x-forwarded-host');headers.delete('forwarded');
   headers.set('x-forwarded-host',url.host);headers.set('x-forwarded-proto','https');
   const target=new URL(url.pathname+url.search,LEGACY);
   const response=await fetch(new Request(target,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'}));
   const output=new Headers(response.headers);
   output.set('cache-control','no-store');output.delete('access-control-allow-origin');
   const location=output.get('location');
   if(location?.startsWith(LEGACY+'/'))output.set('location',PUBLIC+location.slice(LEGACY.length));
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers:output});
  }
  return env.ASSETS.fetch(request);
 }
};
