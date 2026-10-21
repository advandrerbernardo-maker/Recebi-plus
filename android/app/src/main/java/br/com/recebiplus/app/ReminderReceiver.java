package br.com.recebiplus.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;

public class ReminderReceiver extends BroadcastReceiver {
    static final String PREF = "recebi_reminders_v1";
    static final String KEY = "dates";
    static final String STOPPED = "stopped_v2";
    static final String CHANNEL = "recebi_vencimentos";
    static final String REMIND = "br.com.recebiplus.REMIND";
    static final String STOP = "br.com.recebiplus.STOP";
    static final String TEST_KEY = "recebi-test-notification";
    @Override public void onReceive(Context context, Intent intent) {
        if (intent != null && STOP.equals(intent.getAction())) {
            String key = intent.getStringExtra("key");
            if (key != null && key.length() < 200) {
                if (TEST_KEY.equals(key)) {
                    NotificationManager nm = (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.cancel(TEST_KEY, 1002);
                    return;
                }
                Set<String> stopped = new HashSet<>(context.getSharedPreferences(PREF,0).getStringSet(STOPPED,new HashSet<>()));
                stopped.add(key);
                context.getSharedPreferences(PREF,0).edit().putStringSet(STOPPED,stopped).apply();
                NotificationManager nm = (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) nm.cancel(key,key.hashCode());
            }
            schedule(context);
            return;
        }
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) notifyDue(context);
        schedule(context);
    }
    static boolean showTest(Context context) {
        NotificationManager manager = (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return false;
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Vencimentos do Recebi+",NotificationManager.IMPORTANCE_DEFAULT));
        Intent stop = new Intent(context,ReminderReceiver.class).setAction(STOP)
            .putExtra("key",TEST_KEY).setData(android.net.Uri.parse("recebi://stop/test"));
        PendingIntent stopAction = PendingIntent.getBroadcast(context,1002,stop,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open = PendingIntent.getActivity(context,0,new Intent(context,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder n = Build.VERSION.SDK_INT>=26 ? new Notification.Builder(context,CHANNEL) : new Notification.Builder(context);
        n.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Recebi+ · Teste de notificação")
            .setContentText("Este é um aviso de teste. Nenhuma cobrança foi alterada.")
            .setAutoCancel(true).setContentIntent(open)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Parar aviso",stopAction).build());
        manager.notify(TEST_KEY,1002,n.build());
        return true;
    }
    static void schedule(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar when = Calendar.getInstance();
        when.set(Calendar.HOUR_OF_DAY,9);
        when.set(Calendar.MINUTE,0);
        when.set(Calendar.SECOND,0);
        when.set(Calendar.MILLISECOND,0);
        if (when.getTimeInMillis() <= System.currentTimeMillis()) when.add(Calendar.DATE,1);
        Intent intent = new Intent(context,ReminderReceiver.class).setAction(REMIND);
        PendingIntent pending = PendingIntent.getBroadcast(context,91,intent,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,when.getTimeInMillis(),pending);
    }
    static void notifyDue(Context context) {
        NotificationManager manager = (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Vencimentos do Recebi+",NotificationManager.IMPORTANCE_DEFAULT));
        Set<String> stopped = context.getSharedPreferences(PREF,0).getStringSet(STOPPED,new HashSet<>());
        try {
            JSONArray items = new JSONArray(context.getSharedPreferences(PREF,0).getString(KEY,"[]"));
            LocalDate today = LocalDate.now();
            for (int i=0;i<items.length();i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                String id = item.optString("id");
                String date = item.optString("date");
                if (!id.matches("[0-9a-fA-F-]{36}") || !date.matches("\\d{4}-\\d{2}-\\d{2}")) continue;
                String key = id + "|" + date;
                if (stopped.contains(key)) continue;
                long days = ChronoUnit.DAYS.between(today,LocalDate.parse(date));
                if (days != 3 && days != 1 && days != 0) continue;
                String body = days == 3 ? "Uma parcela vence em 3 dias." : days == 1 ? "Uma parcela vence amanhã." : "Uma parcela vence hoje.";
                Intent stop = new Intent(context,ReminderReceiver.class).setAction(STOP).putExtra("key",key).setData(android.net.Uri.parse("recebi://stop/"+id+"/"+date));
                PendingIntent stopAction = PendingIntent.getBroadcast(context,key.hashCode(),stop,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                PendingIntent open = PendingIntent.getActivity(context,0,new Intent(context,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification.Builder n = Build.VERSION.SDK_INT>=26 ? new Notification.Builder(context,CHANNEL) : new Notification.Builder(context);
                n.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Recebi+ · Vencimento")
                 .setContentText(body).setAutoCancel(true).setContentIntent(open)
                 .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Parar aviso",stopAction).build());
                manager.notify(key,key.hashCode(),n.build());
            }
        } catch (Exception ignored) {}
    }
}
