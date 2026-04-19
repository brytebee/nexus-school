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
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class SyncPayload(
    val device_id: String,
    val teacher_name: String,
    val signature: String,
    val events: List<com.nexus.school.data.SyncEvent>
)

class SyncWorker(private val context: Context) {
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
            })
        }
    }

    suspend fun pushPendingEvents(): Boolean {
        val identityManager = IdentityManager(context)
        val serverInfo = identityManager.getServerInfo() ?: return false
        val ip = serverInfo.first
        val port = serverInfo.second

        val db = SyncDatabase.getDatabase(context)
        val pendingEvents = db.syncDao().getPendingEvents()

        if (pendingEvents.isEmpty()) {
            return true // Nothing to sync
        }

        return try {
            // Sign the payload for the Eco-Guardian vault
            val eventsJson = Json.encodeToString(
                kotlinx.serialization.builtins.ListSerializer(com.nexus.school.data.SyncEvent.serializer()), 
                pendingEvents
            )
            val signature = identityManager.signPayload(eventsJson)
            val deviceId = identityManager.getDeviceId()
            val teacherName = identityManager.getTeacherName()

            val payload = SyncPayload(
                device_id = deviceId,
                teacher_name = teacherName,
                signature = signature,
                events = pendingEvents
            )
            
            Log.d("SyncWorker", "Syncing... Outputting Payload with signature length: ${signature.length}")

            val response: HttpResponse = client.post("http://$ip:$port/sync") {
                contentType(ContentType.Application.Json)
                setBody(payload)
            }

            if (response.status == HttpStatusCode.OK) {
                val responseText = response.bodyAsText()
                Log.d("SyncWorker", "Server Response: $responseText")
                
                // Native lightweight JSON parsing
                val jsonObject = org.json.JSONObject(responseText)
                val status = jsonObject.optString("status", "ACK")
                val message = jsonObject.optString("message", "")
                val failedArr = jsonObject.optJSONArray("failed_events")
                
                val failedEvents = mutableListOf<String>()
                if (failedArr != null) {
                    for (i in 0 until failedArr.length()) {
                        failedEvents.add(failedArr.getString(i))
                    }
                }

                val successfulEvents = pendingEvents.filter { it.event_id !in failedEvents }.map { it.event_id }
                if (successfulEvents.isNotEmpty()) {
                    db.syncDao().markEventsSynced(successfulEvents)
                }

                if (status == "PARTIAL_LIMIT") {
                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                        android.widget.Toast.makeText(context, "Sync partial: ${failedEvents.size} students not added. School plan limit reached. Contact Admin.", android.widget.Toast.LENGTH_LONG).show()
                    }
                }

                Log.d("SyncWorker", "Successfully synced ${successfulEvents.size} events. Failed: ${failedEvents.size}")
                true
            } else if (response.status.value == 403) {
                // If it's a hard revoke
                val respText = response.bodyAsText()
                if (respText.contains("REVOKED")) {
                    db.clearAllTables()
                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                        android.widget.Toast.makeText(context, "Device Revoked. Local data wiped.", android.widget.Toast.LENGTH_LONG).show()
                        val intent = android.content.Intent(context, com.nexus.school.ui.HandshakeActivity::class.java).apply {
                            flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK
                        }
                        context.startActivity(intent)
                    }
                }
                false
            } else {
                Log.e("SyncWorker", "Sync failed with status: ${response.status}")
                false
            }
        } catch (e: Exception) {
            Log.e("SyncWorker", "Sync exception", e)
            false
        }
    }
}
