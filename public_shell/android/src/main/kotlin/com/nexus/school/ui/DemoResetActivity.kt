package com.nexus.school.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nexus.school.data.SyncDatabase
import com.nexus.school.security.IdentityManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class DemoResetActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val schoolName = intent.getStringExtra("school_name") ?: "Nexus School"
        val primaryColorHex = intent.getStringExtra("primary_color") ?: "#1A237E"
        val primaryColor = try {
            Color(android.graphics.Color.parseColor(primaryColorHex))
        } catch (e: Exception) {
            Color(0xFF1A237E)
        }

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF0A0E2E)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "Nexus Demo Mode",
                            color = primaryColor,
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "It looks like this device is already married to $schoolName.",
                            color = Color.White.copy(alpha = 0.8f),
                            fontSize = 16.sp,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(32.dp))
                        
                        Button(
                            onClick = {
                                val nextIntent = Intent(this@DemoResetActivity, StudentRosterActivity::class.java)
                                nextIntent.putExtra("school_name", schoolName)
                                nextIntent.putExtra("primary_color", primaryColorHex)
                                startActivity(nextIntent)
                                finish()
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                            modifier = Modifier.fillMaxWidth().height(56.dp),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("Continue with Existing Data", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        OutlinedButton(
                            onClick = {
                                val identityManager = IdentityManager(this@DemoResetActivity)
                                identityManager.clearData()
                                
                                CoroutineScope(Dispatchers.IO).launch {
                                    val db = SyncDatabase.getDatabase(this@DemoResetActivity)
                                    db.clearAllTables()
                                    launch(Dispatchers.Main) {
                                        val nextIntent = Intent(this@DemoResetActivity, HandshakeActivity::class.java)
                                        startActivity(nextIntent)
                                        finish()
                                    }
                                }
                            },
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFF4444)),
                            modifier = Modifier.fillMaxWidth().height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, Color(0xFFFF4444).copy(alpha = 0.5f))
                        ) {
                            Text("Reset & Scan New QR", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}
