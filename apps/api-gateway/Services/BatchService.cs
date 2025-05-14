using System.Collections.Generic;
using System.Data;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using FgLabel.Api.Models;

namespace FgLabel.Api.Services;

public class BatchService : IBatchService
{
    private readonly string _connectionString;
    private readonly ILogger<BatchService> _logger;

    public BatchService(IConfiguration configuration, ILogger<BatchService> logger)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("SQL connection string missing");
        _logger = logger;
    }

    public async Task<BatchInfoDto> GetBatchInfo(int batchId)
    {
        using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
            SELECT 
                b.BatchId,
                b.BatchName,
                b.Status,
                b.CreatedAt,
                b.UpdatedAt,
                COUNT(l.LabelId) as TotalLabels,
                SUM(CASE WHEN l.Status = 'Printed' THEN 1 ELSE 0 END) as PrintedLabels
            FROM Batches b
            LEFT JOIN Labels l ON b.BatchId = l.BatchId
            WHERE b.BatchId = @BatchId
            GROUP BY b.BatchId, b.BatchName, b.Status, b.CreatedAt, b.UpdatedAt";

        var parameters = new { BatchId = batchId };

        try
        {
            var result = await connection.QuerySingleOrDefaultAsync<BatchInfoDto>(sql, parameters);

            if (result == null)
            {
                _logger.LogWarning("Batch {BatchId} not found", batchId);
                throw new KeyNotFoundException($"Batch with ID {batchId} not found");
            }

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving batch info for BatchId {BatchId}", batchId);
            throw;
        }
    }

    public async Task<IEnumerable<BatchDto>> GetCurrentBatchesAsync()
    {
        using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var batches = await connection.QueryAsync<BatchDto>(
            @"SELECT TOP 50 
                BatchNo, 
                ItemKey as ProductKey, 
                CustKey as CustomerKey, 
                ProductionDate 
              FROM FgL.vw_Label_PrintSummary 
              WHERE ProductionDate IS NOT NULL
                AND BatchNo <> '999999'
                AND CustKey IS NOT NULL
                AND ItemKey IS NOT NULL
              ORDER BY ProductionDate DESC");

        _logger.LogInformation("Retrieved {Count} current batches", batches.Count());
        return batches;
    }

    public async Task<IEnumerable<LabelRowDto>> GetBatchData(string batchNo, string? bagNo = null)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            
            var query = @"
                SELECT 
                    BatchNo, ProductionDate, ItemKey as ProductKey, 
                    CustKey as CustomerKey, Product as ProductName, 
                    TotalBags, TemplateID, TemplateName, SchStartDate, BagNo, 
                    BagSequence, BagPosition, PACKSIZE1, PACKUNIT1, 
                    NET_WEIGHT1, SHELFLIFE_DAY, DaysToExpire, 
                    ALLERGEN1, ALLERGEN2, ALLERGEN3, STORECAP1, 
                    LOT_CODE, BEST_BEFORE, SONumber, ExpiryDate
                FROM 
                    FgL.vw_Label_PrintSummary  
                WHERE 
                    BatchNo = @BatchNo";

            if (!string.IsNullOrEmpty(bagNo))
            {
                query += " AND BagNo = @BagNo";
                return await connection.QueryAsync<LabelRowDto>(query, new { BatchNo = batchNo, BagNo = bagNo });
            }

            return await connection.QueryAsync<LabelRowDto>(query, new { BatchNo = batchNo });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in GetBatchData: {Message}", ex.Message);
            return Array.Empty<LabelRowDto>();
        }
    }
}