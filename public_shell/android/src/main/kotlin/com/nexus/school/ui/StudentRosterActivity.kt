package com.nexus.school.ui

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.twotone.KeyboardArrowDown
import androidx.compose.material.icons.twotone.KeyboardArrowUp
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nexus.school.data.Student
import com.nexus.school.data.SyncDatabase
import com.nexus.school.data.SyncEvent
import com.nexus.school.network.ScoreComponent
import com.nexus.school.security.IdentityManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import kotlinx.coroutines.delay
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.platform.LocalLifecycleOwner

// ─── Score Component Helpers ──────────────────────────────────────────────────
fun defaultScoreComponents() = listOf(
    ScoreComponent(key = "CA1",  label = "C.A. 1", max = 10),
    ScoreComponent(key = "CA2",  label = "C.A. 2", max = 10),
    ScoreComponent(key = "Exam", label = "Exam",   max = 80)
)

fun parseScoreComponents(json: String): List<ScoreComponent> {
    if (json.isBlank()) return defaultScoreComponents()
    return try {
        val arr = org.json.JSONArray(json)
        val list = (0 until arr.length()).map { i ->
            val obj = arr.getJSONObject(i)
            ScoreComponent(
                key   = obj.getString("key"),
                label = obj.getString("label"),
                max   = obj.getInt("max")
            )
        }
        list.ifEmpty { defaultScoreComponents() }
    } catch (e: Exception) {
        defaultScoreComponents()
    }
}

// Top-level suspend helper — builds and upserts a grade event in Room
suspend fun saveGradeEvent(
    context: android.content.Context,
    studentId: String,
    subject: String,
    compValues: Map<String, String>,
    components: List<ScoreComponent>
) {
    val db    = SyncDatabase.getDatabase(context)
    val total = components.sumOf { compValues[it.key]?.toIntOrNull() ?: 0 }
    
    // Save to local offline persistence first
    components.forEach { comp ->
        val scoreVal = compValues[comp.key]?.toIntOrNull() ?: 0
        db.studentDao().insertScore(com.nexus.school.data.StudentScore(
            student_id = studentId,
            subject = subject,
            component_key = comp.key,
            score = scoreVal
        ))
    }

    // Build the sync_queue payload for pushing to the Hub
    val bdParts = components.joinToString(", ") { comp ->
        "\"${comp.key}\": ${compValues[comp.key]?.toIntOrNull() ?: 0}"
    }
    val payload = """{"student_id": "$studentId", "score": $total, "subject": "$subject", "assessment": "${components.firstOrNull()?.key ?: "CA1"}", "breakdown": {$bdParts}}"""
    val eventId = "GRADE_${studentId}_$subject"
    db.syncDao().insertEvent(
        SyncEvent(event_id = eventId, event_type = "UPDATE_GRADE", payload = payload, is_synced = 0)
    )
}

// ─── Naija-Futurism Color Tokens ─────────────────────────────────────────────
private val DeepNavy    = Color(0xFF0A0E2E)
private val GlassWhite  = Color(0x0FFFFFFF)
private val GlassBorder = Color(0x1AFFFFFF)
private val TextMuted   = Color(0x80FFFFFF)
private val GreenDone   = Color(0xFF4ADE80)
private val WarnAmber   = Color(0xFFFFB300)

class StudentRosterActivity : AppCompatActivity() {

    private var isAppLockedByBiometrics = mutableStateOf(true)

