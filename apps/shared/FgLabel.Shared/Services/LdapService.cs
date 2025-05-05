using System.DirectoryServices.Protocols;
using System.Net;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;

namespace FgLabel.Shared.Services;

public class LdapConfig
{
    public string Url { get; set; } = string.Empty;
    public string BaseDn { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 5;
    public string DefaultDomain { get; set; } = "newlywedsfoods.co.th";
}

public interface ILdapService
{
    bool ValidateUser(string username, string password);
    bool TestConnection();
}

public class LdapService : ILdapService
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
            if (!username.Contains("@") && !string.IsNullOrEmpty(_config.DefaultDomain))
            {
                username += $"@{_config.DefaultDomain}";
                _logger.LogDebug("Username modified to include domain: {Username}", username);
            }

            _logger.LogDebug("LDAP validation for user: {Username} using URL: {Url}", username, _config.Url);
            if (string.IsNullOrEmpty(_config.Url))
            {
                _logger.LogError("LDAP URL is empty");
                return false;
            }

            var server = _config.Url;
            if (server.StartsWith("ldap://", StringComparison.OrdinalIgnoreCase))
            {
                server = new Uri(server).Host;
            }

            var identifier = new LdapDirectoryIdentifier(server, 389);
            var connection = new LdapConnection(identifier, new NetworkCredential(username, password), AuthType.Basic);
            
            connection.Timeout = TimeSpan.FromSeconds(_config.TimeoutSeconds);
            
            connection.SessionOptions.ProtocolVersion = 3;
            connection.SessionOptions.SecureSocketLayer = false;
            
            _logger.LogDebug("Connecting to LDAP for validation...");
            connection.Bind();
            _logger.LogDebug("LDAP validation successful for: {Username}", username);
            return true;
        }
        catch (LdapException ex)
        {
            _logger.LogError(ex, "LDAP authentication failed for user {Username}: {Message}", username, ex.Message);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during LDAP authentication for user {Username}: {Message}", username, ex.Message);
            return false;
        }
    }

    public bool TestConnection()
    {
        try
        {
            _logger.LogDebug("Testing LDAP connection to {Url} with user {Username}", _config.Url, _config.Username);
            if (string.IsNullOrEmpty(_config.Url))
            {
                _logger.LogError("LDAP URL is empty during test connection");
                return false;
            }

            var server = _config.Url;
            if (server.StartsWith("ldap://", StringComparison.OrdinalIgnoreCase))
            {
                server = new Uri(server).Host;
            }

            var identifier = new LdapDirectoryIdentifier(server, 389);
            var connection = new LdapConnection(identifier, new NetworkCredential(_config.Username, _config.Password), AuthType.Basic);
            
            connection.Timeout = TimeSpan.FromSeconds(_config.TimeoutSeconds);
            
            connection.SessionOptions.ProtocolVersion = 3;
            connection.SessionOptions.SecureSocketLayer = false;
            
            _logger.LogDebug("Binding to LDAP for connection test...");
            connection.Bind();
            _logger.LogInformation("LDAP connection test successful");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "LDAP connection test failed: {Message}", ex.Message);
            return false;
        }
    }
} 