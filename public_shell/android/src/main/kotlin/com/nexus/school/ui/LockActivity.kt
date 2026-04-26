package com.nexus.school.ui

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.nexus.school.NexusApp
import com.nexus.school.R

class LockActivity : AppCompatActivity() {

    private var isPromptShowing = false
    private lateinit var biometricPrompt: BiometricPrompt
    private lateinit var promptInfo: BiometricPrompt.PromptInfo

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_lock)

        findViewById<android.widget.Button>(R.id.btnUnlock).setOnClickListener {
            if (!isPromptShowing) {
                isPromptShowing = true
                biometricPrompt.authenticate(promptInfo)
            }
        }

        // BiometricPrompt MUST be instantiated early in the lifecycle (onCreate).
        // If instantiated in onResume, the internal fragment attachment can silently fail.
        biometricPrompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {

                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    NexusApp.requiresAuth = false
                    val isColdBoot = intent.getBooleanExtra("IS_COLD_BOOT", false)
                    if (isColdBoot) {
                        startActivity(Intent(this@LockActivity, MainActivity::class.java))
                    }
                    finish()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    Log.w("NexusLock", "Auth error $errorCode: $errString")

                    when (errorCode) {
                        BiometricPrompt.ERROR_USER_CANCELED,
                        BiometricPrompt.ERROR_NEGATIVE_BUTTON -> {
                            finishAffinity()
                        }
                        BiometricPrompt.ERROR_NO_BIOMETRICS,
                        BiometricPrompt.ERROR_HW_NOT_PRESENT,
                        BiometricPrompt.ERROR_HW_UNAVAILABLE -> {
                            Log.e("NexusLock", "No authenticator available — bypassing lock.")
                            NexusApp.requiresAuth = false
                            Toast.makeText(this@LockActivity, "⚠️ Set a screen lock for full security.", Toast.LENGTH_LONG).show()
                            val isColdBoot = intent.getBooleanExtra("IS_COLD_BOOT", false)
                            if (isColdBoot) {
                                startActivity(Intent(this@LockActivity, MainActivity::class.java))
                            }
                            finish()
                        }
                        else -> {
                            Toast.makeText(this@LockActivity, "Try again: $errString", Toast.LENGTH_SHORT).show()
                            isPromptShowing = false // allow retry
                        }
                    }
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    Log.d("NexusLock", "Fingerprint not recognized.")
                }
            }
        )
        
        val biometricManager = BiometricManager.from(this)
        val authenticators = when {
            biometricManager.canAuthenticate(BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS -> BIOMETRIC_STRONG or DEVICE_CREDENTIAL
            biometricManager.canAuthenticate(BIOMETRIC_WEAK)   == BiometricManager.BIOMETRIC_SUCCESS -> BIOMETRIC_WEAK or DEVICE_CREDENTIAL
            else -> DEVICE_CREDENTIAL
        }

        promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Nexus Vault Locked")
            .setSubtitle("Authenticate to access school records")
            .setAllowedAuthenticators(authenticators)
            .build()
    }

    // No automatic onResume or onWindowFocusChanged triggers!
    // The user MUST tap the button to satisfy MIUI/Android 14 security policies
    // regarding background-launched biometric prompts.
}
