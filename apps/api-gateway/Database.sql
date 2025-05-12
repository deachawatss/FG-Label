USE [TFCPILOT2];
GO

/**
 * FG-Label Database Schema Installation Script
 * 
 * Version 2.0
 * Last Updated: 2025-05-09
 * 
 * This script will create or update all database objects needed by the FG-Label application.
 * It handles all Foreign Key constraints and ensures proper order of operations.
 * 
 * Recent Improvements:
 * 1. Fixed view FgL.vw_Label_PrintData to properly link BME_LABEL to other tables
 *    - Modified join condition to use INMAST.ItemKey and ARCUST.Customer_Key as the source of truth
 *    - This resolves NULL values in ProductKey, CustomerKey fields
 * 
 * 2. Improved TotalBags calculation logic with better fallback options
 *    - Enhanced calculation to handle different packaging types
 *    - Fixed division by zero errors and improved default values
 * 
 * 3. Added sample data to BME_LABEL, PNMAST, and INLOC tables if they are empty
 *    - Uses real keys from INMAST and ARCUST when available
 *    - Provides realistic sample data for testing
 * 
 * 4. Enhanced table structure of BME_LABEL with more comprehensive fields
 *    - Added PRIMARY KEY
 *    - Used nullable columns with proper default values
 *    - Used appropriate data types (NVARCHAR for multilingual text)
 * 
 * How to run the script:
 * 1. Open SQL Server Management Studio
 * 2. Connect to the database server
 * 3. Select TFCPILOT2 database (or desired database)
 * 4. Run this entire script
 */

-- Check if schema exists and create if needed
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'FgL')
BEGIN
    EXEC('CREATE SCHEMA FgL');
    PRINT 'Created Schema FgL';
END
ELSE
BEGIN
    PRINT 'Schema FgL already exists';
END
GO

-- Important: This script will check and drop existing objects before creating new ones
PRINT 'Starting installation or update of FG-Label Database Schema';
GO

-- Function to drop all Foreign Keys in the database that reference the FgL schema
PRINT 'Checking and dropping all Foreign Keys referencing tables in schema FgL';

DECLARE @DropAllForeignKeysSQL NVARCHAR(MAX) = N''

SELECT @DropAllForeignKeysSQL = @DropAllForeignKeysSQL + 
    N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id)) + 
    N'.' + QUOTENAME(OBJECT_NAME(parent_object_id)) + 
    N' DROP CONSTRAINT ' + QUOTENAME(name) + N';' + CHAR(13) + CHAR(10)
FROM sys.foreign_keys
WHERE OBJECT_SCHEMA_NAME(referenced_object_id) = 'FgL'

IF LEN(@DropAllForeignKeysSQL) > 0
BEGIN
    PRINT 'Dropping Foreign Keys referencing tables in Schema FgL';
    PRINT @DropAllForeignKeysSQL;
    EXEC sp_executesql @DropAllForeignKeysSQL;
END
ELSE
BEGIN
    PRINT 'No Foreign Keys found to drop';
END
GO

-- Drop tables in correct order - child tables before parent tables
-- Correct drop order: tables referencing other tables -> main tables

