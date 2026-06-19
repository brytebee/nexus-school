package com.nexus.school.ui

import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.animation.*
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.twotone.KeyboardArrowDown
import androidx.compose.material.icons.twotone.KeyboardArrowUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
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
import com.nexus.school.ui.components.PhotoCropDialog
import androidx.exifinterface.media.ExifInterface as AndroidExif
import com.nexus.school.data.Student
import com.nexus.school.data.SyncDatabase
import com.nexus.school.data.SyncEvent
import com.nexus.school.network.ScoreComponent
import com.nexus.school.network.saveAddStudentEvent
import com.nexus.school.network.saveDeleteStudentEvent
import com.nexus.school.network.saveGradeEvent
import com.nexus.school.security.IdentityManager
import com.nexus.school.NexusApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Bottom-navigation destinations within StudentRosterActivity. */
enum class AppScreen { ROSTER, SETTINGS }
// ─── Score Component Helpers ──────────────────────────────────────────────────
fun defaultScoreComponents() = listOf(
    ScoreComponent(key = "CA1",  label = "C.A. 1", max = 10),
    ScoreComponent(key = "CA2",  label = "C.A. 2", max = 10),
    ScoreComponent(key = "Exam", label = "Exam",   max = 80)
)

fun sortScoreComponents(components: List<ScoreComponent>): List<ScoreComponent> {
    return components.sortedWith(Comparator { a, b ->
        val aKey = a.key.lowercase()
        val bKey = b.key.lowercase()
        val isACaOrExam = aKey.startsWith("ca") || aKey.contains("exam")
        val isBCaOrExam = bKey.startsWith("ca") || bKey.contains("exam")
        when {
            isACaOrExam && !isBCaOrExam -> 1
            !isACaOrExam && isBCaOrExam -> -1
            isACaOrExam && isBCaOrExam -> {
                val isAExam = aKey.contains("exam")
                val isBExam = bKey.contains("exam")
                when {
                    isAExam && !isBExam -> 1
                    !isAExam && isBExam -> -1
                    else -> aKey.compareTo(bKey)
                }
            }
            else -> aKey.compareTo(bKey)
        }
    })
}

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
        val rawList = list.ifEmpty { defaultScoreComponents() }
        sortScoreComponents(rawList)
    } catch (e: Exception) {
        defaultScoreComponents()
    }
}

// ─── Naija-Futurism Color Tokens ─────────────────────────────────────────────
private val DeepNavy    = Color(0xFF0A0E2E)
private val GlassWhite  = Color(0x0FFFFFFF)
private val GlassBorder = Color(0x1AFFFFFF)
private val TextMuted   = Color(0x80FFFFFF)
private val GreenDone   = Color(0xFF4ADE80)
private val WarnAmber   = Color(0xFFFFB300)

class StudentRosterActivity : AppCompatActivity() {



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

            val scope = rememberCoroutineScope()
            var students by remember { mutableStateOf<List<Student>>(emptyList()) }
            var dbStateRef by remember { mutableStateOf(0) }
            var showAddStudentDialog by remember { mutableStateOf(false) }
            var isLoading by remember { mutableStateOf(true) }
            var showFocusMode by remember { mutableStateOf(false) }
            var showSyncWarning by remember { mutableStateOf(false) }
            var honorRollStudents by remember { mutableStateOf<List<com.nexus.school.data.HonorRollItem>>(emptyList()) }
            val studentSyncStatus = remember { mutableStateMapOf<String, Boolean>() }
            
            var studentToEdit by remember { mutableStateOf<Student?>(null) }
            var draftClass by remember { mutableStateOf("") }

            // ── Navigation destination & plan metadata ────────────────────────
            var selectedScreen by remember { mutableStateOf(AppScreen.ROSTER) }
            val identityManager = remember { IdentityManager(this@StudentRosterActivity) }
            val planModules    = remember { identityManager.getTierModules() }
            var isLocked by remember { mutableStateOf(identityManager.isRegistrationLocked()) }
            var isAttendanceLocked by remember { mutableStateOf(identityManager.isAttendanceLocked()) }

            // ── Subject×Class matrix state ────────────────────────────────────
            // Build unique "ClassName • Subject" tabs from the loaded dataset
            // Each tab is a Pair(class_name, subject) for clean filtering
            var tabs by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
            var selectedTab by remember { mutableStateOf<Pair<String, String>?>(null) }