    private fun showBiometricPrompt() {
        val executor = ContextCompat.getMainExecutor(this)
        val biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    // If user cancels or fails too many times, app remains locked.
                }

                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    isAppLockedByBiometrics.value = false
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                }
            })

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock Nexus Vault")
            .setSubtitle("Confirm your identity to securely access student grades.")
            // Allow device credential (PIN/Pattern/Password) for phones without fingerprints
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
            .build()

        biometricPrompt.authenticate(promptInfo)
    }

    @OptIn(ExperimentalFoundationApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val schoolName = intent.getStringExtra("school_name") ?: "Nexus School"
        val primaryColorHex = intent.getStringExtra("primary_color") ?: "#1A237E"

        val primaryColor = try {
            Color(android.graphics.Color.parseColor(primaryColorHex))
        } catch (e: Exception) { Color(0xFF1A237E) }

        // Score components: prefer fresh intent data, fall back to persisted value from last handshake
        val scoreComponentsJson = intent.getStringExtra("score_components_json")
            ?: IdentityManager(this).getScoreComponentsJson()
        val scoreComponents = parseScoreComponents(scoreComponentsJson)

        setContent {
            val lifecycleOwner = LocalLifecycleOwner.current
            DisposableEffect(lifecycleOwner) {
                val observer = LifecycleEventObserver { _, event ->
                    if (event == Lifecycle.Event.ON_RESUME) {
                        isAppLockedByBiometrics.value = true
                        showBiometricPrompt()
                    }
                }
                lifecycleOwner.lifecycle.addObserver(observer)
                onDispose {
                    lifecycleOwner.lifecycle.removeObserver(observer)
                }
            }

            val scope = rememberCoroutineScope()
            var students by remember { mutableStateOf<List<Student>>(emptyList()) }
            var isLoading by remember { mutableStateOf(true) }
            var showFocusMode by remember { mutableStateOf(false) }
            var showSyncWarning by remember { mutableStateOf(false) }
            val studentSyncStatus = remember { mutableStateMapOf<String, Boolean>() }

            // ── Subject×Class matrix state ────────────────────────────────────
            // Build unique "ClassName • Subject" tabs from the loaded dataset
            // Each tab is a Pair(class_name, subject) for clean filtering
            var tabs by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
            var selectedTab by remember { mutableStateOf<Pair<String, String>?>(null) }

            LaunchedEffect(Unit) {
                scope.launch {
                    val db = SyncDatabase.getDatabase(this@StudentRosterActivity)
                    students = db.studentDao().getAllStudents()

                    // Derive ordered unique (class, subject) tabs
                    tabs = students
                        .map { Pair(it.class_name, it.subject) }
                        .distinct()
                        .sortedWith(compareBy({ it.first }, { it.second }))
                    selectedTab = tabs.firstOrNull()

                    // Pre-fill sync status from pending events
                    val events = db.syncDao().getPendingEvents()
                    events.forEach { event ->
                        try {
                            val obj = org.json.JSONObject(event.payload)
                            if (obj.has("student_id") && obj.has("subject")) {
                                val key = obj.getString("student_id") + "_" + obj.getString("subject")
                                studentSyncStatus[key] = true
                            } else if (obj.has("student_id")) {
                                studentSyncStatus[obj.getString("student_id")] = true
                            }
                        } catch (e: Exception) {}
                    }
                    isLoading = false
                }
            }

            // Students shown for the currently selected tab
            val filteredStudents = remember(students, selectedTab) {
                selectedTab?.let { (cls, subj) ->
                    students.filter { it.class_name == cls && it.subject == subj }
                } ?: emptyList()
            }

            var showAddStudentDialog by remember { mutableStateOf(false) }

            MaterialTheme {
                Scaffold(
                    bottomBar = {
                        NavigationBar(containerColor = Color(0xFF131735), contentColor = Color.White) {
                            NavigationBarItem(
                                selected = false,
                                onClick = { /* TODO: Navigate to Home */ },
                                icon = { Text("🏠") },
                                label = { Text("Home") }
                            )
                            NavigationBarItem(
                                selected = true,
                                onClick = { },
                                icon = { Text("📋") },
                                label = { Text("Roster") }
                            )
                            NavigationBarItem(
                                selected = false,
                                onClick = { /* TODO: Navigate to Settings */ },
                                icon = { Text("⚙️") },
                                label = { Text("Settings") }
                            )
                        }
                    },
                    floatingActionButton = {
                        if (!showFocusMode) {
                            FloatingActionButton(
                                onClick = { showAddStudentDialog = true },
                                containerColor = primaryColor,
                                contentColor = Color.White
                            ) {
                                Text("+", fontSize = 24.sp)
                            }
                        }
                    }
                ) { innerPadding ->
                    Surface(modifier = Modifier.fillMaxSize().padding(innerPadding), color = DeepNavy) {

                        // ── Add Student Dialog ────────────────────────────────────
                        if (showAddStudentDialog) {
                            var newStudentName by remember { mutableStateOf("") }
                            AlertDialog(
                                onDismissRequest = { showAddStudentDialog = false },
                                containerColor = Color(0xFF1A1A2E),
                                title = { Text("Register Offline Student", color = Color.White) },
                                text = {
                                    Column {
                                        Text("This student will be queued for the server.", color = Color.Gray, fontSize = 12.sp)
                                        Spacer(Modifier.height(8.dp))
                                        OutlinedTextField(
                                            value = newStudentName,
                                            onValueChange = { newStudentName = it },
                                            placeholder = { Text("Student Name") },
                                            colors = OutlinedTextFieldDefaults.colors(
                                                focusedTextColor = Color.White,
                                                unfocusedTextColor = Color.White
                                            )
                                        )
                                    }
                                },
                                confirmButton = {
                                    Button(
                                        onClick = {
                                            if (newStudentName.isNotBlank() && selectedTab != null) {
                                                val newStudent = com.nexus.school.data.Student(
                                                    id = "NEW_" + java.util.UUID.randomUUID().toString().take(8),
                                                    name = newStudentName,
                                                    class_name = selectedTab!!.first,
                                                    subject = selectedTab!!.second
                                                )
                                                scope.launch(Dispatchers.IO) {
                                                    val db = SyncDatabase.getDatabase(this@StudentRosterActivity)
                                                    db.studentDao().insertAll(listOf(newStudent))
                                                    // Add to SyncQueue for The Hawk to validate!
                                                    val payload = """{"student_id":"${newStudent.id}","name":"${newStudent.name}","class_name":"${newStudent.class_name}","subject":"${newStudent.subject}"}"""
                                                    db.syncDao().insertEvent(
                                                        com.nexus.school.data.SyncEvent(
                                                            event_type = "ADD_STUDENT",
                                                            payload = payload,
                                                            is_synced = 0
                                                        )
                                                    )
                                                    students = db.studentDao().getAllStudents()
                                                    launch(Dispatchers.Main) { showAddStudentDialog = false }
                                                }
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = primaryColor)
                                    ) { Text("Register") }
                                },
                                dismissButton = {
                                    TextButton(onClick = { showAddStudentDialog = false }) { Text("Cancel", color = Color.Gray) }
                                }
                            )
                        }

                        // ── Sync Warning Dialog ───────────────────────────────────
                        if (showSyncWarning) {
                            val missingCount = filteredStudents.size - filteredStudents.count { 
                                studentSyncStatus[it.id + "_" + it.subject] == true || studentSyncStatus[it.id] == true 
                            }
                            AlertDialog(
                                onDismissRequest = { showSyncWarning = false },
                                containerColor = Color(0xFF1A1A2E),
                                titleContentColor = Color.White,
                                textContentColor = TextMuted,
                                icon = { Icon(Icons.Default.Warning, contentDescription = null, tint = WarnAmber) },
                                title = { Text("Missing Grades") },
                                text = { Text("$missingCount students in this class/subject do not have grades yet. Sync partial list?") },
                                confirmButton = {
                                    TextButton(onClick = { showSyncWarning = false; triggerSync(primaryColor) }) {
                                        Text("Sync Anyway", color = primaryColor)
                                    }
                                },
                                dismissButton = {
                                    TextButton(onClick = { showSyncWarning = false }) {
                                        Text("Cancel", color = TextMuted)
                                    }
                                }
                            )
                        }

                        if (showFocusMode && filteredStudents.isNotEmpty()) {
                            FocusModePager(
                                students       = filteredStudents,
                                selectedTab    = selectedTab,
                                primaryColor   = primaryColor,
                                scoreComponents = scoreComponents,
                                onClose        = { showFocusMode = false },
                                onLogSave      = { studentId, subject, isSaved -> studentSyncStatus[studentId + "_" + subject] = isSaved }
                            )
                        } else {
                            Column(modifier = Modifier.fillMaxSize()) {

                                // ── Premium Header ────────────────────────────────
                                RosterHeader(
                                    schoolName = schoolName,
                                    primaryColor = primaryColor,
                                    totalCount = students.size,
                                    filteredCount = filteredStudents.size,
                                    onSync = {
                                        val missing = filteredStudents.count { 
                                            studentSyncStatus[it.id + "_" + it.subject] != true && studentSyncStatus[it.id] != true 
                                        }
                                        if (missing > 0) showSyncWarning = true else triggerSync(primaryColor)
                                    }
                                )

                                // ── Subject×Class Tab Bar ─────────────────────────
                                if (tabs.isNotEmpty()) {
                                    SubjectClassTabBar(
                                        tabs = tabs,
                                        selectedTab = selectedTab,
                                        primaryColor = primaryColor,
                                        onTabSelected = { selectedTab = it }
                                    )
                                }

                                // ── Body ──────────────────────────────────────────
                                Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                                    when {
                                        isLoading -> LoadingState()
                                        students.isEmpty() -> EmptyState()
                                        filteredStudents.isEmpty() -> EmptyTabState(selectedTab)
                                        else -> Column(Modifier.fillMaxSize()) {
                                            Button(
                                                onClick = { showFocusMode = true },
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(horizontal = 16.dp, vertical = 12.dp)
                                                    .height(52.dp),
                                                colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                                                shape = RoundedCornerShape(14.dp)
                                            ) {
                                                Text(
                                                    "Grade Class – Focus Mode",
                                                    fontSize = 15.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    letterSpacing = 0.5.sp
                                                )
                                            }
                                            StudentList(
                                                students = filteredStudents,
                                                primaryColor = primaryColor,
                                                statusMap = studentSyncStatus
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

    private fun triggerSync(primaryColor: Color) {
        val scope = kotlinx.coroutines.CoroutineScope(Dispatchers.IO)
        scope.launch {
            val worker = com.nexus.school.network.SyncWorker(this@StudentRosterActivity)
            val success = worker.pushPendingEvents()
            launch(Dispatchers.Main) {
                android.widget.Toast.makeText(
                    this@StudentRosterActivity,
                    if (success) "✅ Sync Complete!" else "❌ Sync Failed",
                    android.widget.Toast.LENGTH_SHORT
                ).show()
            }
        }
    }
}

// ─── Header ──────────────────────────────────────────────────────────────────
@Composable
fun RosterHeader(
    schoolName: String,
    primaryColor: Color,
    totalCount: Int,
    filteredCount: Int,
    onSync: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // Connection State: 0 = Unknown, 1 = Pinging, 2 = Online (Green), 3 = Offline (Red)
    var connectionState by remember { mutableStateOf(0) }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.horizontalGradient(
                    listOf(primaryColor, primaryColor.copy(alpha = 0.65f))
                )
            )
            .padding(horizontal = 20.dp, vertical = 20.dp)
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = schoolName.uppercase(),
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 2.sp
                )
                Spacer(Modifier.weight(1f))
                // Visual Ping Dot indicator
                val dotColor = when (connectionState) {
                    0 -> Color.Gray
                    1 -> WarnAmber
                    2 -> GreenDone
                    else -> Color.Red
                }
                Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(dotColor))
                Spacer(Modifier.width(6.dp))
                Text(
                    text = when(connectionState) {
                        0, 1 -> "Ping Hub"
                        2 -> "Hub Online"
                        else -> "Hub Offline"
                    },
                    color = Color.White,
                    fontSize = 10.sp,
                    modifier = Modifier.clickable {
                        if (connectionState == 1) return@clickable
                        connectionState = 1
                        scope.launch(Dispatchers.IO) {
                            val serverInfo = IdentityManager(context).getServerInfo()
                            if (serverInfo == null) {
                                connectionState = 3
                                return@launch
                            }
                            val ip = serverInfo.first
                            val port = serverInfo.second
                            try {
                                val url = java.net.URL("http://$ip:$port/handshake") // Simple reachability
                                val connection = url.openConnection() as java.net.HttpURLConnection
                                connection.connectTimeout = 2000
                                connection.readTimeout = 2000
                                connection.requestMethod = "OPTIONS"
                                val code = connection.responseCode
                                connectionState = 2
                            } catch (e: Exception) {
                                connectionState = 3
                            }
                        }
                    }
                )
                Spacer(Modifier.width(16.dp)) // Eco shield padding
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Class Roster",
                color = Color.White,
                fontSize = 26.sp,
                fontWeight = FontWeight.ExtraBold
            )
            Spacer(Modifier.height(10.dp))
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = Color.White.copy(alpha = 0.15f)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "$filteredCount of $totalCount students",
                        color = Color.White.copy(alpha = 0.9f),
                        fontSize = 12.sp
                    )
                    Spacer(Modifier.weight(1f))
                    Button(
                        onClick = onSync,
                        colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 0.dp),
                        modifier = Modifier.height(30.dp)
                    ) {
                        Text("Sync Now", color = primaryColor, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        // ── Eco-Guardian Shield ──
        EcoGuardianShield(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 4.dp, end = 4.dp)
        )
    }
}

// ─── Subject×Class Tab Bar ────────────────────────────────────────────────────
@Composable
fun SubjectClassTabBar(
    tabs: List<Pair<String, String>>,
    selectedTab: Pair<String, String>?,
    primaryColor: Color,
    onTabSelected: (Pair<String, String>) -> Unit
) {
    Column {
        LazyRow(
            modifier = Modifier
                .fillMaxWidth()
                .background(DeepNavy)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(tabs) { tab ->
                val isSelected = tab == selectedTab
                val label = "${tab.first}  ·  ${tab.second}"

                Surface(
                    modifier = Modifier.clickable { onTabSelected(tab) },
                    shape = RoundedCornerShape(50),
                    color = if (isSelected) primaryColor else GlassWhite,
                    tonalElevation = if (isSelected) 0.dp else 0.dp
                ) {
                    Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                        Text(
                            text = label,
                            color = if (isSelected) Color.White else TextMuted,
                            fontSize = 12.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            maxLines = 1
                        )
                    }
                }
            }
        }

        // Subtle divider below tabs
        Divider(color = GlassBorder, thickness = 1.dp)
    }
}

// ─── Student List ─────────────────────────────────────────────────────────────
@Composable
fun StudentList(
    students: List<Student>,
    primaryColor: Color,
    statusMap: Map<String, Boolean>
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(vertical = 12.dp)
    ) {
        itemsIndexed(students) { idx, student ->
            AnimatedVisibility(
                visible = true,
                enter = fadeIn() + slideInVertically(initialOffsetY = { it / 2 })
            ) {
                StudentRow(
                    student = student,
                    index = idx + 1,
                    primaryColor = primaryColor,
                    isSaved = statusMap[student.id + "_" + student.subject] == true || statusMap[student.id] == true
                )
            }
        }
    }
}

// ─── Empty States ─────────────────────────────────────────────────────────────
@Composable
fun LoadingState() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = Color.White)
            Spacer(Modifier.height(16.dp))
            Text("Loading class records…", color = TextMuted)
        }
    }
}

