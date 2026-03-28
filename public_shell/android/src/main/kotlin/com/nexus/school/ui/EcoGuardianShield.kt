package com.nexus.school.ui

import android.os.PowerManager
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/**
 * The Eco-Guardian Shield 🛡️
 *
 * A breathing, colour-reactive shield in the corner of any screen.
 * Green  → Cool device, all systems nominal.
 * Amber  → Warming up, slow-mode approaching.
 * Red    → Hot! Sync paused to protect the teacher's hardware.
 *
 * Tap it to reveal the tooltip.
 */
@Composable
fun EcoGuardianShield(modifier: Modifier = Modifier) {
    val context = LocalContext.current

    // ── Thermal state polling (every 3 seconds) ──────────────────────────────
    var thermalStatus by remember { mutableIntStateOf(PowerManager.THERMAL_STATUS_NONE) }

    LaunchedEffect(Unit) {
        val powerManager = context.getSystemService(PowerManager::class.java)
        while (true) {
            thermalStatus = powerManager?.currentThermalStatus ?: PowerManager.THERMAL_STATUS_NONE
            delay(3_000L)
        }
    }

    // ── Derived display values ────────────────────────────────────────────────
    val (shieldColor, label) = when {
        thermalStatus >= PowerManager.THERMAL_STATUS_SEVERE ->
            Color(0xFFE53935) to "🔴 Device hot — sync paused"
        thermalStatus >= PowerManager.THERMAL_STATUS_MODERATE ->
            Color(0xFFFFB300) to "🟡 Warming up — eco mode active"
        else ->
            Color(0xFF43A047) to "🟢 Device protected by Nexus Eco-Guardian"
    }

    val animatedColor by animateColorAsState(
        targetValue = shieldColor,
        animationSpec = tween(durationMillis = 600),
        label = "shieldColor"
    )

    // ── Breathing pulse animation ─────────────────────────────────────────────
    val infiniteTransition = rememberInfiniteTransition(label = "breath")
    val scale by infiniteTransition.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "breathScale"
    )

    // ── Tooltip toggle ────────────────────────────────────────────────────────
    var showTooltip by remember { mutableStateOf(false) }

    Box(
        modifier = modifier,
        contentAlignment = Alignment.TopEnd
    ) {
        Column(horizontalAlignment = Alignment.End) {
            // The shield bubble
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .scale(scale)
                    .background(
                        color = animatedColor.copy(alpha = 0.20f),
                        shape = CircleShape
                    )
                    .clickable { showTooltip = !showTooltip },
                contentAlignment = Alignment.Center
            ) {
                Text(text = "🛡", fontSize = 20.sp)
            }

            // Tooltip
            if (showTooltip) {
                Spacer(modifier = Modifier.height(6.dp))
                Box(
                    modifier = Modifier
                        .background(
                            color = Color(0xFF1A1A2E),
                            shape = RoundedCornerShape(10.dp)
                        )
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = label,
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}
