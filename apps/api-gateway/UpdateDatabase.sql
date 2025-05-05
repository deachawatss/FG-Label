-- ตรวจสอบว่ามีคอลัมน์ ProductKey และ CustomerKey ใน FgL.LabelTemplate หรือไม่
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('FgL.LabelTemplate') AND name = 'ProductKey')
BEGIN
    -- เพิ่มคอลัมน์ ProductKey
    ALTER TABLE FgL.LabelTemplate
    ADD ProductKey NVARCHAR(20) NULL;
    
    PRINT 'Added ProductKey column to FgL.LabelTemplate';
END
ELSE
BEGIN
    PRINT 'ProductKey column already exists in FgL.LabelTemplate';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('FgL.LabelTemplate') AND name = 'CustomerKey')
BEGIN
    -- เพิ่มคอลัมน์ CustomerKey
    ALTER TABLE FgL.LabelTemplate
    ADD CustomerKey NVARCHAR(20) NULL;
    
    PRINT 'Added CustomerKey column to FgL.LabelTemplate';
END
ELSE
BEGIN
    PRINT 'CustomerKey column already exists in FgL.LabelTemplate';
END

-- ตรวจสอบว่าต้องมีตาราง FgL.LabelTemplateMapping หรือไม่
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('FgL.LabelTemplateMapping'))
BEGIN
    -- สร้างตาราง mapping ถ้ายังไม่มี
    CREATE TABLE FgL.LabelTemplateMapping (
        MappingID INT IDENTITY(1,1) PRIMARY KEY,
        TemplateID INT NOT NULL,
        ProductKey NVARCHAR(20) NULL,
        CustomerKey NVARCHAR(20) NULL,
        Priority INT DEFAULT 5,
        Active BIT DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL,
        UpdatedAt DATETIME2 NULL,
        CONSTRAINT FK_LabelTemplateMapping_TemplateID FOREIGN KEY (TemplateID) 
            REFERENCES FgL.LabelTemplate(TemplateID)
    );
    
    PRINT 'Created FgL.LabelTemplateMapping table';
END
ELSE
BEGIN
    PRINT 'FgL.LabelTemplateMapping table already exists';
END

PRINT 'Database update completed'; 