@Composable
fun EmptyState() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("📭", fontSize = 48.sp)
            Spacer(Modifier.height(16.dp))
            Text("No students loaded yet.", color = TextMuted, fontSize = 16.sp)
            Spacer(Modifier.height(8.dp))
            Text(
                "Ask your admin to upload the CSV\nand scan the QR code.",
                color = Color.White.copy(alpha = 0.3f),
                fontSize = 13.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
fun EmptyTabState(tab: Pair<String, String>?) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("🗂️", fontSize = 44.sp)
            Spacer(Modifier.height(12.dp))
            Text(
                "No students for\n${tab?.first ?: "this class"} · ${tab?.second ?: "this subject"}",
                color = TextMuted,
                fontSize = 15.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}

// ─── Focus Mode Pager ─────────────────────────────────────────────────────────
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FocusModePager(
    students: List<Student>,
    selectedTab: Pair<String, String>?,
    primaryColor: Color,
    scoreComponents: List<ScoreComponent>,
    onClose: () -> Unit,
    onLogSave: (String, String, Boolean) -> Unit
) {
    val pagerState = rememberPagerState(pageCount = { students.size })
    val scope      = rememberCoroutineScope()
    val context    = LocalContext.current

    // Flat state map: "studentId_subject_componentKey" -> value string
    val gradeState = remember { mutableStateMapOf<String, String>() }

    // Pre-load values from permanent local offline persistence
    LaunchedEffect(Unit) {
        val db = SyncDatabase.getDatabase(context)
        db.studentDao().getAllScores().forEach { score ->
            val prefix = if (score.subject.isNotEmpty() && score.subject != "General") "${score.student_id}_${score.subject}" else score.student_id
            gradeState["${prefix}_${score.component_key}"] = score.score.toString()
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(DeepNavy)) {
        // ── Focus Mode Toolbar ────────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.horizontalGradient(listOf(primaryColor, primaryColor.copy(alpha = 0.7f)))
                )
                .padding(horizontal = 8.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onClose) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Close", tint = Color.White)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Focus Mode",
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
                selectedTab?.let {
                    Text(
                        text = "${it.first}  ·  ${it.second}",
                        color = Color.White.copy(alpha = 0.7f),
                        fontSize = 12.sp
                    )
                }
            }
            Text(
                "${pagerState.currentPage + 1} / ${students.size}",
                color = Color.White.copy(alpha = 0.6f),
                fontSize = 13.sp,
                modifier = Modifier.padding(end = 16.dp)
            )
        }

        HorizontalPager(state = pagerState, modifier = Modifier.weight(1f)) { page ->
            val student    = students[page]
            val studentId  = student.id
            val subjectKey = "${studentId}_${student.subject}"

            // Per-student values: component.key -> current string value
            val compValues: Map<String, String> = scoreComponents.associate { comp ->
                comp.key to (gradeState["${subjectKey}_${comp.key}"] ?: "")
            }

            StudentFocusCard(
                student         = student,
                selectedTab     = selectedTab,
                primaryColor    = primaryColor,
                scoreComponents = scoreComponents,
                compValues      = compValues,
                onValueChange   = { compKey, value ->
                    gradeState["${subjectKey}_${compKey}"] = value
                },
                onAutoSave = {
                    scope.launch(Dispatchers.IO) {
                        saveGradeEvent(
                            context, studentId, student.subject,
                            scoreComponents.associate { it.key to (gradeState["${subjectKey}_${it.key}"] ?: "") },
                            scoreComponents
                        )
                        launch(Dispatchers.Main) { onLogSave(studentId, student.subject, true) }
                    }
                },
                onSave = {
                    scope.launch(Dispatchers.IO) {
                        saveGradeEvent(
                            context, studentId, student.subject,
                            scoreComponents.associate { it.key to (gradeState["${subjectKey}_${it.key}"] ?: "") },
                            scoreComponents
                        )
                        launch(Dispatchers.Main) {
                            onLogSave(studentId, student.subject, true)
                            if (page < students.size - 1) pagerState.animateScrollToPage(page + 1)
                            else onClose()
                        }
                    }
                },
                onSkip = {
                    scope.launch {
                        if (page < students.size - 1) pagerState.animateScrollToPage(page + 1)
                        else onClose()
                    }
                }
            )
        }
    }
}

