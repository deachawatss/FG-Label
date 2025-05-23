using System;
using System.Data;
using System.Threading.Tasks;
using System.Linq;
using System.Collections.Generic;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using FgLabel.Api.Models;
using System.Text.Json;

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
            var batch = await connection.QueryFirstOrDefaultAsync<FgLabel.Api.Models.BatchDto>(
                "SELECT * FROM FgL.vw_Label_PrintSummary WHERE BatchNo = @BatchNo",
                new { BatchNo = batchNo });

            if (batch == null)
            {
                _logger.LogWarning("Batch {BatchNo} not found, creating default template", batchNo);
                // Create default template if batch not found
                var defaultTemplateId = await connection.ExecuteScalarAsync<int>(
                    @"INSERT INTO FgL.LabelTemplate (
                        Name, ProductKey, CustomerKey, Active, Engine, PaperSize, Orientation, TemplateType, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy
                      ) VALUES (
                        @Name, @ProductKey, @CustomerKey, @Active, @Engine, @PaperSize, @Orientation, @TemplateType, GETUTCDATETIME(), GETUTCDATETIME(), @CreatedBy, @UpdatedBy
                      );
                      SELECT SCOPE_IDENTITY();", new
                    {
                        Name = $"Default-{batchNo}",
                        ProductKey = (string?)null,
                        CustomerKey = (string?)null,
                        Active = true,
                        Engine = "Canvas",
                        PaperSize = "4x4",
                        Orientation = "Portrait",
                        TemplateType = "Standard",
                        CreatedBy = "System",
                        UpdatedBy = "System"
                    });

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
                    Name, ProductKey, CustomerKey, Active, Engine, PaperSize, Orientation, TemplateType, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy
                  ) VALUES (
                    @Name, @ProductKey, @CustomerKey, @Active, @Engine, @PaperSize, @Orientation, @TemplateType, GETUTCDATETIME(), GETUTCDATETIME(), @CreatedBy, @UpdatedBy
                  );
                  SELECT SCOPE_IDENTITY();",
                new { 
                    Name = $"New-{batchNo}",
                    ProductKey = batch.ProductKey, 
                    CustomerKey = batch.CustomerKey,
                    Active = true,
                    Engine = "Canvas",
                    PaperSize = "4x4",
                    Orientation = "Portrait",
                    TemplateType = "Standard",
                    CreatedBy = "System",
                    UpdatedBy = "System"
                });

            _logger.LogInformation("Created new template {TemplateId} for batch {BatchNo}",
                newTemplateId, batchNo);
            return newTemplateId;
        }

        private async Task UpdateTemplateMappingAsync(int templateId, string? productKey, string? customerKey)
        {
            // บันทึก log ข้อมูลที่ส่งเข้ามา
            _logger.LogInformation("UpdateTemplateMappingAsync: TemplateId={TemplateId}, ProductKey={ProductKey}, CustomerKey={CustomerKey}",
                templateId, productKey ?? "null", customerKey ?? "null");
            
            try
            {
                _logger.LogInformation("เริ่มการอัพเดต template mapping ด้วย ProductKey={ProductKey}, CustomerKey={CustomerKey}", productKey ?? "null", customerKey ?? "null");
                
                // ตรวจสอบว่า stored procedure มีอยู่หรือไม่
                bool spExists = await CheckStoredProcedureExists("FgL.UpdateTemplateMappingWithStringKeys");
                
                if (spExists)
                {
                    // บันทึกลงในตาราง mapping ชุดใหม่โดยใช้ stored procedure ที่สร้างไว้
                    var sql = "EXEC FgL.UpdateTemplateMappingWithStringKeys @TemplateID, @ProductKey, @CustomerKey";
                    
                    await _sql.GetConnection().ExecuteAsync(sql, new
                    {
                        TemplateID = templateId,
                        ProductKey = string.IsNullOrEmpty(productKey) ? string.Empty : productKey,
                        CustomerKey = string.IsNullOrEmpty(customerKey) ? string.Empty : customerKey
                    });
                    
                    _logger.LogInformation("อัพเดต template mapping สำเร็จสำหรับ TemplateID={TemplateId}, ProductKey={ProductKey}, CustomerKey={CustomerKey}",
                        templateId, productKey ?? "null", customerKey ?? "null");
                }
                else
                {
                    _logger.LogWarning("ไม่พบ stored procedure FgL.UpdateTemplateMappingWithStringKeys จะใช้การบันทึกตรงแทน");
                }
                
                // บันทึกโดยตรงในตาราง string mapping ด้วยเพื่อความปลอดภัย
                if (!string.IsNullOrEmpty(productKey) && productKey != "system")
                {
                    var prodSql = @"
                        INSERT INTO FgL.TemplateMappingProductString
                            (TemplateId, ProductKeyString, Active, CreatedAt)
                        VALUES
                            (@TemplateId, @ProductKeyString, 1, GETUTCDATE())";
                    
                    try
                    {
                        string productKeyValue = productKey!; // ไม่ต้องตรวจสอบอีกเพราะเช็คแล้วด้านบน
                        await _sql.GetConnection().ExecuteAsync(prodSql, new
                        {
                            TemplateId = templateId,
                            ProductKeyString = productKeyValue
                        });
                        
                        _logger.LogInformation("สร้าง mapping สำหรับ ProductKey {ProductKey} และ Template {TemplateId} สำเร็จ",
                            productKeyValue, templateId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "ไม่สามารถสร้าง ProductKey mapping: {Message}", ex.Message);
                    }
                }
                
                if (!string.IsNullOrEmpty(customerKey) && customerKey != "system")
                {
                    var custSql = @"
                        INSERT INTO FgL.TemplateMappingCustomerString
                            (TemplateId, CustomerKeyString, Active, CreatedAt)
                        VALUES
                            (@TemplateId, @CustomerKeyString, 1, GETUTCDATE())";
                    
                    try
                    {
                        string customerKeyValue = customerKey!; // ไม่ต้องตรวจสอบอีกเพราะเช็คแล้วด้านบน
                        await _sql.GetConnection().ExecuteAsync(custSql, new
                        {
                            TemplateId = templateId,
                            CustomerKeyString = customerKeyValue
                        });
                        
                        _logger.LogInformation("สร้าง mapping สำหรับ CustomerKey {CustomerKey} และ Template {TemplateId} สำเร็จ",
                            customerKeyValue, templateId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "ไม่สามารถสร้าง CustomerKey mapping: {Message}", ex.Message);
                    }
                }
                
                if (!string.IsNullOrEmpty(productKey) && productKey != "system" && 
                    !string.IsNullOrEmpty(customerKey) && customerKey != "system")
                {
                    var prodCustSql = @"
                        INSERT INTO FgL.TemplateMappingProductCustomerString
                            (TemplateId, ProductKeyString, CustomerKeyString, Active, CreatedAt)
                        VALUES
                            (@TemplateId, @ProductKeyString, @CustomerKeyString, 1, GETUTCDATE())";
                    
                    try
                    {
                        string productKeyValue = productKey!; // ไม่ต้องตรวจสอบอีกเพราะเช็คแล้วด้านบน
                        string customerKeyValue = customerKey!; // ไม่ต้องตรวจสอบอีกเพราะเช็คแล้วด้านบน
                        
                        await _sql.GetConnection().ExecuteAsync(prodCustSql, new
                        {
                            TemplateId = templateId,
                            ProductKeyString = productKeyValue,
                            CustomerKeyString = customerKeyValue
                        });
                        
                        _logger.LogInformation("สร้าง mapping สำหรับ ProductKey {ProductKey}, CustomerKey {CustomerKey} และ Template {TemplateId} สำเร็จ",
                            productKeyValue, customerKeyValue, templateId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "ไม่สามารถสร้าง ProductKey+CustomerKey mapping: {Message}", ex.Message);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "เกิดข้อผิดพลาดในการสร้าง template mapping: {Message}", ex.Message);
                // ไม่ throw exception เนื่องจากไม่ใช่ส่วนสำคัญที่จะทำให้การทำงานหลักล้มเหลว
            }
        }

        public async Task<int> AutoCreateTemplateAsync(AutoCreateRequest request, string? createdBy = null)
        {
            try
            {
                _logger.LogInformation("เริ่มสร้าง template อัตโนมัติสำหรับ BatchNo: {BatchNo} โดย {CreatedBy}", request.BatchNo, createdBy ?? "System");
                
                // 1. ตรวจสอบว่ามี batch ที่ระบุหรือไม่
                var batchSql = @"SELECT * FROM FgL.vw_Label_PrintSummary WHERE BatchNo = @BatchNo";
                var batchData = await _sql.GetConnection().QueryFirstOrDefaultAsync(batchSql, new { BatchNo = request.BatchNo });
                if (batchData == null)
                {
                    _logger.LogWarning("ไม่พบ Batch {BatchNo}", request.BatchNo);
                    return 0;
                }
                
                // 2. แปลงข้อมูล batch เป็น DTO
                var batchDict = new Dictionary<string, object>();
                foreach (var prop in ((IDictionary<string, object>)batchData).Keys)
                {
                    batchDict[prop] = ((IDictionary<string, object>)batchData)[prop];
                }
                
                // แปลงข้อมูลจาก dictionary เป็น DTO
                var batchDto = new FgLabel.Api.Models.BatchDto
                {
                    BatchNo = batchDict.ContainsKey("BatchNo") ? batchDict["BatchNo"]?.ToString() : request.BatchNo
                };
                
                // ดึงข้อมูลจาก dictionary และใส่ลงใน DTO
                if (batchDict.ContainsKey("ProductName"))
                    batchDto.ProductName = batchDict["ProductName"]?.ToString();
                if (batchDict.ContainsKey("ItemKey"))
                    batchDto.ProductKey = batchDict["ItemKey"]?.ToString();
                if (batchDict.ContainsKey("CustKey"))
                    batchDto.CustomerKey = batchDict["CustKey"]?.ToString();
                if (batchDict.ContainsKey("CustomerName"))
                    batchDto.CustomerName = batchDict["CustomerName"]?.ToString();
                if (batchDict.ContainsKey("BagNo"))
                    batchDto.BagNo = batchDict["BagNo"]?.ToString();
                if (batchDict.ContainsKey("ProductionDate"))
                {
                    var prodDate = batchDict["ProductionDate"];
                    if (prodDate != null && DateTime.TryParse(prodDate.ToString(), out var date))
                        batchDto.ProductionDate = date;
                }
                if (batchDict.ContainsKey("ExpiryDate"))
                {
                    var expDate = batchDict["ExpiryDate"];
                    if (expDate != null && DateTime.TryParse(expDate.ToString(), out var date))
                        batchDto.ExpiryDate = date;
                }
                
                // ดึงข้อมูลเพิ่มเติม
                string? productKey = null;
                string? customerKey = null;
                
                if (batchDict.ContainsKey("ItemKey"))
                    productKey = batchDict["ItemKey"]?.ToString();
                if (batchDict.ContainsKey("CustKey"))
                    customerKey = batchDict["CustKey"]?.ToString();
                
                // ดึงข้อมูลน้ำหนักถ้ามี
                if (batchDict.ContainsKey("NET_WEIGHT1"))
                {
                    var netWeight = batchDict["NET_WEIGHT1"];
                    if (netWeight != null)
                    {
                        // รับรองว่า netWeight ไม่เป็น null เนื่องจากมีการตรวจสอบด้วย && netWeight != null
                        if (decimal.TryParse(netWeight.ToString(), out var weight))
                            batchDto.NET_WEIGHT1 = weight;
                    }
                }
                
                _logger.LogInformation("สร้าง template จาก BatchDto: ProductName={ProductName}, ProductKey={ProductKey}", 
                    batchDto.ProductName, batchDto.ProductKey);
                
                // 3. สร้าง template จากข้อมูลที่ได้
                var template = CreateStandardTemplate(batchDto);
                
                // แปลง template เป็น JSON string
                var templateJson = System.Text.Json.JsonSerializer.Serialize(template);
                
                // 4. บันทึก template ลงฐานข้อมูล - แก้ไขให้ใช้ NULL แทน string สำหรับ CreatedBy/UpdatedBy
                var sql = @"
                    INSERT INTO FgL.LabelTemplate 
                        (Name, Content, Version, Active, Engine, PaperSize, Orientation, TemplateType, CreatedAt, UpdatedAt)
                    VALUES 
                        (@Name, @Content, @Version, @Active, @Engine, @PaperSize, @Orientation, @TemplateType, @CreatedAt, @UpdatedAt);
                    SELECT SCOPE_IDENTITY();";
                
                var param = new
                {
                    Name = $"Auto-{request.BatchNo}-{DateTime.UtcNow:yyyyMMdd}",
                    Content = templateJson,
                    Version = 1,
                    Active = true,
                    Engine = "Canvas",
                    PaperSize = "4x4",
                    Orientation = "Portrait",
                    TemplateType = "Standard",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                
                var templateId = await _sql.GetConnection().ExecuteScalarAsync<int>(sql, param);
                _logger.LogInformation("สร้าง template {TemplateId} สำหรับ batch {BatchNo} เรียบร้อยโดย {CreatedBy}", templateId, request.BatchNo, createdBy ?? "System");
                
                // 5. สร้าง mapping แยกตามประเภทข้อมูล
                string? nullableProductKey = productKey;
                string? nullableCustomerKey = customerKey;
                await UpdateTemplateMappingAsync(templateId, nullableProductKey, nullableCustomerKey);
                
                return templateId;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "เกิดข้อผิดพลาดในการสร้าง template อัตโนมัติสำหรับ BatchNo {BatchNo}: {Message}", request.BatchNo, ex.Message);
                return 0;
            }
        }

        public async Task<int> AutoCreateTemplateAsync(string batchNo, string templateName, string templateContent, string? productKey, string? customerKey)
        {
            try
            {
                _logger.LogInformation("กำลังสร้าง template อัตโนมัติสำหรับ batch {BatchNo} ด้วย ProductKey={ProductKey}, CustomerKey={CustomerKey}",
                    batchNo, productKey ?? "null", customerKey ?? "null");
                
                // แก้ไขให้ใช้ NULL แทน string สำหรับ CreatedBy/UpdatedBy
                var sql = @"
                    INSERT INTO FgL.LabelTemplate (Name, Content, Active, Engine, PaperSize, Orientation, TemplateType, CreatedAt, UpdatedAt)
                    VALUES (@Name, @Content, @Active, @Engine, @PaperSize, @Orientation, @TemplateType, GETDATE(), GETDATE());
                    SELECT SCOPE_IDENTITY()";
                
                var templateId = await _sql.GetConnection().ExecuteScalarAsync<int>(sql, new
                {
                    Name = templateName,
                    Content = templateContent,
                    Active = true,
                    Engine = "Canvas",
                    PaperSize = "4x4",
                    Orientation = "Portrait",
                    TemplateType = "Standard"
                });
                
                _logger.LogInformation("สร้าง template {TemplateId} สำเร็จ กำลังสร้าง mapping", templateId);
                
                // สร้าง mapping สำหรับ template นี้
                string? nullableProductKey = productKey;
                string? nullableCustomerKey = customerKey;
                await UpdateTemplateMappingAsync(templateId, nullableProductKey, nullableCustomerKey);
                
                return templateId;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "เกิดข้อผิดพลาดในการสร้าง template อัตโนมัติสำหรับ batch {BatchNo}", batchNo);
                return 0;
            }
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

                // Insert or update template - แก้ไขให้ไม่ส่ง CreatedBy/UpdatedBy
                var templateId = await connection.ExecuteScalarAsync<int>(
                    @"MERGE INTO FgL.LabelTemplate AS target
                    USING (VALUES (@Name)) AS source (Name)
                    ON target.Name = source.Name
                    WHEN MATCHED THEN 
                        UPDATE SET Description = @Description, Engine = @Engine, PaperSize = @PaperSize, Orientation = @Orientation, Content = @Content, UpdatedAt = SYSUTCDATETIME()
                    WHEN NOT MATCHED THEN
                        INSERT (Name, Description, Engine, PaperSize, Orientation, Content, CreatedAt, UpdatedAt)
                        VALUES (source.Name, @Description, @Engine, @PaperSize, @Orientation, @Content, SYSUTCDATETIME(), SYSUTCDATETIME())
                    OUTPUT inserted.TemplateID;",
                    new
                    {
                        Name = dto.Name,
                        Description = dto.Description,
                        Engine = dto.Engine,
                        PaperSize = dto.PaperSize,
                        Orientation = dto.Orientation,
                        Content = dto.Content
                    }, tran);

                // Optional product/customer mapping
                if (!string.IsNullOrWhiteSpace(dto.ProductKey) || !string.IsNullOrWhiteSpace(dto.CustomerKey))
                {
                    _logger.LogInformation("Creating template mapping with ProductKey: {ProductKey}, CustomerKey: {CustomerKey}",
                        dto.ProductKey, dto.CustomerKey);
                    
                    // ตรวจสอบว่า stored procedure มีอยู่หรือไม่
                    bool spExists = await CheckStoredProcedureExists("FgL.UpdateTemplateMappingWithStringKeys");
                    
                    if (spExists)
                    {
                        // เรียกใช้ stored procedure สำหรับอัพเดต mapping
                        var spSql = "EXEC FgL.UpdateTemplateMappingWithStringKeys @TemplateID, @ProductKey, @CustomerKey";
                        
                        await connection.ExecuteAsync(spSql, new
                        {
                            TemplateID = templateId,
                            ProductKey = string.IsNullOrEmpty(dto.ProductKey) ? string.Empty : dto.ProductKey,
                            CustomerKey = string.IsNullOrEmpty(dto.CustomerKey) ? string.Empty : dto.CustomerKey
                        }, tran);
                        
                        _logger.LogInformation("Template mapping updated successfully for ProductKey: {ProductKey}, CustomerKey: {CustomerKey}",
                            dto.ProductKey, dto.CustomerKey);
                    }
                    else
                    {
                        _logger.LogWarning("ไม่พบ stored procedure FgL.UpdateTemplateMappingWithStringKeys จะสร้าง mapping แบบตรง");
                        
                        // บันทึกโดยตรงในตาราง TemplateMappingProductString
                        if (!string.IsNullOrEmpty(dto.ProductKey))
                        {
                            try
                            {
                                await connection.ExecuteAsync(
                                    @"INSERT INTO FgL.TemplateMappingProductString
                                        (TemplateId, ProductKeyString, Active, CreatedAt)
                                      VALUES
                                        (@TemplateId, @ProductKeyString, 1, GETUTCDATE())",
                                    new
                                    {
                                        TemplateId = templateId,
                                        ProductKeyString = dto.ProductKey
                                    }, tran);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogWarning(ex, "ไม่สามารถสร้าง ProductKey mapping: {Message}", ex.Message);
                            }
                        }
                        
                        // บันทึกโดยตรงในตาราง TemplateMappingCustomerString
                        if (!string.IsNullOrEmpty(dto.CustomerKey))
                        {
                            try
                            {
                                await connection.ExecuteAsync(
                                    @"INSERT INTO FgL.TemplateMappingCustomerString
                                        (TemplateId, CustomerKeyString, Active, CreatedAt)
                                      VALUES
                                        (@TemplateId, @CustomerKeyString, 1, GETUTCDATE())",
                                    new
                                    {
                                        TemplateId = templateId,
                                        CustomerKeyString = dto.CustomerKey
                                    }, tran);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogWarning(ex, "ไม่สามารถสร้าง CustomerKey mapping: {Message}", ex.Message);
                            }
                        }
                        
                        // บันทึกโดยตรงในตาราง TemplateMappingProductCustomerString
                        if (!string.IsNullOrEmpty(dto.ProductKey) && !string.IsNullOrEmpty(dto.CustomerKey))
                        {
                            try
                            {
                                await connection.ExecuteAsync(
                                    @"INSERT INTO FgL.TemplateMappingProductCustomerString
                                        (TemplateId, ProductKeyString, CustomerKeyString, Active, CreatedAt)
                                      VALUES
                                        (@TemplateId, @ProductKeyString, @CustomerKeyString, 1, GETUTCDATE())",
                                    new
                                    {
                                        TemplateId = templateId,
                                        ProductKeyString = dto.ProductKey,
                                        CustomerKeyString = dto.CustomerKey
                                    }, tran);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogWarning(ex, "ไม่สามารถสร้าง ProductKey+CustomerKey mapping: {Message}", ex.Message);
                            }
                        }
                    }
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

        // ย้ายฟังก์ชัน CreateStandardTemplate จาก Program.cs มาที่นี่
        private FgLabel.Api.Models.LabelTemplate CreateStandardTemplate(FgLabel.Api.Models.BatchDto batch)
        {
            // Format production date as DD/MM/YY
            var prodDate = batch.SchStartDate ?? batch.ProductionDate;
            string? formattedProdDate = null;
            if (prodDate != null)
            {
                formattedProdDate = DateOnly.FromDateTime(prodDate.Value).ToString("dd/MM/yy");
            }
            else
            {
                formattedProdDate = "";
            }

            // Create lot code from production date or use provided LotCode or BatchNo
            string? lotCode = null;
            if (!string.IsNullOrEmpty(batch.LotCode))
            {
                lotCode = batch.LotCode;
            }
            else if (prodDate != null)
            {
                lotCode = prodDate.Value.ToString("yyMMdd");
            }
            else
            {
                lotCode = batch.BatchNo;
            }

            // Create best before date - apply Crystal Report logic
            string bestBeforeDate;
            if (batch.ExpiryDate.HasValue)
            {
                bestBeforeDate = DateOnly.FromDateTime(batch.ExpiryDate.Value).ToString("dd/MM/yy");
            }
            else if (prodDate.HasValue)
            {
                // Add shelf life days to production date, fallback to 30 days if none specified
                int daysToAdd = 30; // default
                
                if (batch.ShelfLifeDays.HasValue && batch.ShelfLifeDays.Value > 0)
                {
                    daysToAdd = batch.ShelfLifeDays.Value;
                }
                else if (batch.DaysToExpire.HasValue && batch.DaysToExpire.Value > 0)
                {
                    daysToAdd = batch.DaysToExpire.Value;
                }
                
                var expiryDate = prodDate.Value.AddDays(daysToAdd);
                bestBeforeDate = DateOnly.FromDateTime(expiryDate).ToString("dd/MM/yy");
            }
            else
            {
                bestBeforeDate = "";
            }

            // Default values if not provided by batch
            var netWeight = batch.NET_WEIGHT1 ?? 20.00m;
            var netWeightUnit = batch.PACKUNIT1 ?? "CTN";
            var netWeightCaption = "NET WEIGHT";
            var productionDateCaption = batch.ProductionDateCaption ?? "LOT CODE";
            var expiryDateCaption = batch.ExpiryDateCaption ?? "BEST BEFORE";
            var soNumber = batch.SONumber ?? "";
            var printDate = DateTime.UtcNow.ToString("dd/MM/yy HH:mm");
            
            // Storage condition
            var storageCondition = batch.StorageCondition ?? "Store under dry cool condition";
            
            // Allergen information
            _logger.LogInformation("ALLERGEN1 value in CreateStandardTemplate: {Allergen1}", batch.ALLERGEN1);
            var allergen1 = !string.IsNullOrEmpty(batch.ALLERGEN1) ? batch.ALLERGEN1 : "NONE";
            var allergen2BeforeColon = batch.ALLERGEN2_BeforeColon;
            var allergen2AfterColon = batch.ALLERGEN2_AfterColon;
            var allergen3BeforeColon = batch.ALLERGEN3_BeforeColon;
            var allergen3AfterColon = batch.ALLERGEN3_AfterColon;
            
            // Special overrides
            var thaiFlourOverride = batch.ProductKey == "TC410C05" ? "แป้งสาลี" : "";
            
            // Create template - ใช้เฉพาะฟิลด์ที่มีในคลาส LabelTemplate
            var template = new FgLabel.Api.Models.LabelTemplate
            {
                id = Guid.NewGuid().ToString(),
                name = $"{batch.ProductKey ?? "Unknown"} - {batch.BatchNo}",
                canvasSize = new FgLabel.Api.Models.Size { width = 400, height = 400 },
                elements = new List<FgLabel.Api.Models.LabelElement>
                {
                    // White background
                    new FgLabel.Api.Models.LabelElement
                    {
                        id = Guid.NewGuid().ToString(),
                        type = "rectangle",
                        x = 0,
                        y = 0,
                        width = 400,
                        height = 400,
                        fill = "#FFFFFF",
                        layer = 1
                    },
                    
                    // Product name (top center) - ปรับเป็นไม่ใช้ตัวหนา
                    new FgLabel.Api.Models.LabelElement
                    {
                        id = Guid.NewGuid().ToString(),
                        type = "text",
                        x = 50,
                        y = 20,
                        width = 300,
                        height = 30,
                        text = batch.ProductName,
                        fontSize = 18,
                        fontFamily = "Arial",
                        fontStyle = "normal", // เปลี่ยนเป็น normal จาก bold
                        fill = "#000000",
                        align = "center",
                        layer = 2
                    },
                    
                    // Product key (top center, below product name) - ปรับเป็นตัวหนา
                    new FgLabel.Api.Models.LabelElement
                    {
                        id = Guid.NewGuid().ToString(),
                        type = "text",
                        x = 50,
                        y = 55,
                        width = 300,
                        height = 25,
                        text = batch.ProductKey,
                        fontSize = 16,
                        fontFamily = "Arial",
                        fontStyle = "bold", // ยืนยันว่าเป็น bold
                        fill = "#000000",
                        align = "center",
                        layer = 2
                    },
                    
                    // Net weight (with value)
                    new FgLabel.Api.Models.LabelElement
                    {
                        id = Guid.NewGuid().ToString(),
                        type = "text",
                        x = 50,
                        y = 100,
                        width = 300,
                        height = 20,
                        text = $"{netWeightCaption}: {netWeight} KG/{netWeightUnit}",
                        fontSize = 14,
                        fontFamily = "Arial",
                        fontStyle = "normal",
                        fill = "#000000",
                        align = "left",
                        layer = 2
                    },
                    
                    // Lot Code (production date)
                    new FgLabel.Api.Models.LabelElement
                    {
                        id = Guid.NewGuid().ToString(),
                        type = "text",
                        x = 50,
                        y = 130,
                        width = 300,
                        height = 20,
                        text = $"{productionDateCaption}: {formattedProdDate}",
                        fontSize = 14,
                        fontFamily = "Arial",
                        fontStyle = "normal",
                        fill = "#000000",
                        align = "left",
                        layer = 2
                    },
                    
                    // Best Before (expiry date)
                    new FgLabel.Api.Models.LabelElement
                    {
                        id = Guid.NewGuid().ToString(),
                        type = "text",
                        x = 50,
                        y = 160,
                        width = 300,
                        height = 20,
                        text = $"{expiryDateCaption}: {bestBeforeDate}",
                        fontSize = 14,
                        fontFamily = "Arial",
                        fontStyle = "normal",
                        fill = "#000000",
                        align = "left",
                        layer = 2
                    },
                    
                    // ALLERGENS (moved before storage condition)
                    new FgLabel.Api.Models.LabelElement
                    {
                        id = Guid.NewGuid().ToString(),
                        type = "text",
                        x = 50,
                        y = 190,
                        width = 300,
                        height = 20,
                        text = $"ALLERGENS: {allergen1}",
                        fontSize = 14,
                        fontFamily = "Arial",
                        fontStyle = "normal",
                        fill = "#000000",
                        align = "left",
                        layer = 2
                    },
                    
                    // Recommended Storage (after allergens with updated text format)
                    new FgLabel.Api.Models.LabelElement
                    {
                        id = Guid.NewGuid().ToString(),
                        type = "text",
                        x = 50,
                        y = 220,
                        width = 300,
                        height = 20,
                        text = $"Recommended Storage: {storageCondition}",
                        fontSize = 14,
                        fontFamily = "Arial",
                        fontStyle = "normal",
                        fill = "#000000",
                        align = "left",
                        layer = 2
                    },
                    
                    // Barcode (bottom area) - use BatchNo instead of LotCode
                    new FgLabel.Api.Models.LabelElement
                    {
                        id = Guid.NewGuid().ToString(),
                        type = "barcode",
                        x = 50,
                        y = 320,
                        width = 300,
                        height = 50,
                        value = batch.BatchNo,
                        format = "CODE128",
                        layer = 2
                    },
                    
                    // Print date (small, bottom right corner)
                    new FgLabel.Api.Models.LabelElement
                    {
                        id = Guid.NewGuid().ToString(),
                        type = "text",
                        x = 300,
                        y = 370,
                        width = 80,
                        height = 15,
                        text = printDate,
                        fontSize = 8,
                        fontFamily = "Arial",
                        fontStyle = "normal",
                        fill = "#999999",
                        align = "right",
                        layer = 2
                    }
                }
            };

            // Remove allergen info from default elements since we've already added it

            // Add ALLERGEN2 information if available
            if (!string.IsNullOrEmpty(allergen2BeforeColon))
            {
                template.elements.Add(new FgLabel.Api.Models.LabelElement
                {
                    id = Guid.NewGuid().ToString(),
                    type = "text",
                    x = 50,
                    y = 245,
                    width = 300,
                    height = 20,
                    text = $"{allergen2BeforeColon}: {allergen2AfterColon}",
                    fontSize = 14,
                    fontFamily = "Arial",
                    fontStyle = "normal",
                    fill = "#000000",
                    align = "left",
                    layer = 2
                });
            }

            // Add Thai Flour Override if product is TC410C05
            if (!string.IsNullOrEmpty(thaiFlourOverride))
            {
                template.elements.Add(new FgLabel.Api.Models.LabelElement
                {
                    id = Guid.NewGuid().ToString(),
                    type = "text",
                    x = 50,
                    y = 270,
                    width = 300,
                    height = 20,
                    text = thaiFlourOverride,
                    fontSize = 14,
                    fontFamily = "Arial",
                    fontStyle = "normal",
                    fill = "#000000",
                    align = "left",
                    layer = 2
                });
            }

            // Add S/O information if available
            if (!string.IsNullOrEmpty(soNumber))
            {
                template.elements.Add(new FgLabel.Api.Models.LabelElement
                {
                    id = Guid.NewGuid().ToString(),
                    type = "text",
                    x = 50,
                    y = 295,
                    width = 300,
                    height = 20,
                    text = $"S/O: {soNumber}",
                    fontSize = 14,
                    fontFamily = "Arial",
                    fontStyle = "normal",
                    fill = "#000000",
                    align = "left",
                    layer = 2
                });
            }

            return template;
        }

        public async Task<int> GetMappingForBatchAsync(string batchNo)
        {
            try
            {
                // ดึงข้อมูล batch
                var batchSql = @"SELECT ItemKeyResolved as ProductKey, CustKeyResolved as CustomerKey, 
                                ItemKey, CustKey, Product as ProductName
                                FROM FgL.vw_Label_PrintSummary 
                                WHERE BatchNo = @BatchNo";
                var batch = await _sql.GetConnection().QueryFirstOrDefaultAsync(batchSql, new { BatchNo = batchNo });
                
                if (batch == null)
                {
                    _logger.LogWarning("ไม่พบ batch {BatchNo}", batchNo);
                    return 0;
                }
                
                // เก็บค่า ProductKey และ CustomerKey เป็น string
                // ให้ความสำคัญกับ ItemKeyResolved และ CustKeyResolved ก่อน
                string? productKeyStr = batch.ProductKey?.ToString() ?? batch.ItemKey?.ToString();
                string? customerKeyStr = batch.CustomerKey?.ToString() ?? batch.CustKey?.ToString();
                
                _logger.LogInformation("ค้นหา template สำหรับ batch {BatchNo} ด้วย ProductKey={ProductKey}, CustomerKey={CustomerKey}",
                    batchNo, productKeyStr ?? "null", customerKeyStr ?? "null");
                
                // ตรวจสอบว่า stored procedure มีอยู่หรือไม่
                bool spExists = await CheckStoredProcedureExists("FgL.GetTemplateByProductAndCustomerKeys");
                
                int? templateId = null;
                
                if (spExists)
                {
                    // ใช้ stored procedure ที่สร้างไว้ค้นหา template จากทั้งตาราง string mapping ใหม่และตารางเก่า
                    var spSql = "EXEC FgL.GetTemplateByProductAndCustomerKeys @ProductKey, @CustomerKey";
                    templateId = await _sql.GetConnection().ExecuteScalarAsync<int?>(spSql, 
                        new { ProductKey = productKeyStr, CustomerKey = customerKeyStr });
                }
                else
                {
                    _logger.LogWarning("ไม่พบ stored procedure FgL.GetTemplateByProductAndCustomerKeys จะใช้การค้นหาตรงแทน");
                    
                    // ค้นหาจากตาราง TemplateMappingProductCustomerString ก่อน (ถ้ามีทั้ง product และ customer key)
                    if (!string.IsNullOrEmpty(productKeyStr) && !string.IsNullOrEmpty(customerKeyStr))
                    {
                        var sql = @"
                            SELECT TOP 1 TemplateId
                            FROM FgL.TemplateMappingProductCustomerString
                            WHERE Active = 1
                              AND ProductKeyString = @ProductKey
                              AND CustomerKeyString = @CustomerKey
                            ORDER BY ID DESC";
                              
                        templateId = await _sql.GetConnection().ExecuteScalarAsync<int?>(sql,
                            new { ProductKey = productKeyStr, CustomerKey = customerKeyStr });
                    }
                    
                    // ถ้าไม่พบ ค้นหาจากตาราง TemplateMappingProductString (ถ้ามี product key)
                    if ((templateId == null || templateId == 0) && !string.IsNullOrEmpty(productKeyStr))
                    {
                        var sql = @"
                            SELECT TOP 1 TemplateId
                            FROM FgL.TemplateMappingProductString
                            WHERE Active = 1
                              AND ProductKeyString = @ProductKey
                            ORDER BY ID DESC";
                              
                        templateId = await _sql.GetConnection().ExecuteScalarAsync<int?>(sql,
                            new { ProductKey = productKeyStr });
                    }
                    
                    // ถ้าไม่พบ ค้นหาจากตาราง TemplateMappingCustomerString (ถ้ามี customer key)
                    if ((templateId == null || templateId == 0) && !string.IsNullOrEmpty(customerKeyStr))
                    {
                        var sql = @"
                            SELECT TOP 1 TemplateId
                            FROM FgL.TemplateMappingCustomerString
                            WHERE Active = 1
                              AND CustomerKeyString = @CustomerKey
                            ORDER BY ID DESC";
                              
                        templateId = await _sql.GetConnection().ExecuteScalarAsync<int?>(sql,
                            new { CustomerKey = customerKeyStr });
                    }
                    
                    // ถ้ายังไม่พบอีก ให้ลองค้นหาจากตาราง LabelTemplate โดยตรง
                    if (templateId == null || templateId == 0)
                    {
                        var sql = @"
                            SELECT TOP 1 TemplateID
                            FROM FgL.LabelTemplate
                            WHERE Active = 1
                              AND (
                                  (ProductKey = @ProductKey AND CustomerKey = @CustomerKey)
                                  OR (ProductKey = @ProductKey AND (CustomerKey IS NULL OR CustomerKey = ''))
                                  OR (CustomerKey = @CustomerKey AND (ProductKey IS NULL OR ProductKey = ''))
                              )
                            ORDER BY
                              CASE
                                  WHEN ProductKey = @ProductKey AND CustomerKey = @CustomerKey THEN 1
                                  WHEN ProductKey = @ProductKey THEN 2
                                  WHEN CustomerKey = @CustomerKey THEN 3
                                  ELSE 4
                              END,
                              TemplateID DESC";
                              
                        templateId = await _sql.GetConnection().ExecuteScalarAsync<int?>(sql,
                            new { ProductKey = productKeyStr, CustomerKey = customerKeyStr });
                    }
                }
                
                if (templateId.HasValue && templateId.Value > 0)
                {
                    _logger.LogInformation("พบ template {TemplateId} สำหรับ batch {BatchNo}", templateId, batchNo);
                    return templateId.Value;
                }
                
                _logger.LogInformation("ไม่พบ template mapping สำหรับ ProductKey={ProductKey}, CustomerKey={CustomerKey} จะสร้าง template ใหม่",
                    productKeyStr ?? "null", customerKeyStr ?? "null");
                    
                // สร้าง template ใหม่อัตโนมัติ
                var autoCreateRequest = new AutoCreateRequest
                {
                    BatchNo = batchNo
                };
                
                var newTemplateId = await AutoCreateTemplateAsync(autoCreateRequest);
                
                if (newTemplateId > 0)
                {
                    _logger.LogInformation("สร้าง template ใหม่ {TemplateId} สำหรับ batch {BatchNo}", newTemplateId, batchNo);
                    return newTemplateId;
                }
                
                _logger.LogWarning("ไม่สามารถสร้าง template ใหม่สำหรับ batch {BatchNo} ได้", batchNo);
                return 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error finding or creating template mapping for batch {BatchNo}", batchNo);
                return 0;
            }
        }
        
        public async Task<bool> DeleteTemplateAsync(int templateId)
        {
            try
            {
                var sql = "UPDATE FgL.LabelTemplate SET Active = 0 WHERE TemplateID = @TemplateID";
                var result = await _sql.GetConnection().ExecuteAsync(sql, new { TemplateID = templateId });
                return result > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting template {TemplateID}", templateId);
                return false;
            }
        }

        // เพิ่มเมธอดใหม่สำหรับตรวจสอบว่า stored procedure มีอยู่ในฐานข้อมูลหรือไม่
        private async Task<bool> CheckStoredProcedureExists(string procedureName)
        {
            try
            {
                var sql = @"
                    SELECT COUNT(1) 
                    FROM sys.objects 
                    WHERE type = 'P' 
                      AND OBJECT_ID = OBJECT_ID(@ProcedureName)";
                
                var count = await _sql.GetConnection().ExecuteScalarAsync<int>(sql, new { ProcedureName = procedureName });
                return count > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "เกิดข้อผิดพลาดในการตรวจสอบ stored procedure {ProcedureName}", procedureName);
                return false;
            }
        }

        // เพิ่มเมธอดที่ถูกเรียกใช้ใน TemplateController
        public async Task<TemplateDto> GetOrCreateByBatch(string batchNo)
        {
            try
            {
                _logger.LogInformation("Getting or creating template for batch {BatchNo}", batchNo);
                
                // ดึงข้อมูล template ID จาก batch ที่ระบุ
                var templateId = await GetMappingForBatchAsync(batchNo);
                
                if (templateId <= 0)
                {
                    _logger.LogWarning("No template found for batch {BatchNo}, creating new template", batchNo);
                    // สร้าง template ใหม่อัตโนมัติ
                    var request = new AutoCreateRequest { BatchNo = batchNo };
                    templateId = await AutoCreateTemplateAsync(request);
                }
                
                if (templateId <= 0)
                {
                    _logger.LogError("Failed to create template for batch {BatchNo}", batchNo);
                    return await Task.FromResult<TemplateDto>(null!);
                }
                
                // ดึงข้อมูล template
                return await GetTemplateById(templateId) ?? new TemplateDto { Id = -1, Name = "Error Template" };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in GetOrCreateByBatch for batch {BatchNo}: {Message}", batchNo, ex.Message);
                return await Task.FromResult<TemplateDto>(null!);
            }
        }
        
        public async Task<bool> UpdateTemplate(int templateId, TemplateUpdateDto dto)
        {
            try
            {
                _logger.LogInformation("Updating template {TemplateId}", templateId);
                
                // ตรวจสอบว่า template มีอยู่หรือไม่
                var existingSql = "SELECT COUNT(1) FROM FgL.LabelTemplate WHERE TemplateID = @TemplateId AND Active = 1";
                var exists = await _sql.GetConnection().ExecuteScalarAsync<int>(existingSql, new { TemplateId = templateId }) > 0;
                
                if (!exists)
                {
                    _logger.LogWarning("Template {TemplateId} not found or not active", templateId);
                    return false;
                }
                
                // อัพเดตข้อมูล template
                var updateSql = @"
                    UPDATE FgL.LabelTemplate
                    SET Name = @Name,
                        Description = @Description,
                        ProductKey = @ProductKey,
                        CustomerKey = @CustomerKey,
                        Engine = @Engine,
                        PaperSize = @PaperSize,
                        Orientation = @Orientation,
                        CustomWidth = @CustomWidth,
                        CustomHeight = @CustomHeight,
                        Content = @Content,
                        UpdatedAt = GETUTCDATE()
                    WHERE TemplateID = @TemplateId AND Active = 1";
                
                await _sql.GetConnection().ExecuteAsync(updateSql, new
                {
                    TemplateId = templateId,
                    dto.Name,
                    dto.Description,
                    dto.ProductKey,
                    dto.CustomerKey,
                    dto.Engine,
                    dto.PaperSize,
                    dto.Orientation,
                    dto.CustomWidth,
                    dto.CustomHeight,
                    dto.Content
                });
                
                // อัพเดต components ถ้ามี
                if (dto.Components != null && dto.Components.Any())
                {
                    // ลบ components เดิม
                    var deleteSql = "DELETE FROM FgL.LabelTemplateComponent WHERE TemplateID = @TemplateId";
                    await _sql.GetConnection().ExecuteAsync(deleteSql, new { TemplateId = templateId });
                    
                    // เพิ่ม components ใหม่
                    var insertSql = @"
                        INSERT INTO FgL.LabelTemplateComponent (
                            TemplateID, ComponentType, X, Y, W, H, FontName, FontSize,
                            FontWeight, FontStyle, Fill, Align, Placeholder, StaticText,
                            BarcodeFormat, QrcodeFormat, ImageUrl, Layer, Visible,
                            BorderWidth, BorderColor, BorderStyle, CreatedAt
                        ) VALUES (
                            @TemplateId, @ComponentType, @X, @Y, @W, @H, @FontName, @FontSize,
                            @FontWeight, @FontStyle, @Fill, @Align, @Placeholder, @StaticText,
                            @BarcodeFormat, @QrcodeFormat, @ImageUrl, @Layer, @Visible,
                            @BorderWidth, @BorderColor, @BorderStyle, GETUTCDATE()
                        )";
                    
                    foreach (var component in dto.Components)
                    {
                        await _sql.GetConnection().ExecuteAsync(insertSql, new
                        {
                            TemplateId = templateId,
                            component.ComponentType,
                            component.X,
                            component.Y,
                            component.W,
                            component.H,
                            component.FontName,
                            component.FontSize,
                            component.FontWeight,
                            component.FontStyle,
                            component.Fill,
                            component.Align,
                            component.Placeholder,
                            component.StaticText,
                            component.BarcodeFormat,
                            component.QrcodeFormat,
                            component.ImageUrl,
                            component.Layer,
                            component.Visible,
                            component.BorderWidth,
                            component.BorderColor,
                            component.BorderStyle
                        });
                    }
                }
                
                // อัพเดต mapping ด้วย
                if (!string.IsNullOrEmpty(dto.ProductKey) || !string.IsNullOrEmpty(dto.CustomerKey))
                {
                    await UpdateTemplateMappingAsync(templateId, dto.ProductKey, dto.CustomerKey);
                }
                
                _logger.LogInformation("Template {TemplateId} updated successfully", templateId);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating template {TemplateId}: {Message}", templateId, ex.Message);
                return false;
            }
        }
        
        public async Task<TemplateDto> GetTemplateById(int templateId)
        {
            try
            {
                _logger.LogInformation("Getting template {TemplateId}", templateId);
                
                // ดึงข้อมูล template
                var templateSql = @"
                    SELECT 
                        TemplateID as Id,
                        Name,
                        Description,
                        ProductKey,
                        CustomerKey,
                        Engine,
                        PaperSize,
                        Orientation,
                        CustomWidth,
                        CustomHeight,
                        Content
                    FROM FgL.LabelTemplate
                    WHERE TemplateID = @TemplateId AND Active = 1";
                
                var template = await _sql.GetConnection().QueryFirstOrDefaultAsync<TemplateDto>(templateSql, new { TemplateId = templateId });
                
                if (template == null)
                {
                    _logger.LogWarning("Template {TemplateId} not found or not active", templateId);
                    return new TemplateDto { Id = -1, Name = $"Template-{templateId}-NotFound" };
                }
                
                // ดึงข้อมูล components
                var componentsSql = @"
                    SELECT 
                        ComponentID as ComponentId,
                        ComponentType,
                        X, Y, W, H,
                        FontName, FontSize, FontWeight, FontStyle,
                        Fill, Align, Placeholder, StaticText,
                        BarcodeFormat, QrcodeFormat, ImageUrl,
                        Layer, Visible,
                        BorderWidth, BorderColor, BorderStyle
                    FROM FgL.LabelTemplateComponent
                    WHERE TemplateID = @TemplateId
                    ORDER BY Layer, ComponentID";
                
                var components = await _sql.GetConnection().QueryAsync<TemplateComponentDto>(componentsSql, new { TemplateId = templateId });
                
                if (components != null)
                {
                    template.Components = components.ToList();
                }
                
                // ดึงข้อมูล settings
                template.Settings = new TemplateSettingsDto
                {
                    Name = template.Name,
                    Description = template.Description,
                    Engine = template.Engine,
                    PaperSize = template.PaperSize,
                    Orientation = template.Orientation,
                    CustomWidth = template.CustomWidth,
                    CustomHeight = template.CustomHeight
                };
                
                _logger.LogInformation("Template {TemplateId} retrieved successfully", templateId);
                return template;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting template {TemplateId}: {Message}", templateId, ex.Message);
                return new TemplateDto { Id = -1, Name = $"Error-{templateId}" };
            }
        }
    }
}