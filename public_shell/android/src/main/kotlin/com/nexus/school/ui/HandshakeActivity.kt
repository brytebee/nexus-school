package com.nexus.school.ui

import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.nexus.school.R
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.nexus.school.network.DeviceResponse
import com.nexus.school.network.HandshakeResponse
import com.nexus.school.network.HandshakeService
import com.nexus.school.security.IdentityManager
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.decodeFromString
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.nexus.school.data.SyncDatabase
import kotlinx.coroutines.delay
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.animation.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp

class HandshakeActivity : AppCompatActivity() {
    private val scope = MainScope()
    private val handshakeService = HandshakeService()
    private lateinit var identityManager: IdentityManager
    private lateinit var previewView: PreviewView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_handshake)
        
        previewView = findViewById(R.id.previewView)
        identityManager = IdentityManager(this)
        
        findViewById<android.widget.Button>(R.id.manual_setup_btn).apply {
            text = "Can't Scan? Connect with PIN"
            setOnClickListener {
                showPinSetupDialog()
            }
        }

        handleIncomingIntent(intent)
        checkCameraPermission()
    }

    override fun onNewIntent(intent: android.content.Intent?) {
        super.onNewIntent(intent)
        intent?.let { handleIncomingIntent(it) }
    }

    private fun handleIncomingIntent(intent: android.content.Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "nexus" && uri.host == "pair") {
            val ip = uri.getQueryParameter("ip")
            val port = uri.getQueryParameter("port")?.toIntOrNull() ?: 3000
            val pin = uri.getQueryParameter("pin")
            if (!ip.isNullOrEmpty() && !pin.isNullOrEmpty()) {
                Log.d("Handshake", "Deep link pairing requested: $ip:$port PIN: $pin")
                connectWithPin(ip, port, pin)
            }
        }
    }

    private fun showPinSetupDialog() {
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(64, 32, 64, 16)
        }

        val lastServer = identityManager.getServerInfo()
        val ipInput = android.widget.EditText(this).apply {
            hint = "Hub IP (e.g. 192.168.1.100)"
            setText(lastServer?.first ?: "")
            inputType = android.text.InputType.TYPE_CLASS_PHONE
        }

        val pinInput = android.widget.EditText(this).apply {
            hint = "6-Digit Pairing PIN"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(android.text.InputFilter.LengthFilter(7))
        }

        layout.addView(android.widget.TextView(this).apply {
            text = "School Hub IP Address:"
            textSize = 12f
            setTextColor(android.graphics.Color.LTGRAY)
        })
        layout.addView(ipInput)

        layout.addView(android.widget.TextView(this).apply {
            text = "Pairing PIN (shown on PC screen):"
            textSize = 12f
            setTextColor(android.graphics.Color.LTGRAY)
            setPadding(0, 24, 0, 0)
        })
        layout.addView(pinInput)

        android.app.AlertDialog.Builder(this)
            .setTitle("🔑 Connect with PIN")
            .setMessage("Look at the School PC screen to get the Hub IP and 6-digit PIN.")
            .setView(layout)
            .setPositiveButton("Connect") { _, _ ->
                val ip = ipInput.text.toString().trim()
                val pin = pinInput.text.toString().trim().replace(" ", "")
                if (ip.isNotEmpty() && pin.length >= 6) {
                    connectWithPin(ip, 3000, pin)
                } else {
                    android.widget.Toast.makeText(this, "Please enter both Hub IP and 6-digit PIN", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun checkCameraPermission() {
        if (androidx.core.content.ContextCompat.checkSelfPermission(
                this,
                android.Manifest.permission.CAMERA
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            startScanning(previewView, identityManager)
        } else {
            androidx.core.app.ActivityCompat.requestPermissions(
                this,
                arrayOf(android.Manifest.permission.CAMERA),
                1001
            )
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1001 && grantResults.isNotEmpty() && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            startScanning(previewView, identityManager)
        } else {
            Log.e("Handshake", "Camera permission denied")
            // In a real app, show a dialog explaining why we need it
        }
    }

    private var camera: Camera? = null

    private var cameraProvider: ProcessCameraProvider? = null

    @Suppress("DEPRECATION")
    private fun startScanning(previewView: PreviewView, identityManager: IdentityManager) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            cameraProvider = cameraProviderFuture.get()
            
            // Unbind all use cases before binding them to ensure we don't have dangling instances
            cameraProvider?.unbindAll()
            
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

            val options = BarcodeScannerOptions.Builder()
                .setBarcodeFormats(com.google.mlkit.vision.barcode.common.Barcode.FORMAT_QR_CODE)
                .build()
            val barcodeScanner = BarcodeScanning.getClient(options)
            
            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setTargetResolution(android.util.Size(1280, 720))
                .build()
                .also {
                    it.setAnalyzer(ContextCompat.getMainExecutor(this)) { imageProxy ->
                        processImageProxy(barcodeScanner, imageProxy, identityManager)
                    }
                }

            try {
                camera = cameraProvider?.bindToLifecycle(
                    this, 
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    imageAnalyzer
                )
                Log.d("Handshake", "Camera bound to lifecycle successfully")
            } catch (e: Exception) {
                Log.e("Handshake", "Use case binding failed", e)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraProvider?.unbindAll()
    }

    private var frameCount = 0
    private fun processImageProxy(
        barcodeScanner: com.google.mlkit.vision.barcode.BarcodeScanner,
        imageProxy: ImageProxy,
        identityManager: IdentityManager
    ) {
        frameCount++
        if (frameCount % 60 == 0) {
            Log.d("Handshake", "Processing frame $frameCount. (Width: ${imageProxy.width}, Height: ${imageProxy.height})")
        }

        @androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
        val mediaImage = imageProxy.image
        if (mediaImage != null) {
            val image = com.google.mlkit.vision.common.InputImage.fromMediaImage(
                mediaImage,
                imageProxy.imageInfo.rotationDegrees
            )
            barcodeScanner.process(image)
                .addOnSuccessListener { barcodes ->
                    if (barcodes.isNotEmpty()) {
                        Log.d("Handshake", "Found ${barcodes.size} potential barcodes")
                    }
                    for (barcode in barcodes) {
                        barcode.rawValue?.let { qrJson ->
                            Log.d("Handshake", "Decoded QR Content Length: ${qrJson.length}")
                            onQrScanned(qrJson, identityManager)
                        }
                    }
                }
                .addOnFailureListener { e ->
                    Log.e("Handshake", "Barcode scanning failed", e)
                }
                .addOnCompleteListener {
                    imageProxy.close()
                }
        } else {
            imageProxy.close()
        }
    }

    private var isHandshaking = false

    private fun onQrScanned(qrJson: String, identityManager: IdentityManager) {
        if (isHandshaking) return
        isHandshaking = true

        scope.launch {
            try {
                Log.d("Handshake", "Scanned JSON: $qrJson")
                val payload = Json { ignoreUnknownKeys = true }.decodeFromString<com.nexus.school.network.QrPayload>(qrJson)
                
                // Save IP and Port for future syncs
                identityManager.saveServerInfo(payload.ip, payload.port)
                
                // Adopt the Identity dictated by the Admin Dropdown!
                if (payload.teacher_id != null && payload.teacher_name != null) {
                    identityManager.saveTeacherIdentity(payload.teacher_id, payload.teacher_name)
                    Log.d("Handshake", "Adopted Identity: ${payload.teacher_name} [${payload.teacher_id}]")
                }
                
                runOnUiThread {
                    val schoolDisplayName = payload.config.name ?: "Nexus School"
                    android.widget.Toast.makeText(this@HandshakeActivity, "Syncing with $schoolDisplayName...", android.widget.Toast.LENGTH_SHORT).show()
                }

                val deviceModel = "${android.os.Build.BRAND} ${android.os.Build.MODEL}"
                identityManager.saveDeviceModel(deviceModel)

                val response = DeviceResponse(
                    device_id = identityManager.getDeviceId(),
                    teacher_id = identityManager.getTeacherId(),
                    teacher_name = identityManager.getTeacherName(),
                    public_key = identityManager.getPublicKey(),
                    thermal_status = identityManager.getThermalStatus(),
                    device_model = deviceModel
                )

                val result = kotlinx.coroutines.withTimeout(15_000L) {
                    handshakeService.performHandshake(payload.ip, payload.port, response)
                }
                
                if (result != null) {
                    onHandshakeSuccess(result)
                } else {
                    isHandshaking = false
                    runOnUiThread {
                        android.widget.Toast.makeText(this@HandshakeActivity, "Handshake failed. Check Hub IP.", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                isHandshaking = false
                Log.e("Handshake", "QR Handshake error", e)
                runOnUiThread {
                    android.widget.Toast.makeText(this@HandshakeActivity, e.message ?: "Handshake error", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun connectWithPin(ip: String, port: Int, pin: String) {
        if (isHandshaking) return
        isHandshaking = true

        scope.launch {
            try {
                runOnUiThread {
                    android.widget.Toast.makeText(this@HandshakeActivity, "Connecting with PIN to $ip:$port...", android.widget.Toast.LENGTH_SHORT).show()
                }

                identityManager.saveServerInfo(ip, port)

                val deviceModel = "${android.os.Build.BRAND} ${android.os.Build.MODEL}"
                identityManager.saveDeviceModel(deviceModel)

                val response = DeviceResponse(
                    device_id = identityManager.getDeviceId(),
                    teacher_id = "",
                    teacher_name = "",
                    public_key = identityManager.getPublicKey(),
                    thermal_status = identityManager.getThermalStatus(),
                    device_model = deviceModel
                )

                val result = kotlinx.coroutines.withTimeout(15_000L) {
                    handshakeService.performHandshakeWithPin(ip, port, pin, response)
                }

                if (result != null) {
                    onHandshakeSuccess(result)
                } else {
                    isHandshaking = false
                    runOnUiThread {
                        android.widget.Toast.makeText(this@HandshakeActivity, "Handshake failed. Check Hub IP & PIN.", android.widget.Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                isHandshaking = false
                Log.e("Handshake", "PIN Handshake error", e)
                runOnUiThread {
                    android.widget.Toast.makeText(this@HandshakeActivity, e.message ?: "Connection failed", android.widget.Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun onHandshakeSuccess(result: HandshakeResponse) {
        runOnUiThread {
            if (result.teacher_id != null && result.teacher_name != null) {
                identityManager.saveTeacherIdentity(result.teacher_id, result.teacher_name)
                Log.d("Handshake", "Adopted Identity: ${result.teacher_name} [${result.teacher_id}]")
            }
            android.widget.Toast.makeText(this@HandshakeActivity, "Marriage Successful! 🎉", android.widget.Toast.LENGTH_LONG).show()
            Log.d("Handshake", "Marriage Successful: $result")
            
            setContent {
                            val config = result.school_config
                            val students = result.students
                            // Server normalises the field to primary_color; fall back to themePrimary
                            // for backwards compat, then hardcode navy as last resort.
                            val primaryColorStr = config.primary_color
                                ?: config.themePrimary
                                ?: "#1A237E"
                            val primaryColor = try {
                                Color(android.graphics.Color.parseColor(primaryColorStr))
                            } catch (e: Exception) {
                                Color(0xFF1A237E)
                            }

                            val logoBytes: ByteArray? = remember(config.logoBase64) {
                                config.logoBase64?.let { b64 ->
                                    try {
                                        val raw = if (b64.contains(",")) b64.substringAfter(",") else b64
                                        Base64.decode(raw, Base64.DEFAULT)
                                    } catch (e: Exception) { null }
                                }
                            }
                            val logoBitmap = remember(logoBytes) {
                                logoBytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
                            }
                            
                            var showProgress by remember { mutableStateOf(students.isNotEmpty()) }
                            var progressAmount by remember { mutableStateOf(0f) }
                            var isTorchEnabled by remember { mutableStateOf(false) }

                            LaunchedEffect(Unit) {
                                // Save Master Subject List and per-class subject map
                                if (result.all_subjects.isNotEmpty()) {
                                    identityManager.saveMasterSubjectList(result.all_subjects)
                                }
                                if (result.class_subjects.isNotEmpty()) {
                                    identityManager.saveClassSubjectsMap(result.class_subjects)
                                }
                                val assignedSubjects = students.map { it.subject }.distinct()
                                identityManager.saveTeacherAssignedSubjects(assignedSubjects)

                                if (students.isNotEmpty()) {
                                    val db = SyncDatabase.getDatabase(this@HandshakeActivity)
                                    for (i in 1..10) {
                                        delay(150)
                                        progressAmount = i / 10f
                                    }
                                    db.studentDao().insertAll(students)
                                    // Restore pre-existing Hub scores so the grades sheet
                                    // is pre-populated immediately after marriage.
                                    if (result.scores.isNotEmpty()) {
                                        db.studentDao().clearAllScores()
                                        db.studentDao().insertScores(result.scores)
                                        Log.d("Handshake", "Restored ${result.scores.size} score records from Hub")
                                    }
                                    showProgress = false
                                }
                            }

                            MaterialTheme(
                                colorScheme = MaterialTheme.colorScheme.copy(
                                    primary = primaryColor,
                                    background = Color(0xFF050814),
                                    onPrimary = Color.White,
                                    onBackground = Color.White
                                )
                            ) {
                                Scaffold(
                                    floatingActionButton = {
                                        FloatingActionButton(
                                            onClick = {
                                                isTorchEnabled = !isTorchEnabled
                                                camera?.cameraControl?.enableTorch(isTorchEnabled)
                                                Log.d("Handshake", "Flashlight enabled: $isTorchEnabled")
                                            },
                                            containerColor = if (isTorchEnabled) Color.Yellow else Color.White,
                                            contentColor = Color.Black
                                        ) {
                                            Text(if (isTorchEnabled) "OFF" else "💡")
                                        }
                                    }
                                ) { padding ->
                                    Box(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .padding(padding)
                                            .background(
                                                Brush.verticalGradient(
                                                    colors = listOf(Color(0xFF050814), primaryColor.copy(alpha = 0.25f), Color(0xFF050814))
                                                )
                                            ),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Column(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(32.dp),
                                            horizontalAlignment = Alignment.CenterHorizontally,
                                            verticalArrangement = Arrangement.Center
                                        ) {
                                            // School Logo (real image or emoji fallback)
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
                                                text = "Synced with",
                                                color = Color.White.copy(alpha = 0.6f),
                                                fontSize = 14.sp,
                                                fontWeight = FontWeight.Normal,
                                                textAlign = TextAlign.Center
                                            )
                                            Spacer(modifier = Modifier.height(4.dp))
                                            Text(
                                                text = config.name ?: "Nexus School",
                                                color = primaryColor,
                                                fontSize = 26.sp,
                                                fontWeight = FontWeight.ExtraBold,
                                                textAlign = TextAlign.Center
                                            )
                                            Spacer(modifier = Modifier.height(8.dp))
                                            Text(
                                                text = "Modules Enabled: ${config.modules.joinToString()}",
                                                color = Color.White.copy(alpha = 0.6f),
                                                fontSize = 14.sp,
                                                textAlign = TextAlign.Center
                                            )
                                            
                                            if (showProgress) {
                                                Spacer(modifier = Modifier.height(32.dp))
                                                Text(
                                                    "Organizing Class Records... ${(progressAmount * 100).toInt()}%", 
                                                    color = Color.White,
                                                    style = MaterialTheme.typography.bodyLarge
                                                )
                                                Spacer(modifier = Modifier.height(8.dp))
                                                LinearProgressIndicator(
                                                    progress = progressAmount,
                                                    modifier = Modifier.fillMaxWidth(0.8f).height(8.dp),
                                                    color = Color.White,
                                                    trackColor = Color(0x44FFFFFF)
                                                )
                                            } else {
                                                // Shared lambda so both branches use identical persist + navigate logic
                                                val navigateToRoster: () -> Unit = {
                                                    identityManager.saveSchoolBranding(
                                                        config.name ?: "Nexus School",
                                                        primaryColorStr
                                                    )
                                                    identityManager.saveLogoBase64(config.logoBase64)
                                                    identityManager.saveRegistrationLocked(config.registration_locked == true)
                                                    identityManager.saveRegistrationLockAt(config.registration_lock_at ?: 0L)
                                                    identityManager.saveGradesLocked(config.grades_locked == true)
                                                    identityManager.saveAttendanceLocked(config.attendance_locked == true)
                                                    identityManager.saveGradesLockAt(config.grades_lock_at ?: 0L)
                                                    identityManager.saveAttendanceLockAt(config.attendance_lock_at ?: 0L)
                                                    if (config.modules.isNotEmpty()) {
                                                        identityManager.saveTierModules(config.modules)
                                                    }
                                                    config.plan_tier?.takeIf { it.isNotBlank() }?.let {
                                                        identityManager.savePlanTier(it)
                                                    }
                                                    identityManager.saveRole(result.role ?: "teacher")
                                                    val scoreJson = buildString {
                                                        append("[")
                                                        result.score_components.forEachIndexed { idx, comp ->
                                                            if (idx > 0) append(",")
                                                            append("{\"key\":\"${comp.key}\",\"label\":\"${comp.label}\",\"max\":${comp.max}}")
                                                        }
                                                        append("]")
                                                    }
                                                    identityManager.saveScoreComponents(scoreJson)
                                                    identityManager.saveFormClass(result.form_class)
                                                    startActivity(android.content.Intent(this@HandshakeActivity, AppLaunchActivity::class.java))
                                                    finish()
                                                }

                                                if (students.isNotEmpty()) {
                                                    Spacer(modifier = Modifier.height(24.dp))
                                                    Box(
                                                        modifier = Modifier
                                                            .background(Color(0xFF0C192E), shape = RoundedCornerShape(12.dp))
                                                            .border(1.dp, Color(0x3300E676), shape = RoundedCornerShape(12.dp))
                                                            .padding(horizontal = 20.dp, vertical = 10.dp)
                                                    ) {
                                                        Row(
                                                            verticalAlignment = Alignment.CenterVertically,
                                                            horizontalArrangement = Arrangement.Center
                                                        ) {
                                                            Text(
                                                                text = "✅",
                                                                fontSize = 16.sp,
                                                                modifier = Modifier.padding(end = 8.dp)
                                                            )
                                                            Text(
                                                                text = "${students.map { it.id }.distinct().size} Students Safely Digested",
                                                                color = Color(0xFF00E676),
                                                                fontSize = 14.sp,
                                                                fontWeight = FontWeight.Bold
                                                            )
                                                        }
                                                    }
                                                    Spacer(modifier = Modifier.height(24.dp))
                                                    Button(
                                                        onClick = navigateToRoster,
                                                        colors = ButtonDefaults.buttonColors(
                                                            containerColor = primaryColor,
                                                            contentColor = Color.White
                                                        ),
                                                        modifier = Modifier
                                                            .fillMaxWidth(0.8f)
                                                            .height(56.dp),
                                                        shape = RoundedCornerShape(14.dp)
                                                    ) {
                                                        Text("View Class Roster  →", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                                                    }
                                                } else {
                                                    // Fallback: handshake succeeded but no students assigned yet
                                                    Spacer(modifier = Modifier.height(16.dp))
                                                    Text(
                                                        "⚠️ No students assigned to you yet.",
                                                        color = Color(0xFFFFCC80),
                                                        style = MaterialTheme.typography.bodyMedium,
                                                        textAlign = TextAlign.Center
                                                    )
                                                    Spacer(modifier = Modifier.height(24.dp))
                                                    OutlinedButton(
                                                        onClick = navigateToRoster,
                                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                                                        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.5f)),
                                                        modifier = Modifier
                                                            .fillMaxWidth(0.8f)
                                                            .height(56.dp),
                                                        shape = RoundedCornerShape(14.dp)
                                                    ) {
                                                        Text("Continue Anyway  →", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                                                    }
                                                }
                                            }
                                            
                                            val thermalState = identityManager.getThermalStatus()
                                            if (thermalState == "CRITICAL") {
                                                Spacer(modifier = Modifier.height(24.dp))
                                                Card(
                                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E0A0A)),
                                                    modifier = Modifier
                                                        .fillMaxWidth(0.9f)
                                                        .border(1.dp, Color(0xFFEF4444).copy(alpha = 0.4f), shape = RoundedCornerShape(16.dp)),
                                                    shape = RoundedCornerShape(16.dp)
                                                ) {
                                                    Column(
                                                        modifier = Modifier.padding(20.dp),
                                                        horizontalAlignment = Alignment.CenterHorizontally
                                                    ) {
                                                        Row(
                                                            verticalAlignment = Alignment.CenterVertically,
                                                            horizontalArrangement = Arrangement.Center
                                                        ) {
                                                            Text("❄️", fontSize = 18.sp)
                                                            Spacer(modifier = Modifier.width(6.dp))
                                                            Text(
                                                                "Cooling Down",
                                                                style = MaterialTheme.typography.titleMedium,
                                                                fontWeight = FontWeight.Bold,
                                                                color = Color.White
                                                            )
                                                        }
                                                        Spacer(modifier = Modifier.height(8.dp))
                                                        Text(
                                                            "We've paused the sync to protect your phone's battery. We will resume in 2 minutes.", 
                                                            style = MaterialTheme.typography.bodyMedium, 
                                                            color = Color(0xFFFFAAAA).copy(alpha = 0.8f),
                                                            textAlign = TextAlign.Center,
                                                            lineHeight = 20.sp
                                                        )
                                                    }
                                                }
                                            } else {
                                                Spacer(modifier = Modifier.height(24.dp))
                                                Text("Sync Status: $thermalState (OPTIMIZED)", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
                                            }
                                        }
                                    }
                    }
                }
            }
        }
    }
}