            LaunchedEffect(dbStateRef) {
                isLocked = identityManager.isRegistrationLocked()
                isAttendanceLocked = identityManager.isAttendanceLocked()
                scope.launch {
                    val db = SyncDatabase.getDatabase(this@StudentRosterActivity)
                    students = db.studentDao().getAllStudents()
                    val teacherAssignedSubjects = IdentityManager(this@StudentRosterActivity).getTeacherAssignedSubjects()
                    
                    // Derive ordered unique (class, subject) tabs, exclusively for teacher's assigned subjects
                    val newTabs = students
                        .filter { teacherAssignedSubjects.isEmpty() || teacherAssignedSubjects.contains(it.subject) }
                        .map { Pair(it.class_name, it.subject) }
                        .distinct()
                        .sortedWith(compareBy({ it.first }, { it.second }))
                    tabs = newTabs
                    // FIX: Validate selected tab still exists after reload; reset if not
                    if (selectedTab == null || !newTabs.contains(selectedTab)) selectedTab = newTabs.firstOrNull()

                    studentSyncStatus.clear()

                    // 1. Populate from local_scores table (actually graded students)
                    db.studentDao().getAllScores().forEach { score ->
                        val key = score.student_id + "_" + score.subject
                        studentSyncStatus[key] = true
                    }

                    // 2. Pre-fill sync status from pending events
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


            // State for the 2-step registration flow
            var pendingStudentBio by remember { mutableStateOf<Array<String?>?>(null) }
            
            // Hoisted Drafts for persistent input across sheet closes
            var draftName by remember { mutableStateOf("") }
            var draftReg by remember { mutableStateOf("") }
            var draftAdmission by remember { mutableStateOf("") }
            var draftGender by remember { mutableStateOf("Male") }
            var draftDob by remember { mutableStateOf("") }
            var draftPhotoUri by remember { mutableStateOf<android.net.Uri?>(null) }
            var draftBitmap by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
            var draftPhotoCaptured by remember { mutableStateOf(false) }

            MaterialTheme {
                Box(modifier = Modifier.fillMaxSize()) {
                Scaffold(
                    bottomBar = {
                        PremiumNavBar(
                            selectedScreen  = selectedScreen,
                            primaryColor    = primaryColor,
                            onHomeClick     = {
                                startActivity(Intent(this@StudentRosterActivity, AppLaunchActivity::class.java))
                                finish()
                            },
                            onRosterClick   = { selectedScreen = AppScreen.ROSTER },
                            onSettingsClick = { selectedScreen = AppScreen.SETTINGS }
                        )
                    },
                    floatingActionButton = {
                        if (!showFocusMode && selectedScreen == AppScreen.ROSTER) {
                            Column(
                                horizontalAlignment = Alignment.End,
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier.padding(bottom = 24.dp)
                            ) {
                                // Take Attendance FAB — only visible to the form teacher of this class
                                if (selectedTab != null &&
                                    IdentityManager(this@StudentRosterActivity).isFormTeacherOf(selectedTab?.first ?: "")) {
                                    FloatingActionButton(
                                        onClick = {
                                            if (isAttendanceLocked) {
                                                android.widget.Toast.makeText(
                                                    this@StudentRosterActivity,
                                                    "🔒 Attendance is locked by the Admin. Sync to refresh status.",
                                                    android.widget.Toast.LENGTH_SHORT
                                                ).show()
                                            } else {
                                                val intent = Intent(this@StudentRosterActivity, AttendanceActivity::class.java).apply {
                                                    putExtra(AttendanceActivity.EXTRA_CLASS_NAME, selectedTab?.first ?: "")
                                                    putExtra(AttendanceActivity.EXTRA_SCHOOL_NAME, schoolName)
                                                    putExtra(AttendanceActivity.EXTRA_PRIMARY_COLOR, primaryColorHex)
                                                }
                                                startActivity(intent)
                                            }
                                        },
                                        containerColor = if (isAttendanceLocked) Color(0xFF757575) else Color(0xFF1B5E20),
                                        contentColor = Color.White
                                    ) {
                                        Icon(
                                            imageVector = if (isAttendanceLocked) Icons.Default.Lock else Icons.Default.Check,
                                            contentDescription = if (isAttendanceLocked) "Attendance Locked" else "Take Attendance"
                                        )
                                    }
                                }
                                // Add Student FAB
                                FloatingActionButton(
                                    onClick = { 
                                        if (isLocked) {
                                            android.widget.Toast.makeText(
                                                this@StudentRosterActivity,
                                                "🔒 Registration is locked by the Admin. Sync to refresh status.",
                                                android.widget.Toast.LENGTH_SHORT
                                            ).show()
                                        } else {
                                            draftClass = selectedTab?.first ?: ""
                                            showAddStudentDialog = true 
                                        }
                                    },
                                    containerColor = if (isLocked) Color(0xFF757575) else primaryColor,
                                    contentColor = Color.White
                                ) {
                                    Icon(
                                        imageVector = if (isLocked) Icons.Default.Lock else Icons.Default.PersonAdd,
                                        contentDescription = if (isLocked) "Registration Locked" else "Add Student"
                                    )
                                }
                            }
                        }
                    }
                ) { innerPadding ->
                    Surface(modifier = Modifier.fillMaxSize().padding(innerPadding), color = DeepNavy) {

                        // ── Add Student Sheet (Step 1 - Bio) ───────────────────────────
                        if (showAddStudentDialog && pendingStudentBio == null) {
                            AddStudentSheet(
                                primaryColor          = primaryColor,
                                preselectedClass      = draftClass,
                                classList             = (IdentityManager(this@StudentRosterActivity).getAllClasses() + tabs.map { it.first }).distinct().sorted(),
                                onClassChange         = { draftClass = it },
                                planModules           = planModules,
                                draftName             = draftName, onNameChange = { draftName = it },
                                draftReg              = draftReg, onRegChange = { draftReg = it },
                                draftAdmission        = draftAdmission, onAdmissionChange = { draftAdmission = it },
                                draftGender           = draftGender, onGenderChange = { draftGender = it },
                                draftDob              = draftDob, onDobChange = { draftDob = it },
                                draftPhotoUri         = draftPhotoUri, onPhotoUriChange = { draftPhotoUri = it },
                                draftBitmap           = draftBitmap, onBitmapChange = { draftBitmap = it },
                                draftPhotoCaptured    = draftPhotoCaptured, onPhotoCapturedChange = { draftPhotoCaptured = it },
                                onDismiss             = { showAddStudentDialog = false },
                                onNext                = { name, photo, regNo, admissionNo, gen, dateOfBirth ->
                                    showAddStudentDialog = false
                                    pendingStudentBio = arrayOf(name, photo, regNo, admissionNo, gen, dateOfBirth)
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
                                     TextButton(onClick = { showSyncWarning = false; triggerSync(onSyncDone = { dbStateRef++ }, onSuccess = { top -> honorRollStudents = top }) }) {
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

                        // ── Screen routing: Settings or Roster ────────────────────────
                        if (selectedScreen == AppScreen.SETTINGS) {
                            SettingsScreen(
                                onDisconnect = {
                                    IdentityManager(this@StudentRosterActivity).clearData()
                                    scope.launch(Dispatchers.IO) {
                                        SyncDatabase.getDatabase(this@StudentRosterActivity).clearAllTables()
                                        launch(Dispatchers.Main) {
                                            startActivity(Intent(this@StudentRosterActivity, HandshakeActivity::class.java))
                                            finish()
                                        }
                                    }
                                }
                            )
                        } else if (showFocusMode && filteredStudents.isNotEmpty()) {
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
                                        if (missing > 0) showSyncWarning = true else triggerSync(onSyncDone = { dbStateRef++ }, onSuccess = { top -> honorRollStudents = top })
                                    }
                                )

                                // ── Grouped Subject Tab Bar ──────────────────────
                                if (tabs.isNotEmpty()) {
                                    GroupedSubjectTabBar(
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
                                                statusMap = studentSyncStatus,
                                                onDelete = { student ->
                                                    scope.launch {
                                                        saveDeleteStudentEvent(this@StudentRosterActivity, student.id)
                                                        dbStateRef++
                                                    }
                                                },
                                                onStudentClick = { student ->
                                                    studentToEdit = student
                                                }
                                            )
                                        }
                                    }
                                }
                            }
                            
                            // The Eco-Guardian Shield Overlay
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopEnd) {
                                EcoGuardianShield(modifier = Modifier.padding(top = 100.dp, end = 16.dp))
                            }
                            
                            // The Honor Roll Dialog Modal
                            if (honorRollStudents.isNotEmpty()) {
                                HonorRollDialog(
                                    topStudents = honorRollStudents,
                                    primaryColor = primaryColor,
                                    onDismiss = { honorRollStudents = emptyList() }
                                )
                            }
                        }
                    }
                    }
                }

                // ── Subject Enrollment Full-Screen Overlay (above Scaffold) ────────────────
                if (pendingStudentBio != null) {
                    val masterSubjectsList = IdentityManager(this@StudentRosterActivity)
                        .getSubjectsForClass(draftClass)
                        .ifEmpty {
                            tabs.filter { it.first == draftClass }.map { it.second }.distinct()
                        }

                    val bio = pendingStudentBio!!
                    SubjectEnrollmentScreen(
                        primaryColor      = primaryColor,
                        studentName       = bio[0] ?: "",
                        preselectedClass  = draftClass,
                        availableSubjects = masterSubjectsList,
                        planModules       = planModules,
                        onBack            = { pendingStudentBio = null; showAddStudentDialog = true },
                        onRegister        = { subjects, parentName, email, phone ->
                            scope.launch {
                                saveAddStudentEvent(
                                    context     = this@StudentRosterActivity,
                                    studentName = bio[0] ?: "",
                                    className   = draftClass,
                                    subjects    = subjects,
                                    photoBase64 = bio[1],
                                    parentName  = parentName,
                                    parentEmail = email,
                                    parentPhone = phone,
                                    regNo       = bio[2],
                                    admissionNo = bio[3],
                                    gender      = bio[4],
                                    dob         = bio[5]
                                )
                                dbStateRef++
                                pendingStudentBio = null
                                draftName = ""
                                draftReg = ""
                                draftAdmission = ""
                                draftGender = "Male"
                                draftDob = ""
                                draftPhotoUri = null
                                draftBitmap = null
                                draftPhotoCaptured = false
                            }
                        }
                    )
                }

                if (studentToEdit != null) {
                    val student = studentToEdit!!
                    val enrolledSubjects = students.filter { it.id == student.id }.map { it.subject }
                    val masterSubjectsList = IdentityManager(this@StudentRosterActivity)
                        .getSubjectsForClass(student.class_name)
                        .ifEmpty {
                            tabs.filter { it.first == student.class_name }.map { it.second }.distinct()
                        }

                    EditStudentRecordSheet(
                        primaryColor = primaryColor,
                        student = student,
                        scoreComponents = scoreComponents,
                        allEnrolledSubjects = enrolledSubjects,
                        masterSubjectsList = masterSubjectsList,
                        onDismiss = { studentToEdit = null },
                        onSave = { name, reg, adm, gen, dob, parentName, email, phone, photo, scores, subjects ->
                            scope.launch {
                                saveAddStudentEvent(
                                    context = this@StudentRosterActivity,
                                    studentName = name,
                                    className = student.class_name,
                                    subjects = subjects,
                                    photoBase64 = photo,
                                    parentName  = parentName,
                                    parentEmail = email,
                                    parentPhone = phone,
                                    regNo = reg,
                                    admissionNo = adm,
                                    gender = gen,
                                    dob = dob,
                                    existingStudentId = student.id
                                )

                                saveGradeEvent(
                                    context = this@StudentRosterActivity,
                                    studentId = student.id,
                                    subject = student.subject,
                                    compValues = scores,
                                    components = scoreComponents
                                )

                                dbStateRef++
                                studentToEdit = null
                            }
                        }
                    )
                }

            } // Close MaterialTheme
        } // Close setContent
    }

    private fun triggerSync(onSyncDone: () -> Unit, onSuccess: (List<com.nexus.school.data.HonorRollItem>) -> Unit) {
        val scope = kotlinx.coroutines.CoroutineScope(Dispatchers.IO)
        scope.launch {
            val worker = com.nexus.school.network.SyncWorker(this@StudentRosterActivity)
            val result = worker.pushPendingEvents()
            val identityManager = com.nexus.school.security.IdentityManager(this@StudentRosterActivity)
            if (result.success) {
                val db = SyncDatabase.getDatabase(this@StudentRosterActivity)
                val topStudents = db.studentDao().getHonorRoll()
                launch(Dispatchers.Main) { 
                    if (result.partialLimit) {
                        if (identityManager.isRegistrationLocked()) {
                            android.widget.Toast.makeText(
                                this@StudentRosterActivity, 
                                "ℹ️ Sync partial: ${result.failedCount} students not added — registration is locked by Admin.", 
                                android.widget.Toast.LENGTH_LONG
                            ).show()
                        } else {
                            android.widget.Toast.makeText(
                                this@StudentRosterActivity, 
                                "ℹ️ Sync partial: ${result.failedCount} students not added — school capacity reached. Contact Admin.", 
                                android.widget.Toast.LENGTH_LONG
                            ).show()
                        }
                    } else if (result.hadPendingEvents) {
                        // Only celebrate when real events were actually pushed
                        android.widget.Toast.makeText(this@StudentRosterActivity, "✅ Sync Complete!", android.widget.Toast.LENGTH_SHORT).show()
                    }
                    // If hadPendingEvents == false this was a silent config-pull
                    // (lock state / score components refresh) — no toast needed.
                    onSyncDone()
                    if (topStudents.isNotEmpty()) onSuccess(topStudents) 
                }
            } else {
                launch(Dispatchers.Main) {
                    android.widget.Toast.makeText(this@StudentRosterActivity, "❌ Sync Failed", android.widget.Toast.LENGTH_SHORT).show()
                }
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

    // FIX: Auto-ping Hub on first load so the indicator is meaningful immediately
    LaunchedEffect(Unit) {
        connectionState = 1
        val serverInfo = IdentityManager(context).getServerInfo()
        if (serverInfo == null) { connectionState = 3; return@LaunchedEffect }
        val (ip, port) = serverInfo
        connectionState = try {
            java.net.Socket().use { socket ->
                socket.connect(java.net.InetSocketAddress(ip, port), 2500)
            }
            2
        } catch (e: Exception) { 3 }
    }

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
                // Visual Ping Indicator
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .background(
                            when (connectionState) {
                                2 -> Color.Green
                                3 -> Color.Red
                                else -> Color.Gray
                            },
                            CircleShape
                        )
                        .clickable {
                            connectionState = 1
                            scope.launch(Dispatchers.IO) {
                                val serverInfo = IdentityManager(context).getServerInfo()
                                if (serverInfo == null) { connectionState = 3; return@launch }
                                val (ip, port) = serverInfo
                                val isReachable = try {
                                    java.net.Socket().use { socket ->
                                        socket.connect(java.net.InetSocketAddress(ip, port), 2500)
                                        true
                                    }
                                } catch (e: Exception) { false }
                                connectionState = if (isReachable) 2 else 3
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

// ─── Grouped Subject Tab Bar (visually sections subjects by class header) ──────────
// Private class-vs-subject discriminated union for the LazyRow item stream
private sealed interface TabRowItem {
    data class ClassHeader(val className: String) : TabRowItem
    data class SubjectTab(val tab: Pair<String, String>) : TabRowItem
}

@Composable
fun GroupedSubjectTabBar(
    tabs: List<Pair<String, String>>,
    selectedTab: Pair<String, String>?,
    primaryColor: Color,
    onTabSelected: (Pair<String, String>) -> Unit
) {
    // Build a flat list that interleaves class-header items before each class group
    val items: List<TabRowItem> = remember(tabs) {
        tabs.groupBy { it.first }
            .flatMap { (cls, subs) ->
                buildList {
                    add(TabRowItem.ClassHeader(cls))
                    subs.forEach { add(TabRowItem.SubjectTab(it)) }
                }
            }
    }

    Column {
        LazyRow(
            modifier = Modifier
                .fillMaxWidth()
                .background(DeepNavy)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            items(items) { item ->
                when (item) {
                    is TabRowItem.ClassHeader -> {
                        // Non-clickable subtle class label
                        Text(
                            item.className,
                            color = TextMuted,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 1.2.sp,
                            modifier = Modifier
                                .background(GlassWhite, RoundedCornerShape(6.dp))
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                    is TabRowItem.SubjectTab -> {
                        val isSelected = item.tab == selectedTab
                        Surface(
                            modifier = Modifier.clickable { onTabSelected(item.tab) },
                            shape = RoundedCornerShape(50),
                            color = if (isSelected) primaryColor else GlassWhite
                        ) {
                            Text(
                                item.tab.second,
                                color = if (isSelected) Color.White else TextMuted,
                                fontSize = 12.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                            )
                        }
                    }
                }
            }
        }
        Divider(color = GlassBorder, thickness = 1.dp)
    }
}

// ─── Student List ───────────────────────────────────────────────────────────────
@Composable
fun StudentList(
    students: List<Student>,
    primaryColor: Color,
    statusMap: Map<String, Boolean>,
    onDelete: (Student) -> Unit = {},
    onStudentClick: (Student) -> Unit = {}
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
                    isSaved = statusMap[student.id + "_" + student.subject] == true || statusMap[student.id] == true,
                    onDelete = if (student.id.startsWith("TEMP_")) onDelete else null,
                    onStudentClick = onStudentClick
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

// ─── EXIF Rotation Correction ─────────────────────────────────────────────────
// Camera apps often store rotation as EXIF metadata instead of rotating pixels.
// This helper reads the tag and physically rotates the bitmap to match.
fun correctBitmapRotation(
    bitmap: android.graphics.Bitmap,
    uri: Uri,
    context: android.content.Context
): android.graphics.Bitmap {
    return try {
        val stream = context.contentResolver.openInputStream(uri) ?: return bitmap
        val exif   = AndroidExif(stream)
        stream.close()
        val deg = when (exif.getAttributeInt(AndroidExif.TAG_ORIENTATION, AndroidExif.ORIENTATION_NORMAL)) {
            AndroidExif.ORIENTATION_ROTATE_90  -> 90f
            AndroidExif.ORIENTATION_ROTATE_180 -> 180f
            AndroidExif.ORIENTATION_ROTATE_270 -> 270f
            else -> return bitmap
        }
        val m = android.graphics.Matrix().apply { postRotate(deg) }
        android.graphics.Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
    } catch (e: Exception) { bitmap }
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
    val identityManager = remember { IdentityManager(context) }

    val gradeState = remember { mutableStateMapOf<String, String>() }

    LaunchedEffect(students) {
        val db = SyncDatabase.getDatabase(context)
        db.studentDao().getAllScores().forEach { score ->
            val key = "${score.student_id}_${score.subject}_${score.component_key}"
            gradeState[key] = score.score.toString()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(DeepNavy)) {
        Column(modifier = Modifier.fillMaxSize()) {

            // ── Premium header bar ────────────────────────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                primaryColor.copy(alpha = 0.95f),
                                primaryColor.copy(alpha = 0.6f),
                                Color(0xFF111530)
                            )
                        )
                    )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 6.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onClose) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Close", tint = Color.White)
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Focus Mode", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
                        selectedTab?.let {
                            Text(
                                "${it.first}  ·  ${it.second}",
                                color = Color.White.copy(alpha = 0.65f), fontSize = 11.sp
                            )
                        }
                    }
                    // Progress chip
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = Color.White.copy(alpha = 0.15f)
                    ) {
                        Text(
                            "${pagerState.currentPage + 1} / ${students.size}",
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                }
            }

            HorizontalPager(state = pagerState, modifier = Modifier.weight(1f)) { page ->
                val student    = students[page]
                val studentId  = student.id
                val subjectKey = "${studentId}_${student.subject}"

                val compValues: Map<String, String> = scoreComponents.associate { comp ->
                    comp.key to (gradeState["${subjectKey}_${comp.key}"] ?: "")
                }

                val isGradesLocked = remember { identityManager.isGradesLocked() }
                StudentFocusCard(
                    student         = student,
                    selectedTab     = selectedTab,
                    primaryColor    = primaryColor,
                    scoreComponents = scoreComponents,
                    compValues      = compValues,
                    isLocked        = isGradesLocked,
                    onValueChange   = { compKey, value ->
                        if (!isGradesLocked) {
                            gradeState["${subjectKey}_${compKey}"] = value
                        }
                    },
                    onAutoSave = {
                        if (!isGradesLocked) {
                            scope.launch(Dispatchers.IO) {
                                saveGradeEvent(
                                    context, studentId, student.subject,
                                    scoreComponents.associate { it.key to (gradeState["${subjectKey}_${it.key}"] ?: "") },
                                    scoreComponents
                                )
                                launch(Dispatchers.Main) { onLogSave(studentId, student.subject, true) }
                            }
                        }
                    },
                    onSave = {
                        if (isGradesLocked) {
                            scope.launch {
                                if (page < students.size - 1) pagerState.animateScrollToPage(page + 1)
                                else onClose()
                            }
                        } else {
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
}

// ─── Student Focus Card ───────────────────────────────────────────────────────
@Composable
fun StudentFocusCard(
    student: Student,
    selectedTab: Pair<String, String>?,
    primaryColor: Color,
    scoreComponents: List<ScoreComponent>,
    compValues: Map<String, String>,
    isLocked: Boolean = false,
    onValueChange: (String, String) -> Unit,
    onAutoSave: () -> Unit,
    onSave: () -> Unit,
    onSkip: () -> Unit
) {
    val total    = scoreComponents.sumOf { compValues[it.key]?.toIntOrNull() ?: 0 }
    val maxTotal = scoreComponents.sumOf { it.max }

    // Auto-save debounce: 650 ms after last keystroke
    var initialized by remember { mutableStateOf(false) }
    val valueSnapshot = scoreComponents.map { it.key to (compValues[it.key] ?: "") }
    LaunchedEffect(valueSnapshot) {
        if (isLocked) return@LaunchedEffect
        if (!initialized) { initialized = true; return@LaunchedEffect }
        delay(650)
        onAutoSave()
    }

    val pct = if (maxTotal > 0) total.toFloat() / maxTotal else 0f
    val totalColor = when {
        pct >= 0.7f -> Color(0xFF22C55E)   // green
        pct >  0f   -> primaryColor
        else        -> Color(0xFFEF4444)   // red
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp)
    ) {
        Spacer(Modifier.height(14.dp))

        // ── Student identity card (matches EditStudentRecordSheet header style) ─
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            color = Color(0xFF1A1F3A),
            border = BorderStroke(1.dp, GlassBorder)
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Avatar — show decoded photo if available, else initial
                val photoBitmap = remember(student.photo_base64) {
                    student.photo_base64?.let {
                        try {
                            val bytes = android.util.Base64.decode(it, android.util.Base64.DEFAULT)
                            android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        } catch (e: Exception) { null }
                    }
                }

                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.verticalGradient(listOf(primaryColor, primaryColor.copy(alpha = 0.5f)))
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    if (photoBitmap != null) {
                        Image(
                            bitmap = photoBitmap.asImageBitmap(),
                            contentDescription = null,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        Text(
                            text = student.name.take(1).uppercase(),
                            color = Color.White,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                }

                Spacer(Modifier.width(14.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = student.name,
                        color = Color.White,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(student.id, color = TextMuted, fontSize = 11.sp)
                    selectedTab?.let {
                        Spacer(Modifier.height(4.dp))
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = primaryColor.copy(alpha = 0.18f)
                        ) {
                            Text(
                                "${it.first}  ·  ${it.second}",
                                color = primaryColor,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp)
                            )
                        }
                    }
                }

                // Live total badge
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "$total",
                        color = totalColor,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Text("/ $maxTotal", color = TextMuted, fontSize = 11.sp)
                }
            }
        }

        Spacer(Modifier.height(14.dp))

        // ── Score input section header ────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "GRADES — ${student.subject.uppercase()}",
                color = primaryColor,
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 0.8.sp,
                modifier = Modifier.weight(1f)
            )
            if (isLocked) {
                Text("🔒 Locked by Admin", color = Color(0xFFEF4444), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            } else {
                Text("Auto-saves", color = TextMuted, fontSize = 10.sp)
            }
        }
        Spacer(Modifier.height(8.dp))

        // ── Score input grid (2-column, matches EditStudentRecordSheet card style) ─
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
                            enabled     = !isLocked,
                            primaryColor = primaryColor,
                            onValueChange = { v ->
                                if (v.isEmpty() || (v.toIntOrNull() != null && v.toInt() <= comp.max)) {
                                    onValueChange(comp.key, v)
                                }
                            }
                        )
                    }
                    if (rowComps.size < 2) Spacer(Modifier.weight(1f))
                }
            }
            Spacer(Modifier.height(4.dp))
        }

        Spacer(Modifier.height(10.dp))

        // ── Colour-coded total progress bar ──────────────────────────────────
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = totalColor.copy(alpha = if (pct > 0f) 0.15f else 0.08f),
            border = BorderStroke(1.dp, totalColor.copy(alpha = 0.3f))
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Total", color = TextMuted, fontSize = 13.sp, modifier = Modifier.weight(1f))
                Text(
                    "$total / $maxTotal",
                    color = totalColor,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        // ── Navigation footer ────────────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(bottom = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedButton(
                onClick = onSkip,
                modifier = Modifier.weight(1f).height(50.dp),
                shape = RoundedCornerShape(50),
                border = BorderStroke(1.dp, GlassBorder),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = TextMuted)
            ) {
                Text("Skip", fontSize = 14.sp)
            }
            Button(
                onClick = onSave,
                modifier = Modifier.weight(2f).height(50.dp),
                colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                shape = RoundedCornerShape(50),
            ) {
                Text(if (isLocked) "Next" else "Save & Next", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(6.dp))
                Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
            }
        }
    }
}

