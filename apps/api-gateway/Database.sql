/*============================================================================== 
  FG‑Label Database Schema Installation Script (FULL REBUILD) 
  Database : TFCPILOT2 
  Version  : 2.6‑revI8 – 16‑May‑2025 02:30
  Purpose  : • รื้อ‑ติดตั้งสเคมาชุด FG‑Label ครบทุกตาราง / ฟังก์ชัน / วิว / โปรซีเยอร์
             • แก้ลำดับ DROP‑ORDER, ลบ FOREIGN KEY อัตโนมัติ, ไม่มีโค้ดซ้ำ, ไม่มี placeholder
             • ฟังก์ชัน Bag‑helpers, VIEW สรุปต่อ batch, TVF แยก bag‑level
             • ไม่มีคอลัมน์ CREATED_DATE / CHECKDATE (ลดปัญหาซิงก์วันที่)
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
  1) DROP FOREIGN‑KEY ที่อ้างตระกูล FgL.* ก่อน  
---------------------------------------------------------------------------*/
DECLARE @DropFK NVARCHAR(MAX) = N'';
SELECT @DropFK += N'ALTER TABLE '
               + QUOTENAME(SCHEMA_NAME(parent_object_id)) + N'.'
               + QUOTENAME(OBJECT_NAME(parent_object_id))
               + N' DROP CONSTRAINT ' + QUOTENAME(name) + N';' + CHAR(13)
FROM sys.foreign_keys
WHERE OBJECT_SCHEMA_NAME(referenced_object_id) = 'FgL';
EXEC (@DropFK);
PRINT N'★ 1) All FK to FgL.* dropped';
GO

/*---------------------------------------------------------------------------  
  2) DROP OBJECTS (Child‑ก่อน‑Parent, ตรวจ IF EXISTS ทุกตัว)  
---------------------------------------------------------------------------*/
IF OBJECT_ID('FgL.LabelTemplateComponent' ,'U') IS NOT NULL DROP TABLE FgL.LabelTemplateComponent;
IF OBJECT_ID('FgL.LabelTemplateMapping'  ,'U') IS NOT NULL DROP TABLE FgL.LabelTemplateMapping;
IF OBJECT_ID('FgL.LabelPrintJob'         ,'U') IS NOT NULL DROP TABLE FgL.LabelPrintJob;
IF OBJECT_ID('FgL.LabelTemplate'         ,'U') IS NOT NULL DROP TABLE FgL.LabelTemplate;
IF OBJECT_ID('FgL.ADConfig'              ,'U') IS NOT NULL DROP TABLE FgL.ADConfig;
IF OBJECT_ID('FgL.[User]'                ,'U') IS NOT NULL DROP TABLE FgL.[User];
IF OBJECT_ID('FgL.Printer'               ,'U') IS NOT NULL DROP TABLE FgL.Printer;
IF OBJECT_ID('FgL.BME_LABEL_WIP'         ,'U') IS NOT NULL DROP TABLE FgL.BME_LABEL_WIP;
IF OBJECT_ID('FgL.BME_LABEL'             ,'U') IS NOT NULL DROP TABLE FgL.BME_LABEL;

IF OBJECT_ID('FgL.tvf_Label_PrintData'   ,'TF') IS NOT NULL DROP FUNCTION FgL.tvf_Label_PrintData;
IF OBJECT_ID('FgL.vw_Label_PrintSummary' ,'V' ) IS NOT NULL DROP VIEW     FgL.vw_Label_PrintSummary;
IF OBJECT_ID('FgL.usp_GetLabelDataByBatchNo','P') IS NOT NULL DROP PROCEDURE FgL.usp_GetLabelDataByBatchNo;
IF OBJECT_ID('FgL.usp_ValidateBagNumber'    ,'P') IS NOT NULL DROP PROCEDURE FgL.usp_ValidateBagNumber;

IF OBJECT_ID('dbo.tvf_GetBagNumbersRange','IF') IS NOT NULL DROP FUNCTION dbo.tvf_GetBagNumbersRange;
IF OBJECT_ID('dbo.tvf_GetBagNumbers'    ,'IF') IS NOT NULL DROP FUNCTION dbo.tvf_GetBagNumbers;
PRINT N'★ 2) Old objects removed';
GO