// ─── Student Focus Card ───────────────────────────────────────────────────────
// Full-screen layout: compact header │ scrollable 2-col input grid │ fixed footer
// Designed to handle 1–10 score components on any phone screen size.
@Composable
fun StudentFocusCard(
    student: Student,
    selectedTab: Pair<String, String>?,
    primaryColor: Color,
    scoreComponents: List<ScoreComponent>,
    compValues: Map<String, String>,
    onValueChange: (String, String) -> Unit,
    onAutoSave: () -> Unit,
    onSave: () -> Unit,
    onSkip: () -> Unit
) {
    val total    = scoreComponents.sumOf { compValues[it.key]?.toIntOrNull() ?: 0 }
    val maxTotal = scoreComponents.sumOf { it.max }

    // Debounced auto-save: skips initial composition, fires 650 ms after last keystroke
    var initialized by remember { mutableStateOf(false) }
    val valueSnapshot = scoreComponents.map { it.key to (compValues[it.key] ?: "") }
    LaunchedEffect(valueSnapshot) {
        if (!initialized) { initialized = true; return@LaunchedEffect }
        delay(650)
        onAutoSave()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp)
    ) {
        Spacer(Modifier.height(12.dp))

        // ── Compact student identity chip ────────────────────────────────────
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            color = GlassWhite,
            border = BorderStroke(1.dp, GlassBorder)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Mini avatar
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.verticalGradient(
                                listOf(primaryColor, primaryColor.copy(alpha = 0.65f))
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = student.name.take(1).uppercase(),
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = student.name,
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(student.id, color = TextMuted, fontSize = 11.sp)
                    selectedTab?.let {
                        Spacer(Modifier.height(3.dp))
                        Text(
                            "${it.first} · ${it.second}",
                            color = primaryColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // ── Scrollable 2-column grade input grid ───────────────────────────
        // Chunks components into rows of 2; odd last component spans its slot only.
        // With 10 components (worst case) → 5 rows × ~80dp → 400dp, scrollable.
        val rows = scoreComponents.chunked(2)
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            rows.forEach { rowComps ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    rowComps.forEach { comp ->
                        CompactGradeInputCard(
                            modifier    = Modifier.weight(1f),
                            label       = comp.label,
                            maxScore    = comp.max,
                            value       = compValues[comp.key] ?: "",
                            primaryColor = primaryColor,
                            onValueChange = { v ->
                                if (v.isEmpty() || (v.toIntOrNull() != null && v.toInt() <= comp.max)) {
                                    onValueChange(comp.key, v)
                                }
                            }
                        )
                    }
                    // Balance last row when component count is odd
                    if (rowComps.size < 2) Spacer(Modifier.weight(1f))
                }
            }
            Spacer(Modifier.height(4.dp)) // breathing room at scroll bottom
        }

        Spacer(Modifier.height(10.dp))

        // ── Dynamic total bar ────────────────────────────────────────────────
        val pct = if (maxTotal > 0) total.toFloat() / maxTotal else 0f
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    color = when {
                        pct >= 0.7f -> Color(0xFF1B4332).copy(alpha = 0.7f)
                        pct >  0f   -> primaryColor.copy(alpha = 0.18f)
                        else        -> Color(0xFF7F1D1D).copy(alpha = 0.5f)
                    },
                    shape = RoundedCornerShape(14.dp)
                )
                .padding(vertical = 14.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "Total: $total / $maxTotal",
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.ExtraBold
            )
        }

        Spacer(Modifier.height(6.dp))

        // ── Navigation row ───────────────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = onSkip) {
                Text("Skip", color = TextMuted, fontSize = 16.sp)
            }
            Button(
                onClick      = onSave,
                colors       = ButtonDefaults.buttonColors(containerColor = primaryColor),
                shape        = RoundedCornerShape(50),
                contentPadding = PaddingValues(horizontal = 26.dp, vertical = 13.dp)
            ) {
                Text("Save & Next", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(6.dp))
                Icon(Icons.Default.ArrowForward, contentDescription = null)
            }
        }
    }
}

