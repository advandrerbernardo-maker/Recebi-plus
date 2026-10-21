package br.com.recebiplus.app;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
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
            @JavascriptInterface public String getReminderNotificationSettings(String id) {
                if(id==null || !id.matches("[0-9a-fA-F-]{36}"))return "{}";
                return ReminderReceiver.settingsFor(MainActivity.this,id).toString();
            }
            @JavascriptInterface public void saveReminderNotificationSettings(String id,String json) {
                runOnUiThread(()->{
                    String url=web.getUrl();
                    if(url==null||!url.startsWith(HOME)||json==null||json.length()>1000)return;
                    try {
                        if(ReminderReceiver.saveReminderSettings(MainActivity.this,id,new org.json.JSONObject(json)))
                            Toast.makeText(MainActivity.this,"Avisos deste lembrete salvos.",Toast.LENGTH_SHORT).show();
                    }catch(Exception ignored){}
                });
            }
            @JavascriptInterface public String getNotificationSettings() {
                android.content.SharedPreferences p = getSharedPreferences(ReminderReceiver.PREF,0);
                org.json.JSONObject obj = new org.json.JSONObject();
                try {
                    obj.put("hour",p.getInt(ReminderReceiver.HOUR,9));
                    obj.put("minute",p.getInt(ReminderReceiver.MINUTE,0));
                    obj.put("three",p.getBoolean(ReminderReceiver.THREE,true));
                    obj.put("eve",p.getBoolean(ReminderReceiver.EVE,true));
                    obj.put("today",p.getBoolean(ReminderReceiver.TODAY,true));
                } catch (Exception ignored) {}
                return obj.toString();
            }
            @JavascriptInterface public void saveNotificationSettings(String json) {
                runOnUiThread(() -> {
                    String url = web.getUrl();
                    if (url == null || !url.startsWith(HOME) || json == null || json.length() > 1000) return;
                    try {
                        org.json.JSONObject obj = new org.json.JSONObject(json);
                        int hour = obj.getInt("hour"), minute = obj.getInt("minute");
                        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return;
                        ReminderReceiver.saveSettings(MainActivity.this,hour,minute,
                            obj.getBoolean("three"),obj.getBoolean("eve"),obj.getBoolean("today"));
                        Toast.makeText(MainActivity.this,"Horário dos avisos salvo no Android.",Toast.LENGTH_SHORT).show();
                    } catch (Exception ignored) {}
                });
            }
            @JavascriptInterface public void testNotification() {
                runOnUiThread(() -> {
                    String url = web.getUrl();
                    if (url == null || !url.startsWith(HOME)) return;
                    boolean ok = ReminderReceiver.showTest(MainActivity.this);
                    Toast.makeText(MainActivity.this,
                        ok ? "Notificação de teste enviada. Veja a barra de notificações." : "Autorize notificações nas configurações do Android.",
                        Toast.LENGTH_LONG).show();
                });
            }
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
        // Registre o canal antes de solicitar permissão: o Android então
        // reconhece que o aplicativo efetivamente pode emitir notificações.
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager notifications = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (notifications != null) {
                NotificationChannel channel = new NotificationChannel(
                    ReminderReceiver.CHANNEL, "Vencimentos do Recebi+",
                    NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("Lembretes de parcelas 3 dias antes, na véspera e no vencimento.");
                notifications.createNotificationChannel(channel);
            }
        }
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
