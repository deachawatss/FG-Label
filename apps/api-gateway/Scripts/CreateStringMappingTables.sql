/*============================================================================== 
  FG-Label String Mapping Tables Installation Script
  Version: 1.1 - 16-May-2025
  Purpose: สร้างตารางใหม่สำหรับ mapping template กับ ProductKey และ CustomerKey ที่เป็น string
==============================================================================*/

USE [TFCPILOT2];
GO

PRINT N'เริ่มการติดตั้งตาราง mapping สำหรับ string keys...';
GO

/*---------------------------------------------------------------------------  
  0) DROP ตารางและ procedure เดิมออกก่อน
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.UpdateTemplateMappingWithStringKeys', 'P') IS NOT NULL
    DROP PROCEDURE FgL.UpdateTemplateMappingWithStringKeys;
PRINT N'✓ ลบ Procedure FgL.UpdateTemplateMappingWithStringKeys';

IF OBJECT_ID('FgL.GetTemplateByProductAndCustomerKeys', 'P') IS NOT NULL
    DROP PROCEDURE FgL.GetTemplateByProductAndCustomerKeys;
PRINT N'✓ ลบ Procedure FgL.GetTemplateByProductAndCustomerKeys';

IF OBJECT_ID('FgL.TemplateMappingProductCustomerString', 'U') IS NOT NULL
BEGIN
    DROP TABLE FgL.TemplateMappingProductCustomerString;
    PRINT N'✓ ลบตาราง FgL.TemplateMappingProductCustomerString';
END

IF OBJECT_ID('FgL.TemplateMappingCustomerString', 'U') IS NOT NULL
BEGIN
    DROP TABLE FgL.TemplateMappingCustomerString;
    PRINT N'✓ ลบตาราง FgL.TemplateMappingCustomerString';
END

IF OBJECT_ID('FgL.TemplateMappingProductString', 'U') IS NOT NULL
BEGIN
    DROP TABLE FgL.TemplateMappingProductString;
    PRINT N'✓ ลบตาราง FgL.TemplateMappingProductString';
END
GO

/*---------------------------------------------------------------------------  
  1) สร้างตาราง mapping สำหรับ ProductKey ที่เป็น string
---------------------------------------------------------------------------*/
CREATE TABLE FgL.TemplateMappingProductString (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    TemplateID INT NOT NULL,
    ProductKeyString NVARCHAR(50) NOT NULL,
    Active BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_TMPS_Template FOREIGN KEY (TemplateID) REFERENCES FgL.LabelTemplate(TemplateID)
);

CREATE INDEX IX_TemplateMappingProductString_ProductKey ON FgL.TemplateMappingProductString(ProductKeyString);
CREATE INDEX IX_TemplateMappingProductString_Active ON FgL.TemplateMappingProductString(Active);
CREATE INDEX IX_TemplateMappingProductString_TemplateID ON FgL.TemplateMappingProductString(TemplateID);

PRINT N'✓ ตาราง FgL.TemplateMappingProductString สร้างเรียบร้อยแล้ว';
GO

/*---------------------------------------------------------------------------  
  2) สร้างตาราง mapping สำหรับ CustomerKey ที่เป็น string
---------------------------------------------------------------------------*/
CREATE TABLE FgL.TemplateMappingCustomerString (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    TemplateID INT NOT NULL,
    CustomerKeyString NVARCHAR(50) NOT NULL,
    Active BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_TMCS_Template FOREIGN KEY (TemplateID) REFERENCES FgL.LabelTemplate(TemplateID)
);

CREATE INDEX IX_TemplateMappingCustomerString_CustomerKey ON FgL.TemplateMappingCustomerString(CustomerKeyString);
CREATE INDEX IX_TemplateMappingCustomerString_Active ON FgL.TemplateMappingCustomerString(Active);
CREATE INDEX IX_TemplateMappingCustomerString_TemplateID ON FgL.TemplateMappingCustomerString(TemplateID);

PRINT N'✓ ตาราง FgL.TemplateMappingCustomerString สร้างเรียบร้อยแล้ว';
GO

/*---------------------------------------------------------------------------  
  3) สร้างตาราง mapping สำหรับคู่ ProductKey และ CustomerKey ที่เป็น string
---------------------------------------------------------------------------*/
CREATE TABLE FgL.TemplateMappingProductCustomerString (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    TemplateID INT NOT NULL,
    ProductKeyString NVARCHAR(50) NOT NULL,
    CustomerKeyString NVARCHAR(50) NOT NULL,
    Active BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_TMPCS_Template FOREIGN KEY (TemplateID) REFERENCES FgL.LabelTemplate(TemplateID)
);

CREATE INDEX IX_TemplateMappingProductCustomerString_ProductKey ON FgL.TemplateMappingProductCustomerString(ProductKeyString);
CREATE INDEX IX_TemplateMappingProductCustomerString_CustomerKey ON FgL.TemplateMappingProductCustomerString(CustomerKeyString);
CREATE INDEX IX_TemplateMappingProductCustomerString_Active ON FgL.TemplateMappingProductCustomerString(Active);
CREATE INDEX IX_TemplateMappingProductCustomerString_TemplateID ON FgL.TemplateMappingProductCustomerString(TemplateID);

