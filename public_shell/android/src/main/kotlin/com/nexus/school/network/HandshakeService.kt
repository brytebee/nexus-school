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
    val config: Config
)

@Serializable
data class SchoolConfig(
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
data class HandshakeResponse(
    val status: String,
    val message: String,
    val school_config: SchoolConfig,
    val server_timestamp: String,
    val students: List<com.nexus.school.data.Student> = emptyList()
)

@Serializable
data class DeviceResponse(
    val device_id: String,
    val teacher_name: String,
    val public_key: String,
    val thermal_status: String
)

class HandshakeService {
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
            })
        }
    }

    suspend fun performHandshake(ip: String, port: Int, response: DeviceResponse): HandshakeResponse? {
        return try {
            val httpResponse: HttpResponse = client.post("http://$ip:$port/handshake") {
                contentType(ContentType.Application.Json)
                setBody(response)
            }
            if (httpResponse.status == HttpStatusCode.OK) {
                val responseBody = httpResponse.bodyAsText()
                Json { ignoreUnknownKeys = true }.decodeFromString<HandshakeResponse>(responseBody)
            } else {
                null
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}
