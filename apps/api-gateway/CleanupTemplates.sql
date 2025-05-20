-- ไฟล์สำหรับทำความสะอาด templates ที่มี productKey และ customerKey ซ้ำกัน
-- ทำให้เฉพาะ template ล่าสุดเท่านั้นที่เป็น active

-- แสดงจำนวน templates ที่ซ้ำซ้อนก่อนทำความสะอาด
PRINT N'สถานะก่อนทำความสะอาด:';
SELECT ProductKey, CustomerKey, COUNT(*) AS TotalTemplates,
       SUM(CASE WHEN Active = 1 THEN 1 ELSE 0 END) AS ActiveTemplates
FROM FgL.LabelTemplate
WHERE ProductKey IS NOT NULL AND ProductKey <> '' 
   AND CustomerKey IS NOT NULL AND CustomerKey <> ''
GROUP BY ProductKey, CustomerKey
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 1. ทำความสะอาด templates ที่มีทั้ง ProductKey และ CustomerKey ซ้ำกัน
BEGIN TRANSACTION;

-- ทำให้ templates เก่าทั้งหมดเป็น inactive
DECLARE @DuplicateProductCustomer TABLE (
    ProductKey NVARCHAR(50),
    CustomerKey NVARCHAR(50)
);

-- ค้นหา ProductKey และ CustomerKey ที่มี templates ซ้ำซ้อน
INSERT INTO @DuplicateProductCustomer (ProductKey, CustomerKey)
SELECT ProductKey, CustomerKey
FROM FgL.LabelTemplate
WHERE ProductKey IS NOT NULL AND ProductKey <> '' 
   AND CustomerKey IS NOT NULL AND CustomerKey <> ''
   AND Active = 1
GROUP BY ProductKey, CustomerKey
HAVING COUNT(*) > 1;

PRINT N'พบ ProductKey + CustomerKey ที่ซ้ำซ้อน: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' คู่';

-- ทำการปรับปรุงให้เฉพาะ template ล่าสุดที่ active
DECLARE @ProductKey NVARCHAR(50), @CustomerKey NVARCHAR(50);
DECLARE @LatestTemplateID INT;

-- วนลูปทุกคู่ ProductKey และ CustomerKey ที่ซ้ำซ้อน
DECLARE duplicate_cursor CURSOR FOR
SELECT ProductKey, CustomerKey FROM @DuplicateProductCustomer;

OPEN duplicate_cursor;
FETCH NEXT FROM duplicate_cursor INTO @ProductKey, @CustomerKey;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- หา template ล่าสุด (TemplateID มากที่สุด) สำหรับคู่นี้
    SELECT @LatestTemplateID = MAX(TemplateID)
    FROM FgL.LabelTemplate
    WHERE ProductKey = @ProductKey AND CustomerKey = @CustomerKey;
    
    PRINT N'กำลังทำความสะอาด ProductKey=' + @ProductKey + ', CustomerKey=' + @CustomerKey + ', เก็บเฉพาะ TemplateID=' + CAST(@LatestTemplateID AS NVARCHAR(10));
    
    -- ทำให้ templates อื่นๆ ที่ไม่ใช่อันล่าสุดเป็น inactive
    UPDATE FgL.LabelTemplate
    SET Active = 0, UpdatedAt = GETDATE()
    WHERE ProductKey = @ProductKey 
      AND CustomerKey = @CustomerKey
      AND TemplateID <> @LatestTemplateID;
    
    -- ทำให้ template mapping เก่าเป็น inactive ด้วย
    UPDATE FgL.TemplateMappingProductString
    SET Active = 0
    WHERE TemplateID IN (
        SELECT TemplateID 
        FROM FgL.LabelTemplate
        WHERE ProductKey = @ProductKey 
          AND CustomerKey = @CustomerKey
          AND TemplateID <> @LatestTemplateID
    );
    
    UPDATE FgL.TemplateMappingCustomerString
    SET Active = 0
    WHERE TemplateID IN (
        SELECT TemplateID 
        FROM FgL.LabelTemplate
        WHERE ProductKey = @ProductKey 
          AND CustomerKey = @CustomerKey
          AND TemplateID <> @LatestTemplateID
    );
    
    UPDATE FgL.TemplateMappingProductCustomerString
    SET Active = 0
    WHERE TemplateID IN (
        SELECT TemplateID 
        FROM FgL.LabelTemplate
        WHERE ProductKey = @ProductKey 
          AND CustomerKey = @CustomerKey
          AND TemplateID <> @LatestTemplateID
    );
    
    -- ตรวจสอบว่ามี mapping ของ template ล่าสุดหรือไม่
    IF NOT EXISTS (SELECT 1 FROM FgL.TemplateMappingProductCustomerString 
                   WHERE TemplateID = @LatestTemplateID 
                     AND ProductKeyString = @ProductKey 
                     AND CustomerKeyString = @CustomerKey
                     AND Active = 1)
    BEGIN
        -- ถ้าไม่มี ให้สร้าง mapping ใหม่
        INSERT INTO FgL.TemplateMappingProductCustomerString (TemplateID, ProductKeyString, CustomerKeyString, Active, CreatedAt)
        VALUES (@LatestTemplateID, @ProductKey, @CustomerKey, 1, GETDATE());
        
        -- สร้าง mapping ของ ProductKey ด้วย
        IF NOT EXISTS (SELECT 1 FROM FgL.TemplateMappingProductString 
                       WHERE TemplateID = @LatestTemplateID 
                         AND ProductKeyString = @ProductKey
                         AND Active = 1)
        BEGIN
            INSERT INTO FgL.TemplateMappingProductString (TemplateID, ProductKeyString, Active, CreatedAt)
            VALUES (@LatestTemplateID, @ProductKey, 1, GETDATE());
        END;
    END;
    
    FETCH NEXT FROM duplicate_cursor INTO @ProductKey, @CustomerKey;
