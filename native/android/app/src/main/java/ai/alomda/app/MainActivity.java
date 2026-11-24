package ai.alomda.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.util.*;

public class MainActivity extends Activity {
 private static final String ORIGIN="https://al-omda-ai-app.abdelfattahhossam1.workers.dev";
 private WebView web;
 private ValueCallback<Uri[]> fileCallback;
 private PermissionRequest pendingMedia;
 private byte[] pendingDownload;
 private boolean internal(String value){try{Uri u=Uri.parse(value);return "https".equals(u.getScheme())&&"al-omda-ai-app.abdelfattahhossam1.workers.dev".equals(u.getHost())&&(u.getPort()==-1||u.getPort()==443);}catch(Exception e){return false;}}
 private void external(String value){try{Uri u=Uri.parse(value);if(Arrays.asList("https","mailto","tel").contains(u.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception e){Toast.makeText(this,"تعذر فتح الرابط",Toast.LENGTH_LONG).show();}}
 @Override public void onCreate(Bundle state){
  super.onCreate(state);web=new WebView(this);setContentView(web);
  if(Build.VERSION.SDK_INT>=35){web.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});}
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setMediaPlaybackRequiresUserGesture(true);s.setSupportMultipleWindows(false);
  CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){String u=req.getUrl().toString();if(internal(u))return false;external(u);return true;}
   @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError error){if(req.isForMainFrame())new AlertDialog.Builder(MainActivity.this).setTitle("Munjizly").setMessage("تعذر الاتصال. التطبيق يحتاج إنترنت. أعد المحاولة.").setPositiveButton("إعادة المحاولة",(d,w)->web.loadUrl(ORIGIN)).setNegativeButton("إغلاق",(d,w)->finish()).show();}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;try{Intent i=params.createIntent();i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,41);return true;}catch(Exception e){fileCallback=null;return false;}}
   @Override public void onPermissionRequest(PermissionRequest request){runOnUiThread(()->{
    if(!internal(request.getOrigin().toString())){request.deny();return;}
    ArrayList<String> needed=new ArrayList<>();for(String r:request.getResources()){if(r.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE)&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)needed.add(Manifest.permission.RECORD_AUDIO);else if(r.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE)&&checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)needed.add(Manifest.permission.CAMERA);}
    if(needed.isEmpty())grantMedia(request);else{if(pendingMedia!=null)pendingMedia.deny();pendingMedia=request;requestPermissions(needed.toArray(new String[0]),42);}
   });}
   @Override public void onPermissionRequestCanceled(PermissionRequest request){if(pendingMedia==request)pendingMedia=null;}
  });
  web.setDownloadListener((url,ua,disposition,mime,length)->{
   if(url.startsWith("blob:"+ORIGIN+"/")){
    String filename=URLUtil.guessFileName(url,disposition,mime);
    String script="(async()=>{try{const r=await fetch("+org.json.JSONObject.quote(url)+");const b=await r.blob();if(b.size>33554432)return JSON.stringify({error:'large'});return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(JSON.stringify({data:String(reader.result).split(',')[1]}));reader.onerror=()=>resolve(JSON.stringify({error:'read'}));reader.readAsDataURL(b);});}catch{return JSON.stringify({error:'read'});}})()";
    // evaluateJavascript does not await promises. Resolve via a short bounded poll, not a native JS bridge.
    String job="omdaDownload"+System.currentTimeMillis();
    web.evaluateJavascript("window["+org.json.JSONObject.quote(job)+"]=null;"+script+".then(x=>window["+org.json.JSONObject.quote(job)+"]=x);",null);
    new Handler(Looper.getMainLooper()).postDelayed(new Runnable(){int attempts=0;public void run(){web.evaluateJavascript("window["+org.json.JSONObject.quote(job)+"]",value->{try{if(value==null||value.equals("null")){if(++attempts<100)new Handler(Looper.getMainLooper()).postDelayed(this,100);return;}String json=new org.json.JSONTokener(value).nextValue().toString();org.json.JSONObject result=new org.json.JSONObject(json);web.evaluateJavascript("delete window["+org.json.JSONObject.quote(job)+"]",null);if(!result.has("data")){Toast.makeText(MainActivity.this,"تعذر حفظ هذا الملف. استخدم المتصفح للملفات الكبيرة.",Toast.LENGTH_LONG).show();return;}pendingDownload=android.util.Base64.decode(result.getString("data"),android.util.Base64.DEFAULT);Intent create=new Intent(Intent.ACTION_CREATE_DOCUMENT);create.addCategory(Intent.CATEGORY_OPENABLE);create.setType(mime==null?"application/octet-stream":mime);create.putExtra(Intent.EXTRA_TITLE,filename);startActivityForResult(create,43);}catch(Exception e){pendingDownload=null;Toast.makeText(MainActivity.this,"تعذر حفظ الملف",Toast.LENGTH_LONG).show();}});}},100);
    return;
   }
   if(!internal(url)){Toast.makeText(this,"استخدم رابط التنزيل المباشر داخل التطبيق",Toast.LENGTH_LONG).show();return;}
   try{android.app.DownloadManager.Request r=new android.app.DownloadManager.Request(Uri.parse(url));String cookie=CookieManager.getInstance().getCookie(url);if(cookie!=null)r.addRequestHeader("Cookie",cookie);r.addRequestHeader("User-Agent",ua);r.setMimeType(mime);r.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,URLUtil.guessFileName(url,disposition,mime));((android.app.DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(r);}catch(Exception e){Toast.makeText(this,"تعذر حفظ الملف. جرب من المتصفح.",Toast.LENGTH_LONG).show();}
  });
  if(state!=null)web.restoreState(state);else web.loadUrl(ORIGIN);
 }
 private void grantMedia(PermissionRequest request){ArrayList<String> granted=new ArrayList<>();for(String r:request.getResources())if((r.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE)&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)||(r.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE)&&checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED))granted.add(r);if(granted.isEmpty())request.deny();else request.grant(granted.toArray(new String[0]));}
 @Override public void onRequestPermissionsResult(int code,String[] perms,int[] results){super.onRequestPermissionsResult(code,perms,results);if(code==42&&pendingMedia!=null){grantMedia(pendingMedia);pendingMedia=null;}}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==43){if(result==RESULT_OK&&data!=null&&data.getData()!=null&&pendingDownload!=null){try(java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(pendingDownload);Toast.makeText(this,"تم حفظ الملف",Toast.LENGTH_LONG).show();}catch(Exception e){Toast.makeText(this,"تعذر حفظ الملف",Toast.LENGTH_LONG).show();}}pendingDownload=null;}if(request==41&&fileCallback!=null){fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));fileCallback=null;}}
 @Override protected void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);web.saveState(out);}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onPause(){super.onPause();web.onPause();CookieManager.getInstance().flush();}
 @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
 @Override protected void onDestroy(){if(fileCallback!=null)fileCallback.onReceiveValue(null);if(pendingMedia!=null)pendingMedia.deny();web.destroy();super.onDestroy();}
}
