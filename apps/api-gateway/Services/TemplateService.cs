using System;
using System.Data;
using System.Threading.Tasks;
using System.Linq;
using System.Collections.Generic;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using FgLabel.Shared.Models;

namespace FgLabel.Api.Services
{
    public class TemplateService : ITemplateService
    {
        private readonly string _connectionString;
        private readonly ILogger<TemplateService> _logger;
        private readonly ISqlConnectionFactory _sql;

        public TemplateService(IConfiguration configuration, ILogger<TemplateService> logger, ISqlConnectionFactory sql)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("SQL connection string missing");
            _logger = logger;
            _sql = sql;
        }

        public async Task<int> CreateOrGetTemplateAsync(string batchNo)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            // Get batch info
            var batch = await connection.QueryFirstOrDefaultAsync<BatchDto>(
                "SELECT * FROM FgL.vw_Label_BatchInfo WHERE BatchNo = @BatchNo",
                new { BatchNo = batchNo });

            if (batch == null)
            {
                _logger.LogWarning("Batch {BatchNo} not found, creating default template", batchNo);
                // Create default template if batch not found
                var defaultTemplateId = await connection.ExecuteScalarAsync<int>(
                    @"INSERT INTO FgL.LabelTemplate (
                        ProductKey, CustomerKey, Active, CreatedAt
                      ) VALUES (
                        NULL, NULL, 1, GETUTCDATETIME()
                      );
                      SELECT SCOPE_IDENTITY();");

                _logger.LogInformation("Created default template {TemplateId} for batch {BatchNo}",
                    defaultTemplateId, batchNo);
                return defaultTemplateId;
            }

            // Check existing template - ปรับปรุงการค้นหา
            var existingTemplateId = await connection.QueryFirstOrDefaultAsync<int?>(
                @"SELECT TOP 1 t.TemplateID 
                  FROM FgL.LabelTemplate t
                  LEFT JOIN FgL.LabelTemplateMapping m ON t.TemplateID = m.TemplateID
                  WHERE t.Active = 1 
                    AND (
                        -- หลักการคือ: ถ้ามี ProductKey และ CustomerKey ตรงกันทั้งคู่ ให้ความสำคัญสูงสุด
                        -- ถ้ามีแค่อย่างใดอย่างหนึ่งตรงกัน ก็เอามาใช้ได้
                        -- ถ้ามี mapping อยู่ใน LabelTemplateMapping ให้ใช้ mapping นั้น
                        -- ถ้ามี ProductKey และ CustomerKey ใน LabelTemplate ก็ให้ใช้ได้
                        (t.ProductKey = @prod AND t.CustomerKey = @cust) OR
                        (m.ProductKey = @prod AND m.CustomerKey = @cust AND m.Active = 1) OR
                        (t.ProductKey = @prod AND (@cust IS NULL OR t.CustomerKey IS NULL)) OR
                        (t.CustomerKey = @cust AND (@prod IS NULL OR t.ProductKey IS NULL)) OR
                        (m.ProductKey = @prod AND m.Active = 1 AND (@cust IS NULL OR m.CustomerKey IS NULL)) OR
                        (m.CustomerKey = @cust AND m.Active = 1 AND (@prod IS NULL OR m.ProductKey IS NULL))
                    )
                  ORDER BY
                    -- เรียงลำดับความสำคัญ: Exact match > Partial match
                    CASE 
                        WHEN t.ProductKey = @prod AND t.CustomerKey = @cust THEN 1
                        WHEN m.ProductKey = @prod AND m.CustomerKey = @cust AND m.Active = 1 THEN 2
                        WHEN t.ProductKey = @prod THEN 3
                        WHEN t.CustomerKey = @cust THEN 4
                        WHEN m.ProductKey = @prod AND m.Active = 1 THEN 5
                        WHEN m.CustomerKey = @cust AND m.Active = 1 THEN 6
                        ELSE 7 
                    END,
                    -- ถ้ามี Priority ใน mapping ก็ใช้ตามนั้น ถ้าไม่มีให้ใช้ TemplateID ล่าสุด
                    COALESCE(m.Priority, 999),
                    t.TemplateID DESC;",
                new { prod = batch.ProductKey, cust = batch.CustomerKey });

            if (existingTemplateId.HasValue)
            {
                _logger.LogInformation("Found existing template {TemplateId} for batch {BatchNo}",
                    existingTemplateId.Value, batchNo);
                return existingTemplateId.Value;
            }

