import base64,functools,http.server,json,pathlib,subprocess,tempfile,threading,time,urllib.request,websocket
SIGNED_IN=True
SAVED_PROFILE={"displayName":"","organization":"Remote original","avatarPath":None}
PROFILE_WRITES=[]
CONNECTION_TESTS=[]
from urllib.parse import urlsplit,parse_qs
PAGINATION_READS=[]
QA_TASKS=[{'id':'00000000-0000-4000-8000-'+str(i).zfill(12),'title':'اختبار محلي: '+title,'request':'Local QA fixture','specialty':specialty,'status':status,'createdAt':'2026-11-22T12:00:00.000Z','steps':[{'id':'step-1','text':'مرحلة اختبار','state':'approved'},{'id':'step-2','text':'مرحلة أخرى','state':'pending'}]}for i,(title,specialty,status) in enumerate([('ملف العرض','design','review'),('مراجعة الخطة','design','paused'),('مسودة محتوى','content','approved'),('بحث مصادر','research','stopped')])]
root=pathlib.Path(__file__).resolve().parents[2]/'artifacts/al-omda-ai/dist/public'
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_POST(self):
  payload=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))));CONNECTION_TESTS.append((self.path,payload));self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'generated':True,'provider':payload.get('provider'),'model':'synthetic-model','latencyMs':3}).encode())
 def do_PUT(self):
  data=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))));PROFILE_WRITES.append(data);SAVED_PROFILE.update(data)
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(SAVED_PROFILE).encode())
 def do_GET(self):
  if self.path.startswith('/api/'):
   if self.path=='/api/auth/status': payload={'configured':True}
   elif self.path=='/api/auth/session': payload={'configured':True,'user':({'id':'00000000-0000-4000-8000-000000000001','email':'synthetic@example.invalid'} if SIGNED_IN else None)}
   elif self.path=='/api/workspace':payload={'profile':SAVED_PROFILE,'tasks':QA_TASKS}
   elif self.path.startswith('/api/storage/assets/download'):
    self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'<!doctype html><title>Local synthetic file</title><p>Test only</p>');return
   elif self.path.startswith('/api/storage/assets'):
    query=parse_qs(urlsplit(self.path).query);offset=int(query.get('offset',['0'])[0]);folder=query.get('projectId',[''])[0]
    PAGINATION_READS.append((folder,offset))
    target={'path':'synthetic/general/test.html','name':'TEST-ONLY-global-search.html','mimeType':'text/html','size':70,'createdAt':None}
    fillers=[dict(target,path='synthetic/general/filler-'+str(i)+'.html',name='Fixture filler '+str(i)+'.html')for i in range(100)]
    payload=[]
   elif self.path=='/api/ai/conversations':payload={'conversations':[{'id':'qa-chat','title':'اختبار ألوان محلي','updated_at':'2026-11-23T00:00:00Z'}]}
   elif self.path=='/api/ai/conversations/qa-chat':payload={'conversation':{'id':'qa-chat','updated_at':'2026-11-23T00:00:00Z','messages':[{'role':'assistant','content':'اختبار محلي لأزرار الملفات. ليس طلباً حقيقياً.','sourceData':{'title':'Synthetic palette file','name':'palette-fixture.txt','language':'text','code':'Local fixture only'}}]}}
   elif self.path=='/api/ai/connections':payload={'providers':[{'id':p,'configured':p in ['groq','cloudflare']}for p in ['groq','cloudflare','gemini','openrouter']]}
   elif self.path=='/api/ai/usage':payload={'limit':1000,'used':0,'remaining':1000}

   else: payload={'error':'Synthetic acceptance fixture; no account or AI provider'}
   self.send_response(200 if 'error' not in payload else 503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(payload).encode());return
  if '.' not in self.path.split('/')[-1]: self.path='/index.html'
  super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
