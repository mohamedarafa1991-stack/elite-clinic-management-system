package com.elite.clinic

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.People
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.elite.clinic.sync.ActiveSyncConnectionProfile
import com.elite.clinic.sync.BillingSummaryEntity
import com.elite.clinic.sync.SyncConnectionProfileRepository
import com.elite.clinic.sync.SyncRepository
import com.elite.clinic.sync.SyncResourceMetadataEntity
import kotlinx.coroutines.flow.flowOf
import org.json.JSONObject

private enum class WorkspaceTab(
    val label: String,
    val arabicLabel: String,
    val shortLabel: String,
) {
    DASHBOARD("Dashboard", "لوحة التحكم", "D"),
    PATIENTS("Patients", "المرضى", "P"),
    APPOINTMENTS("Appointments", "المواعيد", "A"),
    DOCTORS("Doctors", "الأطباء", "Dr"),
    MORE("More", "المزيد", "⋯"),
}

private fun WorkspaceTab.icon(): ImageVector = when (this) {
    WorkspaceTab.DASHBOARD -> Icons.Filled.Home
    WorkspaceTab.PATIENTS -> Icons.Filled.People
    WorkspaceTab.APPOINTMENTS -> Icons.Filled.CalendarMonth
    WorkspaceTab.DOCTORS -> Icons.Filled.MedicalServices
    WorkspaceTab.MORE -> Icons.Filled.MoreHoriz
}

private data class MirrorPatient(
    val resourceId: String,
    val patientId: String,
    val nameEn: String,
    val nameAr: String?,
    val dob: String?,
    val phone: String,
    val status: String,
    val completeness: String,
    val updatedAt: String,
)

private data class MirrorAppointment(
    val resourceId: String,
    val patientId: String,
    val doctorId: String?,
    val scheduledStart: String,
    val scheduledEnd: String?,
    val status: String,
    val visitType: String,
    val notes: String?,
    val updatedAt: String,
)

private data class MirrorDoctor(
    val resourceId: String,
    val doctorId: String,
    val nameEn: String,
    val nameAr: String?,
    val specialtySummary: String,
    val departmentSummary: String,
    val qualifications: String?,
    val feeEgp: String?,
    val room: String?,
    val licenseStatus: String,
    val documentCount: Int,
    val updatedAt: String,
)