            // Create new template
            var newTemplateId = await connection.ExecuteScalarAsync<int>(
                @"INSERT INTO FgL.LabelTemplate (
                    ProductKey, CustomerKey, Active, CreatedAt
                  ) VALUES (
                    @ProductKey, @CustomerKey, 1, GETUTCDATETIME()
                  );
                  SELECT SCOPE_IDENTITY();",
                new { batch.ProductKey, batch.CustomerKey });

            _logger.LogInformation("Created new template {TemplateId} for batch {BatchNo}",
                newTemplateId, batchNo);
            return newTemplateId;
        }

        public async Task<int> AutoCreateTemplateAsync(AutoCreateRequest request)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            // Create new template
            var templateId = await connection.ExecuteScalarAsync<int>(
                @"INSERT INTO FgL.LabelTemplate (
                    ProductKey, CustomerKey, Active, CreatedAt
                  ) VALUES (
                    @ProductKey, @CustomerKey, 1, GETUTCDATETIME()
                  );
                  SELECT SCOPE_IDENTITY();",
                new { request.ProductKey, request.CustomerKey });

            _logger.LogInformation("Created new template {TemplateId} for product {ProductKey} and customer {CustomerKey}",
                templateId, request.ProductKey, request.CustomerKey);
            return templateId;
        }

        public async Task<int> SaveTemplateAsync(CreateTemplateRequest request)
        {
            await using var connection = _sql.GetConnection();
            await connection.OpenAsync();
            await using var tran = connection.BeginTransaction();

            try
            {
                // บันทึก log ข้อมูลที่ได้รับ
                _logger.LogInformation("Saving template: {RequestName}, ProductKey: {ProductKey}, CustomerKey: {CustomerKey}, Components: {ComponentCount}",
                    request.Name, request.ProductKey, request.CustomerKey, request.Components?.Count ?? 0);

                // ตรวจสอบค่าที่จำเป็น
                if (string.IsNullOrWhiteSpace(request.Name))
                {
                    throw new ArgumentException("Template name is required");
                }
                
                if (string.IsNullOrWhiteSpace(request.Content))
                {
                    throw new ArgumentException("Template content is required");
                }

                // ตรวจสอบว่ามีเทมเพลตที่มีชื่อ, ProductKey และ CustomerKey เหมือนกันหรือไม่
                var existingTemplate = await connection.QueryFirstOrDefaultAsync<LabelTemplate>(
                    @"SELECT * FROM FgL.LabelTemplate 
                      WHERE Name = @Name 
                      AND (ProductKey = @ProductKey OR (ProductKey IS NULL AND @ProductKey IS NULL))
                      AND (CustomerKey = @CustomerKey OR (CustomerKey IS NULL AND @CustomerKey IS NULL))
                      AND Active = 1",
                    new { 
                        request.Name,
                        request.ProductKey,
                        request.CustomerKey
                    }, tran);

                int templateId;
                
                if (existingTemplate != null)
                {
                    // อัพเดตเทมเพลตที่มีอยู่แล้ว
                    templateId = existingTemplate.TemplateID;
                    var newVersion = Math.Floor((decimal)(existingTemplate.Version * 100 + 1)) / 100; // เพิ่มเวอร์ชันขึ้น 0.01

                    _logger.LogInformation("Found existing template with ID: {TemplateId}, updating version from {OldVersion} to {NewVersion}", 
                        templateId, existingTemplate.Version, newVersion);

                    await connection.ExecuteAsync(
                        @"UPDATE FgL.LabelTemplate
                          SET Description = @Description, 
                              Engine = @Engine, 
                              PaperSize = @PaperSize, 
                              Orientation = @Orientation, 
                              Content = @Content,
                              Version = @Version, 
                              UpdatedAt = SYSUTCDATETIME()
                          WHERE TemplateID = @TemplateID",
                        new {
                            TemplateID = templateId,
                            request.Description,
                            request.Engine,
                            request.PaperSize,
                            request.Orientation,
                            request.Content,
                            Version = newVersion
                        }, tran);

                    // ลบ components เก่า
                    await connection.ExecuteAsync(
                        "DELETE FROM FgL.LabelTemplateComponent WHERE TemplateID = @TemplateID",
                        new { TemplateID = templateId }, tran);
                }
                else
                {
                    // --- Insert main template --------------------------------------------------
                    _logger.LogInformation("Creating new template record");
                    templateId = await connection.ExecuteScalarAsync<int>(
                        @"INSERT INTO FgL.LabelTemplate
                            (Name, Description, Engine, PaperSize, Orientation, Content,
                             ProductKey, CustomerKey, Version, Active, CreatedAt, UpdatedAt)
                          VALUES
                            (@Name, @Description, @Engine, @PaperSize, @Orientation, @Content,
                             @ProductKey, @CustomerKey, 1, 1, SYSUTCDATETIME(), SYSUTCDATETIME());
                          SELECT CAST(SCOPE_IDENTITY() AS int);",
                        new {
                            request.Name,
                            request.Description,
                            request.Engine,
                            request.PaperSize,
                            request.Orientation,
                            request.Content,
                            request.ProductKey,
                            request.CustomerKey
                        }, tran);

                    _logger.LogInformation("Template record inserted with ID: {TemplateId}", templateId);
                }

                // --- Optional product/customer mapping ------------------------------------
                if (!string.IsNullOrWhiteSpace(request.ProductKey) ||
                    !string.IsNullOrWhiteSpace(request.CustomerKey))
                {
                    _logger.LogInformation("Checking for existing template mapping with ProductKey: {ProductKey}, CustomerKey: {CustomerKey}",
                        request.ProductKey, request.CustomerKey);
                    
                    // ตรวจสอบและลบแมปปิ้งที่ซ้ำซ้อน
                    await connection.ExecuteAsync(
                        @"DELETE FROM FgL.LabelTemplateMapping 
                          WHERE (ProductKey = @ProductKey OR @ProductKey IS NULL)
                          AND (CustomerKey = @CustomerKey OR @CustomerKey IS NULL);",
                        new { 
                            request.ProductKey,
                            request.CustomerKey 
                        }, tran);
                        
                    _logger.LogInformation("Inserting template mapping for ProductKey: {ProductKey}, CustomerKey: {CustomerKey}",
                        request.ProductKey, request.CustomerKey);
                        
                    await connection.ExecuteAsync(
                        @"INSERT INTO FgL.LabelTemplateMapping
                              (TemplateID, ProductKey, CustomerKey, Priority, Active, CreatedAt)
                          VALUES
                              (@TemplateID, @ProductKey, @CustomerKey, 5, 1, SYSUTCDATETIME());",
                        new { TemplateID = templateId,
                              request.ProductKey,
                              request.CustomerKey }, tran);
                }

                // --- Insert each component ------------------------------------------------
                if (request.Components?.Any() == true)
                {
                    _logger.LogInformation("Inserting {Count} template components", request.Components.Count);
                    
                    try {
                        await connection.ExecuteAsync(
                            @"INSERT INTO FgL.LabelTemplateComponent
                                (TemplateID, ComponentType, X, Y, W, H, FontName, FontSize,
                                 Placeholder, StaticText, BarcodeFormat, CreatedAt)
                              VALUES
                                (@TemplateID, @ComponentType, @X, @Y, @W, @H, @FontName, @FontSize,
                                 @Placeholder, @StaticText, @BarcodeFormat, SYSUTCDATETIME());",
                            request.Components.Select(c => new {
                                TemplateID   = templateId,
                                c.ComponentType,
                                c.X,
                                c.Y,
                                c.W,
                                c.H,
                                c.FontName,
                                c.FontSize,
                                c.Placeholder,
                                c.StaticText,
                                c.BarcodeFormat
                            }), tran);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error inserting components: {ErrorMessage}", ex.Message);
                        throw new Exception($"Error inserting components: {ex.Message}", ex);
                    }
                }

                await tran.CommitAsync();
                _logger.LogInformation("Template saved successfully with ID: {TemplateId}", templateId);
                return templateId;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving template: {ErrorMessage}", ex.Message);
                
                try
                {
                    await tran.RollbackAsync();
                    _logger.LogInformation("Transaction rolled back due to error");
                }
                catch (Exception rollbackEx)
                {
                    _logger.LogError(rollbackEx, "Error rolling back transaction: {ErrorMessage}", rollbackEx.Message);
                }
                
                throw new Exception($"Error saving template: {ex.Message}", ex);
            }
        }
    }
}