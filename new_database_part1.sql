/*============================================================================== 
  FG-Label Database Schema Installation Script  (FULL REBUILD – KEEP DATA)  
  Database : TFCPILOT2 
  Version  : 3.0-revJ1-keep  –  23-May-2025 19:00
  Notes    : • ไม่ DROP FgL.BME_LABEL / FgL.BME_LABEL_WIP
             • ถ้าไม่มีสองตารางนี้จึงสร้างใหม่พร้อมดัชนี
             • แก้ไขให้รองรับกรณี 1 BatchNo มีหลาย CustKey และหลาย ShipToCountry
             • เพิ่มตาราง FgL.BatchCustomerMapping เพื่อเก็บความสัมพันธ์
==============================================================================*/

USE [TFCPILOT2];
GO

/*---------------------------------------------------------------------------  
  0) CREATE SCHEMA FgL (ถ้ายังไม่มี)  
---------------------------------------------------------------------------*/
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'FgL')
    EXEC ('CREATE SCHEMA FgL');
PRINT N'★ 0) Schema FgL ready';
GO

/*---------------------------------------------------------------------------  
  1) DROP FOREIGN-KEY ที่อ้าง FgL.*  
---------------------------------------------------------------------------*/
DECLARE @DropFK NVARCHAR(MAX)=N'';
SELECT @DropFK += N'ALTER TABLE '
               + QUOTENAME(SCHEMA_NAME(parent_object_id))+N'.'
               + QUOTENAME(OBJECT_NAME(parent_object_id))
               + N' DROP CONSTRAINT '+QUOTENAME(name)+';'+CHAR(13)
FROM sys.foreign_keys
WHERE OBJECT_SCHEMA_NAME(referenced_object_id)='FgL';
EXEC (@DropFK);
PRINT N'★ 1) All FK to FgL.* dropped';
GO

/*---------------------------------------------------------------------------  
  2) DROP OBJECTS (Child-ก่อน-Parent)  
      ► ***ไม่ DROP FgL.BME_LABEL / FgL.BME_LABEL_WIP***
---------------------------------------------------------------------------*/
-- ตรวจสอบและลบ FOREIGN KEY ที่อาจจะตกค้างและอ้างถึง FgL.LabelTemplate
DECLARE @DropConstraints NVARCHAR(MAX) = N'';
SELECT @DropConstraints += N'ALTER TABLE '
                     + QUOTENAME(SCHEMA_NAME(fk.schema_id))+N'.'
                     + QUOTENAME(OBJECT_NAME(fk.parent_object_id))
                     + N' DROP CONSTRAINT '+QUOTENAME(fk.name)+';'+CHAR(13)
FROM sys.foreign_keys AS fk
JOIN sys.tables AS t ON fk.referenced_object_id = t.object_id
WHERE t.name = 'LabelTemplate' 
  AND SCHEMA_NAME(t.schema_id) = 'FgL';

-- ลบ FOREIGN KEY ที่อ้างถึง FgL.LabelTemplate
IF LEN(@DropConstraints) > 0
BEGIN
    EXEC (@DropConstraints);
    PRINT N'★ Additional FK to FgL.LabelTemplate dropped';
END

-- ลบตารางตามลำดับ (Child-ก่อน-Parent)
IF OBJECT_ID('FgL.LabelTemplateComponent','U') IS NOT NULL DROP TABLE FgL.LabelTemplateComponent;
IF OBJECT_ID('FgL.LabelTemplateMapping' ,'U') IS NOT NULL DROP TABLE FgL.LabelTemplateMapping;
IF OBJECT_ID('FgL.LabelPrintJob'        ,'U') IS NOT NULL DROP TABLE FgL.LabelPrintJob;
IF OBJECT_ID('FgL.LabelTemplate'        ,'U') IS NOT NULL DROP TABLE FgL.LabelTemplate;
IF OBJECT_ID('FgL.ADConfig'             ,'U') IS NOT NULL DROP TABLE FgL.ADConfig;
IF OBJECT_ID('FgL.[User]'               ,'U') IS NOT NULL DROP TABLE FgL.[User];
IF OBJECT_ID('FgL.Printer'              ,'U') IS NOT NULL DROP TABLE FgL.Printer;
IF OBJECT_ID('FgL.BatchCustomerMapping' ,'U') IS NOT NULL DROP TABLE FgL.BatchCustomerMapping;
/*  ไม่ DROP BME_LABEL_WIP / BME_LABEL */

IF OBJECT_ID('FgL.tvf_Label_PrintData','IF') IS NOT NULL DROP FUNCTION FgL.tvf_Label_PrintData;
IF OBJECT_ID('FgL.vw_Label_PrintSummary','V') IS NOT NULL DROP VIEW FgL.vw_Label_PrintSummary;
IF OBJECT_ID('FgL.usp_GetLabelDataByBatchNo','P') IS NOT NULL DROP PROCEDURE FgL.usp_GetLabelDataByBatchNo;
IF OBJECT_ID('FgL.usp_ValidateBagNumber','P') IS NOT NULL DROP PROCEDURE FgL.usp_ValidateBagNumber;

IF OBJECT_ID('dbo.tvf_GetBagNumbersRange','IF') IS NOT NULL DROP FUNCTION dbo.tvf_GetBagNumbersRange;
IF OBJECT_ID('dbo.tvf_GetBagNumbers','IF') IS NOT NULL DROP FUNCTION dbo.tvf_GetBagNumbers;
PRINT N'★ 2) Un-needed objects dropped (data tables kept)';
GO

