package com.nexus.school.network

import android.content.Context
import android.util.Log
import com.nexus.school.network.ScoreComponent
import com.nexus.school.data.Student
import com.nexus.school.data.SyncDatabase
import com.nexus.school.data.SyncEvent
import com.nexus.school.security.IdentityManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.UUID

suspend fun saveGradeEvent(
    context: Context,
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

    // The Pulse: Fire a silent UDP heartbeat to The Hub for the Real-Time Activity Log
    withContext(Dispatchers.IO) {
        try {
            val serverInfo = IdentityManager(context).getServerInfo()
            if (serverInfo != null) {
                val ip = serverInfo.first
                val teacherName = IdentityManager(context).getTeacherName()
                val msg = """{"teacher": "$teacherName", "action": "Graded $subject", "event": "UPDATE_GRADE"}"""
                DatagramSocket().use { socket ->
                    val bytes = msg.toByteArray()
                    val packet = DatagramPacket(bytes, bytes.size, InetAddress.getByName(ip), 3001)
                    socket.send(packet)
                }
            }
        } catch (e: Exception) {
            Log.e("NexusPulse", "Failed to burst UDP heartbeat.", e)
        }
        Unit
    }
}

/**
 * Enqueues an ADD_STUDENT sync event for each enrolled [subjects] entry.
 * A single [localId] is shared across all subject rows so the Hub can
 * associate them as one logical student record.
 *
 * [photoBase64] is stored locally in Room only — not included in the sync
 * payload to avoid large blobs in the queue. Hub photo sync is a Phase 5 concern.
 */
suspend fun saveAddStudentEvent(
    context: Context,
    studentName: String,
    className: String,
    subjects: List<String>,
    photoBase64: String? = null,
    parentEmail: String? = null,
    parentPhone: String? = null,
    regNo: String? = null,
    admissionNo: String? = null,
    gender: String? = null,
    dob: String? = null
) {
    val db       = SyncDatabase.getDatabase(context)
    val localId  = "TEMP_${UUID.randomUUID().toString().substring(0, 8).uppercase()}"

    subjects.forEach { subject ->
        // Persist full record locally (photo + contact stored offline)
        db.studentDao().insertStudent(
            Student(
                id           = localId,
                name         = studentName,
                class_name   = className,
                subject      = subject,
                photo_base64 = photoBase64,
                parent_email = parentEmail,
                parent_phone = parentPhone,
                reg_no       = regNo,
                admission_no = admissionNo,
                gender       = gender,
                dob          = dob
            )
        )

        // Sync payload — photo omitted intentionally (see kdoc above)
        val emailField = if (parentEmail != null) """, "parent_email": "$parentEmail"""" else ""
        val phoneField = if (parentPhone != null) """, "parent_phone": "$parentPhone"""" else ""
        val regNoField = if (regNo != null) """, "reg_no": "$regNo"""" else ""
        val adminNoField = if (admissionNo != null) """, "admission_no": "$admissionNo"""" else ""
        val genderField = if (gender != null) """, "gender": "$gender"""" else ""
        val dobField    = if (dob != null) """, "dob": "$dob"""" else ""
        
        val payload    = """{"student_id": "$localId", "name": "$studentName", "class_name": "$className", "subject": "$subject"$emailField$phoneField$regNoField$adminNoField$genderField$dobField}"""

        db.syncDao().insertEvent(
            SyncEvent(
                event_id   = "ADD_STUDENT_${localId}_${subject.replace(" ", "_")}",
                event_type = "ADD_STUDENT",
                payload    = payload,
                is_synced  = 0
            )
        )
    }

    // UDP Pulse — single burst for the whole registration
    withContext(Dispatchers.IO) {
        try {
            val serverInfo = IdentityManager(context).getServerInfo() ?: return@withContext
            val teacherName = IdentityManager(context).getTeacherName()
            val msg = """{"teacher": "$teacherName", "action": "Registered $studentName (${subjects.size} subjects)", "event": "ADD_STUDENT"}"""
            DatagramSocket().use { socket ->
                val bytes = msg.toByteArray()
                socket.send(DatagramPacket(bytes, bytes.size, InetAddress.getByName(serverInfo.first), 3001))
            }
        } catch (e: Exception) {
            Log.e("NexusPulse", "UDP heartbeat failed.", e)
        }
    }
}

/**
 * Cancels all pending ADD_STUDENT events for a locally-created (TEMP_) student
 * and removes them from the local Room DB.
 * Must only be called for students whose ID starts with "TEMP_".
 */
suspend fun saveDeleteStudentEvent(context: Context, studentId: String) {
    require(studentId.startsWith("TEMP_")) { "Only TEMP_ students can be deleted from the device." }
    val db = SyncDatabase.getDatabase(context)
    db.studentDao().deleteStudentById(studentId)
    // Cancel any queued ADD events so they are never pushed to the Hub
    val toCancel = db.syncDao().getPendingEvents()
        .filter { it.event_id.startsWith("ADD_STUDENT_$studentId") }
        .map { it.event_id }
    if (toCancel.isNotEmpty()) db.syncDao().deleteEvents(toCancel)
}

/**
 * Persists a full class attendance register for a given [date] to Room and
 * enqueues one [SyncEvent] per student so the Desktop Hub receives them on
 * the next push cycle.
 *
 * Each event uses a deterministic [event_id] so re-saving the same date/student
 * is idempotent — it simply replaces the earlier queued entry.
 *
 * @param records  A map of student_id → "Present" | "Absent" | "Late"
 */
suspend fun saveAttendanceEvents(
    context: Context,
    className: String,
    date: String,
    records: Map<String, String>   // student_id → status
) {
    val db = SyncDatabase.getDatabase(context)

    val attendanceEntities = records.map { (studentId, status) ->
        com.nexus.school.data.DailyAttendance(
            student_id = studentId,
            class_name = className,
            date       = date,
            status     = status,
            is_synced  = false
        )
    }

    // Batch-upsert the local attendance records (Room REPLACE handles conflicts)
    db.studentDao().insertAttendanceRecords(attendanceEntities)

    // Enqueue one ATTENDANCE_UPDATE sync event per student
    records.forEach { (studentId, status) ->
        val payload = """{"student_id": "$studentId", "class_name": "$className", "date": "$date", "status": "$status", "source": "teacher"}"""
        db.syncDao().insertEvent(
            SyncEvent(
                event_id   = "ATTENDANCE_${studentId}_$date",   // deterministic — safe to re-save
                event_type = "ATTENDANCE_UPDATE",
                payload    = payload,
                is_synced  = 0
            )
        )
    }

    // UDP Pulse — fire a single heartbeat so the Desktop Activity Log reflects the action
    withContext(Dispatchers.IO) {
        try {
            val serverInfo  = IdentityManager(context).getServerInfo() ?: return@withContext
            val teacherName = IdentityManager(context).getTeacherName()
            val msg = """{"teacher": "$teacherName", "action": "Took Attendance for $className ($date)", "event": "ATTENDANCE_UPDATE"}"""
            DatagramSocket().use { socket ->
                val bytes = msg.toByteArray()
                socket.send(DatagramPacket(bytes, bytes.size, InetAddress.getByName(serverInfo.first), 3001))
            }
        } catch (e: Exception) {
            Log.e("NexusPulse", "Attendance UDP heartbeat failed.", e)
        }
    }
}
