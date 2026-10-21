package br.com.recebiplus.app;

import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.JavascriptInterface;
import org.json.JSONArray;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String HOME = "https://advandrerbernardo-maker.github.io/Recebi-plus/";
    private WebView web;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(16,43,60));
        getWindow().setNavigationBarColor(Color.BLACK);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(239,245,246));
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public void updateDates(String json) {
                runOnUiThread(() -> {
                    String current = web.getUrl();
                    if (current == null || !current.startsWith(HOME) || json == null || json.length() > 250000) return;
                    try {
                        JSONArray input = new JSONArray(json);
                        if (input.length() > 10000) return;
                        JSONArray valid = new JSONArray();
                        for (int i=0; i<input.length(); i++) {
                            org.json.JSONObject item = input.optJSONObject(i);
                            if (item != null && item.optString("id").matches("[0-9a-fA-F-]{36}") && item.optString("date").matches("\\d{4}-\\d{2}-\\d{2}")) valid.put(item);
                        }
                        getSharedPreferences(ReminderReceiver.PREF,0).edit().putString(ReminderReceiver.KEY,valid.toString()).apply();
                        ReminderReceiver.schedule(MainActivity.this);
                    } catch (Exception ignored) {}
                });
            }
        }, "RecebiAndroid");
        ReminderReceiver.schedule(this);
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},101);
        }
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                String host = uri.getHost();
                if (("https".equals(scheme) && host != null &&
                    (host.equals("advandrerbernardo-maker.github.io") ||
                     host.equals("ytdantnjhegdvzwhgjcu.supabase.co")))) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ex) {
                    Toast.makeText(MainActivity.this, "Não foi possível abrir o link.", Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });
        if (state == null) web.loadUrl(HOME);
        else web.restoreState(state);
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        web.saveState(out);
        super.onSaveInstanceState(out);
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
