# Label Designer (Modern UI/UX)

โปรเจกต์นี้คือระบบออกแบบฉลาก/ป้ายสินค้า (Label Designer) ที่ทันสมัย ใช้งานง่าย และรองรับฟีเจอร์ระดับโลก

## เทคโนโลยีหลัก
- React + TypeScript
- [react-konva](https://konvajs.org/docs/react/) (Canvas-based Drag & Drop)
- [Ant Design](https://ant.design/) (UI Components)
- [jsbarcode](https://github.com/lindell/JsBarcode) (Barcode)
- [qrcode.react](https://github.com/zpao/qrcode.react) (QR Code)
- [html2canvas](https://github.com/niklasvh/html2canvas), [jsPDF](https://github.com/parallax/jsPDF) (Export)

## โครงสร้าง UI/UX
- **Top Bar:** Logo, New, Open, Save, Export, Import, Undo, Redo, Print, Settings
- **Left Sidebar (Toolbox):** Drag & Drop องค์ประกอบ (Text, Barcode, QR, Image, Shape, Variable, Table, Clipart)
- **Center (Canvas):** พื้นที่ออกแบบ label (WYSIWYG, Zoom, Grid, Snap, Multi-select, Drag/Resize/Rotate)
- **Right Sidebar (Properties):** Properties ของ element ที่เลือก (Text, Font, Size, Color, Barcode type, Data binding, Layer)

## ฟีเจอร์หลัก
- Drag & Drop องค์ประกอบลงบน Canvas
- ปรับแต่ง Properties ของแต่ละองค์ประกอบ
- Export เป็น PNG, SVG, PDF
- Import/Export JSON Template
- รองรับ Barcode, QR Code, Variable, Image, Shape
- Undo/Redo, Multi-select, Layer Management
- Responsive Design

## วิธีเริ่มต้น
1. ติดตั้ง dependencies:
   ```bash
   npm install
   ```
2. รันโปรเจกต์:
   ```bash
   npm run dev
   ```

## โฟลเดอร์หลัก
- `src/components/` : UI Components (Toolbox, Canvas, Properties, TopBar)
- `src/pages/`      : หน้าเว็บหลัก
- `src/utils/`      : ฟังก์ชันช่วยเหลือ (Export, Barcode, ฯลฯ)

---

**หมายเหตุ:**
- โค้ดนี้ออกแบบให้ขยายฟีเจอร์ได้ง่ายในอนาคต เช่น Data Merge, Template Library, User Management ฯลฯ

# การแก้ไขโปรเจกต์ FG-Label

## สรุปการแก้ไข

1. **แก้ไข Model ใน api-gateway**
   - สร้าง/แก้ไข `LabelTemplateComponent.cs`
   - แก้ไข `LabelTemplate.cs`
   - เพิ่ม `CreateTemplateRequest` ใน `Dtos.cs`
   - สร้าง `LabelTemplateMapping.cs`

2. **แก้ไข Service ใน api-gateway**
   - เพิ่ม method `SaveTemplateAsync` ใน `ITemplateService.cs`
   - เพิ่ม method `SaveTemplateAsync` ใน `TemplateService.cs`
   - สร้าง `ISqlConnectionFactory.cs` และ implement `SqlConnectionFactory`

3. **แก้ไข Endpoint ใน Program.cs**
   - แก้ endpoint `POST /api/templates` ให้เรียกใช้ `SaveTemplateAsync`
   - เพิ่ม dependency injection สำหรับ `ISqlConnectionFactory`

4. **สร้าง Shared Models ใน worker-service**
   - `Models/Shared/LabelTemplateComponent.cs`
   - `Models/Shared/LabelTemplate.cs`
   - `Models/Shared/CreateTemplateRequest.cs`
   - `Models/Shared/LabelTemplateMapping.cs`

5. **แก้ไข Front-end**
   - แก้ไขฟังก์ชัน `handleSaveTemplate` ใน `TemplateDesigner.tsx`
   - ปรับให้ส่งข้อมูล Components ในรูปแบบที่ตรงกับ backend

## รายละเอียด SQL ที่แก้ไข

```sql
-- Main Template
INSERT INTO FgL.LabelTemplate
    (Name, Description, Engine, PaperSize, Orientation, Content,
     Version, Active, CreatedAt, UpdatedAt)
  VALUES
    (@Name, @Description, @Engine, @PaperSize, @Orientation, @Content,
     1, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

-- Template Mapping
INSERT INTO FgL.LabelTemplateMapping
    (TemplateID, ProductKey, CustomerKey, Priority, Active, CreatedAt)
VALUES
    (@TemplateID, @ProductKey, @CustomerKey, 5, 1, SYSUTCDATETIME());

-- Components
INSERT INTO FgL.LabelTemplateComponent
    (TemplateID, ComponentType, X, Y, W, H, FontName, FontSize,
     Placeholder, StaticText, BarcodeFormat, CreatedAt)
  VALUES
    (@TemplateID, @ComponentType, @X, @Y, @W, @H, @FontName, @FontSize,
     @Placeholder, @StaticText, @BarcodeFormat, SYSUTCDATETIME());
```

## รายละเอียด Front-end

ปรับการแปลงข้อมูลเพื่อส่งไปยัง API:

```typescript
const dtoComponents = normalizedElements.map(el => ({
  ComponentType: el.type,
  X: el.x,
  Y: el.y,
  W: el.width ?? null,
  H: el.height ?? null,
  FontName: el.type === 'text' ? (el as TextElement).fontFamily : null,
  FontSize: el.type === 'text' ? (el as TextElement).fontSize : null,
  Placeholder: null,
  StaticText: el.type === 'text' ? (el as TextElement).text : null,
  BarcodeFormat: el.type === 'barcode' ? (el as BarcodeElement).format : null
}));

const templateData = {
  Name: templateInfo.name,
  Description: templateInfo.description,
  Engine: 'html',
  PaperSize: 'A6',
  Orientation: 'Portrait',
  Content: JSON.stringify({ elements: normalizedElements, canvasSize }),
  ProductKey: templateInfo.productKey || null,
  CustomerKey: templateInfo.customerKey || null,
  Components: dtoComponents
};
```

# SQL Schema ของระบบ FG-Label

## 1. ตาราง FgL.LabelTemplate

```sql
CREATE TABLE FgL.LabelTemplate (
    TemplateID INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(255) NULL,
    Engine VARCHAR(20) NOT NULL DEFAULT 'html',
    PaperSize VARCHAR(20) NOT NULL DEFAULT 'A6',
    Orientation VARCHAR(10) NOT NULL DEFAULT 'Portrait',
    Content NVARCHAR(MAX) NOT NULL,
    Version INT NOT NULL DEFAULT 1,
    Active BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
```

### โครงสร้างตาราง FgL.LabelTemplate

| Column Name | Data Type | Max Length | Nullable | Default |
|-------------|-----------|------------|----------|----------|
| TemplateID | int | N/A | NO | NULL |
| Name | nvarchar | 100 | NO | NULL |
| Description | nvarchar | 255 | YES | NULL |
| Engine | varchar | 20 | NO | ('html') |
| PaperSize | varchar | 20 | NO | ('A6') |
| Orientation | varchar | 10 | NO | ('Portrait') |
| Content | nvarchar | -1 | NO | NULL |
| Version | int | N/A | NO | ((1)) |
| Active | bit | N/A | NO | ((1)) |
| CreatedAt | datetime2 | N/A | NO | (sysutcdatetime()) |
| UpdatedAt | datetime2 | N/A | NO | (sysutcdatetime()) |

## 2. ตาราง FgL.LabelTemplateComponent

```sql
CREATE TABLE FgL.LabelTemplateComponent (
    ComponentID INT IDENTITY(1,1) PRIMARY KEY,
    TemplateID INT NOT NULL FOREIGN KEY REFERENCES FgL.LabelTemplate(TemplateID),
    ComponentType VARCHAR(20) NOT NULL,
    X DECIMAL(18,2) NOT NULL,
    Y DECIMAL(18,2) NOT NULL,
    W DECIMAL(18,2) NULL,
    H DECIMAL(18,2) NULL,
    FontName NVARCHAR(50) NULL,
    FontSize INT NULL,
    Placeholder NVARCHAR(100) NULL,
    StaticText NVARCHAR(255) NULL,
    BarcodeFormat VARCHAR(20) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
```

### โครงสร้างตาราง FgL.LabelTemplateComponent

| Column Name | Data Type | Max Length | Nullable | Default |
|-------------|-----------|------------|----------|----------|
| ComponentID | int | N/A | NO | NULL |
| TemplateID | int | N/A | NO | NULL |
| ComponentType | varchar | 20 | NO | NULL |
| X | decimal | N/A | NO | NULL |
| Y | decimal | N/A | NO | NULL |
| W | decimal | N/A | YES | NULL |
| H | decimal | N/A | YES | NULL |
| FontName | nvarchar | 50 | YES | NULL |
| FontSize | int | N/A | YES | NULL |
| Placeholder | nvarchar | 100 | YES | NULL |
| StaticText | nvarchar | 255 | YES | NULL |
| BarcodeFormat | varchar | 20 | YES | NULL |
| CreatedAt | datetime2 | N/A | NO | (sysutcdatetime()) |

## 3. ตาราง FgL.LabelTemplateMapping

```sql
CREATE TABLE FgL.LabelTemplateMapping (
    MappingID INT IDENTITY(1,1) PRIMARY KEY,
    TemplateID INT NOT NULL FOREIGN KEY REFERENCES FgL.LabelTemplate(TemplateID),
    ProductKey NVARCHAR(18) NULL,
    CustomerKey NVARCHAR(25) NULL,
    Priority INT NOT NULL DEFAULT 5,
    Active BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
```

### โครงสร้างตาราง FgL.LabelTemplateMapping

| Column Name | Data Type | Max Length | Nullable | Default |
|-------------|-----------|------------|----------|----------|
| MappingID | int | N/A | NO | NULL |
| TemplateID | int | N/A | NO | NULL |
| ProductKey | nvarchar | 18 | YES | NULL |
| CustomerKey | nvarchar | 25 | YES | NULL |
| Priority | int | N/A | NO | ((5)) |
| Active | bit | N/A | NO | ((1)) |
| CreatedAt | datetime2 | N/A | NO | (sysutcdatetime()) |

## 4. ตาราง FgL.LabelPrintJob

```sql
CREATE TABLE FgL.LabelPrintJob (
    JobID BIGINT IDENTITY(1,1) PRIMARY KEY,
    BatchNo NVARCHAR(50) NOT NULL,
    TemplateID INT NOT NULL FOREIGN KEY REFERENCES FgL.LabelTemplate(TemplateID),
    PrinterID INT NULL,
    ProductKey NVARCHAR(18) NULL,
    CustomerKey NVARCHAR(25) NULL,
    Copies INT NOT NULL DEFAULT 1,
    Status VARCHAR(20) NOT NULL DEFAULT 'queued',
    PrintedBy NVARCHAR(50) NULL,
    PrintedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CompletedAt DATETIME2 NULL
);
```

## คำสั่ง SQL สำหรับการสอบถามข้อมูล

### 1. ดึงข้อมูล Template พร้อมจำนวน Component

```sql
SELECT t.TemplateID, t.Name, t.Engine, t.PaperSize, t.Orientation, COUNT(c.ComponentID) as ComponentCount 
FROM FgL.LabelTemplate t
LEFT JOIN FgL.LabelTemplateComponent c ON t.TemplateID = c.TemplateID
GROUP BY t.TemplateID, t.Name, t.Engine, t.PaperSize, t.Orientation
ORDER BY t.TemplateID DESC;
```

### 2. ดึงข้อมูล Template พร้อม Component ทั้งหมด

```sql
SELECT * FROM FgL.LabelTemplate t
LEFT JOIN FgL.LabelTemplateComponent c ON t.TemplateID = c.TemplateID
WHERE t.TemplateID = @TemplateID;
```

### 3. ค้นหา Template ตาม Product และ Customer

```sql
SELECT TOP 1 t.* 
FROM FgL.LabelTemplate t
JOIN FgL.LabelTemplateMapping m ON t.TemplateID = m.TemplateID
WHERE m.Active = 1 
  AND (@ProductKey IS NULL OR m.ProductKey = @ProductKey)
  AND (@CustomerKey IS NULL OR m.CustomerKey = @CustomerKey)
ORDER BY
  CASE 
    WHEN m.ProductKey IS NOT NULL AND m.CustomerKey IS NOT NULL THEN 1
    WHEN m.CustomerKey IS NOT NULL THEN 2
    WHEN m.ProductKey IS NOT NULL THEN 3
    ELSE 4 
  END,
  m.Priority;
```

### 4. อัปเดต Template

```sql
UPDATE FgL.LabelTemplate
SET Name = @Name, 
    Description = @Description, 
    Engine = @Engine, 
    PaperSize = @PaperSize, 
    Orientation = @Orientation, 
    Content = @Content, 
    Version = @Version, 
    Active = @Active, 
    UpdatedAt = SYSUTCDATETIME()
WHERE TemplateID = @TemplateID;
```

### 5. ดึงข้อมูล Print Job

```sql
SELECT j.JobID, j.BatchNo, j.TemplateID, t.Name as TemplateName, j.Copies, j.Status, j.PrintedAt, j.CompletedAt
FROM FgL.LabelPrintJob j
JOIN FgL.LabelTemplate t ON j.TemplateID = t.TemplateID
ORDER BY j.JobID DESC;
```

## ข้อมูลสำหรับการพัฒนาเพิ่มเติม

### View สำหรับดูข้อมูล Label ผ่าน Batch

```sql
CREATE VIEW FgL.vw_Label_BatchInfo AS
SELECT 
    b.BatchNo,
    p.ProductKey,
    p.ProductName,
    c.CustomerKey,
    c.CustomerName,
    b.ProductionDate,
    DATEADD(DAY, p.ShelfLifeDays, b.ProductionDate) as FinalExpiryDate,
    p.NetWeight,
    b.TotalBags,
    c.Address_1,
    c.Address_2,
    c.Address_3,
    c.City,
    c.State,
    c.Zip_Code
FROM 
    dbo.BatchMaster b
    JOIN dbo.Product p ON b.ProductKey = p.ProductKey
    JOIN dbo.Customer c ON b.CustomerKey = c.CustomerKey;
```
