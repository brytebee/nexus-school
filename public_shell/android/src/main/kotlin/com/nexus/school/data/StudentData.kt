package com.nexus.school.data

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.serialization.Serializable

@Serializable
data class HonorRollItem(
    val name: String,
    val subject: String,
    val score: Int
)

@Serializable
@Entity(tableName = "students", primaryKeys = ["id", "subject"])
data class Student(
    val id: String,
    val name: String,
    val class_name: String,
    val subject: String = "General",
    // ── Optional fields — plan-gated on Android, persisted locally ────────────
    val photo_base64: String? = null,
    val parent_name: String? = null,
    val parent_email: String? = null,
    val parent_phone: String? = null,
    
    // ── V2 Schema core fields ────────────
    val reg_no: String? = null,
    val admission_no: String? = null,
    val gender: String? = null,
    val dob: String? = null,
    val fee_status: String = "cleared"
)

@Serializable
@Entity(tableName = "local_scores", primaryKeys = ["student_id", "subject", "component_key"])
data class StudentScore(
    val student_id: String,
    val subject: String,
    val component_key: String, // e.g. "CA1", "CA2", "Exam"
    val score: Int
)

@Serializable
@Entity(tableName = "daily_attendance", primaryKeys = ["student_id", "date"])
data class DailyAttendance(
    val student_id: String,
    val class_name: String,
    val date: String, // format YYYY-MM-DD
    val status: String, // "Present", "Absent", "Late"
    val is_synced: Boolean = false
)

@Dao
interface StudentDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(students: List<Student>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertStudent(student: Student)

    @Query("SELECT * FROM students ORDER BY class_name ASC, subject ASC, name ASC")
    suspend fun getAllStudents(): List<Student>

    @Query("SELECT * FROM students WHERE class_name = :className ORDER BY subject ASC, name ASC")
    suspend fun getStudentsByClass(className: String): List<Student>

    @Query("SELECT COUNT(*) FROM students")
    suspend fun getStudentCount(): Int

    /** Removes all subject-rows for a given student ID (used only for TEMP_ local students). */
    @Query("DELETE FROM students WHERE id = :studentId")
    suspend fun deleteStudentById(studentId: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertScore(score: StudentScore)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertScores(scores: List<StudentScore>)

    @Query("SELECT * FROM local_scores WHERE student_id = :studentId AND subject = :subject")
    suspend fun getScoresForStudent(studentId: String, subject: String): List<StudentScore>

    @Query("SELECT * FROM local_scores")
    suspend fun getAllScores(): List<StudentScore>

    @Query("DELETE FROM local_scores")
    suspend fun clearAllScores()

    @Query("SELECT students.name, local_scores.subject, local_scores.score FROM local_scores INNER JOIN students ON local_scores.student_id = students.id ORDER BY local_scores.score DESC LIMIT 3")
    suspend fun getHonorRoll(): List<HonorRollItem>

    // ── Gold Phase B: Attendance Methods ────────────
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAttendanceRecords(records: List<DailyAttendance>)

    @Query("SELECT * FROM daily_attendance WHERE class_name = :className AND date = :date")
    suspend fun getAttendanceByClassAndDate(className: String, date: String): List<DailyAttendance>

    @Query("SELECT * FROM daily_attendance WHERE is_synced = 0")
    suspend fun getUnsyncedAttendance(): List<DailyAttendance>

    @Query("UPDATE daily_attendance SET is_synced = 1 WHERE student_id IN (:studentIds) AND date IN (:dates)")
    suspend fun markAttendanceAsSynced(studentIds: List<String>, dates: List<String>)
}

