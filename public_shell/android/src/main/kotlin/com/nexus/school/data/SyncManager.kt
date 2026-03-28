package com.nexus.school.data

import com.nexus.school.utils.ThermalMonitor
import com.nexus.school.utils.ThermalState
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class SyncManager(
    private val syncDao: SyncDao,
    private val thermalMonitor: ThermalMonitor
) {
    private val _syncStatus = MutableStateFlow<String>("IDLE")
    val syncStatus: StateFlow<String> = _syncStatus.asStateFlow()

    private val _isCoolingDown = MutableStateFlow<Boolean>(false)
    val isCoolingDown: StateFlow<Boolean> = _isCoolingDown.asStateFlow()

    suspend fun processQueue() {
        while (true) {
            val pendingEvents = syncDao.getPendingEvents()
            
            if (pendingEvents.isNotEmpty()) {
                val thermalState = thermalMonitor.getCurrentThermalState()
                
                when (thermalState) {
                    ThermalState.CRITICAL -> {
                        _syncStatus.value = "PAUSED_CRITICAL"
                        _isCoolingDown.value = true
                        // Pause sync for 2 minutes
                        delay(120_000)
                        _isCoolingDown.value = false
                        continue // Re-evaluate after cooldown
                    }
                    ThermalState.MODERATE -> {
                        _syncStatus.value = "SYNCING_ECO"
                        // Drop bitrate/dim screen logic handled by UI observing state
                        // Throttle sync
                        syncEvents(pendingEvents.take(5)) // Process fewer events
                        delay(5000) // Longer delay between batches
                    }
                    ThermalState.COOL -> {
                        _syncStatus.value = "SYNCING_FULL"
                        syncEvents(pendingEvents)
                        delay(2000) // Fast sync
                    }
                }
            } else {
                _syncStatus.value = "IDLE"
                delay(5000) // Check queue periodically
            }
        }
    }

    private suspend fun syncEvents(events: List<SyncEvent>) {
        // Placeholder for actual network call to Electron server
        // e.g., handshakeService.pushSyncEvents(ip, port, events)
        
        // Simulate network delay
        delay(500)
        
        // Mark as synced
        syncDao.markEventsSynced(events.map { it.event_id })
    }
}
