package com.nexus.school.ui

import android.os.Bundle
import android.widget.Toast
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ItAdminActivity : AppCompatActivity() {
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
            var devicesList by remember { mutableStateOf<List<JSONObject>>(emptyList()) }

            fun loadDevices() {
                isLoading = true
                scope.launch {
                    try {
                        val serverInfo = identityManager.getServerInfo()
                        val ip = serverInfo?.first ?: "192.168.137.1"
                        val port = serverInfo?.second ?: 3000
                        val rawJson = withContext(Dispatchers.IO) {
                            val url = URL("http://$ip:$port/api/devices")
                            val conn = url.openConnection() as HttpURLConnection
                            conn.requestMethod = "GET"
                            if (conn.responseCode == 200) {
                                conn.inputStream.bufferedReader().use { it.readText() }
                            } else {
                                null
                            }
                        }
                        if (rawJson != null) {
                            val obj = JSONObject(rawJson)
                            val arr = obj.optJSONArray("devices") ?: JSONArray()
                            devicesList = (0 until arr.length()).map { arr.getJSONObject(it) }
                        } else {
                            Toast.makeText(this@ItAdminActivity, "Failed to load devices", Toast.LENGTH_SHORT).show()
                        }
                    } catch (e: Exception) {
                        Toast.makeText(this@ItAdminActivity, "Network Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    } finally {
                        isLoading = false
                    }
                }
            }

            fun revokeDevice(deviceId: String) {
                scope.launch {
                    try {
                        val serverInfo = identityManager.getServerInfo()
                        val ip = serverInfo?.first ?: "192.168.137.1"
                        val port = serverInfo?.second ?: 3000
                        val success = withContext(Dispatchers.IO) {
                            val url = URL("http://$ip:$port/api/revoke-device")
                            val conn = url.openConnection() as HttpURLConnection
                            conn.requestMethod = "POST"
                            conn.setRequestProperty("Content-Type", "application/json")
                            conn.doOutput = true
                            val payload = "{\"device_id\":\"$deviceId\"}"
                            conn.outputStream.use { os ->
                                os.write(payload.toByteArray(Charsets.UTF_8))
                            }
                            conn.responseCode == 200
                        }
                        if (success) {
                            Toast.makeText(this@ItAdminActivity, "Device Revoked Successfully", Toast.LENGTH_SHORT).show()
                            loadDevices()
                        } else {
                            Toast.makeText(this@ItAdminActivity, "Failed to revoke device", Toast.LENGTH_SHORT).show()
                        }
                    } catch (e: Exception) {
                        Toast.makeText(this@ItAdminActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }

            LaunchedEffect(Unit) {
                loadDevices()
            }

            MaterialTheme {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF050814)),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp)
                    ) {
                        // Title bar
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 16.dp)
                        ) {
                            Text(
                                text = "IT Security Center",
                                color = Color.White,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1f)
                            )
                            Button(
                                onClick = { loadDevices() },
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

                        if (isLoading) {
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxWidth(),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator(color = primaryColor)
                            }
                        } else if (devicesList.isEmpty()) {
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxWidth(),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "No companion tablets currently paired.",
                                    color = Color.White.copy(alpha = 0.5f),
                                    fontSize = 15.sp,
                                    textAlign = TextAlign.Center
                                )
                            }
                        } else {
                            Text(
                                text = "Paired Companion Devices (${devicesList.size})",
                                color = Color.White.copy(alpha = 0.7f),
                                fontSize = 13.sp,
                                modifier = Modifier.padding(bottom = 12.dp)
                            )
                            LazyColumn(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                items(devicesList) { device ->
                                    val devId = device.optString("device_id", "N/A")
                                    val model = device.optString("device_model", "Android Tablet")
                                    val label = device.optString("label", "Staff Member")
                                    val pairedAt = device.optString("paired_at", "N/A")

                                    Card(
                                        shape = RoundedCornerShape(12.dp),
                                        colors = CardDefaults.cardColors(containerColor = Color(0xFF0C192E)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Column(modifier = Modifier.padding(20.dp)) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Column {
                                                    Text(
                                                        text = model,
                                                        color = Color.White,
                                                        fontSize = 16.sp,
                                                        fontWeight = FontWeight.Bold
                                                    )
                                                    Text(
                                                        text = label,
                                                        color = primaryColor,
                                                        fontSize = 12.sp
                                                    )
                                                }
                                                // Revoke Button
                                                Button(
                                                    onClick = {
                                                        android.app.AlertDialog.Builder(this@ItAdminActivity)
                                                            .setTitle("Revoke Access")
                                                            .setMessage("Are you sure you want to revoke database sync access for $model ($label)? This action takes effect immediately.")
                                                            .setPositiveButton("Revoke") { _, _ -> revokeDevice(devId) }
                                                            .setNegativeButton("Cancel", null)
                                                            .show()
                                                    },
                                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF44336)),
                                                    shape = RoundedCornerShape(8.dp)
                                                ) {
                                                    Text("Revoke", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                            Spacer(modifier = Modifier.height(12.dp))
                                            Text(
                                                text = "Device ID: $devId",
                                                color = Color.White.copy(alpha = 0.5f),
                                                fontSize = 11.sp
                                            )
                                            Text(
                                                text = "Paired On: $pairedAt",
                                                color = Color.White.copy(alpha = 0.5f),
                                                fontSize = 11.sp
                                            )
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
}