/*---------------------------------------------------------------------------  
  3) TABLE FgL.BME_LABEL  – สร้างเฉพาะกรณีไม่พบ  
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.BME_LABEL','U') IS NULL
BEGIN
    PRINT N'★ 3) Creating table FgL.BME_LABEL (new)';
CREATE TABLE FgL.BME_LABEL(
        CustKey NVARCHAR(50) NULL,
        ItemKey NVARCHAR(50) NULL,
        PACKSIZE1 DECIMAL(18,3) NULL,
        PACKUNIT1 NVARCHAR(50) NULL,
        PACKSIZE2 DECIMAL(18,3) NULL,
        PACKUNIT2 NVARCHAR(50) NULL,
        TOTAL_UNIT2_IN_UNIT1 DECIMAL(18,3) NULL,
        NET_WEIGHT1 DECIMAL(18,3) NULL,
        GROSS_WEIGHT1 DECIMAL(18,3) NULL,
        SHELFLIFE_MONTH DECIMAL(9,2) NULL,
        SHELFLIFE_DAY DECIMAL(9,2) NULL,
        SHELFLIFE_DAYLIMIT DECIMAL(9,2) NULL,
        LABEL_COLOR NVARCHAR(255) NULL,
        PRODUCT NVARCHAR(255) NULL,
        DESCRIPTION NVARCHAR(500) NULL,
        [LOT CODE] NVARCHAR(255) NULL,
        [BEST BEFORE] NVARCHAR(255) NULL,
        CUSTITEMCODE NVARCHAR(255) NULL,
        ALLERGEN1 NVARCHAR(500) NULL,
        ALLERGEN2 NVARCHAR(500) NULL,
        ALLERGEN3 NVARCHAR(500) NULL,
        STORECAP1 NVARCHAR(255) NULL,
        GMO1 NVARCHAR(255) NULL,
        INGREDLIST1 NVARCHAR(MAX) NULL,
        INGREDLIST2 NVARCHAR(MAX) NULL,
        INGREDLIST3 NVARCHAR(MAX) NULL,
        PRODATECAP NVARCHAR(255) NULL,
        EXPIRYDATECAP NVARCHAR(255) NULL,
        ITEMCAP NVARCHAR(255) NULL,
        WEIGHCAP NVARCHAR(255) NULL,
        COUNTRYOFORIGIN NVARCHAR(255) NULL,
        REMARK1 NVARCHAR(255) NULL,
        SMALLPACKINFO NVARCHAR(500) NULL,
        [LABEL INSTRUCTION] NVARCHAR(500) NULL,
        CUSCAP1 NVARCHAR(255) NULL,
        CUSCAP2 NVARCHAR(255) NULL,
        CUSCAP3 NVARCHAR(255) NULL,
        BATCHCAP NVARCHAR(255) NULL,
        MANUCAP1 NVARCHAR(255) NULL,
        MANUCAP2 NVARCHAR(255) NULL,
        MANUCAP3 NVARCHAR(255) NULL,
        [REMAINING_SHELF-LIFE] NVARCHAR(255) NULL,
        SHIPTO_COUNTRY NVARCHAR(255) NULL,
        IMPORTED_BY NVARCHAR(255) NULL,
        [IMPORTER ADDRESS] NVARCHAR(255) NULL,
        [IMPORTER CONTACT] NVARCHAR(255) NULL,
        IMPORTER_LICENSE_ID NVARCHAR(255) NULL,
        PRODUCT_LICENSE_ID1 NVARCHAR(255) NULL,
        PRODUCT_LICENSE_ID2 NVARCHAR(255) NULL,
        CUSTOMS_TEXT1 NVARCHAR(MAX) NULL,
        CUSTOMS_TEXT2 NVARCHAR(MAX) NULL,
        HALALLOGO BIT NULL,
        HALALNUMBER NVARCHAR(255) NULL,
        STANDARD_LABEL BIT NULL,
        SPECIAL_LABEL BIT NULL,
        CUSTOMER_LABEL BIT NULL,
        QSR_BRAND NVARCHAR(255) NULL,
        QSRFORMAT BIT NULL,
        THAINAME NVARCHAR(255) NULL,
        FDANUMBER NVARCHAR(255) NULL,
        FOODADDITIVE BIT NULL,
        INGREDIENTTHAI1 NVARCHAR(MAX) NULL,
        INGREDIENTTHAI2 NVARCHAR(MAX) NULL,
        INGREDIENTTHAI3 NVARCHAR(MAX) NULL,
        USINGINSTRUCTION1 NVARCHAR(MAX) NULL,
        USINGINSTRUCTION2 NVARCHAR(MAX) NULL,
        USINGINSTRUCTION3 NVARCHAR(MAX) NULL,
        ALLERGENTHAI1 NVARCHAR(MAX) NULL,
        ALLERGENTHAI2 NVARCHAR(MAX) NULL,
        CHECKBY NVARCHAR(100) NULL,
        INNER_PATH NVARCHAR(MAX) NULL,
        OUTER_PATH NVARCHAR(MAX) NULL,
        [PRODUCT NAME IN ARABIC] NVARCHAR(255) NULL,
        [INGREDIENT LIST IN ARABIC 1] NVARCHAR(MAX) NULL,
        [INGREDIENT LIST IN ARABIC 2] NVARCHAR(MAX) NULL,
        [INGREDIENT LIST IN ARABIC 3] NVARCHAR(MAX) NULL,
        [ALLERGEN IN ARABIC 1] NVARCHAR(500) NULL,
        [ALLERGEN IN ARABIC 2] NVARCHAR(500) NULL,
        [ALLERGEN IN ARABIC 3] NVARCHAR(500) NULL,
        [STORAGE CONDITION IN ARABIC] NVARCHAR(MAX) NULL,
        [IMPORTED_BY IN ARABIC] NVARCHAR(255) NULL,
        [IMPORTER ADDRESS IN ARABIC] NVARCHAR(255) NULL,
        [IMPORTER CONTACT IN ARABIC] NVARCHAR(255) NULL,
        [SMALLPACKINFO IN ARABIC] NVARCHAR(MAX) NULL,
        [PRODUCT NAME IN CHINESE] NVARCHAR(255) NULL,
        [INGREDIENT LIST IN CHINESE 1] NVARCHAR(MAX) NULL,
        [INGREDIENT LIST IN CHINESE 2] NVARCHAR(MAX) NULL,
        [INGREDIENT LIST IN CHINESE 3] NVARCHAR(MAX) NULL,
        [ALLERGEN IN CHINESE 1] NVARCHAR(500) NULL,
        [ALLERGEN IN CHINESE 2] NVARCHAR(500) NULL,
        [ALLERGEN IN CHINESE 3] NVARCHAR(500) NULL,
        [STORAGE CONDITION IN CHINESE] NVARCHAR(MAX) NULL,
        [IMPORTED_BY IN CHINESE] NVARCHAR(255) NULL,
        [IMPORTER ADDRESS IN CHINESE] NVARCHAR(255) NULL,
        [IMPORTER CONTACT IN CHINESE] NVARCHAR(255) NULL,
        [SMALLPACKINFO IN CHINESE] NVARCHAR(MAX) NULL,
        [APPLICATION SCOPE IN CHINESE] NVARCHAR(MAX) NULL,
        [USE INSTRUCTION IN CHINESE] NVARCHAR(MAX) NULL,
        [NOTE IN CHINESE] NVARCHAR(MAX) NULL
    );
END
ELSE
    PRINT N'★ 3) Keeping existing FgL.BME_LABEL (data preserved)';

/* สร้างดัชนีถ้ายังไม่มี */
IF NOT EXISTS (SELECT 1 FROM sys.indexes 
               WHERE object_id=OBJECT_ID('FgL.BME_LABEL') AND name='IX_BME_LABEL_ItemCust')
CREATE NONCLUSTERED INDEX IX_BME_LABEL_ItemCust ON FgL.BME_LABEL(ItemKey,CustKey);

IF NOT EXISTS (SELECT 1 FROM sys.indexes 
               WHERE object_id=OBJECT_ID('FgL.BME_LABEL') AND name='IX_BME_LABEL_ItemKey')
    CREATE NONCLUSTERED INDEX IX_BME_LABEL_ItemKey ON FgL.BME_LABEL(ItemKey);

/* เพิ่มดัชนีสำหรับ CustKey และ ShipToCountry */
IF NOT EXISTS (SELECT 1 FROM sys.indexes 
               WHERE object_id=OBJECT_ID('FgL.BME_LABEL') AND name='IX_BME_LABEL_CustKey')
    CREATE NONCLUSTERED INDEX IX_BME_LABEL_CustKey ON FgL.BME_LABEL(CustKey);

IF NOT EXISTS (SELECT 1 FROM sys.indexes 
               WHERE object_id=OBJECT_ID('FgL.BME_LABEL') AND name='IX_BME_LABEL_ShipToCountry')
    CREATE NONCLUSTERED INDEX IX_BME_LABEL_ShipToCountry ON FgL.BME_LABEL(SHIPTO_COUNTRY);
GO

