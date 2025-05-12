-- สคริปต์นี้ใช้สำหรับปรับปรุงการอ้างอิงคอลัมน์ใน Database.sql ให้ถูกต้อง โดยเฉพาะชื่อคอลัมน์ที่มีปัญหาเรื่อง case sensitivity
-- ===================================================================

-- 1. คำแนะนำสำหรับการแก้ไขไฟล์ Database.sql
/*
จากการตรวจสอบพบว่าชื่อคอลัมน์ที่อาจมีปัญหา case-sensitivity ได้แก่:

1. Itemkey -> ItemKey
   - ต้องแก้ไขในส่วนการสร้างตาราง และ query ต่างๆ
   - ตัวอย่าง: เปลี่ยน "BL.Itemkey" เป็น "BL.ItemKey"
   - ตัวอย่าง: เปลี่ยน "IM.Itemkey" เป็น "IM.ItemKey"

2. Custkey -> CustKey
   - ต้องแก้ไขในส่วนการสร้างตาราง และ query ต่างๆ
   - ตัวอย่าง: เปลี่ยน "BL.Custkey" เป็น "BL.CustKey"

3. Qtyonhand -> QtyOnHand
   - ต้องแก้ไขในส่วนที่อ้างอิงตาราง INLOC
   - ตัวอย่าง: เปลี่ยน "IL.Qtyonhand" เป็น "IL.QtyOnHand"
*/

-- 2. สคริปต์อัปเดตไฟล์ Database.sql (แนวทางการแก้ไข)
/*
1. แก้ไขส่วนการสร้างตาราง BME_LABEL:

CREATE TABLE FgL.BME_LABEL (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    CustKey VARCHAR(50) NULL,  -- เปลี่ยนจาก Custkey
    ItemKey VARCHAR(50) NULL,  -- เปลี่ยนจาก Itemkey
    ...
);

2. แก้ไขส่วนการสร้าง Index:

CREATE NONCLUSTERED INDEX IX_BME_LABEL_Keys
    ON FgL.BME_LABEL (ItemKey, CustKey);  -- เปลี่ยนจาก Itemkey, Custkey

3. แก้ไขการ Insert ข้อมูล:

INSERT INTO FgL.BME_LABEL (
    ItemKey, CustKey, ...  -- เปลี่ยนจาก Itemkey, Custkey
)

4. แก้ไขใน view FgL.vw_Label_PrintData:

COALESCE(BL.ItemKey, IM.ItemKey, PN.ItemKey) AS ItemKey,  -- เปลี่ยนจาก BL.Itemkey

COALESCE(AR.Customer_Key, BL.CustKey, PN.CustKey) AS CustKey,  -- เปลี่ยนจาก BL.Custkey, AS Custkey

(PN.ItemKey IS NOT NULL AND PN.ItemKey = BL.ItemKey)  -- เปลี่ยนจาก BL.Itemkey

dbo.INMAST IM ON COALESCE(PN.ItemKey, BL.ItemKey) = IM.ItemKey  -- เปลี่ยนจาก BL.Itemkey

IL.QtyOnHand  -- เปลี่ยนจาก IL.Qtyonhand
*/

-- 3. คำแนะนำสำหรับการแก้ไขในโค้ด C# และ TypeScript
/*
ในไฟล์ C# (โปรเจค API Gateway):
1. ตรวจสอบและแก้ไขชื่อคอลัมน์ในส่วนที่ติดต่อกับฐานข้อมูล
2. ตรวจสอบการแมปคอลัมน์ในไฟล์ Model เช่น
   - เปลี่ยน [Column("Itemkey")] เป็น [Column("ItemKey")]
   - เปลี่ยน [Column("Custkey")] เป็น [Column("CustKey")]

ในไฟล์ TypeScript (โปรเจค web-ui):
1. แก้ไขชื่อ property ในอินเตอร์เฟซหรือคลาส
2. ตรวจสอบส่วนที่รับข้อมูลจาก API ว่ามีการแมปชื่อฟิลด์ถูกต้องหรือไม่
   - จากการตรวจสอบพบว่ามีการใช้ || เพื่อรองรับหลายรูปแบบ เช่น
     data.ItemKey || data.Itemkey
*/

-- 4. สรุปชื่อคอลัมน์ที่ถูกต้องในฐานข้อมูล
/*
ชื่อคอลัมน์ที่ถูกต้องควรเป็น:
1. ItemKey (ไม่ใช่ Itemkey)
2. CustKey (ไม่ใช่ Custkey)
3. QtyOnHand (ไม่ใช่ Qtyonhand)
4. Customer_Key (ใน ARCUST)
5. Customer_Name (ใน ARCUST)
6. BatchNo
7. InclassKey (ใน INLOC)
*/

-- 5. ขั้นตอนในการแก้ไข
/*
1. รันสคริปต์ check_column_names.sql เพื่อตรวจสอบชื่อคอลัมน์จริงในฐานข้อมูล
2. แก้ไขไฟล์ Database.sql ตามชื่อคอลัมน์ที่ถูกต้อง
3. อัปเดตโค้ด C# และ TypeScript ที่เกี่ยวข้อง
4. ทดสอบการทำงานของระบบหลังแก้ไข
*/ 