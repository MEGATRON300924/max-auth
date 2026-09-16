package ng.name.maxauth

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * MAX Auth client for Android public OAuth clients.
 *
 * Uses Authorization Code + S256 PKCE. Client secrets must never be shipped
 * in an Android application. Network calls should be made off the main thread.
 */
class MaxAuth(
    private val clientId: String,
    private val redirectUri: String,
    private val issuer: String = "https://auth.max-ai.name.ng"
) {
    data class AuthorizationRequest(
        val authorizationUrl: String,
        val codeVerifier: String,
        val state: String
    )

    data class TokenSet(
        val accessToken: String,
        val refreshToken: String?,
        val tokenType: String,
        val expiresIn: Long,
        val scope: String?,
        val idToken: String?
    )

    data class UserInfo(
        val subject: String,
        val name: String?,
        val username: String?,
        val email: String?,
        val emailVerified: Boolean?,
        val picture: String?
    )

    fun createAuthorizationRequest(scopes: List<String> = listOf("openid", "profile", "email")): AuthorizationRequest {
        val verifier = randomUrlSafe(64)
        val challenge = sha256Base64Url(verifier)
        val state = randomUrlSafe(32)
        val uri = Uri.parse("$issuer/api/v1/oauth/authorize").buildUpon()
            .appendQueryParameter("client_id", clientId)
            .appendQueryParameter("redirect_uri", redirectUri)
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("scope", scopes.joinToString(" "))
            .appendQueryParameter("state", state)
            .appendQueryParameter("code_challenge", challenge)
            .appendQueryParameter("code_challenge_method", "S256")
            .build()
        return AuthorizationRequest(uri.toString(), verifier, state)
    }

    fun isExpectedCallback(callbackUri: Uri, expectedState: String): Boolean {
        val expected = Uri.parse(redirectUri)
        return callbackUri.scheme == expected.scheme &&
            callbackUri.host == expected.host &&
            callbackUri.port == expected.port &&
            callbackUri.getQueryParameter("state") == expectedState
    }

    fun authorizationCode(callbackUri: Uri, expectedState: String): String {
        if (!isExpectedCallback(callbackUri, expectedState)) {
            throw MaxAuthException("Invalid OAuth callback state or redirect URI")
        }
        callbackUri.getQueryParameter("error")?.let { error ->
            throw MaxAuthException("MAX Auth authorization failed: $error")
        }
        return callbackUri.getQueryParameter("code")
            ?: throw MaxAuthException("MAX Auth callback did not contain an authorization code")
    }

    fun exchangeCode(code: String, codeVerifier: String): TokenSet {
        val body = form(
            "grant_type" to "authorization_code",
            "client_id" to clientId,
            "code" to code,
            "redirect_uri" to redirectUri,
            "code_verifier" to codeVerifier
        )
        return parseTokenSet(post("$issuer/api/v1/oauth/token", body))
    }

    fun refresh(refreshToken: String): TokenSet {
        val body = form(
            "grant_type" to "refresh_token",
            "client_id" to clientId,
            "refresh_token" to refreshToken
        )
        return parseTokenSet(post("$issuer/api/v1/oauth/token", body))
    }

    fun revoke(token: String) {
        post(
            "$issuer/api/v1/oauth/revoke",
            form("token" to token, "client_id" to clientId)
        )
    }

    fun userInfo(accessToken: String): UserInfo {
        val response = request("GET", "$issuer/api/v1/oauth/userinfo", null, accessToken)
        val json = JSONObject(response)
        return UserInfo(
            subject = json.getString("sub"),
            name = json.optStringOrNull("name"),
            username = json.optStringOrNull("preferred_username"),
            email = json.optStringOrNull("email"),
            emailVerified = if (json.has("email_verified")) json.optBoolean("email_verified") else null,
            picture = json.optStringOrNull("picture")
        )
    }

    fun saveTokenSet(context: Context, tokenSet: TokenSet) {
        SecureTokenStore(context, clientId).save(tokenSet)
    }

    fun loadTokenSet(context: Context): TokenSet? = SecureTokenStore(context, clientId).load()

    fun clearTokenSet(context: Context) = SecureTokenStore(context, clientId).clear()

    private fun post(url: String, body: String): String = request("POST", url, body, null)

    private fun request(method: String, url: String, body: String?, bearer: String?): String {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 20_000
            setRequestProperty("Accept", "application/json")
            if (bearer != null) setRequestProperty("Authorization", "Bearer $bearer")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            }
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val response = BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { it.readText() }
            if (status !in 200..299) {
                val message = runCatching { JSONObject(response).optString("message") }.getOrNull()
                throw MaxAuthException(message?.takeIf { it.isNotBlank() } ?: "MAX Auth request failed ($status)")
            }
            return response
        } finally {
            connection.disconnect()
        }
    }

    private fun parseTokenSet(response: String): TokenSet {
        val json = JSONObject(response)
        return TokenSet(
            accessToken = json.getString("access_token"),
            refreshToken = json.optStringOrNull("refresh_token"),
            tokenType = json.optString("token_type", "Bearer"),
            expiresIn = json.optLong("expires_in", 0),
            scope = json.optStringOrNull("scope"),
            idToken = json.optStringOrNull("id_token")
        )
    }

    private fun form(vararg values: Pair<String, String>): String =
        values.joinToString("&") { (key, value) ->
            "${URLEncoder.encode(key, "UTF-8")}=${URLEncoder.encode(value, "UTF-8")}"
        }

    private fun randomUrlSafe(bytes: Int): String {
        val data = ByteArray(bytes)
        SecureRandom().nextBytes(data)
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(data)
    }

    private fun sha256Base64Url(value: String): String =
        java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
            MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.US_ASCII))
        )
}

