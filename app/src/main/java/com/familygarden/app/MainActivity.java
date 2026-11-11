package com.familygarden.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.activity.ComponentActivity;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.Collections;

public class MainActivity extends ComponentActivity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView webView;
    private FrameLayout content;
    private View splash;
    private boolean animationFinished;
    private boolean webReady;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        // WebView must accept HTTPS requests before the client can serve them from the APK.
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new GardenUpload(webView), "HomeGarden");
        webView.addJavascriptInterface(new SplashBridge(), "NativeSplash");
        File characterStorage = new File(getFilesDir(), "characters");
        webView.addJavascriptInterface(new CharacterSync(webView, characterStorage), "NasCharacters");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String path = request.getUrl().getPath();
                if ("https".equals(request.getUrl().getScheme()) && HOST.equals(request.getUrl().getHost())
                        && path != null && path.startsWith("/web/") && !path.contains("..")) {
                    String mime = switch (path.substring(path.lastIndexOf('.') + 1)) {
                        case "html" -> "text/html";
                        case "css" -> "text/css";
                        case "js" -> "text/javascript";
                        case "glb" -> "model/gltf-binary";
                        default -> null;
                    };
                    if (mime != null) {
                        try {
                            if (path.matches("/web/synced/[a-f0-9]{64}\\.glb")) {
                                File file = new File(characterStorage, path.substring("/web/synced/".length()));
                                return new WebResourceResponse(mime, null, new FileInputStream(file));
                            }
                            String encoding = mime.startsWith("text/") ? "UTF-8" : null;
                            return new WebResourceResponse(mime, encoding, getAssets().open(path.substring(1)));
                        } catch (IOException ignored) {
                            // Missing packaged asset.
                        }
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        });
        content = new FrameLayout(this);
        content.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        splash = GardenSplash.create(this, () -> {
            animationFinished = true;
            finishSplash();
        });
        content.addView(splash, new FrameLayout.LayoutParams(-1, -1));
        setContentView(content);
        content.postDelayed(this::removeSplash, 12000);
        webView.loadUrl("https://" + HOST + "/web/index.html");
    }

    public final class SplashBridge {
        @JavascriptInterface
        public void ready() {
            runOnUiThread(() -> {
                webReady = true;
                finishSplash();
            });
        }
    }

    private void finishSplash() {
        if (animationFinished && webReady) removeSplash();
    }

    private void removeSplash() {
        if (splash == null) return;
        content.removeView(splash);
        splash = null;
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }
}
