package com.nexus.school.network

import android.content.Context
import android.util.Log
import com.nexus.school.data.SyncDatabase
import com.nexus.school.security.IdentityManager
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class SyncPayload(
    val device_id: String,
    val teacher_name: String,
    val signature: String,
    val events: List<com.nexus.school.data.SyncEvent>,
    val device_model: String
)

data class SyncResult(
    val success: Boolean,
    val partialLimit: Boolean = false,
    val failedCount: Int = 0,
    val hadPendingEvents: Boolean = false  // false = config-pull only; true = real events were queued
)

class SyncWorker(private val context: Context) {

    companion object {
        // Singleton HttpClient — avoids spawning a new thread pool on every sync call.
        val client: HttpClient by lazy {
            HttpClient(CIO) {
                install(ContentNegotiation) {
                    json(Json { ignoreUnknownKeys = true })
                }
                engine {
                    // 5-second connect timeout — don't hang if Hub is unreachable
                    requestTimeout = 10_000
                }
            }
        }
    }

    suspend fun pushPendingEvents(): SyncResult {
        val identityManager = IdentityManager(context)
        val serverInfo = identityManager.getServerInfo() ?: return SyncResult(success = false)
        val (ip, port) = serverInfo

        val db = SyncDatabase.getDatabase(context)
        val pendingEvents = db.syncDao().getPendingEvents()

        // Always contact the server even when there are no pending events.
        // This is a "config-pull" — the server response always includes the
        // authoritative registration_locked flag and score_components, so we
        // must never skip the round-trip just because the queue is empty.
        val hadPendingEvents = pendingEvents.isNotEmpty()

        return try {
            val eventsJson = Json.encodeToString(
                kotlinx.serialization.builtins.ListSerializer(com.nexus.school.data.SyncEvent.serializer()),
                pendingEvents
            )
            val signature   = identityManager.signPayload(eventsJson)
            val deviceId    = identityManager.getDeviceId()
            val teacherName = identityManager.getTeacherName()
            val deviceModel = identityManager.getDeviceModel()

            val payload = SyncPayload(
                device_id    = deviceId,
                teacher_name = teacherName,
                signature    = signature,
                events       = pendingEvents,
                device_model = deviceModel
            )

            Log.d("SyncWorker", "Pushing ${pendingEvents.size} events to $ip:$port")

            val response: HttpResponse = client.post("http://$ip:$port/sync") {
                contentType(ContentType.Application.Json)
                setBody(payload)
            }

            when {
                response.status == HttpStatusCode.OK -> {
                    val responseText = response.bodyAsText()
                    val jsonObject   = org.json.JSONObject(responseText)
                    val status       = jsonObject.optString("status", "ACK")
                    val failedArr    = jsonObject.optJSONArray("failed_events")

                    // ── License Expiry Early-Warning ─────────────────────────
                    val expiresAt = jsonObject.optLong("expires_at", 0L)
                    if (expiresAt > 0) {
                        val daysLeft = ((expiresAt - System.currentTimeMillis()) / 86_400_000).toInt()
                        if (daysLeft in 0..7) {
                            withContext(Dispatchers.Main) {
                                android.widget.Toast.makeText(
                                    context,
                                    "⚠️ School license expires in $daysLeft day(s). Ask Admin to renew.",
                                    android.widget.Toast.LENGTH_LONG
                                ).show()
                            }
                        }
                    }

                    // ── Mark successful events synced ────────────────────────
                    val failedEventIds = mutableListOf<String>()
                    if (failedArr != null) {
                        for (i in 0 until failedArr.length()) {
                            failedEventIds.add(failedArr.getString(i))
                        }
                    }
                    val successfulIds = pendingEvents
                        .filter { it.event_id !in failedEventIds }
                        .map { it.event_id }

                    if (successfulIds.isNotEmpty()) {
                        db.syncDao().markEventsSynced(successfulIds)
                    }

                    // ── Refresh score components (grading scheme) ────────────
                    // Server sends updated score_components on every sync so
                    // changes (like adding Attendance) don't need a re-pair.
                    val scoreArr = jsonObject.optJSONArray("score_components")
                    if (scoreArr != null && scoreArr.length() > 0) {
                        val scoreJson = buildString {
                            append("[")
                            for (i in 0 until scoreArr.length()) {
                                if (i > 0) append(",")
                                val c = scoreArr.getJSONObject(i)
                                append("{\"key\":\"${c.optString("key")}\",")
                                append("\"label\":\"${c.optString("label")}\",")
                                append("\"max\":${c.optInt("max", 10)}}")
                            }
                            append("]")
                        }
                        identityManager.saveScoreComponents(scoreJson)
                        Log.d("SyncWorker", "Score components refreshed: ${scoreArr.length()} components")
                    }

                    val registrationLocked = jsonObject.optBoolean("registration_locked", false)
                    identityManager.saveRegistrationLocked(registrationLocked)

                    Log.d("SyncWorker", "Sync OK — ${successfulIds.size} events pushed, ${failedEventIds.size} failed.")
                    SyncResult(
                        success = true,
                        partialLimit = (status == "PARTIAL_LIMIT"),
                        failedCount = failedEventIds.size,
                        hadPendingEvents = hadPendingEvents
                    )
                }

                response.status.value == 403 -> {
                    val body = response.bodyAsText()
                    if (body.contains("REVOKED")) {
                        db.clearAllTables()
                        withContext(Dispatchers.Main) {
                            android.widget.Toast.makeText(
                                context,
                                "🔒 Device revoked by Admin. Local data wiped.",
                                android.widget.Toast.LENGTH_LONG
                            ).show()
                            val intent = android.content.Intent(
                                context,
                                com.nexus.school.ui.HandshakeActivity::class.java
                            ).apply {
                                flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
                                        android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK
                            }
                            context.startActivity(intent)
                        }
                    }
                    SyncResult(success = false)
                }

                else -> {
                    Log.e("SyncWorker", "Sync rejected — HTTP ${response.status}")
                    SyncResult(success = false)
                }
            }
        } catch (e: Exception) {
            Log.e("SyncWorker", "Sync exception", e)
            SyncResult(success = false)
        }
    }
}
