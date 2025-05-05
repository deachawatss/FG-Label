using System;
using System.Data;
using Microsoft.Data.SqlClient;
using System.Threading.Tasks;
using Dapper;
using FgLabel.Shared.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace FgLabel.Api.Repositories
{
    public interface IBatchRepository
    {
        Task<BatchInfo?> GetBatchInfoAsync(string batchNo);
    }

    public class BatchRepository : IBatchRepository
    {
        private readonly string _connectionString;
        private readonly ILogger<BatchRepository> _logger;

        public BatchRepository(IConfiguration configuration, ILogger<BatchRepository> logger)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection") ?? 
                throw new ArgumentNullException(nameof(configuration), "Connection string 'DefaultConnection' not found.");
            _logger = logger;
        }

        public async Task<BatchInfo?> GetBatchInfoAsync(string batchNo)
        {
            try
            {
                Console.WriteLine($"[FgLabel] Connecting to database with connection string: {_connectionString}");
                using var connection = new SqlConnection(_connectionString);
                await connection.OpenAsync();
                Console.WriteLine($"[FgLabel] Database connection successful");

                Console.WriteLine($"[FgLabel] Executing SQL query for BatchNo: {batchNo}");
                const string sql = @"
                    SELECT 
                        BatchNo,
                        ProductionDate,
                        NetWeight,
                        TotalBags,
                        ProductKey,
                        ProductName,
                        PrintableDesc,
                        UPCCODE,
                        CustomerKey,
                        Customer_Name AS CustomerName,
                        Address_1,
                        Address_2,
                        Address_3,
                        City,
                        State,
                        Zip_Code,
                        DateExpiry,
                        FinalExpiryDate
                    FROM FgL.vw_Label_BatchInfo 
                    WHERE BatchNo = @BatchNo";

                Console.WriteLine($"[FgLabel] SQL Query: {sql}");
                Console.WriteLine($"[FgLabel] Parameters: BatchNo = {batchNo}");

                var result = await connection.QueryFirstOrDefaultAsync<BatchInfo>(sql, new { BatchNo = batchNo });
                Console.WriteLine($"[FgLabel] Query executed successfully. Result found: {result != null}");
                
                if (result == null)
                {
                    Console.WriteLine($"[FgLabel] No data found for BatchNo: {batchNo}");
                }
                else
                {
                    Console.WriteLine($"[FgLabel] Retrieved data: {System.Text.Json.JsonSerializer.Serialize(result)}");
                }
                
                return result;
            }
            catch (SqlException ex)
            {
                Console.WriteLine($"[FgLabel] SQL Error executing query for BatchNo: {batchNo}");
                Console.WriteLine($"[FgLabel] SQL Error Number: {ex.Number}");
                Console.WriteLine($"[FgLabel] SQL Error Message: {ex.Message}");
                Console.WriteLine($"[FgLabel] SQL Error StackTrace: {ex.StackTrace}");
                throw;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FgLabel] Error executing SQL query for BatchNo: {batchNo}");
                Console.WriteLine($"[FgLabel] Error Type: {ex.GetType().Name}");
                Console.WriteLine($"[FgLabel] Error Message: {ex.Message}");
                Console.WriteLine($"[FgLabel] Error StackTrace: {ex.StackTrace}");
                throw;
            }
        }
    }
} 