// ─── Compact Grade Input Card ─────────────────────────────────────────────────
// Flat style matching the UpdateStudentRecord grade inputs: label+max above, field below.
@Composable
fun CompactGradeInputCard(
    modifier: Modifier = Modifier,
    label: String,
    maxScore: Int,
    value: String,
    enabled: Boolean = true,
    primaryColor: Color,
    onValueChange: (String) -> Unit
) {
    Column(modifier = modifier) {
        Text(
            text = "$label (Max $maxScore)",
            color = TextMuted,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(bottom = 4.dp)
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            enabled = enabled,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            textStyle = TextStyle(
                color = Color.White,
                fontSize = 18.sp,
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.ExtraBold
            ),
            placeholder = {
                Text(
                    "0", color = Color.White.copy(alpha = 0.2f),
                    fontSize = 18.sp, modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center
                )
            },
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = primaryColor,
                unfocusedBorderColor = GlassBorder,
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                cursorColor = primaryColor
            ),
            shape = RoundedCornerShape(10.dp)
        )
    }
}

// ─── Student Row ──────────────────────────────────────────────────────────────
@Composable
fun StudentRow(
    student: Student,
    index: Int,
    primaryColor: Color,
    isSaved: Boolean,
    /** Non-null only on TEMP_ (locally-added) students — shows delete control. */
    onDelete: ((Student) -> Unit)? = null,
    onStudentClick: (Student) -> Unit = {}
) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable { onStudentClick(student) },
        shape = RoundedCornerShape(14.dp),
        color = GlassWhite,
        border = BorderStroke(1.dp, GlassBorder)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier.size(36.dp).clip(CircleShape)
                    .background(primaryColor.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Text("$index", color = primaryColor, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(student.name, color = Color.White, fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("ID: ${student.id}", color = TextMuted, fontSize = 11.sp)
                    if (student.id.startsWith("TEMP_")) {
                        Text("• Local", color = WarnAmber, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            if (isSaved) {
                Surface(shape = RoundedCornerShape(50), color = GreenDone.copy(alpha = 0.15f)) {
                    Text("Graded ✓", color = GreenDone, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
                }
            } else {
                Text("Pending", color = TextMuted, fontSize = 11.sp)
            }
            if (onDelete != null) {
                IconButton(onClick = { onDelete(student) }, modifier = Modifier.size(32.dp)) {
                    Icon(
                        imageVector = Icons.Default.Delete, contentDescription = "Remove student",
                        tint = Color(0xFFFF5252).copy(alpha = 0.7f), modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}


@Preview(showBackground = true, backgroundColor = 0xFF0A0E2E, name = "Tab Bar Preview")
@Composable
fun PreviewGroupedSubjectTabBar() {
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
            GroupedSubjectTabBar(tabs = sampleTabs, selectedTab = selected, primaryColor = primaryColor, onTabSelected = { selected = it })
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditStudentRecordSheet(
    primaryColor: Color,
    student: Student,
    scoreComponents: List<ScoreComponent>,
    allEnrolledSubjects: List<String>,
    masterSubjectsList: List<String>,
    onDismiss: () -> Unit,
    onSave: (
        name: String,
        regNo: String?,
        admissionNo: String?,
        gender: String?,
        dob: String?,
        parentName: String?,
        parentEmail: String?,
        parentPhone: String?,
        photoBase64: String?,
        scores: Map<String, String>,
        subjects: List<String>
    ) -> Unit
) {
    val context    = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val isGradesLocked = remember { IdentityManager(context).isGradesLocked() }

    var showDatePicker by remember { mutableStateOf(false) }

    var draftName by remember { mutableStateOf(student.name) }
    var draftReg by remember { mutableStateOf(student.reg_no ?: "") }
    var draftAdmission by remember { mutableStateOf(student.admission_no ?: "") }
    var draftGender by remember { mutableStateOf(student.gender ?: "Male") }
    var draftDob by remember { mutableStateOf(student.dob ?: "") }
    var parentName  by remember { mutableStateOf(student.parent_name ?: "") }
    var parentEmail by remember { mutableStateOf(student.parent_email ?: "") }
    var parentPhone by remember { mutableStateOf(student.parent_phone ?: "") }
    var draftPhotoBase64 by remember { mutableStateOf(student.photo_base64) }
    var draftBitmap by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
    var draftPhotoUri by remember { mutableStateOf<Uri?>(null) }
    var draftPhotoCaptured by remember { mutableStateOf(false) }
    var bitmapToCropEdit by remember { mutableStateOf<android.graphics.Bitmap?>(null) }

    val tempScores = remember { mutableStateMapOf<String, String>() }
    var selectedSubjects by remember { mutableStateOf(allEnrolledSubjects.toSet()) }
    // 0 = Scores, 1 = Profile Details, 2 = Enrolled Subjects
    var currentPage by remember { mutableStateOf(0) }

    // Load photo and scores
    LaunchedEffect(student.id, student.subject) {
        if (!student.photo_base64.isNullOrBlank()) {
            try {
                val decoded = Base64.decode(student.photo_base64, Base64.DEFAULT)
                draftBitmap = BitmapFactory.decodeByteArray(decoded, 0, decoded.size)
                draftPhotoCaptured = true
            } catch (e: Exception) {}
        }
        val db = SyncDatabase.getDatabase(context)
        val scores = db.studentDao().getScoresForStudent(student.id, student.subject)
        scores.forEach { score ->
            tempScores[score.component_key] = score.score.toString()
        }
    }

    val doSave: () -> Unit = {
        val photoEncoded = draftBitmap?.let { bmp ->
            java.io.ByteArrayOutputStream().also { out ->
                bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, out)
            }.run { Base64.encodeToString(toByteArray(), Base64.NO_WRAP) }
        } ?: draftPhotoBase64
        onSave(
            draftName.trim(),
            draftReg.trim().ifBlank { null },
            draftAdmission.trim().ifBlank { null },
            draftGender,
            draftDob.ifBlank { null },
            parentName.trim().ifBlank { null },
            parentEmail.trim().ifBlank { null },
            parentPhone.trim().ifBlank { null },
            photoEncoded,
            tempScores.toMap(),
            selectedSubjects.toList()
        )
    }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        NexusApp.intentInProgress = false
        val capturedUri = draftPhotoUri
        if (success && capturedUri != null) {
            context.contentResolver.openInputStream(capturedUri)?.use { BitmapFactory.decodeStream(it) }
                ?.let { bmp -> bitmapToCropEdit = correctBitmapRotation(bmp, capturedUri, context) }
        }
    }

    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        NexusApp.intentInProgress = false
        uri ?: return@rememberLauncherForActivityResult
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
            ?.let { bmp -> bitmapToCropEdit = bmp }
    }

    fun launchCamera() {
        val imageFile = java.io.File(
            java.io.File(context.externalCacheDir, "images").also { it.mkdirs() },
            "student_${System.currentTimeMillis()}.jpg"
        )
        val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", imageFile)
        draftPhotoUri = uri
        NexusApp.intentInProgress = true
        cameraLauncher.launch(uri)
    }

    fun launchGallery() {
        NexusApp.intentInProgress = true
        galleryLauncher.launch("image/*")
    }

    // ─── Crop Dialog ───────────────────────────────────────────────────────────
    bitmapToCropEdit?.let { rawBitmap ->
        PhotoCropDialog(
            bitmap    = rawBitmap,
            onCrop = { cropped ->
                draftBitmap = cropped
                draftPhotoCaptured = true
                bitmapToCropEdit = null
            },
            onDismiss = { bitmapToCropEdit = null }
        )
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState       = sheetState,
        containerColor   = Color(0xFF111530),
        contentColor     = Color.White,
        tonalElevation   = 0.dp,
        dragHandle = {
            Box(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 6.dp), Alignment.Center) {
                Box(Modifier.width(40.dp).height(4.dp).clip(RoundedCornerShape(2.dp))
                    .background(Color.White.copy(alpha = 0.2f)))
            }
        }
    ) {
        // DatePicker overlays any page
        if (showDatePicker) {
            val dpState = rememberDatePickerState()
            DatePickerDialog(
                onDismissRequest = { showDatePicker = false },
                confirmButton = {
                    TextButton(onClick = {
                        dpState.selectedDateMillis?.let { millis ->
                            draftDob = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(java.util.Date(millis))
                        }
                        showDatePicker = false
                    }) { Text("OK", color = primaryColor) }
                },
                dismissButton = { TextButton(onClick = { showDatePicker = false }) { Text("Cancel", color = primaryColor) } }
            ) { DatePicker(state = dpState) }
        }

        // ── Page dot indicator ──────────────────────────────────────────────
        @Composable
        fun PageDots() {
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                repeat(3) { i ->
                    Box(Modifier.size(if (i == currentPage) 8.dp else 5.dp).clip(CircleShape)
                        .background(if (i == currentPage) primaryColor else Color.White.copy(alpha = 0.25f)))
                }
            }
        }

        // ── Page 0: Scores ──────────────────────────────────────────────────
        if (currentPage == 0) {
            Column(
                modifier = Modifier.fillMaxWidth().navigationBarsPadding().imePadding()
                    .verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Header
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Scores", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                        Text("${student.name}  ·  ${student.class_name}", color = TextMuted, fontSize = 11.sp)
                        if (isGradesLocked) {
                            Text(
                                "🔒 Locked by Admin",
                                color = Color(0xFFEF4444),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(top = 2.dp)
                            )
                        }
                    }
                    PageDots()
                }

                // Score inputs
                Surface(shape = RoundedCornerShape(14.dp), color = Color(0xFF1A1F3A),
                    border = BorderStroke(1.dp, GlassBorder), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Grades: ${student.subject.uppercase()}", color = primaryColor,
                            fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
                        scoreComponents.chunked(2).forEach { row ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                row.forEach { comp ->
                                    Column(Modifier.weight(1f)) {
                                        Text("${comp.label} (Max ${comp.max})", color = TextMuted,
                                            fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier.padding(bottom = 4.dp))
                                        OutlinedTextField(
                                            value = tempScores[comp.key] ?: "",
                                            onValueChange = { v ->
                                                if (!isGradesLocked) {
                                                    val f = v.filter { it.isDigit() }
                                                    if (f.isEmpty() || (f.toIntOrNull() ?: 0) <= comp.max) tempScores[comp.key] = f
                                                }
                                            },
                                            enabled = !isGradesLocked,
                                            modifier = Modifier.fillMaxWidth(), singleLine = true,
                                            textStyle = TextStyle(
                                                color = if (isGradesLocked) Color.Gray else Color.White,
                                                fontSize = 16.sp,
                                                textAlign = TextAlign.Center
                                            ),
                                            colors = outlinedSheetColors(primaryColor),
                                            shape = RoundedCornerShape(10.dp),
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                                        )
                                    }
                                }
                                if (row.size < 2) Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                }

                // Footer
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(onClick = { doSave() }, modifier = Modifier.weight(1f).height(50.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                        shape = RoundedCornerShape(14.dp),
                        enabled = draftName.isNotBlank() && selectedSubjects.isNotEmpty()
                    ) { Text("Save", fontWeight = FontWeight.Bold) }
                    OutlinedButton(onClick = { currentPage = 1 }, modifier = Modifier.weight(1f).height(50.dp),
                        shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, primaryColor)
                    ) {
                        Text("Bio Data", color = primaryColor, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.width(4.dp))
                        Icon(Icons.Default.ArrowForward, null, tint = primaryColor, modifier = Modifier.size(14.dp))
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }

        // ── Page 1: Profile Details ─────────────────────────────────────────
        if (currentPage == 1) {
            Column(
                modifier = Modifier.fillMaxWidth().navigationBarsPadding().imePadding()
                    .verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Header
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { currentPage = 0 }, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.ArrowBack, null, tint = Color.White)
                    }
                    Spacer(Modifier.width(6.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Profile Details", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                        Text(student.name, color = TextMuted, fontSize = 11.sp)
                    }
                    PageDots()
                }

                // Photo
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(90.dp).clip(CircleShape).background(primaryColor.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center) {
                        if (draftBitmap != null) {
                            Image(draftBitmap!!.asImageBitmap(), null,
                                modifier = Modifier.fillMaxSize().clip(CircleShape), contentScale = ContentScale.Crop)
                        } else Icon(Icons.Default.Person, null, tint = primaryColor, modifier = Modifier.size(36.dp))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Surface(shape = RoundedCornerShape(20.dp), color = primaryColor.copy(alpha = 0.15f),
                            border = BorderStroke(1.dp, primaryColor.copy(alpha = 0.4f)),
                            modifier = Modifier.clickable { launchCamera() }) {
                            Row(Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Icon(Icons.Default.CameraAlt, null, tint = primaryColor, modifier = Modifier.size(14.dp))
                                Text("Camera", color = primaryColor, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        Surface(shape = RoundedCornerShape(20.dp), color = Color(0xFF2A2F55),
                            border = BorderStroke(1.dp, GlassBorder),
                            modifier = Modifier.clickable { launchGallery() }) {
                            Row(Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Icon(Icons.Default.PhotoLibrary, null, tint = Color.White.copy(alpha = 0.7f), modifier = Modifier.size(14.dp))
                                Text("Gallery", color = Color.White.copy(alpha = 0.7f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }

                OutlinedTextField(value = draftName, onValueChange = { draftName = it },
                    label = { Text("Full Name *", color = TextMuted) }, modifier = Modifier.fillMaxWidth(),
                    singleLine = true, colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(14.dp))

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = draftReg, onValueChange = { draftReg = it },
                        label = { Text("Reg No *", color = TextMuted) }, modifier = Modifier.weight(1f),
                        singleLine = true, colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(12.dp))
                    OutlinedTextField(value = draftAdmission, onValueChange = { draftAdmission = it },
                        label = { Text("Admission No", color = TextMuted) }, modifier = Modifier.weight(1f),
                        singleLine = true, colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(12.dp))
                }

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("Gender", color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf("Male", "Female").forEach { g ->
                                FilterChip(selected = draftGender == g, onClick = { draftGender = g },
                                    label = { Text(g, fontSize = 11.sp) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = primaryColor, selectedLabelColor = Color.White,
                                        containerColor = GlassWhite, labelColor = TextMuted))
                            }
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        Text("Date of Birth *", color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(4.dp))
                        OutlinedButton(onClick = { showDatePicker = true },
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, if (draftDob.isBlank()) GlassBorder else primaryColor)) {
                            Icon(Icons.Default.CalendarMonth, null, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(if (draftDob.isBlank()) "Select" else draftDob, fontSize = 12.sp)
                        }
                    }
                }

                Text("Parent / Guardian", color = TextMuted, fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp)
                OutlinedTextField(value = parentName, onValueChange = { parentName = it },
                    label = { Text("Parent / Guardian Name (optional)", color = TextMuted) },
                    modifier = Modifier.fillMaxWidth(), singleLine = true,
                    colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(14.dp))
                OutlinedTextField(value = parentEmail, onValueChange = { parentEmail = it },
                    label = { Text("Parent Email", color = TextMuted) }, modifier = Modifier.fillMaxWidth(),
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(14.dp))
                OutlinedTextField(value = parentPhone, onValueChange = { parentPhone = it },
                    label = { Text("Parent Phone", color = TextMuted) }, modifier = Modifier.fillMaxWidth(),
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(14.dp))

                // Footer
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(onClick = { doSave() }, modifier = Modifier.weight(1f).height(50.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                        shape = RoundedCornerShape(14.dp),
                        enabled = draftName.isNotBlank() && selectedSubjects.isNotEmpty()
                    ) { Text("Save", fontWeight = FontWeight.Bold) }
                    OutlinedButton(onClick = { currentPage = 2 }, modifier = Modifier.weight(1f).height(50.dp),
                        shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, primaryColor)) {
                        Text("Subjects", color = primaryColor, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.width(4.dp))
                        Icon(Icons.Default.ArrowForward, null, tint = primaryColor, modifier = Modifier.size(14.dp))
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }

        // ── Page 2: Enrolled Subjects ───────────────────────────────────────
        if (currentPage == 2) {
            Column(
                modifier = Modifier.fillMaxWidth().navigationBarsPadding().imePadding()
                    .verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Header
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { currentPage = 1 }, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.ArrowBack, null, tint = Color.White)
                    }
                    Spacer(Modifier.width(6.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Enrolled Subjects", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                        Text("${selectedSubjects.size} selected", color = TextMuted, fontSize = 11.sp)
                    }
                    PageDots()
                }

                if (masterSubjectsList.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        masterSubjectsList.chunked(2).forEach { row ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                row.forEach { subject ->
                                    val isSel = subject in selectedSubjects
                                    Surface(
                                        modifier = Modifier.weight(1f).height(50.dp).clickable {
                                            selectedSubjects = if (isSel) selectedSubjects - subject else selectedSubjects + subject
                                        },
                                        shape = RoundedCornerShape(12.dp),
                                        color = if (isSel) primaryColor else Color(0xFF1A1F3A),
                                        border = BorderStroke(1.dp, if (isSel) primaryColor else GlassBorder)
                                    ) {
                                        Row(Modifier.fillMaxSize().padding(horizontal = 14.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text(subject, color = Color.White, fontSize = 12.sp,
                                                fontWeight = if (isSel) FontWeight.Bold else FontWeight.Normal,
                                                maxLines = 1, overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.weight(1f))
                                            if (isSel) Icon(Icons.Default.Check, null, tint = Color.White, modifier = Modifier.size(14.dp))
                                        }
                                    }
                                }
                                if (row.size == 1) Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                }

                Button(onClick = { doSave() }, modifier = Modifier.fillMaxWidth().height(56.dp),
                    enabled = draftName.isNotBlank() && selectedSubjects.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                    shape = RoundedCornerShape(16.dp)) {
                    Text("Save Updates", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(8.dp))
            }
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

// ─── Add Student Sheet (Teacher-Initiated Registration) ───────────────────────
// ─── Add Student Sheet — Step 1: Bio ───────────────────────────────────────────
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddStudentSheet(
    primaryColor: Color,
    preselectedClass: String,
    classList: List<String>,
    onClassChange: (String) -> Unit,
    planModules: List<String>,
    draftName: String, onNameChange: (String) -> Unit,
    draftReg: String, onRegChange: (String) -> Unit,
    draftAdmission: String, onAdmissionChange: (String) -> Unit,
    draftGender: String, onGenderChange: (String) -> Unit,
    draftDob: String, onDobChange: (String) -> Unit,
    draftPhotoUri: android.net.Uri?, onPhotoUriChange: (android.net.Uri?) -> Unit,
    draftBitmap: android.graphics.Bitmap?, onBitmapChange: (android.graphics.Bitmap?) -> Unit,
    @Suppress("UNUSED_PARAMETER") draftPhotoCaptured: Boolean, onPhotoCapturedChange: (Boolean) -> Unit,
    onDismiss: () -> Unit,
    onNext: (name: String, photo: String?, regNo: String?, admissionNo: String?, gender: String?, dob: String?) -> Unit
) {
    val context    = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var showDatePicker by remember { mutableStateOf(false) }
    var showPrefixDialog by remember { mutableStateOf(false) }

    // Hydrate empty Reg/Admin with configured repeat prefixes
    LaunchedEffect(Unit) {
        if (draftReg.isBlank()) onRegChange(IdentityManager(context).getRegPrefix())
        if (draftAdmission.isBlank()) onAdmissionChange(IdentityManager(context).getAdminPrefix())
    }

    val hasPhotoModule = planModules.any { it.equals("student_photo", ignoreCase = true) }
    val isValid = draftName.isNotBlank() && draftReg.isNotBlank() && draftDob.isNotBlank()
    var bitmapToCropAdd by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
    var lastCameraUri by remember { mutableStateOf<Uri?>(null) }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        NexusApp.intentInProgress = false
        val capturedUri = lastCameraUri
        if (success && capturedUri != null) {
            context.contentResolver.openInputStream(capturedUri)?.use { BitmapFactory.decodeStream(it) }
                ?.let { bmp -> bitmapToCropAdd = correctBitmapRotation(bmp, capturedUri, context) }
        }
    }

    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        NexusApp.intentInProgress = false
        uri ?: return@rememberLauncherForActivityResult
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
            ?.let { bmp -> bitmapToCropAdd = bmp }
    }

    fun launchCamera() {
        val imageFile = java.io.File(
            java.io.File(context.externalCacheDir, "images").also { it.mkdirs() },
            "student_${System.currentTimeMillis()}.jpg"
        )
        val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", imageFile)
        onPhotoUriChange(uri)
        lastCameraUri = uri
        NexusApp.intentInProgress = true
        cameraLauncher.launch(uri)
    }

    fun launchGallery() {
        NexusApp.intentInProgress = true
        galleryLauncher.launch("image/*")
    }

    // Show crop dialog when a raw bitmap is ready
    bitmapToCropAdd?.let { rawBitmap ->
        PhotoCropDialog(
            bitmap    = rawBitmap,
            onCrop = { cropped ->
                onBitmapChange(cropped)
                onPhotoCapturedChange(true)
                bitmapToCropAdd = null
            },
            onDismiss = { bitmapToCropAdd = null }
        )
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState       = sheetState,
        containerColor   = Color(0xFF111530),
        contentColor     = Color.White,
        tonalElevation   = 0.dp,
        dragHandle = {
            Box(modifier = Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 6.dp),
                contentAlignment = Alignment.Center) {
                Box(modifier = Modifier.width(40.dp).height(4.dp)
                    .clip(RoundedCornerShape(2.dp)).background(Color.White.copy(alpha = 0.2f)))
            }
        }
    ) {
        if (showDatePicker) {
            val dpState = rememberDatePickerState()
            DatePickerDialog(
                onDismissRequest = { showDatePicker = false },
                confirmButton = {
                    TextButton(onClick = {
                        dpState.selectedDateMillis?.let { millis ->
                            onDobChange(java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(java.util.Date(millis)))
                        }
                        showDatePicker = false
                    }) { Text("OK", color = primaryColor) }
                },
                dismissButton = { TextButton(onClick = { showDatePicker = false }) { Text("Cancel", color = primaryColor) } }
            ) { DatePicker(state = dpState) }
        }

        if (showPrefixDialog) {
            var tempRegPrefix by remember { mutableStateOf(IdentityManager(context).getRegPrefix()) }
            var tempAdminPrefix by remember { mutableStateOf(IdentityManager(context).getAdminPrefix()) }
            AlertDialog(
                onDismissRequest = { showPrefixDialog = false },
                title = { Text("Set Input Prefixes") },
                text = {
                    Column {
                        OutlinedTextField(value = tempRegPrefix, onValueChange = { tempRegPrefix = it }, label = { Text("Registration No. Prefix") }, singleLine = true)
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(value = tempAdminPrefix, onValueChange = { tempAdminPrefix = it }, label = { Text("Admission No. Prefix") }, singleLine = true)
                    }
                },
                confirmButton = {
                    TextButton(onClick = {
                        IdentityManager(context).saveRegPrefix(tempRegPrefix)
                        IdentityManager(context).saveAdminPrefix(tempAdminPrefix)
                        if (draftReg.isBlank() || draftReg == IdentityManager(context).getRegPrefix()) onRegChange(tempRegPrefix)
                        if (draftAdmission.isBlank() || draftAdmission == IdentityManager(context).getAdminPrefix()) onAdmissionChange(tempAdminPrefix)
                        showPrefixDialog = false
                    }) { Text("Save", color = primaryColor) }
                }
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Title with Class Dropdown Selection
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) {
                    Text("Student Bio (1/2)", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                    Text("Basic identity details", color = TextMuted, fontSize = 11.sp)
                }
                if (classList.isNotEmpty()) {
                    var expanded by remember { mutableStateOf(false) }
                    Box {
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = primaryColor.copy(alpha = 0.2f),
                            border = BorderStroke(1.dp, primaryColor.copy(alpha = 0.4f)),
                            modifier = Modifier.clickable { expanded = !expanded }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(preselectedClass.ifBlank { "Select Class" }, color = primaryColor, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.width(4.dp))
                                Icon(
                                    imageVector = if (expanded) Icons.TwoTone.KeyboardArrowUp else Icons.TwoTone.KeyboardArrowDown,
                                    contentDescription = null,
                                    tint = primaryColor,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        }
                        DropdownMenu(
                            expanded = expanded,
                            onDismissRequest = { expanded = false },
                            modifier = Modifier.background(Color(0xFF1A1F3A))
                        ) {
                            classList.forEach { cls ->
                                DropdownMenuItem(
                                    text = { Text(cls, color = Color.White, fontSize = 13.sp) },
                                    onClick = {
                                        onClassChange(cls)
                                        expanded = false
                                    }
                                )
                            }
                        }
                    }
                } else if (preselectedClass.isNotBlank()) {
                    Surface(shape = RoundedCornerShape(20.dp),
                        color = primaryColor.copy(alpha = 0.2f),
                        border = BorderStroke(1.dp, primaryColor.copy(alpha = 0.4f))) {
                        Text(preselectedClass, color = primaryColor, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp))
                    }
                }
            }

            // Photo
            Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // Avatar circle
                Box(
                    modifier = Modifier.size(90.dp).clip(CircleShape)
                        .background(primaryColor.copy(alpha = 0.15f))
                        .clickable {
                            if (hasPhotoModule) launchCamera()
                            else android.widget.Toast.makeText(context, "Student photos require the Diamond tier. Upgrade in the Desktop Hub.", android.widget.Toast.LENGTH_LONG).show()
                        },
                    contentAlignment = Alignment.Center
                ) {
                    if (draftBitmap != null) {
                        Image(
                            bitmap = draftBitmap.asImageBitmap(),
                            contentDescription = "Student Photo",
                            modifier = Modifier.fillMaxSize().clip(CircleShape),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.Person, null,
                                tint = if (hasPhotoModule) primaryColor else TextMuted,
                                modifier = Modifier.size(36.dp))
                            if (!hasPhotoModule) Text("Silver Plan", color = TextMuted, fontSize = 9.sp)
                        }
                    }
                }
                // Camera / Gallery row (only shown when the photo module is enabled)
                if (hasPhotoModule) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = primaryColor.copy(alpha = 0.15f),
                            border = BorderStroke(1.dp, primaryColor.copy(alpha = 0.4f)),
                            modifier = Modifier.clickable { launchCamera() }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(Icons.Default.CameraAlt, contentDescription = "Camera", tint = primaryColor, modifier = Modifier.size(14.dp))
                                Text("Camera", color = primaryColor, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = Color(0xFF2A2F55),
                            border = BorderStroke(1.dp, GlassBorder),
                            modifier = Modifier.clickable { launchGallery() }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(Icons.Default.PhotoLibrary, contentDescription = "Gallery", tint = Color.White.copy(alpha = 0.7f), modifier = Modifier.size(14.dp))
                                Text("Gallery", color = Color.White.copy(alpha = 0.7f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }

            // Name
            OutlinedTextField(value = draftName, onValueChange = onNameChange,
                label = { Text("Full Name *", color = TextMuted) },
                modifier = Modifier.fillMaxWidth(), singleLine = true,
                colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(14.dp))

            // Reg No & Admission No
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = draftReg, onValueChange = onRegChange,
                    label = { Text("Reg No *", color = TextMuted) },
                    trailingIcon = { 
                        IconButton(onClick = { showPrefixDialog = true }) { 
                            Icon(Icons.Default.Edit, contentDescription = "Prefix Config", tint = primaryColor, modifier = Modifier.size(18.dp)) 
                        } 
                    },
                    modifier = Modifier.weight(1f), singleLine = true,
                    colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(14.dp))
                OutlinedTextField(value = draftAdmission, onValueChange = onAdmissionChange,
                    label = { Text("Addm No. (opt)", color = TextMuted) },
                    trailingIcon = { 
                        IconButton(onClick = { showPrefixDialog = true }) { 
                            Icon(Icons.Default.Edit, contentDescription = "Prefix Config", tint = primaryColor, modifier = Modifier.size(18.dp)) 
                        } 
                    },
                    modifier = Modifier.weight(1f), singleLine = true,
                    colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(14.dp))
            }

            // Gender & DOB
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Gender", color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("Male", "Female").forEach { g ->
                            FilterChip(selected = draftGender == g, onClick = { onGenderChange(g) },
                                label = { Text(g, fontSize = 11.sp) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = primaryColor, selectedLabelColor = Color.White,
                                    containerColor = GlassWhite, labelColor = TextMuted))
                        }
                    }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Date of Birth *", color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    OutlinedButton(
                        onClick = { showDatePicker = true },
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                        shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, if (draftDob.isBlank()) GlassBorder else primaryColor)
                    ) {
                        Icon(Icons.Default.CalendarMonth, null, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(if (draftDob.isBlank()) "Select" else draftDob, fontSize = 12.sp)
                    }
                }
            }

            // Next
            Button(
                onClick = {
                    val photoEncoded = draftBitmap?.let { bmp ->
                        java.io.ByteArrayOutputStream().also { out ->
                            bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, out)
                        }.run { Base64.encodeToString(toByteArray(), Base64.NO_WRAP) }
                    }
                    onNext(draftName.trim(), photoEncoded, draftReg.trim().ifBlank { null },
                        draftAdmission.trim().ifBlank { null }, draftGender, draftDob.ifBlank { null })
                },
                modifier = Modifier.fillMaxWidth().height(56.dp),
                enabled = isValid,
                colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                shape = RoundedCornerShape(16.dp)
            ) {
                Text("Next: Enroll Subjects →", fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

fun getSubjectCategory(subject: String, className: String): String {
    val upperClass = className.uppercase()
    val isJss = upperClass.startsWith("JS") || upperClass.startsWith("JSS") || upperClass.contains("BASIC 7") || upperClass.contains("BASIC 8") || upperClass.contains("BASIC 9")
    val isPrimary = upperClass.startsWith("PRI") || upperClass.startsWith("PRIMARY") || upperClass.startsWith("NUR") || upperClass.startsWith("BASIC 1") || upperClass.startsWith("BASIC 2") || upperClass.startsWith("BASIC 3") || upperClass.startsWith("BASIC 4") || upperClass.startsWith("BASIC 5") || upperClass.startsWith("BASIC 6")

    if (isJss) {
        val vocational = listOf(
            "Arabic Language", "Arabic", "Solar Photovoltaic", "Solar PV", "Fashion Design", "Garment Making",
            "Livestock Farming", "Beauty and Cosmetology", "Computer Hardware", "GSM Repairs",
            "Horticulture", "Crop Production"
        )
        if (vocational.any { subject.contains(it, ignoreCase = true) }) return "Vocational / Optional"
        return "Core"
    } else if (isPrimary) {
        return "Core"
    } else { // SSS / SS
        val science = listOf(
            "Biology", "Chemistry", "Physics", "Agriculture", "Agricultural Science",
            "Further Mathematics", "Further Maths", "Physical Education", "Health Education",
            "Food and Nutrition", "Geography", "Technical Drawing",
            "Animal Husbandry", "Fisheries"
        )
        val humanities = listOf(
            "History", "Government", "Christian Religious Studies", "CRS", "CRK",
            "Islamic Studies", "IRK", "Hausa", "Igbo", "Yoruba", "French", "Arabic",
            "Fine Art", "Music", "Literature in English", "Literature",
            "Home Management", "Catering Craft"
        )
        val business = listOf("Financial Accounting", "Accounting", "Commerce", "Marketing", "Economics")
        val trade = listOf(
            "Solar PV", "Solar Photovoltaic", "Fashion Design", "Garment Making", "Livestock Farming",
            "Beauty and Cosmetology", "Computer Hardware", "GSM Repairs", "Horticulture", "Crop Production",
            "Catering Craft", "Home Management", "Clothing and Textiles", "Citizenship", "Insurance"
        )

        // Compulsory Core for SSS
        val core = listOf("English Language", "General Mathematics", "Mathematics", "Civic Education", "Digital Technologies")

        if (core.any { subject.equals(it, ignoreCase = true) }) return "Core & Compulsory"
        if (science.any { subject.equals(it, ignoreCase = true) }) return "Science"
        if (humanities.any { subject.equals(it, ignoreCase = true) }) return "Humanities / Arts"
        if (business.any { subject.equals(it, ignoreCase = true) }) return "Business"
        if (trade.any { subject.contains(it, ignoreCase = true) }) return "Trade"
        return "Core & Compulsory"
    }
}

// ─── Subject Enrollment Screen — Step 2: Full Screen ────────────────────────────
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubjectEnrollmentScreen(
    primaryColor: Color,
    studentName: String,
    preselectedClass: String,
    availableSubjects: List<String>,
    planModules: List<String>,
    onBack: () -> Unit,
    onRegister: (subjects: List<String>, parentName: String?, email: String?, phone: String?) -> Unit
) {
    val requiresParentContact = planModules.any { it.equals("parent_contact", ignoreCase = true) }

    val upperClass = preselectedClass.uppercase()
    val isJss = upperClass.startsWith("JS") || upperClass.startsWith("JSS") || upperClass.contains("BASIC 7") || upperClass.contains("BASIC 8") || upperClass.contains("BASIC 9")
    val isPrimary = upperClass.startsWith("PRI") || upperClass.startsWith("PRIMARY") || upperClass.startsWith("NUR") || upperClass.startsWith("BASIC 1") || upperClass.startsWith("BASIC 2") || upperClass.startsWith("BASIC 3") || upperClass.startsWith("BASIC 4") || upperClass.startsWith("BASIC 5") || upperClass.startsWith("BASIC 6")

    val categories = when {
        isJss -> listOf("All", "Core", "Vocational / Optional")
        isPrimary -> listOf("All", "Core")
        else -> listOf("All", "Core & Compulsory", "Science", "Humanities / Arts", "Business", "Trade")
    }

    var selectedCategory by remember { mutableStateOf("All") }

    val filteredSubjects = if (selectedCategory == "All") {
        availableSubjects
    } else {
        availableSubjects.filter { getSubjectCategory(it, preselectedClass) == selectedCategory }
    }

    var selectedSubjects by remember { mutableStateOf(availableSubjects.toSet()) }
    var parentName       by remember { mutableStateOf("") }
    var parentEmail      by remember { mutableStateOf("") }
    var parentPhone      by remember { mutableStateOf("") }
    var manualInput      by remember { mutableStateOf("") }

    val isValid = selectedSubjects.isNotEmpty() &&
        (!requiresParentContact || (parentEmail.isNotBlank() && parentPhone.isNotBlank()))

    Box(modifier = Modifier.fillMaxSize().background(DeepNavy)) {
        Column(modifier = Modifier.fillMaxSize()) {

            // ── Top Bar ──────────────────────────────────────────────────────────
            Surface(color = Color(0xFF111530), tonalElevation = 0.dp) {
                Row(
                    modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Back", tint = Color.White)
                    }
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Enroll Subjects (2/2)", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                        Text(studentName, color = primaryColor, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                    if (preselectedClass.isNotBlank()) {
                        Surface(shape = RoundedCornerShape(20.dp),
                            color = primaryColor.copy(alpha = 0.2f),
                            border = BorderStroke(1.dp, primaryColor.copy(alpha = 0.4f))) {
                            Text(preselectedClass, color = primaryColor, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp))
                        }
                    }
                }
            }

            // ── Scrollable content ────────────────────────────────────────────────
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                // Selection summary pill
                if (selectedSubjects.isNotEmpty()) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = primaryColor.copy(alpha = 0.12f),
                        border = BorderStroke(1.dp, primaryColor.copy(alpha = 0.3f))
                    ) {
                        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CheckCircle, null, tint = primaryColor, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("${selectedSubjects.size} subject${if (selectedSubjects.size > 1) "s" else ""} selected",
                                color = primaryColor, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }

                // Category Filter Tabs
                if (availableSubjects.isNotEmpty() && categories.size > 1) {
                    androidx.compose.foundation.lazy.LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                    ) {
                        item {
                            categories.forEach { category ->
                                val isSelected = selectedCategory == category
                                val bg = if (isSelected) primaryColor else Color(0xFF1E2448)
                                val border = if (isSelected) primaryColor else GlassBorder
                                Surface(
                                    modifier = Modifier.clickable { selectedCategory = category }.padding(end = 8.dp),
                                    shape = RoundedCornerShape(18.dp),
                                    color = bg,
                                    border = BorderStroke(1.dp, border)
                                ) {
                                    Text(
                                        text = category,
                                        color = Color.White,
                                        fontSize = 12.sp,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                                    )
                                }
                            }
                        }
                    }
                }

                // Subject grid
                if (filteredSubjects.isNotEmpty()) {
                    Text("Tap to toggle subjects", color = TextMuted, fontSize = 11.sp, letterSpacing = 0.5.sp)
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        filteredSubjects.chunked(2).forEach { row ->
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                row.forEach { subject ->
                                    val isSelected = subject in selectedSubjects
                                    Surface(
                                        modifier = Modifier.weight(1f).height(56.dp).clickable {
                                            selectedSubjects = if (isSelected) selectedSubjects - subject else selectedSubjects + subject
                                        },
                                        shape = RoundedCornerShape(14.dp),
                                        color = if (isSelected) primaryColor else Color(0xFF1A1F3A),
                                        border = BorderStroke(1.dp, if (isSelected) primaryColor else GlassBorder)
                                    ) {
                                        Row(modifier = Modifier.fillMaxSize().padding(horizontal = 14.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text(subject, color = Color.White, fontSize = 13.sp,
                                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                                maxLines = 1, overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.weight(1f))
                                            if (isSelected) {
                                                Icon(Icons.Default.Check, null, tint = Color.White, modifier = Modifier.size(16.dp))
                                            }
                                        }
                                    }
                                }
                                // Pad odd row
                                if (row.size == 1) Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                } else if (availableSubjects.isNotEmpty()) {
                    Text("No subjects found in this category.", color = TextMuted, fontSize = 13.sp, modifier = Modifier.padding(vertical = 12.dp))
                } else {
                    // Manual subject entry fallback
                    Text("No subjects found for this class. Add manually:", color = TextMuted, fontSize = 12.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = manualInput, onValueChange = { manualInput = it },
                            label = { Text("Subject name", color = TextMuted) },
                            modifier = Modifier.weight(1f), singleLine = true,
                            colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(14.dp)
                        )
                        IconButton(onClick = {
                            if (manualInput.isNotBlank()) { selectedSubjects = selectedSubjects + manualInput.trim(); manualInput = "" }
                        }) { Icon(Icons.Default.Add, "Add", tint = primaryColor) }
                    }
                    if (selectedSubjects.isNotEmpty()) {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(selectedSubjects.toList()) { sub ->
                                AssistChip(onClick = { selectedSubjects = selectedSubjects - sub },
                                    label = { Text(sub, fontSize = 11.sp) },
                                    trailingIcon = { Icon(Icons.Default.Close, null, Modifier.size(12.dp)) })
                            }
                        }
                    }
                }

                // Parent Contact
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Parent / Guardian", color = TextMuted, fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Surface(shape = RoundedCornerShape(20.dp),
                            color = if (requiresParentContact) WarnAmber.copy(alpha = 0.15f) else GlassWhite) {
                            Text(if (requiresParentContact) "Required (Gold+)" else "Optional",
                                color = if (requiresParentContact) WarnAmber else TextMuted,
                                fontSize = 9.sp, fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                        }
                    }
                    OutlinedTextField(
                        value = parentName, onValueChange = { parentName = it },
                        label = { Text("Parent / Guardian Name (optional)", color = TextMuted) },
                        modifier = Modifier.fillMaxWidth(), singleLine = true,
                        colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(14.dp)
                    )
                    OutlinedTextField(
                        value = parentEmail, onValueChange = { parentEmail = it },
                        label = { Text("Parent Email${if (requiresParentContact) " *" else " (optional)"}", color = TextMuted) },
                        modifier = Modifier.fillMaxWidth(), singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(14.dp)
                    )
                    OutlinedTextField(
                        value = parentPhone, onValueChange = { parentPhone = it },
                        label = { Text("Parent Phone${if (requiresParentContact) " *" else " (optional)"}", color = TextMuted) },
                        modifier = Modifier.fillMaxWidth(), singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        colors = outlinedSheetColors(primaryColor), shape = RoundedCornerShape(14.dp)
                    )
                }
                Spacer(Modifier.height(80.dp)) // breathing room above sticky bar
            }
        }

        // ── Sticky Register Bar ───────────────────────────────────────────────────
        Surface(
            modifier = Modifier.fillMaxWidth().align(Alignment.BottomCenter),
            color = Color(0xFF111530), tonalElevation = 8.dp
        ) {
            Button(
                onClick = { onRegister(selectedSubjects.toList(), parentName.ifBlank { null }, parentEmail.ifBlank { null }, parentPhone.ifBlank { null }) },
                modifier = Modifier.fillMaxWidth().navigationBarsPadding()
                    .padding(horizontal = 20.dp, vertical = 14.dp).height(56.dp),
                enabled = isValid,
                colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                shape = RoundedCornerShape(16.dp)
            ) {
                Icon(Icons.Default.PersonAdd, null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Text("Register Student", fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// ─── OutlinedTextField color helper ───────────────────────────────────────────────
@Composable
fun outlinedSheetColors(primaryColor: Color) = OutlinedTextFieldDefaults.colors(
    focusedTextColor     = Color.White,
    unfocusedTextColor   = Color.White,
    focusedBorderColor   = primaryColor,
    unfocusedBorderColor = GlassBorder,
    focusedLabelColor    = primaryColor,
    unfocusedLabelColor  = TextMuted,
    cursorColor          = primaryColor,
    focusedContainerColor   = Color(0x08FFFFFF),
    unfocusedContainerColor = Color.Transparent
)

// ─── Premium Navigation Bar ───────────────────────────────────────────────────
@Composable
fun PremiumNavBar(
    selectedScreen: AppScreen,
    primaryColor: Color,
    onHomeClick: () -> Unit,
    onRosterClick: () -> Unit,
    onSettingsClick: () -> Unit
) {
    Box(
        modifier = Modifier.fillMaxWidth()
            .background(Color(0xFF0D1235))
    ) {
        // Subtle top border
        Divider(color = GlassBorder, thickness = 1.dp,
            modifier = Modifier.align(Alignment.TopCenter))

        Row(
            modifier = Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            NavBarItem(
                icon = Icons.Default.Home, label = "Home",
                selected = false,  // Home always takes you away; never "active"
                primaryColor = primaryColor, onClick = onHomeClick
            )
            NavBarItem(
                icon = Icons.Default.Groups, label = "Roster",
                selected = selectedScreen == AppScreen.ROSTER,
                primaryColor = primaryColor, onClick = onRosterClick
            )
            NavBarItem(
                icon = Icons.Default.Settings, label = "Settings",
                selected = selectedScreen == AppScreen.SETTINGS,
                primaryColor = primaryColor, onClick = onSettingsClick
            )
        }
    }
}

@Composable
private fun RowScope.NavBarItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    selected: Boolean,
    primaryColor: Color,
    onClick: () -> Unit
) {
    val animatedColor by animateColorAsState(
        targetValue = if (selected) primaryColor else TextMuted,
        animationSpec = tween(200), label = "nav_color_$label"
    )
    Column(
        modifier = Modifier
            .weight(1f).fillMaxHeight()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null, onClick = onClick
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (selected) {
                Box(modifier = Modifier.size(40.dp).clip(RoundedCornerShape(12.dp))
                    .background(primaryColor.copy(alpha = 0.18f)))
            }
            Icon(imageVector = icon, contentDescription = label,
                tint = animatedColor, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.height(2.dp))
        Text(label, color = animatedColor, fontSize = 10.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
    }
}

// ─── Settings Screen ────────────────────────────────────────────────────────────
@Composable
fun SettingsScreen(onDisconnect: () -> Unit) {
    val context  = LocalContext.current
    val identity = remember { IdentityManager(context) }
    val schoolName  = remember { identity.getSchoolName() }
    val teacherName = remember { identity.getTeacherName() }
    val serverInfo  = remember { identity.getServerInfo() }

    val tierRaw = remember { identity.getPlanTier() }
    val tier = when (tierRaw.lowercase()) {
        "diamond"    -> "💎 Diamond"
        "gold"       -> "🥇 Gold"
        "silver"     -> "🥈 Silver"
        "standalone" -> "📦 Standalone"
        else         -> "⭐ $tierRaw"
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        item {
            Spacer(Modifier.height(12.dp))
            Text("Settings", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
            Text("Device configuration", color = TextMuted, fontSize = 12.sp)
            Spacer(Modifier.height(6.dp))
        }

        item {
            Surface(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp),
                color = GlassWhite, border = BorderStroke(1.dp, GlassBorder)) {
                Column {
                    SettingsInfoRow(emoji = "🏫", label = "School", value = schoolName)
                    Divider(color = GlassBorder)
                    SettingsInfoRow(emoji = "👩\u200D🏫", label = "Teacher", value = teacherName)
                    Divider(color = GlassBorder)
                    SettingsInfoRow(emoji = "⭐", label = "License Tier", value = tier)
                }
            }
        }

        item {
            Surface(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp),
                color = GlassWhite, border = BorderStroke(1.dp, GlassBorder)) {
                SettingsInfoRow(
                    emoji = "🌐", label = "Hub Address",
                    value = serverInfo?.let { "${it.first}:${it.second}" } ?: "Not connected"
                )
            }
        }

        item {
            OutlinedButton(
                onClick = onDisconnect,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFF4444)),
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, Color(0xFFFF4444).copy(alpha = 0.4f))
            ) {
                Icon(Icons.Default.LinkOff, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(10.dp))
                Text("Disconnect & Scan New QR", fontSize = 14.sp)
            }
        }

        item {
            Text("Nexus School OS · Offline-First · Nigerian Schools",
                color = TextMuted.copy(alpha = 0.5f), fontSize = 10.sp,
                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
        }
    }
}

@Composable
private fun SettingsInfoRow(emoji: String, label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Text(emoji, fontSize = 18.sp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, color = TextMuted, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            Text(value, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