@Composable
fun ClinicWorkspace(
    application: EliteApplication,
    arabic: Boolean,
    onArabicChange: (Boolean) -> Unit,
    themePreference: WorkspaceThemePreference,
    onThemeChange: (WorkspaceThemePreference) -> Unit,
) {
    val database = requireNotNull(application.database) {
        "ELITE_ANDROID_WORKSPACE_DATABASE_REQUIRED"
    }
    val repository = remember(database) { SyncRepository(database) }
    var activeTab by remember { mutableStateOf(WorkspaceTab.DASHBOARD) }
    var activeProfiles by remember { mutableStateOf<List<ActiveSyncConnectionProfile>>(emptyList()) }
    var selectedPatientId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(database) {
        activeProfiles = SyncConnectionProfileRepository(database.syncDao()).getActiveProfiles()
    }

    val deviceId = activeProfiles.firstOrNull()?.entity?.deviceId
    val patientResources by remember(deviceId) {
        deviceId?.let { repository.observeScope(it, "patient-summary") }
            ?: flowOf(emptyList())
    }.collectAsState(initial = emptyList())
    val appointmentResources by remember(deviceId) {
        deviceId?.let { repository.observeScope(it, "appointments") }
            ?: flowOf(emptyList())
    }.collectAsState(initial = emptyList())
    val doctorResources by remember(deviceId) {
        deviceId?.let { repository.observeScope(it, "doctor-summary") }
            ?: flowOf(emptyList())
    }.collectAsState(initial = emptyList())
    val encounterResources by remember(deviceId) {
        deviceId?.let { repository.observeScope(it, "encounter-summary") }
            ?: flowOf(emptyList())
    }.collectAsState(initial = emptyList())
    val clinicalNoteResources by remember(deviceId) {
        deviceId?.let { repository.observeScope(it, "clinical-notes") }
            ?: flowOf(emptyList())
    }.collectAsState(initial = emptyList())
    val billingSummaries by remember(deviceId) {
        deviceId?.let { repository.observeBillingSummaries(it) }
            ?: flowOf(emptyList())
    }.collectAsState(initial = emptyList())

    val patients = remember(patientResources) {
        patientResources.mapNotNull(::toMirrorPatient)
    }
    val appointments = remember(appointmentResources) {
        appointmentResources.mapNotNull(::toMirrorAppointment)
            .sortedBy { it.scheduledStart }
    }
    val doctors = remember(doctorResources, appointmentResources) {
        val synced = doctorResources.mapNotNull(::toMirrorDoctor)
        if (synced.isNotEmpty()) {
            synced
        } else {
            val appointmentDoctors = appointmentResources.mapNotNull { resource ->
                val payload = resource.payload() ?: return@mapNotNull null
                val doctorId = payload.text("doctorId") ?: return@mapNotNull null
                doctorId to resource
            }
            appointmentDoctors.groupBy({ it.first }, { it.second }).map { (doctorId, resources) ->
                MirrorDoctor(
                    resourceId = "derived-doctor-$doctorId",
                    doctorId = doctorId,
                    nameEn = "Doctor $doctorId",
                    nameAr = null,
                    specialtySummary = "Profile details will appear after the Hub doctor-profile mirror is enrolled.",
                    departmentSummary = "Derived from synchronized appointments",
                    qualifications = null,
                    feeEgp = null,
                    room = null,
                    licenseStatus = "Summary pending",
                    documentCount = 0,
                    updatedAt = resources.maxOfOrNull { it.updatedAt } ?: "",
                )
            }
        }
    }
    val selectedPatient = patients.firstOrNull { it.resourceId == selectedPatientId }
    val selectedPatientAppointments = selectedPatient?.let { patient ->
        appointments.filter { it.patientId == patient.patientId }
    }.orEmpty()
    val selectedPatientVisits = selectedPatient?.let { patient ->
        (encounterResources + clinicalNoteResources).mapNotNull { resource ->
            val payload = resource.payload() ?: return@mapNotNull null
            if (payload.text("patientId") != patient.patientId) return@mapNotNull null
            resource to payload
        }
    }.orEmpty()

    Scaffold(
        bottomBar = {
            NavigationBar {
                WorkspaceTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = activeTab == tab,
                        onClick = {
                            activeTab = tab
                            selectedPatientId = null
                        },
                        icon = { Icon(tab.icon(), contentDescription = null) },
                        label = { Text(if (arabic) tab.arabicLabel else tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        Surface(
            modifier = Modifier.fillMaxSize().padding(padding),
            color = MaterialTheme.colorScheme.background,
        ) {
            when {
                selectedPatient != null -> PatientDetailScreen(
                    patient = selectedPatient,
                    appointments = selectedPatientAppointments,
                    visits = selectedPatientVisits,
                    onBack = { selectedPatientId = null },
                )
                else -> when (activeTab) {
                    WorkspaceTab.DASHBOARD -> DashboardScreen(
                        patients = patients,
                        appointments = appointments,
                        doctors = doctors,
                        billingSummaries = billingSummaries,
                        syncReady = deviceId != null,
                        onPatients = { activeTab = WorkspaceTab.PATIENTS },
                        onAppointments = { activeTab = WorkspaceTab.APPOINTMENTS },
                        onDoctors = { activeTab = WorkspaceTab.DOCTORS },
                    )
                    WorkspaceTab.PATIENTS -> PatientsScreen(
                        patients = patients,
                        hasEnrollment = deviceId != null,
                        onSelect = { selectedPatientId = it.resourceId },
                    )
                    WorkspaceTab.APPOINTMENTS -> AppointmentsScreen(
                        appointments = appointments,
                        hasEnrollment = deviceId != null,
                    )
                    WorkspaceTab.DOCTORS -> DoctorsScreen(
                        doctors = doctors,
                        hasEnrollment = deviceId != null,
                    )
                    WorkspaceTab.MORE -> MoreScreen(
                        application = application,
                        billingSummaries = billingSummaries,
                        arabic = arabic,
                        onArabicChange = onArabicChange,
                        themePreference = themePreference,
                        onThemeChange = onThemeChange,
                    )
                }
            }
        }
    }
}

@Composable
private fun DashboardScreen(
    patients: List<MirrorPatient>,
    appointments: List<MirrorAppointment>,
    doctors: List<MirrorDoctor>,
    billingSummaries: List<BillingSummaryEntity>,
    syncReady: Boolean,
    onPatients: () -> Unit,
    onAppointments: () -> Unit,
    onDoctors: () -> Unit,
) {
    WorkspaceList(title = "Dashboard / لوحة التحكم", subtitle = "Today at Elite Clinic · Offline mirror") {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                MetricCard("Patients", patients.size.toString(), Modifier.weight(1f))
                MetricCard("Today visits", appointments.size.toString(), Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                MetricCard("Doctors", doctors.size.toString(), Modifier.weight(1f))
                MetricCard("Invoices", billingSummaries.size.toString(), Modifier.weight(1f))
            }
        }
        item {
            MirrorSectionCard(
                title = "Secure connection",
                detail = if (syncReady) "Encrypted local mirror is enrolled. Data remains available offline." else "No active Hub enrollment is available. The app remains local and protected.",
                status = if (syncReady) "Ready" else "Offline only",
            )
        }
        item {
            QuickActionCard("Patients / المرضى", "Open patient profile cards and visit history", onPatients)
        }
        item {
            QuickActionCard("Appointments / المواعيد", "Open the appointment agenda", onAppointments)
        }
        item {
            QuickActionCard("Doctors / الأطباء", "Open doctor profile cards", onDoctors)
        }
        item {
            Text("The Dashboard is a quick view. Use the bottom tabs for the complete workspaces.", style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun PatientsScreen(
    patients: List<MirrorPatient>,
    hasEnrollment: Boolean,
    onSelect: (MirrorPatient) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val normalizedQuery = query.trim().lowercase()
    val visiblePatients = remember(patients, normalizedQuery) {
        if (normalizedQuery.isBlank()) patients else patients.filter { patient ->
            listOf(patient.patientId, patient.nameEn, patient.nameAr, patient.phone)
                .filterNotNull()
                .any { it.lowercase().contains(normalizedQuery) }
        }
    }
    WorkspaceList(title = "Patients / المرضى", subtitle = "Profile cards · appointments · visit history") {
        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Search patient ID, name, or phone") },
            )
        }
        if (patients.isEmpty()) {
            item {
                EmptyMirrorCard(
                    title = "No patient profiles on this device",
                    detail = if (hasEnrollment) "The secure mirror is ready, but no patient-summary records have been synchronized yet." else "Enroll and approve this Android device from the Windows Hub, then sync synthetic clinic data.",
                )
            }
        }
        if (patients.isNotEmpty() && visiblePatients.isEmpty()) {
            item { EmptyMirrorCard("No matching patients", "Try a patient ID, name, or phone number.") }
        }
        items(visiblePatients, key = { it.resourceId }) { patient ->
            PatientCard(patient = patient, onClick = { onSelect(patient) })
        }
    }
}

@Composable
private fun PatientCard(patient: MirrorPatient, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(48.dp)) {
                    Text(
                        text = patient.nameEn.take(2).uppercase(),
                        modifier = Modifier.padding(12.dp),
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(patient.nameEn, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(patient.patientId, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                }
                Text(patient.status, style = MaterialTheme.typography.labelMedium)
            }
            HorizontalDivider()
            Text(patient.phone.ifBlank { "Phone not recorded" }, style = MaterialTheme.typography.bodyMedium)
            Text("DOB: ${patient.dob ?: "Not recorded"} · ${patient.completeness}", style = MaterialTheme.typography.bodySmall)
            if (!patient.nameAr.isNullOrBlank()) Text(patient.nameAr, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun PatientDetailScreen(
    patient: MirrorPatient,
    appointments: List<MirrorAppointment>,
    visits: List<Pair<SyncResourceMetadataEntity, JSONObject>>,
    onBack: () -> Unit,
) {
    WorkspaceList(title = "Patient profile / ملف المريض", subtitle = patient.patientId) {
        item { BackHeader("Back to patients / العودة للمرضى", onBack) }
        item {
            Card(shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(patient.nameEn, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    if (!patient.nameAr.isNullOrBlank()) Text(patient.nameAr, style = MaterialTheme.typography.bodyLarge)
                    Text(patient.patientId, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                    HorizontalDivider()
                    DetailLine("Phone", patient.phone.ifBlank { "Not recorded" })
                    DetailLine("Date of birth", patient.dob ?: "Not recorded")
                    DetailLine("Status", patient.status)
                    DetailLine("Completeness", patient.completeness)
                    DetailLine("Last update", patient.updatedAt)
                }
            }
        }
        item { Text("Appointments / المواعيد", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
        if (appointments.isEmpty()) item { EmptyMirrorCard("No appointments", "No synchronized appointments are linked to this patient.") }
        items(appointments, key = { "patient-${it.resourceId}" }) { AppointmentCard(it) }
        item { Text("Visit history / تاريخ الزيارات", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
        if (visits.isEmpty()) item { EmptyMirrorCard("No visit history", "Clinical history will appear when the permitted encounter scope has synchronized records.") }
        items(visits, key = { "visit-${it.first.resourceId}" }) { (resource, payload) ->
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(payload.text("encounterAt") ?: resource.updatedAt, fontWeight = FontWeight.Bold)
                    Text(payload.text("status") ?: resource.resourceType, color = MaterialTheme.colorScheme.primary)
                    Text(payload.text("assessment") ?: payload.text("subjective") ?: "Clinical note available in the permitted local mirror.", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun AppointmentsScreen(appointments: List<MirrorAppointment>, hasEnrollment: Boolean) {
    WorkspaceList(title = "Appointments / المواعيد", subtitle = "Agenda view · check-in · visit status") {
        if (appointments.isEmpty()) {
            item {
                EmptyMirrorCard(
                    "No appointments on this device",
                    if (hasEnrollment) "The appointment mirror is ready, but no appointment records have synchronized yet." else "Connect this device through the Windows Hub to receive the appointment agenda.",
                )
            }
        }
        items(appointments, key = { it.resourceId }) { AppointmentCard(it) }
    }
}

@Composable
private fun AppointmentCard(appointment: MirrorAppointment) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(appointment.scheduledStart.displayDateTime(), fontWeight = FontWeight.Bold)
                Text(appointment.status, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            }
            Text("Patient: ${appointment.patientId}", style = MaterialTheme.typography.bodyMedium)
            Text("Doctor: ${appointment.doctorId ?: "Not assigned"}", style = MaterialTheme.typography.bodyMedium)
            Text(appointment.visitType, style = MaterialTheme.typography.bodySmall)
            if (!appointment.notes.isNullOrBlank()) Text(appointment.notes, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun DoctorsScreen(doctors: List<MirrorDoctor>, hasEnrollment: Boolean) {
    var query by remember { mutableStateOf("") }
    val normalizedQuery = query.trim().lowercase()
    val visibleDoctors = remember(doctors, normalizedQuery) {
        if (normalizedQuery.isBlank()) doctors else doctors.filter { doctor ->
            listOf(doctor.doctorId, doctor.nameEn, doctor.nameAr, doctor.specialtySummary, doctor.departmentSummary)
                .filterNotNull()
                .any { it.lowercase().contains(normalizedQuery) }
        }
    }
    WorkspaceList(title = "Doctors / الأطباء", subtitle = "Profile cards · specialties · fees · documents") {
        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Search doctor, specialty, or department") },
            )
        }
        if (doctors.isEmpty()) {
            item {
                EmptyMirrorCard(
                    "No doctor profile cards on this device",
                    if (hasEnrollment) "Doctor profile details are managed on the Windows Hub. The Android doctor-profile mirror scope is not yet included in this enrollment." else "Enroll the Android device from the Windows Hub first.",
                )
            }
        }
        if (doctors.isNotEmpty() && visibleDoctors.isEmpty()) {
            item { EmptyMirrorCard("No matching doctors", "Try a doctor name, specialty, or department.") }
        }
        items(visibleDoctors, key = { it.resourceId }) { DoctorCard(it) }
    }
}

@Composable
private fun DoctorCard(doctor: MirrorDoctor) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.secondaryContainer, modifier = Modifier.size(48.dp)) {
                    Text(doctor.nameEn.take(2).uppercase(), modifier = Modifier.padding(12.dp), fontWeight = FontWeight.Bold)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(doctor.nameEn, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(doctor.doctorId, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                }
            }
            HorizontalDivider()
            DetailLine("Specialties", doctor.specialtySummary)
            DetailLine("Departments", doctor.departmentSummary)
            DetailLine("Fee", doctor.feeEgp ?: "Not synchronized")
            DetailLine("Room", doctor.room ?: "Not synchronized")
            DetailLine("License", doctor.licenseStatus)
            if (!doctor.qualifications.isNullOrBlank()) DetailLine("Qualifications", doctor.qualifications)
            DetailLine("Documents", "${doctor.documentCount} active document(s)")
            Text("Doctor documents remain in the Windows vault and are streamed for Android viewing.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun MoreScreen(
    application: EliteApplication,
    billingSummaries: List<BillingSummaryEntity>,
    arabic: Boolean,
    onArabicChange: (Boolean) -> Unit,
    themePreference: WorkspaceThemePreference,
    onThemeChange: (WorkspaceThemePreference) -> Unit,
) {
    var showDocumentVault by remember { mutableStateOf(false) }
    if (showDocumentVault) {
        Column(modifier = Modifier.fillMaxSize()) {
            BackHeader("Back to more / العودة للمزيد") { showDocumentVault = false }
            DoctorDocumentWorkspace(application)
        }
        return
    }
    WorkspaceList(
        title = uiText(arabic, "More", "المزيد"),
        subtitle = uiText(arabic, "Documents · billing · reports · sync", "الوثائق · الفوترة · التقارير · المزامنة"),
    ) {
        item {
            PreferenceCard(
                arabic = arabic,
                themePreference = themePreference,
                onArabicChange = onArabicChange,
                onThemeChange = onThemeChange,
            )
        }
        item {
            MirrorSectionCard(
                title = uiText(arabic, "Android mirror boundary", "نطاق تطبيق أندرويد"),
                detail = uiText(
                    arabic,
                    "Patient, appointment, doctor, and permitted clinical summaries are available offline after secure sync. Billing changes, clinical authoring, and administration remain on the Windows Hub.",
                    "تتوفر ملخصات المرضى والمواعيد والأطباء والبيانات السريرية المسموح بها دون اتصال بعد المزامنة الآمنة. تظل تعديلات الفوترة والكتابة السريرية والإدارة على جهاز Windows Hub.",
                ),
                status = uiText(arabic, "Read-only mirror", "مرآة للعرض فقط"),
            )
        }
        item {
            MirrorSectionCard(
                title = "Billing / الفوترة",
                detail = uiText(
                    arabic,
                    "${billingSummaries.size} invoice summaries are stored locally on this device. Billing changes remain on the Windows Hub.",
                    "تم حفظ ملخصات ${billingSummaries.size} فاتورة محلياً على هذا الجهاز. تظل تعديلات الفوترة على Windows Hub.",
                ),
                status = uiText(arabic, "Local summary", "ملخص محلي"),
            )
        }
        item {
            MirrorSectionCard(
                title = "Reports / التقارير",
                detail = uiText(
                    arabic,
                    "Monthly revenue and patient trends are available from the Windows reporting workspace.",
                    "تتوفر اتجاهات الإيرادات الشهرية والمرضى من مساحة التقارير على Windows.",
                ),
                status = uiText(arabic, "Hub workspace", "مساحة Windows"),
            )
        }
        item {
            QuickActionCard(
                "Secure documents / الوثائق الآمنة",
                uiText(
                    arabic,
                    "Open the secure doctor-document viewer and upload flow. Files are streamed and cleared from memory after use.",
                    "افتح عارض وثائق الأطباء الآمن وخيار الرفع. يتم بث الملفات ومسحها من الذاكرة بعد الاستخدام.",
                ),
            ) { showDocumentVault = true }
        }
    }
}

@Composable
private fun WorkspaceList(
    title: String,
    subtitle: String,
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            content()
        },
    )
}

@Composable
private fun MetricCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier, shape = RoundedCornerShape(16.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun QuickActionCard(title: String, detail: String, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick), shape = RoundedCornerShape(16.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(detail, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun MirrorSectionCard(title: String, detail: String, status: String) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(status, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
            }
            Text(detail, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun EmptyMirrorCard(title: String, detail: String) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(detail, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun BackHeader(label: String, onBack: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onBack), shape = RoundedCornerShape(14.dp)) {
        Text(label, modifier = Modifier.padding(14.dp), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun PreferenceCard(
    arabic: Boolean,
    themePreference: WorkspaceThemePreference,
    onArabicChange: (Boolean) -> Unit,
    onThemeChange: (WorkspaceThemePreference) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                uiText(arabic, "Display preferences", "إعدادات المظهر"),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(uiText(arabic, "Arabic interface", "الواجهة العربية"))
                Switch(checked = arabic, onCheckedChange = onArabicChange)
            }
            Text(uiText(arabic, "Theme", "المظهر"), style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                WorkspaceThemePreference.entries.forEach { option ->
                    TextButton(
                        onClick = { onThemeChange(option) },
                        enabled = option != themePreference,
                    ) {
                        Text(
                            when (option) {
                                WorkspaceThemePreference.LIGHT -> uiText(arabic, "Light", "فاتح")
                                WorkspaceThemePreference.DARK -> uiText(arabic, "Dark", "داكن")
                                WorkspaceThemePreference.HIGH_CONTRAST -> uiText(arabic, "High contrast", "تباين عالٍ")
                            },
                        )
                    }
                }
            }
        }
    }
}

private fun uiText(arabic: Boolean, english: String, arabicText: String): String =
    if (arabic) arabicText else english

private fun SyncResourceMetadataEntity.payload(): JSONObject? = payloadJson?.let {
    runCatching { JSONObject(it) }.getOrNull()
}

private fun JSONObject.text(key: String): String? = optString(key).takeIf { it.isNotBlank() && it != "null" }

private fun JSONObject.textAny(vararg keys: String): String? = keys.firstNotNullOfOrNull { text(it) }

private fun toMirrorDoctor(resource: SyncResourceMetadataEntity): MirrorDoctor? {
    if (resource.resourceType != "DoctorProfile" || resource.redacted || resource.operation == "delete") return null
    val payload = resource.payload() ?: return null
    val specialties = payload.optJSONArray("specialtyIds")?.length() ?: 0
    val departments = payload.optJSONArray("departmentIds")?.length() ?: 0
    val fee = payload.optLong("consultationFeeEgp", Long.MIN_VALUE).let { value ->
        if (value == Long.MIN_VALUE) null else "EGP $value"
    }
    return MirrorDoctor(
        resourceId = resource.resourceId,
        doctorId = payload.textAny("doctorId", "id") ?: resource.resourceId,
        nameEn = payload.textAny("displayNameEn", "nameEn") ?: "Doctor ${resource.resourceId}",
        nameAr = payload.textAny("displayNameAr", "nameAr"),
        specialtySummary = if (specialties == 0) "No specialties recorded" else "$specialties specialty assignment(s)",
        departmentSummary = if (departments == 0) "No departments recorded" else "$departments department assignment(s)",
        qualifications = payload.text("qualifications"),
        feeEgp = fee,
        room = payload.text("clinicRoom"),
        licenseStatus = payload.text("licenseVerificationStatus") ?: "unverified",
        documentCount = payload.optInt("documentCount", 0),
        updatedAt = resource.updatedAt,
    )
}

private fun toMirrorPatient(resource: SyncResourceMetadataEntity): MirrorPatient? {
    if (resource.resourceType != "Patient" || resource.redacted || resource.operation == "delete") return null
    val payload = resource.payload() ?: return null
    return MirrorPatient(
        resourceId = resource.resourceId,
        patientId = payload.textAny("patientId", "id") ?: resource.resourceId,
        nameEn = payload.textAny("nameEn", "displayNameEn") ?: "Patient ${resource.resourceId}",
        nameAr = payload.textAny("nameAr", "displayNameAr"),
        dob = payload.textAny("dob", "dateOfBirth"),
        phone = payload.text("phone").orEmpty(),
        status = payload.text("status") ?: "active",
        completeness = payload.textAny("completenessStatus", "completeness") ?: "summary",
        updatedAt = resource.updatedAt,
    )
}

private fun toMirrorAppointment(resource: SyncResourceMetadataEntity): MirrorAppointment? {
    if (resource.resourceType != "Appointment" || resource.redacted || resource.operation == "delete") return null
    val payload = resource.payload() ?: return null
    return MirrorAppointment(
        resourceId = resource.resourceId,
        patientId = payload.text("patientId") ?: "Unknown patient",
        doctorId = payload.text("doctorId"),
        scheduledStart = payload.text("scheduledStart") ?: resource.updatedAt,
        scheduledEnd = payload.text("scheduledEnd"),
        status = payload.text("status") ?: "scheduled",
        visitType = payload.text("visitType") ?: "Visit",
        notes = payload.text("notes"),
        updatedAt = resource.updatedAt,
    )
}

private fun String.displayDateTime(): String = replace("T", " ").removeSuffix(".000Z").removeSuffix("Z")
