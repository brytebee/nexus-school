package com.nexus.school.ui

import android.os.Bundle
import android.widget.Toast
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nexus.school.security.IdentityManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class PrincipalActivity : AppCompatActivity() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private lateinit var identityManager: IdentityManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        identityManager = IdentityManager(this)

        val schoolName = identityManager.getSchoolName()
        val primaryColorHex = identityManager.getPrimaryColor()
        val primaryColor = try {
            Color(android.graphics.Color.parseColor(primaryColorHex))
        } catch (e: Exception) {
            Color(0xFF1A237E)
        }

        setContent {
            var isLoading by remember { mutableStateOf(true) }
            var dashboardData by remember { mutableStateOf<JSONObject?>(null) }

            fun loadDashboardStats() {
                isLoading = true
                scope.launch {
                    try {
                        val serverInfo = identityManager.getServerInfo()
                        val ip = serverInfo?.first ?: "192.168.137.1"
                        val port = serverInfo?.second ?: 3000
                        val rawJson = withContext(Dispatchers.IO) {
                            val url = URL("http://$ip:$port/api/dashboard-summary")
                            val conn = url.openConnection() as HttpURLConnection
                            conn.requestMethod = "GET"
                            if (conn.responseCode == 200) {
                                conn.inputStream.bufferedReader().use { it.readText() }
                            } else {
                                null
                            }
                        }
                        if (rawJson != null) {
                            dashboardData = JSONObject(rawJson)
                        } else {
                            Toast.makeText(this@PrincipalActivity, "Failed to load summary stats", Toast.LENGTH_SHORT).show()
                        }
                    } catch (e: Exception) {
                        Toast.makeText(this@PrincipalActivity, "Network Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    } finally {
                        isLoading = false
                    }
                }
            }

            LaunchedEffect(Unit) {
                loadDashboardStats()
            }

            MaterialTheme {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF050814)),
                    contentAlignment = Alignment.Center
                ) {
                    if (isLoading) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(color = primaryColor)
                            Spacer(modifier = Modifier.height(12.dp))
                            Text("Loading Dashboard Metrics...", color = Color.White.copy(alpha = 0.6f))
                        }
                    } else {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(24.dp)
                                .verticalScroll(rememberScrollState())
                        ) {
                            // Header
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 16.dp)
                            ) {
                                Text(
                                    text = "Principal Portal",
                                    color = Color.White,
                                    fontSize = 24.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.weight(1f)
                                )
                                Button(
                                    onClick = { loadDashboardStats() },
                                    colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text("Refresh", fontSize = 12.sp)
                                }
                            }

                            Text(
                                text = schoolName,
                                color = primaryColor,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(bottom = 24.dp)
                            )

                            dashboardData?.let { data ->
                                val students = data.optInt("students_count", 0)
                                val teachers = data.optInt("teachers_count", 0)
                                val classes = data.optInt("classes_count", 0)
                                val lastSync = data.optString("last_sync_time", "Never")

                                Text(
                                    text = "School Performance Snapshot",
                                    color = Color.White.copy(alpha = 0.7f),
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(bottom = 16.dp)
                                )

                                // Principal KPI Dashboard Grid
                                StatCard(title = "Total Enrolled Students", count = students, icon = "👥", color = primaryColor)
                                Spacer(modifier = Modifier.height(16.dp))
                                StatCard(title = "Total Active Staff/Teachers", count = teachers, icon = "👨‍🏫", color = Color(0xFF4ADE80))
                                Spacer(modifier = Modifier.height(16.dp))
                                StatCard(title = "Configured Classes & Arms", count = classes, icon = "🏫", color = Color(0xFFFFB300))
                                
                                Spacer(modifier = Modifier.height(32.dp))
                                Card(
                                    shape = RoundedCornerShape(12.dp),
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0C192E).copy(alpha = 0.4f)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(16.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text("🔄", fontSize = 18.sp, modifier = Modifier.padding(end = 12.dp))
                                        Column {
                                            Text("Last Roster/Grades Sync Event", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp)
                                            Text(lastSync, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable
    private fun StatCard(title: String, count: Int, icon: String, color: Color) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0C192E)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .background(color.copy(alpha = 0.1f), shape = RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(text = icon, fontSize = 28.sp)
                }
                Spacer(modifier = Modifier.width(20.dp))
                Column {
                    Text(text = title, color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(text = count.toString(), color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}
