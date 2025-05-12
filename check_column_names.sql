USE [TFCPILOT2];
GO

-- 1. ตรวจสอบรายชื่อตารางในฐานข้อมูลทั้งหมด
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME
FROM 
    INFORMATION_SCHEMA.TABLES 
WHERE 
    TABLE_TYPE = 'BASE TABLE'
    AND (
        TABLE_NAME IN ('PNMAST', 'BME_LABEL', 'INLOC', 'INMAST', 'ARCUST', 'PNBominfo') OR
        TABLE_SCHEMA = 'FgL'
    )
ORDER BY 
    TABLE_SCHEMA, 
    TABLE_NAME;

-- 2. ตรวจสอบคอลัมน์ในตาราง PNMAST
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM 
    INFORMATION_SCHEMA.COLUMNS
WHERE 
    TABLE_NAME = 'PNMAST'
ORDER BY 
    ORDINAL_POSITION;

-- 3. ตรวจสอบคอลัมน์ในตาราง INLOC
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM 
    INFORMATION_SCHEMA.COLUMNS
WHERE 
    TABLE_NAME = 'INLOC'
ORDER BY 
    ORDINAL_POSITION;

-- 4. ตรวจสอบคอลัมน์ในตาราง INMAST
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM 
    INFORMATION_SCHEMA.COLUMNS
WHERE 
    TABLE_NAME = 'INMAST'
ORDER BY 
    ORDINAL_POSITION;

-- 5. ตรวจสอบคอลัมน์ในตาราง ARCUST
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM 
    INFORMATION_SCHEMA.COLUMNS
WHERE 
    TABLE_NAME = 'ARCUST'
ORDER BY 
    ORDINAL_POSITION;

-- 6. ตรวจสอบคอลัมน์ในตาราง BME_LABEL (FgL schema)
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM 
    INFORMATION_SCHEMA.COLUMNS
WHERE 
    TABLE_SCHEMA = 'FgL' AND
    TABLE_NAME = 'BME_LABEL'
ORDER BY 
    ORDINAL_POSITION;

-- 7. ตรวจสอบคอลัมน์ในตาราง PNBominfo
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM 
    INFORMATION_SCHEMA.COLUMNS
WHERE 
    TABLE_NAME = 'PNBominfo'
ORDER BY 
    ORDINAL_POSITION;

-- 8. ค้นหาคอลัมน์เฉพาะที่อาจมีปัญหา case sensitivity
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM 
    INFORMATION_SCHEMA.COLUMNS
WHERE 
    (
        COLUMN_NAME LIKE '%ItemKey%' OR 
        COLUMN_NAME LIKE '%Itemkey%' OR
        COLUMN_NAME LIKE '%CustKey%' OR 
        COLUMN_NAME LIKE '%Custkey%' OR
        COLUMN_NAME LIKE '%QtyOnHand%' OR 
        COLUMN_NAME LIKE '%Qtyonhand%' OR
        COLUMN_NAME LIKE '%QtyOnhand%' OR 
        COLUMN_NAME LIKE '%qtyOnHand%' OR
        COLUMN_NAME LIKE '%Customer_Key%' OR
        COLUMN_NAME LIKE '%Customer_Name%' OR
        COLUMN_NAME LIKE '%BatchNo%' OR
        COLUMN_NAME LIKE '%InclassKey%'
    )
ORDER BY 
    TABLE_SCHEMA,
    TABLE_NAME,
    COLUMN_NAME;

-- 9. ตรวจสอบ Database Collation (สำคัญต่อการกำหนด case sensitivity)
SELECT name, collation_name 
FROM sys.databases 
WHERE name = 'TFCPILOT2';

-- 10. ตรวจสอบ Collation ระดับคอลัมน์
SELECT 
    t.name AS TableName,
    c.name AS ColumnName,
    ty.name AS DataType,
    c.max_length,
    c.collation_name
FROM 
    sys.columns c
JOIN 
    sys.tables t ON c.object_id = t.object_id
JOIN 
    sys.types ty ON c.user_type_id = ty.user_type_id
WHERE 
    (
        t.name IN ('PNMAST', 'INLOC', 'INMAST', 'ARCUST', 'PNBominfo') OR
        OBJECT_SCHEMA_NAME(t.object_id) = 'FgL'
    )
    AND ty.name IN ('varchar', 'nvarchar', 'char', 'nchar')
ORDER BY 
    t.name, 
    c.name; 