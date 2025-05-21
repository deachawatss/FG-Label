using System.Collections.Generic;
using System.Data;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using FgLabel.Api.Models;
using System;
using System.Linq;

namespace FgLabel.Api.Services;

public class BatchService : IBatchService
{
    private readonly string _connectionString;
    private readonly ILogger<BatchService> _logger;
    private readonly IConfiguration _configuration;

    public BatchService(IConfiguration configuration, ILogger<BatchService> logger)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("SQL connection string missing");
        _logger = logger;
        _configuration = configuration;
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
        _logger.LogInformation($"Fetching batch data for batchNo: {batchNo}");

        try
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            string sqlQuery = @"
                SELECT 
                    BatchNo, ProductionDate, ItemKey as ProductKey, 
                    CustKey as CustomerKey, Product as ProductName, 
                    TotalBags, TemplateID, TemplateName, SchStartDate, BagNo, 
                    BagSequence, BagPosition, PACKSIZE1, PACKUNIT1, 
                    NET_WEIGHT1, SHELFLIFE_DAY, DaysToExpire, 
                    ALLERGEN1, ALLERGEN2, ALLERGEN3, STORECAP1, 
                    LOT_CODE, BEST_BEFORE, SONumber, ExpiryDate,
                    SHIPTO_COUNTRY as ShipToCountry, Country, -- ยังคงดึง Country มาด้วยเพื่อการดีบัก แต่ไม่ใช้แทนค่า ShipToCountry
                    City, State, Address_1, Address_2, Address_3, Customer_Name
                FROM 
                    FgL.vw_Label_PrintSummary  
                WHERE
                    BatchNo = @BatchNo";

            IEnumerable<LabelRowDto> results;

            if (!string.IsNullOrEmpty(bagNo))
            {
                sqlQuery += " AND BagNo = @BagNo";
                results = await connection.QueryAsync<LabelRowDto>(sqlQuery, new { BatchNo = batchNo, BagNo = bagNo });
                _logger.LogInformation("GetBatchData: Found {Count} records for BatchNo={BatchNo}, BagNo={BagNo}", 
                    results.Count(), batchNo, bagNo);
            }
            else
            {
                results = await connection.QueryAsync<LabelRowDto>(sqlQuery, new { BatchNo = batchNo });
                _logger.LogInformation("GetBatchData: Found {Count} records for BatchNo={BatchNo}", 
                    results.Count(), batchNo);
            }

            // ทำให้แน่ใจว่ามีค่า ShipToCountry สำหรับแต่ละรายการ
            if (results.Any())
            {
                var resultsList = results.ToList();

                // กำหนดค่า ShipToCountry ตาม CustKey สำหรับแต่ละรายการ
                foreach (var item in resultsList)
                {
                    // กำหนดค่า ShipToCountry ตาม CustKey ที่เฉพาะเจาะจง
                    // ถ้าไม่มีค่า ShipToCountry หรือเป็นค่าว่าง จะใช้ CustKey ในการกำหนดค่า
                    if (string.IsNullOrWhiteSpace(item.ShipToCountry) && !string.IsNullOrWhiteSpace(item.CustKey))
                    {
                        string custKey = item.CustKey;
                        switch (custKey)
                        {
                            case "IDG01":
                                item.ShipToCountry = "TAIWAN";
                                break;
                            case "ASB01":
                            case "ASB02":
                                item.ShipToCountry = "CAMBODIA";
                                break;
                            case "CPZ01":
                                item.ShipToCountry = "THAILAND";
                                break;
                            case "DJF01":
                                item.ShipToCountry = "SINGAPORE";
                                break;
                            case "DKG01":
                                item.ShipToCountry = "HONGKONG";
                                break;
                            case "NFP01":
                                item.ShipToCountry = "PHILIPPINES";
                                break;
                            case "PSP01":
                                item.ShipToCountry = "INDONESIA";
                                break;
                            case "NWF01":
                                item.ShipToCountry = "THAILAND";
                                break;
                            // เพิ่มกรณีอื่นๆ ตามความจำเป็น
                            default:
                                // ถ้าไม่มีการกำหนดค่าเฉพาะ ใช้ค่า Country จาก ARCUST แทน
                                if (!string.IsNullOrWhiteSpace(item.Country))
                                {
                                    item.ShipToCountry = item.Country;
                                }
                                break;
                        }
                        
                        _logger.LogInformation($"Set ShipToCountry to '{item.ShipToCountry}' for CustKey: {item.CustKey}");
                    }
                    
                    // เพิ่ม log เพื่อเปรียบเทียบค่า ShipToCountry และ Country
                    _logger.LogInformation($"Final values for batch {batchNo}, CustKey: {item.CustKey}, ShipToCountry: {item.ShipToCountry}, Country: {item.Country}");
                }

                return resultsList;
            }

            return results;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error fetching batch data for batchNo: {batchNo}");
            return Array.Empty<LabelRowDto>();
        }
    }
}