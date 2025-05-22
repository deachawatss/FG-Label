/*============================================================================== 
  FG-Label Database Schema Installation Script  (FULL REBUILD – KEEP DATA)  
  Database : TFCPILOT2 
  Version  : 2.6-revI9-keep  –  22-May-2025 19:00
  Notes    : • ไม่ DROP FgL.BME_LABEL / FgL.BME_LABEL_WIP
             • ถ้าไม่มีสองตารางนี้จึงสร้างใหม่พร้อมดัชนี
             • Objects อื่นรีเซ็ตตาม rev I9 (Fix duplicate rows & ShipToCountry)
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
  15) VIEW  FgL.vw_Label_PrintSummary (ShipToCountry alias)  
---------------------------------------------------------------------------*/
PRINT N'★ 15) Creating VIEW FgL.vw_Label_PrintSummary';

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('FgL.vw_Label_PrintSummary','V') IS NULL
BEGIN
    EXEC('CREATE VIEW FgL.vw_Label_PrintSummary AS
WITH KeyResolve AS (
    SELECT
        PN.BatchNo,
            ItemKeyResolved = COALESCE(NULLIF(PN.ItemKey,''''), NULLIF(PB0.Assembly_Item_Key,'''')),
            CustKeyResolved = COALESCE(NULLIF(PN.CustKey,''''), NULLIF(PB0.CustKey,'''')) 
    FROM dbo.PNMAST PN
    LEFT JOIN dbo.PNBomInfo PB0 ON PB0.BatchNo = PN.BatchNo
),
BaseData AS (
    SELECT
        PN.BatchNo,
            PN.BatchTicketDate,
            PN.SchStartDate,
            PN.ActStartDate            AS ProductionDate,
            PN.ActCompletionDate,
            KR.ItemKeyResolved,
            KR.CustKeyResolved,
            BL.CustKey,
            BL.ItemKey,
        BL.[REMAINING_SHELF-LIFE],
            BL.SHIPTO_COUNTRY AS ShipToCountry,     -- ★ alias ใหม่
        BL.IMPORTED_BY,
            IM.Desc1                       AS Product,
            IM.DaysToExpire,
            AR.Customer_Name,
            AR.Address_1, AR.Address_2, AR.Address_3,
            AR.City, AR.State, AR.Country,
            PB.FillLevel, PB.FillUOM, PB.FormulaID,
            PB.Assembly_Item_Key, PB.Assembly_Location,
            PB.AssemblyType, PB.FillMeasuredIN, PB.BOMUOM,
            T.TemplateID, T.Name AS TemplateName, T.UpdatedAt AS TemplateUpdatedAt,
            T.Content, T.Engine, T.PaperSize,
            TW.TotalWeightKG, PK.BagWKG, PK.CartonWKG,
            BagsCalc.TotalBags, BagsCalc.TotalCTN
    FROM dbo.PNMAST PN
        INNER JOIN KeyResolve KR ON KR.BatchNo = PN.BatchNo
        LEFT  JOIN FgL.BME_LABEL BL ON BL.ItemKey = KR.ItemKeyResolved
        LEFT  JOIN dbo.INMAST IM    ON IM.ItemKey = KR.ItemKeyResolved
        LEFT  JOIN dbo.ARCUST AR    ON AR.Customer_Key = KR.CustKeyResolved
        OUTER APPLY (
            SELECT TOP 1 *
            FROM dbo.PNBomInfo p
            WHERE p.BatchNo = PN.BatchNo
            ORDER BY CASE WHEN p.Assembly_Item_Key = KR.ItemKeyResolved THEN 0 ELSE 1 END, p.LineID
        ) PB
        LEFT JOIN FgL.LabelTemplate T ON T.Active = 1
                                     AND T.ProductKey  = KR.ItemKeyResolved
                                     AND (T.CustomerKey = KR.CustKeyResolved OR T.CustomerKey IS NULL)
        CROSS APPLY (SELECT TotalWeightKG = COALESCE(NULLIF(PN.TotalFGWeightYielded,0), NULLIF(PN.BatchWeight,0), 0)) TW
        CROSS APPLY (
            SELECT CartonWKG = CASE WHEN BL.PACKUNIT1 LIKE ''%ctn%'' THEN NULLIF(BL.PACKSIZE1,0)
                                    WHEN BL.PACKUNIT2 LIKE ''%ctn%'' THEN NULLIF(BL.PACKSIZE2,0) END,
                   BagWKG    = CASE WHEN BL.PACKUNIT2 LIKE ''%bag%'' THEN NULLIF(BL.PACKSIZE2,0)
                                    WHEN BL.PACKUNIT1 LIKE ''%bag%'' THEN NULLIF(BL.PACKSIZE1,0) END
        ) PK
        CROSS APPLY (
            SELECT TotalBags = CASE WHEN PK.BagWKG IS NOT NULL AND PK.BagWKG > 0
                                       THEN CEILING(TW.TotalWeightKG/PK.BagWKG) ELSE 1 END,
                   TotalCTN  = CASE WHEN PK.CartonWKG IS NOT NULL AND PK.CartonWKG > 0
                                       THEN CEILING(TW.TotalWeightKG/PK.CartonWKG) END
        ) BagsCalc
    )
    SELECT * FROM BaseData;');
    PRINT N'★ 15) FgL.vw_Label_PrintSummary created';
END
ELSE
    PRINT N'★ 15) FgL.vw_Label_PrintSummary already exists';
GO

/*---------------------------------------------------------------------------  
  16) TVF  FgL.tvf_Label_PrintData  
---------------------------------------------------------------------------*/
PRINT N'★ 16) Creating TVF FgL.tvf_Label_PrintData';

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('FgL.tvf_Label_PrintData','IF') IS NULL
BEGIN
    EXEC('CREATE FUNCTION FgL.tvf_Label_PrintData
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
    );');
    PRINT N'★ 16) FgL.tvf_Label_PrintData created';
END
ELSE
    PRINT N'★ 16) FgL.tvf_Label_PrintData already exists';
GO

/*---------------------------------------------------------------------------  
  17) PROC FgL.usp_GetLabelDataByBatchNo  
---------------------------------------------------------------------------*/
PRINT N'★ 17) Creating PROC FgL.usp_GetLabelDataByBatchNo';

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('FgL.usp_GetLabelDataByBatchNo','P') IS NULL
BEGIN
    EXEC('CREATE PROCEDURE FgL.usp_GetLabelDataByBatchNo
    @BatchNo NVARCHAR(30),
    @BagNo   NVARCHAR(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;

        /* ถ้าไม่ระบุ BagNo → ส่งสรุประดับ Batch ไม่ซ้ำ */
    IF @BagNo IS NULL
    BEGIN
        SELECT *, 1 AS LabelRowNo
        FROM   FgL.vw_Label_PrintSummary
        WHERE  BatchNo = @BatchNo
        ORDER  BY ItemKey, CustKey;
        RETURN;
    END

        /* Bag-level */
    SELECT *, ROW_NUMBER() OVER (ORDER BY BagSequence) AS LabelRowNo
    FROM   FgL.tvf_Label_PrintData(@BatchNo,@BagNo)
    ORDER  BY BagSequence;
    END;');
    PRINT N'★ 17) FgL.usp_GetLabelDataByBatchNo created';
END
ELSE
    PRINT N'★ 17) FgL.usp_GetLabelDataByBatchNo already exists';
GO

/*---------------------------------------------------------------------------  
  18) String-Mapping Tables & PROC  
---------------------------------------------------------------------------*/
PRINT N'★ 18) Creating string-mapping objects';

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
  3) สร้างตาราง mapping สำหรับคู่ ProductKey และ CustomerKey ที่เป็น string
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.TemplateMappingProductCustomerString','U') IS NULL
BEGIN
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
END
ELSE
    PRINT N'✓ ตาราง FgL.TemplateMappingProductCustomerString มีอยู่แล้ว';
GO

/*---------------------------------------------------------------------------  
  4) สร้าง Stored Procedure สำหรับค้นหา template ด้วย ProductKey และ CustomerKey ที่เป็น string
---------------------------------------------------------------------------*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('FgL.GetTemplateByProductAndCustomerKeys','P') IS NULL
BEGIN
    EXEC('CREATE PROCEDURE FgL.GetTemplateByProductAndCustomerKeys
    @productKey NVARCHAR(200),
    @customerKey NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @TemplateID INT = NULL;
    
    -- ถ้ามีทั้ง productKey และ customerKey ลองหา template จากทั้งคู่ก่อน
    IF @productKey IS NOT NULL AND @customerKey IS NOT NULL
    BEGIN
        -- ลองหาจาก exact match ทั้ง product และ customer ก่อน
        SELECT TOP 1 @TemplateID = T.TemplateID
        FROM FgL.LabelTemplate T
        WHERE T.ProductKey = @productKey
          AND T.CustomerKey = @customerKey
          AND T.Active = 1
        ORDER BY T.CreatedAt DESC;
        
        -- ถ้าไม่พบ แสดงว่าจะลองค้นหาจากตารางแมปปิ้งที่เป็นแบบ String match
        IF @TemplateID IS NULL
        BEGIN
            SELECT TOP 1 @TemplateID = M.TemplateID
            FROM FgL.TemplateMappingProductCustomerString M
            WHERE @productKey LIKE M.ProductKeyString
              AND @customerKey LIKE M.CustomerKeyString
              AND M.Active = 1
            ORDER BY M.CreatedAt DESC;
        END;
    END;
    
    -- ถ้ายังไม่พบและมี productKey ให้ลองค้นหาแค่จาก productKey
    IF @TemplateID IS NULL AND @productKey IS NOT NULL
    BEGIN
        -- ลองหาจาก LabelTemplate โดยตรง
        SELECT TOP 1 @TemplateID = T.TemplateID
        FROM FgL.LabelTemplate T
        WHERE T.ProductKey = @productKey
              AND (T.CustomerKey IS NULL OR T.CustomerKey = '''')
          AND T.Active = 1
        ORDER BY T.CreatedAt DESC;
        
        -- ถ้าไม่พบ ลองหาจากตารางแมปปิ้ง
        IF @TemplateID IS NULL
        BEGIN
            SELECT TOP 1 @TemplateID = M.TemplateID
            FROM FgL.TemplateMappingProductString M
            WHERE @productKey LIKE M.ProductKeyString
              AND M.Active = 1
            ORDER BY M.CreatedAt DESC;
        END;
    END;
    
    -- ถ้ายังไม่พบและมี customerKey ให้ลองค้นหาแค่จาก customerKey
    IF @TemplateID IS NULL AND @customerKey IS NOT NULL
    BEGIN
        -- ลองหาจาก LabelTemplate โดยตรง
        SELECT TOP 1 @TemplateID = T.TemplateID
        FROM FgL.LabelTemplate T
        WHERE T.CustomerKey = @customerKey
              AND (T.ProductKey IS NULL OR T.ProductKey = '''')
          AND T.Active = 1
        ORDER BY T.CreatedAt DESC;
        
        -- ถ้าไม่พบ ลองหาจากตารางแมปปิ้ง
        IF @TemplateID IS NULL
        BEGIN
            SELECT TOP 1 @TemplateID = M.TemplateID
            FROM FgL.TemplateMappingCustomerString M
            WHERE @customerKey LIKE M.CustomerKeyString
              AND M.Active = 1
            ORDER BY M.CreatedAt DESC;
        END;
    END;
    
    -- ส่งผลลัพธ์
    IF @TemplateID IS NOT NULL
    BEGIN
        SELECT @TemplateID AS TemplateID;
    END
    ELSE
    BEGIN
        -- ไม่พบ Template ที่ตรงกับเงื่อนไข
        SELECT NULL AS TemplateID;
    END;
    END;');
PRINT N'✓ Stored Procedure FgL.GetTemplateByProductAndCustomerKeys สร้างเรียบร้อยแล้ว';
END
ELSE
    PRINT N'✓ Stored Procedure FgL.GetTemplateByProductAndCustomerKeys มีอยู่แล้ว';
GO

/*---------------------------------------------------------------------------  
  5) สร้าง Stored Procedure สำหรับอัพเดต mapping ระหว่าง template กับ ProductKey และ CustomerKey ที่เป็น string
---------------------------------------------------------------------------*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('FgL.UpdateTemplateMappingWithStringKeys','P') IS NULL
BEGIN
    EXEC('CREATE PROCEDURE FgL.UpdateTemplateMappingWithStringKeys
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
        IF @ProductKey IS NOT NULL AND @ProductKey <> '''' AND @ProductKey <> ''system'' AND 
           @CustomerKey IS NOT NULL AND @CustomerKey <> '''' AND @CustomerKey <> ''system''
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
        ELSE IF @ProductKey IS NOT NULL AND @ProductKey <> '''' AND @ProductKey <> ''system''
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
              AND (CustomerKey IS NULL OR CustomerKey = '''' OR CustomerKey = ''system'')
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
        IF @ProductKey IS NOT NULL AND @ProductKey <> '''' AND @ProductKey <> ''system''
    BEGIN
        -- เพิ่ม mapping สำหรับ ProductKey
        INSERT INTO FgL.TemplateMappingProductString (TemplateID, ProductKeyString)
        VALUES (@TemplateID, @ProductKey);
        
        -- ถ้ามี CustomerKey ด้วย เพิ่ม mapping สำหรับคู่ ProductKey และ CustomerKey
            IF @CustomerKey IS NOT NULL AND @CustomerKey <> '''' AND @CustomerKey <> ''system''
        BEGIN
            INSERT INTO FgL.TemplateMappingProductCustomerString (TemplateID, ProductKeyString, CustomerKeyString)
            VALUES (@TemplateID, @ProductKey, @CustomerKey);
        END
    END
    
    -- ถ้ามีแค่ CustomerKey เพิ่ม mapping สำหรับ CustomerKey
        IF (@ProductKey IS NULL OR @ProductKey = '''' OR @ProductKey = ''system'')
           AND @CustomerKey IS NOT NULL AND @CustomerKey <> '''' AND @CustomerKey <> ''system''
    BEGIN
        INSERT INTO FgL.TemplateMappingCustomerString (TemplateID, CustomerKeyString)
        VALUES (@TemplateID, @CustomerKey);
    END
    
    -- อัพเดตข้อมูลในตาราง LabelTemplate ด้วย
    UPDATE FgL.LabelTemplate
        SET ProductKey = CASE WHEN @ProductKey = ''system'' THEN NULL ELSE @ProductKey END,
            CustomerKey = CASE WHEN @CustomerKey = ''system'' THEN NULL ELSE @CustomerKey END,
        UpdatedAt = GETDATE(),
        Active = 1
    WHERE TemplateID = @TemplateID;
    
    -- คืนค่า TemplateID ที่อัพเดต
    SELECT @TemplateID AS TemplateID;
    END;');
    PRINT N'✓ Stored Procedure FgL.UpdateTemplateMappingWithStringKeys สร้างเรียบร้อยแล้ว';
END
ELSE
    PRINT N'✓ Stored Procedure FgL.UpdateTemplateMappingWithStringKeys มีอยู่แล้ว';
GO

/*---------------------------------------------------------------------------  
  FINISHED  
---------------------------------------------------------------------------*/
PRINT N'✅  FG-Label schema rev I9-keep installed successfully (data preserved)';
GO 