package com.getaigist.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.TimeUnit;

import android.util.Base64;

import okhttp3.Credentials;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.Headers;

/**
 * 自定义 Capacitor 插件，使用 OkHttp 执行 WebDAV 请求
 * OkHttp 支持任意 HTTP 方法（包括 PROPFIND、MKCOL），无 HttpURLConnection 的白名单限制
 * 原生层发出请求，不受 CORS 策略限制
 */
@CapacitorPlugin(name = "WebDav")
public class WebDavPlugin extends Plugin {

    private static final String PROPFIND_BODY =
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
        "<D:propfind xmlns:D=\"DAV:\">" +
        "  <D:prop>" +
        "    <D:displayname/>" +
        "    <D:getcontentlength/>" +
        "    <D:getlastmodified/>" +
        "    <D:getetag/>" +
        "    <D:resourcetype/>" +
        "  </D:prop>" +
        "</D:propfind>";

    private OkHttpClient createClient(long connectTimeoutMs, long readTimeoutMs) {
        return new OkHttpClient.Builder()
            .connectTimeout(connectTimeoutMs, TimeUnit.MILLISECONDS)
            .readTimeout(readTimeoutMs, TimeUnit.MILLISECONDS)
            .writeTimeout(readTimeoutMs, TimeUnit.MILLISECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .build();
    }

    /**
     * 执行 WebDAV PROPFIND 请求，返回目录内容 XML
     * 参数：url, username, password, depth (默认 1)
     */
    @PluginMethod
    public void propfind(final PluginCall call) {
        final String url = call.getString("url");
        final String username = call.getString("username", "");
        final String password = call.getString("password", "");
        final int depth = call.getInt("depth", 1);
        final long connectTimeout = call.getInt("connectTimeout", 30000);
        final long readTimeout = call.getInt("readTimeout", 30000);

        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        getBridge().execute(() -> {
            try {
                Request.Builder builder = new Request.Builder()
                    .url(url)
                    .header("Depth", String.valueOf(depth))
                    .header("Content-Type", "application/xml; charset=utf-8")
                    .method("PROPFIND", RequestBody.create(
                        PROPFIND_BODY.getBytes("UTF-8"),
                        MediaType.parse("application/xml; charset=utf-8")
                    ));

                if (username != null && !username.isEmpty()) {
                    builder.header(
                        "Authorization",
                        Credentials.basic(username, password != null ? password : "", StandardCharsets.UTF_8)
                    );
                }

                try (Response response = createClient(connectTimeout, readTimeout).newCall(builder.build()).execute()) {
                    JSObject result = new JSObject();
                    result.put("status", response.code());
                    result.put("body", response.body() != null ? response.body().string() : "");
                    call.resolve(result);
                }
            } catch (IOException e) {
                call.reject("PROPFIND 请求失败: " + e.getMessage(), e);
            } catch (Exception e) {
                call.reject("WebDAV 错误: " + e.getMessage(), e);
            }
        });
    }

    /**
     * 执行通用 WebDAV 请求（GET、PUT、DELETE、MKCOL 等）
     * 参数：url, method, username, password, body（可选）, contentType（可选）
     */
    @PluginMethod
    public void request(final PluginCall call) {
        final String url = call.getString("url");
        final String method = call.getString("method", "GET");
        final String username = call.getString("username", "");
        final String password = call.getString("password", "");
        final String body = call.getString("body", "");
        final String bodyBase64 = call.getString("bodyBase64");
        final String contentType = call.getString("contentType", "application/octet-stream");
        final String responseType = call.getString("responseType", "text");
        final long connectTimeout = call.getInt("connectTimeout", 30000);
        final long readTimeout = call.getInt("readTimeout", 30000);

        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        getBridge().execute(() -> {
            try {
                RequestBody reqBody = null;
                if (bodyBase64 != null) {
                    reqBody = RequestBody.create(
                        Base64.decode(bodyBase64, Base64.DEFAULT),
                        MediaType.parse(contentType)
                    );
                } else if (body != null && !body.isEmpty()) {
                    reqBody = RequestBody.create(
                        body.getBytes("UTF-8"),
                        MediaType.parse(contentType)
                    );
                } else if ("PUT".equals(method) || "MKCOL".equals(method) || "POST".equals(method)) {
                    // 这些方法需要 body，即使是空的
                    reqBody = RequestBody.create(new byte[0], MediaType.parse(contentType));
                }

                Request.Builder builder = new Request.Builder()
                    .url(url)
                    .method(method, reqBody);

                if (username != null && !username.isEmpty()) {
                    builder.header(
                        "Authorization",
                        Credentials.basic(username, password != null ? password : "", StandardCharsets.UTF_8)
                    );
                }

                JSObject requestHeaders = call.getObject("headers");
                if (requestHeaders != null) {
                    Iterator<String> keys = requestHeaders.keys();
                    while (keys.hasNext()) {
                        String name = keys.next();
                        String value = requestHeaders.optString(name, null);
                        if (value != null) {
                            builder.header(name, value);
                        }
                    }
                }

                try (Response response = createClient(connectTimeout, readTimeout).newCall(builder.build()).execute()) {
                    JSObject result = new JSObject();
                    result.put("status", response.code());
                    byte[] responseBytes = response.body() != null ? response.body().bytes() : new byte[0];
                    result.put("body", "base64".equals(responseType)
                        ? Base64.encodeToString(responseBytes, Base64.NO_WRAP)
                        : new String(responseBytes, StandardCharsets.UTF_8));
                    JSObject responseHeaders = new JSObject();
                    Headers headers = response.headers();
                    for (String name : headers.names()) {
                        responseHeaders.put(name, headers.get(name));
                    }
                    result.put("headers", responseHeaders);
                    call.resolve(result);
                }
            } catch (IOException e) {
                call.reject(method + " 请求失败: " + e.getMessage(), e);
            } catch (Exception e) {
                call.reject("WebDAV 错误: " + e.getMessage(), e);
            }
        });
    }
}