// ─── Compact Grade Input Card ─────────────────────────────────────────────────
// Self-contained glass card: label + max badge on top, large numeric input below.
// Fixed ~80 dp height per card, works inside any scrollable column.
@Composable
fun CompactGradeInputCard(
    modifier: Modifier = Modifier,
    label: String,
    maxScore: Int,
    value: String,
    primaryColor: Color,
    onValueChange: (String) -> Unit
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = Color(0x0CFFFFFF),
        border = BorderStroke(1.dp, GlassBorder)
    ) {
        Column(
            modifier = Modifier
                .padding(start = 10.dp, top = 8.dp, end = 10.dp, bottom = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Label row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = label,
                    color = TextMuted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Surface(
                    shape = RoundedCornerShape(50),
                    color = primaryColor.copy(alpha = 0.18f)
                ) {
                    Text(
                        "/$maxScore",
                        color = primaryColor,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                    )
                }
            }
            // Number input
            OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                textStyle = TextStyle(
                    color = Color.White,
                    fontSize = 20.sp,
                    textAlign = TextAlign.Center,
                    fontWeight = FontWeight.ExtraBold
                ),
                placeholder = {
                    Text(
                        "—",
                        color = Color.White.copy(alpha = 0.12f),
                        fontSize = 20.sp,
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center
                    )
                },
                singleLine = true,
                shape = RoundedCornerShape(10.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor   = primaryColor,
                    unfocusedBorderColor = Color.Transparent,
                    focusedTextColor     = Color.White,
                    unfocusedTextColor   = Color.White,
                    cursorColor          = primaryColor,
                    focusedContainerColor   = Color(0x10FFFFFF),
                    unfocusedContainerColor = Color.Transparent
                )
            )
        }
    }
}

