const BACKEND='https://al-omda-ai-app.abdelfattahhossam1.workers.dev';
const CANONICAL='https://munjizly.pages.dev';
const LEGACY_HOSTS=new Set(['zahin.pages.dev','al-omda-ai.pages.dev']);
const ALLOWED_ORIGINS=[CANONICAL,'https://zahin.pages.dev','https://al-omda-ai.pages.dev'];
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')){
   const origin=request.headers.get('origin');
   // Only the canonical browser app (current or legacy host) may send a mutation through this proxy.
   if(!['GET','HEAD','OPTIONS'].includes(request.method)&&!ALLOWED_ORIGINS.includes(origin))return new Response('Forbidden',{status:403});
   if(origin&&!ALLOWED_ORIGINS.includes(origin))return new Response('Forbidden',{status:403});
   const headers=new Headers(request.headers);
   headers.delete('x-forwarded-host');headers.delete('forwarded');
   headers.set('x-forwarded-host',url.host);headers.set('x-forwarded-proto','https');
   const target=new URL(url.pathname+url.search,BACKEND);
   const response=await fetch(new Request(target,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual',duplex:'half'}));
   const output=new Headers(response.headers);
   output.set('cache-control','no-store');output.delete('access-control-allow-origin');
   const location=output.get('location');
   if(location?.startsWith(BACKEND+'/'))output.set('location',CANONICAL+location.slice(BACKEND.length));
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers:output});
  }
  // Legacy public hosts keep serving the API proxy above but every page moves to the canonical address.
  if(LEGACY_HOSTS.has(url.host))return Response.redirect(CANONICAL+url.pathname+url.search,301);
  return env.ASSETS.fetch(request);
 }
};
