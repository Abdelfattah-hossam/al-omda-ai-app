const {app,BrowserWindow,shell,session,dialog}=require('electron');
const path=require('node:path');
const ORIGIN='https://al-omda-ai-app.abdelfattahhossam1.workers.dev';
function internal(value){try{return new URL(value).origin===ORIGIN;}catch{return false;}}
function openExternal(value){try{const u=new URL(value);if(['https:','mailto:','tel:'].includes(u.protocol))void shell.openExternal(u.href);}catch{}}
function createWindow(){
 const win=new BrowserWindow({width:1280,height:900,minWidth:390,minHeight:600,title:'AL OMDA Ai',icon:path.join(__dirname,'icon.png'),backgroundColor:'#100e19',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
 win.webContents.setWindowOpenHandler(({url})=>{if(internal(url))void win.loadURL(url);else openExternal(url);return{action:'deny'};});
 win.webContents.on('will-navigate',(event,url)=>{if(!internal(url)){event.preventDefault();openExternal(url);}});
 win.webContents.on('will-attach-webview',event=>event.preventDefault());
 win.webContents.on('did-fail-load',async(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3){const r=await dialog.showMessageBox(win,{type:'warning',title:'AL OMDA Ai',message:'تعذر الاتصال. تحقق من الإنترنت ثم حاول مرة أخرى.',buttons:['إعادة المحاولة','إغلاق']});if(r.response===0)void win.loadURL(ORIGIN);else win.close();}});
 void win.loadURL(ORIGIN);
}
app.whenReady().then(()=>{
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>{callback(internal(details.requestingUrl||contents.getURL())&&['media','fullscreen','clipboard-sanitized-write'].includes(permission));});
 session.defaultSession.setPermissionCheckHandler((contents,permission,requestingOrigin)=>internal(requestingOrigin||contents?.getURL()||'')&&['media','fullscreen','clipboard-sanitized-write'].includes(permission));
 createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
