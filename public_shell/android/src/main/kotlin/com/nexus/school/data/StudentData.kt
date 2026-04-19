package com.nexus.school.data

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.serialization.Serializable

@Serializable
@Entity(tableName = "students", primaryKeys = ["id", "subject"])
data class Student(
    val id: String,
    val name: String,
    val class_name: String,
    val subject: String = "General"
)

@Serializable
@Entity(tableName = "local_scores", primaryKeys = ["student_id", "subject", "component_key"])
data class StudentScore(
    val student_id: String,
    val subject: String,
    val component_key: String, // e.g. "CA1", "CA2", "Exam"
    val score: Int
)

@Dao
interface StudentDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(students: List<Student>)

    @Query("SELECT * FROM students ORDER BY class_name ASC, subject ASC, name ASC")
    suspend fun getAllStudents(): List<Student>

    @Query("SELECT * FROM students WHERE class_name = :className ORDER BY subject ASC, name ASC")
    suspend fun getStudentsByClass(className: String): List<Student>

    @Query("SELECT COUNT(*) FROM students")
    suspend fun getStudentCount(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertScore(score: StudentScore)

    @Query("SELECT * FROM local_scores WHERE student_id = :studentId AND subject = :subject")
    suspend fun getScoresForStudent(studentId: String, subject: String): List<StudentScore>

    @Query("SELECT * FROM local_scores")
    suspend fun getAllScores(): List<StudentScore>

    @Query("DELETE FROM local_scores")
    suspend fun clearAllScores()
}

