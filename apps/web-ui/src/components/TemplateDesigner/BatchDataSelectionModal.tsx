import React, { useState, useEffect, useMemo, useRef, KeyboardEvent } from 'react';
import { Modal, Table, Checkbox, Button, Row, Col, Input, Space, Typography, Collapse, Alert, Spin, Tabs, List, message } from 'antd';
import { SearchOutlined, InfoCircleOutlined, DatabaseOutlined, HistoryOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import { ElementType, TextElement } from '../../models/TemplateDesignerTypes';

const { Panel } = Collapse;
const { Text } = Typography;
const { TabPane } = Tabs;

interface BatchRow {
  // ฟิลด์หลักที่ต้องมีเสมอ
  id: string;            // ID ภายในแอพสำหรับรายการนี้
  batchNo: string;       // รหัส Batch
  
  // ฟิลด์ที่ตรงกับฐานข้อมูล
  itemKey: string;       // รหัสสินค้า (จากฐานข้อมูล)
  custKey: string;       // รหัสลูกค้า (จากฐานข้อมูล)
  
  // ฟิลด์สำหรับการแสดงผล
  productName: string;   // ชื่อสินค้า (จากฐานข้อมูล Product หรือ BME_Product)
  product: string;       // ชื่อสินค้า (เหมือน productName แต่อาจมีค่าต่างกัน)
  
  // ฟิลด์เดิมที่ใช้ในโค้ด (อาจมีโค้ดเดิมที่ใช้อยู่) - marked as optional
  productKey?: string;   // รหัสสินค้า (ชื่อเก่า - ให้ตรงกับ itemKey)
  customerKey?: string;  // รหัสลูกค้า (ชื่อเก่า - ให้ตรงกับ custKey)
  
  // ฟิลด์อื่นๆ
  totalBags?: number;    // จำนวนถุงทั้งหมด
  shipToCountry?: string;
}

interface BatchFieldData {
  key: string;
  field: string;
  value: string | number | boolean | null;
}

// เพิ่มเป็นค่าคงที่ด้านบนเพื่อใช้งานได้ทั่วทั้งคอมโพเนนต์
const ALIAS_ITEMKEY = [
  'ItemKey', 'itemKey', 'ITEMKEY',
  'ProductKey', 'productKey', 'PRODUCTKEY',
  'Assembly_Item_Key',
  'itemKeyResolved', 'ItemKeyResolved', 'ITEMKEYRESOLVED'
];

const ALIAS_CUSTKEY = [
  'CustKey', 'custKey', 'CUSTKEY',
  'CustomerKey', 'customerKey', 'CUSTOMERKEY',
  'Customer_Key',
  'custKeyResolved', 'CustKeyResolved', 'CUSTKEYRESOLVED'
];

// เพิ่มอินเตอร์เฟซสำหรับประวัติการใช้แบตช์
interface BatchHistory {
  batchNo: string;
  timestamp: number;
}

// เพิ่มคีย์สำหรับเก็บประวัติในลูกอม storage
const BATCH_HISTORY_KEY = 'fglabel_batch_history';

interface BatchDataSelectionModalProps {
  visible: boolean;
  batchNo: string;
  onCancel: () => void;
  onConfirm: (elements: ElementType[], selectedBatchRow: BatchRow | null) => void;
  apiBaseUrl: string;
  onBatchChange?: (newBatchNo: string) => void;
}

const BatchDataSelectionModal: React.FC<BatchDataSelectionModalProps> = ({
  visible,
  batchNo,
  onCancel,
  onConfirm,
  apiBaseUrl,
  onBatchChange,
}) => {
  const [loading, setLoading] = useState(false);
  const [batchDataRows, setBatchDataRows] = useState<BatchRow[]>([]);
  const [selectedBatchRow, setSelectedBatchRow] = useState<BatchRow | null>(null);
  const [batchDetails, setBatchDetails] = useState<Record<string, any> | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [dataError, setDataError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<'select-row' | 'select-fields'>('select-row');
  const [rawSqlViewData, setRawSqlViewData] = useState<any[]>([]);
  const [useDirectViewData, setUseDirectViewData] = useState<boolean>(false);
  // เพิ่ม state ใหม่สำหรับประวัติการใช้แบตช์
  const [batchHistory, setBatchHistory] = useState<BatchHistory[]>([]);
  
  // เพิ่ม ref สำหรับช่องค้นหา เพื่อรองรับการกด Enter
  const searchInputRef = useRef<any>(null);
  const batchInputRef = useRef<any>(null);

// 👈 1.2  utility ช่วยดึงค่า (เพิ่มชื่อคอลัมน์แบบต่าง ๆ ที่ SQL อาจส่งกลับ)
const getFieldValue = (item: any, possibleNames: string[]) => {
  if (!item || !possibleNames || possibleNames.length === 0) {
    console.debug('getFieldValue: No item or possible names provided', { item, possibleNames });
    return '';
  }
  
  // วิธีการที่ 1: เพิ่มการค้นหาแบบ case-insensitive ก่อน
  for (const name of possibleNames) {
    const foundKey = Object.keys(item).find(k => k.toLowerCase() === name.toLowerCase());
    if (foundKey && item[foundKey] != null && String(item[foundKey]).trim() !== '') {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`getFieldValue found case-insensitive match: "${foundKey}" = "${item[foundKey]}"`);
      }
      return String(item[foundKey]).trim();
    }
  }
  
  // ฟังก์ชันสำหรับทำให้สตริงเป็นรูปแบบมาตรฐาน (เพื่อเปรียบเทียบ)
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // ทำ normalize ชื่อฟิลด์ที่ต้องการค้นหา
  const normalizedWanted = possibleNames.map(normalize);
  
  // DEV logging
  if (process.env.NODE_ENV === 'development') {
    console.debug('getFieldValue searching for normalized keys:', normalizedWanted);
    
    // เพิ่มการแสดงค่าของทุก key ที่เกี่ยวข้องกับ shipToCountry เพื่อการดีบัก
    const countryRelatedKeys = Object.keys(item).filter(key => 
      key.toLowerCase().includes('country') || 
      key.toLowerCase().includes('shipto')
    );
    
    if (countryRelatedKeys.length > 0) {
      console.debug('Country-related keys and values:');
      countryRelatedKeys.forEach(key => {
        console.debug(`  ${key}: "${item[key]}" (normalized: "${normalize(key)}")`);
      });
    }
  }

  // วิธีการที่ 2: ค้นหาตามชื่อที่ต้องการก่อน (รองรับความเข้ากันได้กับโค้ดเดิม)
  for (const name of possibleNames) {
    if (item[name] !== undefined && item[name] !== null && String(item[name]).trim() !== '') {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`getFieldValue found exact match: "${name}" = "${item[name]}"`);
      }
      return String(item[name]).trim();
    }
  }
  
  // วิธีการที่ 3: ค้นหาแบบ normalized ซึ่งไม่สนใจตัวพิมพ์ใหญ่-เล็ก และสัญลักษณ์พิเศษ
  for (const [key, value] of Object.entries(item)) {
    if (normalizedWanted.includes(normalize(key)) && 
        value !== undefined && 
        value !== null && 
        String(value).trim() !== '') {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`getFieldValue found normalized match: "${key}" (${normalize(key)}) = "${value}"`);
      }
      return String(value).trim();
    }
  }
  
  // วิธีการที่ 4: ค้นหาค่าแบบบางส่วน (partial match) - ใช้เมื่อไม่พบการตรงกันแบบสมบูรณ์
  const lowerCaseNames = possibleNames.map(n => n.toLowerCase());
  for (const key of Object.keys(item)) {
    const lowerKey = key.toLowerCase();
    // ตรวจสอบว่ามีคำใน lowerCaseNames อยู่ใน lowerKey หรือไม่
    const partialMatch = lowerCaseNames.some(name => lowerKey.includes(name.toLowerCase()));
    if (partialMatch && 
        item[key] !== undefined && 
        item[key] !== null && 
        String(item[key]).trim() !== '') {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`getFieldValue found partial match: "${key}" = "${item[key]}"`);
      }
      return String(item[key]).trim();
    }
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.debug(`getFieldValue: No match found for ${possibleNames.join(', ')}`);
  }
  return '';
}

