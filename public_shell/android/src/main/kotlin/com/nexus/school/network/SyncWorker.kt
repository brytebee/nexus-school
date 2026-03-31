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

            val payload = SyncPayload(
                device_id = deviceId,
                signature = signature,
                events = pendingEvents
            )
            
            Log.d("SyncWorker", "Syncing... Outputting Payload with signature length: ${signature.length}")

            val response: HttpResponse = client.post("http://$ip:$port/sync") {
                contentType(ContentType.Application.Json)
                setBody(payload)
            }

            if (response.status == HttpStatusCode.OK) {
                val eventIds = pendingEvents.map { it.event_id }
                db.syncDao().markEventsSynced(eventIds)
                Log.d("SyncWorker", "Successfully synced ${pendingEvents.size} events.")
                true
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
