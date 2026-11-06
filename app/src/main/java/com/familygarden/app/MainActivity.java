package com.familygarden.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Collections;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView webView;

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
        setContentView(webView);
        webView.loadUrl("https://" + HOST + "/web/index.html");
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