/*---------------------------------------------------------------------------  
  3) TABLE FgL.BME_LABEL (ข้อมูลหลัก)  
---------------------------------------------------------------------------*/
PRINT N'★ 3) Creating table FgL.BME_LABEL';
CREATE TABLE FgL.BME_LABEL(
    CustKey                   NVARCHAR(50)  NULL,
    ItemKey                   NVARCHAR(50)  NULL,
    PACKSIZE1                 DECIMAL(18,3) NULL,
    PACKUNIT1                 NVARCHAR(50)  NULL,
    PACKSIZE2                 DECIMAL(18,3) NULL,
    PACKUNIT2                 NVARCHAR(50)  NULL,
    TOTAL_UNIT2_IN_UNIT1      DECIMAL(18,3) NULL,
    NET_WEIGHT1               DECIMAL(18,3) NULL,
    GROSS_WEIGHT1             DECIMAL(18,3) NULL,
    SHELFLIFE_MONTH           DECIMAL(9,2)  NULL,
    SHELFLIFE_DAY             DECIMAL(9,2)  NULL,
    SHELFLIFE_DAYLIMIT        DECIMAL(9,2)  NULL,
    LABEL_COLOR               NVARCHAR(255) NULL,
    PRODUCT                   NVARCHAR(255) NULL,
    DESCRIPTION               NVARCHAR(500) NULL,
    [LOT CODE]                NVARCHAR(255) NULL,
    [BEST BEFORE]             NVARCHAR(255) NULL,
    CUSTITEMCODE              NVARCHAR(255) NULL,
    ALLERGEN1                 NVARCHAR(500) NULL,
    ALLERGEN2                 NVARCHAR(500) NULL,
    ALLERGEN3                 NVARCHAR(500) NULL,
    STORECAP1                 NVARCHAR(255) NULL,
    GMO1                      NVARCHAR(255) NULL,
    INGREDLIST1               NVARCHAR(MAX) NULL,
    INGREDLIST2               NVARCHAR(MAX) NULL,
    INGREDLIST3               NVARCHAR(MAX) NULL,
    PRODATECAP                NVARCHAR(255) NULL,
    EXPIRYDATECAP             NVARCHAR(255) NULL,
    ITEMCAP                   NVARCHAR(255) NULL,
    WEIGHCAP                  NVARCHAR(255) NULL,
    COUNTRYOFORIGIN           NVARCHAR(255) NULL,
    REMARK1                   NVARCHAR(255) NULL,
    SMALLPACKINFO             NVARCHAR(500) NULL,
    [LABEL INSTRUCTION]       NVARCHAR(500) NULL,
    CUSCAP1                   NVARCHAR(255) NULL,
    CUSCAP2                   NVARCHAR(255) NULL,
    CUSCAP3                   NVARCHAR(255) NULL,
    BATCHCAP                  NVARCHAR(255) NULL,
    MANUCAP1                  NVARCHAR(255) NULL,
    MANUCAP2                  NVARCHAR(255) NULL,
    MANUCAP3                  NVARCHAR(255) NULL,
    [REMAINING_SHELF-LIFE]    NVARCHAR(255) NULL,
    SHIPTO_COUNTRY            NVARCHAR(255) NULL,
    IMPORTED_BY               NVARCHAR(255) NULL,
    [IMPORTER ADDRESS]        NVARCHAR(255) NULL,
    [IMPORTER CONTACT]        NVARCHAR(255) NULL,
    IMPORTER_LICENSE_ID       NVARCHAR(255) NULL,
    PRODUCT_LICENSE_ID1       NVARCHAR(255) NULL,
    PRODUCT_LICENSE_ID2       NVARCHAR(255) NULL,
    CUSTOMS_TEXT1             NVARCHAR(MAX) NULL,
    CUSTOMS_TEXT2             NVARCHAR(MAX) NULL,
    HALALLOGO                 BIT           NULL,
    HALALNUMBER               NVARCHAR(255) NULL,
    STANDARD_LABEL            BIT           NULL,
    SPECIAL_LABEL             BIT           NULL,
    CUSTOMER_LABEL            BIT           NULL,
    QSR_BRAND                 NVARCHAR(255) NULL,
    QSRFORMAT                 BIT           NULL,
    THAINAME                  NVARCHAR(255) NULL,
    FDANUMBER                 NVARCHAR(255) NULL,
    FOODADDITIVE              BIT           NULL,
    INGREDIENTTHAI1           NVARCHAR(MAX) NULL,
    INGREDIENTTHAI2           NVARCHAR(MAX) NULL,
    INGREDIENTTHAI3           NVARCHAR(MAX) NULL,
    USINGINSTRUCTION1         NVARCHAR(MAX) NULL,
    USINGINSTRUCTION2         NVARCHAR(MAX) NULL,
    USINGINSTRUCTION3         NVARCHAR(MAX) NULL,
    ALLERGENTHAI1             NVARCHAR(MAX) NULL,
    ALLERGENTHAI2             NVARCHAR(MAX) NULL,
    CHECKBY                   NVARCHAR(100) NULL,
    INNER_PATH                NVARCHAR(MAX) NULL,
    OUTER_PATH                NVARCHAR(MAX) NULL,
    [PRODUCT NAME IN ARABIC]  NVARCHAR(255) NULL,
    [INGREDIENT LIST IN ARABIC 1] NVARCHAR(MAX) NULL,
    [INGREDIENT LIST IN ARABIC 2] NVARCHAR(MAX) NULL,
    [INGREDIENT LIST IN ARABIC 3] NVARCHAR(MAX) NULL,
    [ALLERGEN IN ARABIC 1]    NVARCHAR(500) NULL,
    [ALLERGEN IN ARABIC 2]    NVARCHAR(500) NULL,
    [ALLERGEN IN ARABIC 3]    NVARCHAR(500) NULL,
    [STORAGE CONDITION IN ARABIC] NVARCHAR(MAX) NULL,
    [IMPORTED_BY IN ARABIC]   NVARCHAR(255) NULL,
    [IMPORTER ADDRESS IN ARABIC] NVARCHAR(255) NULL,
    [IMPORTER CONTACT IN ARABIC] NVARCHAR(255) NULL,
    [SMALLPACKINFO IN ARABIC] NVARCHAR(MAX) NULL,
    [PRODUCT NAME IN CHINESE] NVARCHAR(255) NULL,
    [INGREDIENT LIST IN CHINESE 1] NVARCHAR(MAX) NULL,
    [INGREDIENT LIST IN CHINESE 2] NVARCHAR(MAX) NULL,
    [INGREDIENT LIST IN CHINESE 3] NVARCHAR(MAX) NULL,
    [ALLERGEN IN CHINESE 1]   NVARCHAR(500) NULL,
    [ALLERGEN IN CHINESE 2]   NVARCHAR(500) NULL,
    [ALLERGEN IN CHINESE 3]   NVARCHAR(500) NULL,
    [STORAGE CONDITION IN CHINESE] NVARCHAR(MAX) NULL,
    [IMPORTED_BY IN CHINESE]  NVARCHAR(255) NULL,
    [IMPORTER ADDRESS IN CHINESE] NVARCHAR(255) NULL,
    [IMPORTER CONTACT IN CHINESE] NVARCHAR(255) NULL,
    [SMALLPACKINFO IN CHINESE] NVARCHAR(MAX) NULL,
    [APPLICATION SCOPE IN CHINESE] NVARCHAR(MAX) NULL,
    [USE INSTRUCTION IN CHINESE]   NVARCHAR(MAX) NULL,
    [NOTE IN CHINESE]             NVARCHAR(MAX) NULL
);
GO
CREATE NONCLUSTERED INDEX IX_BME_LABEL_ItemCust ON FgL.BME_LABEL(ItemKey,CustKey);
GO
CREATE NONCLUSTERED INDEX IX_BME_LABEL_ItemKey ON FgL.BME_LABEL(ItemKey);
GO

