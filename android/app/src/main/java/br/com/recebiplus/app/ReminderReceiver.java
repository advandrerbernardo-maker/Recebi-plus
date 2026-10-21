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
    static final String HOUR = "notification_hour";
    static final String MINUTE = "notification_minute";
    static final String THREE = "notify_three_days";
    static final String EVE = "notify_one_day";
    static final String TODAY = "notify_due_day";
    static final String OVERRIDES = "per_reminder_settings_v1";
    static final String SENT = "sent_reminders_v1";
    static JSONObject settingsFor(Context context,String id) {
        try {
            JSONObject all = new JSONObject(context.getSharedPreferences(PREF,0).getString(OVERRIDES,"{}"));
            JSONObject p = all.optJSONObject(id);
            if (p != null) return p;
        } catch (Exception ignored) {}
        android.content.SharedPreferences prefs=context.getSharedPreferences(PREF,0);
        JSONObject defaults=new JSONObject();
        try {
            defaults.put("hour",prefs.getInt(HOUR,9)); defaults.put("minute",prefs.getInt(MINUTE,0));
            defaults.put("three",prefs.getBoolean(THREE,true)); defaults.put("eve",prefs.getBoolean(EVE,true)); defaults.put("today",prefs.getBoolean(TODAY,true));
        } catch (Exception ignored) {}
        return defaults;
    }
    static boolean saveReminderSettings(Context context,String id,JSONObject p) {
        if (id == null || !id.matches("[0-9a-fA-F-]{36}")) return false;
        int hour=p.optInt("hour",-1),minute=p.optInt("minute",-1);
        if (hour<0||hour>23||minute<0||minute>59) return false;
        try {
            JSONObject all=new JSONObject(context.getSharedPreferences(PREF,0).getString(OVERRIDES,"{}"));
            JSONObject normalized=new JSONObject();
            normalized.put("hour",hour);normalized.put("minute",minute);
            normalized.put("three",p.optBoolean("three",true));
            normalized.put("eve",p.optBoolean("eve",true));
            normalized.put("today",p.optBoolean("today",true));
            all.put(id,normalized);
            context.getSharedPreferences(PREF,0).edit().putString(OVERRIDES,all.toString()).apply();
            schedule(context);
            return true;
        }catch(Exception ignored){return false;}
    }
    static void saveSettings(Context context, int hour, int minute, boolean three, boolean eve, boolean today) {
        context.getSharedPreferences(PREF,0).edit()
            .putInt(HOUR,hour).putInt(MINUTE,minute)
            .putBoolean(THREE,three).putBoolean(EVE,eve).putBoolean(TODAY,today).apply();
        schedule(context);
    }
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
        AlarmManager am=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        if(am==null)return;
        Intent intent=new Intent(context,ReminderReceiver.class).setAction(REMIND);
        PendingIntent pending=PendingIntent.getBroadcast(context,91,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pending);
        long now=System.currentTimeMillis(), next=Long.MAX_VALUE;
        try {
            JSONArray items=new JSONArray(context.getSharedPreferences(PREF,0).getString(KEY,"[]"));
            Set<String> stopped=context.getSharedPreferences(PREF,0).getStringSet(STOPPED,new HashSet<>());
            Set<String> sent=context.getSharedPreferences(PREF,0).getStringSet(SENT,new HashSet<>());
            for(int i=0;i<items.length();i++){
                JSONObject item=items.optJSONObject(i);if(item==null)continue;
                String id=item.optString("id"),date=item.optString("date");
                if(!id.matches("[0-9a-fA-F-]{36}")||!date.matches("\\d{4}-\\d{2}-\\d{2}"))continue;
                if(stopped.contains(id+"|"+date))continue;
                JSONObject p=settingsFor(context,id);
                LocalDate due=LocalDate.parse(date);
                for(int days:new int[]{3,1,0}){
                    if(!enabled(p,days)||sent.contains(id+"|"+date+"|"+days))continue;
                    LocalDate target=due.minusDays(days);
                    Calendar when=Calendar.getInstance();
                    when.clear();
                    when.set(target.getYear(),target.getMonthValue()-1,target.getDayOfMonth(),p.optInt("hour",9),p.optInt("minute",0),0);
                    long ms=when.getTimeInMillis();
                    if(ms>now && ms<next)next=ms;
                }
            }
        }catch(Exception ignored){}
        if(next!=Long.MAX_VALUE)am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,pending);
    }
    static boolean enabled(JSONObject p,int days) {
        return days==3?p.optBoolean("three",true):days==1?p.optBoolean("eve",true):p.optBoolean("today",true);
    }
    static void notifyDue(Context context) {
        NotificationManager manager = (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Vencimentos do Recebi+",NotificationManager.IMPORTANCE_DEFAULT));
        Set<String> stopped=context.getSharedPreferences(PREF,0).getStringSet(STOPPED,new HashSet<>());
        Set<String> sent=new HashSet<>(context.getSharedPreferences(PREF,0).getStringSet(SENT,new HashSet<>()));
        try {
            JSONArray items=new JSONArray(context.getSharedPreferences(PREF,0).getString(KEY,"[]"));
            LocalDate today=LocalDate.now();
            Calendar now=Calendar.getInstance();
            for(int i=0;i<items.length();i++){
                JSONObject item=items.optJSONObject(i);if(item==null)continue;
                String id=item.optString("id"),date=item.optString("date");
                if(!id.matches("[0-9a-fA-F-]{36}")||!date.matches("\\d{4}-\\d{2}-\\d{2}"))continue;
                String key=id+"|"+date;
                if(stopped.contains(key))continue;
                long days=ChronoUnit.DAYS.between(today,LocalDate.parse(date));
                if(days!=3&&days!=1&&days!=0)continue;
                JSONObject p=settingsFor(context,id);
                if(!enabled(p,(int)days))continue;
                if(now.get(Calendar.HOUR_OF_DAY)*60+now.get(Calendar.MINUTE)<p.optInt("hour",9)*60+p.optInt("minute",0))continue;
                String occurrence=key+"|"+days;
                if(sent.contains(occurrence))continue;
                String body = days == 3 ? "Uma parcela vence em 3 dias." : days == 1 ? "Uma parcela vence amanhã." : "Uma parcela vence hoje.";
                Intent stop = new Intent(context,ReminderReceiver.class).setAction(STOP).putExtra("key",key).setData(android.net.Uri.parse("recebi://stop/"+id+"/"+date));
                PendingIntent stopAction = PendingIntent.getBroadcast(context,key.hashCode(),stop,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                PendingIntent open = PendingIntent.getActivity(context,0,new Intent(context,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification.Builder n = Build.VERSION.SDK_INT>=26 ? new Notification.Builder(context,CHANNEL) : new Notification.Builder(context);
                n.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Recebi+ · Vencimento")
                 .setContentText(body).setAutoCancel(true).setContentIntent(open)
                 .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Parar aviso",stopAction).build());
                manager.notify(key,key.hashCode(),n.build());
                sent.add(occurrence);
            }
        } catch (Exception ignored) {}
        context.getSharedPreferences(PREF,0).edit().putStringSet(SENT,sent).apply();
    }
}
