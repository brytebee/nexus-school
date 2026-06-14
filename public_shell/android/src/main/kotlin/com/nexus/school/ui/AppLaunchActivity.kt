package com.nexus.school.ui

import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.util.Base64
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nexus.school.data.SyncDatabase
import com.nexus.school.security.IdentityManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * AppLaunchActivity — the professional welcome screen shown when a device is
 * already "married" to a Hub. Previous name (DemoResetActivity) was inappropriate
 * for production schools.
 */
class AppLaunchActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val identityManager = IdentityManager(this)
        val schoolName      = identityManager.getSchoolName()
        val primaryColorHex = identityManager.getPrimaryColor()
        val teacherName     = identityManager.getTeacherName()
        val logoBase64      = identityManager.getLogoBase64()

        val primaryColor = try {
            Color(android.graphics.Color.parseColor(primaryColorHex))
        } catch (e: Exception) {
            Color(0xFF1A237E)
        }

        // Decode logo once outside of composition
        val logoBytes: ByteArray? = logoBase64?.let { b64 ->
            try {
                val raw = if (b64.contains(",")) b64.substringAfter(",") else b64
                Base64.decode(raw, Base64.DEFAULT)
            } catch (e: Exception) { null }
        }

        setContent {
            // Decode bitmap inside Compose so `remember` has a valid context
            val logoBitmap = remember(logoBytes) {
                logoBytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
            }
            // Fade-in entrance animation
            val alphaAnim = remember { Animatable(0f) }
            LaunchedEffect(Unit) { alphaAnim.animateTo(1f, tween(600)) }

            MaterialTheme {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(Color(0xFF050814), primaryColor.copy(alpha = 0.25f), Color(0xFF050814))
                            )
                        )
                        .alpha(alphaAnim.value),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        // ── School Logo (real image or emoji fallback) ──────────────────
                        Box(
                            modifier = Modifier
                                .size(96.dp)
                                .clip(CircleShape)
                                .background(primaryColor.copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center
                        ) {
                            if (logoBitmap != null) {
                                Image(
                                    bitmap = logoBitmap.asImageBitmap(),
                                    contentDescription = "School Logo",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize().clip(CircleShape)
                                )
                            } else {
                                Text(text = "🏫", fontSize = 44.sp)
                            }
                        }
                        Spacer(modifier = Modifier.height(20.dp))

                        Text(
                            text = schoolName,
                            color = primaryColor,
                            fontSize = 26.sp,
                            fontWeight = FontWeight.ExtraBold,
                            textAlign = TextAlign.Center
                        )
                        val teacherId = identityManager.getTeacherId()
                        val welcomeGreeting = if (teacherId == "STANDALONE_ADMIN") "Welcome back, Admin Extension" else "Welcome back, $teacherName"
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = welcomeGreeting,
                            color = Color.White.copy(alpha = 0.7f),
                            fontSize = 14.sp,
                            textAlign = TextAlign.Center
                        )

                        Spacer(modifier = Modifier.height(48.dp))

                        // Primary action
                        Button(
                            onClick = {
                                val nextIntent = Intent(this@AppLaunchActivity, StudentRosterActivity::class.java)
                                nextIntent.putExtra("school_name", schoolName)
                                nextIntent.putExtra("primary_color", primaryColorHex)
                                startActivity(nextIntent)
                                finish()
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                            shape = RoundedCornerShape(14.dp)
                        ) {
                            Text(
                                "Open Class Roster  →",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        // Danger action — kept but no longer labelled "Demo"
                        OutlinedButton(
                            onClick = {
                                identityManager.clearData()
                                CoroutineScope(Dispatchers.IO).launch {
                                    SyncDatabase.getDatabase(this@AppLaunchActivity).clearAllTables()
                                    launch(Dispatchers.Main) {
                                        startActivity(Intent(this@AppLaunchActivity, HandshakeActivity::class.java))
                                        finish()
                                    }
                                }
                            },
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFF4444)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            shape = RoundedCornerShape(14.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFF4444).copy(alpha = 0.4f))
                        ) {
                            Text("Disconnect & Scan New QR", fontSize = 14.sp)
                        }
                    }
                }
            }
        }
    }
}


