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
    val payload: String,    // JSON string: {"student_id": "123", "score": 85}
    val is_synced: Int = 0,
    val created_at: Long = System.currentTimeMillis()
)

@Dao
interface SyncDao {
    @Insert
    suspend fun insertEvent(event: SyncEvent)

    @Query("SELECT * FROM sync_queue WHERE is_synced = 0 ORDER BY created_at ASC")
    suspend fun getPendingEvents(): List<SyncEvent>

    @Query("UPDATE sync_queue SET is_synced = 1 WHERE event_id IN (:eventIds)")
    suspend fun markEventsSynced(eventIds: List<String>)
}

@Database(entities = [SyncEvent::class, Student::class], version = 2, exportSchema = false)
abstract class SyncDatabase : RoomDatabase() {
    abstract fun syncDao(): SyncDao
    abstract fun studentDao(): StudentDao

    companion object {
        @Volatile
        private var INSTANCE: SyncDatabase? = null

        fun getDatabase(context: Context): SyncDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    SyncDatabase::class.java,
                    "nexus_sync_database"
                )
                .fallbackToDestructiveMigration()
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
