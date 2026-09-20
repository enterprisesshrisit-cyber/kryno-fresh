package com.kryno.mobile

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.AudioAttributes
import android.net.Uri
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

class KrynoFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    if (remoteMessage.data["type"] != CALL_INVITE_TYPE) {
      super.onMessageReceived(remoteMessage)
      return
    }

    showIncomingCall(remoteMessage)
  }

  private fun showIncomingCall(remoteMessage: RemoteMessage) {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      Log.w(LOG_TAG, "Incoming call notification permission is not granted")
      return
    }

    val data = remoteMessage.data
    val callId = data["callId"]?.takeIf { it.isNotBlank() } ?: run {
      Log.w(LOG_TAG, "Incoming call push did not contain a call id")
      return
    }
    val mode = if (data["mode"] == "video") "video" else "audio"
    val callerUsername = data["callerUsername"]?.takeIf { it.isNotBlank() } ?: "Kryno member"
    val title = data["title"] ?: "Incoming Kryno $mode call"
    val body = data["body"] ?: "$callerUsername is calling you."
    val channelId = data["channelId"] ?: CALL_CHANNEL_ID

    createCallChannel(channelId)

    val incomingCallUri = Uri.Builder()
      .scheme("kryno")
      .authority("call")
      .appendPath("incoming")
      .appendQueryParameter("callId", callId)
      .appendQueryParameter("mode", mode)
      .appendQueryParameter("caller", callerUsername)
      .build()
    val fullScreenIntent = Intent(Intent.ACTION_VIEW, incomingCallUri, this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra(MainActivity.KRYNO_INCOMING_CALL_EXTRA, true)
      putExtra("krynoCallId", callId)
      putExtra("krynoCallMode", mode)
      putExtra("krynoCallerUsername", callerUsername)
    }
    val pendingIntent = PendingIntent.getActivity(
      this,
      callId.hashCode(),
      fullScreenIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(this, channelId)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setColor(Color.parseColor("#7C3AED"))
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setTimeoutAfter(CALL_NOTIFICATION_TIMEOUT_MS)
      .setContentIntent(pendingIntent)
      .setFullScreenIntent(pendingIntent, true)
      .build()

    NotificationManagerCompat.from(this).notify(callId.hashCode() and Int.MAX_VALUE, notification)
    Log.i(LOG_TAG, "Incoming $mode call notification posted with full-screen intent")

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val manager = getSystemService(NotificationManager::class.java)
      if (!manager.canUseFullScreenIntent()) {
        Log.w(LOG_TAG, "Android has not allowed full-screen call intents; heads-up notification remains active")
      }
    }
  }

  private fun createCallChannel(channelId: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    val audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val channel = NotificationChannel(
      channelId,
      "Incoming Kryno calls",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Incoming audio and video calls"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 700, 250, 700, 250, 700)
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
      setSound(ringtoneUri, audioAttributes)
    }

    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  companion object {
    private const val LOG_TAG = "KrynoCallPush"
    private const val CALL_INVITE_TYPE = "call_invite"
    private const val CALL_CHANNEL_ID = "kryno-incoming-calls-v3"
    private const val CALL_NOTIFICATION_TIMEOUT_MS = 55_000L
  }
}