/*---------------------------------------------------------------------------  
  4) TABLE FgL.BME_LABEL_WIP – ถ้าไม่มีจึงสร้างใหม่ (เปล่า)  
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.BME_LABEL_WIP','U') IS NULL
BEGIN
    PRINT N'★ 4) Creating table FgL.BME_LABEL_WIP (new)';
SELECT * INTO FgL.BME_LABEL_WIP FROM FgL.BME_LABEL WHERE 1=0;
END
ELSE
    PRINT N'★ 4) Keeping existing FgL.BME_LABEL_WIP (data preserved)';
GO 

/*---------------------------------------------------------------------------  
  4.1) TABLE FgL.BatchCustomerMapping - เพิ่มใหม่สำหรับเก็บข้อมูล CustomerKey ของแต่ละ BatchNo
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.BatchCustomerMapping','U') IS NULL
BEGIN
    PRINT N'★ 4.1) Creating table FgL.BatchCustomerMapping (new)';
    CREATE TABLE FgL.BatchCustomerMapping(
        MappingID INT IDENTITY(1,1) PRIMARY KEY,
        BatchNo NVARCHAR(30) NOT NULL,
        ItemKey NVARCHAR(50) NOT NULL,
        CustKey NVARCHAR(50) NOT NULL,
        ShipToCountry NVARCHAR(255) NULL,
        Active BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NULL,
        CONSTRAINT UQ_BatchCustomerMapping_BatchNo UNIQUE (BatchNo) -- เพิ่ม Constraint ให้ BatchNo ต้องไม่ซ้ำกัน
    );
    
    CREATE NONCLUSTERED INDEX IX_BCM_BatchNo ON FgL.BatchCustomerMapping(BatchNo);
    CREATE NONCLUSTERED INDEX IX_BCM_BatchItem ON FgL.BatchCustomerMapping(BatchNo, ItemKey);
    
    -- การนำเข้าข้อมูลจะทำภายหลังหลังจากที่สร้าง View ที่เกี่ยวข้องแล้ว
    PRINT N'★ Table FgL.BatchCustomerMapping created (data will be imported later)';
END
ELSE
    PRINT N'★ 4.1) FgL.BatchCustomerMapping already exists';
GO

/*---------------------------------------------------------------------------  
  5-11) สร้างตารางสำคัญอื่น ๆ (Printer, User, ADConfig, LabelTemplate …)  
---------------------------------------------------------------------------*/
PRINT N'★ 5-11) Creating core tables';

/*---------------------------------------------------------------------------  
  5) TABLE FgL.Printer  
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.Printer','U') IS NULL
BEGIN
CREATE TABLE FgL.Printer(
    PrinterID   INT IDENTITY(1,1) PRIMARY KEY,
    Name        NVARCHAR(100) NOT NULL,
    Description NVARCHAR(255) NULL,
    Location    NVARCHAR(100) NULL,
    PrinterType NVARCHAR(50)  NOT NULL DEFAULT 'Zebra',
    IsDefault   BIT           NOT NULL DEFAULT 0,
    IsActive    BIT           NOT NULL DEFAULT 1,
    IPAddress   NVARCHAR(50)  NULL,
    Properties  NVARCHAR(MAX) NULL,
    CreatedAt   DATETIME      NOT NULL DEFAULT GETDATE(),
    UpdatedAt   DATETIME      NULL
);
CREATE NONCLUSTERED INDEX IX_Printer_IsActive ON FgL.Printer(IsActive);
    PRINT N'★ 5) FgL.Printer created';
END
ELSE
    PRINT N'★ 5) FgL.Printer already exists';
GO

/*---------------------------------------------------------------------------  
  6) TABLE FgL.[User]  
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.[User]','U') IS NULL
BEGIN
CREATE TABLE FgL.[User](
    UserID      INT IDENTITY(1,1) PRIMARY KEY,
    Username    NVARCHAR(50)  NOT NULL,
    ADUsername  NVARCHAR(100) NULL,
    Email       NVARCHAR(100) NULL,
    FullName    NVARCHAR(100) NULL,
    Department  NVARCHAR(50)  NULL,
    Position    NVARCHAR(50)  NULL,
    Role        NVARCHAR(20)  NOT NULL
                 CONSTRAINT CK_User_Role CHECK (Role IN ('Admin','Manager','Operator','Viewer')),
    IsActive    BIT           NOT NULL DEFAULT 1,
    LastLogin   DATETIME      NULL,
    CreatedAt   DATETIME      NOT NULL DEFAULT GETDATE(),
    UpdatedAt   DATETIME      NULL,
    CONSTRAINT UQ_User_Username UNIQUE (Username)
);
CREATE NONCLUSTERED INDEX IX_User_Username   ON FgL.[User](Username);
CREATE NONCLUSTERED INDEX IX_User_ADUsername ON FgL.[User](ADUsername);
    PRINT N'★ 6) FgL.[User] created';
END
ELSE
    PRINT N'★ 6) FgL.[User] already exists';
GO

/*---------------------------------------------------------------------------  
  7) TABLE FgL.ADConfig  
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.ADConfig','U') IS NULL
BEGIN
CREATE TABLE FgL.ADConfig(
    ConfigID        INT IDENTITY(1,1) PRIMARY KEY,
    ServerURL       NVARCHAR(255) NOT NULL,
    BaseDN          NVARCHAR(255) NULL,
    DomainName      NVARCHAR(100) NULL,
    SearchFilter    NVARCHAR(255) NULL,
    BindUsername    NVARCHAR(100) NULL,
    BindPassword    NVARCHAR(100) NULL,
    DefaultGroup    NVARCHAR(50)  NULL,
    IsEnabled       BIT           NOT NULL DEFAULT 0,
    AutoCreateUsers BIT           NOT NULL DEFAULT 0,
    RoleMappings    NVARCHAR(MAX) NULL,
    CreatedAt       DATETIME      NOT NULL DEFAULT GETDATE(),
    UpdatedAt       DATETIME      NULL
);
    PRINT N'★ 7) FgL.ADConfig created';
END
ELSE
    PRINT N'★ 7) FgL.ADConfig already exists';
GO

/*---------------------------------------------------------------------------  
  8) TABLE FgL.LabelTemplate  
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.LabelTemplate','U') IS NULL
BEGIN
CREATE TABLE FgL.LabelTemplate(
    TemplateID    INT IDENTITY(1,1) PRIMARY KEY,
    Name          NVARCHAR(100) NOT NULL,
    Description   NVARCHAR(255) NULL,
    ProductKey    NVARCHAR(50)  NULL,
    CustomerKey   NVARCHAR(50)  NULL,
    ShipToCountry NVARCHAR(255) NULL, -- เพิ่มฟิลด์นี้เพื่อให้สามารถระบุ template ตามประเทศได้
    Engine        NVARCHAR(50)  NOT NULL DEFAULT 'ZPL',
    PaperSize     NVARCHAR(50)  NULL,
    Orientation   NVARCHAR(20)  NULL CHECK (Orientation IN ('Portrait','Landscape')),
    TemplateType  NVARCHAR(50)  NULL DEFAULT 'Standard',
    Content       NVARCHAR(MAX) NULL,
    ContentBinary VARBINARY(MAX) NULL,
    CustomWidth   INT NULL,
    CustomHeight  INT NULL,
    Version       INT NOT NULL DEFAULT 1,
    Active        BIT NOT NULL DEFAULT 1,
    CreatedBy     INT NULL,
    CreatedAt     DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt     DATETIME NULL
);
CREATE NONCLUSTERED INDEX IX_LabelTemplate_Active          ON FgL.LabelTemplate(Active);
CREATE NONCLUSTERED INDEX IX_LabelTemplate_ProductCustomer ON FgL.LabelTemplate(ProductKey,CustomerKey);
CREATE NONCLUSTERED INDEX IX_LabelTemplate_ShipToCountry   ON FgL.LabelTemplate(ShipToCountry);
    PRINT N'★ 8) FgL.LabelTemplate created';
END
ELSE
    PRINT N'★ 8) FgL.LabelTemplate already exists';
GO

/*---------------------------------------------------------------------------  
  9) TABLE FgL.LabelTemplateComponent  
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.LabelTemplateComponent','U') IS NULL
BEGIN
CREATE TABLE FgL.LabelTemplateComponent(
    ComponentID    INT IDENTITY(1,1) PRIMARY KEY,
    TemplateID     INT           NOT NULL,
    ComponentType  NVARCHAR(50)  NOT NULL,
    X INT NOT NULL DEFAULT 0, Y INT NOT NULL DEFAULT 0,
    W INT NOT NULL DEFAULT 0, H INT NOT NULL DEFAULT 0,
    FontName NVARCHAR(100) NULL, FontSize INT NULL, FontWeight NVARCHAR(20) NULL,
    FontStyle NVARCHAR(20) NULL, Fill NVARCHAR(20) NULL, Align NVARCHAR(20) NULL,
    Placeholder NVARCHAR(50) NULL, StaticText NVARCHAR(MAX) NULL,
    BarcodeFormat NVARCHAR(50) NULL,
    BorderWidth INT NULL, BorderColor NVARCHAR(20) NULL, BorderStyle NVARCHAR(20) NULL,
    Visible BIT NOT NULL DEFAULT 1, Layer INT NOT NULL DEFAULT 0,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_LTC_Template FOREIGN KEY (TemplateID) REFERENCES FgL.LabelTemplate(TemplateID)
);
CREATE NONCLUSTERED INDEX IX_LTC_Template ON FgL.LabelTemplateComponent(TemplateID);
    PRINT N'★ 9) FgL.LabelTemplateComponent created';
END
ELSE
    PRINT N'★ 9) FgL.LabelTemplateComponent already exists';
GO

/*---------------------------------------------------------------------------  
 10) TABLE FgL.LabelTemplateMapping  
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.LabelTemplateMapping','U') IS NULL
BEGIN
CREATE TABLE FgL.LabelTemplateMapping(
    MappingID    INT IDENTITY(1,1) PRIMARY KEY,
    TemplateID   INT           NOT NULL,
    KeyName      NVARCHAR(100) NOT NULL,
    FieldName    NVARCHAR(100) NOT NULL,
    SortOrder    INT           NOT NULL DEFAULT 0,
    CreatedAt    DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_LTM_Template FOREIGN KEY (TemplateID) REFERENCES FgL.LabelTemplate(TemplateID)
);
    PRINT N'★ 10) FgL.LabelTemplateMapping created';
END
ELSE
    PRINT N'★ 10) FgL.LabelTemplateMapping already exists';
GO

/*---------------------------------------------------------------------------  
 11) TABLE FgL.LabelPrintJob  
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.LabelPrintJob','U') IS NULL
BEGIN
CREATE TABLE FgL.LabelPrintJob(
    PrintJobID    INT IDENTITY(1,1) PRIMARY KEY,
    BatchNo       NVARCHAR(30)  NOT NULL,
    BagNo         NVARCHAR(10)  NULL,
    StartBagNo    NVARCHAR(10)  NULL,
    EndBagNo      NVARCHAR(10)  NULL,
    TotalBags     INT           NULL,
    TemplateID    INT           NULL,
    PrinterID     INT           NULL,
    ItemKey       NVARCHAR(50)  NULL,
    CustKey       NVARCHAR(50)  NULL,
    ShipToCountry NVARCHAR(255) NULL, -- เพิ่มฟิลด์นี้เพื่อระบุประเทศที่ใช้พิมพ์
    PrintQuantity INT           NOT NULL DEFAULT 1,
    PrinterName   NVARCHAR(100) NULL,
    PrintStatus   NVARCHAR(20)  NOT NULL DEFAULT 'Pending',
    ErrorMessage  NVARCHAR(MAX) NULL,
    PrintData     NVARCHAR(MAX) NULL,
    RequestedBy   INT           NULL,
    RequestedDate DATETIME      NOT NULL DEFAULT GETDATE(),
    CompletedDate DATETIME      NULL,
    CONSTRAINT FK_LPJ_Template FOREIGN KEY (TemplateID) REFERENCES FgL.LabelTemplate(TemplateID),
    CONSTRAINT FK_LPJ_Printer  FOREIGN KEY (PrinterID)  REFERENCES FgL.Printer(PrinterID)
);
CREATE NONCLUSTERED INDEX IX_LPJ_BatchStatus ON FgL.LabelPrintJob(BatchNo,PrintStatus);
CREATE NONCLUSTERED INDEX IX_LPJ_ShipToCountry ON FgL.LabelPrintJob(ShipToCountry);
    PRINT N'★ 11) FgL.LabelPrintJob created';
END
ELSE
    PRINT N'★ 11) FgL.LabelPrintJob already exists';
GO 

/*---------------------------------------------------------------------------  
 12-14) Helper TVF และ Validate PROC  
---------------------------------------------------------------------------*/
PRINT N'★ 12-14) Creating TVF & validation proc';