// ฟังก์ชันสำหรับดึงค่าจากฐานข้อมูล SQL โดยรองรับชื่อฟิลด์ที่อาจมีหลายรูปแบบ
// เช่น ShipToCountry, shipto_country, SHIPTO_COUNTRY
const getMissingSqlFieldValue = (item: any, fieldName: string): string | null => {
  // ไม่มีข้อมูล item
  if (!item) return null;
  
  // ถ้ามีค่าในฟิลด์นี้โดยตรง
  if (item[fieldName] !== undefined && 
      item[fieldName] !== null && 
      item[fieldName] !== "null" && 
      String(item[fieldName]).trim() !== '') {
    return String(item[fieldName]).trim();
  }
  
  // สร้าง normalized variants ของชื่อฟิลด์
  const variants = [
    // ลองใช้ lowercase ทั้งหมด
    fieldName.toLowerCase(),
    // ลองใช้ uppercase ทั้งหมด
    fieldName.toUpperCase(),
    // ลองใช้ camelCase (ถ้าเป็นหลายคำ)
    fieldName.charAt(0).toLowerCase() + fieldName.slice(1),
    // ลองใช้ PascalCase (ถ้าเป็นหลายคำ)
    fieldName.charAt(0).toUpperCase() + fieldName.slice(1),
    // แปลง camelCase เป็น snake_case
    fieldName.replace(/([A-Z])/g, '_$1').toLowerCase(),
    // แปลง camelCase เป็น kebab-case
    fieldName.replace(/([A-Z])/g, '-$1').toLowerCase()
  ];
  
  // ค้นหาจากทุก variant
  for (const variant of variants) {
    if (item[variant] !== undefined && 
        item[variant] !== null && 
        item[variant] !== "null" && 
        String(item[variant]).trim() !== '') {
      return String(item[variant]).trim();
    }
  }
  
  // ค้นหาจากทุกคีย์ที่มีคำนี้
  const normalizedFieldName = fieldName.toLowerCase();
  
  for (const key of Object.keys(item)) {
    if (key.toLowerCase().includes(normalizedFieldName) && 
        item[key] !== undefined && 
        item[key] !== null && 
        item[key] !== "null" && 
        String(item[key]).trim() !== '') {
      return String(item[key]).trim();
    }
  }
  
  // ไม่พบค่าที่ต้องการ
  return null;
};

