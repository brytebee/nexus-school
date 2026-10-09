package com.nexus.school.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nexus.school.security.IdentityManager
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

private val DarkBg     = Color(0xFF060E1A)
private val CardBg     = Color(0xFF0C192E)
private val GlassBorder2 = Color(0xFF1E3A5F)
private val PurpleAccent = Color(0xFF7C3AED)
private val TextMuted2 = Color(0xFF6B7F9E)

// ─── Data classes ────────────────────────────────────────────────────────────

data class ParentResult(
    val parentName: String,
    val parentPhone: String,
    val parentPhone2: String,
    val parentEmail: String,
    val children: List<ChildInfo>
)

data class ChildInfo(
    val id: String,
    val name: String,
    val className: String,
    val classArm: String,
    val photo: String,
    val admissionNo: String
)

data class StaffResult(
    val id: String,
    val name: String,
    val phone: String,
    val email: String,
    val role: String,
    val allocations: List<AllocationInfo>
)

data class AllocationInfo(val className: String, val subject: String)

data class StudentResult(
    val id: String,
    val name: String,
    val className: String,
    val classArm: String,
    val admissionNo: String,
    val regNo: String,
    val gender: String,
    val dob: String,
    val photo: String,
    val parentName: String,
    val parentPhone: String,
    val parentEmail: String,
    val feeStatus: String,
    val totalBilled: Double,
    val totalPaid: Double,
    val balance: Double,
    val subjects: List<String>
)

// ─── Activity ────────────────────────────────────────────────────────────────

class DirectoryActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val startTab = intent.getStringExtra("tab") ?: "parents"
        val identity = IdentityManager(this)

        setContent {
            var selectedTab by remember { mutableStateOf(startTab) }
            val tabs = listOf("parents" to "👨‍👩‍👧 Parents", "staff" to "👩‍🏫 Staff", "students" to "🎓 Students")

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Brush.verticalGradient(listOf(Color(0xFF060E1A), Color(0xFF0A1628))))
            ) {
                Column(Modifier.fillMaxSize()) {
                    // Top bar
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = { finish() }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                        }
                        Text(
                            "Directory Hub", color = Color.White,
                            fontSize = 20.sp, fontWeight = FontWeight.ExtraBold,
                            modifier = Modifier.weight(1f).padding(start = 8.dp)
                        )
                    }

                    // Tab bar
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        tabs.forEach { (key, label) ->
                            val active = selectedTab == key
                            Surface(
                                modifier = Modifier.weight(1f).clickable { selectedTab = key },
                                shape = RoundedCornerShape(10.dp),
                                color = if (active) PurpleAccent else CardBg,
                                border = BorderStroke(1.dp, if (active) PurpleAccent else GlassBorder2)
                            ) {
                                Text(
                                    label, color = Color.White,
                                    fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(8.dp),
                                    maxLines = 1, overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    // Content
                    when (selectedTab) {
                        "parents"  -> ParentSearchTab(identity)
                        "staff"    -> StaffSearchTab(identity)
                        "students" -> StudentSearchTab(identity)
                    }
                }
            }
        }
    }
}

// ─── Parent Search Tab ───────────────────────────────────────────────────────