/*---------------------------------------------------------------------------  
  4) TABLE FgL.BME_LABEL_WIP (โครงสร้างสำเนา)  
---------------------------------------------------------------------------*/
PRINT N'★ 4) Creating table FgL.BME_LABEL_WIP';
SELECT * INTO FgL.BME_LABEL_WIP FROM FgL.BME_LABEL WHERE 1=0;
GO

/*---------------------------------------------------------------------------  
  5) TABLE FgL.Printer  
---------------------------------------------------------------------------*/
PRINT N'★ 5) Creating table FgL.Printer';
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
GO
CREATE NONCLUSTERED INDEX IX_Printer_IsActive ON FgL.Printer(IsActive);
GO

/*---------------------------------------------------------------------------  
  6) TABLE FgL.[User]  
---------------------------------------------------------------------------*/
PRINT N'★ 6) Creating table FgL.[User]';
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
GO
CREATE NONCLUSTERED INDEX IX_User_Username   ON FgL.[User](Username);
GO
CREATE NONCLUSTERED INDEX IX_User_ADUsername ON FgL.[User](ADUsername);
GO

/*---------------------------------------------------------------------------  
  7) TABLE FgL.ADConfig  
---------------------------------------------------------------------------*/
PRINT N'★ 7) Creating table FgL.ADConfig';
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
GO

