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
                        BL.CustKey AS CustomerKey,
                        C.Customer_Name AS CustomerName,
                        BL.ItemKey AS ProductKey,
                        P.Desc1 AS ProductName,
                        BL.[CREATED_DATE] AS ProductionDate,
                        BL.[PACKSIZE1] AS NetWeight,
                        BL.[PACKUNIT1],
                        BL.[PACKSIZE2],
                        BL.[PACKUNIT2],
                        BL.[TOTAL_UNIT2_IN_UNIT1] AS TotalBags,
                        BL.[SHELFLIFE_MONTH],
                        BL.[SHELFLIFE_DAY],
                        BL.[DESCRIPTION] AS PrintableDesc,
                        C.Address_1,
                        C.Address_2,
                        C.Address_3,
                        C.City,
                        C.State,
                        C.Zip_Code,
                        DATEADD(MONTH, BL.[SHELFLIFE_MONTH], BL.[CREATED_DATE]) AS DateExpiry,
                        DATEADD(DAY, BL.[SHELFLIFE_DAY], DATEADD(MONTH, BL.[SHELFLIFE_MONTH], BL.[CREATED_DATE])) AS FinalExpiryDate
                    FROM [TFCPILOT2].[FgL].[BME_LABEL] BL
                    LEFT JOIN [TFCPILOT2].[dbo].[ARCUST] C ON BL.CustKey = C.Customer_Key
                    LEFT JOIN [TFCPILOT2].[dbo].[INMAST] P ON BL.ItemKey = P.ItemKey
                    WHERE BL.BatchNo = @BatchNo OR BL.[LOT CODE] = @BatchNo";

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