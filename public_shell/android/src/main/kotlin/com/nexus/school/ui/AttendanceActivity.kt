package com.nexus.school.ui

import android.app.DatePickerDialog
import android.os.Bundle
import android.widget.Toast
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nexus.school.data.Student
import com.nexus.school.data.SyncDatabase
import com.nexus.school.network.saveAttendanceEvents
import com.nexus.school.security.IdentityManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.format.DateTimeFormatter

// ─── Attendance Status Enum ───────────────────────────────────────────────────
private enum class AttendanceStatus { PRESENT, ABSENT, LATE }

private val AttendanceStatus.label get() = when (this) {
    AttendanceStatus.PRESENT -> "Present"
    AttendanceStatus.ABSENT  -> "Absent"
    AttendanceStatus.LATE    -> "Late"
}

private val AttendanceStatus.color get() = when (this) {
    AttendanceStatus.PRESENT -> Color(0xFF4ADE80) // Green
    AttendanceStatus.ABSENT  -> Color(0xFFFF5252) // Red
    AttendanceStatus.LATE    -> Color(0xFFFFB300) // Amber
}

// Cycles Present → Absent → Late → Present
private fun AttendanceStatus.next() = when (this) {
    AttendanceStatus.PRESENT -> AttendanceStatus.ABSENT
    AttendanceStatus.ABSENT  -> AttendanceStatus.LATE
    AttendanceStatus.LATE    -> AttendanceStatus.PRESENT
}

// ─── Activity ─────────────────────────────────────────────────────────────────
class AttendanceActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val className       = intent.getStringExtra(EXTRA_CLASS_NAME) ?: ""
        val schoolName      = intent.getStringExtra(EXTRA_SCHOOL_NAME) ?: "Nexus School"
        val primaryColorHex = intent.getStringExtra(EXTRA_PRIMARY_COLOR) ?: "#1A237E"
        val primaryColor    = try {
            Color(android.graphics.Color.parseColor(primaryColorHex))
        } catch (e: Exception) { Color(0xFF1A237E) }

        setContent {
            MaterialTheme {
                AttendanceScreen(
                    className    = className,
                    schoolName   = schoolName,
                    primaryColor = primaryColor,
                    onClose      = { finish() }
                )
            }
        }
    }

    companion object {
        const val EXTRA_CLASS_NAME    = "class_name"
        const val EXTRA_SCHOOL_NAME   = "school_name"
        const val EXTRA_PRIMARY_COLOR = "primary_color"
    }
}