/*---------------------------------------------------------------------------  
  8) TABLE FgL.LabelTemplate  
---------------------------------------------------------------------------*/
PRINT N'★ 8) Creating table FgL.LabelTemplate';
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
GO
CREATE NONCLUSTERED INDEX IX_LabelTemplate_Active          ON FgL.LabelTemplate(Active);
GO
CREATE NONCLUSTERED INDEX IX_LabelTemplate_ProductCustomer ON FgL.LabelTemplate(ProductKey,CustomerKey);
GO

/*---------------------------------------------------------------------------  
  9) TABLE FgL.LabelTemplateComponent  
---------------------------------------------------------------------------*/
PRINT N'★ 9) Creating table FgL.LabelTemplateComponent';
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
GO
CREATE NONCLUSTERED INDEX IX_LTC_Template ON FgL.LabelTemplateComponent(TemplateID);
GO

/*---------------------------------------------------------------------------  
 10) TABLE FgL.LabelTemplateMapping  
---------------------------------------------------------------------------*/
PRINT N'★ 10) Creating table FgL.LabelTemplateMapping';
CREATE TABLE FgL.LabelTemplateMapping(
    MappingID    INT IDENTITY(1,1) PRIMARY KEY,
    TemplateID   INT           NOT NULL,
    KeyName      NVARCHAR(100) NOT NULL,
    FieldName    NVARCHAR(100) NOT NULL,
    SortOrder    INT           NOT NULL DEFAULT 0,
    CreatedAt    DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_LTM_Template FOREIGN KEY (TemplateID) REFERENCES FgL.LabelTemplate(TemplateID)
);
GO

/*---------------------------------------------------------------------------  
 11) TABLE FgL.LabelPrintJob  
---------------------------------------------------------------------------*/
PRINT N'★ 11) Creating table FgL.LabelPrintJob';
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
GO
CREATE NONCLUSTERED INDEX IX_LPJ_BatchStatus ON FgL.LabelPrintJob(BatchNo,PrintStatus);
GO

/*---------------------------------------------------------------------------  
 12) TVF dbo.tvf_GetBagNumbers  
---------------------------------------------------------------------------*/
PRINT N'★ 12) Creating TVF dbo.tvf_GetBagNumbers';
CREATE FUNCTION dbo.tvf_GetBagNumbers
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
           RIGHT('000000' + CAST(n AS VARCHAR(6)), 6) AS BagNo,
           n AS BagSequence,
           @MaxBag AS TotalBags
    FROM N
);
GO

/*---------------------------------------------------------------------------  
 13) TVF dbo.tvf_GetBagNumbersRange  
---------------------------------------------------------------------------*/
PRINT N'★ 13) Creating TVF dbo.tvf_GetBagNumbersRange';
CREATE FUNCTION dbo.tvf_GetBagNumbersRange
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
           RIGHT('000000' + CAST(n AS VARCHAR(6)), 6) AS BagNo,
           n AS BagSequence,
           CAST(n AS VARCHAR) + '/' + CAST(ISNULL(@TotalBags,@EndBag) AS VARCHAR) AS BagPosition,
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
);
GO

/*---------------------------------------------------------------------------  
 14) PROC FgL.usp_ValidateBagNumber  
---------------------------------------------------------------------------*/
PRINT N'★ 14) Creating PROC FgL.usp_ValidateBagNumber';
CREATE PROCEDURE FgL.usp_ValidateBagNumber
    @BagNo INT
AS
BEGIN
    SET NOCOUNT ON;
    IF @BagNo > 999999
        THROW 50001, 'Bag number exceeds 6 digits', 1;
END;
GO

