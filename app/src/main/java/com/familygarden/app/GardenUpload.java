package com.familygarden.app;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

final class GardenUpload {
    private static final int MAX_BYTES = 256 * 1024;
    private final WebView webView;

    GardenUpload(WebView webView) {
        this.webView = webView;
    }

    @JavascriptInterface
    public void send(String address, String key, String payload) {
        String result = upload(address, key, payload);
        webView.post(() -> webView.evaluateJavascript(
            "window.finishGardenUpload?.(" + JSONObject.quote(result) + ")", null));
    }

    private static boolean isPrivateIpv4(String host) {
        if (host == null || !host.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}")) return false;
        String[] octets = host.split("\\.");
        for (String octet : octets) {
            if (Integer.parseInt(octet) > 255 || (octet.length() > 1 && octet.startsWith("0"))) return false;
        }
        int a = Integer.parseInt(octets[0]);
        int b = Integer.parseInt(octets[1]);
        return a == 10 || (a == 192 && b == 168) || (a == 172 && b >= 16 && b <= 31);
    }

    private static String upload(String address, String key, String payload) {
        if (address == null || key == null || payload == null) return "address";
        if (!key.matches("[A-Za-z0-9_-]{16,128}")) return "denied";
        byte[] data = payload.getBytes(StandardCharsets.UTF_8);
        if (data.length > MAX_BYTES) return "size";
        HttpURLConnection connection = null;
        try {
            URI base = URI.create(address);
            if (!"http".equals(base.getScheme()) || !isPrivateIpv4(base.getHost())
                    || base.getUserInfo() != null || base.getQuery() != null || base.getFragment() != null
                    || base.getPort() == 0 || base.getPort() > 65535
                    || !(base.getPath().isEmpty() || "/".equals(base.getPath()))) return "address";
            connection = (HttpURLConnection) base.resolve("/api/drawings").toURL().openConnection(Proxy.NO_PROXY);
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(6000);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Authorization", "Bearer " + key);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(data.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(data);
            }
            return switch (connection.getResponseCode()) {
                case 200, 201 -> "ok";
                case 401, 403 -> "denied";
                case 413 -> "size";
                default -> "failed";
            };
        } catch (IllegalArgumentException ignored) {
            return "address";
        } catch (IOException ignored) {
            return "failed";
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
