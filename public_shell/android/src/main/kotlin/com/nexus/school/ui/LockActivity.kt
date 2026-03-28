package com.nexus.school.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.nexus.school.NexusApp
import com.nexus.school.R
import java.util.concurrent.Executor

class LockActivity : AppCompatActivity() {

    private lateinit var executor: Executor
    private lateinit var biometricPrompt: BiometricPrompt
    private lateinit var promptInfo: BiometricPrompt.PromptInfo

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_lock)
        
        executor = ContextCompat.getMainExecutor(this)
        
        biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    Toast.makeText(applicationContext, "Authentication error: $errString", Toast.LENGTH_SHORT).show()
                    finishAffinity() // Kill app on failure or cancellation
                }

                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    NexusApp.requiresAuth = false
                    Toast.makeText(applicationContext, "Authentication succeeded!", Toast.LENGTH_SHORT).show()
                    
                    val isColdBoot = intent.getBooleanExtra("IS_COLD_BOOT", false)
                    if (isColdBoot) {
                        // Route back to MainActivity to continue cold-boot logic
                        val nextIntent = Intent(this@LockActivity, MainActivity::class.java)
                        startActivity(nextIntent)
                    }
                    // If not cold boot, simply finishing reveals the screen they were on securely
                    finish()
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    Toast.makeText(applicationContext, "Authentication failed", Toast.LENGTH_SHORT).show()
                }
            })

        promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Nexus Vault Locked")
            .setSubtitle("Authenticate to access school records")
            .setNegativeButtonText("Cancel")
            .build()
            
        biometricPrompt.authenticate(promptInfo)
    }
}