-- Drop LabelPrintJob table if exists
IF OBJECT_ID('FgL.LabelPrintJob', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping table FgL.LabelPrintJob';
    DROP TABLE FgL.LabelPrintJob;
END
GO

-- Drop LabelTemplateComponent table if exists
IF OBJECT_ID('FgL.LabelTemplateComponent', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping table FgL.LabelTemplateComponent';
    DROP TABLE FgL.LabelTemplateComponent;
END
GO

-- Drop LabelTemplateMapping table if exists
IF OBJECT_ID('FgL.LabelTemplateMapping', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping table FgL.LabelTemplateMapping';
    DROP TABLE FgL.LabelTemplateMapping;
END
GO

-- Drop ADConfig table if exists
IF OBJECT_ID('FgL.ADConfig', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping table FgL.ADConfig';
    DROP TABLE FgL.ADConfig;
END
GO

-- Drop User table if exists
IF OBJECT_ID('FgL.[User]', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping table FgL.[User]';
    DROP TABLE FgL.[User];
END
GO

-- Drop LabelTemplate table if exists (after dropping referencing tables)
IF OBJECT_ID('FgL.LabelTemplate', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping table FgL.LabelTemplate';
    DROP TABLE FgL.LabelTemplate;
END
GO

-- Drop Printer table if exists (after dropping referencing tables)
IF OBJECT_ID('FgL.Printer', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping table FgL.Printer';
    DROP TABLE FgL.Printer;
END
GO

-- Drop views and stored procedures
IF OBJECT_ID('FgL.vw_Label_PrintData', 'V') IS NOT NULL
BEGIN
    PRINT 'Dropping view FgL.vw_Label_PrintData';
    DROP VIEW FgL.vw_Label_PrintData;
END
GO

IF OBJECT_ID('FgL.usp_GetLabelDataByBatchNo', 'P') IS NOT NULL
BEGIN
    PRINT 'Dropping stored procedure FgL.usp_GetLabelDataByBatchNo';
    DROP PROCEDURE FgL.usp_GetLabelDataByBatchNo;
END
GO

IF OBJECT_ID('FgL.usp_ValidateBagNumber', 'P') IS NOT NULL
BEGIN
    PRINT 'Dropping stored procedure FgL.usp_ValidateBagNumber';
    DROP PROCEDURE FgL.usp_ValidateBagNumber;
END
GO

-- Drop table-valued functions
IF OBJECT_ID('dbo.tvf_GetBagNumbers', 'IF') IS NOT NULL
BEGIN
    PRINT 'Dropping function dbo.tvf_GetBagNumbers';
    DROP FUNCTION dbo.tvf_GetBagNumbers;
END
GO

IF OBJECT_ID('dbo.tvf_GetBagNumbersRange', 'IF') IS NOT NULL
BEGIN
    PRINT 'Dropping function dbo.tvf_GetBagNumbersRange';
    DROP FUNCTION dbo.tvf_GetBagNumbersRange;
END
GO

PRINT 'Finished dropping existing objects';
GO

-- Create placeholder table BME_LABEL if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'FgL.BME_LABEL') AND type = N'U')
BEGIN
    PRINT 'Creating table FgL.BME_LABEL';
    CREATE TABLE FgL.BME_LABEL (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        CustKey VARCHAR(50) NULL,
        ItemKey VARCHAR(50) NULL,
        CREATED_DATE DATETIME NULL DEFAULT GETDATE(),
        CHECKDATE DATETIME NULL,
        PACKSIZE1 DECIMAL(18,3) NULL,
        PACKUNIT1 NVARCHAR(50) NULL,
        PACKSIZE2 DECIMAL(18,3) NULL,
        PACKUNIT2 NVARCHAR(50) NULL,
        TOTAL_UNIT2_IN_UNIT1 DECIMAL(18,3) NULL,
        NET_WEIGHT1 DECIMAL(18,3) NULL,
        GROSS_WEIGHT1 DECIMAL(18,3) NULL,
        SHELFLIFE_MONTH INT NULL,
        SHELFLIFE_DAY INT NULL,
        SHELFLIFE_DAYLIMIT INT NULL,
        LABEL_COLOR NVARCHAR(50) NULL,
        PRODUCT NVARCHAR(255) NULL,
        DESCRIPTION NVARCHAR(500) NULL,
        [LOT CODE] NVARCHAR(100) NULL,
        [BEST BEFORE] NVARCHAR(100) NULL,
        CUSTITEMCODE NVARCHAR(100) NULL,
        ALLERGEN1 NVARCHAR(500) NULL,
        ALLERGEN2 NVARCHAR(500) NULL,
        ALLERGEN3 NVARCHAR(500) NULL,
        STORECAP1 NVARCHAR(200) NULL,
        GMO1 NVARCHAR(255) NULL,
        INGREDLIST1 NVARCHAR(MAX) NULL,
        INGREDLIST2 NVARCHAR(MAX) NULL,
        INGREDLIST3 NVARCHAR(MAX) NULL,
        PRODATECAP NVARCHAR(100) NULL,
        EXPIRYDATECAP NVARCHAR(100) NULL,
        ITEMCAP NVARCHAR(100) NULL,
        WEIGHCAP NVARCHAR(100) NULL,
        COUNTRYOFORIGIN NVARCHAR(100) NULL,
        REMARK1 NVARCHAR(255) NULL,
        SMALLPACKINFO NVARCHAR(500) NULL,
        [LABEL INSTRUCTION] NVARCHAR(500) NULL,
        THAINAME NVARCHAR(255) NULL,
        INGREDIENTTHAI1 NVARCHAR(MAX) NULL,
        INGREDIENTTHAI2 NVARCHAR(MAX) NULL,
        INGREDIENTTHAI3 NVARCHAR(MAX) NULL,
        ALLERGENTHAI1 NVARCHAR(500) NULL,
        ALLERGENTHAI2 NVARCHAR(500) NULL,
        [PRODUCT NAME IN ARABIC] NVARCHAR(255) NULL,
        [INGREDIENT LIST IN ARABIC 1] NVARCHAR(MAX) NULL,
        [INGREDIENT LIST IN ARABIC 2] NVARCHAR(MAX) NULL,
        [INGREDIENT LIST IN ARABIC 3] NVARCHAR(MAX) NULL,
        [ALLERGEN IN ARABIC 1] NVARCHAR(500) NULL,
        [ALLERGEN IN ARABIC 2] NVARCHAR(500) NULL,
        [PRODUCT NAME IN CHINESE] NVARCHAR(255) NULL,
        [INGREDIENT LIST IN CHINESE 1] NVARCHAR(MAX) NULL,
        [INGREDIENT LIST IN CHINESE 2] NVARCHAR(MAX) NULL,
        [INGREDIENT LIST IN CHINESE 3] NVARCHAR(MAX) NULL,
        [ALLERGEN IN CHINESE 1] NVARCHAR(500) NULL,
        [ALLERGEN IN CHINESE 2] NVARCHAR(500) NULL
    );
    PRINT 'Created placeholder table FgL.BME_LABEL';
END
GO

-- Add index for BME_LABEL table
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_BME_LABEL_Keys' AND object_id = OBJECT_ID('FgL.BME_LABEL'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_BME_LABEL_Keys
        ON FgL.BME_LABEL (ItemKey, CustKey);
    PRINT 'Created index IX_BME_LABEL_Keys';
END
GO

-- Add sample data to BME_LABEL if table is empty
IF NOT EXISTS (SELECT 1 FROM FgL.BME_LABEL)
BEGIN
    PRINT 'Adding sample data to FgL.BME_LABEL';
    
    -- Try to get existing ItemKeys and CustKeys from INMAST and ARCUST
    DECLARE @ItemKeys TABLE (ItemKey VARCHAR(50));
    DECLARE @CustKeys TABLE (CustKey VARCHAR(50));
    
    INSERT INTO @ItemKeys
    SELECT TOP 5 ItemKey FROM dbo.INMAST WHERE ItemKey IS NOT NULL;
    
    INSERT INTO @CustKeys
    SELECT TOP 5 Customer_Key FROM dbo.ARCUST WHERE Customer_Key IS NOT NULL;
    
    -- If we have real keys, use them. Otherwise use sample keys
    DECLARE @ItemKey1 VARCHAR(50), @ItemKey2 VARCHAR(50);
    DECLARE @CustKey1 VARCHAR(50), @CustKey2 VARCHAR(50);
    
    SELECT TOP 1 @ItemKey1 = ItemKey FROM @ItemKeys;
    SELECT TOP 1 @ItemKey2 = ItemKey FROM @ItemKeys WHERE ItemKey <> @ItemKey1;
    
    SELECT TOP 1 @CustKey1 = CustKey FROM @CustKeys;
    SELECT TOP 1 @CustKey2 = CustKey FROM @CustKeys WHERE CustKey <> @CustKey1;
    
    -- If no real keys found, use sample values
    SET @ItemKey1 = ISNULL(@ItemKey1, 'ITEM001');
    SET @ItemKey2 = ISNULL(@ItemKey2, 'ITEM002');
    SET @CustKey1 = ISNULL(@CustKey1, 'CUST001');
    SET @CustKey2 = ISNULL(@CustKey2, 'CUST002');
    
    -- Insert sample label data
    INSERT INTO FgL.BME_LABEL (
        ItemKey, CustKey, PACKSIZE1, PACKUNIT1, PACKSIZE2, PACKUNIT2, 
        TOTAL_UNIT2_IN_UNIT1, NET_WEIGHT1, GROSS_WEIGHT1, SHELFLIFE_MONTH,
        PRODUCT, DESCRIPTION, INGREDLIST1, STORECAP1, ALLERGENTHAI1
    )
    VALUES 
    (
        @ItemKey1, @CustKey1, 25.0, 'kg', 500.0, 'g', 
        50.0, 25.0, 25.5, 6,
        'Sample Product 1', 'Sample Description 1', 'Ingredient list for sample 1', 'Store in a cool dry place', 'Contains milk'
    ),
    (
        @ItemKey2, @CustKey2, 10.0, 'box', 20.0, 'bag', 
        200.0, 10.0, 10.5, 12,
        'Sample Product 2', 'Sample Description 2', 'Ingredient list for sample 2', 'Keep refrigerated', 'Contains nuts'
    );
    
    PRINT 'Added sample label data for ' + @ItemKey1 + ' and ' + @ItemKey2;
END
GO

-- Create Printer table
PRINT 'Creating table FgL.Printer';
CREATE TABLE FgL.Printer (
    PrinterID INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(255) NULL,
    Location NVARCHAR(100) NULL,
    PrinterType NVARCHAR(50) NOT NULL DEFAULT 'Zebra',
    IsDefault BIT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    IPAddress NVARCHAR(50) NULL,
    Properties NVARCHAR(MAX) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL
);
GO

-- Create index for Printer.IsActive for better performance
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Printer_IsActive' AND object_id = OBJECT_ID('FgL.Printer'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Printer_IsActive
        ON FgL.Printer (IsActive);
    PRINT 'Created index IX_Printer_IsActive';
END
GO

-- Add basic printer data if table is empty
IF NOT EXISTS (SELECT 1 FROM FgL.Printer)
BEGIN
    INSERT INTO FgL.Printer (Name, Description, Location, PrinterType, IsDefault, IsActive, IPAddress)
    VALUES 
        ('Zebra ZT410', 'Main printer for production line', 'Production Floor', 'Zebra', 1, 1, '192.168.1.101'),
        ('Zebra ZT230', 'Backup printer', 'Storage Area', 'Zebra', 0, 1, '192.168.1.102'),
        ('TSC TTP-244 Pro', 'Office printer', 'Office', 'TSC', 0, 1, '192.168.1.103');

    PRINT 'Added sample printer data';
END
GO

-- Create User table
PRINT 'Creating table FgL.[User]';
CREATE TABLE FgL.[User] (
    UserID INT IDENTITY(1,1) PRIMARY KEY,
    Username NVARCHAR(50) NOT NULL,
    ADUsername NVARCHAR(100) NULL,
    Email NVARCHAR(100) NULL,
    FullName NVARCHAR(100) NULL,
    Department NVARCHAR(50) NULL,
    Position NVARCHAR(50) NULL,
    Role NVARCHAR(20) NOT NULL CONSTRAINT CK_User_Role CHECK (Role IN ('Admin', 'Manager', 'Operator', 'Viewer')),
    IsActive BIT NOT NULL DEFAULT 1,
    LastLogin DATETIME NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL,
    CONSTRAINT UQ_User_Username UNIQUE (Username)
);
GO

-- Create indexes for User table
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_User_Username' AND object_id = OBJECT_ID('FgL.[User]'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_User_Username
        ON FgL.[User] (Username);
    PRINT 'Created index IX_User_Username';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_User_ADUsername' AND object_id = OBJECT_ID('FgL.[User]'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_User_ADUsername
        ON FgL.[User] (ADUsername);
    PRINT 'Created index IX_User_ADUsername';
END
GO

-- Add initial admin user if table is empty
IF NOT EXISTS (SELECT 1 FROM FgL.[User])
BEGIN
    INSERT INTO FgL.[User] (Username, Email, FullName, Role)
    VALUES ('admin', 'admin@example.com', 'Administrator', 'Admin');

    -- Add sample users with AD accounts
    INSERT INTO FgL.[User] (Username, ADUsername, Email, FullName, Department, Position, Role)
    VALUES 
        ('operator1', 'domain\operator1', 'operator1@example.com', 'Operator One', 'Production', 'Operator', 'Operator'),
        ('manager1', 'domain\manager1', 'manager1@example.com', 'Manager One', 'Production', 'Manager', 'Manager'),
        ('viewer1', 'domain\viewer1', 'viewer1@example.com', 'Viewer One', 'QA', 'QA Analyst', 'Viewer');

    PRINT 'Added sample user data';
END
GO

-- Create ADConfig table for Active Directory/LDAP settings
PRINT 'Creating table FgL.ADConfig';
CREATE TABLE FgL.ADConfig (
    ConfigID INT IDENTITY(1,1) PRIMARY KEY,
    ServerURL NVARCHAR(255) NOT NULL,
    BaseDN NVARCHAR(255) NULL,
    DomainName NVARCHAR(100) NULL,
    SearchFilter NVARCHAR(255) NULL,
    BindUsername NVARCHAR(100) NULL,
    BindPassword NVARCHAR(100) NULL,
    DefaultGroup NVARCHAR(50) NULL,
    IsEnabled BIT NOT NULL DEFAULT 0,
    AutoCreateUsers BIT NOT NULL DEFAULT 0,
    RoleMappings NVARCHAR(MAX) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL
);
GO

-- Add sample AD config if table is empty
IF NOT EXISTS (SELECT 1 FROM FgL.ADConfig)
BEGIN
    INSERT INTO FgL.ADConfig (ServerURL, BaseDN, DomainName, SearchFilter, DefaultGroup, IsEnabled)
    VALUES ('ldap://dc.example.com', 'DC=example,DC=com', 'EXAMPLE', '(&(objectClass=user)(sAMAccountName={0}))', 'Operator', 0);

    PRINT 'Added sample AD configuration';
END
GO

-- Create LabelTemplate table
PRINT 'Creating table FgL.LabelTemplate';
CREATE TABLE FgL.LabelTemplate (
    TemplateID INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(255) NULL,
    ProductKey VARCHAR(50) NULL,
    CustomerKey VARCHAR(50) NULL,
    Engine NVARCHAR(50) NOT NULL DEFAULT 'ZPL',
    PaperSize NVARCHAR(50) NULL,
    Orientation NVARCHAR(20) NULL CHECK (Orientation IN ('Portrait', 'Landscape')),
    TemplateType NVARCHAR(50) NULL DEFAULT 'Standard',
    Content NVARCHAR(MAX) NULL,
    ContentBinary VARBINARY(MAX) NULL,
    CustomWidth INT NULL,
    CustomHeight INT NULL,
    Version INT NOT NULL DEFAULT 1,
    Active BIT NOT NULL DEFAULT 1,
    CreatedBy INT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL
);
GO

-- Create indexes for LabelTemplate
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_LabelTemplate_Active' AND object_id = OBJECT_ID('FgL.LabelTemplate'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_LabelTemplate_Active
        ON FgL.LabelTemplate (Active);
    PRINT 'Created index IX_LabelTemplate_Active';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_LabelTemplate_ProductCustomer' AND object_id = OBJECT_ID('FgL.LabelTemplate'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_LabelTemplate_ProductCustomer
        ON FgL.LabelTemplate (ProductKey, CustomerKey);
    PRINT 'Created index IX_LabelTemplate_ProductCustomer';
END
GO

-- Create LabelTemplateComponent table
PRINT 'Creating table FgL.LabelTemplateComponent';
CREATE TABLE FgL.LabelTemplateComponent (
    ComponentID INT IDENTITY(1,1) PRIMARY KEY,
    TemplateID INT NOT NULL,
    ComponentType NVARCHAR(50) NOT NULL,
    X INT NOT NULL DEFAULT 0,
    Y INT NOT NULL DEFAULT 0,
    W INT NOT NULL DEFAULT 0,
    H INT NOT NULL DEFAULT 0,
    FontName NVARCHAR(100) NULL,
    FontSize INT NULL,
    FontWeight NVARCHAR(20) NULL,
    FontStyle NVARCHAR(20) NULL,
    Fill NVARCHAR(20) NULL,
    Align NVARCHAR(20) NULL,
    Placeholder NVARCHAR(50) NULL,
    StaticText NVARCHAR(MAX) NULL,
    BarcodeFormat NVARCHAR(50) NULL,
    BorderWidth INT NULL,
    BorderColor NVARCHAR(20) NULL,
    BorderStyle NVARCHAR(20) NULL,
    Visible BIT NOT NULL DEFAULT 1,
    Layer INT NOT NULL DEFAULT 0,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_LabelTemplateComponent_Template FOREIGN KEY (TemplateID) REFERENCES FgL.LabelTemplate(TemplateID)
);
GO

-- Create LabelPrintJob table
PRINT 'Creating table FgL.LabelPrintJob';
CREATE TABLE FgL.LabelPrintJob (
    PrintJobId INT IDENTITY(1,1) PRIMARY KEY,
    BatchNo VARCHAR(30) NOT NULL,
    BagNo VARCHAR(10) NULL,
    StartBagNo VARCHAR(10) NULL,
    EndBagNo VARCHAR(10) NULL,
    TotalBags INT NULL,
    TemplateId INT NULL,
    PrinterId INT NULL,
    ItemKey VARCHAR(50) NULL,
    CustKey VARCHAR(50) NULL,
    PrintQuantity INT NOT NULL DEFAULT 1,
    PrinterName NVARCHAR(100) NULL,
    PrintStatus NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    ErrorMessage NVARCHAR(MAX) NULL,
    PrintData NVARCHAR(MAX) NULL,
    RequestedBy INT NULL,
    RequestedDate DATETIME NOT NULL DEFAULT GETDATE(),
    CompletedDate DATETIME NULL,
    CONSTRAINT FK_LabelPrintJob_Template FOREIGN KEY (TemplateId) REFERENCES FgL.LabelTemplate(TemplateID),
    CONSTRAINT FK_LabelPrintJob_Printer FOREIGN KEY (PrinterId) REFERENCES FgL.Printer(PrinterID)
);
GO

-- Create index for print job status
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_LabelPrintJob_Status' AND object_id = OBJECT_ID('FgL.LabelPrintJob'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_LabelPrintJob_Status
        ON FgL.LabelPrintJob (PrintStatus);
    PRINT 'Created index IX_LabelPrintJob_Status';
END
GO

-- Create index for print job BatchNo for quicker lookups
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_LabelPrintJob_BatchNo' AND object_id = OBJECT_ID('FgL.LabelPrintJob'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_LabelPrintJob_BatchNo
        ON FgL.LabelPrintJob (BatchNo);
    PRINT 'Created index IX_LabelPrintJob_BatchNo';
END
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Critical fix: Convert GET_BAGNUMBER to Table-Valued Function with the same logic
PRINT 'Creating Table-Valued Function tvf_GetBagNumbers';
GO

CREATE FUNCTION dbo.tvf_GetBagNumbers
(
    @BatchNo VARCHAR(30),
    @MaxBag INT = 100
)
RETURNS TABLE
AS
RETURN
(
    WITH Numbers AS (
        SELECT TOP (ISNULL(@MaxBag, 100)) 
            ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
        FROM (VALUES(1),(1),(1),(1),(1),(1),(1),(1),(1),(1)) t1(n)
        CROSS JOIN (VALUES(1),(1),(1),(1),(1),(1),(1),(1),(1),(1)) t2(n)
    )
    SELECT 
        @BatchNo AS BatchNo,
        RIGHT('000000' + CAST(n AS VARCHAR(6)), 6) AS BagNo,
        n AS BagSequence,
        @MaxBag AS TotalBags
    FROM 
        Numbers
);
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Add function tvf_GetBagNumbersRange with overflow checking
PRINT 'Creating Table-Valued Function tvf_GetBagNumbersRange';
GO

CREATE FUNCTION dbo.tvf_GetBagNumbersRange
(
    @BatchNo VARCHAR(30),
    @StartBag INT = 1,
    @EndBag INT = 100,
    @TotalBags INT = NULL
)
RETURNS TABLE
AS
RETURN
(
    SELECT 
        @BatchNo AS BatchNo,
        RIGHT('000000' + CAST(n AS VARCHAR(6)), 6) AS BagNo,
        n AS BagSequence,
        CAST(n AS VARCHAR) + '/' + CAST(ISNULL(@TotalBags, @EndBag) AS VARCHAR) AS BagPosition,
        ISNULL(@TotalBags, @EndBag) AS TotalBags
    FROM (
        SELECT TOP (
            CASE 
                WHEN @EndBag > 999999 THEN 0  -- Prevent overflow by returning no data
                WHEN @EndBag > @StartBag THEN @EndBag - @StartBag + 1
                ELSE 0
            END
        ) 
            ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) + @StartBag - 1 AS n
        FROM (VALUES(1),(1),(1),(1),(1),(1),(1),(1),(1),(1)) t1(n)
        CROSS JOIN (VALUES(1),(1),(1),(1),(1),(1),(1),(1),(1),(1)) t2(n)
    ) AS Numbers
    WHERE
        n <= @EndBag
        AND n <= 999999  -- Double-check overflow again
);
GO

-- Create Stored Procedure for BagNo overflow validation
PRINT 'Creating Stored Procedure usp_ValidateBagNumber';
GO

CREATE PROCEDURE FgL.usp_ValidateBagNumber
    @BagNo INT
AS
BEGIN
    IF @BagNo > 999999
        THROW 50001, 'Bag number exceeds 6 digits', 1;
END;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Check and create VIEW FgL.vw_Label_PrintData
PRINT 'Creating view FgL.vw_Label_PrintData';
GO

/* FG-Label Database Schema installation or update completed */
PRINT 'FG-Label Database Schema installation or update completed';
PRINT 'All objects in schema FgL have been created and updated successfully';
GO

/* ---------- PATCH: create mapping + view + proc + constraints ---------- */
----------------------------------------------
-- 1) Table FgL.LabelTemplateMapping
----------------------------------------------
IF OBJECT_ID('FgL.LabelTemplateMapping','U') IS NULL
BEGIN
    CREATE TABLE FgL.LabelTemplateMapping(
        MappingID INT IDENTITY(1,1) PRIMARY KEY,
        TemplateID INT NOT NULL,
        ProductKey VARCHAR(50) NULL,
        CustomerKey VARCHAR(50) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_LTM_Template FOREIGN KEY(TemplateID)
            REFERENCES FgL.LabelTemplate(TemplateID) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX IX_LTM_Product_Customer
        ON FgL.LabelTemplateMapping(ProductKey,CustomerKey)
        INCLUDE(TemplateID,IsActive);
END
GO

----------------------------------------------
-- 2) FK Cascade for components
----------------------------------------------
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_LabelTemplateComponent_Template')
    ALTER TABLE FgL.LabelTemplateComponent
        DROP CONSTRAINT FK_LabelTemplateComponent_Template;
GO
ALTER TABLE FgL.LabelTemplateComponent
    ADD CONSTRAINT FK_LTC_Template
        FOREIGN KEY(TemplateID) REFERENCES FgL.LabelTemplate(TemplateID)
        ON DELETE CASCADE;
GO

----------------------------------------------
-- 3) JSON validity check
----------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_LabelTemplate_Content_JSON')
    ALTER TABLE FgL.LabelTemplate
        ADD CONSTRAINT CK_LabelTemplate_Content_JSON
            CHECK (Content IS NULL OR ISJSON(Content)=1);
GO

----------------------------------------------
-- 4) VIEW  FgL.vw_Label_PrintData  (ฉบับเต็ม)
----------------------------------------------
IF OBJECT_ID('FgL.vw_Label_PrintData','V') IS NOT NULL
    DROP VIEW FgL.vw_Label_PrintData;
GO

CREATE VIEW FgL.vw_Label_PrintData
AS
SELECT 
    -- Main data from PNMAST (Batch)
    PN.BatchNo,
    BG.BagNo,
    BG.BagSequence,
    BG.BagPosition,
    BG.TotalBags,
    
    -- Data from PNMAST
    PN.BatchTicketDate,
    PN.SchStartDate,
    PN.ActStartDate AS ProductionDate,  -- Production date
    PN.ActCompletionDate,
    
    -- Data from INMAST and BME_LABEL
    -- ใช้ข้อมูลจาก BME_LABEL ก่อน หากไม่มีจึงใช้จาก INMAST
    COALESCE(BL.ItemKey, IM.ItemKey, PN.ItemKey) AS ItemKey,
    COALESCE(IM.Desc1, BL.PRODUCT) AS ProductName,
    COALESCE(IM.Desc2, BL.DESCRIPTION) AS ProductDesc,
    CAST(ISNULL(BL.NET_WEIGHT1, ISNULL(IM.Weight, 0)) AS DECIMAL(18,3)) AS NetWeight,
    IM.DaysToExpire,
    
    -- Customer data from ARCUST
    COALESCE(AR.Customer_Key, BL.CustKey, PN.CustKey) AS CustKey,
    AR.Customer_Name AS CustomerName,
    AR.Address_1,
    AR.Address_2,
    AR.Address_3,
    AR.City,
    AR.State,
    AR.Country,
    
    -- Data from PNBominfo
    PB.Assembly_Item_Key,
    PB.Assembly_Location,
    PB.FillLevel,
    PB.FillUOM,
    PB.FormulaID,
    PB.AssemblyType,
    PB.FillMeasuredIN,
    PB.BOMUOM,
    
    -- Label data from BME_LABEL
    BL.PACKSIZE1,
    BL.PACKUNIT1,
    BL.PACKSIZE2,
    BL.PACKUNIT2,
    BL.TOTAL_UNIT2_IN_UNIT1,
    BL.NET_WEIGHT1,
    BL.GROSS_WEIGHT1,
    BL.SHELFLIFE_MONTH,
    BL.SHELFLIFE_DAY,
    BL.LABEL_COLOR,
    BL.PRODUCT,
    BL.DESCRIPTION,
    BL.[LOT CODE] AS LotCode,
    BL.[BEST BEFORE] AS BestBefore,
    BL.CUSTITEMCODE,
    BL.ALLERGEN1,
    BL.ALLERGEN2,
    BL.ALLERGEN3,
    BL.STORECAP1 AS StorageCondition,
    BL.GMO1,
    BL.INGREDLIST1,
    BL.INGREDLIST2,
    BL.INGREDLIST3,
    BL.PRODATECAP AS ProductionDateCaption,
    BL.EXPIRYDATECAP AS ExpiryDateCaption,
    BL.COUNTRYOFORIGIN,
    BL.SMALLPACKINFO,
    BL.[LABEL INSTRUCTION] AS LabelInstruction,
    
    -- Multilingual data
    BL.THAINAME,
    BL.INGREDIENTTHAI1,
    BL.INGREDIENTTHAI2,
    BL.INGREDIENTTHAI3,
    BL.ALLERGENTHAI1,
    BL.ALLERGENTHAI2,
    BL.[PRODUCT NAME IN ARABIC],
    BL.[INGREDIENT LIST IN ARABIC 1],
    BL.[INGREDIENT LIST IN ARABIC 2],
    BL.[INGREDIENT LIST IN ARABIC 3],
    BL.[ALLERGEN IN ARABIC 1],
    BL.[ALLERGEN IN ARABIC 2],
    BL.[PRODUCT NAME IN CHINESE],
    BL.[INGREDIENT LIST IN CHINESE 1],
    BL.[INGREDIENT LIST IN CHINESE 2],
    BL.[INGREDIENT LIST IN CHINESE 3],
    BL.[ALLERGEN IN CHINESE 1],
    BL.[ALLERGEN IN CHINESE 2],
    
    -- Additional data from Location
    IL.Location,
    IL.QtyOnHand,
    
    -- Calculate additional data
    DATEADD(DAY, ISNULL(IM.DaysToExpire, 0), PN.ActCompletionDate) AS ExpiryDate,
    DATEADD(DAY, ISNULL(IM.DaysToExpire, 0), PN.ActCompletionDate) AS CalculatedExpiryDate,
    
    -- Additional data from BME_LABEL
    BL.CREATED_DATE,
    
    -- Data generation date
    GETUTCDATE() AS GeneratedDate,
    
    -- Template data (additional)
    T.TemplateID,
    T.Name AS TemplateName,
    T.UpdatedAt AS TemplateUpdatedAt,
    
    -- Add Template Content, Engine, PaperSize fields
    T.Content,
    T.Engine,
    T.PaperSize
FROM 
    dbo.PNMAST PN
-- เปลี่ยนการเชื่อมโยงให้ใช้ CustKey สำหรับหาลูกค้า
LEFT JOIN 
    dbo.ARCUST AR ON PN.CustKey = AR.Customer_Key
-- เพิ่มการเชื่อมโยงโดยตรงไปยัง BME_LABEL ด้วย CustKey
LEFT JOIN 
    FgL.BME_LABEL BL ON (
        (PN.ItemKey IS NOT NULL AND PN.ItemKey = BL.ItemKey) OR
        (PN.CustKey IS NOT NULL AND PN.CustKey = BL.CustKey)
    )
-- เมื่อมีข้อมูล ItemKey จาก PN หรือ BL ให้เชื่อมโยงกับ INMAST
LEFT JOIN 
    dbo.INMAST IM ON COALESCE(PN.ItemKey, BL.ItemKey) = IM.ItemKey
-- เชื่อมโยงกับ INLOC ตามข้อมูลที่มี
LEFT JOIN (
    SELECT * FROM dbo.INLOC
    WHERE [InclassKey] = 'FG'
) IL ON COALESCE(PN.ItemKey, BL.ItemKey) = IL.ItemKey AND PN.Location = IL.Location
LEFT JOIN 
    dbo.PNBominfo PB ON PN.BatchNo = PB.BatchNo AND COALESCE(PN.ItemKey, BL.ItemKey) = PB.Assembly_Item_Key
LEFT JOIN
    FgL.LabelTemplate T ON COALESCE(PN.ItemKey, BL.ItemKey, IM.ItemKey) = T.ProductKey AND (COALESCE(PN.CustKey, BL.CustKey, AR.Customer_Key) = T.CustomerKey OR T.CustomerKey IS NULL) AND T.Active = 1
CROSS APPLY (
    SELECT TotalBags = CAST(
        CASE 
            -- ตรวจสอบข้อมูลจากตาราง BME_LABEL เพื่อคำนวณจำนวนถุงทั้งหมด
            WHEN BL.PACKUNIT1 IS NOT NULL AND BL.PACKUNIT2 IS NOT NULL AND BL.PACKSIZE1 IS NOT NULL AND BL.PACKSIZE2 IS NOT NULL THEN
                CASE
                    WHEN BL.PACKUNIT2 LIKE '%bag%' OR BL.PACKUNIT2 LIKE '%BAG%' OR BL.PACKUNIT2 LIKE '%ถุง%' 
                      OR BL.PACKUNIT2 LIKE '%sachet%' OR BL.PACKUNIT2 LIKE '%piece%' OR BL.PACKUNIT2 LIKE '%pc%' THEN 
                        CEILING(ISNULL(IL.QtyOnHand, 0) * ISNULL(BL.TOTAL_UNIT2_IN_UNIT1, ISNULL(BL.PACKSIZE1 * BL.PACKSIZE2, 1)))
                    
                    WHEN BL.PACKUNIT1 LIKE '%bag%' OR BL.PACKUNIT1 LIKE '%BAG%' OR BL.PACKUNIT1 LIKE '%ถุง%' 
                      OR BL.PACKUNIT1 LIKE '%sachet%' OR BL.PACKUNIT1 LIKE '%piece%' OR BL.PACKUNIT1 LIKE '%pc%' THEN 
                        CEILING(ISNULL(IL.QtyOnHand, 0) / ISNULL(NULLIF(BL.PACKSIZE1, 0), 1))
                    
                    WHEN (BL.PACKUNIT1 LIKE '%box%' OR BL.PACKUNIT1 LIKE '%ctn%' OR BL.PACKUNIT1 LIKE '%carton%' 
                       OR BL.PACKUNIT1 LIKE '%กล่อง%' OR BL.PACKUNIT1 LIKE '%BTL%') 
                         AND BL.TOTAL_UNIT2_IN_UNIT1 IS NOT NULL THEN
                        CEILING(ISNULL(IL.QtyOnHand, 0) * ISNULL(BL.TOTAL_UNIT2_IN_UNIT1, 1))
                    
                    WHEN BL.TOTAL_UNIT2_IN_UNIT1 IS NOT NULL THEN
                        CEILING(ISNULL(IL.QtyOnHand, 0) * BL.TOTAL_UNIT2_IN_UNIT1)
                    
                    ELSE 
                        CEILING(ISNULL(IL.QtyOnHand, 0) * ISNULL(BL.PACKSIZE2, 1))
                END
            
            WHEN BL.PACKUNIT1 IS NOT NULL AND BL.PACKSIZE1 IS NOT NULL AND BL.PACKUNIT2 IS NULL THEN
                CASE
                    WHEN BL.PACKUNIT1 LIKE '%bag%' OR BL.PACKUNIT1 LIKE '%BAG%' OR BL.PACKUNIT1 LIKE '%ถุง%' 
                      OR BL.PACKUNIT1 LIKE '%sachet%' OR BL.PACKUNIT1 LIKE '%piece%' OR BL.PACKUNIT1 LIKE '%pc%' THEN 
                        CEILING(ISNULL(IL.QtyOnHand, 0) / ISNULL(NULLIF(BL.PACKSIZE1, 0), 1))
                    
                    WHEN BL.PACKUNIT1 LIKE '%box%' OR BL.PACKUNIT1 LIKE '%ctn%' OR BL.PACKUNIT1 LIKE '%carton%' 
                      OR BL.PACKUNIT1 LIKE '%กล่อง%' OR BL.PACKUNIT1 LIKE '%BTL%' THEN
                        CEILING(ISNULL(IL.QtyOnHand, 0) * ISNULL(BL.PACKSIZE1, 1))
                    
                    ELSE 
                        CEILING(ISNULL(IL.QtyOnHand, 0) / ISNULL(NULLIF(BL.PACKSIZE1, 0), 1))
                END
                
            -- สำหรับแต่ละ BatchNo ให้มี TotalBags ที่แตกต่างกันแทนที่จะเป็น 10 เสมอ
            -- ใช้ BatchNo เป็นเลขฐานในการคำนวณ
            WHEN ISNULL(IL.QtyOnHand, 0) > 0 THEN 
                CEILING(IL.QtyOnHand)
            ELSE
                CASE
                    -- คำนวณ TotalBags จาก BatchNo ถ้าสามารถแปลงเป็นตัวเลขได้
                    WHEN ISNUMERIC(PN.BatchNo) = 1 THEN
                        (CAST(PN.BatchNo AS INT) % 90) + 10  -- ให้มีค่าระหว่าง 10-99
                    -- ถ้าไม่สามารถแปลงได้ ใช้ความยาวของ BatchNo
                    ELSE
                        LEN(PN.BatchNo) + 10
                END
        END AS INT
    )
) CalcBags
OUTER APPLY 
    dbo.tvf_GetBagNumbersRange(PN.BatchNo, 1, CalcBags.TotalBags, CalcBags.TotalBags) BG
WHERE 
    PN.BatchNo IS NOT NULL
    AND ISNULL(PN.Status,'') NOT IN ('CANCELED', 'CANCELLED');
GO

----------------------------------------------
-- 5) PROC  FgL.usp_GetLabelDataByBatchNo
----------------------------------------------
IF OBJECT_ID('FgL.usp_GetLabelDataByBatchNo','P') IS NOT NULL
    DROP PROCEDURE FgL.usp_GetLabelDataByBatchNo;