/*---------------------------------------------------------------------------  
 12) TVF dbo.tvf_GetBagNumbers  
---------------------------------------------------------------------------*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.tvf_GetBagNumbers','IF') IS NULL
BEGIN
    EXEC('CREATE FUNCTION dbo.tvf_GetBagNumbers
(
    @BatchNo VARCHAR(30),
    @MaxBag  INT = 100
)
RETURNS TABLE
AS RETURN
(
    WITH N AS (
        SELECT TOP (ISNULL(@MaxBag,100))
               ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
        FROM (VALUES(1),(1),(1),(1),(1),(1),(1),(1),(1),(1)) a(n)
        CROSS JOIN (VALUES(1),(1),(1),(1),(1),(1),(1),(1),(1),(1)) b(n)
    )
    SELECT @BatchNo AS BatchNo,
               RIGHT(''000000'' + CAST(n AS VARCHAR(6)), 6) AS BagNo,
           n AS BagSequence,
           @MaxBag AS TotalBags
    FROM N
    );');
    PRINT N'★ 12) dbo.tvf_GetBagNumbers created';
END
ELSE
    PRINT N'★ 12) dbo.tvf_GetBagNumbers already exists';
GO

/*---------------------------------------------------------------------------  
 13) TVF dbo.tvf_GetBagNumbersRange  
---------------------------------------------------------------------------*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.tvf_GetBagNumbersRange','IF') IS NULL
BEGIN
    EXEC('CREATE FUNCTION dbo.tvf_GetBagNumbersRange
(
    @BatchNo   VARCHAR(30),
    @StartBag  INT = 1,
    @EndBag    INT = 100,
    @TotalBags INT = NULL
)
RETURNS TABLE
AS RETURN
(
    SELECT @BatchNo AS BatchNo,
               RIGHT(''000000'' + CAST(n AS VARCHAR(6)), 6) AS BagNo,
           n AS BagSequence,
               CAST(n AS VARCHAR) + ''/'' + CAST(ISNULL(@TotalBags,@EndBag) AS VARCHAR) AS BagPosition,
           ISNULL(@TotalBags,@EndBag) AS TotalBags
    FROM (
        SELECT TOP (CASE WHEN @EndBag > 999999 THEN 0
                         WHEN @EndBag > @StartBag THEN @EndBag - @StartBag + 1
                         ELSE 0 END)
               ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) + @StartBag - 1 AS n
        FROM (VALUES(1),(1),(1),(1),(1),(1),(1),(1),(1),(1)) a(n)
        CROSS JOIN (VALUES(1),(1),(1),(1),(1),(1),(1),(1),(1),(1)) b(n)
    ) z
    WHERE n <= @EndBag
      AND n <= 999999
    );');
    PRINT N'★ 13) dbo.tvf_GetBagNumbersRange created';
END
ELSE
    PRINT N'★ 13) dbo.tvf_GetBagNumbersRange already exists';
GO

/*---------------------------------------------------------------------------  
 14) PROC FgL.usp_ValidateBagNumber  
---------------------------------------------------------------------------*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('FgL.usp_ValidateBagNumber','P') IS NULL
BEGIN
    EXEC('CREATE PROCEDURE FgL.usp_ValidateBagNumber
    @BagNo INT
AS
BEGIN
    SET NOCOUNT ON;
    IF @BagNo > 999999
            THROW 50001, ''Bag number exceeds 6 digits'', 1;
    END;');
    PRINT N'★ 14) FgL.usp_ValidateBagNumber created';
END
ELSE
    PRINT N'★ 14) FgL.usp_ValidateBagNumber already exists';
GO

/*---------------------------------------------------------------------------  
  15) VIEW  FgL.vw_Label_PrintSummary (แก้ไขให้ตรงตามหลักการ 1 BatchNo = 1 ชุดข้อมูล)  
---------------------------------------------------------------------------*/
PRINT N'★ 15) Creating VIEW FgL.vw_Label_PrintSummary (standard version)';

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER VIEW FgL.vw_Label_PrintSummary AS
/*--------------------------------------------------------------
  STEP-1  KeyResolve : เข้าถึง ItemKey และ CustKey จาก BatchNo
--------------------------------------------------------------*/
WITH KeyResolve AS (
    SELECT
        PN.BatchNo,
        ItemKeyResolved = COALESCE(NULLIF(PN.ItemKey,''), NULLIF(PB0.Assembly_Item_Key,'')),
        CustKeyResolved = COALESCE(NULLIF(PN.CustKey,''), NULLIF(PB0.CustKey,'')) 
    FROM dbo.PNMAST PN
    LEFT JOIN dbo.PNBomInfo PB0 ON PB0.BatchNo = PN.BatchNo
),
/*--------------------------------------------------------------
  STEP-2  BatchCustomer : ข้อมูลลูกค้าและประเทศปลายทาง (1 ต่อ BatchNo)
--------------------------------------------------------------*/
BatchCustomer AS (
    -- หาข้อมูลจากตาราง BatchCustomerMapping เป็นหลัก
    SELECT 
        KR.BatchNo,
        KR.ItemKeyResolved,
        BCM.CustKey,
        BCM.ShipToCountry
    FROM KeyResolve KR
    JOIN FgL.BatchCustomerMapping BCM ON BCM.BatchNo = KR.BatchNo 
                                     AND BCM.Active = 1
    
    UNION
    
    -- ถ้าไม่มีข้อมูลในตาราง BatchCustomerMapping ใช้ค่าจาก PNMAST และ BME_LABEL
    SELECT 
        KR.BatchNo,
        KR.ItemKeyResolved,
        KR.CustKeyResolved,
        (SELECT TOP 1 SHIPTO_COUNTRY 
         FROM FgL.BME_LABEL 
         WHERE ItemKey = KR.ItemKeyResolved AND CustKey = KR.CustKeyResolved) AS ShipToCountry
    FROM KeyResolve KR
    WHERE NOT EXISTS (
        SELECT 1 FROM FgL.BatchCustomerMapping 
        WHERE BatchNo = KR.BatchNo AND Active = 1
    )
),
/*--------------------------------------------------------------
  STEP-3  BaseData  (รวมข้อมูลจากทุกตาราง)
--------------------------------------------------------------*/
BaseData AS (
    SELECT
        PN.BatchNo,
        PN.BatchTicketDate,
        PN.SchStartDate,
        PN.ActStartDate            AS ProductionDate,
        PN.ActCompletionDate,
        BC.ItemKeyResolved,
        BC.CustKey AS CustKeyResolved, -- ใช้ CustKey จาก BatchCustomer โดยตรง

        /*--------- BME_LABEL link ----------*/
        BC.CustKey,
        BL.ItemKey,

        /*  alias ที่ UI ใช้อยู่ */
        BL.[REMAINING_SHELF-LIFE],
        BC.ShipToCountry,          -- ใช้ค่าจาก BatchCustomer
        BL.IMPORTED_BY,

        /*  field อื่น ๆ ที่มาจากตารางอื่น (คงไว้) */
        IM.Desc1                    AS Product,
        IM.DaysToExpire,

        AR.Customer_Name,
        AR.Address_1, AR.Address_2, AR.Address_3,
        AR.City, AR.State, AR.Country,

        PB.FillLevel, PB.FillUOM, PB.FormulaID,
        PB.Assembly_Item_Key, PB.Assembly_Location,
        PB.AssemblyType, PB.FillMeasuredIN, PB.BOMUOM,

        T.TemplateID, T.Name        AS TemplateName, 
        T.UpdatedAt                AS TemplateUpdatedAt,
        T.Content,  T.Engine, T.PaperSize,

        TW.TotalWeightKG, PK.BagWKG, PK.CartonWKG,
        BagsCalc.TotalBags, BagsCalc.TotalCTN,

        /*===========  ▼ เพิ่มคอลัมน์ BME_LABEL ที่ "ยังไม่ถูก SELECT" ▼ ===========*/
        BL.PACKSIZE1,  BL.PACKUNIT1,
        BL.PACKSIZE2,  BL.PACKUNIT2,
        BL.TOTAL_UNIT2_IN_UNIT1,
        BL.NET_WEIGHT1,  BL.GROSS_WEIGHT1,
        BL.SHELFLIFE_MONTH, BL.SHELFLIFE_DAY, BL.SHELFLIFE_DAYLIMIT,
        BL.LABEL_COLOR,
        BL.PRODUCT            AS BL_Product,
        BL.DESCRIPTION,
        BL.[LOT CODE]         AS LotCodeCaption,
        BL.[BEST BEFORE]      AS BestBeforeCaption,
        BL.CUSTITEMCODE,
        BL.ALLERGEN1,  BL.ALLERGEN2,  BL.ALLERGEN3,
        BL.STORECAP1,
        BL.GMO1,
        BL.INGREDLIST1, BL.INGREDLIST2, BL.INGREDLIST3,
        BL.PRODATECAP,     BL.EXPIRYDATECAP,
        BL.ITEMCAP,        BL.WEIGHCAP,
        BL.COUNTRYOFORIGIN,
        BL.REMARK1,
        BL.SMALLPACKINFO,
        BL.[LABEL INSTRUCTION],
        BL.CUSCAP1, BL.CUSCAP2, BL.CUSCAP3,
        BL.BATCHCAP,
        BL.MANUCAP1, BL.MANUCAP2, BL.MANUCAP3,
        /*  (คอลัมน์ REMAINING_SHELF-LIFE, SHIPTO_COUNTRY, IMPORTED_BY 
            ถูกเลือกข้างบนแล้ว – จึงไม่ดึงซ้ำอีก) */
        BL.[IMPORTER ADDRESS],    BL.[IMPORTER CONTACT],
        BL.IMPORTER_LICENSE_ID,
        BL.PRODUCT_LICENSE_ID1,   BL.PRODUCT_LICENSE_ID2,
        BL.CUSTOMS_TEXT1,         BL.CUSTOMS_TEXT2,
        BL.HALALLOGO,             BL.HALALNUMBER,
        BL.STANDARD_LABEL,        BL.SPECIAL_LABEL, BL.CUSTOMER_LABEL,
        BL.QSR_BRAND,             BL.QSRFORMAT,
        BL.THAINAME,
        BL.FDANUMBER,             BL.FOODADDITIVE,
        BL.INGREDIENTTHAI1,       BL.INGREDIENTTHAI2,  BL.INGREDIENTTHAI3,
        BL.USINGINSTRUCTION1,     BL.USINGINSTRUCTION2, BL.USINGINSTRUCTION3,
        BL.ALLERGENTHAI1,         BL.ALLERGENTHAI2,
        BL.CHECKBY,
        BL.INNER_PATH,            BL.OUTER_PATH,
        /* ---------- Arabic fields ----------*/
        BL.[PRODUCT NAME IN ARABIC],
        BL.[INGREDIENT LIST IN ARABIC 1],
        BL.[INGREDIENT LIST IN ARABIC 2],
        BL.[INGREDIENT LIST IN ARABIC 3],
        BL.[ALLERGEN IN ARABIC 1],
        BL.[ALLERGEN IN ARABIC 2],
        BL.[ALLERGEN IN ARABIC 3],
        BL.[STORAGE CONDITION IN ARABIC],
        BL.[IMPORTED_BY IN ARABIC],
        BL.[IMPORTER ADDRESS IN ARABIC],
        BL.[IMPORTER CONTACT IN ARABIC],
        BL.[SMALLPACKINFO IN ARABIC],
        /* ---------- Chinese fields ----------*/
        BL.[PRODUCT NAME IN CHINESE],
        BL.[INGREDIENT LIST IN CHINESE 1],
        BL.[INGREDIENT LIST IN CHINESE 2],
        BL.[INGREDIENT LIST IN CHINESE 3],
        BL.[ALLERGEN IN CHINESE 1],
        BL.[ALLERGEN IN CHINESE 2],
        BL.[ALLERGEN IN CHINESE 3],
        BL.[STORAGE CONDITION IN CHINESE],
        BL.[IMPORTED_BY IN CHINESE],
        BL.[IMPORTER ADDRESS IN CHINESE],
        BL.[IMPORTER CONTACT IN CHINESE],
        BL.[SMALLPACKINFO IN CHINESE],
        BL.[APPLICATION SCOPE IN CHINESE],
        BL.[USE INSTRUCTION IN CHINESE],
        BL.[NOTE IN CHINESE]
        /*=========== ▲ END: extra fields ▲ ===========*/

    /*==== joins ตารางต่างๆ เข้าด้วยกัน ====*/
    FROM dbo.PNMAST PN
    INNER JOIN KeyResolve                    KR  ON KR.BatchNo = PN.BatchNo
    INNER JOIN BatchCustomer                 BC  ON BC.BatchNo = PN.BatchNo
    LEFT  JOIN FgL.BME_LABEL                 BL  ON BL.ItemKey = BC.ItemKeyResolved 
                                               AND BL.CustKey = BC.CustKey
    LEFT  JOIN dbo.INMAST                    IM  ON IM.ItemKey = BC.ItemKeyResolved
    LEFT  JOIN dbo.ARCUST                    AR  ON AR.Customer_Key = BC.CustKey
    OUTER APPLY (
         SELECT TOP 1 *
         FROM   dbo.PNBomInfo p
         WHERE  p.BatchNo = PN.BatchNo
         ORDER  BY CASE WHEN p.Assembly_Item_Key = BC.ItemKeyResolved THEN 0 ELSE 1 END, p.LineID
    )                                           PB
    LEFT  JOIN FgL.LabelTemplate               T  ON T.Active = 1
                                                 AND T.ProductKey  = BC.ItemKeyResolved
                                                 AND (T.CustomerKey = BC.CustKey OR T.CustomerKey IS NULL)
                                                 AND (T.ShipToCountry = BC.ShipToCountry OR T.ShipToCountry IS NULL)
    CROSS APPLY (SELECT TotalWeightKG = COALESCE(NULLIF(PN.TotalFGWeightYielded,0),
                                                 NULLIF(PN.BatchWeight,0),0)) TW
    CROSS APPLY (
         SELECT CartonWKG = CASE WHEN BL.PACKUNIT1 LIKE '%ctn%' THEN NULLIF(BL.PACKSIZE1,0)
                                 WHEN BL.PACKUNIT2 LIKE '%ctn%' THEN NULLIF(BL.PACKSIZE2,0) END,
                BagWKG    = CASE WHEN BL.PACKUNIT2 LIKE '%bag%' THEN NULLIF(BL.PACKSIZE2,0)
                                 WHEN BL.PACKUNIT1 LIKE '%bag%' THEN NULLIF(BL.PACKSIZE1,0) END
    )                                           PK
    CROSS APPLY (
         SELECT TotalBags = CASE WHEN PK.BagWKG    IS NOT NULL AND PK.BagWKG    > 0
                                    THEN CEILING(TW.TotalWeightKG/PK.BagWKG) ELSE 1 END,
                TotalCTN  = CASE WHEN PK.CartonWKG IS NOT NULL AND PK.CartonWKG > 0
                                    THEN CEILING(TW.TotalWeightKG/PK.CartonWKG) END
    )                                           BagsCalc
)
/*--------------------------------------------------------------
  FINAL SELECT
--------------------------------------------------------------*/
SELECT *
FROM   BaseData;
GO

