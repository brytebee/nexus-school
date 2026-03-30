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
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import kotlinx.coroutines.delay

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

        setContent {
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
                            if (obj.has("student_id")) {
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

            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = DeepNavy) {

                    // ── Sync Warning Dialog ───────────────────────────────────
                    if (showSyncWarning) {
                        val missingCount = filteredStudents.size - filteredStudents.count { studentSyncStatus[it.id] == true }
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
                            students = filteredStudents,
                            selectedTab = selectedTab,
                            primaryColor = primaryColor,
                            onClose = { showFocusMode = false },
                            onLogSave = { studentId, isSaved -> studentSyncStatus[studentId] = isSaved }
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
                                    val missing = filteredStudents.count { studentSyncStatus[it.id] != true }
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
            Text(
                text = schoolName.uppercase(),
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 2.sp
            )
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
                    isSaved = statusMap[student.id] == true
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
    onClose: () -> Unit,
    onLogSave: (String, Boolean) -> Unit
) {
    val pagerState = rememberPagerState(pageCount = { students.size })
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    val ca1State = remember { mutableStateMapOf<String, String>() }
    val ca2State = remember { mutableStateMapOf<String, String>() }
    val examState = remember { mutableStateMapOf<String, String>() }

    LaunchedEffect(Unit) {
        val db = SyncDatabase.getDatabase(context)
        val events = db.syncDao().getPendingEvents()
        events.forEach { event ->
            try {
                val obj = org.json.JSONObject(event.payload)
                if (obj.has("student_id") && obj.has("breakdown")) {
                    val studentId = obj.getString("student_id")
                    val breakdown = obj.getJSONObject("breakdown")
                    ca1State[studentId]  = breakdown.getInt("CA1").toString()
                    ca2State[studentId]  = breakdown.getInt("CA2").toString()
                    examState[studentId] = breakdown.getInt("Exam").toString()
                }
            } catch (e: Exception) {}
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
            val studentId = students[page].id
            StudentFocusCard(
                student = students[page],
                selectedTab = selectedTab,
                primaryColor = primaryColor,
                initialCa1 = ca1State[studentId] ?: "",
                initialCa2 = ca2State[studentId] ?: "",
                initialExam = examState[studentId] ?: "",
                onInputsChanged = { ca1, ca2, exam ->
                    ca1State[studentId]  = ca1
                    ca2State[studentId]  = ca2
                    examState[studentId] = exam
                },
                onSave = { ca1, ca2, exam ->
                    scope.launch(Dispatchers.IO) {
                        try {
                            val db = SyncDatabase.getDatabase(context)
                            val total = (ca1.toIntOrNull() ?: 0) + (ca2.toIntOrNull() ?: 0) + (exam.toIntOrNull() ?: 0)
                            val breakdown = """{"CA1": ${ca1.toIntOrNull() ?: 0}, "CA2": ${ca2.toIntOrNull() ?: 0}, "Exam": ${exam.toIntOrNull() ?: 0}}"""
                            // ─── Prompt 4: Subject is now embedded in every grade event ───
                            val subject = students[page].subject
                            val payload = """{"student_id": "$studentId", "score": $total, "subject": "$subject", "assessment": "CA1", "breakdown": $breakdown}"""
                            db.syncDao().insertEvent(
                                com.nexus.school.data.SyncEvent(event_type = "UPDATE_GRADE", payload = payload, is_synced = 0)
                            )
                            launch(Dispatchers.Main) {
                                onLogSave(studentId, true)
                                if (page < students.size - 1) pagerState.animateScrollToPage(page + 1)
                                else onClose()
                            }
                        } catch (e: Exception) {}
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
@Composable
fun StudentFocusCard(
    student: Student,
    selectedTab: Pair<String, String>?,
    primaryColor: Color,
    initialCa1: String,
    initialCa2: String,
    initialExam: String,
    onInputsChanged: (String, String, String) -> Unit,
    onSave: (String, String, String) -> Unit,
    onSkip: () -> Unit
) {
    var ca1  by remember(initialCa1)   { mutableStateOf(initialCa1) }
    var ca2  by remember(initialCa2)   { mutableStateOf(initialCa2) }
    var exam by remember(initialExam)  { mutableStateOf(initialExam) }
    val total = (ca1.toIntOrNull() ?: 0) + (ca2.toIntOrNull() ?: 0) + (exam.toIntOrNull() ?: 0)

    Box(modifier = Modifier.fillMaxSize().padding(24.dp)) {
        Card(
            modifier = Modifier.fillMaxWidth().align(Alignment.Center),
            shape = RoundedCornerShape(28.dp),
            colors = CardDefaults.cardColors(containerColor = GlassWhite),
            border = androidx.compose.foundation.BorderStroke(1.dp, GlassBorder)
        ) {
            Column(
                modifier = Modifier.padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Avatar
                Box(
                    modifier = Modifier.size(88.dp).clip(CircleShape)
                        .background(Brush.verticalGradient(listOf(primaryColor, primaryColor.copy(alpha = 0.7f)))),
                    contentAlignment = Alignment.Center
                ) {
                    Text(student.name.take(1).uppercase(), color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.ExtraBold)
                }
                Spacer(Modifier.height(16.dp))
                Text(student.name, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text(student.id, color = TextMuted, fontSize = 13.sp)

                // Subject badge
                selectedTab?.let {
                    Spacer(Modifier.height(8.dp))
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = primaryColor.copy(alpha = 0.25f)
                    ) {
                        Text(
                            "${it.first}  ·  ${it.second}",
                            color = primaryColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                        )
                    }
                }

                Spacer(Modifier.height(32.dp))

                // Grade Inputs
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    GradeInputColumn("1st CA", "/ 10", ca1) {
                        if (it.isEmpty() || (it.toIntOrNull() != null && it.toInt() <= 10)) {
                            ca1 = it; onInputsChanged(ca1, ca2, exam)
                        }
                    }
                    GradeInputColumn("2nd CA", "/ 10", ca2) {
                        if (it.isEmpty() || (it.toIntOrNull() != null && it.toInt() <= 10)) {
                            ca2 = it; onInputsChanged(ca1, ca2, exam)
                        }
                    }
                    GradeInputColumn("Exam", "/ 80", exam) {
                        if (it.isEmpty() || (it.toIntOrNull() != null && it.toInt() <= 80)) {
                            exam = it; onInputsChanged(ca1, ca2, exam)
                        }
                    }
                }

                Spacer(Modifier.height(28.dp))

                // Total Bar
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            if (total >= 70) Color(0xFF1B4332).copy(alpha = 0.6f)
                            else if (total >= 40) primaryColor.copy(alpha = 0.15f)
                            else Color(0xFF7F1D1D).copy(alpha = 0.5f),
                            RoundedCornerShape(14.dp)
                        )
                        .padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "Total: $total / 100",
                        color = Color.White,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
        }

        // Navigation Controls
        Row(
            modifier = Modifier.fillMaxWidth().align(Alignment.BottomCenter).padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            TextButton(onClick = onSkip) {
                Text("Skip", color = TextMuted, fontSize = 16.sp)
            }
            Button(
                onClick = { onSave(ca1, ca2, exam) },
                colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                shape = RoundedCornerShape(50),
                contentPadding = PaddingValues(horizontal = 28.dp, vertical = 14.dp)
            ) {
                Text("Save & Next", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(6.dp))
                Icon(Icons.Default.ArrowForward, contentDescription = null)
            }
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
