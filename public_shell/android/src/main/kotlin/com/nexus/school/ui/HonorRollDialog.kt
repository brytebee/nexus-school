package com.nexus.school.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.nexus.school.data.HonorRollItem
import kotlinx.coroutines.delay
import kotlin.random.Random

// High-performance Native Kotlin Canvas Confetti System
@Composable
fun FullScreenConfetti(modifier: Modifier = Modifier) {
    val particles = remember { List(80) { ConfettiParticle() } }
    
    var time by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        // Run animation loop for 3 seconds
        val startTime = System.currentTimeMillis()
        while (System.currentTimeMillis() - startTime < 3000) {
            time = (System.currentTimeMillis() - startTime) / 1000f
            kotlinx.coroutines.delay(16) // ~60fps
        }
    }

    Canvas(modifier = modifier.fillMaxSize()) {
        particles.forEach { p ->
            val elapsed = time * p.speed
            val currentY = p.y + (elapsed * size.height * 0.4f)
            if (currentY < size.height) {
                val currentX = p.x + kotlin.math.sin(elapsed * p.wobbleSpeed) * p.wobbleRange
                drawCircle(
                    color = p.color,
                    radius = p.size,
                    center = Offset(x = currentX, y = currentY)
                )
            }
        }
    }
}

private class ConfettiParticle {
    val x = Random.nextFloat() * 1500f // Fallback width map
    val y = Random.nextFloat() * -1000f
    val speed = 0.5f + Random.nextFloat() * 1.5f
    val size = 8f + Random.nextFloat() * 12f
    val color = listOf(Color(0xFFFFB300), Color(0xFF4ADE80), Color(0xFF00E5FF), Color(0xFFFF4081)).random()
    val wobbleSpeed = 1f + Random.nextFloat() * 3f
    val wobbleRange = 20f + Random.nextFloat() * 50f
}

@Composable
fun HonorRollDialog(
    topStudents: List<HonorRollItem>,
    primaryColor: Color,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .wrapContentHeight()
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 20.dp),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF13151A))
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "🏆",
                        fontSize = 48.sp,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                    Text(
                        text = "The Honor Roll",
                        color = primaryColor,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Top 3 highest scores sent to Hub!",
                        color = Color.White.copy(alpha = 0.6f),
                        fontSize = 12.sp,
                        modifier = Modifier.padding(bottom = 20.dp)
                    )

                    topStudents.forEachIndexed { index, student ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(12.dp))
                                .padding(12.dp)
                                .padding(bottom = if (index < topStudents.size - 1) 8.dp else 0.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "#${index + 1}",
                                color = if (index == 0) Color(0xFFFFD700) else Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                modifier = Modifier.width(30.dp)
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(text = student.name, color = Color.White, fontSize = 14.sp)
                                Text(text = student.subject, color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp)
                            }
                            Text(
                                text = "${student.score}",
                                color = primaryColor,
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp
                            )
                        }
                        if (index < topStudents.size - 1) Spacer(modifier = Modifier.height(8.dp))
                    }

                    Spacer(modifier = Modifier.height(24.dp))
                    Button(
                        onClick = onDismiss,
                        colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Continue", color = Color.Black, fontWeight = FontWeight.Bold)
                    }
                }
            }
            
            // Fullscreen Confetti Overlay bursts out from behind/top of card
            FullScreenConfetti(modifier = Modifier.matchParentSize())
        }
    }
}