/*---------------------------------------------------------------------------  
 15) VIEW FgL.vw_Label_PrintSummary (หนึ่งแถวต่อ Batch)  
---------------------------------------------------------------------------*/
PRINT N'★ 15) Creating VIEW FgL.vw_Label_PrintSummary';
CREATE VIEW FgL.vw_Label_PrintSummary AS
WITH KeyResolve AS (
    SELECT
        PN.BatchNo,
        ItemKeyResolved = COALESCE(NULLIF(PN.ItemKey,''), NULLIF(PB0.Assembly_Item_Key,'')),
        CustKeyResolved = COALESCE(NULLIF(PN.CustKey,''), NULLIF(PB0.CustKey,'')) 
    FROM dbo.PNMAST PN
    LEFT JOIN dbo.PNBomInfo PB0 ON PB0.BatchNo = PN.BatchNo
),
BaseData AS (
SELECT
    PN.BatchNo,
    PN.BatchTicketDate,
    PN.SchStartDate,
    PN.ActStartDate                         AS ProductionDate,
    PN.ActCompletionDate,
    KR.ItemKeyResolved,
    KR.CustKeyResolved,
    BL.CustKey,
    BL.ItemKey,
    BL.PACKSIZE1,
    BL.PACKUNIT1,
    BL.PACKSIZE2,
    BL.PACKUNIT2,
    BL.TOTAL_UNIT2_IN_UNIT1,
    BL.NET_WEIGHT1,
    BL.GROSS_WEIGHT1,
    BL.SHELFLIFE_MONTH,
    BL.SHELFLIFE_DAY,
    BL.SHELFLIFE_DAYLIMIT,
    BL.LABEL_COLOR,
    BL.PRODUCT                              AS BME_Product,
    BL.DESCRIPTION,
    BL.[LOT CODE],
    BL.[BEST BEFORE],
    BL.CUSTITEMCODE,
    BL.ALLERGEN1,
    BL.ALLERGEN2,
    BL.ALLERGEN3,
    BL.STORECAP1,
    BL.GMO1,
    BL.INGREDLIST1,
    BL.INGREDLIST2,
    BL.INGREDLIST3,
    BL.PRODATECAP,
    BL.EXPIRYDATECAP,
    BL.ITEMCAP,
    BL.WEIGHCAP,
    BL.COUNTRYOFORIGIN,
    BL.REMARK1,
    BL.SMALLPACKINFO,
    BL.[LABEL INSTRUCTION],
    BL.CUSCAP1,
    BL.CUSCAP2,
    BL.CUSCAP3,
    BL.BATCHCAP,
    BL.MANUCAP1,
    BL.MANUCAP2,
    BL.MANUCAP3,
    BL.[REMAINING_SHELF-LIFE],
    BL.SHIPTO_COUNTRY,
    BL.IMPORTED_BY,
    BL.[IMPORTER ADDRESS],
    BL.[IMPORTER CONTACT],
    BL.IMPORTER_LICENSE_ID,
    BL.PRODUCT_LICENSE_ID1,
    BL.PRODUCT_LICENSE_ID2,
    BL.CUSTOMS_TEXT1,
    BL.CUSTOMS_TEXT2,
    BL.HALALLOGO,
    BL.HALALNUMBER,
    BL.STANDARD_LABEL,
    BL.SPECIAL_LABEL,
    BL.CUSTOMER_LABEL,
    BL.QSR_BRAND,
    BL.QSRFORMAT,
    BL.THAINAME,
    BL.FDANUMBER,
    BL.FOODADDITIVE,
    BL.INGREDIENTTHAI1,
    BL.INGREDIENTTHAI2,
    BL.INGREDIENTTHAI3,
    BL.USINGINSTRUCTION1,
    BL.USINGINSTRUCTION2,
    BL.USINGINSTRUCTION3,
    BL.ALLERGENTHAI1,
    BL.ALLERGENTHAI2,
    BL.CHECKBY,
    BL.INNER_PATH,
    BL.OUTER_PATH,
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
    BL.[NOTE IN CHINESE],
    IM.Desc1                              AS Product,
    IM.DaysToExpire,
    AR.Customer_Name,
    AR.Address_1,
    AR.Address_2,
    AR.Address_3,
    AR.City,
    AR.State,
    AR.Country,
    PB.FillLevel,
    PB.FillUOM,
    PB.FormulaID,
    PB.Assembly_Item_Key,
    PB.Assembly_Location,
    PB.AssemblyType,
    PB.FillMeasuredIN,
    PB.BOMUOM,
    T.TemplateID,
    T.Name                                 AS TemplateName,
    T.UpdatedAt                            AS TemplateUpdatedAt,
    T.Content,
    T.Engine,
    T.PaperSize,
    TW.TotalWeightKG,
    PK.BagWKG,
    PK.CartonWKG,
    BagsCalc.TotalBags,
    BagsCalc.TotalCTN
FROM dbo.PNMAST PN
INNER JOIN KeyResolve KR        ON KR.BatchNo = PN.BatchNo
LEFT  JOIN FgL.BME_LABEL BL     ON BL.ItemKey = KR.ItemKeyResolved
LEFT  JOIN dbo.INMAST IM        ON IM.ItemKey = KR.ItemKeyResolved
LEFT  JOIN dbo.ARCUST AR        ON AR.Customer_Key = KR.CustKeyResolved
OUTER APPLY (
    SELECT TOP 1 *
    FROM dbo.PNBomInfo p
    WHERE p.BatchNo = PN.BatchNo
    ORDER BY CASE WHEN p.Assembly_Item_Key = KR.ItemKeyResolved THEN 0 ELSE 1 END, p.LineID
) PB
LEFT  JOIN FgL.LabelTemplate T  ON T.Active = 1
                               AND T.ProductKey  = KR.ItemKeyResolved
                               AND (T.CustomerKey = KR.CustKeyResolved OR T.CustomerKey IS NULL)
CROSS APPLY ( SELECT TotalWeightKG = COALESCE(NULLIF(PN.TotalFGWeightYielded,0), NULLIF(PN.BatchWeight,0), 0) ) TW
CROSS APPLY ( SELECT
                CartonWKG = CASE WHEN BL.PACKUNIT1 LIKE '%ctn%' THEN NULLIF(BL.PACKSIZE1,0)
                                  WHEN BL.PACKUNIT2 LIKE '%ctn%' THEN NULLIF(BL.PACKSIZE2,0) END,
                BagWKG    = CASE WHEN BL.PACKUNIT2 LIKE '%bag%' THEN NULLIF(BL.PACKSIZE2,0)
                                  WHEN BL.PACKUNIT1 LIKE '%bag%' THEN NULLIF(BL.PACKSIZE1,0) END ) PK
CROSS APPLY ( SELECT
                TotalBags = CASE WHEN PK.BagWKG IS NOT NULL AND PK.BagWKG > 0
                                    THEN CEILING(TW.TotalWeightKG/PK.BagWKG) ELSE 1 END,
                TotalCTN  = CASE WHEN PK.CartonWKG IS NOT NULL AND PK.CartonWKG > 0
                                    THEN CEILING(TW.TotalWeightKG/PK.CartonWKG) END ) BagsCalc
)
SELECT *
FROM BaseData;
GO

