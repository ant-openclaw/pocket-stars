package app.pocketstars;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.widget.FrameLayout;
import android.util.AtomicFile;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** Network-free asset-only shell; balances and PIN verifiers stay in app-private storage. */
public final class MainActivity extends Activity {
    private WebView web;
    private View idleOverlay;
    private final IdlePolicy idle = new IdlePolicy();
    private final Handler idleHandler = new Handler(Looper.getMainLooper());
    private boolean resumed;
    private final Runnable idleCheck = () -> {
        if (!resumed) return;
        if (idle.expire(SystemClock.uptimeMillis())) {
            // Cancel a held web gesture before covering the app, so no stale UP can act.
            long now = SystemClock.uptimeMillis();
            MotionEvent cancel = MotionEvent.obtain(now, now, MotionEvent.ACTION_CANCEL, 0f, 0f, 0);
            web.dispatchTouchEvent(cancel);
            cancel.recycle();
            lockParent();
            showIdle(true);
        } else if (!idle.isIdle()) scheduleIdle();
    };
    private String pendingExport;
    private static final int EXPORT_REQUEST = 14;
    private static final String HOME = "file:///android_asset/index.html";

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(250,247,240));
        getWindow().setNavigationBarColor(Color.rgb(250,247,240));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        web = new WebView(this);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setTextZoom(100);
        web.addJavascriptInterface(new LocalBridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return !isLocal(req.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !isLocal(Uri.parse(url));
            }
        });
        FrameLayout content = new FrameLayout(this);
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));
        idleOverlay = new View(this);
        idleOverlay.setBackgroundColor(Color.BLACK);
        idleOverlay.setVisibility(View.GONE);
        idleOverlay.setClickable(true);
        content.addView(idleOverlay, new FrameLayout.LayoutParams(-1, -1));
        setContentView(content);
        web.loadUrl(HOME);
    }

    private static boolean isLocal(Uri uri) {
        return "file".equals(uri.getScheme()) && uri.toString().startsWith("file:///android_asset/");
    }

    private void lockParent() {
        if(web != null) web.evaluateJavascript("if(window.PocketStarsApp && window.PocketStarsApp.lock) window.PocketStarsApp.lock(); document.dispatchEvent(new Event('pocketstars-background'));", null);
    }

    private void scheduleIdle() {
        idleHandler.removeCallbacks(idleCheck);
        if (resumed && !idle.isIdle()) idleHandler.postDelayed(idleCheck, idle.remaining(SystemClock.uptimeMillis()));
    }

    private void showIdle(boolean black) {
        if (idleOverlay == null) return;
        idleOverlay.setVisibility(black ? View.VISIBLE : View.GONE);
        if (black) {
            android.view.inputmethod.InputMethodManager keyboard =
                (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (keyboard != null) keyboard.hideSoftInputFromWindow(web.getWindowToken(), 0);
            web.clearFocus();
        }
        web.setVisibility(black ? View.INVISIBLE : View.VISIBLE);
        web.setImportantForAccessibility(black ? View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS : View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        WindowManager.LayoutParams params = getWindow().getAttributes();
        params.screenBrightness = black ? 0f : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
        getWindow().setAttributes(params);
        getWindow().setStatusBarColor(black ? Color.BLACK : Color.rgb(250,247,240));
        getWindow().setNavigationBarColor(black ? Color.BLACK : Color.rgb(250,247,240));
        getWindow().getDecorView().setSystemUiVisibility(black
            ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        idle.resume(SystemClock.uptimeMillis());
        showIdle(false);
        scheduleIdle();
    }

    @Override protected void onPause() {
        resumed = false;
        idleHandler.removeCallbacks(idleCheck);
        showIdle(false);
        lockParent();
        super.onPause();
    }

    @Override public void onUserInteraction() {
        super.onUserInteraction();
        idle.interaction(SystemClock.uptimeMillis());
        scheduleIdle();
    }

    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        int action = event.getActionMasked();
        boolean wasIdle = idle.isIdle();
        boolean consumed = idle.touch(SystemClock.uptimeMillis(), action == MotionEvent.ACTION_DOWN,
            action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL);
        if (wasIdle && !idle.isIdle()) showIdle(false);
        scheduleIdle();
        // Do not call super for ANY part of the wake gesture, even after revealing web.
        return consumed || super.dispatchTouchEvent(event);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        return idle.isIdle() || super.dispatchKeyEvent(event);
    }

    @Override public void onBackPressed() {
        if (idle.isIdle()) return;
        if(web != null) web.evaluateJavascript("if(window.PocketStarsApp && window.PocketStarsApp.back) window.PocketStarsApp.back(); else window.dispatchEvent(new Event('pocketstars-back'));", null);
    }

    private synchronized String read(String name) {
        AtomicFile f = new AtomicFile(new File(getFilesDir(), name));
        if(!f.getBaseFile().exists() && !new File(f.getBaseFile()+".bak").exists()) return "";
        try(FileInputStream in=f.openRead(); ByteArrayOutputStream out=new ByteArrayOutputStream()) {
            byte[] b=new byte[8192]; int n;
            while((n=in.read(b))!=-1) {
                if(out.size()+n>StorageBytes.MAX_BYTES) throw new java.io.IOException("Oversized data");
                out.write(b,0,n);
            }
            String json=new String(out.toByteArray(),StandardCharsets.UTF_8);
            new JSONObject(json);
            return json;
        } catch(Exception e) {
            // Never turn an IO/corruption error into a fresh empty account.
            return "STORAGE_ERROR: Cannot read "+name+". Keep app data intact.";
        }
    }

    private synchronized boolean write(String name,String json) {
        AtomicFile f=new AtomicFile(new File(getFilesDir(),name));
        FileOutputStream out=null;
        try {
            byte[] bytes=StorageBytes.encodeChecked(json);
            new JSONObject(json);
            out=f.startWrite();
            out.write(bytes);
            out.getFD().sync();
            f.finishWrite(out);
            return true;
        } catch(Exception e) {
            if(out!=null) f.failWrite(out);
            return false;
        }
    }

    public final class LocalBridge {
        @JavascriptInterface public String loadData() { return read("ledger.json"); }
        @JavascriptInterface public boolean saveData(String json) { return write("ledger.json",json); }
        @JavascriptInterface public String loadPin() { return read("parent-pin.json"); }
        @JavascriptInterface public boolean savePin(String json) {
            try {
                JSONObject r=new JSONObject(json);
                if(!r.getString("salt").matches("[a-f0-9]{32}") || !r.getString("hash").matches("[a-f0-9]{64}")) return false;
                if(json.length()>4096) return false;
                return write("parent-pin.json",json);
            } catch(Exception e) { return false; }
        }
        @JavascriptInterface public String derivePin(String pin,String salt) {
            if(pin==null||salt==null||!pin.matches("[0-9]{4,8}")||!salt.matches("[a-f0-9]{32}")) return "";
            char[] chars=pin.toCharArray(); PBEKeySpec spec=null;
            try {
                byte[] bytes=new byte[16];
                for(int i=0;i<16;i++)bytes[i]=(byte)Integer.parseInt(salt.substring(i*2,i*2+2),16);
                spec=new PBEKeySpec(chars,bytes,120000,256);
                byte[] result=SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
                StringBuilder hex=new StringBuilder();
                for(byte b:result)hex.append(String.format(Locale.ROOT,"%02x",b&255));
                Arrays.fill(result,(byte)0);
                return hex.toString();
            } catch(Exception e) { return ""; }
            finally {Arrays.fill(chars,'\0');if(spec!=null)spec.clearPassword();}
        }
        @JavascriptInterface public void exportBackup(String json) {
            try { new JSONObject(json); StorageBytes.encodeChecked(json); }
            catch(Exception e) { return; }
            runOnUiThread(() -> {
                pendingExport=json;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE,"PocketStars-backup-"+new SimpleDateFormat("yyyy-MM-dd",Locale.UK).format(new Date())+".json");
                startActivityForResult(intent,EXPORT_REQUEST);
            });
        }
    }

    @Override protected void onActivityResult(int request,int result,Intent intent) {
        super.onActivityResult(request,result,intent);
        if(request!=EXPORT_REQUEST)return;
        String json=pendingExport;pendingExport=null;
        if(result!=RESULT_OK||intent==null||intent.getData()==null||json==null)return;
        try(OutputStream out=getContentResolver().openOutputStream(intent.getData(),"wt")) {
            if(out==null)throw new java.io.IOException("No output stream");
            out.write(StorageBytes.encodeChecked(json));out.flush();
            Toast.makeText(this,"Backup saved",Toast.LENGTH_LONG).show();
        } catch(Exception e) {Toast.makeText(this,"Backup could not be saved. Try another location.",Toast.LENGTH_LONG).show();}
    }
}
