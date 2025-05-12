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

        public async Task<int> SaveTemplateAsync(CreateTemplateRequest dto)
        {
            await using var connection = _sql.GetConnection();
            await connection.OpenAsync();
            await using var tran = connection.BeginTransaction();

            try
            {
                // Log the incoming request
                _logger.LogInformation("Saving template: {Name}", dto.Name);

                // Insert or update template
                var templateId = await connection.ExecuteScalarAsync<int>(
                    @"MERGE INTO FgL.LabelTemplate AS target
                    USING (VALUES (@Name, @ProductKey, @CustomerKey)) AS source (Name, ProductKey, CustomerKey)
                    ON target.Name = source.Name AND target.ProductKey = source.ProductKey AND target.CustomerKey = source.CustomerKey
                    WHEN MATCHED THEN 
                        UPDATE SET Description = @Description, Engine = @Engine, PaperSize = @PaperSize, Orientation = @Orientation, Content = @Content, UpdatedAt = SYSUTCDATETIME()
                    WHEN NOT MATCHED THEN
                        INSERT (Name, Description, Engine, PaperSize, Orientation, Content, ProductKey, CustomerKey, CreatedAt)
                        VALUES (source.Name, @Description, @Engine, @PaperSize, @Orientation, @Content, source.ProductKey, source.CustomerKey, SYSUTCDATETIME())
                    OUTPUT inserted.TemplateID;",
                    new
                    {
                        dto.Name,
                        dto.Description,
                        dto.Engine,
                        dto.PaperSize,
                        dto.Orientation,
                        dto.Content,
                        dto.ProductKey,
                        dto.CustomerKey
                    }, tran);

                // Optional product/customer mapping
                if (!string.IsNullOrWhiteSpace(dto.ProductKey) || !string.IsNullOrWhiteSpace(dto.CustomerKey))
                {
                    _logger.LogInformation("Creating template mapping with ProductKey: {ProductKey}, CustomerKey: {CustomerKey}",
                        dto.ProductKey, dto.CustomerKey);
                    
                    // Check and delete any duplicate mappings
                    await connection.ExecuteAsync(
                        @"DELETE FROM FgL.LabelTemplateMapping 
                          WHERE (ProductKey = @ProductKey OR (ProductKey IS NULL AND @ProductKey IS NULL))
                          AND (CustomerKey = @CustomerKey OR (CustomerKey IS NULL AND @CustomerKey IS NULL));",
                        new { 
                            dto.ProductKey,
                            dto.CustomerKey 
                        }, tran);
                        
                    // Insert mapping with Priority = 5 as default
                    await connection.ExecuteAsync(
                        @"INSERT INTO FgL.LabelTemplateMapping
                              (TemplateID, ProductKey, CustomerKey, Priority, Active, CreatedAt)
                          VALUES
                              (@TemplateID, @ProductKey, @CustomerKey, 5, 1, SYSUTCDATETIME());",
                        new { 
                            TemplateID = templateId,
                            dto.ProductKey,
                            dto.CustomerKey 
                        }, tran);
                }

                // Insert components
                if (dto.Components?.Any() == true)
                {
                    foreach (var component in dto.Components)
                    {
                        await connection.ExecuteAsync(
                            "INSERT INTO FgL.LabelTemplateComponent (TemplateID, ComponentType, X, Y, W, H, FontName, FontSize, StaticText, Placeholder, BarcodeFormat) " +
                            "VALUES (@TemplateID, @ComponentType, @X, @Y, @W, @H, @FontName, @FontSize, @StaticText, @Placeholder, @BarcodeFormat)",
                            new
                            {
                                TemplateID = templateId,
                                component.ComponentType,
                                component.X,
                                component.Y,
                                component.W,
                                component.H,
                                component.FontName,
                                component.FontSize,
                                component.StaticText,
                                component.Placeholder,
                                component.BarcodeFormat
                            }, tran);
                    }
                }

                // Commit transaction
                await tran.CommitAsync();

                _logger.LogInformation("Template saved successfully with ID: {TemplateID}", templateId);

                return templateId;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving template");
                await tran.RollbackAsync();
                throw;
            }
        }
    }
}