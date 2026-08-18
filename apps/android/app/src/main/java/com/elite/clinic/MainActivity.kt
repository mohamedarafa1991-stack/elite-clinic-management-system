package com.elite.clinic

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val application = application as EliteApplication
        setContent {
            if (application.database != null) {
                DoctorDocumentWorkspace(application)
            } else {
                FoundationScreen(databaseReady = false)
            }
        }
    }
}

@Composable
private fun FoundationScreen(databaseReady: Boolean) {
    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = "Elite Clinic Management System",
                    style = MaterialTheme.typography.headlineMedium,
                )
                Text(
                    text = if (databaseReady) {
                        "Encrypted local store ready"
                    } else {
                        "Secure foundation initialized — encrypted local store pending configuration"
                    },
                    modifier = Modifier.padding(top = 12.dp),
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }
    }
}
