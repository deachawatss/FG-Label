using System.Data.SqlClient;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using System.Security.Cryptography;
using System.Text;

namespace FgLabel.Api.Services
{
    public class UserConfig
    {
        public string ConnectionString { get; set; } = string.Empty;
    }

    public class UserInfo
    {
        public int UserID { get; set; }
        public string Username { get; set; } = string.Empty;
        public string? ADUsername { get; set; }
        public string? Email { get; set; }
        public string? FullName { get; set; }
        public string? Department { get; set; }
        public string? Position { get; set; }
        public string Role { get; set; } = "User";
        public bool IsActive { get; set; }
        public DateTime? LastLogin { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public interface IUserService
    {
        Task<UserInfo?> ValidateUserAsync(string username, string password);
        Task<UserInfo?> GetUserByUsernameAsync(string username);
        Task<bool> UpdateLastLoginAsync(string username);
    }

    public class UserService : IUserService
    {
        private readonly UserConfig _config;
        private readonly ILogger<UserService> _logger;

        public UserService(IOptions<UserConfig> config, ILogger<UserService> logger)
        {
            _config = config.Value;
            _logger = logger;
        }

        public async Task<UserInfo?> ValidateUserAsync(string username, string password)
        {
            try
            {
                _logger.LogDebug("Validating user credentials for: {Username}", username);

                using var connection = new SqlConnection(_config.ConnectionString);
                await connection.OpenAsync();

                const string query = @"
                    SELECT [UserID], [Username], [ADUsername], [Email], [FullName], 
                           [Department], [Position], [Role], [IsActive], [LastLogin], 
                           [CreatedAt], [UpdatedAt], [Password]
                    FROM [FgL].[User] 
                    WHERE [Username] = @Username AND [IsActive] = 1";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@Username", username);

                using var reader = await command.ExecuteReaderAsync();
                
                if (await reader.ReadAsync())
                {
                    var storedPassword = reader["Password"]?.ToString();
                    
                    // Simple password comparison (you might want to use hashing in production)
                    if (storedPassword == password)
                    {
                        var userInfo = new UserInfo
                        {
                            UserID = reader.GetInt32(reader.GetOrdinal("UserID")),
                            Username = reader.GetString(reader.GetOrdinal("Username")),
                            ADUsername = reader.IsDBNull(reader.GetOrdinal("ADUsername")) ? null : reader.GetString(reader.GetOrdinal("ADUsername")),
                            Email = reader.IsDBNull(reader.GetOrdinal("Email")) ? null : reader.GetString(reader.GetOrdinal("Email")),
                            FullName = reader.IsDBNull(reader.GetOrdinal("FullName")) ? null : reader.GetString(reader.GetOrdinal("FullName")),
                            Department = reader.IsDBNull(reader.GetOrdinal("Department")) ? null : reader.GetString(reader.GetOrdinal("Department")),
                            Position = reader.IsDBNull(reader.GetOrdinal("Position")) ? null : reader.GetString(reader.GetOrdinal("Position")),
                            Role = reader.GetString(reader.GetOrdinal("Role")),
                            IsActive = reader.GetBoolean(reader.GetOrdinal("IsActive")),
                            LastLogin = reader.IsDBNull(reader.GetOrdinal("LastLogin")) ? null : reader.GetDateTime(reader.GetOrdinal("LastLogin")),
                            CreatedAt = reader.GetDateTime(reader.GetOrdinal("CreatedAt")),
                            UpdatedAt = reader.IsDBNull(reader.GetOrdinal("UpdatedAt")) ? null : reader.GetDateTime(reader.GetOrdinal("UpdatedAt"))
                        };

                        _logger.LogInformation("SQL authentication successful for user: {Username}", username);
                        return userInfo;
                    }
                    else
                    {
                        _logger.LogWarning("Invalid password for user: {Username}", username);
                    }
                }
                else
                {
                    _logger.LogDebug("User not found in database: {Username}", username);
                }

                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during SQL user validation for user {Username}: {Message}", username, ex.Message);
                return null;
            }
        }

        public async Task<UserInfo?> GetUserByUsernameAsync(string username)
        {
            try
            {
                using var connection = new SqlConnection(_config.ConnectionString);
                await connection.OpenAsync();

                const string query = @"
                    SELECT [UserID], [Username], [ADUsername], [Email], [FullName], 
                           [Department], [Position], [Role], [IsActive], [LastLogin], 
                           [CreatedAt], [UpdatedAt]
                    FROM [FgL].[User] 
                    WHERE [Username] = @Username AND [IsActive] = 1";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@Username", username);

                using var reader = await command.ExecuteReaderAsync();
                
                if (await reader.ReadAsync())
                {
                    return new UserInfo
                    {
                        UserID = reader.GetInt32(reader.GetOrdinal("UserID")),
                        Username = reader.GetString(reader.GetOrdinal("Username")),
                        ADUsername = reader.IsDBNull(reader.GetOrdinal("ADUsername")) ? null : reader.GetString(reader.GetOrdinal("ADUsername")),
                        Email = reader.IsDBNull(reader.GetOrdinal("Email")) ? null : reader.GetString(reader.GetOrdinal("Email")),
                        FullName = reader.IsDBNull(reader.GetOrdinal("FullName")) ? null : reader.GetString(reader.GetOrdinal("FullName")),
                        Department = reader.IsDBNull(reader.GetOrdinal("Department")) ? null : reader.GetString(reader.GetOrdinal("Department")),
                        Position = reader.IsDBNull(reader.GetOrdinal("Position")) ? null : reader.GetString(reader.GetOrdinal("Position")),
                        Role = reader.GetString(reader.GetOrdinal("Role")),
                        IsActive = reader.GetBoolean(reader.GetOrdinal("IsActive")),
                        LastLogin = reader.IsDBNull(reader.GetOrdinal("LastLogin")) ? null : reader.GetDateTime(reader.GetOrdinal("LastLogin")),
                        CreatedAt = reader.GetDateTime(reader.GetOrdinal("CreatedAt")),
                        UpdatedAt = reader.IsDBNull(reader.GetOrdinal("UpdatedAt")) ? null : reader.GetDateTime(reader.GetOrdinal("UpdatedAt"))
                    };
                }

                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting user by username {Username}: {Message}", username, ex.Message);
                return null;
            }
        }

        public async Task<bool> UpdateLastLoginAsync(string username)
        {
            try
            {
                using var connection = new SqlConnection(_config.ConnectionString);
                await connection.OpenAsync();

                const string query = @"
                    UPDATE [FgL].[User] 
                    SET [LastLogin] = @LastLogin, [UpdatedAt] = @UpdatedAt
                    WHERE [Username] = @Username";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@Username", username);
                command.Parameters.AddWithValue("@LastLogin", DateTime.UtcNow);
                command.Parameters.AddWithValue("@UpdatedAt", DateTime.UtcNow);

                var rowsAffected = await command.ExecuteNonQueryAsync();
                return rowsAffected > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating last login for user {Username}: {Message}", username, ex.Message);
                return false;
            }
        }
    }
} 