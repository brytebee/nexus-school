package com.nexus.school.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.serialization.Serializable
import java.util.UUID

@Serializable
@Entity(tableName = "sync_queue")
data class SyncEvent(
    @PrimaryKey
    val event_id: String = UUID.randomUUID().toString(),
    val event_type: String, // e.g., "UPDATE_GRADE"
    val payload: String,    // JSON string: {"student_id": "123", "score": 85, "subject": "Math", "assessment": "CA1"}
    val is_synced: Int = 0,
    val created_at: Long = System.currentTimeMillis()
)

@Dao
interface SyncDao {
    @Insert(onConflict = androidx.room.OnConflictStrategy.REPLACE)
    suspend fun insertEvent(event: SyncEvent)

    @Query("SELECT * FROM sync_queue WHERE is_synced = 0 ORDER BY created_at ASC")
    suspend fun getPendingEvents(): List<SyncEvent>

    @Query("UPDATE sync_queue SET is_synced = 1 WHERE event_id IN (:eventIds)")
    suspend fun markEventsSynced(eventIds: List<String>)

    /** Hard-deletes events (used to cancel pending ADD_STUDENT events on local delete). */
    @Query("DELETE FROM sync_queue WHERE event_id IN (:eventIds)")
    suspend fun deleteEvents(eventIds: List<String>)
}

@Database(entities = [SyncEvent::class, Student::class, StudentScore::class, DailyAttendance::class], version = 10, exportSchema = false)
abstract class SyncDatabase : RoomDatabase() {
    abstract fun syncDao(): SyncDao
    abstract fun studentDao(): StudentDao

    companion object {
        @Volatile
        private var INSTANCE: SyncDatabase? = null

        private val MIGRATION_2_3 = object : androidx.room.migration.Migration(2, 3) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                // Change primary key to composite (id, subject)
                db.execSQL("CREATE TABLE students_new (id TEXT NOT NULL, name TEXT NOT NULL, class_name TEXT NOT NULL, subject TEXT NOT NULL DEFAULT 'General', PRIMARY KEY(id, subject))")
                db.execSQL("INSERT INTO students_new (id, name, class_name) SELECT id, name, class_name FROM students")
                db.execSQL("DROP TABLE students")
                db.execSQL("ALTER TABLE students_new RENAME TO students")
            }
        }

        private val MIGRATION_3_4 = object : androidx.room.migration.Migration(3, 4) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE local_scores (student_id TEXT NOT NULL, subject TEXT NOT NULL, component_key TEXT NOT NULL, score INTEGER NOT NULL, PRIMARY KEY(student_id, subject, component_key))")
            }
        }

        private val MIGRATION_4_5 = object : androidx.room.migration.Migration(4, 5) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                // Add optional plan-gated columns — nullable, no default required
                db.execSQL("ALTER TABLE students ADD COLUMN photo_base64 TEXT")
                db.execSQL("ALTER TABLE students ADD COLUMN parent_email TEXT")
                db.execSQL("ALTER TABLE students ADD COLUMN parent_phone TEXT")
            }
        }

        private val MIGRATION_5_6 = object : androidx.room.migration.Migration(5, 6) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE students ADD COLUMN reg_no TEXT")
                db.execSQL("ALTER TABLE students ADD COLUMN admission_no TEXT")
                db.execSQL("ALTER TABLE students ADD COLUMN gender TEXT")
                db.execSQL("ALTER TABLE students ADD COLUMN dob TEXT")
                db.execSQL("ALTER TABLE students ADD COLUMN fee_status TEXT NOT NULL DEFAULT 'cleared'")
            }
        }

        private val MIGRATION_6_7 = object : androidx.room.migration.Migration(6, 7) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS `daily_attendance` (`student_id` TEXT NOT NULL, `class_name` TEXT NOT NULL, `date` TEXT NOT NULL, `status` TEXT NOT NULL, `is_synced` INTEGER NOT NULL, PRIMARY KEY(`student_id`, `date`))")
            }
        }

        private val MIGRATION_7_8 = object : androidx.room.migration.Migration(7, 8) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                // Add parent_name column — nullable, no default required
                db.execSQL("ALTER TABLE students ADD COLUMN parent_name TEXT")
            }
        }

        private val MIGRATION_8_9 = object : androidx.room.migration.Migration(8, 9) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS local_scores_new (student_id TEXT NOT NULL, subject TEXT NOT NULL, component_key TEXT NOT NULL, score REAL NOT NULL, PRIMARY KEY(student_id, subject, component_key))")
                db.execSQL("INSERT INTO local_scores_new (student_id, subject, component_key, score) SELECT student_id, subject, component_key, CAST(score AS REAL) FROM local_scores")
                db.execSQL("DROP TABLE local_scores")
                db.execSQL("ALTER TABLE local_scores_new RENAME TO local_scores")
            }
        }

        private val MIGRATION_9_10 = object : androidx.room.migration.Migration(9, 10) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE students ADD COLUMN class_arm TEXT")
            }
        }

        fun getDatabase(context: Context): SyncDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    SyncDatabase::class.java,
                    "nexus_sync_database"
                )
                .addMigrations(MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10)
                .fallbackToDestructiveMigration()
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