END;

CLOSE duplicate_cursor;
DEALLOCATE duplicate_cursor;

-- 2. ทำความสะอาด templates ที่มีแค่ ProductKey ซ้ำกัน (ไม่มี CustomerKey)
DECLARE @DuplicateProduct TABLE (ProductKey NVARCHAR(50));

-- ค้นหา ProductKey ที่มี templates ซ้ำซ้อน
INSERT INTO @DuplicateProduct (ProductKey)
SELECT ProductKey
FROM FgL.LabelTemplate
WHERE ProductKey IS NOT NULL AND ProductKey <> '' 
   AND (CustomerKey IS NULL OR CustomerKey = '')
   AND Active = 1
GROUP BY ProductKey
HAVING COUNT(*) > 1;

PRINT N'พบ ProductKey ที่ซ้ำซ้อน (ไม่มี CustomerKey): ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' รายการ';

-- ทำการปรับปรุงให้เฉพาะ template ล่าสุดที่ active
DECLARE product_cursor CURSOR FOR
SELECT ProductKey FROM @DuplicateProduct;

OPEN product_cursor;
FETCH NEXT FROM product_cursor INTO @ProductKey;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- หา template ล่าสุด (TemplateID มากที่สุด) สำหรับ ProductKey นี้
    SELECT @LatestTemplateID = MAX(TemplateID)
    FROM FgL.LabelTemplate
    WHERE ProductKey = @ProductKey AND (CustomerKey IS NULL OR CustomerKey = '');
    
    PRINT N'กำลังทำความสะอาด ProductKey=' + @ProductKey + ' (ไม่มี CustomerKey), เก็บเฉพาะ TemplateID=' + CAST(@LatestTemplateID AS NVARCHAR(10));
    
    -- ทำให้ templates อื่นๆ ที่ไม่ใช่อันล่าสุดเป็น inactive
    UPDATE FgL.LabelTemplate
    SET Active = 0, UpdatedAt = GETDATE()
    WHERE ProductKey = @ProductKey 
      AND (CustomerKey IS NULL OR CustomerKey = '')
      AND TemplateID <> @LatestTemplateID;
    
    -- ทำให้ template mapping เก่าเป็น inactive ด้วย
    UPDATE FgL.TemplateMappingProductString
    SET Active = 0
    WHERE TemplateID IN (
        SELECT TemplateID 
        FROM FgL.LabelTemplate
        WHERE ProductKey = @ProductKey 
          AND (CustomerKey IS NULL OR CustomerKey = '')
          AND TemplateID <> @LatestTemplateID
    );
    
    -- ตรวจสอบว่ามี mapping ของ template ล่าสุดหรือไม่
    IF NOT EXISTS (SELECT 1 FROM FgL.TemplateMappingProductString 
                   WHERE TemplateID = @LatestTemplateID 
                     AND ProductKeyString = @ProductKey
                     AND Active = 1)
    BEGIN
        -- ถ้าไม่มี ให้สร้าง mapping ใหม่
        INSERT INTO FgL.TemplateMappingProductString (TemplateID, ProductKeyString, Active, CreatedAt)
        VALUES (@LatestTemplateID, @ProductKey, 1, GETDATE());
    END;
    
    FETCH NEXT FROM product_cursor INTO @ProductKey;
END;

CLOSE product_cursor;
DEALLOCATE product_cursor;

COMMIT TRANSACTION;

-- แสดงสถานะหลังทำความสะอาด
PRINT N'';
PRINT N'สถานะหลังทำความสะอาด:';
SELECT ProductKey, CustomerKey, COUNT(*) AS TotalTemplates,
       SUM(CASE WHEN Active = 1 THEN 1 ELSE 0 END) AS ActiveTemplates
FROM FgL.LabelTemplate
WHERE ProductKey IS NOT NULL AND ProductKey <> '' 
   AND CustomerKey IS NOT NULL AND CustomerKey <> ''
GROUP BY ProductKey, CustomerKey
HAVING COUNT(*) > 1 OR SUM(CASE WHEN Active = 1 THEN 1 ELSE 0 END) > 1
ORDER BY COUNT(*) DESC;

PRINT N'สถานะ ProductKey เดียว (ไม่มี CustomerKey) หลังทำความสะอาด:';
SELECT ProductKey, COUNT(*) AS TotalTemplates,
       SUM(CASE WHEN Active = 1 THEN 1 ELSE 0 END) AS ActiveTemplates
FROM FgL.LabelTemplate
WHERE ProductKey IS NOT NULL AND ProductKey <> '' 
   AND (CustomerKey IS NULL OR CustomerKey = '')
GROUP BY ProductKey
HAVING COUNT(*) > 1 OR SUM(CASE WHEN Active = 1 THEN 1 ELSE 0 END) > 1
ORDER BY COUNT(*) DESC; 