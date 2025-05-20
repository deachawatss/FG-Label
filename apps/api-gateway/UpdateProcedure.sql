-- ปรับปรุง Stored Procedure สำหรับการอัพเดต template mapping
-- ปรับให้รองรับการทำให้ templates เดิมที่มี productKey และ customerKey เดียวกันเป็น inactive ก่อนสร้าง mapping ใหม่
IF OBJECT_ID('FgL.UpdateTemplateMappingWithStringKeys', 'P') IS NOT NULL
    DROP PROCEDURE FgL.UpdateTemplateMappingWithStringKeys;
GO

CREATE PROCEDURE FgL.UpdateTemplateMappingWithStringKeys
    @TemplateID INT,
    @ProductKey NVARCHAR(50) = NULL,
    @CustomerKey NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    -- ลบ mapping เก่าของ template นี้ (ทำเป็น inactive)
    UPDATE FgL.TemplateMappingProductString
    SET Active = 0
    WHERE TemplateID = @TemplateID;
    
    UPDATE FgL.TemplateMappingCustomerString
    SET Active = 0
    WHERE TemplateID = @TemplateID;
    
    UPDATE FgL.TemplateMappingProductCustomerString
    SET Active = 0
    WHERE TemplateID = @TemplateID;
    
    -- ถ้ามีทั้ง ProductKey และ CustomerKey ทำให้ templates อื่นที่มี ProductKey+CustomerKey เดียวกันเป็น inactive
    IF @ProductKey IS NOT NULL AND @ProductKey <> '' AND @ProductKey <> 'system' AND 
       @CustomerKey IS NOT NULL AND @CustomerKey <> '' AND @CustomerKey <> 'system'
    BEGIN
        -- 1. หา templates ทั้งหมดที่มี ProductKey+CustomerKey เดียวกัน
        DECLARE @OtherTemplateIds TABLE (TemplateID INT);
        
        -- จากตาราง TemplateMappingProductCustomerString
        INSERT INTO @OtherTemplateIds (TemplateID)
        SELECT DISTINCT TemplateID 
        FROM FgL.TemplateMappingProductCustomerString
        WHERE ProductKeyString = @ProductKey
          AND CustomerKeyString = @CustomerKey
          AND Active = 1
          AND TemplateID <> @TemplateID;
        
        -- จากตาราง LabelTemplate
        INSERT INTO @OtherTemplateIds (TemplateID)
        SELECT DISTINCT TemplateID
        FROM FgL.LabelTemplate
        WHERE ProductKey = @ProductKey
          AND CustomerKey = @CustomerKey
          AND Active = 1
          AND TemplateID <> @TemplateID
          AND TemplateID NOT IN (SELECT TemplateID FROM @OtherTemplateIds);
        
        -- 2. ทำให้ templates เหล่านี้ inactive
        -- ในตาราง mapping
        UPDATE FgL.TemplateMappingProductString
        SET Active = 0
        WHERE TemplateID IN (SELECT TemplateID FROM @OtherTemplateIds);
        
        UPDATE FgL.TemplateMappingCustomerString
        SET Active = 0
        WHERE TemplateID IN (SELECT TemplateID FROM @OtherTemplateIds);
        
        UPDATE FgL.TemplateMappingProductCustomerString
        SET Active = 0
        WHERE TemplateID IN (SELECT TemplateID FROM @OtherTemplateIds);
        
        -- ในตาราง LabelTemplate
        UPDATE FgL.LabelTemplate
        SET Active = 0
        WHERE TemplateID IN (SELECT TemplateID FROM @OtherTemplateIds);
    END
    
    -- ถ้ามีแค่ ProductKey ทำให้ templates อื่นที่มีแค่ ProductKey เดียวกันเป็น inactive
    ELSE IF @ProductKey IS NOT NULL AND @ProductKey <> '' AND @ProductKey <> 'system'
    BEGIN
        -- 1. หา templates ทั้งหมดที่มี ProductKey เดียวกัน (และไม่มี CustomerKey)
        DECLARE @OtherProductTemplateIds TABLE (TemplateID INT);
        
        -- จากตาราง TemplateMappingProductString
        INSERT INTO @OtherProductTemplateIds (TemplateID)
        SELECT DISTINCT tmps.TemplateID 
        FROM FgL.TemplateMappingProductString tmps
        LEFT JOIN FgL.TemplateMappingProductCustomerString tmpcs
            ON tmps.TemplateID = tmpcs.TemplateID AND tmpcs.Active = 1
        WHERE tmps.ProductKeyString = @ProductKey
          AND tmps.Active = 1
          AND tmps.TemplateID <> @TemplateID
          AND tmpcs.TemplateID IS NULL;  -- ไม่มี CustomerKey mapping
        
        -- จากตาราง LabelTemplate
        INSERT INTO @OtherProductTemplateIds (TemplateID)
        SELECT DISTINCT TemplateID
        FROM FgL.LabelTemplate
        WHERE ProductKey = @ProductKey
          AND (CustomerKey IS NULL OR CustomerKey = '' OR CustomerKey = 'system')
          AND Active = 1
          AND TemplateID <> @TemplateID
          AND TemplateID NOT IN (SELECT TemplateID FROM @OtherProductTemplateIds);
        
        -- 2. ทำให้ templates เหล่านี้ inactive
        UPDATE FgL.TemplateMappingProductString
        SET Active = 0
        WHERE TemplateID IN (SELECT TemplateID FROM @OtherProductTemplateIds);
        
        UPDATE FgL.LabelTemplate
        SET Active = 0
        WHERE TemplateID IN (SELECT TemplateID FROM @OtherProductTemplateIds);
    END
    
    -- เพิ่ม mapping ใหม่
    IF @ProductKey IS NOT NULL AND @ProductKey <> '' AND @ProductKey <> 'system'
    BEGIN
        -- เพิ่ม mapping สำหรับ ProductKey
        INSERT INTO FgL.TemplateMappingProductString (TemplateID, ProductKeyString)
        VALUES (@TemplateID, @ProductKey);
        
        -- ถ้ามี CustomerKey ด้วย เพิ่ม mapping สำหรับคู่ ProductKey และ CustomerKey
        IF @CustomerKey IS NOT NULL AND @CustomerKey <> '' AND @CustomerKey <> 'system'
        BEGIN
            INSERT INTO FgL.TemplateMappingProductCustomerString (TemplateID, ProductKeyString, CustomerKeyString)
            VALUES (@TemplateID, @ProductKey, @CustomerKey);
        END
    END
    
    -- ถ้ามีแค่ CustomerKey เพิ่ม mapping สำหรับ CustomerKey
    IF (@ProductKey IS NULL OR @ProductKey = '' OR @ProductKey = 'system')
       AND @CustomerKey IS NOT NULL AND @CustomerKey <> '' AND @CustomerKey <> 'system'
    BEGIN
        INSERT INTO FgL.TemplateMappingCustomerString (TemplateID, CustomerKeyString)
        VALUES (@TemplateID, @CustomerKey);
    END
    
    -- อัพเดตข้อมูลในตาราง LabelTemplate ด้วย
    UPDATE FgL.LabelTemplate
    SET ProductKey = CASE WHEN @ProductKey = 'system' THEN NULL ELSE @ProductKey END,
        CustomerKey = CASE WHEN @CustomerKey = 'system' THEN NULL ELSE @CustomerKey END,
        UpdatedAt = GETDATE(),
        Active = 1
    WHERE TemplateID = @TemplateID;
    
    -- คืนค่า TemplateID ที่อัพเดต
    SELECT @TemplateID AS TemplateID;
END;
GO

PRINT N'✓ Stored Procedure FgL.UpdateTemplateMappingWithStringKeys อัปเดตเรียบร้อยแล้ว';
GO 