/*---------------------------------------------------------------------------  
 16) TVF FgL.tvf_Label_PrintData (Bag‑level)  
---------------------------------------------------------------------------*/
PRINT N'★ 16) Creating TVF FgL.tvf_Label_PrintData';
CREATE FUNCTION FgL.tvf_Label_PrintData
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

/*---------------------------------------------------------------------------  
 17) PROC FgL.usp_GetLabelDataByBatchNo  
---------------------------------------------------------------------------*/
PRINT N'★ 17) Creating PROC FgL.usp_GetLabelDataByBatchNo';
CREATE PROCEDURE FgL.usp_GetLabelDataByBatchNo
    @BatchNo NVARCHAR(30),
    @BagNo   NVARCHAR(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT *, ROW_NUMBER() OVER (ORDER BY BagSequence) AS LabelRowNo
    FROM   FgL.tvf_Label_PrintData(@BatchNo,@BagNo)
    ORDER  BY BagSequence;
END;
GO

/*---------------------------------------------------------------------------  
 18) FINISHED  
---------------------------------------------------------------------------*/
PRINT N'✅  FG‑Label schema rev I8 installed successfully';



-/*============================================================================== 
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
PRINT N'★ Creating procedure FgL.GetTemplateByProductAndCustomerKeys';
GO

IF OBJECT_ID('FgL.GetTemplateByProductAndCustomerKeys', 'P') IS NOT NULL
    DROP PROCEDURE FgL.GetTemplateByProductAndCustomerKeys;
GO

CREATE PROCEDURE FgL.GetTemplateByProductAndCustomerKeys
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
          AND (T.CustomerKey IS NULL OR T.CustomerKey = '')
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
          AND (T.ProductKey IS NULL OR T.ProductKey = '')
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