// ─── Grade Input Column ───────────────────────────────────────────────────────
@Composable
fun GradeInputColumn(label: String, maxLabel: String, value: String, onValueChange: (String) -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        Text(maxLabel, color = Color.White.copy(alpha = 0.2f), fontSize = 10.sp)
        Spacer(Modifier.height(6.dp))
        GradeInputBox(value = value, onValueChange = onValueChange, primaryColor = Color.White)
    }
}

@Composable
fun GradeInputBox(value: String, onValueChange: (String) -> Unit, primaryColor: Color) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.width(72.dp).height(64.dp),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        textStyle = TextStyle(color = Color.White, fontSize = 22.sp, textAlign = TextAlign.Center, fontWeight = FontWeight.Bold),
        singleLine = true,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = primaryColor,
            unfocusedBorderColor = GlassBorder,
            focusedTextColor = Color.White,
            unfocusedTextColor = Color.White,
            cursorColor = primaryColor
        )
    )
}

// ─── Student Row ──────────────────────────────────────────────────────────────
@Composable
fun StudentRow(student: Student, index: Int, primaryColor: Color, isSaved: Boolean) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = GlassWhite,
        border = androidx.compose.foundation.BorderStroke(1.dp, GlassBorder)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Index badge
            Box(
                modifier = Modifier.size(36.dp).clip(CircleShape)
                    .background(primaryColor.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Text("$index", color = primaryColor, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(student.name, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("ID: ${student.id}", color = TextMuted, fontSize = 11.sp)
            }

            if (isSaved) {
                Surface(shape = RoundedCornerShape(50), color = GreenDone.copy(alpha = 0.15f)) {
                    Text("Graded ✓", color = GreenDone, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
                }
            } else {
                Text("Pending", color = TextMuted, fontSize = 11.sp)
            }
        }
    }
}

// ─── @Preview Annotations (Prompt 5 Verification step) ───────────────────────
@Preview(showBackground = true, backgroundColor = 0xFF0A0E2E, name = "Tab Bar Preview")
@Composable
fun PreviewSubjectClassTabBar() {
    val primaryColor = Color(0xFF1A237E)
    val sampleTabs = listOf(
        Pair("JSS1", "Mathematics"),
        Pair("JSS1", "English"),
        Pair("JSS2", "Physics"),
        Pair("SS1", "Chemistry")
    )
    var selected by remember { mutableStateOf(sampleTabs[0]) }
    MaterialTheme {
        Surface(color = DeepNavy) {
            SubjectClassTabBar(tabs = sampleTabs, selectedTab = selected, primaryColor = primaryColor, onTabSelected = { selected = it })
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0A0E2E, name = "Student Row Preview")
@Composable
fun PreviewStudentRow() {
    val sample = Student(id = "A-001", name = "Obi Ndidi", class_name = "JSS1", subject = "Mathematics")
    MaterialTheme {
        Surface(color = DeepNavy, modifier = Modifier.padding(16.dp)) {
            StudentRow(student = sample, index = 1, primaryColor = Color(0xFF1A237E), isSaved = true)
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0A0E2E, name = "Empty Tab State Preview")
@Composable
fun PreviewEmptyTabState() {
    MaterialTheme {
        Surface(color = DeepNavy) {
            EmptyTabState(Pair("SS3", "Further Math"))
        }
    }
}

// ClassGroupedList and ClassGroupHeader kept for any legacy usage
@Composable
fun ClassGroupedList(groupedStudents: Map<String, List<Student>>, primaryColor: Color, statusMap: Map<String, Boolean>) {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
        groupedStudents.forEach { (className, classStudents) ->
            item { ClassGroupHeader(className = className, studentCount = classStudents.size,
                students = classStudents, primaryColor = primaryColor, statusMap = statusMap) }
        }
    }
}

@Composable
fun ClassGroupHeader(className: String, studentCount: Int, students: List<Student>, primaryColor: Color, statusMap: Map<String, Boolean>) {
    var isExpanded by remember { mutableStateOf(true) }
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = GlassWhite)) {
        Column {
            Row(modifier = Modifier.fillMaxWidth().clickable { isExpanded = !isExpanded }.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(primaryColor))
                Spacer(Modifier.width(12.dp))
                Text(className, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                Surface(shape = RoundedCornerShape(20.dp), color = primaryColor.copy(alpha = 0.3f)) {
                    Text("  $studentCount  ", color = primaryColor, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 4.dp))
                }
                Spacer(Modifier.width(8.dp))
                Icon(if (isExpanded) Icons.TwoTone.KeyboardArrowUp else Icons.TwoTone.KeyboardArrowDown, null, tint = TextMuted)
            }
            AnimatedVisibility(visible = isExpanded, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                Column {
                    Divider(color = GlassBorder)
                    students.forEachIndexed { index, student ->
                        StudentRow(student = student, index = index + 1, primaryColor = primaryColor, isSaved = statusMap[student.id] == true)
                        if (index < students.lastIndex) Divider(modifier = Modifier.padding(start = 56.dp), color = GlassBorder)
                    }
                }
            }
        }
    }
}