profile=tempfile.mkdtemp(prefix='omda-offline-acceptance-')
p=subprocess.Popen(['/usr/bin/google-chrome','--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+profile,'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
 portfile=pathlib.Path(profile)/'DevToolsActivePort'
 for _ in range(100):
  if portfile.exists():break
  time.sleep(.1)
 port=portfile.read_text().splitlines()[0]
 targets=json.load(urllib.request.urlopen('http://127.0.0.1:'+port+'/json'))
 ws=websocket.create_connection(next(t['webSocketDebuggerUrl']for t in targets if t['type']=='page'),timeout=15)
 counter=0
 def cmd(method,params={}):
  global counter
  counter+=1; ident=counter;ws.send(json.dumps({'id':ident,'method':method,'params':params}))
  while True:
   response=json.loads(ws.recv())
   if response.get('id')==ident:
    if 'error'in response:raise RuntimeError(response['error'])
    return response.get('result',{})
 def evaluate(expression):return cmd('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True}).get('result',{}).get('value')
 def wait(expression):
  for _ in range(100):
   if evaluate(expression):return
   time.sleep(.1)
  raise RuntimeError('Readiness check failed: '+expression)
 def screenshot(name):
  data=cmd('Page.captureScreenshot',{'format':'png'})['data'];path=pathlib.Path('/downloads')/name;path.write_bytes(base64.b64decode(data));return str(path)
 cmd('Page.enable');cmd('Network.enable')
 origin='http://127.0.0.1:'+str(server.server_port)
 def click_text(text):
  evaluate('Array.from(document.querySelectorAll("button")).find(x=>x.textContent.trim().startsWith('+json.dumps(text)+')).click()')
 def set_search(value):
  evaluate('(()=>{let i=document.querySelector(".directory-search input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,'+json.dumps(value)+');i.dispatchEvent(new Event("input",{bubbles:true}));})()')
 cmd('Emulation.setDeviceMetricsOverride',{'width':390,'height':710,'deviceScaleFactor':1,'mobile':True})
 cmd('Page.addScriptToEvaluateOnNewDocument',{'source':"const v=new EventTarget();v.height=844;v.offsetTop=0;Object.defineProperty(window,'visualViewport',{value:v});const old=window.setInterval;window.setInterval=(f,n,...a)=>old(f,n===7000?350:n,...a);"})
 def type_into(sel,value):
  evaluate('document.querySelector('+json.dumps(sel)+').scrollIntoView({block:"center",behavior:"instant"})');time.sleep(.2)
  pos=evaluate('(()=>{const e=document.querySelector('+json.dumps(sel)+');let r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()');assert pos['hit'],pos
  cmd('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':pos['x'],'y':pos['y']}]});cmd('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cmd('Input.insertText',{'text':value})
 cmd('Emulation.setDeviceMetricsOverride',{'width':390,'height':710,'deviceScaleFactor':1,'mobile':True})
 cmd('Page.addScriptToEvaluateOnNewDocument',{'source':'Object.hasOwn=undefined;Object.fromEntries=undefined;String.prototype.replaceAll=undefined;Array.prototype.at=undefined;Array.prototype.findLast=undefined;Array.prototype.findLastIndex=undefined;window.structuredClone=undefined;AbortSignal.timeout=undefined;AbortSignal.any=undefined;crypto.randomUUID=undefined;'});
 for route in ['/','/ai','/agents','/profile']:
  cmd('Page.navigate',{'url':origin+route});time.sleep(.8)
  print('OLD_API_RESULT',route,evaluate('({error:document.body.innerText.includes("تعذر عرض هذه الصفحة"),text:document.body.innerText.slice(-300)})'))
  assert not evaluate('document.body.innerText.includes("تعذر عرض هذه الصفحة")'),route
  assert evaluate('typeof Object.hasOwn==="function"&&typeof Object.fromEntries==="function"&&typeof Array.prototype.at==="function"&&typeof Array.prototype.findLast==="function"&&typeof String.prototype.replaceAll==="function"&&typeof structuredClone==="function"&&typeof AbortSignal.timeout==="function"'),route
  if route=='/ai':
   assert evaluate('document.querySelectorAll(".ai-chat-markdown p").length>0')
   assert evaluate('Object.hasOwn({x:1},"x")&&!Object.hasOwn(Object.create({x:1}),"x")&&[1,2].at(-1)===2&&[1,2,3].findLast(x=>x<3)===2&&"a.a".replaceAll(".","-")==="a-a"&&structuredClone(new Map([["k",3]])).get("k")===3')
   assert evaluate('new Promise(resolve=>{const signal=AbortSignal.timeout(5);signal.addEventListener("abort",()=>resolve(signal.aborted));})')
   print('CHAT_SCREEN',screenshot('omda-huawei-hasown-after-chat.png'))
  print('PASS old APIs missing',route)
  if route=='/':
   print('AFTER_SCREEN',screenshot('omda-huawei-js-after-home.png'))
  if evaluate('document.body.innerText.includes("تعذر عرض هذه الصفحة")'):
   print('REPRO_SCREEN',screenshot('omda-huawei-js-before.png'))
finally:
 p.terminate()
 try:p.communicate(timeout=8)
 except subprocess.TimeoutExpired:p.kill();p.communicate()
 server.shutdown()
