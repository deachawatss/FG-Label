using Dapper;
using FgLabel.Api.Models;
using Microsoft.Data.SqlClient;
using System.Data;

namespace FgLabel.Api.Repositories;

public interface ILabelRepository
{
    Task<dynamic?> GetAsync(string batchNo);
    Task<bool> UpdateAsync(string batchNo, UpdateLabelRequest request);
}

public class LabelRepository : ILabelRepository
{
    private readonly IDbConnection _db;
    private readonly ILogger<LabelRepository> _logger;

    public LabelRepository(IDbConnection db, ILogger<LabelRepository> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<dynamic?> GetAsync(string batchNo)
    {
        try
        {
            _logger.LogInformation("Getting label data for batch: {BatchNo}", batchNo);
            
            // ใช้ SQL VIEW ที่มีอยู่แล้วเพื่อดึงข้อมูล
            var query = @"
                SELECT TOP 1 *
                FROM FgL.vw_Label_PrintData 
                WHERE BatchNo = @batchNo";
                
            var result = await _db.QueryFirstOrDefaultAsync<dynamic>(query, new { batchNo });
            
            if (result != null)
            {
                _logger.LogInformation("Found label data for batch: {BatchNo}", batchNo);
                
                // เพิ่มเติมข้อมูลการพิมพ์จากตาราง FgL.Label ถ้ามี
                var additionalQuery = @"
                    SELECT BagStart, BagEnd, PrintQcSample AS QcSample, 
                           PrintFormula AS FormulaSheet, PrintPalletTag AS PalletTag
                    FROM FgL.Label 
                    WHERE BatchNo = @batchNo";
                    
                try
                {
                    var printSettings = await _db.QueryFirstOrDefaultAsync<dynamic>(additionalQuery, new { batchNo });
                    
                    if (printSettings != null)
                    {
                        // เพิ่มคุณสมบัติจาก printSettings ไปยัง result
                        ((IDictionary<string, object>)result).Add("bagStart", printSettings.BagStart);
                        ((IDictionary<string, object>)result).Add("bagEnd", printSettings.BagEnd);
                        ((IDictionary<string, object>)result).Add("qcSample", printSettings.QcSample);
                        ((IDictionary<string, object>)result).Add("formulaSheet", printSettings.FormulaSheet);
                        ((IDictionary<string, object>)result).Add("palletTag", printSettings.PalletTag);
                    }
                }
                catch (Exception ex)
                {
                    // ถ้าไม่พบตาราง FgL.Label จะไม่ดึงค่าเพิ่มเติม
                    _logger.LogWarning(ex, "Could not retrieve additional print settings for batch: {BatchNo}", batchNo);
                }
            }
            else
            {
                _logger.LogWarning("No label data found for batch: {BatchNo}", batchNo);
            }
            
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting label data for batch: {BatchNo}", batchNo);
            throw;
        }
    }

    public async Task<bool> UpdateAsync(string batchNo, UpdateLabelRequest request)
    {
        try
        {
            _logger.LogInformation("Updating label for batch: {BatchNo}", batchNo);
            
            // ตรวจสอบว่ามีตาราง FgL.Label หรือไม่
            bool tableExists = await TableExists("FgL.Label");
            
            if (!tableExists)
            {
                // ถ้าไม่มีตาราง ให้สร้างตาราง
                _logger.LogWarning("Table FgL.Label does not exist. Creating table...");
                await CreateLabelTable();
            }
            
            // อัปเดตหรือสร้างข้อมูลใหม่
            var query = @"
                IF EXISTS (SELECT 1 FROM FgL.Label WHERE BatchNo = @BatchNo)
                BEGIN
                    UPDATE FgL.Label
                    SET ProductionDate = @ProductionDate,
                        BagStart = @BagStart,
                        BagEnd = @BagEnd,
                        PrintQcSample = @QcSample,
                        PrintFormula = @FormulaSheet,
                        PrintPalletTag = @PalletTag,
                        UpdatedAt = SYSUTCDATETIME()
                    WHERE BatchNo = @BatchNo;
                END
                ELSE
                BEGIN
                    INSERT INTO FgL.Label
                        (BatchNo, ProductionDate, BagStart, BagEnd, 
                         PrintQcSample, PrintFormula, PrintPalletTag, CreatedAt, UpdatedAt)
                    VALUES
                        (@BatchNo, @ProductionDate, @BagStart, @BagEnd, 
                         @QcSample, @FormulaSheet, @PalletTag, SYSUTCDATETIME(), SYSUTCDATETIME());
                END";
                
            var result = await _db.ExecuteAsync(query, new {
                BatchNo = batchNo,
                request.ProductionDate,
                request.BagStart,
                request.BagEnd,
                request.QcSample,
                request.FormulaSheet,
                request.PalletTag
            });
            
            _logger.LogInformation("Successfully updated label for batch: {BatchNo}", batchNo);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating label for batch: {BatchNo}", batchNo);
            return false;
        }
    }
    
    // ตรวจสอบว่ามีตารางหรือไม่
    private async Task<bool> TableExists(string tableName)
    {
        try
        {
            string schema = "FgL";
            string table = "Label";
            
            if (tableName.Contains("."))
            {
                var parts = tableName.Split('.');
                schema = parts[0];
                table = parts[1];
            }
            
            var query = @"
                SELECT CASE WHEN EXISTS (
                    SELECT 1 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = @Schema 
                    AND TABLE_NAME = @TableName
                ) THEN 1 ELSE 0 END";
                
            return await _db.ExecuteScalarAsync<bool>(query, new { Schema = schema, TableName = table });
        }
        catch
        {
            return false;
        }
    }
    
    // สร้างตาราง FgL.Label ถ้ายังไม่มี
    private async Task CreateLabelTable()
    {
        try
        {
            var query = @"
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'FgL' AND TABLE_NAME = 'Label')
                BEGIN
                    CREATE TABLE FgL.Label (
                        LabelID INT IDENTITY(1,1) PRIMARY KEY,
                        BatchNo NVARCHAR(30) NOT NULL,
                        ProductionDate DATETIME NOT NULL,
                        BagStart INT NOT NULL DEFAULT 1,
                        BagEnd INT NOT NULL DEFAULT 1,
                        PrintQcSample BIT NOT NULL DEFAULT 0,
                        PrintFormula BIT NOT NULL DEFAULT 0,
                        PrintPalletTag BIT NOT NULL DEFAULT 0,
                        CreatedAt DATETIME NOT NULL DEFAULT SYSUTCDATETIME(),
                        UpdatedAt DATETIME NOT NULL DEFAULT SYSUTCDATETIME(),
                        CONSTRAINT UQ_Label_BatchNo UNIQUE (BatchNo)
                    );
                    
                    CREATE INDEX IX_Label_BatchNo ON FgL.Label(BatchNo);
                END";
                
            await _db.ExecuteAsync(query);
            _logger.LogInformation("Successfully created FgL.Label table");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating FgL.Label table");
            throw;
        }
    }
} 