package com.nexus.school

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner

class NexusApp : Application(), DefaultLifecycleObserver {

    companion object {
        var requiresAuth = true // Always require auth on cold start
    }

    private var backgroundMillis = 0L
    private val TIME_TO_LOCK = 30 * 1000L // 30 seconds

    override fun onCreate() {
        super<Application>.onCreate()
        ProcessLifecycleOwner.get().lifecycle.addObserver(this)
    }

    override fun onStart(owner: LifecycleOwner) {
        super.onStart(owner)
        // Returning to foreground
        if (backgroundMillis > 0) {
            val timeInBackground = System.currentTimeMillis() - backgroundMillis
            if (timeInBackground >= TIME_TO_LOCK) {
                requiresAuth = true
                
                // Launch LockActivity on top of whatever screen is currently visible
                val intent = android.content.Intent(this, com.nexus.school.ui.LockActivity::class.java).apply {
                    flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
                startActivity(intent)
            }
        }
    }

    override fun onStop(owner: LifecycleOwner) {
        super.onStop(owner)
        // Going to background
        backgroundMillis = System.currentTimeMillis()
    }
}
