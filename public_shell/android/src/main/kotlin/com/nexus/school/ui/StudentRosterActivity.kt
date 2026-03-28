package com.nexus.school.ui

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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

class StudentRosterActivity : AppCompatActivity() {

    @OptIn(ExperimentalFoundationApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Read school config extras (set by HandshakeActivity on launch)
        val schoolName = intent.getStringExtra("school_name") ?: "Nexus School"
        val primaryColorHex = intent.getStringExtra("primary_color") ?: "#1A237E"

        val primaryColor = try {
            Color(android.graphics.Color.parseColor(primaryColorHex))
        } catch (e: Exception) {
            Color(0xFF1A237E)
        }

        setContent {
            val scope = rememberCoroutineScope()
            var students by remember { mutableStateOf<List<Student>>(emptyList()) }
            var isLoading by remember { mutableStateOf(true) }
            var showFocusMode by remember { mutableStateOf(false) }
            var showSyncWarning by remember { mutableStateOf(false) }
            
            // Map to track sync status of each student. True = fully saved to DB
            val studentSyncStatus = remember { mutableStateMapOf<String, Boolean>() }

            // Load students from Room DB
            LaunchedEffect(Unit) {
                scope.launch {
                    val db = SyncDatabase.getDatabase(this@StudentRosterActivity)
                    students = db.studentDao().getAllStudents()
                    
                    // Pre-fill student sync status by checking if an event exists
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

            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF0A0E2E)
                ) {
                    // Sync Warning Dialog
                    if (showSyncWarning) {
                        val missingCount = students.size - studentSyncStatus.size
                        AlertDialog(
                            onDismissRequest = { showSyncWarning = false },
                            containerColor = Color(0xFF1A1A2E),
                            titleContentColor = Color.White,
                            textContentColor = Color.White.copy(alpha=0.8f),
                            icon = { Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFFFB300)) },
                            title = { Text("Missing Grades") },
                            text = { Text("$missingCount students do not have grades saved. Are you sure you want to sync this partial list right now?") },
                            confirmButton = {
                                TextButton(
                                    onClick = {
                                        showSyncWarning = false
                                        triggerSync(primaryColor)
                                    }
                                ) {
                                    Text("Sync Anyway", color = primaryColor)
                                }
                            },
                            dismissButton = {
                                TextButton(onClick = { showSyncWarning = false }) {
                                    Text("Cancel", color = Color.White.copy(alpha=0.5f))
                                }
                            }
                        )
                    }

                    if (showFocusMode && students.isNotEmpty()) {
                        FocusModePager(
                            students = students,
                            primaryColor = primaryColor,
                            onClose = { showFocusMode = false },
                            onLogSave = { studentId, isSaved ->
                                studentSyncStatus[studentId] = isSaved
                            }
                        )
                    } else {
                        Column(modifier = Modifier.fillMaxSize()) {
                            // --- Header ---
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(
                                        Brush.horizontalGradient(
                                            listOf(primaryColor, primaryColor.copy(alpha = 0.7f))
                                        )
                                    )
                                    .padding(horizontal = 20.dp, vertical = 24.dp)
                            ) {
                                Column {

                                    Text(
                                        text = schoolName,
                                        color = Color.White,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Light,
                                        letterSpacing = 2.sp
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = "Class Roster",
                                        color = Color.White,
                                        fontSize = 26.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Surface(
                                        shape = RoundedCornerShape(20.dp),
                                        color = Color.White.copy(alpha = 0.2f)
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                text = "  ${students.size} Students  ",
                                                color = Color.White,
                                                fontSize = 12.sp
                                            )
                                            Spacer(modifier = Modifier.weight(1f))
                                            Button(
                                                onClick = {
                                                    val missing = students.size - studentSyncStatus.size
                                                    if (missing > 0) {
                                                        showSyncWarning = true
                                                    } else {
                                                        triggerSync(primaryColor)
                                                    }
                                                },
                                                colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 0.dp),
                                                modifier = Modifier.height(30.dp)
                                            ) {
                                                Text("Sync Now", color = primaryColor, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                            }
                                        }
                                    }
                                }
                                // ── Eco-Guardian Shield (top-right corner) ──
                                EcoGuardianShield(
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .padding(top = 4.dp, end = 4.dp)
                                )
                            }

                            // --- Body ---
                            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                                if (isLoading) {
                                    Box(
                                        modifier = Modifier.fillMaxSize(),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            CircularProgressIndicator(color = primaryColor)
                                            Spacer(modifier = Modifier.height(16.dp))
                                            Text(
                                                "Loading class records...",
                                                color = Color.White.copy(alpha = 0.6f)
                                            )
                                        }
                                    }
                                } else if (students.isEmpty()) {
                                    Box(
                                        modifier = Modifier.fillMaxSize(),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            Text("📭", fontSize = 48.sp)
                                            Spacer(modifier = Modifier.height(16.dp))
                                            Text(
                                                "No students loaded yet.",
                                                color = Color.White.copy(alpha = 0.6f),
                                                fontSize = 16.sp
                                            )
                                            Spacer(modifier = Modifier.height(8.dp))
                                            Text(
                                                "Ask your admin to upload the CSV\nand scan the QR code.",
                                                color = Color.White.copy(alpha = 0.4f),
                                                fontSize = 13.sp,
                                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                            )
                                        }
                                    }
                                } else {
                                    Column(Modifier.fillMaxSize()) {
                                        // Grade Class Floating Button
                                        Button(
                                            onClick = { showFocusMode = true },
                                            modifier = Modifier.fillMaxWidth().padding(16.dp).height(56.dp),
                                            colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                                            shape = RoundedCornerShape(12.dp)
                                        ) {
                                            Text("Grade Class (Focus Mode)", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                                        }
                                        
                                        // Group students by class
                                        val groupedStudents = students.groupBy { it.class_name }
                                        ClassGroupedList(
                                            groupedStudents = groupedStudents,
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
                if (success) {
                    android.widget.Toast.makeText(this@StudentRosterActivity, "Sync Complete!", android.widget.Toast.LENGTH_SHORT).show()
                } else {
                    android.widget.Toast.makeText(this@StudentRosterActivity, "Sync Failed", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FocusModePager(
    students: List<Student>,
    primaryColor: Color,
    onClose: () -> Unit,
    onLogSave: (String, Boolean) -> Unit
) {
    val pagerState = rememberPagerState(pageCount = { students.size })
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    
    // Store grade state for all students at the pager level
    val ca1State = remember { mutableStateMapOf<String, String>() }
    val ca2State = remember { mutableStateMapOf<String, String>() }
    val examState = remember { mutableStateMapOf<String, String>() }

    // Pre-load existing pending grades from Room DB
    LaunchedEffect(Unit) {
        val db = SyncDatabase.getDatabase(context)
        val events = db.syncDao().getPendingEvents()
        events.forEach { event ->
            try {
                val obj = org.json.JSONObject(event.payload)
                if (obj.has("student_id") && obj.has("breakdown")) {
                    val studentId = obj.getString("student_id")
                    val breakdown = obj.getJSONObject("breakdown")
                    ca1State[studentId] = breakdown.getInt("CA1").toString()
                    ca2State[studentId] = breakdown.getInt("CA2").toString()
                    examState[studentId] = breakdown.getInt("Exam").toString()
                }
            } catch (e: Exception) {}
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(Color(0xFF0A0E2E))) {
        // Toolbar
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onClose) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Close", tint = Color.White)
            }
            Text(
                "Focus Mode",
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                "${pagerState.currentPage + 1}/${students.size}",
                color = Color.White.copy(alpha = 0.5f),
                fontSize = 14.sp
            )
        }

        HorizontalPager(
            state = pagerState,
            modifier = Modifier.weight(1f)
        ) { page ->
            val studentId = students[page].id
            StudentFocusCard(
                student = students[page],
                primaryColor = primaryColor,
                initialCa1 = ca1State[studentId] ?: "",
                initialCa2 = ca2State[studentId] ?: "",
                initialExam = examState[studentId] ?: "",
                onInputsChanged = { ca1, ca2, exam ->
                    ca1State[studentId] = ca1
                    ca2State[studentId] = ca2
                    examState[studentId] = exam
                },
                onSave = { ca1, ca2, exam ->
                    scope.launch(Dispatchers.IO) {
                        try {
                            val db = SyncDatabase.getDatabase(context)
                            val total = (ca1.toIntOrNull() ?: 0) + (ca2.toIntOrNull() ?: 0) + (exam.toIntOrNull() ?: 0)
                            val breakdown = """{"CA1": ${ca1.toIntOrNull() ?: 0}, "CA2": ${ca2.toIntOrNull() ?: 0}, "Exam": ${exam.toIntOrNull() ?: 0}}"""
                            val payload = """{"student_id": "$studentId", "score": $total, "breakdown": $breakdown}"""
                            
                            val event = com.nexus.school.data.SyncEvent(
                                event_type = "UPDATE_GRADE",
                                payload = payload,
                                is_synced = 0
                            )
                            db.syncDao().insertEvent(event)
                            
                            launch(Dispatchers.Main) {
                                onLogSave(studentId, true)
                                if (page < students.size - 1) {
                                    pagerState.animateScrollToPage(page + 1)
                                } else {
                                    onClose()
                                }
                            }
                        } catch(e: Exception) {}
                    }
                },
                onSkip = {
                    scope.launch {
                        if (page < students.size - 1) {
                            pagerState.animateScrollToPage(page + 1)
                        } else {
                            onClose()
                        }
                    }
                }
            )
        }
    }
}

@Composable
fun StudentFocusCard(
    student: Student,
    primaryColor: Color,
    initialCa1: String,
    initialCa2: String,
    initialExam: String,
    onInputsChanged: (String, String, String) -> Unit,
    onSave: (String, String, String) -> Unit,
    onSkip: () -> Unit
) {
    var ca1 by remember(initialCa1) { mutableStateOf(initialCa1) }
    var ca2 by remember(initialCa2) { mutableStateOf(initialCa2) }
    var exam by remember(initialExam) { mutableStateOf(initialExam) }
    
    val total = (ca1.toIntOrNull() ?: 0) + (ca2.toIntOrNull() ?: 0) + (exam.toIntOrNull() ?: 0)

    Box(modifier = Modifier.fillMaxSize().padding(24.dp)) {
        Card(
            modifier = Modifier.fillMaxWidth().align(Alignment.Center),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.05f))
        ) {
            Column(
                modifier = Modifier.padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Student Profile
                Box(
                    modifier = Modifier.size(80.dp).clip(CircleShape).background(primaryColor),
                    contentAlignment = Alignment.Center
                ) {
                    Text(student.name.take(1).uppercase(), color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.height(16.dp))
                Text(student.name, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text(student.id, color = Color.White.copy(alpha=0.5f), fontSize = 14.sp)
                
                Spacer(modifier = Modifier.height(32.dp))
                
                // Inputs
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("1st CA (10%)", color = Color.White.copy(alpha=0.7f), fontSize = 12.sp)
                        Spacer(modifier = Modifier.height(4.dp))
                        GradeInputBox(value = ca1, onValueChange = { 
                            if(it.isEmpty() || (it.toIntOrNull() != null && it.toInt() <= 10)) { ca1 = it; onInputsChanged(ca1, ca2, exam) } 
                        }, primaryColor = primaryColor)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("2nd CA (10%)", color = Color.White.copy(alpha=0.7f), fontSize = 12.sp)
                        Spacer(modifier = Modifier.height(4.dp))
                        GradeInputBox(value = ca2, onValueChange = { 
                            if(it.isEmpty() || (it.toIntOrNull() != null && it.toInt() <= 10)) { ca2 = it; onInputsChanged(ca1, ca2, exam) } 
                        }, primaryColor = primaryColor)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Exam (80%)", color = Color.White.copy(alpha=0.7f), fontSize = 12.sp)
                        Spacer(modifier = Modifier.height(4.dp))
                        GradeInputBox(value = exam, onValueChange = { 
                            if(it.isEmpty() || (it.toIntOrNull() != null && it.toInt() <= 80)) { exam = it; onInputsChanged(ca1, ca2, exam) } 
                        }, primaryColor = primaryColor)
                    }
                }
                
                Spacer(modifier = Modifier.height(32.dp))
                
                // Total
                Box(modifier = Modifier.fillMaxWidth().background(Color.Black.copy(alpha=0.2f), RoundedCornerShape(12.dp)).padding(16.dp), contentAlignment = Alignment.Center) {
                    Text("Total: $total / 100", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        
        // Actions
        Row(
            modifier = Modifier.fillMaxWidth().align(Alignment.BottomCenter).padding(bottom = 32.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            TextButton(onClick = onSkip) {
                Text("Skip", color = Color.White.copy(alpha=0.5f), fontSize = 16.sp)
            }
            Button(
                onClick = { onSave(ca1, ca2, exam) },
                colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                shape = RoundedCornerShape(20.dp),
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp)
            ) {
                Text("Save & Next", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(8.dp))
                Icon(Icons.Default.ArrowForward, contentDescription = null)
            }
        }
    }
}

@Composable
fun GradeInputBox(value: String, onValueChange: (String) -> Unit, primaryColor: Color) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.width(72.dp).height(64.dp),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        textStyle = TextStyle(color = Color.White, fontSize = 20.sp, textAlign = TextAlign.Center),
        singleLine = true,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = primaryColor,
            unfocusedBorderColor = Color.White.copy(alpha = 0.3f),
            focusedTextColor = Color.White,
            unfocusedTextColor = Color.White,
            cursorColor = primaryColor
        )
    )
}

@Composable
fun ClassGroupedList(
    groupedStudents: Map<String, List<Student>>,
    primaryColor: Color,
    statusMap: Map<String, Boolean>
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(vertical = 16.dp)
    ) {
        groupedStudents.forEach { (className, classStudents) ->
            item {
                ClassGroupHeader(
                    className = className,
                    studentCount = classStudents.size,
                    students = classStudents,
                    primaryColor = primaryColor,
                    statusMap = statusMap
                )
            }
        }
    }
}

@Composable
fun ClassGroupHeader(
    className: String,
    studentCount: Int,
    students: List<Student>,
    primaryColor: Color,
    statusMap: Map<String, Boolean>
) {
    var isExpanded by remember { mutableStateOf(true) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color.White.copy(alpha = 0.06f)
        )
    ) {
        Column {
            // Class header row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { isExpanded = !isExpanded }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Color dot
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(primaryColor)
                )
                Spacer(modifier = Modifier.width(12.dp))

                Text(
                    text = className,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 16.sp,
                    modifier = Modifier.weight(1f)
                )

                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = primaryColor.copy(alpha = 0.3f)
                ) {
                    Text(
                        text = "  $studentCount  ",
                        color = primaryColor,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(vertical = 4.dp)
                    )
                }

                Spacer(modifier = Modifier.width(8.dp))

                Icon(
                    imageVector = if (isExpanded) Icons.TwoTone.KeyboardArrowUp
                    else Icons.TwoTone.KeyboardArrowDown,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.5f)
                )
            }

            // Expandable student rows
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Column {
                    Divider(color = Color.White.copy(alpha = 0.08f))
                    students.forEachIndexed { index, student ->
                        StudentRow(
                            student = student,
                            index = index + 1,
                            primaryColor = primaryColor,
                            isSaved = statusMap[student.id] ?: false
                        )
                        if (index < students.lastIndex) {
                            Divider(
                                modifier = Modifier.padding(start = 56.dp),
                                color = Color.White.copy(alpha = 0.05f)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun StudentRow(student: Student, index: Int, primaryColor: Color, isSaved: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Index badge
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(primaryColor.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "$index",
                color = primaryColor,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = student.name,
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "ID: ${student.id}",
                color = Color.White.copy(alpha = 0.4f),
                fontSize = 11.sp
            )
        }
        
        // Final Status Text (No input here anymore)
        if (isSaved) {
            Text("Graded", color = Color(0xFF4CAF50), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        } else {
            Text("Pending", color = Color.White.copy(alpha = 0.3f), fontSize = 12.sp)
        }

        // Sync indicator
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(if (isSaved) Color(0xFF4CAF50) else Color.White.copy(alpha = 0.15f))
        )
    }
}