@Composable
private fun ParentSearchTab(identity: IdentityManager) {
    val scope = rememberCoroutineScope()
    var query   by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<ParentResult>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error   by remember { mutableStateOf("") }

    fun search() {
        if (query.isBlank()) return
        scope.launch {
            loading = true; error = ""
            try {
                val info = identity.getServerInfo() ?: run { error = "Not connected"; return@launch }
                val q = URLEncoder.encode(query.trim(), "UTF-8")
                val raw = withContext(Dispatchers.IO) {
                    val url = URL("http://${info.first}:${info.second}/api/search/parents?q=$q")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.setRequestProperty("X-Device-ID", identity.getDeviceId())
                    if (conn.responseCode == 200) conn.inputStream.bufferedReader().readText() else null
                }
                if (raw != null) {
                    val arr = JSONArray(raw)
                    results = (0 until arr.length()).map { i ->
                        val o = arr.getJSONObject(i)
                        val childArr = o.optJSONArray("children") ?: JSONArray()
                        ParentResult(
                            parentName  = o.optString("parentName").takeIf { it != "null" } ?: "",
                            parentPhone = o.optString("parentPhone").takeIf { it != "null" } ?: "",
                            parentPhone2= o.optString("parentPhone2").takeIf { it != "null" } ?: "",
                            parentEmail = o.optString("parentEmail").takeIf { it != "null" } ?: "",
                            children    = (0 until childArr.length()).map { j ->
                                val c = childArr.getJSONObject(j)
                                ChildInfo(
                                    c.optString("id").takeIf { it != "null" } ?: "",
                                    c.optString("name").takeIf { it != "null" } ?: "",
                                    c.optString("class_name").takeIf { it != "null" } ?: "",
                                    c.optString("class_arm").takeIf { it != "null" } ?: "",
                                    c.optString("photo").takeIf { it != "null" } ?: "",
                                    c.optString("admission_no").takeIf { it != "null" } ?: ""
                                )
                            }
                        )
                    }
                } else { error = "Search failed" }
            } catch (e: Exception) { error = e.message ?: "Error" }
            finally { loading = false }
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        SearchBar(query, onQueryChange = { query = it }, onSearch = { search() }, loading = loading)
        if (error.isNotEmpty()) Text(error, color = Color(0xFFFF5252), fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(vertical = 12.dp)) {
            items(results) { parent ->
                ParentCard(parent)
            }
        }
    }
}

@Composable
private fun ParentCard(parent: ParentResult) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = CardBg,
        border = BorderStroke(1.dp, GlassBorder2)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(44.dp).background(PurpleAccent.copy(alpha = 0.15f), CircleShape),
                    contentAlignment = Alignment.Center
                ) { Text("👤", fontSize = 20.sp) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(parent.parentName.ifEmpty { "Unknown Parent" },
                        color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    if (parent.parentPhone.isNotEmpty())
                        Text(parent.parentPhone, color = TextMuted2, fontSize = 12.sp)
                    if (parent.parentEmail.isNotEmpty())
                        Text(parent.parentEmail, color = TextMuted2, fontSize = 12.sp)
                }
            }
            if (parent.children.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Divider(color = GlassBorder2)
                Spacer(Modifier.height(8.dp))
                Text("Children", color = TextMuted2, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                parent.children.forEach { child ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("🎓", fontSize = 14.sp)
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text(child.name, color = Color.White, fontSize = 13.sp)
                            Text("${child.className} ${child.classArm}".trim(), color = TextMuted2, fontSize = 11.sp)
                        }
                        if (child.admissionNo.isNotEmpty())
                            Text(child.admissionNo, color = TextMuted2, fontSize = 10.sp)
                    }
                }
            }
        }
    }
}

// ─── Staff Search Tab ────────────────────────────────────────────────────────

