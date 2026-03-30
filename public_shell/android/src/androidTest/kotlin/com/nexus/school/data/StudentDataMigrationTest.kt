package com.nexus.school.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StudentDataMigrationTest {

    private lateinit var db: SyncDatabase
    private lateinit var studentDao: StudentDao

    @Before
    fun createDb() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, SyncDatabase::class.java).build()
        studentDao = db.studentDao()
    }

    @After
    fun closeDb() {
        db.close()
    }

    @Test
    fun testCompositePrimaryKeyAllowsMultipleSubjectsForSameStudent() = runBlocking {
        // Arrange
        val studentMath = Student(id = "A-001", name = "Obi Ndidi", class_name = "JSS1", subject = "Mathematics")
        val studentEnglish = Student(id = "A-001", name = "Obi Ndidi", class_name = "JSS1", subject = "English")
        
        // Act
        studentDao.insertAll(listOf(studentMath, studentEnglish))
        
        // Assert
        val allStudents = studentDao.getAllStudents()
        assertEquals("Both records should coexist without REPLACE dropping one due to identical IDs", 2, allStudents.size)
        
        val retrievedMath = allStudents.find { it.subject == "Mathematics" }
        val retrievedEnglish = allStudents.find { it.subject == "English" }
        
        assertEquals("Obi Ndidi", retrievedMath?.name)
        assertEquals("Obi Ndidi", retrievedEnglish?.name)
        assertEquals("A-001", retrievedMath?.id)
        assertEquals("A-001", retrievedEnglish?.id)
    }
}