PRINT N'★ vw_Label_PrintSummary updated – standard 1 BatchNo = 1 CustKey';
GO 

/*---------------------------------------------------------------------------  
  16) TVF  FgL.tvf_Label_PrintData (แก้ไขให้ตรงตามหลักการ 1 BatchNo = 1 ชุดข้อมูล)
---------------------------------------------------------------------------*/
PRINT N'★ 16) Creating TVF FgL.tvf_Label_PrintData (standard version)';

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER FUNCTION FgL.tvf_Label_PrintData
(
    @BatchNo NVARCHAR(30),
    @BagNo   NVARCHAR(10) = NULL
)
RETURNS TABLE
AS RETURN
(
    SELECT  S.*,
            BG.BagNo,
            BG.BagSequence,
            BG.BagPosition,
            BG.TotalBags  AS BagNumbers_Total
    FROM    FgL.vw_Label_PrintSummary S
    CROSS   APPLY dbo.tvf_GetBagNumbersRange(S.BatchNo,1,S.TotalBags,S.TotalBags) BG
    WHERE   S.BatchNo = @BatchNo
      AND  (@BagNo IS NULL OR BG.BagNo = @BagNo)
);
GO
PRINT N'★ 16) FgL.tvf_Label_PrintData created/updated';
GO

