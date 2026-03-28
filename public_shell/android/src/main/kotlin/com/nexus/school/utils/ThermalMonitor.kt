package com.nexus.school.utils

import android.content.Context
import android.os.PowerManager

enum class ThermalState {
    COOL, MODERATE, CRITICAL
}

class ThermalMonitor(private val context: Context) {
    private val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager

    fun getCurrentThermalState(): ThermalState {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            val status = powerManager.currentThermalStatus
            return when {
                status >= PowerManager.THERMAL_STATUS_SEVERE -> ThermalState.CRITICAL
                status >= PowerManager.THERMAL_STATUS_MODERATE -> ThermalState.MODERATE
                else -> ThermalState.COOL
            }
        }
        return ThermalState.COOL
    }
}
