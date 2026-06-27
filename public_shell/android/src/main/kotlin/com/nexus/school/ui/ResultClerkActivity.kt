package com.nexus.school.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import com.nexus.school.data.SyncDatabase
import com.nexus.school.security.IdentityManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class ResultClerkActivity : AppCompatActivity() {
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
            var classesList by remember { mutableStateOf<List<String>>(emptyList()) }
            var isCompiling by remember { mutableStateOf(false) }
            var compilingClass by remember { mutableStateOf("") }

            LaunchedEffect(Unit) {
                withContext(Dispatchers.IO) {
                    val db = SyncDatabase.getDatabase(this@ResultClerkActivity)
                    val students = db.studentDao().getAllStudents()
                    classesList = students.map { 
                        val arm = it.class_arm
                        if (!arm.isNullOrBlank()) "${it.class_name} $arm" else it.class_name 
                    }.distinct().filter { it.isNotBlank() }.sorted()
                }
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
                                text = "Result Clerk Portal",
                                color = Color.White,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1f)
                            )
                        }

                        Text(
                            text = schoolName,
                            color = primaryColor,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(bottom = 24.dp)
                        )

                        if (classesList.isEmpty()) {
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxWidth(),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "No class records found. Please sync device.",
                                    color = Color.White.copy(alpha = 0.5f),
                                    fontSize = 15.sp,
                                    textAlign = TextAlign.Center
                                )
                            }
                        } else {
                            Text(
                                text = "Select Class to Compile Terminal Reports",
                                color = Color.White.copy(alpha = 0.7f),
                                fontSize = 13.sp,
                                modifier = Modifier.padding(bottom = 12.dp)
                            )
                            LazyColumn(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                items(classesList) { className ->
                                    Card(
                                        shape = RoundedCornerShape(12.dp),
                                        colors = CardDefaults.cardColors(containerColor = Color(0xFF0C192E)),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                compilingClass = className
                                                isCompiling = true
                                                downloadReport(className) {
                                                    isCompiling = false
                                                }
                                            }
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(20.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                text = "🏫",
                                                fontSize = 24.sp,
                                                modifier = Modifier.padding(end = 16.dp)
                                            )
                                            Column {
                                                Text(
                                                    text = className,
                                                    color = Color.White,
                                                    fontSize = 16.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                                Text(
                                                    text = "Tap to compile and view PDF",
                                                    color = primaryColor,
                                                    fontSize = 12.sp
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (isCompiling) {
                        AlertDialog(
                            onDismissRequest = {},
                            confirmButton = {},
                            title = { Text("Compiling Terminal Reports", color = Color.White) },
                            text = {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    CircularProgressIndicator(color = primaryColor)
                                    Spacer(modifier = Modifier.height(16.dp))
                                    Text(
                                        text = "Requesting PDF build for $compilingClass. Please wait...",
                                        color = Color.White.copy(alpha = 0.7f),
                                        textAlign = TextAlign.Center
                                    )
                                }
                            },
                            containerColor = Color(0xFF0C192E)
                        )
                    }
                }
            }
        }
    }

    private fun downloadReport(className: String, onComplete: () -> Unit) {
        scope.launch {
            try {
                val serverInfo = identityManager.getServerInfo()
                val ip = serverInfo?.first ?: "192.168.137.1"
                val port = serverInfo?.second ?: 3000
                
                val file = withContext(Dispatchers.IO) {
                    val url = URL("http://$ip:$port/api/generate-report")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.setRequestProperty("X-Device-ID", identityManager.getDeviceId())
                    conn.doOutput = true
                    
                    val payload = "{\"class_name\":\"$className\"}"
                    conn.outputStream.use { os ->
                        os.write(payload.toByteArray(Charsets.UTF_8))
                    }

                    if (conn.responseCode == 200) {
                        val cacheFile = File(cacheDir, "TerminalReport_${className.replace(" ", "_")}.pdf")
                        FileOutputStream(cacheFile).use { fos ->
                            conn.inputStream.use { input ->
                                input.copyTo(fos)
                            }
                        }
                        cacheFile
                    } else {
                        null
                    }
                }

                onComplete()
                if (file != null && file.exists()) {
                    openPdf(file)
                } else {
                    Toast.makeText(this@ResultClerkActivity, "Failed to compile reports on server", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                onComplete()
                Toast.makeText(this@ResultClerkActivity, "Network Error: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun openPdf(file: File) {
        try {
            val uri = androidx.core.content.FileProvider.getUriForFile(
                this,
                "$packageName.fileprovider",
                file
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/pdf")
                flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NO_HISTORY
            }
            startActivity(Intent.createChooser(intent, "Open Terminal Reports"))
        } catch (e: Exception) {
            Toast.makeText(this, "Failed to open PDF viewer: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}