class MaxAuthException(message: String) : Exception(message)

private class SecureTokenStore(private val context: Context, private val clientId: String) {
    private val prefs = context.getSharedPreferences("max_auth_tokens", Context.MODE_PRIVATE)
    private val alias = "max_auth_$clientId"

    fun save(tokens: MaxAuth.TokenSet) {
        val json = JSONObject().apply {
            put("access_token", tokens.accessToken)
            put("refresh_token", tokens.refreshToken)
            put("token_type", tokens.tokenType)
            put("expires_in", tokens.expiresIn)
            put("scope", tokens.scope)
            put("id_token", tokens.idToken)
        }.toString()
        val encrypted = encrypt(json.toByteArray(StandardCharsets.UTF_8))
        prefs.edit().putString("token", Base64.encodeToString(encrypted, Base64.NO_WRAP)).apply()
    }

    fun load(): MaxAuth.TokenSet? {
        val encoded = prefs.getString("token", null) ?: return null
        return runCatching {
            val json = JSONObject(String(decrypt(Base64.decode(encoded, Base64.NO_WRAP)), StandardCharsets.UTF_8))
            MaxAuth.TokenSet(
                json.getString("access_token"),
                json.optStringOrNull("refresh_token"),
                json.optString("token_type", "Bearer"),
                json.optLong("expires_in", 0),
                json.optStringOrNull("scope"),
                json.optStringOrNull("id_token")
            )
        }.getOrNull()
    }

    fun clear() = prefs.edit().remove("token").apply()

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!store.containsAlias(alias)) {
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build())
            generator.generateKey()
        }
        return (store.getEntry(alias, null) as KeyStore.SecretKeyEntry).secretKey
    }

    private fun encrypt(value: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        return cipher.iv + cipher.doFinal(value)
    }

    private fun decrypt(value: ByteArray): ByteArray {
        val iv = value.copyOfRange(0, 12)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        return cipher.doFinal(value.copyOfRange(12, value.size))
    }
}

private fun JSONObject.optStringOrNull(name: String): String? =
    if (!has(name) || isNull(name)) null else optString(name).takeIf { it.isNotBlank() }
