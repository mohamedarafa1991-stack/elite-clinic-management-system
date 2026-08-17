package com.elite.clinic.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.elite.clinic.EliteApplication
import java.util.concurrent.TimeUnit

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        val coordinator = (applicationContext as EliteApplication).secureSyncCoordinator
            ?: return Result.success()
        return try {
            val result = coordinator.runOnce()
            if (result.retry) {
                Result.retry()
            } else {
                Result.success(
                    workDataOf(
                        "submitted" to result.submitted,
                        "acknowledged" to result.acknowledged,
                        "conflicts" to result.conflicts,
                        "rejected" to result.rejected,
                    ),
                )
            }
        } catch (error: SyncFailureException) {
            if (error.retryable) {
                Result.retry()
            } else {
                Result.failure(
                    workDataOf(
                        "reasonCode" to error.reasonCode,
                        "retryable" to false,
                    ),
                )
            }
        } catch (error: SecurityException) {
            Result.failure(workDataOf("reasonCode" to (error.message ?: "SECURE_SESSION_REJECTED")))
        } catch (_: Exception) {
            Result.retry()
        }
    }

    companion object {
        private const val PERIODIC_WORK_NAME = "elite-secure-sync-periodic"
        private const val IMMEDIATE_WORK_NAME = "elite-secure-sync-immediate"
        private const val PERIODIC_INTERVAL_HOURS = 3L

        private fun constraints(): Constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        fun enqueuePeriodic(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(
                PERIODIC_INTERVAL_HOURS,
                TimeUnit.HOURS,
            )
                .setConstraints(constraints())
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    30,
                    TimeUnit.SECONDS,
                )
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request,
            )
        }

        fun enqueueRetryNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints())
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    30,
                    TimeUnit.SECONDS,
                )
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                IMMEDIATE_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }

        fun enqueueNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints())
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    30,
                    TimeUnit.SECONDS,
                )
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                IMMEDIATE_WORK_NAME,
                ExistingWorkPolicy.KEEP,
                request,
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK_NAME)
            WorkManager.getInstance(context).cancelUniqueWork(IMMEDIATE_WORK_NAME)
        }
    }
}
