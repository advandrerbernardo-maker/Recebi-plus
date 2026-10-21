package br.com.recebiplus.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONArray;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Calendar;

public class ReminderReceiver extends BroadcastReceiver {
    static final String PREF = "recebi_reminders_v1";
    static final String KEY = "dates";
    static final String CHANNEL = "recebi_vencimentos";
    @Override public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            try {
                JSONArray dates = new JSONArray(context.getSharedPreferences(PREF, 0).getString(KEY, "[]"));
                LocalDate today = LocalDate.now();
                int todayCount = 0, tomorrowCount = 0;
                for (int i=0; i<dates.length(); i++) {
                    String due = dates.optString(i);
                    if (due.equals(today.toString())) todayCount++;
                    if (due.equals(today.plusDays(1).toString())) tomorrowCount++;
                }
                if (todayCount+tomorrowCount > 0) show(context,todayCount,tomorrowCount);
            } catch (Exception ignored) {}
        }
        schedule(context);
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
        Intent intent = new Intent(context,ReminderReceiver.class).setAction("br.com.recebiplus.REMIND");
        PendingIntent pending = PendingIntent.getBroadcast(context,91,intent,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,when.getTimeInMillis(),pending);
    }
    static void show(Context context,int today,int tomorrow) {
        NotificationManager manager = (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Vencimentos do Recebi+",NotificationManager.IMPORTANCE_DEFAULT));
        String body = (today>0 ? today+" vencimento(s) hoje" : "") + (today>0 && tomorrow>0 ? " · " : "") + (tomorrow>0 ? tomorrow+" vencimento(s) amanhã" : "");
        PendingIntent open = PendingIntent.getActivity(context,0,new Intent(context,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification.Builder n = Build.VERSION.SDK_INT>=26 ? new android.app.Notification.Builder(context,CHANNEL) : new android.app.Notification.Builder(context);
        n.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Recebi+ · Vencimentos").setContentText(body).setStyle(new android.app.Notification.BigTextStyle().bigText(body)).setAutoCancel(true).setContentIntent(open);
        manager.notify(91,n.build());
    }
}
