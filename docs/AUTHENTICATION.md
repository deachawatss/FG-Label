# FG Label System Authentication

## Overview

The FG Label System now supports dual authentication methods:

1. **SQL Database Authentication** (Primary)
2. **Active Directory (LDAP) Authentication** (Fallback)

## Authentication Flow

When a user attempts to login, the system follows this sequence:

1. **Development Mode**: If `ASPNETCORE_ENVIRONMENT` is set to "Development" or "dev", authentication is bypassed
2. **SQL Authentication**: First, the system attempts to authenticate against the SQL database
3. **LDAP Fallback**: If SQL authentication fails, the system falls back to LDAP authentication

## SQL Database Authentication

### User Table Structure

The system uses the `[FgL].[User]` table with the following structure:

```sql
CREATE TABLE [FgL].[User](
    [UserID] [int] IDENTITY(1,1) NOT NULL,
    [Username] [nvarchar](50) NOT NULL,
    [ADUsername] [nvarchar](100) NULL,
    [Email] [nvarchar](255) NULL,
    [FullName] [nvarchar](255) NULL,
    [Department] [nvarchar](100) NULL,
    [Position] [nvarchar](100) NULL,
    [Role] [nvarchar](50) NOT NULL DEFAULT 'User',
    [IsActive] [bit] NOT NULL DEFAULT 1,
    [LastLogin] [datetime2](7) NULL,
    [CreatedAt] [datetime2](7) NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] [datetime2](7) NULL,
    [Password] [nvarchar](255) NULL
)
```

### Sample Users

The system comes with these default users:

| Username | Password | Role | Full Name |
|----------|----------|------|-----------|
| staff01 | 1234 | User | Staff User 01 |
| admin | admin123 | Admin | System Administrator |
| manager | manager123 | Manager | Production Manager |

### Features

- **Password Storage**: Currently uses plain text (should be hashed in production)
- **Role-based Access**: Supports User, Admin, Manager roles
- **Last Login Tracking**: Automatically updates when user logs in
- **Active Status**: Users can be deactivated without deletion

## LDAP Authentication

### Configuration

LDAP authentication is configured in `appsettings.json`:

```json
{
  "ActiveDirectory": {
    "Url": "ldap://192.168.0.1",
    "BaseDn": "DC=NWFTH,DC=com",
    "Username": "service_account@domain.com",
    "Password": "service_password"
  }
}
```

### Features

- **Domain Auto-append**: Automatically appends `@newlywedsfoods.co.th` if no domain is specified
- **Timeout Protection**: 5-second timeout to prevent hanging
- **Fallback Support**: Only used when SQL authentication fails

## API Endpoints

### POST /api/auth/login

Authenticates a user and returns a JWT token.

**Request:**
```json
{
  "username": "staff01",
  "password": "1234"
}
```

**Response (SQL User):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "username": "staff01",
    "fullName": "Staff User 01",
    "email": null,
    "department": null,
    "position": null,
    "role": "User"
  }
}
```

**Response (LDAP User):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "username": "ldap_user"
  }
}
```

### GET /api/me

Returns current user information (requires authentication).

**Response:**
```json
{
  "username": "staff01",
  "fullName": "Staff User 01",
  "email": null,
  "department": null,
  "position": null,
  "role": "User",
  "lastLogin": "2025-01-23T10:30:00Z"
}
```

## Setup Instructions

### 1. Database Setup

Run the SQL script to create the User table:

```bash
sqlcmd -S your_server -d TFCPILOT2 -i database/create_user_table.sql
```

### 2. Configuration

Ensure your `appsettings.json` has the correct connection string:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=your_server;Database=TFCPILOT2;User ID=your_user;Password=your_password;TrustServerCertificate=True;"
  }
}
```

### 3. Environment Variables

For production, consider using environment variables:

```bash
export ConnectionStrings__DefaultConnection="your_connection_string"
export LDAP__Url="ldap://your_ldap_server"
export LDAP__DefaultDomain="your_domain.com"
```

## Security Considerations

### Current Implementation

- ⚠️ **Plain Text Passwords**: Currently stored in plain text
- ✅ **JWT Tokens**: Secure token-based authentication
- ✅ **HTTPS**: Should be used in production
- ✅ **Input Validation**: SQL injection protection

### Recommended Improvements

1. **Password Hashing**: Implement bcrypt or similar
2. **Account Lockout**: Prevent brute force attacks
3. **Password Policies**: Enforce strong passwords
4. **Audit Logging**: Track authentication attempts
5. **Session Management**: Implement proper session handling

## Troubleshooting

### Common Issues

1. **SQL Connection Failed**: Check connection string and database availability
2. **LDAP Timeout**: Verify LDAP server accessibility and credentials
3. **User Not Found**: Ensure user exists and `IsActive = 1`
4. **Invalid Password**: Check password case sensitivity

### Logging

The system logs authentication attempts at various levels:

- **Debug**: Detailed authentication flow
- **Info**: Successful authentications
- **Warning**: Failed authentication attempts
- **Error**: System errors during authentication

### Testing

You can test authentication using curl:

```bash
# Test SQL authentication
curl -X POST http://localhost:5051/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"staff01","password":"1234"}'

# Test user info
curl -X GET http://localhost:5051/api/me \
  -H "Authorization: Bearer YOUR_TOKEN"
``` 