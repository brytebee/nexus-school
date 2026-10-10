package com.nexus.school.network

import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.io.ByteArrayInputStream
import java.util.zip.GZIPInputStream

@Serializable
data class Config(
    val name: String? = null,
    val themePrimary: String? = null,
    val themeSecondary: String? = null,
    val logoBase64: String? = null,
    val address: String? = null,
    val motto: String? = null,
    val signature: String? = null,
    val modules: List<String> = emptyList()
)

@Serializable
data class QrPayload(
    val sid: String,
    val ip: String,
    val port: Int,
    val handshake_key: String,
    val config: Config,
    val teacher_id: String? = null,
    val teacher_name: String? = null
)

@Serializable
data class SchoolConfig(
    val name: String? = null,
    val primary_color: String? = null,   // normalised field sent by server since handshake fix
    val themePrimary: String? = null,    // legacy field from QR payload config — kept for compat
    val themeSecondary: String? = null,
    val logoBase64: String? = null,
    val address: String? = null,
    val motto: String? = null,
    val signature: String? = null,
    val modules: List<String> = emptyList(),
    val plan_tier: String? = null,       // "Standalone", "Silver", "Gold", "Diamond"
    val teacher_attendance_scope: String? = null,
    val registration_locked: Boolean? = null,
    val grades_locked: Boolean? = null,
    val attendance_locked: Boolean? = null,
    val registration_lock_at: Long? = null,
    val grades_lock_at: Long? = null,
    val attendance_lock_at: Long? = null
)

@Serializable
data class ScoreComponent(
    val key: String,
    val label: String,
    val max: Int
)

@Serializable
data class HandshakeResponse(
    val status: String,
    val message: String,
    val role: String? = null,
    val teacher_id: String? = null,
    val teacher_name: String? = null,
    val school_config: SchoolConfig,
    val server_timestamp: String,
    val students: List<com.nexus.school.data.Student> = emptyList(),
    val score_components: List<ScoreComponent> = emptyList(),
    val all_subjects: List<String> = emptyList(),
    val class_subjects: Map<String, List<String>> = emptyMap(),
    val form_class: String? = null,
    val scores: List<com.nexus.school.data.StudentScore> = emptyList(),  // pre-existing Hub scores
    val class_curriculum_types: JsonObject? = null
)

@Serializable
data class DeviceResponse(
    val device_id: String,
    val teacher_id: String,
    val teacher_name: String,
    val public_key: String,
    val thermal_status: String,
    val device_model: String
)

@Serializable
data class PinHandshakeRequest(
    val pin: String,
    val device_id: String,
    val device_model: String,
    val public_key: String,
    val thermal_status: String
)

class HandshakeService {
    private val jsonParser = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    private val client = HttpClient(CIO) {
        install(ContentNegotiation) {
            json(jsonParser)
        }
    }

    suspend fun performHandshake(ip: String, port: Int, response: DeviceResponse): HandshakeResponse? {
        return try {
            val httpResponse: HttpResponse = client.post("http://$ip:$port/api/handshake") {
                contentType(ContentType.Application.Json)
                setBody(response)
            }
            if (httpResponse.status == HttpStatusCode.OK) {
                val contentEncoding = httpResponse.headers[HttpHeaders.ContentEncoding]
                val responseBody = if (contentEncoding?.contains("gzip", ignoreCase = true) == true) {
                    val bytes = httpResponse.readBytes()
                    val gzipInputStream = GZIPInputStream(ByteArrayInputStream(bytes))
                    gzipInputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                } else {
                    httpResponse.bodyAsText()
                }
                jsonParser.decodeFromString<HandshakeResponse>(responseBody)
            } else {
                val errorText = httpResponse.bodyAsText()
                var errCode = "HANDSHAKE_ERROR"
                var errMsg = "Handshake failed."
                try {
                    val json = org.json.JSONObject(errorText)
                    errCode = json.optString("error", "HANDSHAKE_ERROR")
                    errMsg = json.optString("message", json.optString("error", "Handshake failed."))
                } catch (_: Exception) {}
                throw HandshakeException(errCode, errMsg)
            }
        } catch (e: HandshakeException) {
            throw e
        } catch (e: Exception) {
            android.util.Log.e("HandshakeService", "Handshake QR processing error: ${e.message}", e)
            throw HandshakeException("PROCESSING_ERROR", e.message ?: "Handshake error")
        }
    }

    suspend fun performHandshakeWithPin(
        ip: String,
        port: Int,
        pin: String,
        response: DeviceResponse
    ): HandshakeResponse? {
        return try {
            val req = PinHandshakeRequest(
                pin = pin,
                device_id = response.device_id,
                device_model = response.device_model,
                public_key = response.public_key,
                thermal_status = response.thermal_status
            )
            val httpResponse: HttpResponse = client.post("http://$ip:$port/api/handshake-pin") {
                contentType(ContentType.Application.Json)
                setBody(req)
            }
            if (httpResponse.status == HttpStatusCode.OK) {
                val contentEncoding = httpResponse.headers[HttpHeaders.ContentEncoding]
                val responseBody = if (contentEncoding?.contains("gzip", ignoreCase = true) == true) {
                    val bytes = httpResponse.readBytes()
                    val gzipInputStream = GZIPInputStream(ByteArrayInputStream(bytes))
                    gzipInputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                } else {
                    httpResponse.bodyAsText()
                }
                jsonParser.decodeFromString<HandshakeResponse>(responseBody)
            } else {
                val errorText = httpResponse.bodyAsText()
                var errCode = "HANDSHAKE_ERROR"
                var errMsg = "Handshake with PIN failed."
                try {
                    val json = org.json.JSONObject(errorText)
                    errCode = json.optString("error", "HANDSHAKE_ERROR")
                    errMsg = json.optString("message", json.optString("error", "Handshake failed."))
                } catch (_: Exception) {}
                throw HandshakeException(errCode, errMsg)
            }
        } catch (e: HandshakeException) {
            throw e
        } catch (e: Exception) {
            android.util.Log.e("HandshakeService", "PIN Handshake processing error: ${e.message}", e)
            throw HandshakeException("PROCESSING_ERROR", e.message ?: "PIN Handshake error")
        }
    }
}

class HandshakeException(val errorCode: String, message: String) : Exception(message)
