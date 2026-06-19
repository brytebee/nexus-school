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

    fun saveDeviceModel(model: String) {
        prefs.edit().putString("device_model", model).apply()
    }

    fun getDeviceModel(): String {
        return prefs.getString("device_model", android.os.Build.MODEL) ?: android.os.Build.MODEL
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

    fun saveLogoBase64(logoBase64: String?) {
        if (logoBase64 != null) prefs.edit().putString("school_logo_b64", logoBase64).apply()
    }

    fun getLogoBase64(): String? = prefs.getString("school_logo_b64", null)

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

    /**
     * Saves a map of className → pipe-delimited subjects sent from the Hub handshake.
     * Stored as JSON so it survives process restarts without a new handshake.
     */
    fun saveClassSubjectsMap(classSubjects: Map<String, List<String>>) {
        val json = org.json.JSONObject()
        classSubjects.forEach { (cls, subjects) ->
            json.put(cls, subjects.joinToString("|"))
        }
        prefs.edit().putString("class_subjects_map", json.toString()).apply()
    }

    fun getAllClasses(): List<String> {
        val json = try {
            org.json.JSONObject(prefs.getString("class_subjects_map", "{}") ?: "{}")
        } catch (e: Exception) { return emptyList() }
        val list = mutableListOf<String>()
        val keys = json.keys()
        while (keys.hasNext()) {
            list.add(keys.next())
        }
        return list.sorted()
    }

    /**
     * Returns the subjects registered for [className], or falls back to the flat
     * master subject list if no class-specific data is available.
     */
    fun getSubjectsForClass(className: String): List<String> {
        val json = try {
            org.json.JSONObject(prefs.getString("class_subjects_map", "{}") ?: "{}")
        } catch (e: Exception) { return getMasterSubjectList() }

        val raw = json.optString(className, "")
        if (raw.isNotBlank()) return raw.split("|").filter { it.isNotBlank() }

        // Level-based fallback: if no exact match, try same level (JSS vs SS)
        val isJss = className.uppercase().startsWith("JSS") || className.uppercase().startsWith("JS")
        val levelKey = json.keys().asSequence().firstOrNull { k ->
            if (isJss) k.uppercase().startsWith("JSS") || k.uppercase().startsWith("JS")
            else k.uppercase().startsWith("SS")
        }
        if (levelKey != null) return json.optString(levelKey, "").split("|").filter { it.isNotBlank() }

        return getMasterSubjectList()
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

    /** Persists the plan tier label sent by the server ("Standalone", "Silver", "Gold", "Diamond"). */
    fun savePlanTier(tier: String) {
        // Security: only accept the four canonical tier values.
        // Anything else is treated as a tamper signal and silently dropped;
        // inferTierFromModules() will cover the fallback at read-time.
        val validTiers = setOf("Standalone", "Silver", "Gold", "Diamond")
        if (tier !in validTiers) {
            android.util.Log.w("IdentityManager", "savePlanTier: rejected unrecognised tier '$tier' — possible tampering.")
            return
        }
        prefs.edit().putString("plan_tier", tier).apply()
    }

    /** Returns the saved plan tier, or "Silver" as a safe fallback. */
    fun getPlanTier(): String {
        return prefs.getString("plan_tier", null)?.ifBlank { null } ?: inferTierFromModules()
    }

    private fun inferTierFromModules(): String {
        val mods = getTierModules()
        return when {
            mods.any { it.equals("custom_result", true) }  -> "Diamond"
            mods.any { it.equals("parent_contact", true) } -> "Gold"
            mods.isNotEmpty()                               -> "Silver"
            else                                            -> "Standalone"
        }
    }

    /**
     * Persists the form/homeroom class assigned to this teacher.
     * A null value (or empty string) means the teacher is NOT a form teacher —
     * they should not be able to take the class register.
     */
    fun saveFormClass(className: String?) {
        prefs.edit().putString("form_class", className ?: "").apply()
    }

    /**
     * Returns the class name this teacher is the form teacher for,
     * or null if they have no form class assignment.
     */
    fun getFormClass(): String? {
        val v = prefs.getString("form_class", "") ?: ""
        return v.ifBlank { null }
    }

    /** Convenience: returns true when this teacher is the form teacher of [className]. */
    fun isFormTeacherOf(className: String): Boolean {
        return getFormClass()?.equals(className, ignoreCase = true) == true
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

    fun saveRegistrationLocked(locked: Boolean) {
        prefs.edit().putBoolean("registration_locked", locked).apply()
    }

    fun saveRegistrationLockAt(timestamp: Long) {
        prefs.edit().putLong("registration_lock_at", timestamp).apply()
    }

    fun getRegistrationLockAt(): Long {
        return prefs.getLong("registration_lock_at", 0L)
    }

    fun isRegistrationLocked(): Boolean {
        if (prefs.getBoolean("registration_locked", false)) return true
        val lockAt = getRegistrationLockAt()
        if (lockAt > 0 && System.currentTimeMillis() >= lockAt) {
            return true
        }
        return false
    }

    fun saveGradesLocked(locked: Boolean) {
        prefs.edit().putBoolean("grades_locked", locked).apply()
    }

    fun isGradesLockedExplicit(): Boolean {
        return prefs.getBoolean("grades_locked", false)
    }

    fun saveAttendanceLocked(locked: Boolean) {
        prefs.edit().putBoolean("attendance_locked", locked).apply()
    }

    fun isAttendanceLockedExplicit(): Boolean {
        return prefs.getBoolean("attendance_locked", false)
    }

    fun saveGradesLockAt(timestamp: Long) {
        prefs.edit().putLong("grades_lock_at", timestamp).apply()
    }

    fun getGradesLockAt(): Long {
        return prefs.getLong("grades_lock_at", 0L)
    }

    fun saveAttendanceLockAt(timestamp: Long) {
        prefs.edit().putLong("attendance_lock_at", timestamp).apply()
    }

    fun getAttendanceLockAt(): Long {
        return prefs.getLong("attendance_lock_at", 0L)
    }

    fun isGradesLocked(): Boolean {
        if (isGradesLockedExplicit()) return true
        val lockAt = getGradesLockAt()
        if (lockAt > 0 && System.currentTimeMillis() >= lockAt) {
            return true
        }
        return false
    }

    fun isAttendanceLocked(): Boolean {
        if (isAttendanceLockedExplicit()) return true
        val lockAt = getAttendanceLockAt()
        if (lockAt > 0 && System.currentTimeMillis() >= lockAt) {
            return true
        }
        return false
    }

    fun clearData() {
        prefs.edit().clear().apply()
    }
}
