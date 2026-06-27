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
import java.text.NumberFormat
import java.util.Locale

class BursarActivity : AppCompatActivity() {
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
            var financeData by remember { mutableStateOf<JSONObject?>(null) }

            fun loadFeesSummary() {
                isLoading = true
                scope.launch {
                    try {
                        val serverInfo = identityManager.getServerInfo()
                        val ip = serverInfo?.first ?: "192.168.137.1"
                        val port = serverInfo?.second ?: 3000
                        val rawJson = withContext(Dispatchers.IO) {
                            val url = URL("http://$ip:$port/api/fees/summary")
                            val conn = url.openConnection() as HttpURLConnection
                            conn.requestMethod = "GET"
                            if (conn.responseCode == 200) {
                                conn.inputStream.bufferedReader().use { it.readText() }
                            } else {
                                null
                            }
                        }
                        if (rawJson != null) {
                            financeData = JSONObject(rawJson)
                        } else {
                            Toast.makeText(this@BursarActivity, "Failed to connect to server", Toast.LENGTH_SHORT).show()
                        }
                    } catch (e: Exception) {
                        Toast.makeText(this@BursarActivity, "Network Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    } finally {
                        isLoading = false
                    }
                }
            }

            LaunchedEffect(Unit) {
                loadFeesSummary()
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
                            Text("Loading Finance Ledger...", color = Color.White.copy(alpha = 0.6f))
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
                                    text = "Bursar Finance Hub",
                                    color = Color.White,
                                    fontSize = 24.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.weight(1f)
                                )
                                Button(
                                    onClick = { loadFeesSummary() },
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

                            financeData?.let { data ->
                                val session = data.optString("academic_session", "N/A")
                                val term = data.optString("term", "N/A")
                                val billed = data.optDouble("total_billed", 0.0)
                                val paid = data.optDouble("total_paid", 0.0)
                                val outstanding = data.optDouble("total_outstanding", 0.0)
                                val counts = data.optJSONObject("status_counts") ?: JSONObject()

                                Text(
                                    text = "Active Term: $session — $term",
                                    color = Color.White.copy(alpha = 0.7f),
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(bottom = 16.dp)
                                )

                                // Financial metric cards
                                MetricCard(title = "Total Billed Fees", amount = billed, color = Color(0xFFFFB300))
                                Spacer(modifier = Modifier.height(12.dp))
                                MetricCard(title = "Total Fees Collected", amount = paid, color = Color(0xFF4ADE80))
                                Spacer(modifier = Modifier.height(12.dp))
                                MetricCard(title = "Total Outstanding Debt", amount = outstanding, color = Color(0xFFF44336))

                                Spacer(modifier = Modifier.height(28.dp))
                                Text(
                                    text = "Payment Clearances Breakdown",
                                    color = Color.White,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(bottom = 12.dp)
                                )

                                RosterCountRow(label = "Fully Cleared Students", count = counts.optInt("cleared", 0), color = Color(0xFF4ADE80))
                                Spacer(modifier = Modifier.height(8.dp))
                                RosterCountRow(label = "Partially Paid Students", count = counts.optInt("partial", 0), color = Color(0xFFFFB300))
                                Spacer(modifier = Modifier.height(8.dp))
                                RosterCountRow(label = "Fully Unpaid Students", count = counts.optInt("unpaid", 0), color = Color(0xFFF44336))
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable
    private fun MetricCard(title: String, amount: Double, color: Color) {
        val formatter = NumberFormat.getCurrencyInstance(Locale("en", "NG"))
        val formattedAmount = try {
            formatter.format(amount).replace("NGN", "₦").replace("₦", "₦ ")
        } catch (e: Exception) {
            "₦ " + String.format("%.2f", amount)
        }

        Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0C192E)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(text = title, color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
                Spacer(modifier = Modifier.height(6.dp))
                Text(text = formattedAmount, color = color, fontSize = 24.sp, fontWeight = FontWeight.Bold)
            }
        }
    }

    @Composable
    private fun RosterCountRow(label: String, count: Int, color: Color) {
        Card(
            shape = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0C192E).copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .padding(14.dp)
                    .fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = label, color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
                Box(
                    modifier = Modifier
                        .background(color.copy(alpha = 0.15f), shape = RoundedCornerShape(4.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "$count Students",
                        color = color,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
