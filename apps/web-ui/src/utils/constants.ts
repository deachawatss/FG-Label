// ตัวเลือกขนาดกระดาษ
export const PaperSizeOptions = [
  { value: 'ZD411', label: 'ZD411 (4x1 นิ้ว)' },
  { value: 'ZD421', label: 'ZD421 (4x2 นิ้ว)' },
  { value: 'ZD621', label: 'ZD621 (6x3 นิ้ว)' },
  { value: 'A6', label: 'A6 (4.1x5.8 นิ้ว)' },
  { value: 'A7', label: 'A7 (2.9x4.1 นิ้ว)' },
  { value: 'custom', label: 'กำหนดเอง' }
];

// ประเภทของคอมโพเนนต์
export const ComponentTypes = [
  { value: 'text', label: 'ข้อความ' },
  { value: 'barcode', label: 'บาร์โค้ด' },
  { value: 'qrcode', label: 'QR Code' },
  { value: 'image', label: 'รูปภาพ' },
  { value: 'placeholder', label: 'ตัวแปร' }
];

// รูปแบบของบาร์โค้ด
export const BarcodeFormats = [
  { value: 'CODE128', label: 'CODE 128' },
  { value: 'CODE39', label: 'CODE 39' },
  { value: 'EAN13', label: 'EAN-13' },
  { value: 'EAN8', label: 'EAN-8' },
  { value: 'UPC', label: 'UPC' },
  { value: 'ITF', label: 'ITF' }
];

// ตัวแปรที่ใช้ในระบบ
export const Placeholders = [
  { value: 'BatchNo', label: 'เลขที่แบตช์' },
  { value: 'ProductName', label: 'ชื่อสินค้า' },
  { value: 'CustomerName', label: 'ชื่อลูกค้า' },
  { value: 'ProductionDate', label: 'วันที่ผลิต' },
  { value: 'ExpiryDate', label: 'วันหมดอายุ' },
  { value: 'NetWeight', label: 'น้ำหนักสุทธิ' },
  { value: 'UPCCODE', label: 'รหัส UPC' }
]; 