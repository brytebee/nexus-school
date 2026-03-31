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
        
        findViewById<android.widget.Button>(R.id.manual_setup_btn).setOnClickListener {
            showManualSetupDialog()
        }

        checkCameraPermission()
    }

    private fun showManualSetupDialog() {
        val input = android.widget.EditText(this).apply {
            hint = "Paste School Payload Here"
            setPadding(48, 48, 48, 48)
        }
        android.app.AlertDialog.Builder(this)
            .setTitle("Manual Setup")
            .setMessage("If your camera is broken, ask the Admin to copy the raw payload text from the Dashboard and send it to you.")
            .setView(input)
            .setPositiveButton("Connect") { _, _ ->
                val payloadText = input.text.toString()
                if (payloadText.isNotEmpty()) {
                    onQrScanned(payloadText, identityManager)
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
                
                runOnUiThread {
                    val schoolDisplayName = payload.config.name ?: "Nexus School"
                    android.widget.Toast.makeText(this@HandshakeActivity, "Syncing with $schoolDisplayName...", android.widget.Toast.LENGTH_SHORT).show()
                }

                val response = DeviceResponse(
                    device_id = identityManager.getDeviceId(),
                    teacher_name = identityManager.getTeacherName(),
                    public_key = identityManager.getPublicKey(),
                    thermal_status = identityManager.getThermalStatus()
                )

                val result = handshakeService.performHandshake(payload.ip, payload.port, response)
                
                runOnUiThread {
                    if (result != null) {
                        android.widget.Toast.makeText(this@HandshakeActivity, "Marriage Successful! 🎉", android.widget.Toast.LENGTH_LONG).show()
                        Log.d("Handshake", "Marriage Successful: $result")
                        
                        setContent {
                            val config = result.school_config
                            val students = result.students
                            val primaryColorStr = config.themePrimary ?: "#1A237E"
                            val primaryColor = try {
                                Color(android.graphics.Color.parseColor(primaryColorStr))
                            } catch (e: Exception) {
                                Color(0xFF1A237E)
                            }
                            
                            var showProgress by remember { mutableStateOf(students.isNotEmpty()) }
                            var progressAmount by remember { mutableStateOf(0f) }
                            var isTorchEnabled by remember { mutableStateOf(false) }

                            LaunchedEffect(Unit) {
                                if (students.isNotEmpty()) {
                                    val db = SyncDatabase.getDatabase(this@HandshakeActivity)
                                    for (i in 1..10) {
                                        delay(150)
                                        progressAmount = i / 10f
                                    }
                                    db.studentDao().insertAll(students)
                                    showProgress = false
                                }
                            }

                            MaterialTheme(
                                colorScheme = MaterialTheme.colorScheme.copy(
                                    primary = primaryColor,
                                    background = primaryColor,
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
                                    Surface(
                                        modifier = Modifier.fillMaxSize().padding(padding),
                                        color = MaterialTheme.colorScheme.background
                                    ) {
                                        Column(
                                            modifier = Modifier.fillMaxSize(),
                                            verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
                                            horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally
                                        ) {
                                            Text(
                                                "Synced with ${config.name ?: "Nexus"}",
                                                style = MaterialTheme.typography.headlineMedium,
                                                color = MaterialTheme.colorScheme.onPrimary
                                            )
                                            Spacer(modifier = Modifier.height(16.dp))
                                            Text("Modules Enabled: ${config.modules.joinToString()}", color = MaterialTheme.colorScheme.onPrimary)
                                            
                                            if (showProgress) {
                                                Spacer(modifier = Modifier.height(32.dp))
                                                Text(
                                                    "Organizing Class Records... ${(progressAmount * 100).toInt()}%", 
                                                    color = MaterialTheme.colorScheme.onPrimary,
                                                    style = MaterialTheme.typography.bodyLarge
                                                )
                                                Spacer(modifier = Modifier.height(8.dp))
                                                LinearProgressIndicator(
                                                    progress = progressAmount,
                                                    modifier = Modifier.fillMaxWidth(0.8f).height(8.dp),
                                                    color = Color.White,
                                                    trackColor = Color(0x44FFFFFF)
                                                )
                                            } else if (students.isNotEmpty()) {
                                                Spacer(modifier = Modifier.height(16.dp))
                                                Text("✅ ${students.size} Students Safely Digested", color = Color(0xFFA5D6A7), fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                                                Spacer(modifier = Modifier.height(16.dp))
                                                Button(
                                                    onClick = {
                                                        identityManager.saveSchoolBranding(
                                                            config.name ?: "Nexus School",
                                                            config.themePrimary ?: "#1A237E"
                                                        )
                                                        val intent = android.content.Intent(this@HandshakeActivity, StudentRosterActivity::class.java)
                                                        intent.putExtra("school_name", config.name ?: "Nexus School")
                                                        intent.putExtra("primary_color", config.themePrimary ?: "#1A237E")
                                                        intent.putExtra("student_count", students.size)
                                                        startActivity(intent)
                                                        finish()
                                                    },
                                                    colors = ButtonDefaults.buttonColors(
                                                        containerColor = Color.White,
                                                        contentColor = primaryColor
                                                    ),
                                                    shape = androidx.compose.foundation.shape.RoundedCornerShape(50)
                                                ) {
                                                    Text("View Class Roster  →", fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
                                                }
                                            }
                                            
                                            Spacer(modifier = Modifier.height(32.dp))
                                            
                                            val thermalState = identityManager.getThermalStatus()
                                            if (thermalState == "CRITICAL") {
                                                Card(
                                                    colors = CardDefaults.cardColors(containerColor = Color(0x33FF0000)),
                                                    modifier = Modifier.padding(16.dp)
                                                ) {
                                                    Column(modifier = Modifier.padding(16.dp), horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                                                        Text("❄️ Cooling Down", style = MaterialTheme.typography.titleMedium, color = Color.White)
                                                        Spacer(modifier = Modifier.height(8.dp))
                                                        Text(
                                                            "We've paused the sync to protect your phone's battery. We will resume in 2 minutes.", 
                                                            style = MaterialTheme.typography.bodyMedium, 
                                                            color = Color(0xDDFFAAAA),
                                                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                                        )
                                                    }
                                                }
                                            } else {
                                                Text("Sync Status: $thermalState (OPTIMIZED)", color = Color(0xAAFFFFFF))
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        android.widget.Toast.makeText(this@HandshakeActivity, "Handshake Failed. Check Server.", android.widget.Toast.LENGTH_LONG).show()
                        isHandshaking = false
                    }
                }
            } catch (e: Exception) {
                Log.e("Handshake", "Failed to parse or send handshake", e)
                runOnUiThread {
                    android.widget.Toast.makeText(this@HandshakeActivity, "Invalid QR Code Pattern", android.widget.Toast.LENGTH_SHORT).show()
                    isHandshaking = false
                }
            }
        }
    }
}