@Composable
private fun StaffSearchTab(identity: IdentityManager) {
    val scope = rememberCoroutineScope()
    var query   by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<StaffResult>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error   by remember { mutableStateOf("") }

    fun search() {
        if (query.isBlank()) return
        scope.launch {
            loading = true; error = ""
            try {
                val info = identity.getServerInfo() ?: run { error = "Not connected"; return@launch }
                val q = URLEncoder.encode(query.trim(), "UTF-8")
                val raw = withContext(Dispatchers.IO) {
                    val url = URL("http://${info.first}:${info.second}/api/search/staff?q=$q")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.setRequestProperty("X-Device-ID", identity.getDeviceId())
                    if (conn.responseCode == 200) conn.inputStream.bufferedReader().readText() else null
                }
                if (raw != null) {
                    val arr = JSONArray(raw)
                    results = (0 until arr.length()).map { i ->
                        val o = arr.getJSONObject(i)
                        val allArr = o.optJSONArray("allocations") ?: JSONArray()
                        val rawRole = o.optString("role")
                        val cleanRole = if (rawRole == "null" || rawRole.isBlank()) "Teacher" else rawRole
                        val cleanPhone = o.optString("phone").takeIf { it != "null" } ?: ""
                        val cleanEmail = o.optString("email").takeIf { it != "null" } ?: ""
                        StaffResult(
                            id    = o.optString("id").takeIf { it != "null" } ?: "",
                            name  = o.optString("name").takeIf { it != "null" } ?: "",
                            phone = cleanPhone,
                            email = cleanEmail,
                            role  = cleanRole,
                            allocations = (0 until allArr.length()).map { j ->
                                val a = allArr.getJSONObject(j)
                                AllocationInfo(a.optString("class_name"), a.optString("subject"))
                            }
                        )
                    }
                } else { error = "Search failed" }
            } catch (e: Exception) { error = e.message ?: "Error" }
            finally { loading = false }
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        SearchBar(query, onQueryChange = { query = it }, onSearch = { search() }, loading = loading)
        if (error.isNotEmpty()) Text(error, color = Color(0xFFFF5252), fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(vertical = 12.dp)) {
            items(results) { staff ->
                StaffCard(staff)
            }
        }
    }
}

@Composable
private fun StaffCard(staff: StaffResult) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = CardBg,
        border = BorderStroke(1.dp, GlassBorder2)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(44.dp).background(Color(0xFF0E7C1A).copy(alpha = 0.15f), CircleShape),
                    contentAlignment = Alignment.Center
                ) { Text("👩‍🏫", fontSize = 20.sp) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(staff.name, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    if (staff.role.isNotEmpty() && staff.role != "null") Text(staff.role, color = Color(0xFF4CAF50), fontSize = 11.sp)
                    if (staff.phone.isNotEmpty() && staff.phone != "null") Text(staff.phone, color = TextMuted2, fontSize = 12.sp)
                    if (staff.email.isNotEmpty() && staff.email != "null") Text(staff.email, color = TextMuted2, fontSize = 12.sp)
                }
                Text("ID: ${staff.id}", color = TextMuted2, fontSize = 10.sp)
            }
            if (staff.allocations.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Divider(color = GlassBorder2)
                Spacer(Modifier.height(6.dp))
                Text("Teaching", color = TextMuted2, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                staff.allocations.take(5).forEach { alloc ->
                    Text("• ${alloc.className}: ${alloc.subject}", color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp)
                }
                if (staff.allocations.size > 5)
                    Text("+${staff.allocations.size - 5} more", color = TextMuted2, fontSize = 11.sp)
            }
        }
    }
}

// ─── Student Search Tab ──────────────────────────────────────────────────────

@Composable
private fun StudentSearchTab(identity: IdentityManager) {
    val scope = rememberCoroutineScope()
    var query   by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<StudentResult>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error   by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<StudentResult?>(null) }

    fun search() {
        if (query.isBlank()) return
        scope.launch {
            loading = true; error = ""; selected = null
            try {
                val info = identity.getServerInfo() ?: run { error = "Not connected"; return@launch }
                val q = URLEncoder.encode(query.trim(), "UTF-8")
                val raw = withContext(Dispatchers.IO) {
                    val url = URL("http://${info.first}:${info.second}/api/search/students?q=$q")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.setRequestProperty("X-Device-ID", identity.getDeviceId())
                    if (conn.responseCode == 200) conn.inputStream.bufferedReader().readText() else null
                }
                if (raw != null) {
                    val arr = JSONArray(raw)
                    results = (0 until arr.length()).map { i ->
                        val o = arr.getJSONObject(i)
                        val subjArr = o.optJSONArray("subjects") ?: JSONArray()
                        StudentResult(
                            id           = o.optString("id").takeIf { it != "null" } ?: "",
                            name         = o.optString("name").takeIf { it != "null" } ?: "",
                            className    = o.optString("class_name").takeIf { it != "null" } ?: "",
                            classArm     = o.optString("class_arm").takeIf { it != "null" } ?: "",
                            admissionNo  = o.optString("admission_no").takeIf { it != "null" } ?: "",
                            regNo        = o.optString("reg_no").takeIf { it != "null" } ?: "",
                            gender       = o.optString("gender").takeIf { it != "null" } ?: "",
                            dob          = o.optString("dob").takeIf { it != "null" } ?: "",
                            photo        = o.optString("photo").takeIf { it != "null" } ?: "",
                            parentName   = o.optString("parent_name").takeIf { it != "null" } ?: "",
                            parentPhone  = o.optString("parent_phone").takeIf { it != "null" } ?: "",
                            parentEmail  = o.optString("parent_email").takeIf { it != "null" } ?: "",
                            feeStatus    = o.optString("fee_status").takeIf { it != "null" } ?: "unpaid",
                            totalBilled  = o.optDouble("total_billed", 0.0),
                            totalPaid    = o.optDouble("total_paid", 0.0),
                            balance      = o.optDouble("balance", 0.0),
                            subjects     = (0 until subjArr.length()).map { j -> subjArr.optString(j) }
                        )
                    }
                } else { error = "Search failed" }
            } catch (e: Exception) { error = e.message ?: "Error" }
            finally { loading = false }
        }
    }

    if (selected != null) {
        StudentEditPane(
            student  = selected!!,
            identity = identity,
            onBack   = { selected = null }
        )
        return
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        SearchBar(query, onQueryChange = { query = it }, onSearch = { search() }, loading = loading)
        if (error.isNotEmpty()) Text(error, color = Color(0xFFFF5252), fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 12.dp)) {
            items(results) { stu ->
                StudentResultCard(stu) { selected = stu }
            }
        }
    }
}