PRINT N'✓ ตาราง FgL.TemplateMappingProductCustomerString สร้างเรียบร้อยแล้ว';
GO

/*---------------------------------------------------------------------------  
  4) สร้าง Stored Procedure สำหรับค้นหา template ด้วย ProductKey และ CustomerKey ที่เป็น string
---------------------------------------------------------------------------*/
CREATE PROCEDURE FgL.GetTemplateByProductAndCustomerKeys
    @ProductKey NVARCHAR(50),
    @CustomerKey NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @TemplateID INT = NULL;

    -- 1. ค้นหาจากตาราง mapping สำหรับคู่ ProductKey และ CustomerKey ก่อน
    IF @CustomerKey IS NOT NULL
    BEGIN
        SELECT TOP 1 @TemplateID = TemplateID
        FROM FgL.TemplateMappingProductCustomerString
        WHERE ProductKeyString = @ProductKey
          AND CustomerKeyString = @CustomerKey
          AND Active = 1
        ORDER BY ID DESC;
    END

    -- 2. ถ้าไม่พบ ค้นหาจากตาราง mapping สำหรับ ProductKey อย่างเดียว
    IF @TemplateID IS NULL
    BEGIN
        SELECT TOP 1 @TemplateID = TemplateID
        FROM FgL.TemplateMappingProductString
        WHERE ProductKeyString = @ProductKey
          AND Active = 1
        ORDER BY ID DESC;
    END

    -- 3. ถ้าไม่พบ และมี CustomerKey ค้นหาจากตาราง mapping สำหรับ CustomerKey อย่างเดียว
    IF @TemplateID IS NULL AND @CustomerKey IS NOT NULL
    BEGIN
        SELECT TOP 1 @TemplateID = TemplateID
        FROM FgL.TemplateMappingCustomerString
        WHERE CustomerKeyString = @CustomerKey
          AND Active = 1
        ORDER BY ID DESC;
    END

    -- 4. ถ้าไม่พบในตาราง mapping ใหม่ ลองค้นหาจากตาราง LabelTemplate แบบเดิม
    IF @TemplateID IS NULL
    BEGIN
        -- ค้นหาตาม Product+Customer ก่อน (เฉพาะ)
        SELECT TOP 1 @TemplateID = TemplateID
        FROM FgL.LabelTemplate
        WHERE ProductKey = @ProductKey
          AND CustomerKey = @CustomerKey
          AND Active = 1
        ORDER BY TemplateID DESC;

        -- ถ้าไม่พบ ค้นหาตาม Product อย่างเดียว
        IF @TemplateID IS NULL
        BEGIN
            SELECT TOP 1 @TemplateID = TemplateID
            FROM FgL.LabelTemplate
            WHERE ProductKey = @ProductKey
              AND (CustomerKey IS NULL OR CustomerKey = '')
              AND Active = 1
            ORDER BY TemplateID DESC;
        END

        -- ถ้าไม่พบ และมี CustomerKey ค้นหาตาม Customer อย่างเดียว
        IF @TemplateID IS NULL AND @CustomerKey IS NOT NULL
        BEGIN
            SELECT TOP 1 @TemplateID = TemplateID
            FROM FgL.LabelTemplate
            WHERE CustomerKey = @CustomerKey
              AND (ProductKey IS NULL OR ProductKey = '')
              AND Active = 1
            ORDER BY TemplateID DESC;
        END
    END

    -- คืนค่า TemplateID ที่พบ (หรือ NULL ถ้าไม่พบ)
    SELECT @TemplateID AS TemplateID;
END;
GO
PRINT N'✓ Stored Procedure FgL.GetTemplateByProductAndCustomerKeys สร้างเรียบร้อยแล้ว';
GO

/*---------------------------------------------------------------------------  
  5) สร้าง Stored Procedure สำหรับอัพเดต mapping ระหว่าง template กับ ProductKey และ CustomerKey ที่เป็น string
---------------------------------------------------------------------------*/
CREATE PROCEDURE FgL.UpdateTemplateMappingWithStringKeys
    @TemplateID INT,
    @ProductKey NVARCHAR(50) = NULL,
    @CustomerKey NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    -- ลบ mapping เก่าออกก่อน (ไม่ลบจริง แต่ทำเป็น inactive)
    UPDATE FgL.TemplateMappingProductString
    SET Active = 0
    WHERE TemplateID = @TemplateID;
    
    UPDATE FgL.TemplateMappingCustomerString
    SET Active = 0
    WHERE TemplateID = @TemplateID;
    
    UPDATE FgL.TemplateMappingProductCustomerString
    SET Active = 0
    WHERE TemplateID = @TemplateID;
    
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
        UpdatedAt = GETDATE()
    WHERE TemplateID = @TemplateID;
    
    -- คืนค่า TemplateID ที่อัพเดต
    SELECT @TemplateID AS TemplateID;
END;
GO
PRINT N'✓ Stored Procedure FgL.UpdateTemplateMappingWithStringKeys สร้างเรียบร้อยแล้ว';
GO

PRINT N'✅ การติดตั้งตาราง mapping สำหรับ string keys เสร็จสมบูรณ์';
GO