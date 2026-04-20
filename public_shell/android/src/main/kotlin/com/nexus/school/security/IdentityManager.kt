package com.nexus.school.security

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
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
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
        
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "nexus_identity",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    private val thermalMonitor = ThermalMonitor(context)

    fun getDeviceId(): String {
        val storedId = prefs.getString("device_id", null)
        if (storedId != null) return storedId
        
        val newId = UUID.randomUUID().toString()
        prefs.edit().putString("device_id", newId).apply()
        return newId
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

    fun saveTeacherIdentity(id: String, name: String) {
        prefs.edit()
            .putString("teacher_id", id)
            .putString("teacher_name", name)
            .apply()
    }

    fun getTeacherId(): String {
        return prefs.getString("teacher_id", "TCH-001") ?: "TCH-001"
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

    fun saveScoreComponents(json: String) {
        prefs.edit().putString("score_components_json", json).apply()
    }

    fun saveMasterSubjectList(subjects: List<String>) {
        prefs.edit().putString("master_subject_list", subjects.joinToString("|")).apply()
    }

    fun getMasterSubjectList(): List<String> {
        val str = prefs.getString("master_subject_list", "") ?: ""
        return str.split("|").filter { it.isNotBlank() }
    }

    fun saveTeacherAssignedSubjects(subjects: List<String>) {
        prefs.edit().putString("teacher_assigned_subjects", subjects.joinToString("|")).apply()
    }

    fun getTeacherAssignedSubjects(): List<String> {
        val str = prefs.getString("teacher_assigned_subjects", "") ?: ""
        return str.split("|").filter { it.isNotBlank() }
    }

    fun saveRegPrefix(prefix: String) {
        prefs.edit().putString("reg_prefix", prefix).apply()
    }

    fun getRegPrefix(): String {
        return prefs.getString("reg_prefix", "") ?: ""
    }

    fun saveAdminPrefix(prefix: String) {
        prefs.edit().putString("admin_prefix", prefix).apply()
    }

    fun getAdminPrefix(): String {
        return prefs.getString("admin_prefix", "") ?: ""
    }

    fun getScoreComponentsJson(): String {
        return prefs.getString("score_components_json", "") ?: ""
    }

    /**
     * Persists the list of modules enabled for this school's license tier.
     * Example: ["grading", "attendance", "assignments"]
     * Stored as a comma-separated string so no JSON dependency is needed.
     */
    fun saveTierModules(modules: List<String>) {
        prefs.edit().putString("tier_modules", modules.joinToString(",")).apply()
    }

    fun getTierModules(): List<String> {
        val raw = prefs.getString("tier_modules", "") ?: ""
        return if (raw.isEmpty()) emptyList() else raw.split(",")
    }

    /** Returns true if the school's license includes this module key. */
    fun isModuleEnabled(moduleKey: String): Boolean {
        return getTierModules().any { it.trim().equals(moduleKey, ignoreCase = true) }
    }

    /**
     * Persists the license expiry epoch millis received from the Hub,
     * so the app can show an expiry countdown even when offline.
     */
    fun saveLicenseExpiry(epochMillis: Long) {
        prefs.edit().putLong("license_expires_at", epochMillis).apply()
    }

    fun getLicenseExpiresAt(): Long {
        return prefs.getLong("license_expires_at", Long.MAX_VALUE)
    }

    fun clearData() {
        prefs.edit().clear().apply()
    }
}
