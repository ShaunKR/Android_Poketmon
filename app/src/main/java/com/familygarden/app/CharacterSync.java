package com.familygarden.app;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class CharacterSync {
    private static final int MAX_MANIFEST = 128 * 1024;
    private static final int MAX_MODEL = 32 * 1024 * 1024;
    private static final int MAX_TOTAL = 192 * 1024 * 1024;
    private final WebView webView;
    private final File storage;

    CharacterSync(WebView webView, File storage) {
        this.webView = webView;
        this.storage = storage;
    }

    @JavascriptInterface
    public void sync(String address) {
        String response;
        try {
            response = synchronize(address).toString();
        } catch (IOException | JSONException | URISyntaxException | NoSuchAlgorithmException
                | IllegalArgumentException error) {
            response = "null";
        }
        String json = response;
        webView.post(() -> webView.evaluateJavascript(
            "window.finishCharacterSync?.(JSON.parse(" + JSONObject.quote(json) + "))", null));
    }

    private JSONArray synchronize(String address)
            throws IOException, JSONException, URISyntaxException, NoSuchAlgorithmException {
        URI folder = URI.create(address.endsWith("/") ? address : address + "/");
        if (!("http".equals(folder.getScheme()) || "https".equals(folder.getScheme()))
                || !GardenUpload.isPrivateIpv4(folder.getHost()) || folder.getUserInfo() != null
                || folder.getQuery() != null || folder.getFragment() != null
                || folder.getPort() == 0 || folder.getPort() > 65535) throw new IllegalArgumentException();
        if (!storage.isDirectory() && !storage.mkdirs()) throw new IOException("Cannot create character storage");
        JSONObject manifest = new JSONObject(readManifest(folder.resolve("characters.json")));
        JSONArray entries = manifest.getJSONArray("characters");
        if (entries.length() > 50) throw new IOException("Too many characters");
        JSONArray result = new JSONArray();
        java.util.Set<String> ids = new java.util.HashSet<>();
        int remaining = MAX_TOTAL;
        for (int index = 0; index < entries.length(); index++) {
            JSONObject entry = entries.getJSONObject(index);
            String id = entry.getString("id");
            String name = entry.getString("name").trim();
            String file = entry.getString("file");
            if (!id.matches("[a-z0-9][a-z0-9_-]{0,47}") || !ids.add(id)
                    || name.isEmpty() || name.length() > 60
                    || !file.matches("[\\p{L}\\p{N} _.-]{1,100}\\.glb")) throw new IOException("Invalid character");
            URI url = folder.resolve(new URI(null, null, file, null));
            File temporary = File.createTempFile("sync-", ".tmp", storage);
            try {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                int length = downloadModel(url, temporary, Math.min(remaining, MAX_MODEL), digest);
                remaining -= length;
                StringBuilder hash = new StringBuilder(64);
                for (byte value : digest.digest()) {
                    int unsigned = value & 0xff;
                    hash.append(Character.forDigit(unsigned >>> 4, 16));
                    hash.append(Character.forDigit(unsigned & 15, 16));
                }
                File destination = new File(storage, hash + ".glb");
                if (!destination.isFile()) {
                    Files.move(temporary.toPath(), destination.toPath(), StandardCopyOption.ATOMIC_MOVE);
                }
                result.put(new JSONObject().put("id", "nas-" + id).put("name", name).put("hash", hash.toString()));
            } finally {
                Files.deleteIfExists(temporary.toPath());
            }
        }
        return result;
    }

    private static HttpURLConnection connect(URI uri) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) URI.create(uri.toASCIIString()).toURL().openConnection(Proxy.NO_PROXY);
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(10000);
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setRequestProperty("Cache-Control", "no-cache");
        return connection;
    }

    private static String readManifest(URI uri) throws IOException {
        HttpURLConnection connection = connect(uri);
        try {
            if (connection.getResponseCode() != 200) throw new IOException("Manifest unavailable");
            try (InputStream input = connection.getInputStream();
                    ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > MAX_MANIFEST) throw new IOException("Manifest too large");
                    output.write(buffer, 0, count);
                }
                return new String(output.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static int downloadModel(URI uri, File file, int limit, MessageDigest digest) throws IOException {
        HttpURLConnection connection = connect(uri);
        try {
            if (connection.getResponseCode() != 200 || connection.getContentLengthLong() > limit) {
                throw new IOException("Model unavailable or too large");
            }
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(file)) {
                byte[] header = new byte[12];
                new java.io.DataInputStream(input).readFully(header);
                ByteBuffer glb = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
                if (glb.getInt() != 0x46546C67 || glb.getInt() != 2) throw new IOException("Invalid GLB header");
                int length = glb.getInt();
                if (length < 20 || length > limit) throw new IOException("Invalid GLB size");
                output.write(header);
                digest.update(header);
                byte[] buffer = new byte[32768];
                int total = header.length;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > length) throw new IOException("Invalid GLB size");
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                }
                if (total != length) throw new IOException("Incomplete GLB");
                return total;
            }
        } finally {
            connection.disconnect();
        }
    }
}