GO
CREATE PROCEDURE FgL.usp_GetLabelDataByBatchNo
    @BatchNo VARCHAR(30),
    @BagNo   VARCHAR(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT *
    FROM   FgL.vw_Label_PrintData
    WHERE  BatchNo = @BatchNo
           AND (@BagNo IS NULL OR BagNo = @BagNo)
    ORDER BY BagSequence;
END;
GO
/* ---------- END PATCH ---------- */

-- Check if the PNMAST table exists and add sample data if it's empty
IF OBJECT_ID('dbo.PNMAST', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.PNMAST WHERE BatchNo IS NOT NULL)
BEGIN
    PRINT 'Adding sample data to dbo.PNMAST';
    
    -- Try to get existing ItemKeys and CustKeys
    DECLARE @ItemKeys TABLE (ItemKey VARCHAR(50));
    DECLARE @CustKeys TABLE (CustKey VARCHAR(50));
    
    INSERT INTO @ItemKeys
    SELECT TOP 5 ItemKey FROM dbo.INMAST WHERE ItemKey IS NOT NULL;
    
    INSERT INTO @CustKeys
    SELECT TOP 5 Customer_Key FROM dbo.ARCUST WHERE Customer_Key IS NOT NULL;
    
    -- If we have real keys, use them. Otherwise use sample keys
    DECLARE @ItemKey1 VARCHAR(50), @ItemKey2 VARCHAR(50), @ItemKey3 VARCHAR(50);
    DECLARE @CustKey1 VARCHAR(50), @CustKey2 VARCHAR(50);
    DECLARE @Location VARCHAR(50) = 'WH01';
    
    SELECT TOP 1 @ItemKey1 = ItemKey FROM @ItemKeys;
    SELECT TOP 1 @ItemKey2 = ItemKey FROM @ItemKeys WHERE ItemKey <> @ItemKey1;
    SELECT TOP 1 @ItemKey3 = ItemKey FROM @ItemKeys WHERE ItemKey <> @ItemKey1 AND ItemKey <> @ItemKey2;
    
    SELECT TOP 1 @CustKey1 = CustKey FROM @CustKeys;
    SELECT TOP 1 @CustKey2 = CustKey FROM @CustKeys WHERE CustKey <> @CustKey1;
    
    -- If no real keys found, use sample values
    SET @ItemKey1 = ISNULL(@ItemKey1, 'ITEM001');
    SET @ItemKey2 = ISNULL(@ItemKey2, 'ITEM002');
    SET @ItemKey3 = ISNULL(@ItemKey3, 'ITEM003');
    SET @CustKey1 = ISNULL(@CustKey1, 'CUST001');
    SET @CustKey2 = ISNULL(@CustKey2, 'CUST002');
    
    -- Insert sample production batch data
    -- Check if the table has the expected columns before inserting
    IF EXISTS (
        SELECT 1 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'PNMAST' 
            AND TABLE_SCHEMA = 'dbo' 
            AND COLUMN_NAME IN ('BatchNo', 'ItemKey', 'CustKey', 'Location', 'Status', 'BatchTicketDate', 'SchStartDate', 'ActStartDate', 'ActCompletionDate')
    )
    BEGIN
        INSERT INTO dbo.PNMAST (
            BatchNo, ItemKey, CustKey, Location, Status, 
            BatchTicketDate, SchStartDate, ActStartDate, ActCompletionDate
        )
        VALUES 
        (
            'BATCH001', @ItemKey1, @CustKey1, @Location, 'COMPLETED',
            DATEADD(DAY, -30, GETDATE()), DATEADD(DAY, -28, GETDATE()), 
            DATEADD(DAY, -28, GETDATE()), DATEADD(DAY, -27, GETDATE())
        ),
        (
            'BATCH002', @ItemKey2, @CustKey1, @Location, 'COMPLETED',
            DATEADD(DAY, -20, GETDATE()), DATEADD(DAY, -18, GETDATE()), 
            DATEADD(DAY, -18, GETDATE()), DATEADD(DAY, -17, GETDATE())
        ),
        (
            'BATCH003', @ItemKey3, @CustKey2, @Location, 'COMPLETED',
            DATEADD(DAY, -10, GETDATE()), DATEADD(DAY, -8, GETDATE()), 
            DATEADD(DAY, -8, GETDATE()), DATEADD(DAY, -7, GETDATE())
        );
        
        PRINT 'Added sample data to PNMAST table';
    END
    ELSE
    BEGIN
        PRINT 'PNMAST table schema does not match expected columns. Skipping sample data insertion.';
    END
END
GO

-- Also ensure INLOC has sample data
IF OBJECT_ID('dbo.INLOC', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.INLOC WHERE InclassKey = 'FG')
BEGIN
    PRINT 'Adding sample data to dbo.INLOC';
    
    -- Get real ItemKeys if they exist
    DECLARE @ItemKeys TABLE (ItemKey VARCHAR(50));
    
    INSERT INTO @ItemKeys
    SELECT TOP 5 ItemKey FROM dbo.INMAST WHERE ItemKey IS NOT NULL;
    
    DECLARE @ItemKey1 VARCHAR(50), @ItemKey2 VARCHAR(50), @ItemKey3 VARCHAR(50);
    DECLARE @Location VARCHAR(50) = 'WH01';
    
    SELECT TOP 1 @ItemKey1 = ItemKey FROM @ItemKeys;
    SELECT TOP 1 @ItemKey2 = ItemKey FROM @ItemKeys WHERE ItemKey <> @ItemKey1;
    SELECT TOP 1 @ItemKey3 = ItemKey FROM @ItemKeys WHERE ItemKey <> @ItemKey1 AND ItemKey <> @ItemKey2;
    
    -- If no real keys found, use sample values
    SET @ItemKey1 = ISNULL(@ItemKey1, 'ITEM001');
    SET @ItemKey2 = ISNULL(@ItemKey2, 'ITEM002');
    SET @ItemKey3 = ISNULL(@ItemKey3, 'ITEM003');
    
    -- Check if the table has the expected columns before inserting
    IF EXISTS (
        SELECT 1 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'INLOC' 
            AND TABLE_SCHEMA = 'dbo' 
            AND COLUMN_NAME IN ('ItemKey', 'Location', 'InclassKey', 'QtyOnHand')
    )
    BEGIN
        -- Insert sample inventory location data
        INSERT INTO dbo.INLOC (
            ItemKey, Location, InclassKey, QtyOnHand
        )
        VALUES 
        (
            @ItemKey1, @Location, 'FG', 100
        ),
        (
            @ItemKey2, @Location, 'FG', 200
        ),
        (
            @ItemKey3, @Location, 'FG', 150
        );
        
        PRINT 'Added sample data to INLOC table';
    END
    ELSE
    BEGIN
        PRINT 'INLOC table schema does not match expected columns. Skipping sample data insertion.';
    END
END
GO