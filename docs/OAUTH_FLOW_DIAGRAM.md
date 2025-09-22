# OAuth 2.0 Flow Architecture

## Complete OAuth Flow Diagram

```mermaid
sequenceDiagram
    participant User as User Browser
    participant Frontend as React Frontend
    participant Backend as Node.js Backend
    participant DB as Encrypted Database
    participant SFMC as Marketing Cloud

    Note over User,SFMC: 1. Initial Login Flow
    User->>Frontend: Visit /setup
    Frontend->>User: Show subdomain input form
    User->>Frontend: Enter subdomain + click "Login"
    Frontend->>Backend: POST /api/auth/start {subdomain}
    
    Backend->>DB: Check if company exists
    alt Company not found
        Backend->>DB: Create new company record
    end
    
    Backend->>Backend: Generate secure state parameter
    Backend->>Backend: Store state in session
    Backend->>Frontend: Return authUrl with state
    Frontend->>User: Redirect to SFMC OAuth

    Note over User,SFMC: 2. SFMC Authorization
    User->>SFMC: Authorize application
    SFMC->>Backend: Redirect to /auth/callback?code=xxx&state=yyy
    
    Note over User,SFMC: 3. Token Exchange & Storage
    Backend->>Backend: Validate state parameter
    Backend->>SFMC: Exchange code for access_token + refresh_token
    SFMC->>Backend: Return tokens + user info
    
    Backend->>DB: Encrypt and store refresh_token
    Backend->>DB: Store access_token in session
    Backend->>DB: Update company OAuth config
    Backend->>Frontend: Set secure session cookie
    Frontend->>User: Redirect to /explorer

    Note over User,SFMC: 4. API Calls with Session Auth
    User->>Frontend: Use application features
    Frontend->>Backend: API call with session cookie
    Backend->>Backend: Check session validity
    
    alt Token expired
        Backend->>DB: Get encrypted refresh_token
        Backend->>Backend: Decrypt refresh_token
        Backend->>SFMC: Refresh access_token
        SFMC->>Backend: New access_token
        Backend->>DB: Update session with new token
    end
    
    Backend->>SFMC: API call with valid token
    SFMC->>Backend: Return data
    Backend->>Frontend: Return data
    Frontend->>User: Display results

    Note over User,SFMC: 5. Logout Flow
    User->>Frontend: Click logout
    Frontend->>Backend: POST /api/auth/logout
    Backend->>SFMC: Revoke refresh_token (optional)
    Backend->>DB: Clear session data
    Backend->>Frontend: Clear session cookie
    Frontend->>User: Redirect to /setup
```

## Security Flow Details

### State Parameter Validation
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   1. Generate   │    │   2. Store in    │    │   3. Validate   │
│   Random State  │───▶│   Session        │───▶│   on Callback   │
│                 │    │                  │    │                 │
│ crypto.random   │    │ req.session.     │    │ req.query.state │
│ Bytes(32)       │    │ oauthState       │    │ === session     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Token Storage & Encryption
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Raw Tokens     │    │   AES Encryption │    │   Database      │
│                 │    │                  │    │                 │
│ refresh_token   │───▶│ encrypt(token,   │───▶│ encrypted_      │
│ client_secret   │    │ ENCRYPTION_KEY)  │    │ refresh_token   │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Session Management
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   HTTP Cookie   │    │   Session Store  │    │   Database      │
│                 │    │                  │    │                 │
│ sessionId       │───▶│ in-memory or     │───▶│ sessions table  │
│ httpOnly: true  │    │ Redis (prod)     │    │ session_data    │
│ secure: true    │    │                  │    │                 │
│ sameSite: lax   │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Multi-Tenant Isolation

Each company has completely isolated:
- OAuth configuration (subdomain, client_id, encrypted client_secret)
- Session data and tokens
- API usage tracking
- User permissions and plan limits

```
Company A                    Company B
┌─────────────┐             ┌─────────────┐
│ Sessions    │             │ Sessions    │
│ - session_1 │             │ - session_3 │
│ - session_2 │             │ - session_4 │
│             │             │             │
│ OAuth Config│             │ OAuth Config│
│ - subdomain │             │ - subdomain │
│ - client_id │             │ - client_id │
│ - encrypted │             │ - encrypted │
│   secrets   │             │   secrets   │
└─────────────┘             └─────────────┘
```

## Error Handling & Edge Cases

### Invalid State Parameter
```
User tries to access callback with tampered state
└─► Backend validates state !== session.oauthState
    └─► Return 400 error, redirect to login
        └─► Clear session data for security
```

### Expired Refresh Token
```
API call fails with 401
└─► Attempt token refresh
    └─► Refresh token expired/invalid
        └─► Clear session, redirect to login
            └─► User must re-authorize
```

### Network Failures
```
Token exchange fails
└─► Retry with exponential backoff (3x)
    └─► Log error for monitoring
        └─► Show user-friendly error message
            └─► Allow retry from setup page
```

This OAuth implementation follows industry best practices and is designed for enterprise security requirements, including Salesforce AppExchange compliance.