/*---------------------------------------------------------------------------  
  17) PROC FgL.usp_GetLabelDataByBatchNo (แก้ไขให้ตรงตามหลักการ 1 BatchNo = 1 ชุดข้อมูล)
---------------------------------------------------------------------------*/
PRINT N'★ 17) Creating PROC FgL.usp_GetLabelDataByBatchNo (standard version)';

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE FgL.usp_GetLabelDataByBatchNo
    @BatchNo NVARCHAR(30),
    @BagNo   NVARCHAR(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    /* ถ้าไม่ระบุ BagNo → ส่งสรุประดับ Batch */
    IF @BagNo IS NULL
    BEGIN
        SELECT *, 1 AS LabelRowNo
        FROM   FgL.vw_Label_PrintSummary
        WHERE  BatchNo = @BatchNo
        ORDER  BY ItemKey;
        RETURN;
    END

    /* Bag-level */
    SELECT *, ROW_NUMBER() OVER (ORDER BY BagSequence) AS LabelRowNo
    FROM   FgL.tvf_Label_PrintData(@BatchNo, @BagNo)
    ORDER  BY BagSequence;
END;
GO
PRINT N'★ 17) FgL.usp_GetLabelDataByBatchNo created/updated';
GO

/*---------------------------------------------------------------------------  
  18) PROC FgL.usp_UpdateBatchCustomerMapping - สำหรับการจัดการข้อมูลลูกค้าของ Batch
---------------------------------------------------------------------------*/
PRINT N'★ 18) Creating PROC FgL.usp_UpdateBatchCustomerMapping';

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE FgL.usp_UpdateBatchCustomerMapping
    @BatchNo NVARCHAR(30),
    @ItemKey NVARCHAR(50),
    @CustKey NVARCHAR(50),
    @ShipToCountry NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    -- ตรวจสอบว่ามีข้อมูล BatchNo นี้อยู่แล้วหรือไม่
    DECLARE @MappingID INT = NULL;
    
    SELECT @MappingID = MappingID
    FROM FgL.BatchCustomerMapping
    WHERE BatchNo = @BatchNo;
      
    IF @MappingID IS NULL
    BEGIN
        -- ยังไม่มีข้อมูล ให้เพิ่มใหม่
        INSERT INTO FgL.BatchCustomerMapping (BatchNo, ItemKey, CustKey, ShipToCountry)
        VALUES (@BatchNo, @ItemKey, @CustKey, @ShipToCountry);
        
        SET @MappingID = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        -- มีข้อมูลอยู่แล้ว ให้อัพเดท
        UPDATE FgL.BatchCustomerMapping
        SET ItemKey = @ItemKey,
            CustKey = @CustKey,
            ShipToCountry = @ShipToCountry,
            Active = 1,
            UpdatedAt = GETDATE()
        WHERE MappingID = @MappingID;
    END
    
    -- คืนค่าข้อมูลที่อัพเดท
    SELECT *
    FROM FgL.BatchCustomerMapping
    WHERE MappingID = @MappingID;
END;
GO
PRINT N'★ 18) FgL.usp_UpdateBatchCustomerMapping created';
GO

/*---------------------------------------------------------------------------  
  19) String-Mapping Tables & PROC  
---------------------------------------------------------------------------*/
PRINT N'★ 19) Creating string-mapping objects';

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
IF OBJECT_ID('FgL.TemplateMappingProductString','U') IS NULL
BEGIN
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
END
ELSE
    PRINT N'✓ ตาราง FgL.TemplateMappingProductString มีอยู่แล้ว';
GO

/*---------------------------------------------------------------------------  
  2) สร้างตาราง mapping สำหรับ CustomerKey ที่เป็น string
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.TemplateMappingCustomerString','U') IS NULL
BEGIN
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
END
ELSE
    PRINT N'✓ ตาราง FgL.TemplateMappingCustomerString มีอยู่แล้ว';
GO 

/*---------------------------------------------------------------------------  
  3) สร้างตาราง mapping สำหรับคู่ ProductKey, CustomerKey และ ShipToCountry ที่เป็น string
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.TemplateMappingProductCustomerString','U') IS NULL
BEGIN
CREATE TABLE FgL.TemplateMappingProductCustomerString (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    TemplateID INT NOT NULL,
    ProductKeyString NVARCHAR(50) NOT NULL,
    CustomerKeyString NVARCHAR(50) NOT NULL,
    ShipToCountryString NVARCHAR(255) NULL, -- เพิ่มคอลัมน์นี้
    Active BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_TMPCS_Template FOREIGN KEY (TemplateID) REFERENCES FgL.LabelTemplate(TemplateID)
);

CREATE INDEX IX_TemplateMappingProductCustomerString_ProductKey ON FgL.TemplateMappingProductCustomerString(ProductKeyString);
CREATE INDEX IX_TemplateMappingProductCustomerString_CustomerKey ON FgL.TemplateMappingProductCustomerString(CustomerKeyString);
CREATE INDEX IX_TemplateMappingProductCustomerString_ShipToCountry ON FgL.TemplateMappingProductCustomerString(ShipToCountryString);
CREATE INDEX IX_TemplateMappingProductCustomerString_Active ON FgL.TemplateMappingProductCustomerString(Active);
CREATE INDEX IX_TemplateMappingProductCustomerString_TemplateID ON FgL.TemplateMappingProductCustomerString(TemplateID);

PRINT N'✓ ตาราง FgL.TemplateMappingProductCustomerString สร้างเรียบร้อยแล้ว';
END
ELSE
    PRINT N'✓ ตาราง FgL.TemplateMappingProductCustomerString มีอยู่แล้ว';
GO

/*---------------------------------------------------------------------------  
  4) สร้าง Stored Procedure สำหรับค้นหา template ด้วย ProductKey, CustomerKey และ ShipToCountry
---------------------------------------------------------------------------*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE FgL.GetTemplateByProductAndCustomerKeys
    @productKey NVARCHAR(200),
    @customerKey NVARCHAR(200) = NULL,
    @shipToCountry NVARCHAR(255) = NULL,
    @templateType NVARCHAR(50) = 'Standard'
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @TemplateID INT = NULL;
    
    -- ล็อก input parameters เพื่อช่วยในการดีบัก
    PRINT 'DEBUG FgL.GetTemplateByProductAndCustomerKeys: ProductKey=' + ISNULL(@productKey, 'NULL') + 
          ', CustomerKey=' + ISNULL(@customerKey, 'NULL') + 
          ', ShipToCountry=' + ISNULL(@shipToCountry, 'NULL') + 
          ', TemplateType=' + ISNULL(@templateType, 'NULL');
    
    -- ลำดับความสำคัญในการค้นหา Template:
    -- 1. ค้นหาจาก ProductKey + CustomerKey + ShipToCountry (ตรงทั้งหมด)
    -- 2. ค้นหาจาก ProductKey + CustomerKey (ไม่สนใจ ShipToCountry)
    -- 3. ค้นหาจาก ProductKey อย่างเดียว
    -- 4. ค้นหาจาก CustomerKey อย่างเดียว

    -- ตรวจสอบค่า TemplateType ที่ระบุ
    IF @templateType IS NULL 
        SET @templateType = 'Standard';
        
    PRINT 'DEBUG FgL.GetTemplateByProductAndCustomerKeys: Using TemplateType=' + @templateType;

    -- 1. ค้นหาจาก ProductKey + CustomerKey + ShipToCountry
    IF @productKey IS NOT NULL AND @customerKey IS NOT NULL AND @shipToCountry IS NOT NULL
    BEGIN
        -- ค้นหาจาก exact match
        SELECT TOP 1 @TemplateID = T.TemplateID
        FROM FgL.LabelTemplate T
        WHERE T.ProductKey = @productKey
          AND T.CustomerKey = @customerKey
          AND T.ShipToCountry = @shipToCountry
          AND (T.TemplateType = @templateType OR T.TemplateType IS NULL)
          AND T.Active = 1
        ORDER BY T.CreatedAt DESC;
        
        -- ถ้าไม่พบ ลองค้นหาจากตารางแมปปิ้ง
        IF @TemplateID IS NULL
        BEGIN
            SELECT TOP 1 @TemplateID = M.TemplateID
            FROM FgL.TemplateMappingProductCustomerString M
            INNER JOIN FgL.LabelTemplate T ON M.TemplateID = T.TemplateID
            WHERE @productKey LIKE M.ProductKeyString
              AND @customerKey LIKE M.CustomerKeyString
              AND (@shipToCountry LIKE M.ShipToCountryString OR M.ShipToCountryString IS NULL)
              AND (T.TemplateType = @templateType OR T.TemplateType IS NULL)
              AND M.Active = 1
              AND T.Active = 1
            ORDER BY 
                CASE WHEN M.ShipToCountryString IS NOT NULL THEN 1 ELSE 2 END, -- เรียงตาม ShipToCountry ที่มีค่าก่อน
                M.CreatedAt DESC;
        END;
    END;
    
    -- 2. ค้นหาจาก ProductKey + CustomerKey
    IF @TemplateID IS NULL AND @productKey IS NOT NULL AND @customerKey IS NOT NULL
    BEGIN
        SELECT TOP 1 @TemplateID = T.TemplateID
        FROM FgL.LabelTemplate T
        WHERE T.ProductKey = @productKey
          AND T.CustomerKey = @customerKey
          AND (T.ShipToCountry IS NULL)
          AND (T.TemplateType = @templateType OR T.TemplateType IS NULL)
          AND T.Active = 1
        ORDER BY T.CreatedAt DESC;
        
        -- ถ้าไม่พบ ลองค้นหาจากตารางแมปปิ้ง
        IF @TemplateID IS NULL
        BEGIN
            SELECT TOP 1 @TemplateID = M.TemplateID
            FROM FgL.TemplateMappingProductCustomerString M
            INNER JOIN FgL.LabelTemplate T ON M.TemplateID = T.TemplateID
            WHERE @productKey LIKE M.ProductKeyString
              AND @customerKey LIKE M.CustomerKeyString
              AND M.ShipToCountryString IS NULL
              AND (T.TemplateType = @templateType OR T.TemplateType IS NULL)
              AND M.Active = 1
              AND T.Active = 1
            ORDER BY M.CreatedAt DESC;
        END;
    END;
    
    -- 3. ค้นหาจาก ProductKey อย่างเดียว
    IF @TemplateID IS NULL AND @productKey IS NOT NULL
    BEGIN
        SELECT TOP 1 @TemplateID = T.TemplateID
        FROM FgL.LabelTemplate T
        WHERE T.ProductKey = @productKey
          AND (T.CustomerKey IS NULL OR T.CustomerKey = '')
          AND (T.TemplateType = @templateType OR T.TemplateType IS NULL)
          AND T.Active = 1
        ORDER BY T.CreatedAt DESC;
        
        -- ถ้าไม่พบ ลองค้นหาจากตารางแมปปิ้ง
        IF @TemplateID IS NULL
        BEGIN
            SELECT TOP 1 @TemplateID = M.TemplateID
            FROM FgL.TemplateMappingProductString M
            INNER JOIN FgL.LabelTemplate T ON M.TemplateID = T.TemplateID
            WHERE @productKey LIKE M.ProductKeyString
              AND (T.TemplateType = @templateType OR T.TemplateType IS NULL)
              AND M.Active = 1
              AND T.Active = 1
            ORDER BY M.CreatedAt DESC;
        END;
    END;
    
    -- 4. ค้นหาจาก CustomerKey อย่างเดียว
    IF @TemplateID IS NULL AND @customerKey IS NOT NULL
    BEGIN
        SELECT TOP 1 @TemplateID = T.TemplateID
        FROM FgL.LabelTemplate T
        WHERE (T.ProductKey IS NULL OR T.ProductKey = '')
          AND T.CustomerKey = @customerKey
          AND (T.TemplateType = @templateType OR T.TemplateType IS NULL)
          AND T.Active = 1
        ORDER BY T.CreatedAt DESC;
        
        -- ถ้าไม่พบ ลองค้นหาจากตารางแมปปิ้ง
        IF @TemplateID IS NULL
        BEGIN
            SELECT TOP 1 @TemplateID = M.TemplateID
            FROM FgL.TemplateMappingCustomerString M
            INNER JOIN FgL.LabelTemplate T ON M.TemplateID = T.TemplateID
            WHERE @customerKey LIKE M.CustomerKeyString
              AND (T.TemplateType = @templateType OR T.TemplateType IS NULL)
              AND M.Active = 1
              AND T.Active = 1
            ORDER BY M.CreatedAt DESC;
        END;
    END;
    
    -- ล็อกผลลัพธ์
    IF @TemplateID IS NULL
        PRINT 'DEBUG FgL.GetTemplateByProductAndCustomerKeys: No template found';
    ELSE
        PRINT 'DEBUG FgL.GetTemplateByProductAndCustomerKeys: Found TemplateID=' + CAST(@TemplateID AS NVARCHAR(20));
        
    -- ส่งค่า TemplateID กลับไป
    SELECT @TemplateID AS TemplateID;
END;
GO
PRINT N'✓ Stored Procedure FgL.GetTemplateByProductAndCustomerKeys สร้างเรียบร้อยแล้ว';
GO

/*---------------------------------------------------------------------------  
  5) สร้าง Stored Procedure สำหรับอัพเดต mapping ระหว่าง template กับ key ต่างๆ
---------------------------------------------------------------------------*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE FgL.UpdateTemplateMappingWithStringKeys
    @TemplateID INT,
    @ProductKey NVARCHAR(50) = NULL,
    @CustomerKey NVARCHAR(50) = NULL,
    @ShipToCountry NVARCHAR(255) = NULL
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
    
    -- ถ้ามีทั้ง ProductKey และ CustomerKey ทำให้ templates อื่นที่มี ProductKey+CustomerKey+ShipToCountry เดียวกันเป็น inactive
    IF @ProductKey IS NOT NULL AND @ProductKey <> '' AND @ProductKey <> 'system' AND 
       @CustomerKey IS NOT NULL AND @CustomerKey <> '' AND @CustomerKey <> 'system'
    BEGIN
        -- 1. หา templates ทั้งหมดที่มี ProductKey+CustomerKey+ShipToCountry เดียวกัน
        DECLARE @OtherTemplateIds TABLE (TemplateID INT);
        
        -- จากตาราง TemplateMappingProductCustomerString
        INSERT INTO @OtherTemplateIds (TemplateID)
        SELECT DISTINCT TemplateID 
        FROM FgL.TemplateMappingProductCustomerString
        WHERE ProductKeyString = @ProductKey
          AND CustomerKeyString = @CustomerKey
          AND (ShipToCountryString = @ShipToCountry OR (@ShipToCountry IS NULL AND ShipToCountryString IS NULL))
          AND Active = 1
          AND TemplateID <> @TemplateID;
        
        -- จากตาราง LabelTemplate
        INSERT INTO @OtherTemplateIds (TemplateID)
        SELECT DISTINCT TemplateID
        FROM FgL.LabelTemplate
        WHERE ProductKey = @ProductKey
          AND CustomerKey = @CustomerKey
          AND (ShipToCountry = @ShipToCountry OR (@ShipToCountry IS NULL AND ShipToCountry IS NULL))
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
        
        -- ถ้ามี CustomerKey ด้วย เพิ่ม mapping สำหรับคู่ ProductKey, CustomerKey และ ShipToCountry
        IF @CustomerKey IS NOT NULL AND @CustomerKey <> '' AND @CustomerKey <> 'system'
        BEGIN
            INSERT INTO FgL.TemplateMappingProductCustomerString 
                (TemplateID, ProductKeyString, CustomerKeyString, ShipToCountryString)
            VALUES (@TemplateID, @ProductKey, @CustomerKey, @ShipToCountry);
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
        ShipToCountry = @ShipToCountry,
        UpdatedAt = GETDATE(),
        Active = 1
    WHERE TemplateID = @TemplateID;
    
    -- คืนค่า TemplateID ที่อัพเดต
    SELECT @TemplateID AS TemplateID;
END;
GO
PRINT N'✓ Stored Procedure FgL.UpdateTemplateMappingWithStringKeys สร้างเรียบร้อยแล้ว';
GO

/*---------------------------------------------------------------------------  
  IMPORT DATA TO BatchCustomerMapping
---------------------------------------------------------------------------*/
PRINT N'★ 19) นำเข้าข้อมูลเริ่มต้นไปยังตาราง FgL.BatchCustomerMapping';

-- ตรวจสอบว่ามีข้อมูลในตารางหรือไม่
IF NOT EXISTS (SELECT TOP 1 1 FROM FgL.BatchCustomerMapping)
BEGIN
    BEGIN TRY
        INSERT INTO FgL.BatchCustomerMapping (BatchNo, ItemKey, CustKey, ShipToCountry)
        SELECT DISTINCT 
            BatchNo, 
            ItemKeyResolved AS ItemKey, 
            CustKeyResolved AS CustKey,
            ShipToCountry
        FROM FgL.vw_Label_PrintSummary
        WHERE BatchNo IS NOT NULL 
          AND ItemKeyResolved IS NOT NULL 
          AND CustKeyResolved IS NOT NULL
          -- กรณีที่มีหลายรายการต่อ BatchNo ให้เลือกเพียงรายการแรกเท่านั้น
          AND BatchNo NOT IN (
            SELECT BatchNo FROM FgL.BatchCustomerMapping
          );
        PRINT N'★ Data migrated to FgL.BatchCustomerMapping';
    END TRY
    BEGIN CATCH
        PRINT N'★ No data migration to FgL.BatchCustomerMapping: ' + ERROR_MESSAGE();
    END CATCH;
END
ELSE
    PRINT N'★ FgL.BatchCustomerMapping already has data';
GO

/*---------------------------------------------------------------------------  
  FINISHED  
---------------------------------------------------------------------------*/
PRINT N'✅  FG-Label schema rev J1-keep installed successfully (support for multiple CustKeys per BatchNo)';
GO 