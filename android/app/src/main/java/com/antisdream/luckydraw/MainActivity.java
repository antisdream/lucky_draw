package com.antisdream.luckydraw;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.RenderProcessGoneDetail;
import android.widget.Toast;
import android.widget.FrameLayout;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowInsetsControllerCompat;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import org.json.JSONObject;

public class MainActivity extends ComponentActivity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String PAGE = ORIGIN + "/assets/index.html";
    private static final String GITHUB = "https://github.com/antisdream";
    private static final int OPEN_FILE = 41, SAVE_FILE = 42;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingText;
    private JavaScriptReplyProxy saveReply;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(248,248,245));
        FrameLayout content = new FrameLayout(this);
        content.setBackgroundColor(Color.rgb(248,248,245));
        content.addView(web,new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(content);
        WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(getWindow(),content);
        bars.setAppearanceLightStatusBars(true);
        bars.setAppearanceLightNavigationBars(true);
        content.setOnApplyWindowInsetsListener((view,insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safeArea = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safeArea.left,safeArea.top,safeArea.right,safeArea.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        content.requestApplyInsets();
        WebSettings settings = web.getSettings();
        enableBundledGameScript(settings);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Only user-selected documents through the system picker.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (PAGE.equals(request.getUrl().toString())) {
                    WebResourceResponse response = assets.shouldInterceptRequest(request.getUrl());
                    if(response != null) return response;
                }
                return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",null,new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url=request.getUrl();
                if(request.isForMainFrame() && request.hasGesture()
                        && (GITHUB.equals(url.toString()) || (GITHUB+"/").equals(url.toString()))) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW,url).addCategory(Intent.CATEGORY_BROWSABLE));
                    } catch(ActivityNotFoundException error) { notice("웹 브라우저를 찾지 못했어요."); }
                    return true;
                }
                return !("https".equals(url.getScheme()) && "appassets.androidplatform.net".equals(url.getHost()) && "/assets/index.html".equals(url.getPath()) && url.getQuery()==null);
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if(view.getParent() instanceof ViewGroup) ((ViewGroup)view.getParent()).removeView(view);
                view.destroy();web=null;
                new AlertDialog.Builder(MainActivity.this).setTitle("게임 화면을 다시 열어주세요")
                    .setMessage("화면 실행이 중단됐어요. 기기에 저장한 후보와 결과는 다시 불러올 수 있어요. 저장하지 않은 변경은 사라질 수 있습니다.")
                    .setPositiveButton("다시 열기",(dialog,which)->recreate())
                    .setNegativeButton("닫기",(dialog,which)->finish()).setCancelable(false).show();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if(fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try { startActivityForResult(intent, OPEN_FILE); }
                catch(Exception error) { fileCallback.onReceiveValue(null); fileCallback=null; notice("파일 선택 앱을 열 수 없어요."); }
                return true;
            }
        });
        if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web,"LuckyFiles",Collections.singleton(ORIGIN),(view,message,origin,isMainFrame,reply) -> {
                if(!isMainFrame || !ORIGIN.equals(origin.toString())) return;
                try {
                    JSONObject data = new JSONObject(message.getData());
                    String name=data.getString("name"), type=data.getString("type"), text=data.getString("text");
                    boolean html="lucky_draw.html".equals(name) && "text/html".equals(type);
                    boolean csv="lucky-draw-results.csv".equals(name) && "text/csv".equals(type);
                    if(!html && !csv) throw new IllegalArgumentException();
                    if(pendingText != null) { reply.postMessage("저장 창에서 먼저 완료하거나 취소해주세요."); return; }
                    pendingText=text;saveReply=reply;
                    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType(type).putExtra(Intent.EXTRA_TITLE,name);
                    startActivityForResult(intent,SAVE_FILE);
                } catch(Exception error) { pendingText=null;saveReply=null;reply.postMessage("파일 저장을 시작하지 못했어요."); }
            });
        }
        // Debugging is limited to this local test APK; release builds keep it disabled.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { handleBack(); }
        });
        web.loadUrl(PAGE);
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(request==OPEN_FILE && fileCallback!=null) {
            fileCallback.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);
            fileCallback=null;
        }
        if(request==SAVE_FILE) {
            String message="저장을 취소했어요.";
            try {
                if(result==RESULT_OK&&data!=null&&data.getData()!=null&&pendingText!=null) {
                    try(OutputStream output=getContentResolver().openOutputStream(data.getData(),"wt")) {
                        if(output==null)throw new IllegalStateException();
                        output.write(pendingText.getBytes(StandardCharsets.UTF_8));
                    }
                    message="파일 저장 완료. 선택한 폴더에서 확인해주세요.";
                }
            } catch(Exception error) { message="파일을 저장하지 못했어요. 저장 공간을 확인해주세요."; }
            pendingText=null;
            if(saveReply!=null && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){saveReply.postMessage(message);saveReply=null;}else notice(message);
        }
    }
    private void notice(String text) { Toast.makeText(this,text,Toast.LENGTH_LONG).show(); }
    // Required by the game. Only the bundled, whitelisted asset can navigate in this WebView;
    // imported HTML is parsed as JSON data by the game and never loaded as a document.
    @SuppressLint("SetJavaScriptEnabled")
    private void enableBundledGameScript(WebSettings settings) { settings.setJavaScriptEnabled(true); }
    private void handleBack() {
        if(web==null){finish();return;}
        web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true}const c=document.getElementById('cancel-button');if(c&&!document.getElementById('run-actions').hidden){c.click();return true}const b=document.getElementById('back-button');if(b&&!document.getElementById('play-view').hidden){b.click();return true}return false})()",value->{if(!"true".equals(value))finish();});
    }
    @Override protected void onDestroy() {
        if(fileCallback!=null)fileCallback.onReceiveValue(null);
        if(web!=null)web.destroy();super.onDestroy();
    }
}