@Composable
private fun StudentResultCard(stu: StudentResult, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        shape = RoundedCornerShape(14.dp),
        color = CardBg,
        border = BorderStroke(1.dp, GlassBorder2)
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).background(Color(0xFF1565C0).copy(alpha = 0.15f), CircleShape),
                contentAlignment = Alignment.Center
            ) { Text("🎓", fontSize = 18.sp) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(stu.name, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text("${stu.className} ${stu.classArm}".trim(), color = TextMuted2, fontSize = 12.sp)
                if (stu.admissionNo.isNotEmpty()) Text("Adm: ${stu.admissionNo}", color = TextMuted2, fontSize = 11.sp)
            }
            Column(horizontalAlignment = Alignment.End) {
                val statusColor = when (stu.feeStatus) {
                    "cleared" -> Color(0xFF4CAF50)
                    "partial" -> Color(0xFFFF9800)
                    else -> Color(0xFFFF5252)
                }
                Text(stu.feeStatus.replaceFirstChar { it.uppercase() }, color = statusColor, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                Text("→", color = PurpleAccent, fontSize = 18.sp)
            }
        }
    }
}

@Composable
private fun StudentEditPane(student: StudentResult, identity: IdentityManager, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()

    var editName   by remember { mutableStateOf(student.name) }
    var editGender by remember { mutableStateOf(student.gender) }
    var editDob    by remember { mutableStateOf(student.dob) }
    var editParentName  by remember { mutableStateOf(student.parentName) }
    var editParentPhone by remember { mutableStateOf(student.parentPhone) }
    var editParentEmail by remember { mutableStateOf(student.parentEmail) }
    var editTotalBilled by remember { mutableStateOf(student.totalBilled.toString()) }
    var editTotalPaid   by remember { mutableStateOf(student.totalPaid.toString()) }

    var saving by remember { mutableStateOf(false) }
    var syncing by remember { mutableStateOf(false) }
    var msg    by remember { mutableStateOf("") }

    fun save() {
        scope.launch {
            saving = true; msg = ""
            try {
                val info = identity.getServerInfo() ?: run { msg = "Not connected"; return@launch }
                val (ip, port) = info
                val deviceId = identity.getDeviceId()

                // Update bio
                val bioBody = JSONObject().apply {
                    put("student_id",    student.id)
                    put("name",          editName)
                    put("gender",        editGender)
                    put("dob",           editDob)
                    put("parent_name",   editParentName)
                    put("parent_phone",  editParentPhone)
                    put("parent_email",  editParentEmail)
                }
                withContext(Dispatchers.IO) {
                    val url = URL("http://$ip:$port/api/update/student-bio")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "PATCH"; conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.setRequestProperty("X-Device-ID", deviceId)
                    conn.outputStream.write(bioBody.toString().toByteArray())
                    conn.responseCode
                }

                // Update fees
                val feesBody = JSONObject().apply {
                    put("student_id",   student.id)
                    put("total_billed", editTotalBilled.toDoubleOrNull() ?: student.totalBilled)
                    put("total_paid",   editTotalPaid.toDoubleOrNull()   ?: student.totalPaid)
                }
                withContext(Dispatchers.IO) {
                    val url = URL("http://$ip:$port/api/update/student-fees")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "PATCH"; conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.setRequestProperty("X-Device-ID", deviceId)
                    conn.outputStream.write(feesBody.toString().toByteArray())
                    conn.responseCode
                }

                msg = "✅ Saved successfully"
            } catch (e: Exception) { msg = "❌ ${e.message}" }
            finally { saving = false }
        }
    }

    fun sync() {
        scope.launch {
            syncing = true; msg = ""
            try {
                val info = identity.getServerInfo() ?: run { msg = "Not connected"; return@launch }
                val (ip, port) = info
                val raw = withContext(Dispatchers.IO) {
                    val url = URL("http://$ip:$port/api/sync")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"; conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.setRequestProperty("X-Device-ID", identity.getDeviceId())
                    conn.outputStream.write("{}".toByteArray())
                    conn.responseCode
                }
                msg = if (raw == 200) "☁️ Synced to cloud" else "⚠️ Sync returned $raw"
            } catch (e: Exception) { msg = "❌ Sync: ${e.message}" }
            finally { syncing = false }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 12.dp)) {
            IconButton(onClick = onBack) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
            }
            Text("Edit Student", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }

        // Bio section
        SectionLabel("Bio Data")
        EditField("Full Name", editName)    { editName = it }
        EditField("Gender", editGender)     { editGender = it }
        EditField("Date of Birth", editDob) { editDob = it }

        Spacer(Modifier.height(12.dp))
        SectionLabel("Parent / Guardian")
        EditField("Parent Name",  editParentName)  { editParentName = it }
        EditField("Parent Phone", editParentPhone, KeyboardType.Phone) { editParentPhone = it }
        EditField("Parent Email", editParentEmail, KeyboardType.Email) { editParentEmail = it }

        Spacer(Modifier.height(12.dp))
        SectionLabel("Fees")
        EditField("Total Billed (₦)", editTotalBilled, KeyboardType.Decimal) { editTotalBilled = it }
        EditField("Total Paid (₦)",   editTotalPaid,   KeyboardType.Decimal) { editTotalPaid   = it }

        Spacer(Modifier.height(6.dp))
        if (msg.isNotEmpty()) {
            Text(msg, color = if (msg.startsWith("✅") || msg.startsWith("☁️")) Color(0xFF4CAF50) else Color(0xFFFF5252),
                fontSize = 12.sp, modifier = Modifier.padding(bottom = 8.dp))
        }

        // Action buttons
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = { save() },
                enabled = !saving && !syncing,
                modifier = Modifier.weight(1f).height(50.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PurpleAccent)
            ) {
                if (saving) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                else { Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Save") }
            }
            OutlinedButton(
                onClick = { sync() },
                enabled = !saving && !syncing,
                modifier = Modifier.weight(1f).height(50.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, Color(0xFF29B6F6))
            ) {
                if (syncing) CircularProgressIndicator(color = Color(0xFF29B6F6), modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                else { Icon(Icons.Default.CloudUpload, contentDescription = null, tint = Color(0xFF29B6F6), modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Sync", color = Color(0xFF29B6F6)) }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

// ─── Shared Composables ──────────────────────────────────────────────────────

@Composable
private fun SearchBar(query: String, onQueryChange: (String) -> Unit, onSearch: () -> Unit, loading: Boolean) {
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        placeholder = { Text("Search by name, phone, email…", color = TextMuted2, fontSize = 13.sp) },
        trailingIcon = {
            if (loading) {
                CircularProgressIndicator(color = PurpleAccent, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                IconButton(onClick = onSearch) {
                    Icon(Icons.Default.Search, contentDescription = "Search", tint = PurpleAccent)
                }
            }
        },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = PurpleAccent,
            unfocusedBorderColor = GlassBorder2,
            focusedTextColor = Color.White,
            unfocusedTextColor = Color.White
        ),
        shape = RoundedCornerShape(12.dp)
    )
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, color = TextMuted2, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 2.dp, bottom = 6.dp))
}

@Composable
private fun EditField(
    label: String, value: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    onValueChange: (String) -> Unit
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label, fontSize = 12.sp, color = TextMuted2) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = PurpleAccent,
            unfocusedBorderColor = GlassBorder2,
            focusedTextColor = Color.White,
            unfocusedTextColor = Color.White,
            focusedLabelColor = PurpleAccent,
            unfocusedLabelColor = TextMuted2
        ),
        shape = RoundedCornerShape(10.dp)
    )
}
