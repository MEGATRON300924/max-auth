import Foundation
import CryptoKit

public final class MaxAuth {
    public struct AuthorizationRequest {
        public let authorizationURL: URL
        public let codeVerifier: String
        public let state: String
    }

    private let clientID: String
    private let redirectURI: String
    private let issuer: String

    public init(clientID: String, redirectURI: String, issuer: String = "https://auth.max-ai.name.ng") {
        self.clientID = clientID
        self.redirectURI = redirectURI
        self.issuer = issuer
    }

    public func createAuthorizationRequest(scopes: [String] = ["openid", "profile", "email"]) -> AuthorizationRequest {
        let verifier = Self.randomURLSafe(length: 64)
        let challenge = Self.sha256Base64URL(verifier)
        let state = Self.randomURLSafe(length: 32)
        var components = URLComponents(string: "\(issuer)/api/v1/oauth/authorize")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: scopes.joined(separator: " ")),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256")
        ]
        return AuthorizationRequest(authorizationURL: components.url!, codeVerifier: verifier, state: state)
    }

    public func isExpectedCallback(_ url: URL, state: String) -> Bool {
        guard let expected = URL(string: redirectURI) else { return false }
        return url.scheme == expected.scheme && url.host == expected.host &&
            URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "state" })?.value == state
    }

    private static func randomURLSafe(length: Int) -> String {
        let alphabet = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        return String((0..<length).compactMap { _ in alphabet.randomElement() })
    }

    private static func sha256Base64URL(_ value: String) -> String {
        let digest = SHA256.hash(data: Data(value.utf8))
        return Data(digest).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
