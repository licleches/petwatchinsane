package com.example.petwatch.presentation.data.local

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.time.Instant
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Credencial del reloj (device_token) y vinculación pendiente, cifradas con una
 * clave AES-GCM de Android Keystore. Copiado de MedTime Watch.
 */
class DeviceCredentialStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE
    )

    fun load(): DeviceCredential? {
        val credential = runCatching {
            val deviceId = preferences.getString(KEY_DEVICE_ID, null) ?: return null
            val expiresAt = preferences.getString(KEY_EXPIRES_AT, null)
                ?.let(Instant::parse)
                ?: return null
            val encryptedToken = preferences.getString(KEY_TOKEN, null) ?: return null
            val initializationVector = preferences.getString(KEY_IV, null) ?: return null
            val token = decrypt(
                encryptedToken = encryptedToken,
                initializationVector = initializationVector
            )
            DeviceCredential(deviceId, token, expiresAt)
        }.getOrElse {
            resetCorruptStorage()
            null
        }
        if (credential?.isExpired() == true) {
            clear()
            return null
        }
        return credential
    }

    fun save(credential: DeviceCredential) {
        require(credential.deviceId.isNotBlank())
        require(credential.deviceToken.isNotBlank())
        require(!credential.isExpired())

        val encrypted = runCatching { encrypt(credential.deviceToken) }
            .recoverCatching {
                resetKey()
                encrypt(credential.deviceToken)
            }
            .getOrThrow()

        preferences.edit()
            .putString(KEY_DEVICE_ID, credential.deviceId)
            .putString(KEY_EXPIRES_AT, credential.tokenExpiresAt.toString())
            .putString(KEY_TOKEN, encrypted.ciphertext)
            .putString(KEY_IV, encrypted.initializationVector)
            .remove(KEY_PENDING_REQUEST_ID)
            .remove(KEY_PENDING_CODE)
            .remove(KEY_PENDING_EXPIRES_AT)
            .remove(KEY_PENDING_SECRET)
            .remove(KEY_PENDING_IV)
            .apply()
    }

    fun loadPendingPairing(): PendingPairing? {
        val pending = runCatching {
            val requestId = preferences.getString(KEY_PENDING_REQUEST_ID, null) ?: return null
            val pairingCode = preferences.getString(KEY_PENDING_CODE, null) ?: return null
            val expiresAt = preferences.getString(KEY_PENDING_EXPIRES_AT, null)
                ?.let(Instant::parse)
                ?: return null
            val encryptedSecret = preferences.getString(KEY_PENDING_SECRET, null) ?: return null
            val initializationVector = preferences.getString(KEY_PENDING_IV, null) ?: return null
            PendingPairing(
                requestId = requestId,
                pairingCode = pairingCode,
                challengeSecret = decrypt(encryptedSecret, initializationVector),
                expiresAt = expiresAt
            )
        }.getOrElse {
            clearPendingPairing()
            null
        }
        if (pending?.isExpired() == true) {
            clearPendingPairing()
            return null
        }
        return pending
    }

    fun savePendingPairing(pairing: PendingPairing) {
        require(pairing.requestId.isNotBlank())
        require(pairing.pairingCode.matches(Regex("\\d{6}")))
        require(pairing.challengeSecret.isNotBlank())
        require(!pairing.isExpired())

        val encrypted = encrypt(pairing.challengeSecret)
        preferences.edit()
            .putString(KEY_PENDING_REQUEST_ID, pairing.requestId)
            .putString(KEY_PENDING_CODE, pairing.pairingCode)
            .putString(KEY_PENDING_EXPIRES_AT, pairing.expiresAt.toString())
            .putString(KEY_PENDING_SECRET, encrypted.ciphertext)
            .putString(KEY_PENDING_IV, encrypted.initializationVector)
            .apply()
    }

    fun clearPendingPairing() {
        preferences.edit()
            .remove(KEY_PENDING_REQUEST_ID)
            .remove(KEY_PENDING_CODE)
            .remove(KEY_PENDING_EXPIRES_AT)
            .remove(KEY_PENDING_SECRET)
            .remove(KEY_PENDING_IV)
            .apply()
    }

    fun clear() {
        preferences.edit().clear().apply()
    }

    private fun encrypt(value: String): EncryptedValue {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val initializationVector = cipher.iv
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return EncryptedValue(
            ciphertext = Base64.encodeToString(ciphertext, Base64.NO_WRAP),
            initializationVector = Base64.encodeToString(initializationVector, Base64.NO_WRAP)
        )
    }

    private fun decrypt(encryptedToken: String, initializationVector: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val iv = Base64.decode(initializationVector, Base64.NO_WRAP)
        val ciphertext = Base64.decode(encryptedToken, Base64.NO_WRAP)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
        return cipher.doFinal(ciphertext).toString(Charsets.UTF_8)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existingKey = keyStore.getKey(KEY_ALIAS, null)
        if (existingKey is SecretKey) {
            return existingKey
        }

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        )
        return keyGenerator.generateKey()
    }

    private fun resetCorruptStorage() {
        clear()
        resetKey()
    }

    private fun resetKey() {
        runCatching {
            KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
                .deleteEntry(KEY_ALIAS)
        }
    }

    private data class EncryptedValue(
        val ciphertext: String,
        val initializationVector: String
    )

    private companion object {
        const val PREFERENCES_NAME = "petwatch_device_credential"
        const val KEY_ALIAS = "petwatch_device_token_key"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_LENGTH_BITS = 128
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_EXPIRES_AT = "token_expires_at"
        const val KEY_TOKEN = "device_token"
        const val KEY_IV = "device_token_iv"
        const val KEY_PENDING_REQUEST_ID = "pending_pairing_request_id"
        const val KEY_PENDING_CODE = "pending_pairing_code"
        const val KEY_PENDING_EXPIRES_AT = "pending_pairing_expires_at"
        const val KEY_PENDING_SECRET = "pending_pairing_secret"
        const val KEY_PENDING_IV = "pending_pairing_secret_iv"
    }
}
