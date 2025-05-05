using System.Data;
using Microsoft.Data.SqlClient;

namespace FgLabel.Api.Services
{
    public interface ISqlConnectionFactory
    {
        SqlConnection GetConnection();
    }

    public class SqlConnectionFactory : ISqlConnectionFactory
    {
        private readonly string _connectionString;

        public SqlConnectionFactory(string connectionString)
        {
            _connectionString = connectionString;
        }

        public SqlConnection GetConnection()
        {
            return new SqlConnection(_connectionString);
        }
    }
} 