package com.elite.clinic

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.view.WindowManager.LayoutParams.FLAG_SECURE
import java.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.elite.clinic.security.ZeroizableByteBuffer
import com.elite.clinic.security.ZeroizableBytes
import com.elite.clinic.sync.ActiveSyncConnectionProfile
import com.elite.clinic.sync.DoctorDocumentStreamParser
import com.elite.clinic.sync.InMemoryDoctorDocument
import com.elite.clinic.sync.SyncConnectionProfileRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.IOException

private const val MAX_DOCTOR_DOCUMENT_BYTES = 20 * 1024 * 1024
private val DOCTOR_DOCUMENT_MIME_TYPES = arrayOf(
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
)
private val DOCTOR_DOCUMENT_TYPES = listOf(
    "national-id" to "National ID",
    "passport" to "Passport",
    "medical-degree" to "Medical degree",
    "professional-license" to "Professional license",
    "specialty-certificate" to "Specialty certificate",
    "cv" to "CV",
    "employment-contract" to "Employment / contract",
    "training-certificate" to "Training certificate",
    "profile-photo" to "Profile photo",
    "other" to "Other",
)

private data class PickedDoctorDocument(
    val fileName: String,
    val mimeType: String,
    private val content: ZeroizableBytes,
) {
    val sizeBytes: Int get() = content.size

    fun <T> useContent(block: (ByteArray) -> T): T = content.use(block)

    fun clear() = content.close()
}

