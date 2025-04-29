#nullable enable
using System;
using System.DirectoryServices.Protocols;
using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Services;

public class LdapConfig
{
    public string Url { get; set; } = string.Empty;
    public string BaseDn { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LdapService
{
    private readonly LdapConfig _config;
    private readonly ILogger<LdapService> _logger;

    public LdapService(IOptions<LdapConfig> config, ILogger<LdapService> logger)
    {
        _config = config.Value;
        _logger = logger;
    }

    public bool ValidateUser(string username, string password)
    {
        try
        {
            if (!username.Contains("@"))
            {
                username += "@newlywedsfoods.co.th";
            }
            _logger.LogInformation("[LDAP DEBUG] URL: {Url}, Username: {Username}, BaseDn: {BaseDn}", _config.Url, username, _config.BaseDn);

            // Prepare LDAP server address without scheme and default port
            var server = _config.Url;
            if (server.StartsWith("ldap://", StringComparison.OrdinalIgnoreCase))
            {
                server = new Uri(server).Host;
            }
            var identifier = new LdapDirectoryIdentifier(server);
            var ldapConnection = new LdapConnection(identifier)
            {
                AuthType = AuthType.Basic,
                Credential = new NetworkCredential(username, password)
            };
            // Use LDAP protocol version 3 and disable SSL
            ldapConnection.SessionOptions.ProtocolVersion = 3;
            ldapConnection.SessionOptions.SecureSocketLayer = false;

            ldapConnection.Bind();
            _logger.LogInformation("User {Username} authenticated successfully", username);
            return true;
        }
        catch (LdapException ex)
        {
            _logger.LogError(ex, "[LDAP DEBUG] Failed to authenticate user {Username}. Message: {Message}", username, ex.Message);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[LDAP DEBUG] Unexpected error for user {Username}. Message: {Message}", username, ex.Message);
            return false;
        }
    }
}