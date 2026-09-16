# MAX Identity Mobile SDK

The MAX Identity mobile SDK uses OAuth 2.0 Authorization Code with S256 PKCE. Mobile applications are public clients: **never ship a MAX client secret inside an Android or iOS app**.

## Android

Register an **Android app** in MAX Developers and provide:

- Package name
- SHA-256 signing certificate fingerprint(s)
- A custom-scheme redirect URI such as `com.example.app://oauth/callback`

Use `sdk/android` to build the authorization request. Open the returned URL in a browser/Custom Tab and deliver the callback URI back to the SDK.

## iOS

Register an **iPhone & iPad app** and provide:

- Bundle ID
- A custom-scheme redirect URI such as `myapp://oauth/callback`

The iOS helper in `sdk/ios` creates the same PKCE authorization request.

## Flow

1. Generate a PKCE verifier and S256 challenge.
2. Open MAX Auth's authorization endpoint.
3. User signs in at MAX Auth.
4. MAX Auth redirects to the registered mobile URI with an authorization code.
5. Exchange the code at the MAX Auth token endpoint using the verifier.
6. Store tokens in the platform secure storage (Android Keystore / iOS Keychain).

Discovery and token endpoints are exposed by MAX Auth, so applications do not need to hard-code provider-specific implementation details beyond the issuer URL.
