package com.nexus.school.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.nexus.school.NexusApp
import com.nexus.school.R

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        if (NexusApp.requiresAuth) {
            val intent = Intent(this, LockActivity::class.java).apply {
                putExtra("IS_COLD_BOOT", true)
            }
            startActivity(intent)
            finish()
            return
        }

        // Check if married, if not, go to Handshake
        val identityManager = com.nexus.school.security.IdentityManager(this)
        if (identityManager.isMarried()) {
            val intent = Intent(this, DemoResetActivity::class.java)
            intent.putExtra("school_name", identityManager.getSchoolName())
            intent.putExtra("primary_color", identityManager.getPrimaryColor())
            startActivity(intent)
        } else {
            val intent = Intent(this, HandshakeActivity::class.java)
            startActivity(intent)
        }
        finish()
    }
}
