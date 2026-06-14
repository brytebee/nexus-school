package com.nexus.school

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner

class NexusApp : Application(), DefaultLifecycleObserver {

    companion object {
        /** Set to true at cold start; cleared by LockActivity on successful auth. */
        var requiresAuth = true

        /**
         * Activities set this to TRUE immediately before launching a system intent
         * (camera capture, gallery picker, file chooser, etc.) that is expected to
         * return resources to our app.  When the app returns to the foreground from
         * such an intent, this flag suppresses the lock so the user doesn't need to
         * re-authenticate just because they picked a photo.
         *
         * The flag is automatically cleared in [onStart] every time we return to
         * the foreground — there is no manual "clear" needed at call sites.
         */
        @Volatile var intentInProgress = false
    }

    private var backgroundMillis = 0L

    // Lock fires as soon as the app has been genuinely backgrounded (not just while
    // a camera / gallery intent we launched is in the foreground).
    // intentInProgress = true prevents backgroundMillis from being set at all,
    // so onStart sees backgroundMillis == 0 and skips the lock.
    private val TIME_TO_LOCK = 0L

    override fun onCreate() {
        super<Application>.onCreate()
        ProcessLifecycleOwner.get().lifecycle.addObserver(this)
    }

    override fun onStop(owner: LifecycleOwner) {
        super.onStop(owner)
        if (intentInProgress) {
            // App went to background because WE launched a camera / gallery intent.
            // Do NOT record a background timestamp — the lock timer must not start.
            return
        }
        backgroundMillis = System.currentTimeMillis()
    }

    override fun onStart(owner: LifecycleOwner) {
        super.onStart(owner)

        if (intentInProgress) {
            // Returning from our own camera / gallery intent — clear the flag and
            // skip the lock entirely regardless of how long the intent took.
            intentInProgress = false
            backgroundMillis = 0L
            return
        }

        if (backgroundMillis > 0L) {
            val timeInBackground = System.currentTimeMillis() - backgroundMillis
            backgroundMillis = 0L

            if (timeInBackground >= TIME_TO_LOCK) {
                requiresAuth = true
                val intent = android.content.Intent(
                    this,
                    com.nexus.school.ui.LockActivity::class.java
                ).apply {
                    flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
                            android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
                startActivity(intent)
            }
        }
    }
}
