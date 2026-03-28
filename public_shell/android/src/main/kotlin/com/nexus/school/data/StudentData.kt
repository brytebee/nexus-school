package com.nexus.school.data

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.serialization.Serializable

@Serializable
@Entity(tableName = "students")
data class Student(
    @PrimaryKey
    val id: String,
    val name: String,
    val class_name: String
)

@Dao
interface StudentDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(students: List<Student>)

    @Query("SELECT * FROM students ORDER BY class_name ASC, name ASC")
    suspend fun getAllStudents(): List<Student>

    @Query("SELECT * FROM students WHERE class_name = :className ORDER BY name ASC")
    suspend fun getStudentsByClass(className: String): List<Student>

    @Query("SELECT COUNT(*) FROM students")
    suspend fun getStudentCount(): Int
}

