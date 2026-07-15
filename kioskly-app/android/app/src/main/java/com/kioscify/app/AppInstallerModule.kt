package com.kioscify.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.security.MessageDigest

class AppInstallerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AppInstaller"

    @ReactMethod
    fun computeSha256(filePath: String, promise: Promise) {
        try {
            val cleanPath = filePath.removePrefix("file://")
            val file = File(cleanPath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "File not found at: $cleanPath")
                return
            }
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { stream ->
                val buffer = ByteArray(8192)
                var bytes: Int
                while (stream.read(buffer).also { bytes = it } != -1) {
                    digest.update(buffer, 0, bytes)
                }
            }
            val hex = digest.digest().joinToString("") { "%02x".format(it) }
            promise.resolve(hex)
        } catch (e: Exception) {
            promise.reject("CHECKSUM_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun installApk(filePath: String, promise: Promise) {
        try {
            val cleanPath = filePath.removePrefix("file://")
            val file = File(cleanPath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "APK file not found at: $cleanPath")
                return
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !reactApplicationContext.packageManager.canRequestPackageInstalls()
            ) {
                promise.reject(
                    "PERMISSION_REQUIRED",
                    "Installs from this app are not allowed. Enable 'Install unknown apps' for Kioscify in Settings.",
                )
                return
            }
            val uri = FileProvider.getUriForFile(
                reactApplicationContext,
                "${reactApplicationContext.packageName}.fileprovider",
                file,
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                reactApplicationContext.startActivity(intent)
            } catch (e: ActivityNotFoundException) {
                promise.reject("NO_INSTALLER_FOUND", "No app found to handle package installation.", e)
                return
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("INSTALL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun canRequestPackageInstalls(promise: Promise) {
        val allowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactApplicationContext.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
        promise.resolve(allowed)
    }

    @ReactMethod
    fun openInstallPermissionSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:${reactApplicationContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.message, e)
        }
    }
}
