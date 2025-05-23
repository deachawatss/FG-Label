-- อัปเดตโครงสร้างตาราง LabelTemplate เพื่อเพิ่มฟิลด์ CreatedBy และ UpdatedBy
-- สำหรับติดตามผู้สร้างและผู้แก้ไข template

-- ตรวจสอบว่าฟิลด์ CreatedBy มีอยู่แล้วหรือไม่
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('FgL.LabelTemplate') AND name = 'CreatedBy')
BEGIN
    ALTER TABLE FgL.LabelTemplate ADD CreatedBy NVARCHAR(100) NULL;
    PRINT 'เพิ่มฟิลด์ CreatedBy ในตาราง FgL.LabelTemplate เรียบร้อยแล้ว';
END
ELSE
BEGIN
    PRINT 'ฟิลด์ CreatedBy มีอยู่แล้วในตาราง FgL.LabelTemplate';
END

-- ตรวจสอบว่าฟิลด์ UpdatedBy มีอยู่แล้วหรือไม่
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('FgL.LabelTemplate') AND name = 'UpdatedBy')
BEGIN
    ALTER TABLE FgL.LabelTemplate ADD UpdatedBy NVARCHAR(100) NULL;
    PRINT 'เพิ่มฟิลด์ UpdatedBy ในตาราง FgL.LabelTemplate เรียบร้อยแล้ว';
END
ELSE
BEGIN
    PRINT 'ฟิลด์ UpdatedBy มีอยู่แล้วในตาราง FgL.LabelTemplate';
END

-- อัปเดตข้อมูลเก่าที่ยังไม่มีข้อมูลผู้สร้าง
UPDATE FgL.LabelTemplate 
SET CreatedBy = 'System', UpdatedBy = 'System' 
WHERE CreatedBy IS NULL OR UpdatedBy IS NULL;

PRINT 'อัปเดตข้อมูลเก่าให้มีค่า CreatedBy และ UpdatedBy เป็น "System" เรียบร้อยแล้ว';

-- สร้าง index เพื่อเพิ่มประสิทธิภาพในการค้นหา
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('FgL.LabelTemplate') AND name = 'IX_LabelTemplate_CreatedBy')
BEGIN
    CREATE INDEX IX_LabelTemplate_CreatedBy ON FgL.LabelTemplate (CreatedBy);
    PRINT 'สร้าง index IX_LabelTemplate_CreatedBy เรียบร้อยแล้ว';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('FgL.LabelTemplate') AND name = 'IX_LabelTemplate_UpdatedBy')
BEGIN
    CREATE INDEX IX_LabelTemplate_UpdatedBy ON FgL.LabelTemplate (UpdatedBy);
    PRINT 'สร้าง index IX_LabelTemplate_UpdatedBy เรียบร้อยแล้ว';
END

PRINT 'การอัปเดตโครงสร้างฐานข้อมูลเสร็จสิ้น'; 


-- ตรวจสอบโครงสร้างปัจจุบัน
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'FgL' 
    AND TABLE_NAME = 'LabelTemplate' 
    AND COLUMN_NAME IN ('CreatedBy', 'UpdatedBy')
ORDER BY COLUMN_NAME;

-- แก้ไข CreatedBy จาก int เป็น nvarchar(100)
ALTER TABLE FgL.LabelTemplate 
ALTER COLUMN CreatedBy NVARCHAR(100) NULL;

-- อัปเดตข้อมูลเก่าที่เป็น NULL หรือค่าว่าง
UPDATE FgL.LabelTemplate 
SET CreatedBy = 'System' 
WHERE CreatedBy IS NULL OR CreatedBy = '';

-- ตรวจสอบผลลัพธ์หลังการแก้ไข
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'FgL' 
    AND TABLE_NAME = 'LabelTemplate' 
    AND COLUMN_NAME IN ('CreatedBy', 'UpdatedBy')
ORDER BY COLUMN_NAME;

-- ตรวจสอบข้อมูลตัวอย่าง
SELECT TOP 5 
    TemplateID, 
    Name, 
    CreatedBy, 
    UpdatedBy, 
    CreatedAt, 
    UpdatedAt 
FROM FgL.LabelTemplate 
ORDER BY TemplateID DESC;

PRINT 'CreatedBy column has been successfully updated to NVARCHAR(100)'; 

