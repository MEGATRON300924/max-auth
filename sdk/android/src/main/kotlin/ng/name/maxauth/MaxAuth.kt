package ng.name.maxauth

import android.net.Uri
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * Small dependency-free MAX Auth PKCE helper for Android public clients.
 * Open authorizationUrl in a Custom Tab and handle the registered redirect URI.
 */
class MaxAuth(
    private val clientId: String,
    private val redirectUri: String,
    private val issuer: String = "https://auth.max-ai.name.ng"
) {
    data class AuthorizationRequest(val authorizationUrl: String, val codeVerifier: String, val state: String)

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

    fun isExpectedCallback(callbackUri: Uri, expectedState: String): Boolean =
        callbackUri.scheme == Uri.parse(redirectUri).scheme &&
            callbackUri.host == Uri.parse(redirectUri).host &&
            callbackUri.getQueryParameter("state") == expectedState

    private fun randomUrlSafe(bytes: Int): String {
        val data = ByteArray(bytes)
        SecureRandom().nextBytes(data)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data)
    }

    private fun sha256Base64Url(value: String): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(
            MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.US_ASCII))
        )
}
