import Foundation
import CryptoKit
import Security

public final class MaxAuth {
    public struct AuthorizationRequest {
        public let authorizationURL: URL
        public let codeVerifier: String
        public let state: String
    }

    public struct TokenSet: Codable, Sendable {
        public let accessToken: String
        public let refreshToken: String?
        public let tokenType: String
        public let expiresIn: Int
        public let scope: String?
        public let idToken: String?

        public init(accessToken: String, refreshToken: String?, tokenType: String, expiresIn: Int, scope: String?, idToken: String?) {
            self.accessToken = accessToken
            self.refreshToken = refreshToken
            self.tokenType = tokenType
            self.expiresIn = expiresIn
            self.scope = scope
            self.idToken = idToken
        }
    }

    public struct UserInfo: Codable, Sendable {
        public let subject: String
        public let name: String?
        public let username: String?
        public let email: String?
        public let emailVerified: Bool?
        public let picture: String?

        enum CodingKeys: String, CodingKey {
            case subject = "sub"
            case name
            case username = "preferred_username"
            case email
            case emailVerified = "email_verified"
            case picture
        }
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
        return url.scheme == expected.scheme && url.host == expected.host && url.port == expected.port &&
            URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "state" })?.value == state
    }

    public func authorizationCode(from callback: URL, state: String) throws -> String {
        guard isExpectedCallback(callback, state: state) else { throw MaxAuthError.invalidCallback }
        let components = URLComponents(url: callback, resolvingAgainstBaseURL: false)
        if let error = components?.queryItems?.first(where: { $0.name == "error" })?.value {
            throw MaxAuthError.authorizationFailed(error)
        }
        guard let code = components?.queryItems?.first(where: { $0.name == "code" })?.value else {
            throw MaxAuthError.missingAuthorizationCode
        }
        return code
    }

    public func exchangeCode(code: String, codeVerifier: String) async throws -> TokenSet {
        var request = URLRequest(url: URL(string: "\(issuer)/api/v1/oauth/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = form([
            ("grant_type", "authorization_code"),
            ("client_id", clientID),
            ("code", code),
            ("redirect_uri", redirectURI),
            ("code_verifier", codeVerifier)
        ])
        return try await perform(request, as: TokenSet.self)
    }

    public func refresh(refreshToken: String) async throws -> TokenSet {
        var request = URLRequest(url: URL(string: "\(issuer)/api/v1/oauth/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = form([
            ("grant_type", "refresh_token"),
            ("client_id", clientID),
            ("refresh_token", refreshToken)
        ])
        return try await perform(request, as: TokenSet.self)
    }

    public func revoke(token: String) async throws {
        var request = URLRequest(url: URL(string: "\(issuer)/api/v1/oauth/revoke")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = form([("token", token), ("client_id", clientID)])
        _ = try await URLSession.shared.data(for: request)
    }

    public func userInfo(accessToken: String) async throws -> UserInfo {
        var request = URLRequest(url: URL(string: "\(issuer)/api/v1/oauth/userinfo")!)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return try await perform(request, as: UserInfo.self)
    }

    public func saveTokenSet(_ tokenSet: TokenSet) throws {
        let data = try JSONEncoder().encode(tokenSet)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "MAXAuth",
            kSecAttrAccount as String: clientID,
            kSecValueData as String: data
        ]
        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw MaxAuthError.keychain(status) }
    }

    public func loadTokenSet() throws -> TokenSet? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "MAXAuth",
            kSecAttrAccount as String: clientID,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw MaxAuthError.keychain(status) }
        return try JSONDecoder().decode(TokenSet.self, from: data)
    }

    public func clearTokenSet() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "MAXAuth",
            kSecAttrAccount as String: clientID
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw MaxAuthError.keychain(status) }
    }

    private func perform<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw MaxAuthError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw MaxAuthError.http(http.statusCode, message ?? "MAX Auth request failed")
        }
        return try JSONDecoder().decode(type, from: data)
    }

    private func form(_ values: [(String, String)]) -> Data? {
        values.map { "\($0.0.urlEncoded)=\($0.1.urlEncoded)" }.joined(separator: "&").data(using: .utf8)
    }

    private static func randomURLSafe(length: Int) -> String {
        let alphabet = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        return String((0..<length).compactMap { _ in alphabet.randomElement() })
    }

    private static func sha256Base64URL(_ value: String) -> String {
        let digest = SHA256.hash(data: Data(value.utf8))
        return Data(digest).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

public enum MaxAuthError: Error {
    case invalidCallback
    case authorizationFailed(String)
    case missingAuthorizationCode
    case invalidResponse
    case http(Int, String)
    case keychain(OSStatus)
}

private extension String {
    var urlEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+="))) ?? self
    }
}
