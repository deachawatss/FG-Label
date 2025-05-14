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
            try
            {
                _logger.LogInformation("เริ่มสร้าง template อัตโนมัติสำหรับ BatchNo: {BatchNo}", request.BatchNo);
                
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
                
                // ดึงข้อมูล product และ customer จากฐานข้อมูล
                string? productKey = null;
                string? productName = null;
                string? customerKey = null;
                
                // ลองดึงข้อมูลจาก ItemKeyResolved ก่อน แล้วค่อยใช้ ItemKey เป็นตัวสำรอง
                if (batchDict.TryGetValue("ItemKeyResolved", out var resolvedProdKey) && resolvedProdKey != null)
                {
                    productKey = resolvedProdKey.ToString();
                    _logger.LogInformation("ใช้ค่า ItemKeyResolved: {ItemKey}", productKey);
                }
                else if (batchDict.TryGetValue("ItemKey", out var prodKey) && prodKey != null)
                {
                    productKey = prodKey.ToString();
                    _logger.LogInformation("ใช้ค่า ItemKey: {ItemKey}", productKey);
                }
                
                // ดึงชื่อสินค้า
                if (batchDict.TryGetValue("Product", out var prodName) && prodName != null)
                {
                    productName = prodName.ToString();
                    _logger.LogInformation("ชื่อสินค้า: {ProductName}", productName);
                }
                else if (batchDict.TryGetValue("BME_Product", out var bmeProdName) && bmeProdName != null)
                {
                    productName = bmeProdName.ToString();
                    _logger.LogInformation("ชื่อสินค้า (BME): {ProductName}", productName);
                }
                
                // ลองดึงข้อมูลจาก CustKeyResolved ก่อน แล้วค่อยใช้ CustKey เป็นตัวสำรอง
                if (batchDict.TryGetValue("CustKeyResolved", out var resolvedCustKey) && resolvedCustKey != null)
                {
                    customerKey = resolvedCustKey.ToString();
                    _logger.LogInformation("ใช้ค่า CustKeyResolved: {CustKey}", customerKey);
                }
                else if (batchDict.TryGetValue("CustKey", out var custKey) && custKey != null)
                {
                    customerKey = custKey.ToString();
                    _logger.LogInformation("ใช้ค่า CustKey: {CustKey}", customerKey);
                }
                
                batchDto.ProductKey = productKey;
                batchDto.ProductName = productName;
                batchDto.CustomerKey = customerKey;
                
                // ดึงข้อมูล batch ที่จำเป็น
                if (batchDict.TryGetValue("ProductionDate", out var prodDate))
                {
                    string? prodDateStr = prodDate?.ToString();
                    if (prodDateStr != null && DateTime.TryParse(prodDateStr, out var date))
                        batchDto.ProductionDate = date;
                }
                if (batchDict.TryGetValue("SchStartDate", out var schDate))
                {
                    string? schDateStr = schDate?.ToString();
                    if (schDateStr != null && DateTime.TryParse(schDateStr, out var date))
                        batchDto.SchStartDate = date;
                }
                if (batchDict.TryGetValue("SHELFLIFE_DAY", out var shelfLife))
                {
                    string? shelfLifeStr = shelfLife?.ToString();
                    if (shelfLifeStr != null && int.TryParse(shelfLifeStr, out var days))
                        batchDto.ShelfLifeDays = days;
                }
                if (batchDict.TryGetValue("DaysToExpire", out var daysToExpire))
                {
                    string? daysToExpireStr = daysToExpire?.ToString();
                    if (daysToExpireStr != null && int.TryParse(daysToExpireStr, out var days))
                        batchDto.DaysToExpire = days;
                }
                if (batchDict.TryGetValue("ExpiryDate", out var expiryDate))
                {
                    string? expiryDateStr = expiryDate?.ToString();
                    if (expiryDateStr != null && DateTime.TryParse(expiryDateStr, out var date))
                        batchDto.ExpiryDate = date;
                }
                if (batchDict.TryGetValue("TotalBags", out var totalBags))
                {
                    string? totalBagsStr = totalBags?.ToString();
                    if (totalBagsStr != null && int.TryParse(totalBagsStr, out var bags))
                        batchDto.TotalBags = bags;
                }
                
                // ดึงข้อมูลพื้นฐาน
                if (batchDict.TryGetValue("LOT CODE", out var lotCode)) batchDto.LotCode = lotCode?.ToString();
                if (batchDict.TryGetValue("STORECAP1", out var storage)) batchDto.StorageCondition = storage?.ToString();
                
                // ดึงข้อมูล ALLERGEN อย่างถูกต้อง
                if (batchDict.TryGetValue("ALLERGEN1", out var allergen1) && allergen1 != null)
                {
                    batchDto.ALLERGEN1 = allergen1.ToString();
                    _logger.LogInformation("ALLERGEN1: {Allergen1}", batchDto.ALLERGEN1);
                }
                
                if (batchDict.TryGetValue("ALLERGEN2", out var allergen2) && allergen2 != null)
                {
                    string allergen2Str = allergen2.ToString();
                    batchDto.ALLERGEN2 = allergen2Str;
                    
                    // แยกส่วนของ ALLERGEN2 ตามเครื่องหมาย :
                    if (!string.IsNullOrEmpty(allergen2Str) && allergen2Str.Contains(':'))
                    {
                        var colonIndex = allergen2Str.IndexOf(':');
                        if (colonIndex > 0)
                        {
                            batchDto.ALLERGEN2_BeforeColon = allergen2Str.Substring(0, colonIndex);
                            batchDto.ALLERGEN2_AfterColon = allergen2Str.Substring(colonIndex + 1).TrimStart();
                            _logger.LogInformation("ALLERGEN2 แยก: {Before} : {After}", 
                                batchDto.ALLERGEN2_BeforeColon, batchDto.ALLERGEN2_AfterColon);
                        }
                    }
                }
                
                if (batchDict.TryGetValue("ALLERGEN3", out var allergen3) && allergen3 != null)
                {
                    string allergen3Str = allergen3.ToString();
                    batchDto.ALLERGEN3 = allergen3Str;
                    
                    // แยกส่วนของ ALLERGEN3 ตามเครื่องหมาย :
                    if (!string.IsNullOrEmpty(allergen3Str) && allergen3Str.Contains(':'))
                    {
                        var colonIndex = allergen3Str.IndexOf(':');
                        if (colonIndex > 0)
                        {
                            batchDto.ALLERGEN3_BeforeColon = allergen3Str.Substring(0, colonIndex);
                            batchDto.ALLERGEN3_AfterColon = allergen3Str.Substring(colonIndex + 1).TrimStart();
                            _logger.LogInformation("ALLERGEN3 แยก: {Before} : {After}", 
                                batchDto.ALLERGEN3_BeforeColon, batchDto.ALLERGEN3_AfterColon);
                        }
                    }
                }
                
                // ข้อมูลเสริมอื่นๆ
                if (batchDict.TryGetValue("PRODATECAP", out var prodDateCap)) batchDto.ProductionDateCaption = prodDateCap?.ToString();
                if (batchDict.TryGetValue("EXPIRYDATECAP", out var expiryDateCap)) batchDto.ExpiryDateCaption = expiryDateCap?.ToString();
                if (batchDict.TryGetValue("COUNTRYOFORIGIN", out var country)) batchDto.CountryOfOriginLine = country?.ToString();
                if (batchDict.TryGetValue("PACKUNIT1", out var packUnit)) batchDto.PACKUNIT1 = packUnit?.ToString();
                if (batchDict.TryGetValue("NET_WEIGHT1", out var netWeight) && netWeight != null)
                {
                    if (decimal.TryParse(netWeight.ToString(), out var weight))
                        batchDto.NET_WEIGHT1 = weight;
                }
                
                _logger.LogInformation("สร้าง template จาก BatchDto: ProductName={ProductName}, ProductKey={ProductKey}", 
                    batchDto.ProductName, batchDto.ProductKey);
                
                // 3. สร้าง template จากข้อมูลที่ได้
                var template = CreateStandardTemplate(batchDto);
                
                // แปลง template เป็น JSON string
                var templateJson = System.Text.Json.JsonSerializer.Serialize(template);
                
                // 4. บันทึก template ลงฐานข้อมูล
                var sql = @"
                    INSERT INTO FgL.LabelTemplate 
                        (Name, Content, Version, CreatedBy, CreatedAt, UpdatedAt)
                    VALUES 
                        (@Name, @Content, @Version, @CreatedBy, @CreatedAt, @UpdatedAt);
                    SELECT SCOPE_IDENTITY();";
                
                // ไม่ใส่ค่า ProductKey และ CustomerKey เพื่อหลีกเลี่ยงปัญหาการแปลงค่าเป็น int
                var param = new
                {
                    Name = $"Auto-{request.BatchNo}-{DateTime.UtcNow:yyyyMMdd}",
                    Content = templateJson,
                    Version = 1,
                    CreatedBy = "system",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                
                var templateId = await _sql.GetConnection().ExecuteScalarAsync<int>(sql, param);
                _logger.LogInformation("สร้าง template {TemplateId} สำหรับ batch {BatchNo} เรียบร้อย", templateId, request.BatchNo);
                
                // 5. สร้าง mapping แยกตามประเภทข้อมูล
                await UpdateTemplateMappingAsync(productKey ?? string.Empty, customerKey ?? string.Empty, templateId);
                
                return templateId;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "เกิดข้อผิดพลาดในการสร้าง template อัตโนมัติสำหรับ BatchNo {BatchNo}: {Message}", request.BatchNo, ex.Message);
                return 0;
            }
        }

        private async Task UpdateTemplateMappingAsync(string productKey, string customerKey, int templateId)
        {
            // ตรวจสอบการแปลงค่า productKey และ customerKey เป็น int?
            int? productKeyInt = null;
            int? customerKeyInt = null;
            
            // ตรวจสอบการแปลงค่า productKey - เพิ่มการตรวจสอบว่าเป็นตัวเลขจริงๆ
            if (!string.IsNullOrEmpty(productKey) && productKey != "system" && 
                !productKey.Contains(" ") && // ป้องกันกรณีมีช่องว่าง
                int.TryParse(productKey, out var prodKeyInt))
            {
                productKeyInt = prodKeyInt;
            }
            
            // ตรวจสอบการแปลงค่า customerKey - เพิ่มการตรวจสอบว่าเป็นตัวเลขจริงๆ
            if (!string.IsNullOrEmpty(customerKey) && customerKey != "system" && 
                !customerKey.Contains(" ") && // ป้องกันกรณีมีช่องว่าง
                int.TryParse(customerKey, out var custKeyInt))
            {
                customerKeyInt = custKeyInt;
            }
            
            try
            {
                // Deactivate existing mappings for this template first
                var deactivateSql = @"
                    UPDATE FgL.LabelTemplateMapping 
                    SET IsActive = 0, UpdatedAt = GETUTCDATE(), UpdatedBy = 'system'
                    WHERE TemplateID = @TemplateID";
                
                await _sql.GetConnection().ExecuteAsync(deactivateSql, new { TemplateID = templateId });
                
                // Create new mapping - เพิ่มการตรวจสอบว่ามีค่า key หรือไม่
                if (productKeyInt.HasValue || customerKeyInt.HasValue)
                {
                    var createSql = @"
                        INSERT INTO FgL.LabelTemplateMapping (
                            TemplateID, ProductKey, CustomerKey, IsActive, CreatedAt, CreatedBy
                        ) VALUES (
                            @TemplateID, @ProductKey, @CustomerKey, 1, GETUTCDATE(), 'system'
                        )";
                    
                    await _sql.GetConnection().ExecuteAsync(createSql, new { 
                        TemplateID = templateId, 
                        ProductKey = productKeyInt, 
                        CustomerKey = customerKeyInt 
                    });
                    
                    _logger.LogInformation(
                        "Updated template mapping for Template {TemplateID}: ProductKey={ProductKey}, CustomerKey={CustomerKey}", 
                        templateId, productKeyInt, customerKeyInt);
                }
                else
                {
                    _logger.LogWarning(
                        "Skipping template mapping for Template {TemplateID} because ProductKey and CustomerKey are not valid integers", 
                        templateId);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating template mapping for Template {TemplateID}", templateId);
                // ไม่โยน exception ออกไปเพื่อให้การสร้าง template สำเร็จแม้จะไม่สามารถ map ได้
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
                        Name = dto.Name,
                        Description = dto.Description,
                        Engine = dto.Engine,
                        PaperSize = dto.PaperSize,
                        Orientation = dto.Orientation,
                        Content = dto.Content,
                        ProductKey = string.IsNullOrEmpty(dto.ProductKey) ? string.Empty : dto.ProductKey,
                        CustomerKey = string.IsNullOrEmpty(dto.CustomerKey) ? string.Empty : dto.CustomerKey
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
                            ProductKey = string.IsNullOrEmpty(dto.ProductKey) ? string.Empty : dto.ProductKey,
                            CustomerKey = string.IsNullOrEmpty(dto.CustomerKey) ? string.Empty : dto.CustomerKey
                        }, tran);
                        
                    // Insert mapping with Priority = 5 as default
                    await connection.ExecuteAsync(
                        @"INSERT INTO FgL.LabelTemplateMapping
                              (TemplateID, ProductKey, CustomerKey, Priority, Active, CreatedAt)
                          VALUES
                              (@TemplateID, @ProductKey, @CustomerKey, 5, 1, SYSUTCDATETIME());",
                        new { 
                            TemplateID = templateId,
                            ProductKey = string.IsNullOrEmpty(dto.ProductKey) ? string.Empty : dto.ProductKey,
                            CustomerKey = string.IsNullOrEmpty(dto.CustomerKey) ? string.Empty : dto.CustomerKey
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
                var batchSql = @"SELECT ItemKey, CustKey FROM FgL.vw_Label_PrintSummary WHERE BatchNo = @BatchNo";
                var batch = await _sql.GetConnection().QueryFirstOrDefaultAsync(batchSql, new { BatchNo = batchNo });
                
                if (batch == null)
                {
                    _logger.LogWarning("ไม่พบ batch {BatchNo}", batchNo);
                    return 0;
                }
                
                // แปลงค่า ItemKey และ CustKey เป็น int
                int? productKey = null;
                int? customerKey = null;
                
                if (int.TryParse(batch.ItemKey?.ToString(), out int prodKey))
                {
                    productKey = prodKey;
                }
                
                if (int.TryParse(batch.CustKey?.ToString(), out int custKey))
                {
                    customerKey = custKey;
                }
                
                // ค้นหา template mapping ที่เหมาะสม
                var sql = @"
                    SELECT TOP 1 TemplateID
                    FROM FgL.LabelTemplateMapping
                    WHERE IsActive = 1
                    AND (@ProductKey IS NULL OR ProductKey = @ProductKey)
                    AND (@CustomerKey IS NULL OR CustomerKey = @CustomerKey)
                    ORDER BY 
                        CASE 
                            WHEN ProductKey = @ProductKey AND CustomerKey = @CustomerKey THEN 1
                            WHEN ProductKey = @ProductKey AND CustomerKey IS NULL THEN 2
                            WHEN ProductKey IS NULL AND CustomerKey = @CustomerKey THEN 3
                            ELSE 4
                        END,
                        Priority";
                
                var templateId = await _sql.GetConnection().ExecuteScalarAsync<int?>(sql, new { ProductKey = productKey, CustomerKey = customerKey });
                
                return templateId ?? 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error finding template mapping for batch {BatchNo}", batchNo);
                return 0;
            }
        }
        
        public async Task<bool> DeleteTemplateAsync(int templateId)
        {
            try
            {
                var sql = "UPDATE FgL.LabelTemplate SET IsActive = 0 WHERE TemplateID = @TemplateID";
                var result = await _sql.GetConnection().ExecuteAsync(sql, new { TemplateID = templateId });
                return result > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting template {TemplateID}", templateId);
                return false;
            }
        }
    }
}