// ─── Root Screen ──────────────────────────────────────────────────────────────
@Composable
private fun AttendanceScreen(
    className: String,
    schoolName: String,
    primaryColor: Color,
    onClose: () -> Unit
) {
    val context   = LocalContext.current
    val scope     = rememberCoroutineScope()

    // ── State ────────────────────────────────────────────────────────────────
    var selectedDate  by remember { mutableStateOf(LocalDate.now()) }
    var students      by remember { mutableStateOf<List<Student>>(emptyList()) }
    var isLoading     by remember { mutableStateOf(true) }
    var isSaving      by remember { mutableStateOf(false) }

    // Unique student list for this class (de-duplicated by id since one student spans subjects)
    val uniqueStudents = remember(students) {
        students.distinctBy { it.id }.sortedBy { it.name }
    }

    // Attendance status per student_id — default all to PRESENT
    val statusMap = remember { mutableStateMapOf<String, AttendanceStatus>() }

    val dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")
    val displayFormatter = DateTimeFormatter.ofPattern("EEE, d MMM yyyy")

    // ── Load students & existing attendance for the selected date ─────────────
    LaunchedEffect(className, selectedDate) {
        isLoading = true
        withContext(Dispatchers.IO) {
            val db = SyncDatabase.getDatabase(context)

            // Load all students in this class (any subject row is fine — we dedupe later)
            val loaded = db.studentDao().getStudentsByClass(className)

            // Load any previously saved attendance for this date
            val existing = db.studentDao()
                .getAttendanceByClassAndDate(className, selectedDate.format(dateFormatter))
                .associate { it.student_id to it.status }

            withContext(Dispatchers.Main) {
                students = loaded
                // Seed status map: use persisted value or default PRESENT
                loaded.distinctBy { it.id }.forEach { student ->
                    val savedStatus = existing[student.id]
                    statusMap[student.id] = when (savedStatus) {
                        "Absent" -> AttendanceStatus.ABSENT
                        "Late"   -> AttendanceStatus.LATE
                        else     -> AttendanceStatus.PRESENT
                    }
                }
                isLoading = false
            }
        }
    }

    // ── Date picker launcher ──────────────────────────────────────────────────
    fun showDatePicker() {
        DatePickerDialog(
            context,
            { _, year, month, day ->
                selectedDate = LocalDate.of(year, month + 1, day)
            },
            selectedDate.year,
            selectedDate.monthValue - 1,
            selectedDate.dayOfMonth
        ).show()
    }

    // ── Save handler ──────────────────────────────────────────────────────────
    fun saveRegister() {
        scope.launch {
            isSaving = true
            val records = statusMap.mapValues { (_, status) -> status.label }
            saveAttendanceEvents(
                context   = context,
                className = className,
                date      = selectedDate.format(dateFormatter),
                records   = records
            )
            isSaving = false
            Toast.makeText(context, "✅ Register saved!", Toast.LENGTH_SHORT).show()
            onClose()
        }
    }

    // ── Summary counters ──────────────────────────────────────────────────────
    val presentCount = statusMap.values.count { it == AttendanceStatus.PRESENT }
    val absentCount  = statusMap.values.count { it == AttendanceStatus.ABSENT }
    val lateCount    = statusMap.values.count { it == AttendanceStatus.LATE }

    // ── UI ────────────────────────────────────────────────────────────────────
    Surface(modifier = Modifier.fillMaxSize(), color = Color(0xFF0A0E2E)) {
        Column(modifier = Modifier.fillMaxSize()) {

            // ── Header ────────────────────────────────────────────────────────
            AttendanceHeader(
                schoolName   = schoolName,
                className    = className,
                primaryColor = primaryColor,
                selectedDate = selectedDate.format(displayFormatter),
                onDateClick  = { showDatePicker() },
                onClose      = onClose
            )

            // ── Summary Chips ─────────────────────────────────────────────────
            SummaryRow(
                presentCount = presentCount,
                absentCount  = absentCount,
                lateCount    = lateCount
            )

            // ── Instruction Banner ────────────────────────────────────────────
            if (!isLoading && uniqueStudents.isNotEmpty()) {
                Text(
                    text = "Tap a student to cycle: Present → Absent → Late",
                    color = Color.White.copy(alpha = 0.35f),
                    fontSize = 11.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                )
            }

            // ── Student List ─────────────────────────────────────────────────
            Box(modifier = Modifier.weight(1f)) {
                when {
                    isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = primaryColor)
                    }
                    uniqueStudents.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No students found for $className.", color = Color.White.copy(alpha = 0.4f), textAlign = TextAlign.Center)
                    }
                    else -> LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        itemsIndexed(uniqueStudents, key = { _, s -> s.id }) { index, student ->
                            val currentStatus = statusMap[student.id] ?: AttendanceStatus.PRESENT
                            AttendanceStudentRow(
                                index    = index + 1,
                                student  = student,
                                status   = currentStatus,
                                onClick  = { statusMap[student.id] = currentStatus.next() }
                            )
                        }
                    }
                }
            }

            // ── Save Button ──────────────────────────────────────────────────
            Button(
                onClick  = { if (!isSaving) saveRegister() },
                enabled  = !isLoading && !isSaving && uniqueStudents.isNotEmpty(),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 16.dp)
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                shape  = RoundedCornerShape(16.dp)
            ) {
                if (isSaving) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Save Register", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

// ─── Header ───────────────────────────────────────────────────────────────────
@Composable
private fun AttendanceHeader(
    schoolName: String,
    className: String,
    primaryColor: Color,
    selectedDate: String,
    onDateClick: () -> Unit,
    onClose: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.horizontalGradient(listOf(primaryColor, primaryColor.copy(alpha = 0.7f)))
            )
            .padding(horizontal = 20.dp, vertical = 20.dp)
    ) {
        // Close button
        IconButton(
            onClick  = onClose,
            modifier = Modifier.align(Alignment.TopEnd)
        ) {
            Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White.copy(alpha = 0.8f))
        }

        Column {
            Text(
                text = schoolName.uppercase(),
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 2.sp
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = "Attendance — $className",
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.ExtraBold
            )
            Spacer(Modifier.height(12.dp))
            // Date picker chip
            Surface(
                modifier = Modifier.clickable { onDateClick() },
                shape    = RoundedCornerShape(50),
                color    = Color.White.copy(alpha = 0.18f)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.CalendarToday,
                        contentDescription = "Pick date",
                        tint = Color.White,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(selectedDate, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

// ─── Summary Row ──────────────────────────────────────────────────────────────
@Composable
private fun SummaryRow(presentCount: Int, absentCount: Int, lateCount: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF0D1138))
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        SummaryChip(label = "Present", count = presentCount, color = Color(0xFF4ADE80), modifier = Modifier.weight(1f))
        SummaryChip(label = "Absent",  count = absentCount,  color = Color(0xFFFF5252), modifier = Modifier.weight(1f))
        SummaryChip(label = "Late",    count = lateCount,    color = Color(0xFFFFB300), modifier = Modifier.weight(1f))
    }
}

@Composable
private fun SummaryChip(label: String, count: Int, color: Color, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape    = RoundedCornerShape(10.dp),
        color    = color.copy(alpha = 0.12f)
    ) {
        Column(
            modifier = Modifier.padding(vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(count.toString(), color = color, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            Text(label, color = color.copy(alpha = 0.8f), fontSize = 11.sp, fontWeight = FontWeight.Medium)
        }
    }
}

// ─── Student Row ──────────────────────────────────────────────────────────────
@Composable
private fun AttendanceStudentRow(
    index: Int,
    student: Student,
    status: AttendanceStatus,
    onClick: () -> Unit
) {
    val animatedColor by animateColorAsState(
        targetValue = status.color,
        animationSpec = tween(durationMillis = 200),
        label = "statusColor"
    )
    val animatedBg by animateColorAsState(
        targetValue = status.color.copy(alpha = 0.08f),
        animationSpec = tween(durationMillis = 200),
        label = "statusBg"
    )

    Surface(
        modifier  = Modifier.fillMaxWidth().clickable { onClick() },
        shape     = RoundedCornerShape(14.dp),
        color     = animatedBg,
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Index circle
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(animatedColor.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = index.toString(),
                    color = animatedColor,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(Modifier.width(14.dp))

            // Student name + ID
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text     = student.name,
                    color    = Color.White,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text  = student.id,
                    color = Color.White.copy(alpha = 0.4f),
                    fontSize = 11.sp
                )
            }

            // Status badge
            Surface(
                shape = RoundedCornerShape(50),
                color = animatedColor.copy(alpha = 0.18f)
            ) {
                Text(
                    text = status.label,
                    color = animatedColor,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
                )
            }
        }
    }
}
