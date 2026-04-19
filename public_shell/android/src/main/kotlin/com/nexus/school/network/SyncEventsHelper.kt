package com.nexus.school.network

import android.content.Context
import android.util.Log
import com.nexus.school.data.ScoreComponent
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
    }
}

suspend fun saveAddStudentEvent(
    context: Context,
    studentName: String,
    className: String,
    subject: String
) {
    val db = SyncDatabase.getDatabase(context)
    
    // Generate a temporary local ID. The Hub will either accept or reject.
    val localId = "TEMP_${UUID.randomUUID().toString().substring(0, 8).uppercase()}"
    
    val student = Student(
        id = localId,
        name = studentName,
        class_name = className,
        subject = subject
    )
    
    // Insert into local UI DB so the teacher sees them immediately
    db.studentDao().insertStudent(student)
    
    // Queue for sync
    val payload = """{"student_id": "$localId", "name": "$studentName", "class_name": "$className", "subject": "$subject"}"""
    val eventId = "ADD_STUDENT_$localId"
    
    db.syncDao().insertEvent(
        SyncEvent(event_id = eventId, event_type = "ADD_STUDENT", payload = payload, is_synced = 0)
    )
    
    // UDP Pulse
    withContext(Dispatchers.IO) {
        try {
            val serverInfo = IdentityManager(context).getServerInfo()
            if (serverInfo != null) {
                val ip = serverInfo.first
                val teacherName = IdentityManager(context).getTeacherName()
                val msg = """{"teacher": "$teacherName", "action": "Registered $studentName", "event": "ADD_STUDENT"}"""
                DatagramSocket().use { socket ->
                    val bytes = msg.toByteArray()
                    val packet = DatagramPacket(bytes, bytes.size, InetAddress.getByName(ip), 3001)
                    socket.send(packet)
                }
            }
        } catch (e: Exception) {
            Log.e("NexusPulse", "Failed to burst UDP heartbeat.", e)
        }
    }
}