@Composable
fun DoctorDocumentWorkspace(application: EliteApplication) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()
    var profiles by remember { mutableStateOf<List<ActiveSyncConnectionProfile>>(emptyList()) }
    var selectedProfileIndex by remember { mutableStateOf(0) }
    var profileError by remember { mutableStateOf<String?>(null) }
    var isLoadingProfiles by remember { mutableStateOf(true) }

    var documentId by remember { mutableStateOf("") }
    var viewedDocument by remember { mutableStateOf<InMemoryDoctorDocument?>(null) }
    var isViewingDocument by remember { mutableStateOf(false) }
    var operationMessage by remember { mutableStateOf<String?>(null) }
    var operationError by remember { mutableStateOf<String?>(null) }
    var isBusy by remember { mutableStateOf(false) }

    var uploadDoctorId by remember { mutableStateOf("") }
    var uploadDisplayName by remember { mutableStateOf("") }
    var uploadDocumentType by remember { mutableStateOf(DOCTOR_DOCUMENT_TYPES.last().first) }
    var pickedDocument by remember { mutableStateOf<PickedDoctorDocument?>(null) }

    val selectedProfile = profiles.getOrNull(selectedProfileIndex)

    fun clearViewedDocument() {
        viewedDocument?.clear()
        viewedDocument = null
        isViewingDocument = false
    }

    fun clearPickedDocument() {
        pickedDocument?.clear()
        pickedDocument = null
    }

    val latestViewedDocument by rememberUpdatedState(viewedDocument)
    val latestPickedDocument by rememberUpdatedState(pickedDocument)
    DisposableEffect(Unit) {
        onDispose {
            latestViewedDocument?.clear()
            latestPickedDocument?.clear()
        }
    }

    LaunchedEffect(application.database) {
        isLoadingProfiles = true
        profileError = null
        try {
            val database = application.database
                ?: error("Encrypted local database is not initialized")
            profiles = withContext(Dispatchers.IO) {
                SyncConnectionProfileRepository(database.syncDao()).getActiveProfiles()
            }
            selectedProfileIndex = 0
        } catch (error: Exception) {
            profileError = userFacingError(error)
        } finally {
            isLoadingProfiles = false
        }
    }

    val pickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            operationError = null
            operationMessage = null
            try {
                pickedDocument = withContext(Dispatchers.IO) {
                    readPickedDoctorDocument(context, uri)
                }
                operationMessage = "File selected in memory. It will be erased after upload or cancellation."
            } catch (error: CancellationException) {
                clearPickedDocument()
                throw error
            } catch (error: Exception) {
                clearPickedDocument()
                operationError = userFacingError(error)
            }
        }
    }

    MaterialTheme {
        SecureDocumentWindow(enabled = isViewingDocument || viewedDocument != null)
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "Elite Clinic",
                    style = MaterialTheme.typography.headlineMedium,
                )
                Text(
                    text = "Doctor documents",
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    text = "Documents are viewed or uploaded through one encrypted LAN session. They are never saved in Android storage, Room, downloads, or sharing targets.",
                    style = MaterialTheme.typography.bodyMedium,
                )

                HorizontalDivider()
                Text("Secure Hub connection", style = MaterialTheme.typography.titleMedium)
                when {
                    isLoadingProfiles -> CircularProgressIndicator(modifier = Modifier.size(28.dp))
                    profileError != null -> Text(
                        text = profileError ?: "Unable to load secure profiles",
                        color = MaterialTheme.colorScheme.error,
                    )
                    profiles.isEmpty() -> Text(
                        text = "No active enrollment is available. Complete Android device enrollment before using document access.",
                        color = MaterialTheme.colorScheme.error,
                    )
                    else -> {
                        ProfileSelector(
                            profiles = profiles,
                            selectedIndex = selectedProfileIndex,
                            onSelected = { selectedProfileIndex = it },
                        )
                        Text(
                            text = "LAN access is active for ${selectedProfile?.entity?.hubBaseUrl ?: "the selected Hub"}.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }

                HorizontalDivider()
                Text("View a doctor document", style = MaterialTheme.typography.titleMedium)
                Text(
                    text = "The Hub currently authorizes document access by document ID. Obtain the ID from the desktop Doctor Profiles workspace.",
                    style = MaterialTheme.typography.bodySmall,
                )
                OutlinedTextField(
                    value = documentId,
                    onValueChange = { documentId = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Document ID") },
                    singleLine = true,
                    enabled = !isBusy,
                )
                Button(
                    onClick = {
                        val profile = selectedProfile ?: return@Button
                        scope.launch {
                            isBusy = true
                            operationError = null
                            operationMessage = null
                            clearViewedDocument()
                            isViewingDocument = true
                            try {
                                val response = withContext(Dispatchers.IO) {
                                    application.requestDoctorDocument(profile.entity.deviceId, documentId.trim())
                                }
                                viewedDocument = DoctorDocumentStreamParser.parse(response)
                                operationMessage = "Document loaded temporarily. Close the viewer when finished."
                            } catch (error: CancellationException) {
                                throw error
                            } catch (error: Exception) {
                                operationError = userFacingError(error)
                            } finally {
                                if (viewedDocument == null) {
                                    isViewingDocument = false
                                }
                                isBusy = false
                            }
                        }
                    },
                    enabled = selectedProfile != null && documentId.isNotBlank() && !isBusy,
                ) {
                    Text(if (isBusy) "Loading…" else "View securely")
                }

                viewedDocument?.let { document ->
                    TemporaryDoctorDocumentViewer(
                        document = document,
                        onClose = ::clearViewedDocument,
                    )
                }

                HorizontalDivider()
                Text("Upload a doctor document", style = MaterialTheme.typography.titleMedium)
                Text(
                    text = "The selected file remains only in memory until this screen uploads it or you cancel it. Supported formats: PDF, JPEG, PNG, and WebP. Maximum size: 20 MiB.",
                    style = MaterialTheme.typography.bodySmall,
                )
                OutlinedTextField(
                    value = uploadDoctorId,
                    onValueChange = { uploadDoctorId = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Doctor ID") },
                    singleLine = true,
                    enabled = !isBusy,
                )
                DocumentTypeSelector(
                    selectedType = uploadDocumentType,
                    onSelected = { uploadDocumentType = it },
                    enabled = !isBusy,
                )
                OutlinedTextField(
                    value = uploadDisplayName,
                    onValueChange = { uploadDisplayName = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Display name") },
                    singleLine = true,
                    enabled = !isBusy,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { pickerLauncher.launch(DOCTOR_DOCUMENT_MIME_TYPES) },
                        enabled = !isBusy,
                    ) {
                        Text(if (pickedDocument == null) "Choose file" else "Choose another")
                    }
                    OutlinedButton(
                        onClick = ::clearPickedDocument,
                        enabled = pickedDocument != null && !isBusy,
                    ) {
                        Text("Erase selection")
                    }
                }
                pickedDocument?.let { picked ->
                    Text(
                        text = "Selected: ${picked.fileName} (${formatBytes(picked.sizeBytes)}, ${picked.mimeType})",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Button(
                    onClick = {
                        val profile = selectedProfile ?: return@Button
                        val picked = pickedDocument ?: return@Button
                        scope.launch {
                            isBusy = true
                            operationError = null
                            operationMessage = null
                            try {
                                val encoded = withContext(Dispatchers.Default) {
                                    picked.useContent { bytes ->
                                        Base64.getEncoder().encodeToString(bytes)
                                    }
                                }
                                val response = withContext(Dispatchers.IO) {
                                    application.uploadDoctorDocument(
                                        profile.entity.deviceId,
                                        JSONObject()
                                            .put("doctorId", uploadDoctorId.trim())
                                            .put("documentType", uploadDocumentType)
                                            .put(
                                                "displayName",
                                                uploadDisplayName.trim().ifBlank { picked.fileName },
                                            )
                                            .put("fileName", picked.fileName)
                                            .put("mimeType", picked.mimeType)
                                            .put("contentBase64", encoded),
                                    )
                                }
                                operationMessage = "Upload accepted: ${response.optString("documentId", "document metadata returned")}."
                                clearPickedDocument()
                            } catch (error: CancellationException) {
                                throw error
                            } catch (error: Exception) {
                                operationError = userFacingError(error)
                            } finally {
                                isBusy = false
                            }
                        }
                    },
                    enabled = selectedProfile != null && uploadDoctorId.isNotBlank() &&
                        pickedDocument != null && !isBusy,
                ) {
                    Text(if (isBusy) "Working…" else "Upload securely")
                }

                operationMessage?.let {
                    Text(it, color = MaterialTheme.colorScheme.primary)
                }
                operationError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error)
                }
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun ProfileSelector(
    profiles: List<ActiveSyncConnectionProfile>,
    selectedIndex: Int,
    onSelected: (Int) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = profiles.getOrNull(selectedIndex)
    Box {
        OutlinedButton(onClick = { expanded = true }) {
            Text(selected?.entity?.deviceId ?: "Select secure enrollment")
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            profiles.forEachIndexed { index, profile ->
                DropdownMenuItem(
                    text = { Text(profile.entity.deviceId) },
                    onClick = {
                        onSelected(index)
                        expanded = false
                    },
                )
            }
        }
    }
}

@Composable
private fun DocumentTypeSelector(
    selectedType: String,
    onSelected: (String) -> Unit,
    enabled: Boolean,
) {
    var expanded by remember { mutableStateOf(false) }
    val label = DOCTOR_DOCUMENT_TYPES.firstOrNull { it.first == selectedType }?.second ?: selectedType
    Box {
        OutlinedButton(
            onClick = { expanded = true },
            enabled = enabled,
        ) {
            Text("Type: $label")
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DOCTOR_DOCUMENT_TYPES.forEach { (value, text) ->
                DropdownMenuItem(
                    text = { Text(text) },
                    onClick = {
                        onSelected(value)
                        expanded = false
                    },
                )
            }
        }
    }
}

@Composable
private fun TemporaryDoctorDocumentViewer(
    document: InMemoryDoctorDocument,
    onClose: () -> Unit,
) {
    DisposableEffect(document) {
        onDispose { document.clear() }
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(document.displayName, style = MaterialTheme.typography.titleMedium)
            Text(
                text = "${document.fileName} · ${document.mimeType} · version ${document.version} · ${formatBytes(document.sizeBytes)}",
                style = MaterialTheme.typography.bodySmall,
            )
            when {
                document.mimeType.startsWith("image/") -> SecureImagePreview(document)
                document.mimeType == "application/pdf" -> SecurePdfPreview(document)
                else -> Text("This document type is not supported by the in-app viewer.")
            }
            Text(
                text = "No save, share, download, screenshot export, or external viewer action is provided.",
                style = MaterialTheme.typography.bodySmall,
            )
            OutlinedButton(onClick = onClose) { Text("Close and erase") }
        }
    }
}

@Composable
private fun SecureImagePreview(document: InMemoryDoctorDocument) {
    var bitmap by remember(document.documentId) { mutableStateOf<Bitmap?>(null) }
    var error by remember(document.documentId) { mutableStateOf<String?>(null) }
    val latestBitmap by rememberUpdatedState(bitmap)
    DisposableEffect(document.documentId) {
        onDispose {
            latestBitmap?.recycle()
        }
    }
    LaunchedEffect(document.documentId) {
        try {
            bitmap = withContext(Dispatchers.Default) {
                document.useViewerCopy { bytes ->
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                }
            }
            if (bitmap == null) error = "Image could not be decoded in memory."
        } catch (exception: Exception) {
            error = userFacingError(exception)
        }
    }
    if (bitmap != null) {
        Image(
            bitmap = bitmap!!.asImageBitmap(),
            contentDescription = document.displayName,
            modifier = Modifier
                .fillMaxWidth()
                .height(320.dp),
            contentScale = ContentScale.Fit,
        )
    } else if (error != null) {
        Text(error ?: "Unable to render image", color = MaterialTheme.colorScheme.error)
    } else {
        CircularProgressIndicator(modifier = Modifier.size(28.dp))
    }
}

@Composable
private fun SecurePdfPreview(document: InMemoryDoctorDocument) {
    var bitmap by remember(document.documentId) { mutableStateOf<Bitmap?>(null) }
    var error by remember(document.documentId) { mutableStateOf<String?>(null) }
    val latestBitmap by rememberUpdatedState(bitmap)
    DisposableEffect(document.documentId) {
        onDispose {
            latestBitmap?.recycle()
        }
    }
    val applicationContext = LocalContext.current.applicationContext
    LaunchedEffect(document.documentId) {
        try {
            bitmap = withContext(Dispatchers.Default) {
                document.useViewerCopy { bytes ->
                    renderFirstPdfPage(applicationContext, bytes)
                }
            }
            if (bitmap == null) error = "PDF could not be rendered in memory."
        } catch (exception: Exception) {
            error = userFacingError(exception)
        }
    }
    if (bitmap != null) {
        Image(
            bitmap = bitmap!!.asImageBitmap(),
            contentDescription = document.displayName,
            modifier = Modifier
                .fillMaxWidth()
                .height(420.dp),
            contentScale = ContentScale.Fit,
        )
    } else if (error != null) {
        Text(error ?: "Unable to render PDF", color = MaterialTheme.colorScheme.error)
    } else {
        CircularProgressIndicator(modifier = Modifier.size(28.dp))
    }
}

@Composable
private fun SecureDocumentWindow(enabled: Boolean) {
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() } ?: return
    val window = activity.window
    val wasSecure = remember(window) {
        window.attributes.flags and FLAG_SECURE != 0
    }

    DisposableEffect(window) {
        onDispose {
            if (wasSecure) {
                window.addFlags(FLAG_SECURE)
            } else {
                window.clearFlags(FLAG_SECURE)
            }
        }
    }
    SideEffect {
        if (enabled) {
            window.addFlags(FLAG_SECURE)
        } else if (!wasSecure) {
            window.clearFlags(FLAG_SECURE)
        }
    }
}

private fun Context.findActivity(): Activity? {
    var current: Context = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return current as? Activity
}

private fun renderFirstPdfPage(context: Context, bytes: ByteArray): Bitmap? {
    val temporaryFile = File.createTempFile(
        "elite-doctor-document-",
        ".pdf",
        context.cacheDir,
    )
    return try {
        temporaryFile.outputStream().use { output ->
            output.write(bytes)
        }
        ParcelFileDescriptor.open(
            temporaryFile,
            ParcelFileDescriptor.MODE_READ_ONLY,
        ).use { descriptor ->
            PdfRenderer(descriptor).use { renderer ->
                if (renderer.pageCount == 0) return null
                renderer.openPage(0).use { page ->
                    val width = (page.width * 1.5f).toInt().coerceAtLeast(1)
                    val height = (page.height * 1.5f).toInt().coerceAtLeast(1)
                    Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { bitmap ->
                        bitmap.eraseColor(android.graphics.Color.WHITE)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    }
                }
            }
        }
    } finally {
        temporaryFile.delete()
    }
}

private fun readPickedDoctorDocument(context: Context, uri: Uri): PickedDoctorDocument {
    val resolver = context.contentResolver
    val mimeType = resolver.getType(uri)?.lowercase()
        ?: throw IllegalArgumentException("Selected file has no supported MIME type")
    require(mimeType in DOCTOR_DOCUMENT_MIME_TYPES) {
        "Only PDF, JPEG, PNG, and WebP files are supported"
    }
    val fileName = resolver.queryDisplayName(uri)
    val accumulator = ZeroizableByteBuffer(
        maxSize = MAX_DOCTOR_DOCUMENT_BYTES,
        initialCapacity = 64 * 1024,
    )
    var transferred: ZeroizableBytes? = null
    return try {
        val input = resolver.openInputStream(uri)
            ?: throw IOException("Unable to read the selected document")
        input.use { stream ->
            val scratch = ByteArray(64 * 1024)
            try {
                while (true) {
                    val read = stream.read(scratch)
                    if (read < 0) break
                    accumulator.append(scratch, count = read)
                }
            } finally {
                scratch.fill(0)
            }
        }
        transferred = accumulator.seal()
        val content = transferred
            ?: error("SECURE_DOCUMENT_CONTENT_TRANSFER_FAILED")
        val result = PickedDoctorDocument(fileName, mimeType, content)
        transferred = null
        result
    } finally {
        accumulator.close()
        transferred?.close()
    }
}

private fun android.content.ContentResolver.queryDisplayName(uri: Uri): String {
    query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor: Cursor ->
        if (cursor.moveToFirst()) {
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0) return cursor.getString(index).orEmpty().ifBlank { "doctor-document" }
        }
    }
    return uri.lastPathSegment?.substringAfterLast('/')?.ifBlank { "doctor-document" }
        ?: "doctor-document"
}

private fun formatBytes(bytes: Int): String = when {
    bytes >= 1024 * 1024 -> "%.1f MiB".format(bytes / (1024f * 1024f))
    bytes >= 1024 -> "%.1f KiB".format(bytes / 1024f)
    else -> "$bytes B"
}

private fun userFacingError(error: Throwable): String {
    val message = error.message?.trim().orEmpty()
    return if (message.isBlank()) "Secure document operation failed" else message
}
