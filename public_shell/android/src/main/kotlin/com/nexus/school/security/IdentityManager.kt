package com.nexus.school.security

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.nexus.school.utils.ThermalMonitor
import java.util.UUID
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

class IdentityManager(context: Context) {
    private val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
    private val prefs = EncryptedSharedPreferences.create(
        "nexus_identity",
        masterKeyAlias,
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    private val thermalMonitor = ThermalMonitor(context)

    fun getDeviceId(): String {
        var deviceId = prefs.getString("device_id", null)
        if (deviceId == null) {
            deviceId = UUID.randomUUID().toString()
            prefs.edit().putString("device_id", deviceId).apply()
        }
        return deviceId!!
    }

    private val keyStoreAlias = "nexus_device_key"

    init {
        generateKeyPairIfNeeded()
    }

    private fun generateKeyPairIfNeeded() {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!keyStore.containsAlias(keyStoreAlias)) {
            val keyPairGenerator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore"
            )
            val parameterSpec = KeyGenParameterSpec.Builder(
                keyStoreAlias,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            ).run {
                setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                setDigests(KeyProperties.DIGEST_SHA256)
                // Optional: require user authentication (biometrics)
                // setUserAuthenticationRequired(true)
                build()
            }
            keyPairGenerator.initialize(parameterSpec)
            keyPairGenerator.generateKeyPair()
        }
    }

    fun getPublicKey(): String {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val cert = keyStore.getCertificate(keyStoreAlias)
        return if (cert != null) {
            Base64.encodeToString(cert.publicKey.encoded, Base64.NO_WRAP)
        } else {
            "DEVICE_SPECIFIC_PUBLIC_KEY_PLACEHOLDER"
        }
    }

    fun signPayload(payload: String): String {
        return try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val privateKey = keyStore.getKey(keyStoreAlias, null) as java.security.PrivateKey
            val signature = Signature.getInstance("SHA256withECDSA").run {
                initSign(privateKey)
                update(payload.toByteArray(Charsets.UTF_8))
                sign()
            }
            Base64.encodeToString(signature, Base64.NO_WRAP)
        } catch (e: Exception) {
            e.printStackTrace()
            "SIGNATURE_FAILED"
        }
    }

    fun getTeacherName(): String {
        return prefs.getString("teacher_name", "Mr. Adebayo") ?: "Mr. Adebayo"
    }

    fun getThermalStatus(): String {
        return thermalMonitor.getCurrentThermalState().name
    }

    fun saveServerInfo(ip: String, port: Int) {
        prefs.edit()
            .putString("server_ip", ip)
            .putInt("server_port", port)
            .apply()
    }

    fun getServerInfo(): Pair<String, Int>? {
        val ip = prefs.getString("server_ip", null)
        val port = prefs.getInt("server_port", -1)
        if (ip != null && port != -1) {
            return Pair(ip, port)
        }
        return null
    }

    fun saveSchoolBranding(name: String, primaryColor: String) {
        prefs.edit()
            .putString("school_name", name)
            .putString("primary_color", primaryColor)
            .putBoolean("is_married", true)
            .apply()
    }

    fun isMarried(): Boolean {
        return prefs.getBoolean("is_married", false)
    }

    fun getSchoolName(): String {
        return prefs.getString("school_name", "Nexus School") ?: "Nexus School"
    }

    fun getPrimaryColor(): String {
        return prefs.getString("primary_color", "#1A237E") ?: "#1A237E"
    }

    fun clearData() {
        prefs.edit().clear().apply()
    }
}