// แก้ไข getShipToCountry ให้ใช้ getMissingSqlFieldValue
const getShipToCountry = (item: any): string => {
  if (!item) return '';

  // 1) แสดงข้อมูลเพื่อดีบัก (แสดงเฉพาะใน development)
  if (process.env.NODE_ENV === 'development') {
    console.group('🔍 getShipToCountry - input data analysis');
    
    // แสดงข้อมูลทั้งหมดของ item เพื่อดูว่ามีฟิลด์อะไรบ้าง
    console.log('All item keys:', Object.keys(item));
    console.log('Item data snippet (first few fields):', JSON.stringify(
      Object.fromEntries(
        Object.entries(item).slice(0, 10) // แสดงเฉพาะ 10 ฟิลด์แรก
      ), null, 2)
    );
    
    const countryKeys = Object.keys(item).filter(key => 
      key.toLowerCase().includes('country') || 
      key.toLowerCase().includes('ship')
    );
    
    if (countryKeys.length > 0) {
      console.log('Ship/Country-related keys found:');
      countryKeys.forEach(key => {
        console.log(`  - ${key}: "${item[key]}", type: ${typeof item[key]}`);
      });
    } else {
      console.warn('No Ship/Country-related keys found in data!');
      console.log('All available keys:', Object.keys(item));
    }
    console.groupEnd();
  }
  
  // 2) ใช้ getMissingSqlFieldValue เพื่อค้นหาค่า shipToCountry
  const shipToCountryValue = getMissingSqlFieldValue(item, 'shipToCountry');
  if (shipToCountryValue) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ Found shipToCountry via getMissingSqlFieldValue: "${shipToCountryValue}"`);
    }
    return shipToCountryValue;
  }
  
  // 3) ถ้าไม่พบค่าที่ต้องการ ให้ลองหาจาก hardcoded fields ที่รู้ว่ามี
  for (const field of ['ShipToCountry', 'SHIPTO_COUNTRY', 'shipToCountry', 'shipto_country']) {
    if (item[field] !== undefined && 
        item[field] !== null && 
        item[field] !== "null" && 
        String(item[field]).trim() !== '') {
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Found via hardcoded field: "${field}" = "${item[field]}"`);
      }
      return String(item[field]).trim();
    }
  }
  
  // 4) ค้นหาค่า country จากทุกคีย์ที่มีคำว่า "country" (ไม่รวม countryoforigin)
  const countryKey = Object.keys(item).find(key => {
    const normalizedKey = key.toLowerCase();
    // ยกเว้น countryoforigin เพราะค่านี้ไม่ถูกต้องสำหรับแต่ละประเทศ
    return normalizedKey.includes('country') && 
           normalizedKey.includes('ship') &&
           !normalizedKey.includes('origin') &&
           item[key] != null && 
           item[key] !== "null" &&
           String(item[key]).trim() !== '';
  });
  
  if (countryKey) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ Found by partial country key: "${countryKey}" = "${item[countryKey]}"`);
    }
    return String(item[countryKey]).trim();
  }

  // 5) fallback -> Country (เป็นค่าที่ปลอดภัย)
  if (item.Country && item.Country !== "null" && String(item.Country).trim() !== '') {
    if (process.env.NODE_ENV === 'development') {
      console.log(`ℹ️ Falling back to Country: "${item.Country}"`);
    }
    return String(item.Country).trim();
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.warn(`❌ No ship to country or country found in item`);
  }
  
  return '';  // ไม่เจอเลย
};

  // เพิ่มฟังก์ชัน helper สำหรับค้นหา batch item ที่ตรงกัน
  const findBatchDetailItem = (batchItems: any[], row: BatchRow) => {
    // ลำดับความสำคัญในการค้นหา:
    
    // 1. ถ้ามีทั้ง itemKey, custKey และ shipToCountry ให้ค้นหาจากทั้งสามค่า
    if (row.itemKey && row.custKey && row.shipToCountry) {
      const exactMatchWithCountry = batchItems.find(item => {
        const itemKeyValue = getFieldValue(item, ALIAS_ITEMKEY);
        const custKeyValue = getFieldValue(item, ALIAS_CUSTKEY);
        const shipToCountryValue = getShipToCountry(item);
        
        return itemKeyValue === row.itemKey && 
               custKeyValue === row.custKey && 
               shipToCountryValue.toUpperCase() === row.shipToCountry.toUpperCase();
      });
      if (exactMatchWithCountry) {
        console.log(`✅ Found exact match with itemKey, custKey and shipToCountry for ${row.custKey}`);
        return exactMatchWithCountry;
      }
    }
    
    // 2. ถ้ามีทั้ง itemKey และ custKey ให้ค้นหาจากทั้งสองค่า
    if (row.itemKey && row.custKey) {
      const exactMatch = batchItems.find(item => {
        const itemKeyValue = getFieldValue(item, ALIAS_ITEMKEY);
        const custKeyValue = getFieldValue(item, ALIAS_CUSTKEY);
        
        return itemKeyValue === row.itemKey && custKeyValue === row.custKey;
      });
      if (exactMatch) {
        // ไม่ต้องปรับข้อมูล ShipToCountry เอง แต่ใช้ข้อมูลจากฐานข้อมูลโดยตรง
        if (process.env.NODE_ENV === 'development') {
          const originalShipToCountry = exactMatch.ShipToCountry || exactMatch.SHIPTO_COUNTRY;
          console.log(`📊 Found match with ItemKey=${row.itemKey}, CustKey=${row.custKey}, ShipToCountry from API: "${originalShipToCountry || 'NOT SET'}"`);
        }
        
        console.log(`✅ Found exact match with itemKey and custKey for ${row.custKey}`);
        return exactMatch;
      }
    }
    
    // 3. ถ้ามีแค่ itemKey ให้ค้นหาจาก itemKey
    if (row.itemKey) {
      const itemKeyMatch = batchItems.find(item => {
        const itemKeyValue = getFieldValue(item, ALIAS_ITEMKEY);
        return itemKeyValue === row.itemKey;
      });
      if (itemKeyMatch) {
        console.log(`⚠️ Found match by itemKey only for ${row.itemKey}`);
        return itemKeyMatch;
      }
    }
    
    // 4. ถ้ามีแค่ custKey ให้ค้นหาจาก custKey
    if (row.custKey) {
      const custKeyMatch = batchItems.find(item => {
        const custKeyValue = getFieldValue(item, ALIAS_CUSTKEY);
        return custKeyValue === row.custKey;
      });
      if (custKeyMatch) {
        console.log(`⚠️ Found match by custKey only for ${row.custKey}`);
        return custKeyMatch;
      }
    }
    
    // 5. ถ้าไม่พบการตรงกันใดๆ ให้ใช้รายการแรก
    console.log(`⚠️ No match found, using first item`);
    return batchItems[0];
  };

  // เพิ่มฟังก์ชันสำหรับจัดการประวัติการใช้แบตช์
  const loadBatchHistory = () => {
    try {
      const historyJson = localStorage.getItem(BATCH_HISTORY_KEY);
      if (historyJson) {
        const history = JSON.parse(historyJson) as BatchHistory[];
        // เรียงลำดับตาม timestamp จากใหม่ไปเก่า
        const sortedHistory = history.sort((a, b) => b.timestamp - a.timestamp);
        // ลบรายการซ้ำ โดยเก็บเฉพาะรายการล่าสุดของแต่ละ batchNo
        const uniqueHistory = sortedHistory.filter((item, index, self) => 
          index === self.findIndex(t => t.batchNo === item.batchNo)
        );
        // จำกัดจำนวนรายการให้ไม่เกิน 10 รายการ
        setBatchHistory(uniqueHistory.slice(0, 10));
      }
    } catch (error) {
      console.error('Error loading batch history:', error);
    }
  };

  const saveBatchHistory = (batchNumber: string) => {
    try {
      // ตรวจสอบว่าเป็นแบตช์ที่ถูกต้องหรือไม่
      if (!batchNumber || batchNumber.trim() === '') {
        return;
      }
      
      const newEntry: BatchHistory = {
        batchNo: batchNumber.trim(),
        timestamp: Date.now()
      };
      
      // โหลดประวัติปัจจุบัน
      const historyJson = localStorage.getItem(BATCH_HISTORY_KEY);
      let history: BatchHistory[] = [];
      
      if (historyJson) {
        history = JSON.parse(historyJson) as BatchHistory[];
      }
      
      // เพิ่มรายการใหม่
      history.push(newEntry);
      
      // เรียงลำดับและลบรายการซ้ำ
      const sortedHistory = history.sort((a, b) => b.timestamp - a.timestamp);
      const uniqueHistory = sortedHistory.filter((item, index, self) => 
        index === self.findIndex(t => t.batchNo === item.batchNo)
      );
      
      // จำกัดจำนวนรายการให้ไม่เกิน 10 รายการ
      const limitedHistory = uniqueHistory.slice(0, 10);
      
      // บันทึกลงใน localStorage
      localStorage.setItem(BATCH_HISTORY_KEY, JSON.stringify(limitedHistory));
      
      // อัปเดต state
      setBatchHistory(limitedHistory);
    } catch (error) {
      console.error('Error saving batch history:', error);
    }
  };

  // เพิ่มฟังก์ชันสำหรับการกดปุ่ม Enter ที่ช่องค้นหา
  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // ถ้ามีข้อความค้นหาและมีข้อมูล
      if (searchText && filteredData.length > 0) {
        // เลือกรายการแรกที่พบจากการค้นหา
        const firstMatchField = filteredData[0].field;
        if (!selectedFields.includes(firstMatchField)) {
          setSelectedFields(prev => [...prev, firstMatchField]);
          message.success(`Field "${firstMatchField}" added successfully`);
        }
      }
    }
  };

  // Get batch data when the modal is opened
  useEffect(() => {
    if (visible) {
      // โหลดประวัติการใช้แบตช์ก่อนเสมอ
      loadBatchHistory();
      
      // ดึงข้อมูลแบตช์เฉพาะเมื่อมี batchNo ที่ถูกต้อง
      if (batchNo && batchNo.trim() !== '') {
        // ใช้การดึงข้อมูลจาก SQL View โดยตรงเท่านั้น ไม่มี fallback
        fetchSqlViewDataDirectly();
        // บันทึกประวัติการใช้แบตช์
        saveBatchHistory(batchNo);
      } else {
        // ถ้าไม่มี batchNo ให้เคลียร์ข้อผิดพลาดเก่า และตั้งค่าตัวแปรสถานะเป็นค่าว่าง
        setDataError(null);
        setBatchDataRows([]);
        setBatchDetails(null);
      }
    } else {
      // Reset state when modal is closed
      setCurrentStep('select-row');
      setSelectedBatchRow(null);
      setBatchDetails(null);
      setSelectedFields([]);
      setRawSqlViewData([]);
      setUseDirectViewData(false);
    }
  }, [visible, batchNo]);

  // เพิ่มฟังก์ชัน fetchSqlViewDataDirectly เพื่อดึงข้อมูลจาก View SQL โดยตรง
  const fetchSqlViewDataDirectly = async () => {
    // Check if there is a valid batchNo
    if (!batchNo || batchNo.trim() === '') {
      console.log('No valid batch number provided');
      return;
    }

    setLoading(true);
    setDataError(null);
    
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('Please login before using this feature');
      }
      
      // Create URL for direct SQL View data fetch
      const apiUrl = `${apiBaseUrl}/batches/sqlview?batchNo=${batchNo}`;
      console.log(`Fetching data from SQL View directly: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Unable to fetch data from SQL View: HTTP ${response.status} - ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error(`No data found for batch ${batchNo}`);
      }
      
      console.log(`🌟 SQL view data loaded successfully for batch ${batchNo}`);
      
      // Store raw data from SQL View
      setRawSqlViewData(Array.isArray(data) ? data : [data]);
      setUseDirectViewData(true);
      
      // Transform raw data into application format
      const batchRows: BatchRow[] = (Array.isArray(data) ? data : [data]).map((item, index) => {
        // Extract values from known columns in SQL View
        const itemKeyValue = item.ItemKey || item.itemKey || item.ITEMKEY || item.itemKeyResolved;
        const custKeyValue = item.CustKey || item.custKey || item.CUSTKEY || item.custKeyResolved;
        const productValue = item.Product || item.product || item.BME_Product || item.PRODUCT || 'Unknown';
        const totalBagsValue = item.TotalBags || item.totalBags || item.TOTALBAGS || null;
        
        // Get ShipToCountry value directly from SQL View
        const shipToCountry = item.SHIPTO_COUNTRY || item.ShipToCountry || item.shipToCountry || '';
        
        console.log(`📊 SQL View Row #${index + 1}: ItemKey=${itemKeyValue}, CustKey=${custKeyValue}, ShipToCountry=${shipToCountry}`);
        
        return {
          id: `${batchNo}-${itemKeyValue || index}-${custKeyValue || ''}`,
          batchNo,
          itemKey: itemKeyValue || null,
          custKey: custKeyValue || null,
          productName: productValue,
          product: productValue,
          totalBags: totalBagsValue ? parseInt(totalBagsValue, 10) : 0,
          shipToCountry: shipToCountry || null,
        };
      });
      
      console.log(`📋 Created ${batchRows.length} batch rows from SQL view data`);
      setBatchDataRows(batchRows);
      
    } catch (error: any) {
      console.error('Error fetching SQL view data:', error);
      setDataError(`Unable to load data from SQL View: ${error.message}`);
      setBatchDataRows([]);
    } finally {
      setLoading(false);
    }
  };

  // แก้ไข fetchBatchDetails เพื่อใช้ข้อมูลจาก SQL View เท่านั้น
  const fetchBatchDetails = async (row: BatchRow) => {
    // Reset previously selected fields and details when selecting a new row
    setBatchDetails(null);
    setSelectedFields([]);
    
    setLoading(true);
    setDataError(null);
    
    try {
      // ใช้ข้อมูลจาก SQL View โดยตรง
      if (useDirectViewData && rawSqlViewData.length > 0) {
        // หารายการที่ตรงกับ row ที่เลือก โดยใช้ itemKey และ custKey เป็นเกณฑ์
        const matchingItem = rawSqlViewData.find(item => {
          const itemKeyValue = item.ItemKey || item.itemKey || item.ITEMKEY || item.itemKeyResolved;
          const custKeyValue = item.CustKey || item.custKey || item.CUSTKEY || item.custKeyResolved;
          
          return itemKeyValue === row.itemKey && custKeyValue === row.custKey;
        });
        
        if (matchingItem) {
          console.log('🎯 Found matching data in SQL View:', {
            itemKey: row.itemKey,
            custKey: row.custKey,
            shipToCountry: matchingItem.SHIPTO_COUNTRY || matchingItem.ShipToCountry
          });
          
          setBatchDetails(matchingItem);
          
          // เลือก common fields โดยอัตโนมัติ
          const commonFields = [
            'BatchNo', 'ProductionDate', 'Product', 
            'ItemKey', 'CustKey',
            'NET_WEIGHT1', 'GROSS_WEIGHT1', 'PACKSIZE1', 'PACKUNIT1', 
            'PACKSIZE2', 'PACKUNIT2', 'TOTAL_UNIT2_IN_UNIT1',
            'ALLERGEN1', 'STORECAP1', 'DaysToExpire',
            'Customer_Name', 'TotalBags', 'TotalCTN', 'TotalWeightKG'
          ];
          
          const availableFields = Object.keys(matchingItem);
          
          // เลือกเฉพาะ fields ที่มีอยู่จริงและเป็นที่นิยมใช้
          const initialSelectedFields = commonFields.filter(field => 
            availableFields.includes(field) || 
            availableFields.includes(field.toUpperCase()) || 
            availableFields.includes(field.toLowerCase())
          );
          
          setSelectedFields(initialSelectedFields);
          setCurrentStep('select-fields');
          setLoading(false);
          return;
        } else {
          // ถ้าไม่พบข้อมูลที่ตรงกัน
          console.warn(`⚠️ No matching data found in SQL View for ItemKey=${row.itemKey}, CustKey=${row.custKey}`);
          setDataError(`No data found for ItemKey=${row.itemKey}, CustKey=${row.custKey}`);
        }
      } else {
        // ถ้าไม่มีข้อมูลจาก SQL View
        console.warn('⚠️ No data from SQL View');
        
        // ดึงข้อมูลจาก SQL View อีกครั้ง
        const token = localStorage.getItem('token');
        
        if (!token) {
          throw new Error('Please login before using this feature');
        }
        
        const apiUrl = `${apiBaseUrl}/batches/sqlview?batchNo=${row.batchNo}`;
        console.log(`Fetching data from SQL View again for batchNo=${row.batchNo}`);
        
        const response = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Unable to fetch data from SQL View: HTTP ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data || (Array.isArray(data) && data.length === 0)) {
          throw new Error(`No data found for batch ${row.batchNo}`);
        }
        
        console.log(`🌟 Successfully fetched data from SQL View, ${Array.isArray(data) ? data.length : 1} items`);
        
        // เก็บข้อมูลดิบจาก SQL View
        const rawData = Array.isArray(data) ? data : [data];
        setRawSqlViewData(rawData);
        setUseDirectViewData(true);
        
        // หารายการที่ตรงกับ row ที่เลือก
        const matchingItem = rawData.find(item => {
          const itemKeyValue = item.ItemKey || item.itemKey || item.ITEMKEY || item.itemKeyResolved;
          const custKeyValue = item.CustKey || item.custKey || item.CUSTKEY || item.custKeyResolved;
          
          return itemKeyValue === row.itemKey && custKeyValue === row.custKey;
        });
        
        if (matchingItem) {
          console.log('🎯 Found matching data in SQL View:', {
            itemKey: row.itemKey,
            custKey: row.custKey,
            shipToCountry: matchingItem.SHIPTO_COUNTRY || matchingItem.ShipToCountry
          });
          
          setBatchDetails(matchingItem);
          
          // เลือก common fields โดยอัตโนมัติ
          const commonFields = [
            'BatchNo', 'ProductionDate', 'Product', 
            'ItemKey', 'CustKey',
            'NET_WEIGHT1', 'GROSS_WEIGHT1', 'PACKSIZE1', 'PACKUNIT1', 
            'PACKSIZE2', 'PACKUNIT2', 'TOTAL_UNIT2_IN_UNIT1',
            'ALLERGEN1', 'STORECAP1', 'DaysToExpire',
            'Customer_Name', 'TotalBags', 'TotalCTN', 'TotalWeightKG'
          ];
          
          const availableFields = Object.keys(matchingItem);
          
          // เลือกเฉพาะ fields ที่มีอยู่จริงและเป็นที่นิยมใช้
          const initialSelectedFields = commonFields.filter(field => 
            availableFields.includes(field) || 
            availableFields.includes(field.toUpperCase()) || 
            availableFields.includes(field.toLowerCase())
          );
          
          setSelectedFields(initialSelectedFields);
          setCurrentStep('select-fields');
          setLoading(false);
          return;
        } else {
          console.warn(`⚠️ No matching data found in SQL View for ItemKey=${row.itemKey}, CustKey=${row.custKey}`);
          setDataError(`No data found for ItemKey=${row.itemKey}, CustKey=${row.custKey}`);
        }
      }
    } catch (error: any) {
      console.error('Error fetching batch details:', error);
      setDataError(`Unable to load details: ${error.message}`);
      setBatchDetails(null);
    } finally {
      setLoading(false);
    }
  };

  // Convert batch details to table format
  const tableData: BatchFieldData[] = useMemo(() => {
    if (!batchDetails) return [];
    
    // List of fields to hide
    const hiddenFields = [
      'ItemKeyResolved',
      'CustKeyResolved',
      'LABEL_COLOR',
      'BME_Product',
      'DESCRIPTION',
      'LOT CODE',
      'BEST BEFORE',
      'LABEL INSTRUCTION',
      'HALALLOGO',
      'STANDARD_LABEL', 
      'SPECIAL_LABEL',
      'CUSTOMER_LABEL',
      'QSRFORMAT',
      'FOODADDITIVE',
      'CHECKBY',
      'INNER_PATH',
      'OUTER_PATH',
      'FormulaID',
      'Assembly_Location',
      'AssemblyType',
      'Content',
      'FillMeasuredIN',
      'TemplateID',
      'TemplateName',
      'TemplateUpdatedAt',
      'Engine',
      'PaperSize',
      'FillUOM',
      'BOMUOM',
      'AssemblyType',
      'UpdatedAt',
      'ContentBinary',
      'contentBinary',
      'SHIPTO_COUNTRY',
      'ShipToCountry',
      'shipToCountry',
      'LotCodeCaption',
      'FillLevel','BL_Product','BestBeforeCaption'
    ];
    
    return Object.entries(batchDetails)
      .filter(([key, value]) => {
        // Filter out null values and hidden fields
        return value !== null && 
               value !== undefined && 
               !hiddenFields.includes(key) &&
               !hiddenFields.includes(key.replace(/^_/, '')); // Also check without leading underscore
      })
      .map(([key, value]) => ({
        key,
        field: key,
        value: value,
      }));
  }, [batchDetails]);

  // Filter data based on search text
  const filteredData = useMemo(() => {
    if (!searchText) return tableData;
    
    const lowerSearchText = searchText.toLowerCase();
    return tableData.filter(
      item => 
        item.field.toLowerCase().includes(lowerSearchText) || 
        (typeof item.value === 'string' && item.value.toLowerCase().includes(lowerSearchText))
    );
  }, [tableData, searchText]);

  // Handle field selection/deselection
  const handleSelectField = (field: string, checked: boolean) => {
    if (checked) {
      setSelectedFields(prev => [...prev, field]);
    } else {
      setSelectedFields(prev => prev.filter(f => f !== field));
    }
  };

  // Create elements from selected fields
  const createElementsFromSelectedFields = () => {
    if (!batchDetails || selectedFields.length === 0) return [];
    
    const elements: ElementType[] = [];
    
    // ระยะห่างจากขอบ canvas
    const canvasPadding = 20;
    
    // กำหนดจำนวนคอลัมน์ตามจำนวนข้อมูลที่เลือก
    let numColumns = 1; // เริ่มต้นที่ 1 คอลัมน์
    
    // ถ้ามี fields เยอะกว่า 12 รายการ ให้แบ่งเป็น 2 คอลัมน์
    if (selectedFields.length > 12) {
      numColumns = 2;
    }
    // ถ้ามีมากกว่า 24 รายการ ให้แบ่งเป็น 3 คอลัมน์
    if (selectedFields.length > 24) {
      numColumns = 3;
    }
    
    // ความกว้างของแต่ละคอลัมน์จะขึ้นอยู่กับจำนวนคอลัมน์ที่ต้องการแสดง
    // โดยขนาดของ canvas จะถูกกำหนดจาก TemplateSettingsModal
    // ขนาดคอลัมน์พื้นฐานตามจำนวนคอลัมน์
    const usableWidth = 360; // พื้นที่ใช้งานได้โดยประมาณสำหรับ canvas 400x400 (หลังจากหักระยะห่างขอบ)
    const columnGap = 20; // ระยะห่างระหว่างคอลัมน์
    
    // คำนวณความกว้างของแต่ละคอลัมน์ตามจำนวนคอลัมน์
    const totalGapWidth = (numColumns - 1) * columnGap;
    const columnWidth = Math.max(120, Math.floor((usableWidth - totalGapWidth) / numColumns));
    
    // ความสูงพื้นฐานของแต่ละแถว
    const baseRowHeight = 25;
    
    // ระยะห่างระหว่างแถว
    const rowGap = 5;
    
    // จัดสรรจำนวนรายการต่อคอลัมน์
    const fieldsPerColumn = Math.ceil(selectedFields.length / numColumns);
    
    // เตรียมคอลัมน์
    const columns = Array.from({ length: numColumns }, () => []);
    
    // แบ่งฟิลด์ลงในแต่ละคอลัมน์
    selectedFields.forEach((field, index) => {
      const columnIndex = Math.floor(index / fieldsPerColumn);
      columns[columnIndex].push(field);
    });
    
    // คำนวณฟอนต์ไซส์ที่เหมาะสมตามความกว้างของคอลัมน์
    const calculateFontSize = (text: string, availableWidth: number): number => {
      if (!text) return 14; // ค่าเริ่มต้น
      
      // คำนวณตามความยาวของข้อความ
      const baseSize = 14; // ฟอนต์ไซส์ต้นแบบ
      const avgCharWidth = 7; // ค่าเฉลี่ยความกว้างของตัวอักษรใน px
      
      // คำนวณความยาวโดยประมาณของข้อความในหน่วย px
      const estimatedTextWidth = text.length * avgCharWidth;
      
      if (estimatedTextWidth <= availableWidth * 0.85) {
        // ข้อความสั้นพอที่จะใช้ฟอนต์ไซส์มาตรฐาน
        return baseSize;
      } else {
        // ข้อความยาวเกินไป ต้องลดขนาดฟอนต์
        // คำนวณสัดส่วนความยาวต่อพื้นที่และปรับฟอนต์ไซส์
        const ratio = (availableWidth * 0.85) / estimatedTextWidth;
        // ลดฟอนต์ไซส์ตามสัดส่วน แต่ไม่น้อยกว่า 10px
        return Math.max(10, Math.floor(baseSize * ratio));
      }
    };
    
    // วนลูปสร้างองค์ประกอบสำหรับแต่ละคอลัมน์
    columns.forEach((columnFields, columnIndex) => {
      columnFields.forEach((field, rowIndex) => {
        const value = batchDetails[field];
        if (value === null || value === undefined) return;
        
        // แปลงค่าเป็นข้อความ
        let textValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        
        // กำหนดข้อความที่จะแสดง - เฉพาะค่า ไม่ต้องมีชื่อ field
        const displayText = textValue;
        
        // คำนวณตำแหน่ง X ของแต่ละคอลัมน์
        const posX = canvasPadding + (columnIndex * (columnWidth + columnGap));
        
        // คำนวณความกว้างสูงสุดที่มีได้ในคอลัมน์นี้
        const maxTextWidth = columnWidth - 10; // เผื่อระยะห่างเล็กน้อย
        
        // คำนวณความกว้างตามข้อความ (ไม่เกินความกว้างของคอลัมน์)
        const textWidth = Math.min(maxTextWidth, Math.max(100, displayText.length * 7));
        
        // คำนวณฟอนต์ไซส์ที่เหมาะสม
        const fontSize = calculateFontSize(displayText, maxTextWidth);
        
        // คำนวณความสูงของกล่องข้อความตามฟอนต์ไซส์
        const textHeight = Math.max(baseRowHeight, fontSize * 1.2);
        
        // คำนวณตำแหน่ง Y
        const posY = canvasPadding + rowIndex * (textHeight + rowGap);
        
        // สร้าง text element
        elements.push({
          id: uuidv4(),
          type: 'text',
          x: posX,
          y: posY,
          width: textWidth,
          height: textHeight,
          text: displayText,
          fontSize: fontSize,
          fontFamily: 'Arial',
          fill: '#000000',
          align: 'left',
          draggable: true,
          visible: true
        } as TextElement);
      });
    });
    
    return elements;
  };

  // Handler for confirming field selection
  const handleConfirm = () => {
    if (!batchDetails || selectedFields.length === 0) {
      message.error('กรุณาเลือกข้อมูลที่ต้องการนำไปใช้');
      return;
    }
    
    const newElements = createElementsFromSelectedFields();
    if (newElements.length > 0) {
      // เก็บประวัติการใช้แบตช์
      const historyItem = {
        batchNo: batchNo,
        timestamp: Date.now()
      };
      
      // อัพเดตประวัติโดยเพิ่มแบตช์ปัจจุบันไว้ด้านบนสุด
      const newHistory = [
        historyItem,
        ...batchHistory.filter(item => item.batchNo !== batchNo).slice(0, 9) // เก็บประวัติ 10 รายการล่าสุด
      ];
      
      // บันทึกลงใน localStorage
      localStorage.setItem(BATCH_HISTORY_KEY, JSON.stringify(newHistory));
      
      // ส่งข้อมูลกลับไปยัง parent component
      onConfirm(newElements, selectedBatchRow);
    } else {
      message.error('ไม่สามารถสร้าง elements ได้ กรุณาลองอีกครั้ง');
    }
  };

  // Handle select all fields
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedFields(filteredData.map(item => item.field));
    } else {
      setSelectedFields([]);
    }
  };

  // Select a batch row
  const handleSelectBatchRow = (row: BatchRow) => {
    setSelectedBatchRow(row);
    fetchBatchDetails(row);
  };

  // Columns for the field selection table
  const fieldColumns = [
    {
      title: (
        <Checkbox
          checked={filteredData.length > 0 && selectedFields.length === filteredData.length}
          indeterminate={selectedFields.length > 0 && selectedFields.length < filteredData.length}
          onChange={(e) => handleSelectAll(e.target.checked)}
        >
          Select All
        </Checkbox>
      ),
      dataIndex: 'field',
      key: 'field',
      width: '40%',
      render: (text: string, record: BatchFieldData) => (
        <Checkbox
          checked={selectedFields.includes(record.field)}
          onChange={(e) => handleSelectField(record.field, e.target.checked)}
        >
          {text}
        </Checkbox>
      ),
      sorter: (a: BatchFieldData, b: BatchFieldData) => a.field.localeCompare(b.field),
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      width: '60%',
      render: (text: any) => {
        if (text === null || text === undefined) return <Text type="secondary">null</Text>;
        
        // Display value according to data type
        if (typeof text === 'boolean') return text ? 'true' : 'false';
        if (typeof text === 'object') return JSON.stringify(text);
        
        return text;
      },
    },
  ];

  // Columns for the batch row selection table
  const batchRowColumns = [
    { title: 'Batch No',   dataIndex: 'batchNo', key: 'batchNo' },
    { title: 'Product',    dataIndex: 'product', key: 'product',
      render: (_:any,r:BatchRow)=>r.product||r.productName||`Product #${r.itemKey}` },
    { title: 'Item Key',   dataIndex: 'itemKey', key: 'itemKey', 
      render: (t:string|null) => t || '-' },
    { title: 'Cust Key',   dataIndex: 'custKey', key: 'custKey', 
      render: (t:string|null) => t || '-' },
    { title: 'Ship To Country', dataIndex: 'shipToCountry', key: 'shipToCountry',
      render: (text: string | null, record: BatchRow) => {
        // เพิ่มการ log ที่ละเอียดขึ้นเพื่อตรวจสอบค่าที่จะแสดงในคอลัมน์
        if (process.env.NODE_ENV === 'development') {
          console.log(`🌎 Rendering Ship To Country for record:`, {
            custKey: record.custKey,
            shipToCountry: text,
            recordData: record
          });
        }
        
        // รวมลอจิกการแสดงผลไว้ในที่เดียว
        const displayValue = text || '-';
        
        // ให้มีการ highlight ถ้าไม่มีค่า
        return displayValue === '-' 
          ? <Text type="danger" strong>{displayValue}</Text> 
          : <Text>{displayValue}</Text>;
      }
    },
    { title: 'Total Bags', dataIndex: 'totalBags', key: 'totalBags',
      render: (t:any) => t || '-' },
    { title: 'Action', key: 'action',
      render: (_:any, r:BatchRow) => (
        <Button type="primary" size="small"
                onClick={()=>handleSelectBatchRow(r)}
                disabled={selectedBatchRow?.id===r.id}>
          {selectedBatchRow?.id===r.id ? 'Selected' : 'Select'}
        </Button>
      )
    },
  ];

  // Go back to batch row selection
  const handleGoBack = () => {
    // Reset batch details และ selected fields เมื่อกลับไปหน้าเลือก row
    setBatchDetails(null);
    setSelectedFields([]);
    setSelectedBatchRow(null);
    
    // กลับไปยังขั้นตอนการเลือก row
    setCurrentStep('select-row');
  };

  // เพิ่มฟังก์ชันสำหรับเลือกแบตช์จากประวัติ
  const selectBatchFromHistory = (historyItem: BatchHistory) => {
    if (historyItem && historyItem.batchNo) {
      // เรียกใช้ฟังก์ชัน selectBatchWithinModal โดยตรง
      selectBatchWithinModal(historyItem.batchNo);
    }
  };

  // เพิ่มฟังก์ชันสำหรับเลือกแบตช์ภายใน modal
  const selectBatchWithinModal = (selectedBatchNo: string) => {
    // ตรวจสอบว่า selectedBatchNo ถูกต้องหรือไม่
    if (!selectedBatchNo || selectedBatchNo.trim() === '') {
      console.error('Please provide a valid batch number');
      return;
    }

    /* 1️⃣  tell parent immediately
       – trim() to be safe, queue in next tick so parent render happens
         before we start our own loading spinner                 */
    setTimeout(() => onBatchChange?.(selectedBatchNo.trim()), 0);

    /* 2️⃣  ignore the second click that List.Item fires */
    if (loading) return;          // debounce double-fire on Button + Item
    setLoading(true);

    // ล้างข้อมูลเดิมและล้างข้อความแจ้งเตือน error ทันที
    setBatchDataRows([]);
    setBatchDetails(null);
    setSelectedBatchRow(null);
    setDataError(null);
    
    // บันทึกประวัติการใช้แบตช์
    saveBatchHistory(selectedBatchNo);
    
    // แสดง tab "Current Batch" ทันที
    setTimeout(() => {
      const tabsElement = document.querySelector('.ant-tabs-nav');
      if (tabsElement) {
        const currentBatchTab = tabsElement.querySelector('.ant-tabs-tab:first-child');
        if (currentBatchTab) {
          (currentBatchTab as HTMLElement).click();
        }
      }
      
      // ดึงข้อมูลจาก API หลังจากเปลี่ยน tab
      const token = localStorage.getItem('token');
      if (!token) {
        setDataError('Please login before using this feature');
        setLoading(false);
        return;
      }
      
      // สร้าง URL สำหรับดึงข้อมูลจาก View SQL โดยตรง
      const apiUrl = `${apiBaseUrl}/batches/sqlview?batchNo=${selectedBatchNo}`;
      
      // ดึงข้อมูลจาก API
      fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (!data || (Array.isArray(data) && data.length === 0)) {
          throw new Error(`No data found for batch ${selectedBatchNo}`);
        }
        
        console.log(`🌟 Successfully fetched data for batch ${selectedBatchNo}`);
        
        // เก็บข้อมูลดิบจาก SQL View
        setRawSqlViewData(Array.isArray(data) ? data : [data]);
        setUseDirectViewData(true);
        
        // แปลงข้อมูลดิบเป็นรูปแบบที่ใช้ในแอพลิเคชัน
        const batchRows: BatchRow[] = (Array.isArray(data) ? data : [data]).map((item, index) => {
          const itemKeyValue = item.ItemKey || item.itemKey || item.ITEMKEY || item.itemKeyResolved;
          const custKeyValue = item.CustKey || item.custKey || item.CUSTKEY || item.custKeyResolved;
          const productValue = item.Product || item.product || item.BME_Product || item.PRODUCT || 'Unknown';
          const totalBagsValue = item.TotalBags || item.totalBags || item.TOTALBAGS || null;
          const shipToCountry = item.SHIPTO_COUNTRY || item.ShipToCountry || item.shipToCountry || '';
          
          return {
            id: `${selectedBatchNo}-${itemKeyValue || index}-${custKeyValue || ''}`,
            batchNo: selectedBatchNo,
            itemKey: itemKeyValue || null,
            custKey: custKeyValue || null,
            productName: productValue,
            product: productValue,
            totalBags: totalBagsValue ? parseInt(totalBagsValue, 10) : 0,
            shipToCountry: shipToCountry || null,
          };
        });
        
        setBatchDataRows(batchRows);
      })
      .catch(error => {
        console.error('Error fetching data:', error);
        setDataError(`Unable to load data: ${error.message}`);
      })
      .finally(() => {
        setLoading(false);
      });
    }, 100); // หน่วงเวลา 100ms เพื่อให้มีเวลาอัปเดต UI
  };

  // เพิ่มฟังก์ชันสำหรับเวลากด Enter ในตาราง
  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  // Determine the modal title based on current step
  const modalTitle = currentStep === 'select-row' 
    ? `Select Batch Data - ${batchNo}` 
    : `Select Fields for Batch ${batchNo}`;

  // Determine the modal footer based on current step
  const modalFooter = currentStep === 'select-row' 
    ? [
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>
      ]
    : [
        <Button key="back" onClick={handleGoBack}>
          Back
        </Button>,
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          onClick={handleConfirm}
          disabled={selectedFields.length === 0 || !batchDetails}
          loading={loading}
        >
          Create Elements ({selectedFields.length})
        </Button>,
      ];

  return (
    <Modal
      title={modalTitle}
      open={visible}
      onCancel={onCancel}
      width={900}
      footer={modalFooter}
    >
      {dataError ? (
        <Alert
          message="Unable to load data"
          description={dataError}
          type="error"
          showIcon
        />
      ) : loading && !batchDetails && !batchDataRows.length ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin spinning={true}>
            <div style={{ padding: '30px 0' }}>Loading batch data...</div>
          </Spin>
        </div>
      ) : currentStep === 'select-row' ? (
        <>
          <Tabs defaultActiveKey={batchNo && batchNo.trim() !== '' ? "current" : "history"}>
            <TabPane tab="Current Batch" key="current">
              <Alert
                message="Select a batch row"
                description="Please select a batch row to view its data fields."
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              
              {batchDataRows.length === 0 ? (
                batchNo && batchNo.trim() !== '' && !loading ? (
                  <Alert
                    message="No batch data found"
                    description={`No data was found for batch number "${batchNo}". Please verify the batch number and try again.`}
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                ) : (
                  !loading && (
                    <Alert
                      message="No batch number entered"
                      description="Please enter a valid batch number or select one from the recent batches history."
                      type="info"
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                  )
                )
              ) : (
                <Table
                  columns={batchRowColumns}
                  dataSource={batchDataRows}
                  rowKey="id"
                  pagination={{ pageSize: 5 }}
                  size="middle"
                  loading={loading}
                  locale={{
                    emptyText: (
                      <div style={{ padding: '20px 0' }}>
                        <p>No batch data found. Please check the batch number and try again.</p>
                      </div>
                    )
                  }}
                />
              )}
            </TabPane>
            <TabPane tab={<><HistoryOutlined /> Recent Batches</>} key="history">
              {batchHistory.length === 0 ? (
                <Alert
                  message="No batch history"
                  description="You haven't used any batches yet."
                  type="info"
                  showIcon
                />
              ) : (
                <List
                  itemLayout="horizontal"
                  dataSource={batchHistory}
                  renderItem={item => (
                    <List.Item
                      actions={[
                        <Button 
                          type="link" 
                          onClick={() => selectBatchWithinModal(item.batchNo)}
                        >
                          Select
                        </Button>
                      ]}
                      onClick={() => selectBatchWithinModal(item.batchNo)}
                      style={{ cursor: 'pointer' }}
                    >
                      <List.Item.Meta
                        title={item.batchNo}
                        description={`Last used: ${new Date(item.timestamp).toLocaleString()}`}
                      />
                    </List.Item>
                  )}
                />
              )}
            </TabPane>
          </Tabs>
        </>
      ) : (
        <>
          <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
            <Input
              placeholder="Search field name or value"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              ref={searchInputRef}
              allowClear
            />
            
            <Collapse ghost>
              <Panel 
                header={
                  <Space>
                    <InfoCircleOutlined />
                    <Text strong>Usage Instructions</Text>
                  </Space>
                } 
                key="1"
              >
                <ol>
                  <li>Select data fields by checking the boxes</li>
                  <li>Search for fields by typing in the search box</li>
                  <li>Press Enter to quickly add the first matching field</li>
                  <li>Only fields with non-null values are shown</li>
                  <li>Click "Create Elements" to add selected fields to the canvas</li>
                </ol>
              </Panel>
            </Collapse>
          </Space>
          
          <Table
            columns={fieldColumns}
            dataSource={filteredData}
            rowKey="field"
            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'] }}
            size="middle"
            loading={loading}
            scroll={{ y: 500 }}
            onRow={(record) => ({
              onKeyDown: handleTableKeyDown,
            })}
          />
          
          {selectedBatchRow && (
            <div style={{ marginTop: 16 }}>
              <Text strong>
                Selected: Batch {selectedBatchRow.batchNo} - Item Key: {selectedBatchRow.itemKey || '-'}, Cust Key: {selectedBatchRow.custKey || '-'}, Product: {selectedBatchRow.product || selectedBatchRow.productName || '-'}
              </Text>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export default BatchDataSelectionModal; 