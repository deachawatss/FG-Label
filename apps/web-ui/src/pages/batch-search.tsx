import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Button,
  Table,
  Input,
  Space,
  message,
  Modal,
  Spin,
  InputNumber,
  Tooltip,
  Empty,
  Card,
  Layout,
  Typography,
  Row,
  Col,
  Image,
  Divider,
  Checkbox,
  Select,
  DatePicker,
  List,
  Popover,
  Tabs,
  Form,
  Switch,
  Radio,
  Descriptions,
  Drawer,
  Alert,
  Badge,
  Dropdown,
  Avatar
} from 'antd';
import type { MenuProps } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  PrinterOutlined,
  EditOutlined,
  BarcodeOutlined,
  SyncOutlined,
  FileOutlined,
  SettingOutlined,
  QrcodeOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  CloseCircleOutlined,
  UserOutlined,
  LogoutOutlined,
  HistoryOutlined,
  FileTextOutlined,
  PlusOutlined,
  DownOutlined,
  ScanOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import RequireAuth from '../components/RequireAuth';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'next/router';

const { Content } = Layout;
const { Title, Text } = Typography;

// เพิ่มประกาศตัวแปร isClient ที่ด้านบนสุดของไฟล์
const isClient = typeof window !== 'undefined';

// แก้ไขประกาศ JsBarcode จาก import เป็น let
let JsBarcode: any;
if (isClient) {
  try {
    JsBarcode = require('jsbarcode');
  } catch (e) {
    // JsBarcode จะถูกโหลดแบบไดนามิกในภายหลัง
  }
}

// เพิ่ม interface เพื่อขยาย Window interface
declare global {
  interface Window {
    QRCode: any;
    renderAllBarcodes?: () => void;
    handleQrCodeScanned?: (data: string) => void;
    JsBarcode?: any;
  }
}

// เพิ่ม interface Options สำหรับ JsBarcode ที่มี fontFamily
interface BarcodeOptions {
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  text?: string;
  fontOptions?: string;
  font?: string;
  fontFamily?: string;
  textAlign?: string;
  textPosition?: string;
  textMargin?: number;
  fontSize?: number;
  background?: string;
  lineColor?: string;
  margin?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
}

/* ------------------------------------------------------------------------ */
/* Utility Functions                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Helper class for date operations
 */
class DateHelper {
  /**
   * Format date to display format (06 May 2025)
   */
  static formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      
      // รูปแบบ "06 May 2025"
      const day = date.getDate().toString().padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      
      return `${day} ${month} ${year}`;
  } catch (e) {
      console.error('Error formatting date:', e);
      return dateStr;
    }
  }

  /**
   * Format UTC string to local date string (Asia/Bangkok)
   */
  static formatDateTime(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  try {
    const d = new Date(typeof date === 'string' && date.endsWith('Z') ? date : `${date}Z`);
    return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok' });
  } catch (error) {
    console.error('Error formatting date:', error);
    return null;
  }
}

  /**
   * Calculate best before date based on production date and shelf life
   */
  static calculateBestBefore(
  productionDate: string | Date | null, 
  shelfLifeDays?: number | null,
  daysToExpire?: number | null
): string {
  if (!productionDate) return '';
  
  const prod = dayjs(productionDate);
  if (!prod.isValid()) return '';
  
  const shelf = Number(shelfLifeDays) || 0;     // ถ้า NaN -> 0
  const expire = Number(daysToExpire) || 0;     // ถ้า NaN -> 0
  
  // business-rule
  // 1) ถ้ามี shelfLifeDays (>0) ใช้อันนี้
  // 2) ถ้าไม่มีและ daysToExpire (>0) ใช้ daysToExpire
  // 3) ถ้าไม่มีอะไรเลย default = 30
  const plusDays =
    shelf > 0 ? shelf :
    expire > 0 ? expire :
    30;
  
  // คำนวณวันที่แล้วแปลงเป็นรูปแบบ ISO
  const resultDate = prod.add(plusDays, 'day');
  const isoDate = resultDate.format('YYYY-MM-DD');
  
  // ใช้ฟังก์ชัน formatDate เพื่อแปลงเป็นรูปแบบ "02 Nov 2025"
  return DateHelper.formatDate(isoDate);
}
}

/**
 * Helper class for API operations
 */
class ApiHelper {
  /**
   * Get base API URL
   */
  static getApiBaseUrl(): string {
    let baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5051';
    
    // ตรวจสอบว่า baseUrl มี /api อยู่แล้วหรือไม่
    if (baseUrl.endsWith('/api')) {
      baseUrl = baseUrl.slice(0, -4); // ตัด /api ออก
    }
    
    return `${baseUrl}/api`;
  }

  /**
   * Get headers with authorization
   */
  static getAuthHeaders(): Record<string, string> {
    // Get token from localStorage
    const token = isClient ? localStorage.getItem('token') : null;
    
    // Setup headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add token if available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }

  /**
   * Look up template by product key and customer key with label type
   */
  static async lookupTemplate(
    productKey: string,
    customerKey = '',
    labelType: 'Standard' | 'Special' = 'Standard',
    shipToCountry = ''
  ): Promise<any> {
    try {
      // สร้าง URL สำหรับค้นหา template
      const apiUrl = `${ApiHelper.getApiBaseUrl()}/templates/lookup?productKey=${encodeURIComponent(productKey)}${customerKey ? `&customerKey=${encodeURIComponent(customerKey)}` : ''}&labelType=${labelType}${shipToCountry ? `&shipToCountry=${encodeURIComponent(shipToCountry)}` : ''}`;
      console.log(`Looking up template (${labelType}) by product and customer:`, apiUrl);
      
      const headers = ApiHelper.getAuthHeaders();
      const response = await axios.get(apiUrl, { headers });
      
      // ถ้าพบ templateId ให้โหลด template ข้อมูลเต็ม
      if (response.data && response.data.templateID) {
        console.log(`Found ${labelType} template ID:`, response.data.templateID);
        
        // โหลดข้อมูล template เต็มรูปแบบ
        const templateUrl = `${ApiHelper.getApiBaseUrl()}/templates/${response.data.templateID}`;
        const templateResponse = await axios.get(templateUrl, { headers });
        return templateResponse.data;
      }
      
      return null;
    } catch (error) {
      // ถ้าไม่พบ (404) หรือ parameter ไม่ถูกต้อง (400) ถือว่าเป็นเรื่องปกติ ไม่ถือเป็นข้อผิดพลาด
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404 || error.response?.status === 400) {
          console.log(`No ${labelType} template found for this product/customer combination or invalid parameters`);
          return null;
        }
      }
      
      console.error(`Error looking up ${labelType} template:`, error);
      return null;
    }
  }
}

/**
 * Helper class for template operations
 */
class TemplateHelper {
  /**
   * Parse template content safely
   */
  static safeParseContent(template: any): any {
    if (!template) return null;
    
    try {
      // ถ้ามี content ในรูปแบบ string ให้แปลงเป็น object
      if (template.content && typeof template.content === 'string') {
        const contentObj = JSON.parse(template.content);
        return {
          ...template,
          canvasSize: contentObj.canvasSize || { width: 400, height: 400 },
          elements: contentObj.elements || []
        };
      }
      // ถ้าไม่มี content หรือเป็น object อยู่แล้ว ให้ใช้ค่าเดิม
      return template;
    } catch (e) {
      console.error('Error parsing template content:', e);
      return {
        ...template,
        canvasSize: { width: 400, height: 400 },
        elements: []
      };
    }
  }

  /**
   * Extract dimensions from template
   */
  static getTemplateDimensions(template: any): { width: number, height: number } {
    try {
      let contentObj: any;
      
      if (template.content && typeof template.content === 'string') {
        contentObj = JSON.parse(template.content);
      } else {
        contentObj = template.content || {};
      }
      
      return {
        width: contentObj.canvasSize?.width || 400,
        height: contentObj.canvasSize?.height || 400
      };
    } catch (error) {
      console.error('Error extracting template dimensions:', error);
      return { width: 400, height: 400 };
    }
  }
}

// Check if batch number has valid format
function isValidBatchNumber(batchNo: string): boolean {
  // Check that batch number doesn't contain dots or special characters
  return /^[A-Za-z0-9]+$/.test(batchNo);
}

/* ------------------------------------------------------------------------ */
/* 1) Define Batch Object Interface                                         */
/* ------------------------------------------------------------------------ */
interface Batch {
  id: string;
  batchNo: string;
  productKey: string;
  productName: string;
  lineCode: string;
  processCell: string;
  netWeight: string;
  allergensLabel: string;
  storageCondition: string;
  lotCode: string;
  lotDate: string;
  bestBeforeDate: string;
  soNumber: string;
  refNo: string;
  prodOrderNo: string;
  productionDate: string;
  expiryDate: string;
  shelfLifeDays: number;
  palletNo: string;
  bagNo: string;
  bagSequence: number;
  bagPosition: string;
  printCount: number;
  printDate: string;
  totalBags?: number;
  daysToExpire?: number;
  // เพิ่มฟิลด์เพื่อรองรับข้อมูลจาก view FgL.vw_Label_PrintSummary
  expiryDateCaption: string;
  manufacturerInfo: string;
  batchWithPallet: string;
  allergenOverride: string;
  countryOfOrigin: string;
  itemKey: string;
  custKey: string;
  templateId?: number;
  templateName?: string; // เพิ่มฟิลด์สำหรับชื่อเทมเพลต
  templateUpdatedAt?: string; // เพิ่มฟิลด์สำหรับวันที่อัปเดตเทมเพลตล่าสุด
  templateVersion?: number; // เพิ่มฟิลด์สำหรับเวอร์ชันเทมเพลต
  allergen1: string; // เพิ่มเพื่อแก้ไขข้อผิดพลาด linter
}

/* ------------------------------------------------------------------------ */
/* 1) Helper – extract batch object (case‑insensitive)                      */
/* ------------------------------------------------------------------------ */
const extractBatchData = (record: any): Batch => {
  const uniqueId = uuidv4();
  
  // Helper สำหรับดึงค่าจาก record โดยไม่ error ถ้าไม่มีค่า
  const getRecordValue = (key: string): string => {
    try {
      // ถ้า key เป็นแบบ case-insensitive ให้ค้นหาใน record
      const exactKey = key;
      const lowerKey = key.toLowerCase();
      
      // หาค่าจาก key ที่มีอยู่จริง ถ้าไม่มี ให้ค้นหาแบบไม่สนใจตัวพิมพ์ใหญ่เล็ก
      const recordKey = Object.keys(record).find(k => 
        k === exactKey || k.toLowerCase() === lowerKey
      );
      
      if (recordKey !== undefined && record[recordKey] !== undefined) {
        return record[recordKey];
      }
      
      return '';
    } catch (e) {
      return '';
    }
  };

  // Batch Number และข้อมูลสินค้า
  const batchNo = getRecordValue('batchNo') || getRecordValue('BatchNo') || uniqueId.substring(0, 8);
  const productKey = getRecordValue('productKey') || getRecordValue('materialNo') || getRecordValue('ItemKey') || '';
  
  // ใช้ Product จาก view แทน DESCRIPTION
  const productName = getRecordValue('Product') || getRecordValue('productName') || getRecordValue('materialDesc') || getRecordValue('DESCRIPTION') || getRecordValue('desc') || '';
  
  // Production Date และ Expiry Date
  const productionDate = getRecordValue('productionDate') || getRecordValue('ProductionDate') || '';
  let expiryDate = getRecordValue('bestBeforeDate') || getRecordValue('BEST BEFORE') || '';
  let bestBeforeDate = '';
  
  // คำนวณ Best Before Date ถ้าไม่มีข้อมูล
  if (!expiryDate && productionDate) {
    try {
      // ใช้ DateHelper.calculateBestBefore แทนการคำนวณแบบเดิม
      const shelfLifeRaw = getRecordValue('SHELFLIFE_DAY') || getRecordValue('shelfLifeDays');
      const shelfLifeDays = Number.isFinite(Number(shelfLifeRaw)) ? parseInt(shelfLifeRaw, 10) : 0;
      const daysToExpire = Number(getRecordValue('DaysToExpire')) || 0;

      const bestBefore = DateHelper.calculateBestBefore(productionDate, shelfLifeDays, daysToExpire);
      
      // กำหนดค่า bestBeforeDate ที่ได้จากการคำนวณ
      bestBeforeDate = bestBefore;
      
      // แปลงจากรูปแบบ DD/MM/YY เป็น YYYY-MM-DD สำหรับเก็บในตัวแปร expiryDate ถ้าจำเป็น
      if (bestBefore) {
        try {
          // แปลงจากรูปแบบ "02 Nov 2025" เป็น "YYYY-MM-DD"
          const dateObj = new Date(bestBefore);
          if (!isNaN(dateObj.getTime())) {
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            expiryDate = `${year}-${month}-${day}`;
          }
        } catch (e) {
          console.error('Error converting date format:', e);
        }
      }
      
      console.log('Calculated expiry date:', expiryDate);
      console.log('Calculated best before date:', bestBeforeDate);
    } catch (e) {
      console.error('Error calculating expiry date:', e);
    }
  } else {
    // ใช้ฟังก์ชัน formatDate เพื่อรูปแบบวันที่ที่ถูกต้อง "06 May 2025" (เฉพาะกรณีที่มีค่า expiryDate อยู่แล้ว)
    bestBeforeDate = DateHelper.formatDate(getRecordValue('bestBeforeDate') || expiryDate || getRecordValue('BEST BEFORE'));
  }
  
  // ใช้ฟังก์ชัน formatDate เพื่อรูปแบบวันที่ที่ถูกต้อง "06 May 2025"
  const lotDate = DateHelper.formatDate(getRecordValue('lotDate') || getRecordValue('LOT CODE') || productionDate);
  
  // Lot code (จากตัวอย่างในรูป 843308)
  let lotCode = getRecordValue('lotCode') || getRecordValue('LOT CODE') || '';
  if (!lotCode) {
    // สร้าง lotCode จาก productionDate ถ้าไม่มีค่า
    if (productionDate) {
      const date = new Date(productionDate);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const sequential = '0001';
        lotCode = `${year}${month}${day}${sequential}`;
      }
    }
  }
  
  // ตรวจสอบและแก้ไขรูปแบบของ Line code (P01B01)
  let lineCode = getRecordValue('lineCode') || 'P01B01';
  // ถ้ามีรูปแบบ PxxBx ให้แก้ไขเป็น PxxBxx โดยเพิ่ม 0 ถ้าตัวเลขหลัง B น้อยกว่า 10
  if (lineCode && lineCode.match(/P\d{2}B\d{1,}/)) {
    const match = lineCode.match(/P(\d{2})B(\d{1,})/);
    if (match && match.length === 3) {
      const palletNo = match[1];
      const bagNo = parseInt(match[2], 10);
      
      // ถ้าเลขน้อยกว่า 10 ให้เติม 0 ข้างหน้า
      if (bagNo < 10) {
        lineCode = `P${palletNo}B0${bagNo}`;
      }
      // ถ้าเลขมากกว่า 99 ไม่ต้องเติม 0
      else if (bagNo >= 10 && bagNo < 100) {
        lineCode = `P${palletNo}B${bagNo.toString().padStart(2, '0')}`;
      }
    }
  }
  
  // ประกาศตัวแปรที่ขาดหายไป
  const processCell = getRecordValue('processCell') || getRecordValue('processCellCode') || '1B';
  
  // ตรวจสอบรูปแบบของ Net Weight ให้มีทศนิยม 2 ตำแหน่ง
  let netWeight = getRecordValue('netWeight') || getRecordValue('NET_WEIGHT1') || '25.00';
  if (netWeight && !isNaN(parseFloat(netWeight))) {
    netWeight = parseFloat(netWeight).toFixed(2);
  }
  
  const allergen1 = getRecordValue('allergen1') || getRecordValue('ALLERGEN1') || 'Gluten (Wheat)';
  const storageCondition = getRecordValue('storageCondition') || getRecordValue('STORECAP1') || getRecordValue('storageCond') || 'Store under dry cool condition';
  const soNumber = getRecordValue('soNumber') || getRecordValue('SO Number') || 'S2508217';
  const refNo = getRecordValue('refNo') || '';
  const prodOrderNo = getRecordValue('prodOrderNo') || '';
  const palletNo = getRecordValue('palletNo') || '';
  const bagNo = getRecordValue('bagNo') || '';
  
  // ข้อมูลผู้ผลิต
  const manuCap1 = getRecordValue('MANUCAP1') || 'Newly Weds Foods (Thailand) Limited';
  const manuCap2 = getRecordValue('MANUCAP2') || '909 Moo 15, Teparak Road, T.Bangsaothong, A.Bangsaothong, Samutprakarn 10570';
  const manuCap3 = getRecordValue('MANUCAP3') || 'Thailand Phone (662) 3159000 Fax (662) 3131638-9';
  const manufacturerInfo = [manuCap1, manuCap2, manuCap3].filter(Boolean).join('\n');
  
  // ข้อมูลเพิ่มเติม
  const expiryDateCaption = getRecordValue('EXPIRYDATECAP') || 'BEST BEFORE';
  const countryOfOrigin = getRecordValue('SHIPTO_COUNTRY') || getRecordValue('ShipToCountry') || getRecordValue('shipToCountry') || getRecordValue('COUNTRYOFORIGIN') || '';
  const totalBags = parseInt(getRecordValue('TotalBags') || '1', 10);
  
  // ตรวจสอบและแก้ไขค่า allergensLabel เพื่อไม่ให้เกิด "Allergens : Allergens :" ซ้ำกัน
  let allergensLabel = allergen1;
  if (allergensLabel.startsWith('Allergens :')) {
    // หากมีคำว่า "Allergens :" นำหน้าอยู่แล้ว ให้คงค่าไว้ตามเดิม
    allergensLabel = allergen1;
  } else if (allergensLabel.includes('Gluten')) {
    // หากไม่มีคำนำหน้า แต่เป็นค่าอัลเลอร์เจนปกติ ให้คงค่าไว้ตามเดิม
    allergensLabel = allergen1;
  }
  
  return {
    id: uniqueId,
    batchNo,
    productKey,
    productName,
    lineCode,
    processCell,
    netWeight,
    allergensLabel: allergensLabel,
    storageCondition,
    lotCode,
    lotDate,
    bestBeforeDate,
    soNumber,
    refNo,
    prodOrderNo,
    productionDate,
    expiryDate,
    shelfLifeDays: (() => {
      const shelfLifeRaw = getRecordValue('SHELFLIFE_DAY') || getRecordValue('shelfLifeDays');
      return Number.isFinite(Number(shelfLifeRaw)) ? parseInt(shelfLifeRaw, 10) : 0;
    })(),
    palletNo,
    bagNo,
    bagSequence: Math.round(parseInt(getRecordValue('bagSequence') || '0') || 0),
    bagPosition: getRecordValue('bagPosition') || '0',
    printCount: Math.round(parseInt(getRecordValue('printCount') || '0') || 0),
    printDate: new Date().toISOString().split('T')[0],
    totalBags,
    daysToExpire: Number(getRecordValue('DaysToExpire')) || 0,
    expiryDateCaption,
    manufacturerInfo,
    batchWithPallet: `${batchNo} ${lineCode}`,
    allergenOverride: getRecordValue('allergenOverride') || '',
    countryOfOrigin,
    itemKey: getRecordValue('ItemKey') || '',
    custKey: getRecordValue('CustKey') || '',
    templateId: parseInt(getRecordValue('TemplateID') || '0', 10) || undefined,
    templateName: getRecordValue('TemplateName') || '',
    templateUpdatedAt: getRecordValue('TemplateUpdatedAt') || '',
    templateVersion: parseInt(getRecordValue('Version') || '0', 10) || undefined,
    allergen1: allergen1
  };
};

/* ------------------------------------------------------------------------ */
/* Helper - Create Standard Template                                         */
/* ------------------------------------------------------------------------ */
const createStandardTemplate = (batch: Batch): any => {
  // สร้าง template มาตรฐานตาม batch ที่ได้รับ
  const templateWidth = 400;
  const templateHeight = 400;
  
  // ปรับเลขถุงให้เป็นรูปแบบ 01, 02, ..
  const bagSequence = batch.bagSequence || 1;
  const formattedBagNo = bagSequence.toString().padStart(2, '0');
  
  // สร้าง lineCode ที่ถูกต้อง
  const palletNo = batch.palletNo || '01';
  const lineCode = `P${palletNo}B${formattedBagNo}`;
  
  // ใช้ข้อมูลจาก batch โดยตรง
  const productKey = batch.productKey || '';
  const productName = batch.productName || '';
  const processCell = batch.processCell || '1B';
  const netWeight = batch.netWeight || '25.00';
  const lotCode = batch.lotCode || '';
  const lotDate = batch.lotDate || '';
  const bestBeforeDate = batch.bestBeforeDate || '';
  const expiryDateCaption = batch.expiryDateCaption || 'BEST BEFORE';
  const soNumber = batch.soNumber || 'S2508217';
  const allergensLabel = batch.allergensLabel || '';
  const storageCondition = batch.storageCondition || '';
  const manufacturerInfo = batch.manufacturerInfo || 'MANUFACTURED BY : Newly Weds Foods (Thailand) Limited\n909 Moo 15, Teparak Road, T.Bangsaothong, A.Bangsaothong, Samutprakarn 10570\nThailand Phone (662) 3159000 Fax (662) 3131638-9';
  
  // สร้าง elements พื้นฐาน
  const elements = [
    // ชื่อสินค้า
    {
      id: 'product-key',
      type: 'text',
      x: 10,
      y: 10,
      width: 140,
      height: 20,
      text: 'PRODUCT:',
      fontSize: 16,
      fontWeight: 'bold',
      textAlign: 'left'
    },
    {
      id: 'product-key-value',
      type: 'text',
      x: 150,
      y: 10,
      width: 200,
      height: 20,
      text: productKey,
      fontSize: 16,
      textAlign: 'left'
    },
    
    // ชื่อสินค้า
    {
      id: 'product-name',
      type: 'text',
      x: 10,
      y: 30,
      width: 140,
      height: 20,
      text: 'NAME:',
      fontSize: 16,
      fontWeight: 'bold',
      textAlign: 'left'
    },
    {
      id: 'product-name-value',
      type: 'text',
      x: 150,
      y: 30,
      width: 200,
      height: 20,
      text: productName,
      fontSize: 16,
      textAlign: 'left'
    },
    
    // Process Cell
    {
      id: 'process-cell',
      type: 'text',
      x: 10,
      y: 50,
      width: 140,
      height: 20,
      text: 'PROCESS CELL:',
      fontSize: 16,
      fontWeight: 'bold',
      textAlign: 'left'
    },
    {
      id: 'process-cell-value',
      type: 'text',
      x: 150,
      y: 50,
      width: 200,
      height: 20,
      text: processCell,
      fontSize: 16,
      textAlign: 'left'
    },
    
    // Batch Number ขนาดใหญ่ตรงกลาง
    {
      id: 'batch-number',
      type: 'text',
      x: 0,
      y: 80,
      width: templateWidth,
      height: 30,
      text: batch.itemKey || '',
      fontSize: 20,
      fontWeight: 'bold',
      textAlign: 'center'
    },
    
    // Line Code
    {
      id: 'line-code',
      type: 'text',
      x: templateWidth - 80,
      y: 125,
      width: 60,
      height: 20,
      text: lineCode,
      fontSize: 16,
      textAlign: 'right'
    },
    
    // NET WEIGHT
    {
      id: 'net-weight',
      type: 'text',
      x: 25,
      y: 100,
      width: 120,
      height: 20,
      text: 'NET WEIGHT:',
      fontSize: 16,
      textAlign: 'left'
    },
    {
      id: 'net-weight-value',
      type: 'text',
      x: 150,
      y: 100,
      width: 130,
      height: 20,
      text: `${netWeight} KG/BAG`,
      fontSize: 16,
      textAlign: 'left'
    },
    
    // Process Cell Value (top right)
    {
      id: 'process-cell-display',
      type: 'text',
      x: templateWidth - 80,
      y: 100,
      width: 40,
      height: 20,
      text: processCell,
      fontSize: 16,
      textAlign: 'right'
    },
    
    // LOT CODE
    {
      id: 'lot-code',
      type: 'text',
      x: 25,
      y: 125,
      width: 120,
      height: 20,
      text: 'LOT CODE:',
      fontSize: 16,
      textAlign: 'left'
    },
    {
      id: 'lot-date-value',
      type: 'text',
      x: 150,
      y: 125,
      width: 130,
      height: 20,
      text: lotDate,
      fontSize: 16,
      textAlign: 'left'
    },
    
    // Batch No. display (middle)
    {
      id: 'batch-no-display',
      type: 'text',
      x: 250,
      y: 125,
      width: 80,
      height: 20,
      text: batch.batchNo || '',
      fontSize: 16,
      textAlign: 'center'
    },
    
    // BEST BEFORE
    {
      id: 'best-before',
      type: 'text',
      x: 25,
      y: 150,
      width: 120,
      height: 20,
      text: expiryDateCaption,
      fontSize: 16,
      textAlign: 'left'
    },
    {
      id: 'best-before-value',
      type: 'text',
      x: 150,
      y: 150,
      width: 170,
      height: 20,
      text: bestBeforeDate,
      fontSize: 16,
      textAlign: 'left'
    },
    
    // SO Number
    {
      id: 'so-number-value',
      type: 'text',
      x: templateWidth - 80,
      y: 150,
      width: 80,
      height: 20,
      text: soNumber,
      fontSize: 16,
      textAlign: 'right'
    },
    
    // ALLERGENS
    {
      id: 'allergens',
      type: 'text',
      x: 25,
      y: 180,
      width: 350,
      height: 20,
      text: `Allergens : ${allergensLabel}`,
      fontSize: 16,
      textAlign: 'left'
    },
    
    // STORAGE
    {
      id: 'storage',
      type: 'text',
      x: 25,
      y: 205,
      width: 350,
      height: 20,
      text: `Recommended Storage : ${storageCondition}`,
      fontSize: 14,
      textAlign: 'left'
    },
    
    // Manufacturer Info
    {
      id: 'manufacturer-info',
      type: 'text',
      x: 25,
      y: 235,
      width: 350,
      height: 60,
      text: manufacturerInfo,
      fontSize: 10,
      textAlign: 'left',
      lineHeight: 1.2
    },
    
    // BARCODE
    {
      id: 'barcode',
      type: 'barcode',
      x: 50,
      y: 290,
      width: 200,
      height: 70,
      format: 'CODE128',
      value: batch.batchNo || '',
      displayValue: true,
      fontSize: 14,
      textAlign: 'center',
      layer: 5
    },
    
    // Print Date-Time
    {
      id: 'print-datetime',
      type: 'text',
      x: templateWidth - 100,
      y: templateHeight - 20,
      width: 90,
      height: 15,
      text: new Date().toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: '2-digit', 
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true 
      }).replace(/\//g, ''),
      fontSize: 10,
      textAlign: 'right'
    }
  ];
  
  // สร้าง content object เพื่อส่งคืน
  const content = {
    canvasSize: { width: templateWidth, height: templateHeight },
    elements: elements
  };
  
  return {
    templateId: null,  // เป็น template ที่สร้างขึ้นมาเอง ไม่มี ID
    name: 'Standard Template',
    engine: 'html',
    content: JSON.stringify(content),
    canvasSize: { width: templateWidth, height: templateHeight }
  };
};

// แก้ไข React.FC เป็น React.FC<{}>
const BatchSearch: React.FC<{}> = () => {
  // State variables
  const [searchText, setSearchText] = useState<string>('');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [previewVisible, setPreviewVisible] = useState<boolean>(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  
  // เพิ่ม state สำหรับข้อมูลผู้ใช้
  const [username, setUsername] = useState<string>('');
  const [userMenuVisible, setUserMenuVisible] = useState<boolean>(false);
  
  // Print preview modal state
  const [printModalVisible, setPrintModalVisible] = useState<boolean>(false);
  const [templatePreview, setTemplatePreview] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  
  // Print options state
  const [startBag, setStartBag] = useState<number>(1);
  const [endBag, setEndBag] = useState<number>(1);
  const [qcSample, setQcSample] = useState<boolean>(false);
  const [formSheet, setFormSheet] = useState<boolean>(false);
  const [palletTag, setPalletTag] = useState<boolean>(false);
  const [generateQRCode, setGenerateQRCode] = useState<boolean>(false); // เพิ่มสถานะสำหรับ QR Code
  const [productionDate, setProductionDate] = useState<string | null>(null);
  const [selectedProductionDate, setSelectedProductionDate] = useState<string | null>(null);
  const [isResyncingPreview, setIsResyncingPreview] = useState<boolean>(false);
  const [isSpecialLabel, setIsSpecialLabel] = useState<boolean>(false); // เพิ่ม state สำหรับตรวจสอบว่าเป็น Special Label หรือไม่
  
  // Refs
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [printingBags, setPrintingBags] = useState<string>('');
  const [showPrintDialog, setShowPrintDialog] = useState<boolean>(false);
  
  // เพิ่ม state สำหรับ QR popup
  const [qrScanData, setQrScanData] = useState<any>(null);
  const [qrPopupVisible, setQrPopupVisible] = useState<boolean>(false);
  
  // เพิ่ม router สำหรับการนำทาง
  const router = useRouter();
  
  // เพิ่มฟังก์ชันสำหรับการจัดการสแกน QR code
  const handleQrScan = (data: string) => {
    if (!data) return;
    
    try {
      // แยกข้อมูลจาก QR code (รูปแบบ KEY:VALUE\nKEY2:VALUE2 หรือ KEY:VALUE||KEY2:VALUE2)
      const scanData: Record<string, string> = {};
      
      // รองรับทั้งรูปแบบเว้นบรรทัดและรูปแบบ ||
      const lines = data.includes('\n') ? data.split('\n') : data.split('||');
      
      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          scanData[key] = value.trim();
        }
      });
      
      // เก็บข้อมูลที่สแกนได้และแสดง popup
      setQrScanData(scanData);
      setQrPopupVisible(true);
    } catch (error) {
      console.error('Error parsing QR code data:', error);
      message.error('ไม่สามารถอ่านข้อมูล QR code ได้');
    }
  };
  
  // Effect hook สำหรับการแสดง barcode และ QR code
  useEffect(() => {
    // Check if preview is loaded and batch is selected
    if (previewContainerRef.current && selectedBatch && templatePreview) {
      // ใส่ timeout เพื่อให้แน่ใจว่า DOM ได้โหลดเสร็จแล้ว
      const timeout = setTimeout(() => {
        try {
          // ตรวจสอบการโหลด JsBarcode
          if (typeof window !== 'undefined' && window.JsBarcode) {
            // หา barcode element
            const barcodeElement = document.getElementById(`barcode-${selectedBatch.batchNo}`);
            if (barcodeElement) {
              console.log('Rendering barcode for', selectedBatch.batchNo);
              window.JsBarcode(barcodeElement, selectedBatch.batchNo, {
                format: 'CODE128',
                width: 2,
                height: 50,
                displayValue: true,
                fontSize: 14,
                fontFamily: 'monospace',
                margin: 5,
                textAlign: "center",
                textPosition: "bottom",
                textMargin: 2
              } as BarcodeOptions);
            }
          } else {
            console.warn('JsBarcode library not loaded yet');
            // โหลด JsBarcode ถ้ายังไม่มี
            const script = document.createElement('script');
            script.id = 'jsbarcode-script';
            script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
            script.onload = function() {
              console.log('JsBarcode loaded dynamically');
              // กำหนดค่า JsBarcode ให้กับตัวแปรโกลบอล
              if (window.JsBarcode) {
                // ใช้ตัวแปรในระดับโกลบอล
                JsBarcode = window.JsBarcode;
              }
            };
            document.head.appendChild(script);
          }
          
          // แสดง QR code ถ้าเลือกตัวเลือกนี้
          if (generateQRCode) {
            // โหลด QR code library ถ้ายังไม่มี
            if (typeof window !== 'undefined' && !window.QRCode) {
              import('qrcode').then(qrcodeModule => {
                window.QRCode = qrcodeModule.default || qrcodeModule;
                
                // เมื่อโหลดเสร็จแล้ว สร้าง QR code
                const qrCanvas = document.getElementById(`qrcode-${selectedBatch.batchNo}`) as HTMLCanvasElement;
                if (qrCanvas) {
                  const qrValue = `BATCH:${selectedBatch.batchNo}\nPRODUCT:${selectedBatch.productName}\nLOT:${selectedBatch.lotCode}\nNET_WEIGHT:${selectedBatch.netWeight}\nBEST_BEFORE:${selectedBatch.bestBeforeDate}\nALLERGENS:${selectedBatch.allergensLabel}`;
                  window.QRCode.toCanvas(qrCanvas, qrValue, {
                    width: 90,
                    margin: 0,
                    scale: 6
                  });
                }
              });
            } else if (typeof window !== 'undefined' && window.QRCode) {
              // ถ้า QRCode มีอยู่แล้ว ให้สร้าง QR code ได้เลย
              const qrCanvas = document.getElementById(`qrcode-${selectedBatch.batchNo}`) as HTMLCanvasElement;
              if (qrCanvas) {
                const qrValue = `BATCH:${selectedBatch.batchNo}\nPRODUCT:${selectedBatch.productName}\nLOT:${selectedBatch.lotCode}\nNET_WEIGHT:${selectedBatch.netWeight}\nBEST_BEFORE:${selectedBatch.bestBeforeDate}\nALLERGENS:${selectedBatch.allergensLabel}`;
                window.QRCode.toCanvas(qrCanvas, qrValue, {
                  width: 90,
                  margin: 0,
                  scale: 6
                });
              }
            }
          }
        } catch (error) {
          console.error('Error rendering barcode/QR code:', error);
        }
      }, 500); // delay ให้ DOM ได้โหลดเสร็จสมบูรณ์ก่อน
      
      return () => clearTimeout(timeout);
    }
  }, [templatePreview, selectedBatch, generateQRCode]);
  
  // เพิ่ม useEffect สำหรับการโหลด QRCode library
  useEffect(() => {
    // โหลด QRCode library เมื่อคอมโพเนนต์โหลด
    if (typeof window !== 'undefined' && !window.QRCode) {
      import('qrcode').then(qrcodeModule => {
        window.QRCode = qrcodeModule.default || qrcodeModule;
      }).catch(error => {
        console.error('Error loading QRCode library:', error);
      });
    }
    
    // เรียกใช้ initQRCode
    initQRCode();
  }, []);
  
  /* ===================================================================== */
  /* API Functions */
  /* ===================================================================== */

  // Fetch batch data from API
  const fetchBatchData = async (searchQuery: string) => {
    setLoading(true);
    setBatches([]);
    
    try {
      if (!searchQuery) {
        setLoading(false);
        return;
      }
      
      // เปลี่ยน endpoint เป็น /batches/sqlview เพื่อให้ตรงกับ BatchDataSelectionModal
      const apiUrl = `${ApiHelper.getApiBaseUrl()}/batches/labelview?batchNo=${encodeURIComponent(searchQuery)}`;
      console.log('Fetching from SQL View API URL:', apiUrl);
      
      // ใช้ headers ที่มี Authorization
      const headers = ApiHelper.getAuthHeaders();
      
      // ใช้ axios โดยตรงแทนที่จะใช้ api instance เพื่อให้สามารถกำหนด URL ที่ถูกต้องได้
      const response = await axios.get(apiUrl, { headers });
      console.log('API response:', response);
      
      if (response.data && Array.isArray(response.data)) {
        // ไม่กรองข้อมูลที่ซ้ำกันออกเพื่อให้แสดงทุก row
        const processedData = response.data.map(batch => extractBatchData(batch));
        setBatches(processedData);
        console.log('Processed batches:', processedData);
        
        // ตรวจสอบและเลือก row ที่มี special template ก่อน
        if (processedData.length > 0) {
          // ค้นหา row ที่มี special template ที่ตรงกับ itemKey และ custKey
          const rowWithSpecialTemplate = await findRowWithSpecialTemplate(processedData);
          
          // ถ้าพบ row ที่มี special template ให้แสดง preview และเตรียมพิมพ์
          if (rowWithSpecialTemplate) {
            console.log('Found row with special template:', rowWithSpecialTemplate);
            handleAutoPreviewAndPrint(rowWithSpecialTemplate);
          } else {
            // ถ้าไม่พบ row ที่มี special template ให้ใช้ row แรก
            console.log('No row with special template found, using first row');
            handleAutoPreviewAndPrint(processedData[0]);
          }
        }
      } else if (response.data) {
        // ถ้าข้อมูลไม่ใช่ array แต่เป็น object เดียว
        const processedData = [extractBatchData(response.data)];
        setBatches(processedData);
        console.log('Processed single batch:', processedData);
        
        // มีเพียง row เดียว ให้แสดง preview และเตรียมพิมพ์อัตโนมัติ
        if (processedData.length > 0) {
          handleAutoPreviewAndPrint(processedData[0]);
        }
      } else {
        setBatches([]);
        message.info('No batches found for this search term');
      }
    } catch (error: any) {
      console.error('Error fetching batch data:', error);
      
      // แสดงข้อความที่เฉพาะเจาะจงมากขึ้น
      if (error.response) {
        // ถ้ามีการตอบกลับจาก server (status code ไม่ใช่ 2xx)
        message.error(`ข้อผิดพลาดในการค้นหา batch: ${error.response.status}: ${error.response.data?.message || 'Unknown error'}`);
        
        // ถ้าเป็น 401 Unauthorized ให้ redirect ไปหน้า login
        if (error.response.status === 401) {
          message.error('Session expired. Please login again.');
          if (typeof window !== 'undefined') {
            localStorage.removeItem('token');
            window.location.href = '/login';
          }
        }
      } else if (error.request) {
        // ถ้าไม่มีการตอบกลับจาก server (no response)
        message.error('ไม่ได้รับการตอบกลับจากเซิร์ฟเวอร์ กรุณาตรวจสอบการเชื่อมต่อเครือข่าย');
      } else {
        // มีข้อผิดพลาดในการตั้งค่า request
        message.error(`ข้อผิดพลาดในการค้นหา batch: ${error.message}`);
      }
      
      // ไม่ใช้ mock data ตามที่ผู้ใช้ต้องการ
      setBatches([]);
    } finally {
      setLoading(false);
    }
  };

  // เพิ่มฟังก์ชันสำหรับค้นหา row ที่มี special template
  const findRowWithSpecialTemplate = async (batches: Batch[]): Promise<Batch | null> => {
    try {
      console.log('Finding row with special template...');
      
      // ค้นหา row ที่มีทั้ง itemKey และ custKey
      const rowsWithItemKeyAndCustKey = batches.filter(batch => batch.itemKey && batch.custKey);
      
      // ตรวจสอบแต่ละ row ว่ามี special template หรือไม่
      for (const batch of rowsWithItemKeyAndCustKey) {
        console.log(`Checking if row with itemKey=${batch.itemKey}, custKey=${batch.custKey} has special template`);
        
        // ค้นหา special template
        const template = await ApiHelper.lookupTemplate(batch.itemKey, batch.custKey, 'Special', batch.countryOfOrigin);
        
        // ถ้าพบ special template ให้คืนค่า batch นี้
        if (template) {
          console.log(`Found special template for itemKey=${batch.itemKey}, custKey=${batch.custKey}`);
          return batch;
        }
      }
      
      // ถ้าไม่พบ row ที่มี special template และมี itemKey ให้ค้นหาจาก itemKey อย่างเดียว
      const rowsWithItemKey = batches.filter(batch => batch.itemKey && !batch.custKey);
      
      // ตรวจสอบแต่ละ row ว่ามี special template หรือไม่ (เฉพาะ itemKey)
      for (const batch of rowsWithItemKey) {
        console.log(`Checking if row with itemKey=${batch.itemKey} (no custKey) has special template`);
        
        // ค้นหา special template
        const template = await ApiHelper.lookupTemplate(batch.itemKey, '', 'Special', batch.countryOfOrigin);
        
        // ถ้าพบ special template ให้คืนค่า batch นี้
        if (template) {
          console.log(`Found special template for itemKey=${batch.itemKey} (no custKey)`);
          return batch;
        }
      }
      
      // ถ้าไม่พบ row ที่มี special template
      console.log('No row with special template found');
      return null;
    } catch (error) {
      console.error('Error finding row with special template:', error);
      return null;
    }
  };

  // โหลด template จาก ID
  const loadTemplateById = async (templateId: number): Promise<any> => {
    try {
      const apiUrl = `${ApiHelper.getApiBaseUrl()}/templates/${templateId}`;
      console.log('Loading template from:', apiUrl);
      
      const headers = ApiHelper.getAuthHeaders();
      const response = await axios.get(apiUrl, { headers });
      return response.data;
    } catch (error) {
      console.error('Error loading template:', error);
      throw error;
    }
  };

  // โหลด template ตาม productKey และ customerKey
  const loadTemplateByProductAndCustomer = async (productKey: string, customerKey?: string): Promise<any> => {
    try {
      // สร้าง URL สำหรับค้นหา template
      const apiUrl = `${ApiHelper.getApiBaseUrl()}/templates/lookup?productKey=${encodeURIComponent(productKey)}${customerKey ? `&customerKey=${encodeURIComponent(customerKey)}` : ''}`;
      console.log('Loading template by product and customer:', apiUrl);
      
      const headers = ApiHelper.getAuthHeaders();
      const response = await axios.get(apiUrl, { headers });
      
      // ถ้าพบ templateId ให้โหลด template ข้อมูลเต็ม
      if (response.data && response.data.templateID) {
        console.log('Found template ID:', response.data.templateID);
        return loadTemplateById(response.data.templateID);
      }
      
      return null;
    } catch (error) {
      // ถ้าไม่พบ (404) หรือ parameter ไม่ถูกต้อง (400) ถือว่าเป็นเรื่องปกติ ไม่ถือเป็นข้อผิดพลาด
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404 || error.response?.status === 400) {
          console.log('No template found for this product/customer combination or invalid parameters');
          return null;
        }
      }
      
      console.error('Error loading template by product and customer:', error);
      return null;
    }
  };

  // เปิด Print Preview Modal และโหลด template
  const handleAutoPreviewAndPrint = async (batch: Batch) => {
    try {
      setSelectedBatch(batch);
      setPrintModalVisible(true);
      
      // ตั้งค่า bag range ให้ครอบคลุมทุก bag
      setStartBag(1);
      setEndBag(batch.totalBags || 1);
      
      // รีเซ็ตตัวเลือกพิเศษ
      setQcSample(false);
      setFormSheet(false);
      setPalletTag(false);
      
      // ตั้งค่าวันที่ผลิตตามข้อมูลที่ดึงมาได้
      const formattedProductionDate = batch.productionDate ? dayjs(batch.productionDate).format('YYYY-MM-DD') : null;
      setSelectedProductionDate(formattedProductionDate);
      
      // Log ข้อมูลอ้างอิงของ batch
      console.log('Batch reference data:', {
        batchNo: batch.batchNo,
        productKey: batch.productKey,
        productName: batch.productName,
        lotCode: batch.lotCode,
        lineCode: batch.lineCode,
        soNumber: batch.soNumber,
        refNo: batch.refNo,
        prodOrderNo: batch.prodOrderNo,
        allergen1: batch.allergen1,
        processCell: batch.processCell,
        productionDate: formattedProductionDate
      });
      
      setLoadingPreview(true);
      
      // ตรวจสอบว่ามี special template สำหรับ itemKey และ custKey หรือไม่
      let hasSpecialTemplate = false;
      let specialTemplate = null;
      
      if (batch.itemKey && batch.custKey) {
        console.log(`Checking special template for itemKey=${batch.itemKey}, custKey=${batch.custKey}`);
        specialTemplate = await ApiHelper.lookupTemplate(batch.itemKey, batch.custKey, 'Special', batch.countryOfOrigin);
        if (specialTemplate) {
          hasSpecialTemplate = true;
          console.log(`Found special template for itemKey=${batch.itemKey}, custKey=${batch.custKey}`);
        }
      }
      
      // ถ้ายังไม่พบและมี itemKey ให้ค้นหาจาก itemKey อย่างเดียว
      if (!hasSpecialTemplate && batch.itemKey) {
        console.log(`Checking special template for itemKey=${batch.itemKey} only`);
        specialTemplate = await ApiHelper.lookupTemplate(batch.itemKey, '', 'Special', batch.countryOfOrigin);
        if (specialTemplate) {
          hasSpecialTemplate = true;
          console.log(`Found special template for itemKey=${batch.itemKey} only`);
        }
      }
      
      // ตรวจสอบประเภทฉลากที่ต้องการ (Standard หรือ Special)
      // ถ้ามี special template หรือเลือก qcSample, formSheet, palletTag ให้ใช้ Special
      const labelTypeWanted: 'Standard' | 'Special' = 
        (hasSpecialTemplate || qcSample || formSheet || palletTag) ? 'Special' : 'Standard';
      
      console.log(`Label type wanted: ${labelTypeWanted}, hasSpecialTemplate: ${hasSpecialTemplate}`);
      
      // เก็บค่าว่าเป็น special label หรือไม่ไว้ใช้ในการแสดงผล
      setIsSpecialLabel(labelTypeWanted === 'Special' && hasSpecialTemplate);
      
      // ถ้าเป็น Special Label ให้ปิดการใช้งาน Generate QR Code
      if (labelTypeWanted === 'Special' && hasSpecialTemplate) {
        setGenerateQRCode(false);
      }
      
      let template: any = null;
      
      if (labelTypeWanted === 'Special' && hasSpecialTemplate) {
        // ถ้าต้องการ Special และมี special template ให้ใช้ specialTemplate ที่พบ
        console.log('Using special template that was found');
        template = specialTemplate;
        message.success('Special template loaded successfully');
        
        // เก็บ templateId ไว้ใช้ต่อ
        if (template.templateID || template.TemplateID) {
          batch.templateId = template.templateID || template.TemplateID;
        }
      } else if (labelTypeWanted === 'Standard') {
        // 1. ลำดับการค้นหา Standard Template:
        // 1.1. ค้นหาตาม productKey + customerKey แบบ Standard
        // 1.2. ค้นหาตาม productKey อย่างเดียวแบบ Standard
        // 1.3. ค้นหาตาม templateId ถ้ามี
        // 1.4. สร้าง standard template ถ้าไม่พบ template ใด ๆ
        
        if (batch.itemKey && batch.custKey) {
          console.log(`Searching standard template by productKey (${batch.itemKey}) and customerKey (${batch.custKey})`);
          template = await ApiHelper.lookupTemplate(batch.itemKey, batch.custKey, 'Standard', batch.countryOfOrigin);
        }
        
        if (!template && batch.itemKey) {
          console.log(`Searching standard template by productKey (${batch.itemKey}) only`);
          template = await ApiHelper.lookupTemplate(batch.itemKey, '', 'Standard', batch.countryOfOrigin);
        }
        
        if (!template && batch.templateId) {
          console.log(`Searching template by templateId (${batch.templateId})`);
          try {
            template = await loadTemplateById(batch.templateId);
          } catch (error) {
            console.error('Error loading template by ID:', error);
          }
        }
        
        if (!template) {
          console.log('No standard template found, creating standard template');
          template = createStandardTemplate(batch);
          message.info('Using standard template');
        } else {
          message.success('Standard template loaded successfully');
        }
      } else {
        // กรณีต้องการ Special แต่ไม่พบ special template
        // ค้นหา Special Template เท่านั้น (ไม่ทำ fallback เป็น standard)
        if (batch.itemKey && batch.custKey) {
          console.log(`Searching special template by productKey (${batch.itemKey}) and customerKey (${batch.custKey})`);
          template = await ApiHelper.lookupTemplate(batch.itemKey, batch.custKey, 'Special', batch.countryOfOrigin);
        }
        
        if (!template && batch.itemKey) {
          console.log(`Searching special template by productKey (${batch.itemKey}) only`);
          template = await ApiHelper.lookupTemplate(batch.itemKey, '', 'Special', batch.countryOfOrigin);
        }
        
        if (!template) {
          message.error('No special label template found for this product/customer');
          setLoadingPreview(false);
          return;
        } else {
          message.success('Special template loaded successfully');
          
          // เก็บ templateId ไว้ใช้ต่อ
          if (template.templateID || template.TemplateID) {
            batch.templateId = template.templateID || template.TemplateID;
          }
        }
      }
      
      // สร้าง HTML preview
      const { width: canvasWidth, height: canvasHeight } = TemplateHelper.getTemplateDimensions(template);
      
      // ถ้าเป็น special template และมี content ให้ใช้ content จาก template โดยตรง
      if (labelTypeWanted === 'Special' && hasSpecialTemplate && template.content) {
        try {
          console.log('Using content from special template for preview');
          // แปลง template content เป็น object ถ้าจำเป็น
          const templateContent = typeof template.content === 'string' 
            ? JSON.parse(template.content) 
            : template.content;
          
          // ใช้ข้อมูลจาก template โดยตรงเพื่อสร้าง HTML
          let specialPreviewHtml = '';
          
          // ตรวจสอบรูปแบบของ templateContent
          if (templateContent.html) {
            // กรณีมี HTML โดยตรง
            console.log('Template has direct HTML content');
            
            // แทนที่ placeholders ด้วยข้อมูลจาก batch
            let htmlContent = templateContent.html;
            
            // แทนที่ค่าพื้นฐาน
            htmlContent = htmlContent
              .replace(/\{batchNo\}/g, batch.batchNo || '')
              .replace(/\{productName\}/g, batch.productName || '')
              .replace(/\{productKey\}/g, batch.productKey || batch.itemKey || '')
              .replace(/\{itemKey\}/g, batch.itemKey || batch.productKey || '')
              .replace(/\{netWeight\}/g, batch.netWeight || '')
              .replace(/\{lotCode\}/g, batch.lotCode || '')
              .replace(/\{bestBefore\}/g, batch.bestBeforeDate || '')
              .replace(/\{allergens\}/g, batch.allergensLabel || '');
            
            // ค้นหาตำแหน่งของ barcode และ QR code ใน templateContent ถ้ามี
            const barcodePosition = templateContent.barcodePosition || { x: '50%', y: 'bottom', position: 'absolute', transform: 'translateX(-50%)' };
            const qrCodePosition = templateContent.qrCodePosition || { x: 'right', y: 'bottom', position: 'absolute' };
            
            // สร้าง style string สำหรับ barcode
            const barcodeStyle = `position: ${barcodePosition.position || 'absolute'}; 
                                 ${barcodePosition.y === 'bottom' ? 'bottom: 20px;' : `top: ${barcodePosition.y}px;`} 
                                 ${barcodePosition.x === '50%' ? 'left: 50%; transform: translateX(-50%);' : `left: ${barcodePosition.x}px;`}
                                 ${barcodePosition.width ? `width: ${barcodePosition.width}px;` : ''}
                                 ${barcodePosition.height ? `height: ${barcodePosition.height}px;` : ''}`;
            
            // สร้าง style string สำหรับ QR code
            const qrCodeStyle = `position: ${qrCodePosition.position || 'absolute'}; 
                                ${qrCodePosition.y === 'bottom' ? 'bottom: 20px;' : `top: ${qrCodePosition.y}px;`} 
                                ${qrCodePosition.x === 'right' ? 'right: 20px;' : `left: ${qrCodePosition.x}px;`}
                                ${qrCodePosition.width ? `width: ${qrCodePosition.width}px;` : ''}
                                ${qrCodePosition.height ? `height: ${qrCodePosition.height}px;` : ''}`;
            
            // สร้าง container
            specialPreviewHtml = `
              <div class="template-preview" style="width: ${canvasWidth}px; height: ${canvasHeight}px; position: relative; background: white; border: 1px solid #ccc;">
                <div id="template-container" data-template-id="${template.templateID}" style="width: 100%; height: 100%;">
                  ${htmlContent}
                </div>
                
                <!-- Render barcode for the batch number -->
                <svg id="barcode-${batch.batchNo}" class="barcode" style="${barcodeStyle}"></svg>
                
                <!-- Add QR Code if enabled -->
                ${generateQRCode ? `<canvas id="qrcode-${batch.batchNo}" width="90" height="90" style="${qrCodeStyle}"></canvas>` : ''}
              </div>
            `;
          } else if (templateContent.elements) {
            // กรณีมี elements ที่เป็น objects
            console.log('Template has elements array, creating dynamic content');
            
            // ตัวแปรเพื่อตรวจสอบว่ามี barcode และ QR code หรือไม่
            let hasBarcodeElement = false;
            let hasQrCodeElement = false;
            
            // ตรวจสอบก่อนว่ามี elements ประเภท barcode หรือ qrcode หรือไม่
            templateContent.elements.forEach((element: any) => {
              if (element.type === 'barcode') hasBarcodeElement = true;
              if (element.type === 'qr' || element.type === 'qrcode') hasQrCodeElement = true;
            });
            
            console.log('Template has barcode element:', hasBarcodeElement);
            console.log('Template has QR code element:', hasQrCodeElement);
            
            // สร้าง container
            specialPreviewHtml = `
              <div class="template-preview" style="width: ${canvasWidth}px; height: ${canvasHeight}px; position: relative; background: white; border: 1px solid #ccc; overflow: hidden;">
                <div id="template-container" data-template-id="${template.templateID}" style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;">
                  <!-- Dynamic elements will be rendered here -->
            `;
            
            // วนลูปสร้าง elements - จัดเรียงตาม layer หรือ z-index (ถ้ามี)
            const sortedElements = [...templateContent.elements].sort((a, b) => {
              const aLayer = a.layer || 0;
              const bLayer = b.layer || 0;
              return aLayer - bLayer;
            });
            
            sortedElements.forEach((element: any) => {
              if (element.type === 'text') {
                // แทนที่ placeholders ในข้อความ
                let text = element.text || '';
                text = text
                  .replace(/\{batchNo\}/g, batch.batchNo || '')
                  .replace(/\{productName\}/g, batch.productName || '')
                  .replace(/\{productKey\}/g, batch.productKey || batch.itemKey || '')
                  .replace(/\{itemKey\}/g, batch.itemKey || batch.productKey || '')
                  .replace(/\{netWeight\}/g, batch.netWeight || '')
                  .replace(/\{lotCode\}/g, batch.lotCode || '')
                  .replace(/\{bestBefore\}/g, batch.bestBeforeDate || '')
                  .replace(/\{allergens\}/g, batch.allergensLabel || '');
                
                // คำนวณ z-index สำหรับ text
                const zIndex = element.layer || 1;
                
                // เพิ่ม style เพิ่มเติมตามที่กำหนดใน element
                const fontWeight = element.fontWeight || 'normal';
                const fontStyle = element.fontStyle || 'normal';
                const textDecoration = element.textDecoration || 'none';
                const textAlign = element.align || element.textAlign || 'left';
                
                specialPreviewHtml += `
                  <div style="position: absolute; transform: translate(${element.x}px, ${element.y}px); width: ${element.width}px; height: ${element.height}px; font-size: ${element.fontSize || 14}px; font-family: ${element.fontFamily || 'Arial'}; font-weight: ${fontWeight}; font-style: ${fontStyle}; text-decoration: ${textDecoration}; text-align: ${textAlign}; color: ${element.fill || '#000000'}; z-index: ${zIndex}; overflow: hidden;">
                    ${text}
                  </div>
                `;
              } else if (element.type === 'barcode') {
                // สร้าง barcode ด้วยข้อมูลจาก element โดยตรง
                console.log('Adding barcode element at position:', element.x, element.y, 'with dimensions:', element.width, element.height);
                
                // เก็บค่าตำแหน่งและขนาดเดิมไว้ใช้ในการแสดงผล barcode ให้ตรงกับ Template Designer
                specialPreviewHtml += `
                   <div class="barcode-container" style="position: absolute; top: ${element.y}px; left: ${element.x}px; width: ${element.width || 200}px; height: ${element.height || 80}px; z-index: 5; overflow: visible; pointer-events: none;">
                    <svg id="barcode-${batch.batchNo}" class="barcode" 
                        data-original-x="${element.x}" 
                        data-original-y="${element.y}" 
                        data-original-width="${element.width || 200}" 
                        data-original-height="${element.height || 80}"
                        style="width: 100%; height: 100%;"></svg>
                  </div>
                `;
              } else if (element.type === 'qr' || element.type === 'qrcode') {
                // สร้าง QR code ด้วยข้อมูลจาก element โดยตรง
                console.log('Adding QR code element at position:', element.x, element.y, 'with dimensions:', element.width, element.height);
                
                // สร้างข้อมูลสำหรับ QR code
                const qrValue = `BATCH:${batch.batchNo}\nPRODUCT:${batch.productName}\nLOT:${batch.lotCode}\nNET_WEIGHT:${batch.netWeight}\nBEST_BEFORE:${batch.bestBeforeDate}\nALLERGENS:${batch.allergensLabel}`;
                
                specialPreviewHtml += `
                  <div style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none;">
                    <canvas id="qrcode-${batch.batchNo}" 
                          data-qr-value="${qrValue}" 
                          data-original-x="${element.x}" 
                          data-original-y="${element.y}" 
                          data-original-width="${element.width || 90}" 
                          data-original-height="${element.height || 90}" 
                          width="${element.width || 90}" 
                          height="${element.height || 90}" 
                          style="position: absolute; transform: translate(${element.x}px, ${element.y}px); z-index: 5;"></canvas>
                  </div>
                `;
              } else if (element.type === 'rect') {
                // สร้าง rectangle
                const rectStyle = `
                  position: absolute;
                  transform: translate(${element.x}px, ${element.y}px);
                  width: ${element.width}px;
                  height: ${element.height}px;
                  background-color: ${element.fill || 'transparent'};
                  border: ${element.stroke ? `${element.strokeWidth || 1}px ${element.strokeStyle || 'solid'} ${element.stroke}` : 'none'};
                  z-index: ${element.layer || 1};
                `;
                specialPreviewHtml += `<div style="${rectStyle}"></div>`;
              }
            });
            
            // เพิ่ม barcode และ QR code เฉพาะกรณีที่ไม่มีใน elements
            if (!hasBarcodeElement) {
              // ดึงข้อมูลตำแหน่งจาก template.defaultBarcodePosition หรือใช้ค่าเริ่มต้น
              const defaultBarcodePosition = templateContent.defaultBarcodePosition || template.defaultBarcodePosition || {
                x: (canvasWidth / 2) - 100, // ตรงกลาง
                y: canvasHeight - 100, // ด้านล่าง
                width: 200,
                height: 80
              };
              
              console.log('Using default barcode position:', defaultBarcodePosition);
              
              specialPreviewHtml += `
                <div style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none;">
                  <svg id="barcode-${batch.batchNo}" class="barcode" 
                       data-original-x="${defaultBarcodePosition.x}" 
                       data-original-y="${defaultBarcodePosition.y}" 
                       data-original-width="${defaultBarcodePosition.width}" 
                       data-original-height="${defaultBarcodePosition.height}"
                       style="position: absolute; transform: translate(${defaultBarcodePosition.x}px, ${defaultBarcodePosition.y}px); width: ${defaultBarcodePosition.width}px; height: ${defaultBarcodePosition.height}px; z-index: 5;"></svg>
                </div>
              `;
            }
            
            if (generateQRCode && !hasQrCodeElement) {
              // ดึงข้อมูลตำแหน่งจาก template.defaultQrCodePosition หรือใช้ค่าเริ่มต้น
              const defaultQrCodePosition = templateContent.defaultQrCodePosition || template.defaultQrCodePosition || {
                x: canvasWidth - 100, // ด้านขวา
                y: canvasHeight - 100, // ด้านล่าง
                width: 90,
                height: 90
              };
              
              console.log('Using default QR code position:', defaultQrCodePosition);
              
              specialPreviewHtml += `
                <div style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none;">
                  <canvas id="qrcode-${batch.batchNo}" 
                         data-qr-value="BATCH:${batch.batchNo}\nPRODUCT:${batch.productName}\nLOT:${batch.lotCode}\nNET_WEIGHT:${batch.netWeight}\nBEST_BEFORE:${batch.bestBeforeDate}\nALLERGENS:${batch.allergensLabel}" 
                         data-original-x="${defaultQrCodePosition.x}" 
                         data-original-y="${defaultQrCodePosition.y}" 
                         data-original-width="${defaultQrCodePosition.width}" 
                         data-original-height="${defaultQrCodePosition.height}" 
                         width="${defaultQrCodePosition.width}" 
                         height="${defaultQrCodePosition.height}" 
                         style="position: absolute; transform: translate(${defaultQrCodePosition.x}px, ${defaultQrCodePosition.y}px); z-index: 5;"></canvas>
                </div>
              `;
            }
            
            // ปิด container
            specialPreviewHtml += `
                </div>
              </div>
            `;
          } else {
            // กรณีไม่มีทั้ง html และ elements
            console.log('Template does not have html or elements, using basic structure');
            
            // กำหนดตำแหน่ง barcode และ QR code
            const defaultBarcodePosition = {
              x: (canvasWidth / 2) - 100, // ตรงกลาง
              y: canvasHeight - 100, // ด้านล่าง
              width: 200,
              height: 80
            };
            
            const defaultQrCodePosition = {
              x: canvasWidth - 100, // ด้านขวา
              y: canvasHeight - 100, // ด้านล่าง
              width: 90,
              height: 90
            };
            
            console.log('Using default barcode position:', defaultBarcodePosition);
            console.log('Using default QR code position:', defaultQrCodePosition);
            
            specialPreviewHtml = `
              <div class="template-preview" style="width: ${canvasWidth}px; height: ${canvasHeight}px; position: relative; background: white; border: 1px solid #ccc;">
                <div style="position: absolute; top: 20px; left: 0; width: 100%; text-align: center; font-size: 24px; font-weight: bold;">
                  ${batch.productName || ''}
                </div>
                <div style="position: absolute; top: 60px; left: 0; width: 100%; text-align: center; font-size: 36px; font-weight: bold;">
                  ${batch.itemKey || batch.productKey || ''}
                </div>
                <div style="position: absolute; top: 120px; left: 50px; font-size: 18px;">
                  <div>Batch No: ${batch.batchNo || ''}</div>
                  <div>Lot Code: ${batch.lotCode || ''}</div>
                  <div>Best Before: ${batch.bestBeforeDate || ''}</div>
                  <div>Net Weight: ${batch.netWeight || ''} KG/BAG</div>
                  <div>Allergens: ${batch.allergensLabel || ''}</div>
                </div>
                
                <!-- Render barcode for the batch number -->
                <svg id="barcode-${batch.batchNo}" class="barcode" style="position: absolute; left: ${defaultBarcodePosition.x}px; top: ${defaultBarcodePosition.y}px; width: ${defaultBarcodePosition.width}px; height: ${defaultBarcodePosition.height}px; z-index: 5;"></svg>
                
                <!-- Add QR Code if enabled -->
                ${generateQRCode ? `<canvas id="qrcode-${batch.batchNo}" data-qr-value="BATCH:${batch.batchNo}\nPRODUCT:${batch.productName}\nLOT:${batch.lotCode}\nNET_WEIGHT:${batch.netWeight}\nBEST_BEFORE:${batch.bestBeforeDate}\nALLERGENS:${batch.allergensLabel}" width="${defaultQrCodePosition.width}" height="${defaultQrCodePosition.height}" style="position: absolute; left: ${defaultQrCodePosition.x}px; top: ${defaultQrCodePosition.y}px; z-index: 5;"></canvas>` : ''}
              </div>
            `;
          }
          
          console.log('Generated special preview HTML with dimensions:', canvasWidth, 'x', canvasHeight);
          setTemplatePreview(specialPreviewHtml);
          
          // เรียกใช้ initQRCode ทันทีหลังจากการ setTemplatePreview
          setTimeout(() => {
            console.log('Calling initQRCode after setting template preview');
            initQRCode();
          }, 300);
        } catch (error) {
          console.error('Error parsing special template content:', error);
          // Fallback to standard preview if error occurs
          const previewHtml = generatePreviewHtml(canvasWidth, canvasHeight, batch);
          setTemplatePreview(previewHtml);
        }
      } else {
        // ใช้ generatePreviewHtml สำหรับ standard template หรือเมื่อไม่พบ special template
        const previewHtml = generatePreviewHtml(canvasWidth, canvasHeight, batch);
        setTemplatePreview(previewHtml);
        
        // เรียกใช้ initQRCode ทันทีหลังจากการ setTemplatePreview
        setTimeout(() => {
          console.log('Calling initQRCode after setting standard template preview');
          initQRCode();
        }, 300);
      }
      
    } catch (error) {
      console.error('Error preparing preview:', error);
      message.error('Failed to prepare label preview');
    } finally {
      setLoadingPreview(false);
    }
  };
  
  // อัพเดทการแสดงผลเมื่อมีการเปลี่ยนวันที่ผลิต
  const handleResyncPreview = async () => {
    if (!selectedBatch) return;
    
    try {
      setIsResyncingPreview(true);
      
      // สร้าง batch ใหม่ด้วยวันที่ผลิตที่เลือก
      const newBatch = {
        ...selectedBatch,
        productionDate: selectedProductionDate
      };
      
      // คำนวณวันที่ Best Before โดยใช้ DateHelper.calculateBestBefore
      const bestBefore = DateHelper.calculateBestBefore(
        selectedProductionDate,
        Number.isFinite(Number(newBatch.shelfLifeDays)) ? newBatch.shelfLifeDays : 0,
        Number.isFinite(Number(newBatch.daysToExpire)) ? newBatch.daysToExpire : 0
      );
      console.log('Calculated bestBefore:', bestBefore);
      
      // อัปเดตค่าในตัวแปร newBatch
      newBatch.bestBeforeDate = bestBefore;
      
      // แปลงวันที่ bestBefore เป็นรูปแบบ YYYY-MM-DD สำหรับเก็บในตัวแปร expiryDate
      try {
        // แปลงจากรูปแบบ "02 Nov 2025" เป็น "YYYY-MM-DD"
        const dateObj = new Date(bestBefore);
        if (!isNaN(dateObj.getTime())) {
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          newBatch.expiryDate = `${year}-${month}-${day}`;
        }
      } catch (e) {
        console.error('Error converting date format:', e);
      }
      
      // คำนวณ lotCode ใหม่ถ้าจำเป็น (ถ้า lotCode สร้างจาก productionDate)
      if (selectedProductionDate && (!newBatch.lotCode || newBatch.lotCode === '')) {
        const date = new Date(selectedProductionDate);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const sequential = '0001';
          newBatch.lotCode = `${year}${month}${day}${sequential}`;
          console.log('Generated new lotCode:', newBatch.lotCode);
        }
      }
      
      // อัพเดท lotDate ตามวันที่ผลิตใหม่ ในรูปแบบ "06 May 2025"
      newBatch.lotDate = DateHelper.formatDate(selectedProductionDate);
      console.log('Updated lotDate:', newBatch.lotDate);
      
      console.log('Resyncing preview with new production date:', selectedProductionDate);
      console.log('Updated batch data:', newBatch);
      
      // อัพเดท selectedBatch ด้วยข้อมูลใหม่
      setSelectedBatch(newBatch);
      
      // ตรวจสอบว่าต้องเพิ่ม QRCode library หรือไม่
      if (generateQRCode && typeof window !== 'undefined' && !window.QRCode) {
        try {
          const qrcodeModule = await import('qrcode');
          window.QRCode = qrcodeModule.default || qrcodeModule;
          console.log('QRCode library loaded for resync');
        } catch (error) {
          console.error('Failed to load QRCode library:', error);
        }
      }
      
      // ถ้ามี templateId ให้โหลด template จาก API
      if (newBatch.templateId) {
        try {
          const response = await loadTemplateById(newBatch.templateId);
          
          // ตรวจสอบว่าต้องเพิ่ม QR Code หรือไม่
          if (generateQRCode) {
            // แก้ไข template เพื่อเพิ่ม QR Code หากต้องการ
            const parsedTemplate = TemplateHelper.safeParseContent(response);
            const elements = parsedTemplate.elements || [];
            
            // ตรวจสอบว่ามี QR Code อยู่แล้วหรือไม่
            const hasQRCode = elements.some((el: any) => el.type === 'qrcode' || el.id === 'qrcode');
            
            // ถ้ายังไม่มี QR Code ให้เพิ่มเข้าไป
            if (!hasQRCode) {
              // สร้าง QR Code element - ปรับตำแหน่งให้อยู่ที่มุมขวาบน
              const qrCodeElement = {
                id: 'qrcode',
                type: 'qrcode',
                x: 300,  // ปรับตำแหน่งให้ชิดขอบขวา
                y: 5,    // ปรับตำแหน่งให้ชิดขอบบน
                width: 90,  // ขนาด QR Code 90x90
                height: 90,  // ขนาด QR Code 90x90
                value: `BATCH:${newBatch.batchNo}\nPRODUCT:${newBatch.productName}\nLOT:${newBatch.lotCode}\nNET_WEIGHT:${newBatch.netWeight}\nBEST_BEFORE:${newBatch.bestBeforeDate}\nALLERGENS:${newBatch.allergensLabel}`,
                format: 'QR_CODE',
                layer: 10
              };
              
              // เพิ่ม QR Code เข้าไปใน elements
              elements.push(qrCodeElement);
              
              // อัพเดท template content
              if (typeof response.content === 'string') {
                const contentObj = JSON.parse(response.content);
                contentObj.elements = elements;
                response.content = JSON.stringify(contentObj);
              } else if (response.content) {
                response.content.elements = elements;
              }
            }
          }
          
          // สร้าง HTML preview
          const { width: canvasWidth, height: canvasHeight } = TemplateHelper.getTemplateDimensions(response);
          const previewHtml = generatePreviewHtml(canvasWidth, canvasHeight, newBatch);
          setTemplatePreview(previewHtml);
          
          // เพิ่ม timeout เพื่อให้แน่ใจว่า DOM ได้โหลดเสร็จแล้วก่อนที่จะพยายาม render QR code
          setTimeout(() => {
            if (generateQRCode && typeof window !== 'undefined' && window.QRCode) {
              const qrCanvas = document.getElementById(`qrcode-${newBatch.batchNo}`) as HTMLCanvasElement;
              if (qrCanvas) {
                try {
                  const qrValue = `BATCH:${newBatch.batchNo}\nPRODUCT:${newBatch.productName}\nLOT:${newBatch.lotCode}\nNET_WEIGHT:${newBatch.netWeight}\nBEST_BEFORE:${newBatch.bestBeforeDate}\nALLERGENS:${newBatch.allergensLabel}`;
                  window.QRCode.toCanvas(qrCanvas, qrValue, {
                    width: 90,
                    margin: 0,
                    scale: 6
                  });
                  console.log('QR code rendered successfully after resync');
                } catch (error) {
                  console.error('Error rendering QR code after resync:', error);
                }
              } else {
                console.warn('QR canvas element not found');
              }
            }
          }, 500);
          
          message.success('Template preview updated successfully');
        } catch (error) {
          console.error('Error loading template:', error);
          
          // ถ้าโหลด template ไม่สำเร็จ ให้สร้าง standard template
          const standardTemplate = createStandardTemplate(newBatch);
          const { width: canvasWidth, height: canvasHeight } = TemplateHelper.getTemplateDimensions(standardTemplate);
          const previewHtml = generatePreviewHtml(canvasWidth, canvasHeight, newBatch);
          setTemplatePreview(previewHtml);
          
          // render QR code after template loading
          setTimeout(() => {
            if (generateQRCode && typeof window !== 'undefined' && window.QRCode) {
              const qrCanvas = document.getElementById(`qrcode-${newBatch.batchNo}`) as HTMLCanvasElement;
              if (qrCanvas) {
                try {
                  const qrValue = `BATCH:${newBatch.batchNo}\nPRODUCT:${newBatch.productName}\nLOT:${newBatch.lotCode}\nNET_WEIGHT:${newBatch.netWeight}\nBEST_BEFORE:${newBatch.bestBeforeDate}\nALLERGENS:${newBatch.allergensLabel}`;
                  window.QRCode.toCanvas(qrCanvas, qrValue, {
                    width: 90,
                    margin: 0,
                    scale: 6
                  });
                  console.log('QR code rendered successfully with standard template');
                } catch (error) {
                  console.error('Error rendering QR code with standard template:', error);
                }
              }
            }
          }, 500);
          
          message.warning('Using standard template as fallback');
        }
      } else {
        // ถ้าไม่มี templateId ให้สร้าง standard template
        const standardTemplate = createStandardTemplate(newBatch);
        
        // ตรวจสอบว่าต้องเพิ่ม QR Code หรือไม่
        if (generateQRCode && standardTemplate) {
          try {
            const parsedTemplate = TemplateHelper.safeParseContent(standardTemplate);
            const elements = parsedTemplate.elements || [];
            
            // ตรวจสอบว่ามี QR Code อยู่แล้วหรือไม่
            const hasQRCode = elements.some((el: any) => el.type === 'qrcode' || el.id === 'qrcode');
            
            // ถ้ายังไม่มี QR Code ให้เพิ่มเข้าไป
            if (!hasQRCode) {
              elements.push({
                id: 'qrcode',
                type: 'qrcode',
                x: 300, // ปรับตำแหน่งให้ชิดขอบขวา
                y: 5,  // ปรับตำแหน่งให้ชิดขอบบน
                width: 90,  // ขนาด QR Code 90x90
                height: 90,  // ขนาด QR Code 90x90
                value: `BATCH:${newBatch.batchNo}\nPRODUCT:${newBatch.productName}\nLOT:${newBatch.lotCode}\nNET_WEIGHT:${newBatch.netWeight}\nBEST_BEFORE:${newBatch.bestBeforeDate}\nALLERGENS:${newBatch.allergensLabel}`,
                format: 'QR_CODE',
                layer: 10
              });
              
              // อัพเดท standardTemplate.content
              if (typeof standardTemplate.content === 'string') {
                const contentObj = JSON.parse(standardTemplate.content);
                contentObj.elements = elements;
                standardTemplate.content = JSON.stringify(contentObj);
              }
            }
          } catch (error) {
            console.error('Error adding QR code to standard template:', error);
          }
        }
        
        const { width: canvasWidth, height: canvasHeight } = TemplateHelper.getTemplateDimensions(standardTemplate);
        const previewHtml = generatePreviewHtml(canvasWidth, canvasHeight, newBatch);
        setTemplatePreview(previewHtml);
        
        // render QR code after template loading
        setTimeout(() => {
          if (generateQRCode && typeof window !== 'undefined' && window.QRCode) {
            const qrCanvas = document.getElementById(`qrcode-${newBatch.batchNo}`) as HTMLCanvasElement;
            if (qrCanvas) {
              try {
                const qrValue = `BATCH:${newBatch.batchNo}\nPRODUCT:${newBatch.productName}\nLOT:${newBatch.lotCode}\nNET_WEIGHT:${newBatch.netWeight}\nBEST_BEFORE:${newBatch.bestBeforeDate}\nALLERGENS:${newBatch.allergensLabel}`;
                window.QRCode.toCanvas(qrCanvas, qrValue, {
                  width: 90,
                  margin: 0,
                  scale: 6
                });
                console.log('QR code rendered successfully with standard template');
              } catch (error) {
                console.error('Error rendering QR code with standard template:', error);
              }
            }
          }
        }, 500);
        
        message.info('Using standard template with updated production date');
      }
    } catch (error) {
      console.error('Error updating preview:', error);
      message.error('Failed to update label preview');
    } finally {
      setIsResyncingPreview(false);
    }
  };
  
  // Load template preview
  const loadTemplatePreview = async (templateId: number, batch: Batch) => {
    setLoadingPreview(true);
    setTemplatePreview(null);
    setPdfPreviewUrl(null);
    
    try {
      const apiUrl = `${ApiHelper.getApiBaseUrl()}/templates/${templateId}`;
      console.log('Loading template preview from:', apiUrl);
      
      const headers = ApiHelper.getAuthHeaders();
      const response = await axios.get(apiUrl, { headers });
      
      const template = response.data;
      const { width: canvasWidth, height: canvasHeight } = TemplateHelper.getTemplateDimensions(template);
      const html = generatePreviewHtml(canvasWidth, canvasHeight, batch);
      setTemplatePreview(html);
    } catch (err) {
      console.error(err);
      message.error('Failed to load template preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  /* ===================================================================== */
  /* Event Handlers */
  /* ===================================================================== */
  
  // Handle batch search
  const handleSearch = async () => {
    if (!searchText.trim()) {
      message.info('Please enter a batch number to search');
      return;
    }
    
    try {
      await fetchBatchData(searchText.trim());
    } catch (error) {
      console.error('Search error:', error);
      message.error('Error performing search');
    }
  };
  
  // Auto-search on input change (6 ตัวอักษร)
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    setSearchText(value);
    
    // Auto-search เมื่อพิมพ์ครบ 6 ตัว และดูเหมือน batchNo
    if (value.length === 6 && isValidBatchNumber(value)) {
      setTimeout(() => {
        fetchBatchData(value);
      }, 300);
    }
  };
  
  // Refresh data
  const handleRefresh = async () => {
    if (searchText.trim()) {
      try {
        await fetchBatchData(searchText.trim());
      } catch (error) {
        console.error('Refresh error:', error);
        message.error('Error refreshing data');
      }
    }
  };

  // Handle preview label
  const handlePreviewLabel = (batch: Batch) => {
    setSelectedBatch(batch);
    setPreviewVisible(true);
  };

  // Handle close preview
  const handleClosePreview = () => {
    setPreviewVisible(false);
  };
  
  // Handle system print
  const handleSystemPrint = async () => {
    if (!selectedBatch) {
      message.error('No batch selected');
      return;
    }
    
    setIsPrinting(true);
    
    try {
      console.log('Printing range:', startBag, 'to', endBag);
      console.log('Generate QR Code:', generateQRCode);
      
      // คำนวณจำนวน label ที่จะพิมพ์
      const start = Math.max(1, startBag || 1);
      const end = Math.min(selectedBatch.totalBags || 1, endBag || selectedBatch.totalBags || 1);
      const totalLabels = end - start + 1;
      
      // เตรียมข้อมูลสำหรับการพิมพ์
      const printData = {
        batchNo: selectedBatch.batchNo,
        labels: [] as any[]
      };
      
      // เพิ่มฉลากอื่นๆ ถ้าเลือก
      const specialLabels = [];
      if (qcSample) specialLabels.push("QC SAMPLE");
      if (formSheet) specialLabels.push("FORMULATION SHEET");
      if (palletTag) specialLabels.push("PALLET TAG");
      
      const totalPages = totalLabels + specialLabels.length;
      
      if (totalPages <= 0) {
        message.warning('No labels to print');
        setIsPrinting(false);
        return;
      }
      
      // สร้าง iframe สำหรับการพิมพ์
      if (printFrameRef.current) {
        const iframe = printFrameRef.current;
        const doc = iframe.contentDocument;
        if (doc) {
          doc.open();
          
          // เพิ่ม console.log เพื่อตรวจสอบการทำงาน
          console.log('Preparing to print for batch:', selectedBatch.batchNo);
          
          // สร้าง HTML header
          let printHTML = `
            <!DOCTYPE html>
            <html>
              <head>
                <title>Label Print - ${selectedBatch.batchNo}</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                  @page { 
                    size: 4in 4in; 
                    margin: 0;
                    page-break-after: always;
                  }
                  body { 
                    margin: 0; 
                    padding: 0;
                    font-family: Arial, sans-serif;
                  }
                  .label-container {
                    width: 400px;
                    height: 400px;
                    position: relative;
                    background-color: white;
                    box-sizing: border-box;
                    page-break-after: always;
                    break-after: page;
                    margin-bottom: 20px;
                    overflow: hidden;
                  }
                  .special-label {
                    position: relative;
                  }
                  .special-label:after {
                    content: attr(data-label-type);
                    position: absolute;
                    bottom: 10px;
                    left: 0;
                    right: 0;
                    background-color: #000;
                    color: #fff;
                    text-align: center;
                    padding: 5px;
                    font-weight: bold;
                  }
                  /* เพิ่ม CSS เพื่อแก้ไขปัญหาการแสดงผลฉลากจีน */
                  .template-preview {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                  }
                  .chinese-text {
                    font-family: 'SimSun', 'Microsoft YaHei', 'SimHei', sans-serif;
                    font-weight: normal;
                  }
                  /* ทำให้แน่ใจว่าข้อความแสดงผลถูกต้อง */
                  .barcode {
                    position: absolute;
                    z-index: 5;
                  }
                  canvas {
                    position: absolute;
                    z-index: 5;
                  }
                  /* จัดตำแหน่งให้ถูกต้อง */
                  div[id^="template-container"] {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    top: 0;
                    left: 0;
                  }
                </style>
                <!-- เพิ่ม JsBarcode ทันทีในส่วนหัว -->
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                <!-- เพิ่ม QRCode library ด้วย -->
                <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.0/build/qrcode.min.js"></script>
                <script>
                  // สร้างการเช็คว่าไลบรารีโหลดเรียบร้อยหรือไม่
                  function checkLibrariesLoaded() {
                    return new Promise((resolve, reject) => {
                      let checkCount = 0;
                      const maxChecks = 20; // ตรวจสอบสูงสุด 20 ครั้ง (10 วินาที)
                      
                      function check() {
                        console.log('Checking if libraries loaded...', checkCount);
                        if (typeof window.JsBarcode !== 'undefined' && typeof window.QRCode !== 'undefined') {
                          console.log('Libraries loaded successfully!');
                          resolve(true);
                          return;
                        }
                        
                        checkCount++;
                        if (checkCount >= maxChecks) {
                          console.error('Libraries failed to load after timeout');
                          reject(new Error('Libraries timeout'));
                          return;
                        }
                        
                        setTimeout(check, 500); // ตรวจสอบทุก 500 มิลลิวินาที
                      }
                      
                      check();
                    });
                  }
                  
                  // เพิ่มการตรวจสอบการโหลดของไลบรารี
                  window.onload = function() {
                    console.log('Window loaded in iframe');
                    
                    // รอให้ไลบรารีโหลดเสร็จก่อน
                    checkLibrariesLoaded()
                      .then(() => {
                        console.log('JsBarcode available:', typeof window.JsBarcode !== 'undefined');
                        console.log('QRCode available:', typeof window.QRCode !== 'undefined');
                        
                        // แก้ไขฟอนต์จีนให้แสดงผลถูกต้อง
                        document.querySelectorAll('.chinese-text').forEach(function(el) {
                          el.style.fontFamily = "'SimSun', 'Microsoft YaHei', 'SimHei', sans-serif";
                        });
                        
                        // ฟังก์ชันสำหรับแสดง barcode ในทุกหน้า
                        function renderAllBarcodes() {
                          try {
                            console.log('Rendering barcodes and QR codes');
                            // ค้นหา barcode elements ทั้งหมด
                            const barcodeElements = document.querySelectorAll('[id^="barcode-"]');
                            console.log('Found barcode elements:', barcodeElements.length);
                            
                            barcodeElements.forEach(element => {
                              // ดึง batchNo จาก id
                              const batchNo = element.id.replace('barcode-', '');
                              console.log('Rendering barcode for:', batchNo);
                              
                              // แสดง barcode
                              JsBarcode(element, batchNo, {
                                format: "CODE128",
                                width: 2,
                                height: 50,
                                displayValue: true,
                                fontSize: 14,
                                fontFamily: 'monospace',
                                margin: 5,
                                textAlign: 'center',
                                textPosition: 'bottom',
                                textMargin: 2,
                                margin: 5
                              });
                            });
                            
                            // ค้นหา QR code elements ทั้งหมด
                            const qrElements = document.querySelectorAll('[id^="qrcode-"]');
                            console.log('Found QR elements:', qrElements.length);
                            
                            qrElements.forEach(element => {
                              // ดึง batchNo จาก id
                              const batchNo = element.id.replace('qrcode-', '');
                              // สร้างข้อมูลสำหรับ QR code
                              const qrValue = element.getAttribute('data-qr-value') || batchNo;
                              
                              console.log('Rendering QR code for:', batchNo);
                              
                              // แสดง QR code
                              if (window.QRCode) {
                                QRCode.toCanvas(element, qrValue, {
                                  width: 80,
                                  margin: 1
                                });
                              }
                            });
                            
                            console.log('Finished rendering all codes');
                            return true;
                          } catch(e) {
                            console.error('Error rendering codes:', e);
                            return false;
                          }
                        }
                        
                        // เรียกใช้ฟังก์ชันเพื่อแสดง barcodes และ QR codes
                        const renderResult = renderAllBarcodes();
                        console.log('Render result:', renderResult);
                        
                        // ทำให้ฟังก์ชันนี้สามารถเรียกใช้จากภายนอกได้
                        window.renderAllBarcodes = renderAllBarcodes;
                      })
                      .catch(err => {
                        console.error('Failed to initialize libraries:', err);
                      });
                  }
                </script>
              </head>
              <body>
          `;
          
          // ตรวจสอบว่ามี templatePreview หรือไม่
          const isUsingSpecialTemplate = templatePreview && templatePreview.length > 0;
          console.log('Is using special template for printing:', isUsingSpecialTemplate);
          
          if (isUsingSpecialTemplate) {
            // ถ้ามี templatePreview ให้ใช้สำหรับทุก label
            for (let bagNumber = startBag; bagNumber <= endBag; bagNumber++) {
              // กำหนดเลขถุงให้มีรูปแบบ 01, 02, ...
              const formattedBagNo = bagNumber.toString().padStart(2, '0');
              
              // สร้าง QR code value
              const qrValue = `BATCH:${selectedBatch.batchNo}\nPRODUCT:${selectedBatch.productName}\nLOT:${selectedBatch.lotCode}\nNET_WEIGHT:${selectedBatch.netWeight}\nBEST_BEFORE:${selectedBatch.bestBeforeDate}\nALLERGENS:${selectedBatch.allergensLabel}`;
              
              // แทนที่ค่า bagNo ในเทมเพลต
              let labelHtml = templatePreview;
              
              // เพิ่ม class และคุณสมบัติที่จำเป็นเพื่อให้แสดงผลถูกต้อง
              labelHtml = labelHtml.replace(/<div class="template-preview"/g, '<div class="template-preview"');
              labelHtml = labelHtml.replace(/>带卡马萨拉风味调</g, ' class="chinese-text">带卡马萨拉风味调');
              labelHtml = labelHtml.replace(/>配料表:/g, ' class="chinese-text">配料表:');
              
              // เปลี่ยนค่า data-qr-value สำหรับ QR code
              labelHtml = labelHtml.replace(new RegExp(`data-qr-value="[^"]*"`, 'g'), `data-qr-value="${qrValue}"`);
              
              printHTML += `
                <div class="label-container">
                  ${labelHtml}
                </div>
              `;
            }
          } else {
            // ถ้าไม่มี templatePreview ให้ใช้วิธีเดิม
            for (let bagNumber = startBag; bagNumber <= endBag; bagNumber++) {
              // ตรวจสอบ palletNo 
              const palletNo = selectedBatch.palletNo || '01';
              
              // กำหนดเลขถุงให้มีรูปแบบ 01, 02, ...
              const formattedBagNo = bagNumber.toString().padStart(2, '0');
              
              // สร้าง batch object ใหม่สำหรับแต่ละ bag
              const bagBatch = {
                ...selectedBatch,
                bagNo: formattedBagNo,
                bagSequence: bagNumber,
                totalBags: endBag - startBag + 1,
                bagPosition: `${bagNumber}/${endBag - startBag + 1}`,
                lineCode: `P${palletNo}B${formattedBagNo}`, // กำหนด lineCode ใหม่ตามเลขถุง
                generateQRCode: generateQRCode // คงสถานะการสร้าง QR Code
              };
              
              // สร้าง QR code value
              const qrValue = `BATCH:${bagBatch.batchNo}\nPRODUCT:${bagBatch.productName}\nLOT:${bagBatch.lotCode}\nNET_WEIGHT:${bagBatch.netWeight}\nBEST_BEFORE:${bagBatch.bestBeforeDate}\nALLERGENS:${bagBatch.allergensLabel}`;
              
              // สร้างเทมเพลตสำหรับแต่ละถุง
              try {
                let labelHtml = '';
                if (selectedBatch.templateId) {
                  // ถ้ามี templateId ให้โหลด template
                  const apiUrl = `${ApiHelper.getApiBaseUrl()}/templates/${selectedBatch.templateId}`;
                  console.log('Loading template from:', apiUrl);
                  
                  const headers = ApiHelper.getAuthHeaders();
                  const response = await axios.get(apiUrl, { headers });
                  
                  const template = response.data;
                  const { width: canvasWidth, height: canvasHeight } = TemplateHelper.getTemplateDimensions(template);
                  labelHtml = generatePreviewHtml(canvasWidth, canvasHeight, bagBatch);
                } else {
                  // ถ้าไม่มี templateId ให้ใช้ template มาตรฐาน
                  const templateObj = createStandardTemplate(bagBatch);
                  const { width: canvasWidth, height: canvasHeight } = TemplateHelper.getTemplateDimensions(templateObj);
                  if (templateObj) {
                    labelHtml = generatePreviewHtml(canvasWidth, canvasHeight, bagBatch);
                  }
                }
                
                // เพิ่ม data attribute สำหรับ QR code
                labelHtml = labelHtml.replace(`id="qrcode-${bagBatch.batchNo}"`, `id="qrcode-${bagBatch.batchNo}" data-qr-value="${qrValue}"`);
                
                printHTML += `
                  <div class="label-container">
                    ${labelHtml}
                  </div>
                `;
              } catch (error) {
                console.error(`Error generating label for bag ${bagNumber}:`, error);
              }
            }
          }
          
          // เพิ่มฉลากพิเศษ (QC, Formula Sheet, Pallet Tag)
          specialLabels.forEach(labelType => {
            // ใช้ข้อมูล templatePreview สำหรับฉลากพิเศษ
            let specialLabelHtml = templatePreview || '';
            
            // เพิ่ม class และคุณสมบัติที่จำเป็นเพื่อให้แสดงผลถูกต้อง
            specialLabelHtml = specialLabelHtml.replace(/<div class="template-preview"/g, '<div class="template-preview"');
            specialLabelHtml = specialLabelHtml.replace(/>带卡马萨拉风味调</g, ' class="chinese-text">带卡马萨拉风味调');
            specialLabelHtml = specialLabelHtml.replace(/>配料表:/g, ' class="chinese-text">配料表:');
            
            printHTML += `
              <div class="label-container special-label" data-label-type="${labelType}">
                ${specialLabelHtml}
              </div>
            `;
          });
          
          // ปิด HTML
          printHTML += `
              </body>
            </html>
          `;
          
          doc.write(printHTML);
          doc.close();
          
          // ต้องรอให้ iframe โหลดเสร็จก่อนพิมพ์
          iframe.onload = () => {
            try {
              console.log('Iframe loaded, preparing to render barcodes');
              
              // แสดง barcode และ QR code ทันทีเมื่อโหลดเสร็จ
              if (iframe.contentWindow && iframe.contentWindow.renderAllBarcodes) {
                console.log('Calling renderAllBarcodes');
                iframe.contentWindow.renderAllBarcodes();
              } else {
                console.error('renderAllBarcodes function not found in iframe');
              }
              
              // เพิ่มเวลารอให้นานขึ้นเพื่อให้แน่ใจว่า barcode และ QR code แสดงเรียบร้อยแล้ว
              setTimeout(() => {
                try {
                  if (iframe.contentWindow) {
                    console.log('Focusing iframe window');
                    iframe.contentWindow.focus();
                    
                    console.log('Triggering print dialog');
                    iframe.contentWindow.print();
                    
                    // แก้ไขปัญหา optional chaining
                    const contentWindow = iframe.contentWindow;
                    if (contentWindow) {
                      contentWindow.onafterprint = () => {
                        console.log('Print completed or cancelled');
                        setIsPrinting(false);
                      };
                    }
                  } else {
                    console.error('Cannot access iframe.contentWindow');
                    setIsPrinting(false);
                  }
                } catch (printError) {
                  console.error('Error during printing:', printError);
                  setIsPrinting(false);
                }
              }, 1500); // เพิ่มเวลารอจาก 800 เป็น 1500 มิลลิวินาที
              
              // กรณีที่ onafterprint ไม่ทำงาน ให้เซ็ต timeout เพื่อยกเลิกสถานะ printing
              setTimeout(() => {
                console.log('Safety timeout to reset printing state');
                setIsPrinting(false);
              }, 10000); // เพิ่มเวลารอจาก 5000 เป็น 10000 มิลลิวินาที
            } catch (error) {
              console.error('Print error:', error);
              setIsPrinting(false);
            }
          };
        }
      }
    } catch (error) {
      console.error('Error printing:', error);
      setIsPrinting(false);
    }
  };
  
  /* ===================================================================== */
  /* Template Preview Helpers                                             */
  /* ===================================================================== */
  
  /* Generate HTML preview */
  const generatePreviewHtml = (
    canvasWidth: number,
    canvasHeight: number,
    batch: Record<string, any>
  ) => {
    try {
      // สร้างวันที่ปัจจุบันในรูปแบบ "ddMMyy HH:MMtt"
      const now = new Date();
      const day = now.getDate().toString().padStart(2, '0');
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const year = now.getFullYear().toString().slice(-2);
      const hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const hrs = (hours % 12 || 12).toString().padStart(2, '0');
      
      const printDateTime = `${day}${month}${year} ${hrs}:${minutes}${ampm}`;
      
      // เริ่มต้น HTML ด้วย div ที่มี border ชัดเจน
      let html = `<div style="position:relative;width:${canvasWidth}px;height:${canvasHeight}px;background-color:white;overflow:hidden;border:1px solid #ccc;">`;

      // ตรวจสอบข้อมูล
      const batchNo = batch.batchNo || '';
      const productName = batch.productName || '';
      // ใช้ itemKey แทน batchNo สำหรับการแสดงในส่วนหัว
      const itemKey = batch.itemKey || batch.productKey || '';
      const netWeight = batch.netWeight || '25.00';
      const processCell = batch.processCell || '1B';
      
      // ตรวจสอบและใช้ค่า lotCode และ lotDate จาก batch
      const lotCode = batch.lotCode || '';
      const lotDate = batch.lotDate || '';
      
      // รับค่า bagNo และ totalBags จาก batch
      const bagNo = batch.bagNo || '1';
      const totalBags = batch.totalBags || 1;
      const bagSequence = batch.bagSequence || 1;
      
      // ตรวจสอบและปรับปรุง lineCode (P01Bxx) ตามเลขถุง
      // ถ้า bagNo เป็นตัวเลข ให้สร้าง lineCode ใหม่ตามรูปแบบที่ถูกต้อง
      let lineCode = '';
      
      // ถ้ามี lineCode ในข้อมูล batch ให้ใช้ค่านั้นเป็นฐาน
      const baseLineCode = batch.lineCode || 'P01B';
      
      // ถ้า baseLineCode มีรูปแบบ PxxB แล้ว ให้เอาแค่ส่วน PxxB
      const lineCodeBase = baseLineCode.match(/P\d{2}B/) ? baseLineCode.match(/P\d{2}B/)[0] : 'P01B';
      
      // ปรับเลขถุงให้เป็นรูปแบบ 01, 02, ..
      const formattedBagNo = bagSequence.toString().padStart(2, '0');
      lineCode = `${lineCodeBase}${formattedBagNo}`;
      
      // ใช้ค่า bestBeforeDate จาก batch โดยตรง
      const bestBeforeDate = batch.bestBeforeDate || '';
      const expiryDateCaption = batch.expiryDateCaption || 'BEST BEFORE';
      const soNumber = batch.soNumber || 'S2508217';
      const allergensLabel = batch.allergensLabel || '';
      const storageCondition = batch.storageCondition || '';
      
      // สร้าง HTML
      
      // ชื่อสินค้าด้านบน (ปรับ margin ให้ชิดกันมากขึ้น)
      html += `<div style="position:absolute;top:10px;left:0;width:100%;text-align:center;font-size:18px;">${productName}</div>`;
      
      // แสดงหมายเลข ItemKey ขนาดใหญ่ตรงกลางด้านบน (เพิ่มขนาดตัวอักษร)
      html += `<div style="position:absolute;top:32px;left:0;width:100%;text-align:center;font-size:32px;font-weight:bold;">${itemKey}</div>`;
      
      // ปรับการแสดงข้อมูลแบบ 3 คอลัมน์ให้ชิดกันมากขึ้น
      
      // NET WEIGHT - ปรับตำแหน่งให้ชิดกันมากขึ้น และเพิ่ม processCell (1B) ต่อท้าย
      html += `<div style="position:absolute;top:80px;left:25px;width:120px;text-align:left;font-size:16px;">NET WEIGHT</div>`;
      html += `<div style="position:absolute;top:80px;left:150px;width:170px;text-align:left;font-size:16px;">${netWeight} KG/BAG <span style="margin-left:10px;">${processCell}</span></div>`;
      // ลบการแสดง processCell ออกจากตรงนี้เพื่อย้ายไปแสดงร่วมกับ batchNo

      // LOT CODE - ปรับตำแหน่งให้ชิดกันมากขึ้น ย้าย processCell ไปด้านบน
      html += `<div style="position:absolute;top:100px;left:25px;width:120px;text-align:left;font-size:16px;">LOT CODE</div>`;
      html += `<div style="position:absolute;top:100px;left:150px;width:130px;text-align:left;font-size:16px;">${lotDate}</div>`;
      // แสดง batchNo เท่านั้น (ไม่มี processCell) - เพราะย้ายไปด้านบนแล้ว
      html += `<div style="position:absolute;top:100px;left:250px;width:80px;text-align:center;font-size:16px;">${batchNo}</div>`;
      html += `<div style="position:absolute;top:100px;right:25px;width:60px;text-align:right;font-size:16px;">${lineCode}</div>`;
      
      // BEST BEFORE - ปรับตำแหน่งให้ชิดกันมากขึ้น
      html += `<div style="position:absolute;top:120px;left:25px;width:120px;text-align:left;font-size:16px;">${expiryDateCaption}</div>`;
      html += `<div style="position:absolute;top:120px;left:150px;width:170px;text-align:left;font-size:16px;">${bestBeforeDate}</div>`;
      html += `<div style="position:absolute;top:120px;right:25px;width:80px;text-align:right;font-size:16px;">${soNumber}</div>`;
      
      // ALLERGENS - แก้ไขปัญหา Allergens : ทับกัน
      if (allergensLabel) {
        html += `<div style="position:absolute;top:140px;left:25px;width:350px;text-align:left;font-size:16px;">`;
        
        // ตรวจสอบว่าใน allergensLabel มีคำว่า "Allergens :" อยู่แล้วหรือไม่
        if (allergensLabel.startsWith('Allergens :')) {
          // ถ้ามีแล้ว ให้แสดงเฉพาะค่า allergensLabel
          html += `<span>${allergensLabel}</span>`;
        } else {
          // ถ้าไม่มี ให้เพิ่ม "Allergens :" ด้านหน้า
          html += `<span style="margin-right:5px;">Allergens :</span>`;
          html += `<span>${allergensLabel}</span>`;
        }
        
        html += `</div>`;
      }
      
      // STORAGE CONDITION - ปรับตำแหน่งให้ชิดกันมากขึ้น
      if (storageCondition) {
        html += `<div style="position:absolute;top:160px;left:25px;width:350px;text-align:left;font-size:14px;">`;
        html += `<span style="margin-right:5px;">Recommended Storage :</span>`;
        html += `<span>${storageCondition}</span>`;
        html += `</div>`;
      }
      
      // แสดง Manufacturer Info ด้านล่างซ้าย - แก้ไขปัญหาการซ้อนทับกันของข้อความ
      const manufacturerInfo = batch.manufacturerInfo || '';
      if (manufacturerInfo) {
        // แทนที่การแยกบรรทัดด้วยการตรวจสอบและแก้ไขรูปแบบข้อความโดยตรง
        // แก้ไขปัญหาข้อความ "Samutprakarn 10570" ขึ้นบรรทัดใหม่
        let processedInfo = manufacturerInfo;
        
        // แก้ไขกรณี Samutprakarn 10570 มีการขึ้นบรรทัดใหม่
        processedInfo = processedInfo.replace('Samutprakarn 10570\n', 'Samutprakarn 10570 ');
        // แก้ไขกรณีอื่นๆ ที่อาจเกิดขึ้น
        processedInfo = processedInfo.replace('10570\n', '10570 ');
        
        // แยกบรรทัดหลังจากแก้ไขแล้ว
        const lines = processedInfo.split('\n');
        
        // ปรับปรุง line-height ให้เหมาะสม
        const manufacturerStyle = "line-height:1.3;";
        
        // แสดงบรรทัดแรกพร้อมหัวข้อ - เป็นชื่อบริษัท
        html += `<div style="position:absolute;top:185px;left:25px;width:350px;text-align:left;font-size:10px;${manufacturerStyle}">MANUFACTURED BY : ${lines[0] || ''}</div>`;
        
        // แสดงที่อยู่ในบรรทัดที่ 2
        if (lines.length > 1) {
          html += `<div style="position:absolute;top:200px;left:25px;width:350px;text-align:left;font-size:10px;${manufacturerStyle}">${lines[1] || ''}</div>`;
        }
        
        // แสดงเบอร์โทรในบรรทัดที่ 3
        if (lines.length > 2) {
          html += `<div style="position:absolute;top:215px;left:25px;width:350px;text-align:left;font-size:10px;${manufacturerStyle}">${lines[2] || ''}</div>`;
        }
      }
      
      // เพิ่ม script สำหรับแสดง barcode - ปรับตำแหน่งให้อยู่ตรงกลางมากขึ้น
      const barcodeScript = `
        <script>
          setTimeout(function() {
            try {
              if (window.JsBarcode) {
                JsBarcode("#barcode-${batchNo}", "${batchNo}", {
                  format: "CODE128",
                  width: 2,
                  height: 50,
                  displayValue: true,
                  fontSize: 14,
                  fontFamily: 'monospace',
                  margin: 5,
                  textAlign: 'center',
                  textPosition: 'bottom',
                  textMargin: 2,
                  background: "#FFFFFF",
                  lineColor: "#000000"
                });
              } else {
                console.error("JsBarcode library not loaded");
              }
              
              ${generateQRCode ? `
              // เพิ่มคำสั่งสร้าง QR Code
              if (window.QRCode) {
                // ดึงค่า data-qr-value จาก element
                const qrElement = document.getElementById("qrcode-${batchNo}");
                const qrValue = qrElement ? qrElement.getAttribute('data-qr-value') || "${batchNo}" : "${batchNo}";
                
                QRCode.toCanvas(qrElement, qrValue, {
                  width: 80,
                  margin: 1
                });
              } else {
                console.error("QRCode library not loaded");
              }
              ` : '// QR Code generation disabled'}
            } catch (e) {
              console.error('Error generating codes:', e);
            }
          }, 500);
        </script>
      `;
      
      // แสดง BARCODE ด้านล่าง - จัดให้อยู่ตรงกลางทั้งแนวนอนและแนวตั้ง
      html += `<div style="position:absolute;top:235px;left:50%;transform:translateX(-50%);width:200px;text-align:center;margin:0 auto;display:flex;flex-direction:column;justify-content:center;align-items:center;">`;
      html += `<svg id="barcode-${batchNo}" width="200" height="70" style="display:block;margin:0 auto;"></svg>`;
      html += barcodeScript;
      html += `</div>`;
      
      // แสดงวันที่พิมพ์ใต้ barcode ชิดขวา
      html += `<div style="position:absolute;bottom:10px;right:10px;font-size:10px;">${printDateTime}</div>`;
      
      // เพิ่ม QR code ถ้าต้องการ พร้อม script สำหรับแสดง QR code
      const shouldGenerateQRCode = batch.generateQRCode || generateQRCode;
      if (shouldGenerateQRCode) {
        const qrScript = `
          <script>
            setTimeout(function() {
              try {
                if (window.QRCode) {
                  const qrValue = "BATCH:${batchNo}\\nPRODUCT:${batch.productName}\\nLOT:${lotCode}\\nNET_WEIGHT:${netWeight}\\nBEST_BEFORE:${bestBeforeDate}\\nALLERGENS:${allergensLabel}";
                  
                  // สร้าง QR Code
                  QRCode.toCanvas(document.getElementById("qrcode-${batchNo}"), qrValue, {
                    width: 90,
                    margin: 0,
                    scale: 6
                  });
                  
                  // เพิ่ม event listener สำหรับการคลิกที่ QR Code
                  const qrContainer = document.getElementById("qrcode-container-${batchNo}");
                  if (qrContainer) {
                    qrContainer.onclick = function() {
                      // เรียกใช้ฟังก์ชัน handleQrCodeScanned ที่ถูกกำหนดในหน้าหลัก
                      if (window.parent && window.parent.handleQrCodeScanned) {
                        window.parent.handleQrCodeScanned(qrValue);
                      }
                    };
                    qrContainer.style.cursor = 'pointer';
                    qrContainer.title = 'คลิกเพื่อดูข้อมูล';
                  }
                } else {
                  // โหลด QRCode library ถ้ายังไม่มี
                  if (typeof document !== 'undefined') {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.0/build/qrcode.min.js';
                    script.onload = function() {
                      if (window.QRCode) {
                        const qrValue = "BATCH:${batchNo}\\nPRODUCT:${batch.productName}\\nLOT:${lotCode}\\nNET_WEIGHT:${netWeight}\\nBEST_BEFORE:${bestBeforeDate}\\nALLERGENS:${allergensLabel}";
                        
                        QRCode.toCanvas(document.getElementById("qrcode-${batchNo}"), qrValue, {
                          width: 90,
                          margin: 0,
                          scale: 6
                        });
                      }
                    };
                    document.head.appendChild(script);
                  }
                }
              } catch(e) {
                console.error("Error rendering QR code:", e);
              }
            }, 100);
          </script>
        `;
        
        // เปลี่ยนตำแหน่ง QR code ให้อยู่ด้านขวาบนตามที่วาดในรูป และปรับขนาด
        html += `<div id="qrcode-container-${batchNo}" style="position:absolute;top:5px;right:5px;width:90px;height:90px;border-radius:5px;">`;
        html += `<canvas id="qrcode-${batchNo}" width="90" height="90" data-qr-value="BATCH:${batchNo}\\nPRODUCT:${batch.productName}\\nLOT:${lotCode}\\nNET_WEIGHT:${netWeight}\\nBEST_BEFORE:${bestBeforeDate}\\nALLERGENS:${allergensLabel}"></canvas>`;
        html += qrScript;
        html += `</div>`;
      }
      
      // ปิด div หลัก
      html += `</div>`;
      
      // เพิ่ม script สำหรับโหลด JsBarcode ถ้ายังไม่มี
      html += `
        <script>
          (function() {
            if (typeof JsBarcode === 'undefined' || JsBarcode === null) {
              var script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
              script.onload = function() {
                try {
                  JsBarcode("#barcode-${batchNo}", "${batchNo}", {
                    format: "CODE128",
                    width: 2,
                    height: 50,
                    displayValue: true,
                    fontSize: 14,
                    margin: 5,
                    fontFamily: 'monospace',
                    textAlign: 'center',
                    textPosition: 'bottom',
                    textMargin: 2
                  });
                } catch(e) {
                  console.error("Error rendering barcode after load:", e);
                }
              };
              document.head.appendChild(script);
            }
          })();
        </script>
      `;
      
      return html;
    } catch (error) {
      console.error('Error generating preview HTML:', error);
      // แก้ไขปัญหา error.message อาจไม่มีอยู่ในกรณีที่ error เป็น unknown type
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `<div>Error generating preview: ${errorMessage}</div>`;
    }
  };

  /* Initialize QR Code functionality */
  const initQRCode = () => {
    // ตรวจสอบว่าเราอยู่ในฝั่ง browser
    if (typeof window === 'undefined') return;
    
    // ตรวจสอบว่า JsBarcode ถูกโหลดแล้วหรือยัง และทำการเรียกใช้เพื่อแสดง barcode
    if (typeof window.JsBarcode !== 'undefined') {
      // ค้นหา elements ที่มี class เป็น barcode
      const barcodeElements = document.querySelectorAll('.barcode');
      console.log('Found barcode elements:', barcodeElements.length);
      
      barcodeElements.forEach((element) => {
        const svgElement = element as SVGElement;
        const batchNo = svgElement.id.replace('barcode-', '');
        
        // ใช้ค่าขนาดจาก data-attributes ที่เราเก็บไว้
        const width = parseInt(svgElement.getAttribute('data-original-width') || '200');
        const height = parseInt(svgElement.getAttribute('data-original-height') || '80');
        
        console.log(`Rendering barcode for batch ${batchNo} with dimensions: ${width}x${height}`);
        
        try {
          // กำหนดค่า options สำหรับ JsBarcode
          const options = {
            format: 'CODE128',
            width: 2,                 // ความกว้างของแต่ละแท่ง barcode
            height: height * 0.7,     // เพิ่มความสูงของแท่ง barcode เป็น 70% ของความสูงทั้งหมด
            displayValue: true,       // แสดงตัวเลขใต้ barcode
            fontSize: 13,             // ลดขนาดตัวอักษรลงเล็กน้อย
            textAlign: 'center',
            textPosition: 'bottom',
            textMargin: 2,            // ระยะห่างระหว่างแท่ง barcode กับตัวเลข
            margin: 0,                // ไม่เพิ่ม margin รอบ barcode
            background: 'transparent' // พื้นหลังโปร่งใส
          };
          
          // ล้าง SVG ก่อนเพื่อป้องกันการซ้อนทับ
          svgElement.innerHTML = '';
          
          // ปรับขนาด SVG ให้พอดี
          svgElement.setAttribute('width', width.toString());
          svgElement.setAttribute('height', height.toString());
          
          // แสดง barcode โดยตรงบน SVG element
          window.JsBarcode(svgElement, batchNo, options);
          
          // เพิ่ม CSS ให้กับ barcode เพื่อให้แน่ใจว่าจะแสดงถูกต้อง
          const barcodeContainer = svgElement.closest('div');
          if (barcodeContainer) {
            barcodeContainer.style.zIndex = '5';
          }
          
          // ตรวจสอบว่า barcode ถูกสร้างขึ้นแล้ว
          console.log(`Barcode for ${batchNo} rendered with options:`, options);
        } catch (e) {
          console.error(`Error rendering barcode for ${batchNo}:`, e);
        }
      });
    } else {
      // ถ้ายังไม่ถูกโหลดให้ลองโหลดจาก module
      try {
        import('jsbarcode').then(jsbarcodeModule => {
          window.JsBarcode = jsbarcodeModule.default || jsbarcodeModule;
          console.log('JsBarcode library loaded successfully');
          
          // เรียกใช้ initQRCode อีกครั้งหลังจากโหลด JsBarcode สำเร็จ
          setTimeout(initQRCode, 100);
        }).catch(err => {
          console.error('Failed to load JsBarcode library:', err);
        });
      } catch (e) {
        console.error('Error initializing JsBarcode:', e);
      }
    }
    
    // ตรวจสอบว่า QRCode ถูกโหลดแล้วหรือยัง
    if (typeof window.QRCode === 'undefined') {
      // ถ้ายังไม่ถูกโหลดให้ลองโหลดจาก module
      try {
        import('qrcode').then(qrcodeModule => {
          window.QRCode = qrcodeModule.default || qrcodeModule;
          console.log('QRCode library loaded successfully');
          
          // เมื่อโหลด QRCode สำเร็จแล้ว ให้ตรวจสอบและแสดง QR codes ที่อาจมีอยู่ในหน้าจอ
          setTimeout(() => {
            const qrElements = document.querySelectorAll('[id^="qrcode-"]');
            console.log('Found QR elements after load:', qrElements.length);
            
            qrElements.forEach(element => {
              const canvas = element as HTMLCanvasElement;
              const batchNo = canvas.id.replace('qrcode-', '');
              
              try {
                // ตรวจสอบว่า canvas สามารถใช้งานได้หรือไม่
                if (!canvas || typeof canvas.getContext !== 'function') {
                  console.warn(`QR code canvas for ${batchNo} is not ready or valid. Skipping rendering.`);
                  return;
                }
                
                // สร้างข้อมูลสำหรับ QR code
                const qrValueFromAttribute = canvas.getAttribute('data-qr-value') || `BATCH:${batchNo}`;
                
                console.log('Rendering QR code for:', batchNo, 'with value:', qrValueFromAttribute);
                
                // แสดง QR code
                window.QRCode.toCanvas(canvas, qrValueFromAttribute, {
                  width: canvas.width,
                  margin: 1,
                  scale: 4
                });
              } catch (e) {
                console.error(`Error rendering QR code for ${batchNo}:`, e);
              }
            });
          }, 500);
        }).catch(err => {
          console.error('Failed to load QRCode library:', err);
          
          // ถ้าไม่สามารถโหลดได้ ให้สร้าง placeholder แทน
          window.QRCode = {
            toCanvas: (canvas: HTMLCanvasElement, text: string, options: any) => {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                // วาด placeholder QR code
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = 'black';
                ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20);
                
                // วาดลายตาราง
                ctx.fillStyle = 'white';
                const cellSize = Math.floor((canvas.width - 20) / 8);
                for (let i = 0; i < 8; i++) {
                  for (let j = 0; j < 8; j++) {
                    if ((i + j) % 2 === 0) {
                      ctx.fillRect(
                        10 + i * cellSize, 
                        10 + j * cellSize, 
                        cellSize, 
                        cellSize
                      );
                    }
                  }
                }
                
                // เขียนข้อความตรงกลาง
                ctx.fillStyle = 'black';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('QR Placeholder', canvas.width / 2, canvas.height / 2);
              }
            }
          };
        });
      } catch (e) {
        console.error('Error initializing QRCode:', e);
      }
    } else {
      // หากมี QRCode แล้ว ให้ตรวจสอบและแสดง QR codes ที่อาจมีอยู่ในหน้าจอ
      setTimeout(() => {
        const qrElements = document.querySelectorAll('[id^="qrcode-"]');
        console.log('Found QR elements with existing library:', qrElements.length);
        
        qrElements.forEach(element => {
          const canvas = element as HTMLCanvasElement;
          const batchNo = canvas.id.replace('qrcode-', '');
          
          try {
            // ตรวจสอบว่า canvas สามารถใช้งานได้หรือไม่
            if (!canvas || typeof canvas.getContext !== 'function') {
              console.warn(`QR code canvas for ${batchNo} is not ready or valid. Skipping rendering.`);
              return;
            }
            
            // สร้างข้อมูลสำหรับ QR code
            const qrValueFromAttribute = canvas.getAttribute('data-qr-value') || `BATCH:${batchNo}`;
            
            console.log('Rendering QR code for:', batchNo, 'with value:', qrValueFromAttribute);
            
            // แสดง QR code
            window.QRCode.toCanvas(canvas, qrValueFromAttribute, {
              width: canvas.width,
              margin: 1,
              scale: 4
            });
          } catch (e) {
            console.error(`Error rendering QR code for ${batchNo}:`, e);
          }
        });
      }, 500);
    }
  };

  // ฟังก์ชันสำหรับติดตั้ง QR scanner global
  const setupQrScanner = () => {
    if (typeof window !== 'undefined') {
      window.handleQrCodeScanned = handleQrScan;
    }
  };
  
  /**
   * Handle user logout
   */
  const handleLogout = () => {
    // แสดง confirmation dialog ก่อนทำการ logout
    Modal.confirm({
      title: 'Logout',
      content: 'Are you sure you want to logout?',
      onOk: () => {
        // ลบข้อมูล token และ user จาก localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // นำทางกลับไปยังหน้า login
        router.push('/login');
        
        // แสดงข้อความแจ้งเตือน
        message.success('Logged out successfully');
      },
    });
  };
  
  /**
   * Navigate to Print Log page
   */
  const handleNavigateToPrintLog = () => {
    router.push('/jobs');
  };
  
  /**
   * Navigate to Template Management page
   */
  const handleNavigateToTemplateManagement = () => {
    router.push('/templates');
  };
  
  /**
   * Navigate to Template Designer (Create new template)
   */
  const handleNavigateToTemplateDesigner = () => {
    router.push('/templates/designer');
  };
  
  /**
   * Load user info from localStorage on component mount
   */
  useEffect(() => {
    if (isClient) {
      const userJson = localStorage.getItem('user');
      if (userJson) {
        try {
          const userData = JSON.parse(userJson);
          setUsername(userData.username || 'User');
        } catch (e) {
          console.error('Error parsing user data:', e);
          setUsername('User');
        }
      } else {
        // ถ้าไม่มีข้อมูลผู้ใช้ ให้ใช้ค่าจาก token ถ้ามี
        const token = localStorage.getItem('token');
        if (token) {
          setUsername('User');
        }
      }
    }
  }, []);
  
  // เรียกใช้ setupQrScanner เมื่อคอมโพเนนต์โหลดเสร็จ
  useEffect(() => {
    setupQrScanner();
    
    // ทำการเรียกใช้ initQRCode เมื่อคอมโพเนนต์โหลดเสร็จ
    initQRCode();
  }, []);
  
  // เรียกใช้ initQRCode เมื่อมีการเปลี่ยนแปลงค่า templatePreview
  useEffect(() => {
    if (templatePreview && previewVisible) {
      console.log('templatePreview changed, calling initQRCode');
      setTimeout(() => {
        initQRCode();
      }, 300);
    }
  }, [templatePreview, previewVisible]);

  /* ------------------------------------------------------------------------ */
  /* Helper - Create Elements From Preview                                        */
  /* ------------------------------------------------------------------------ */
  const createElementsFromPreview = () => {
    if (!selectedBatch) return [];
    
    // สร้าง elements จากข้อมูล batch โดยใช้ template ที่เลือกอยู่ในปัจจุบัน
    try {
      const elements = [];
      
      // กำหนดขนาดฟอนต์มาตรฐานสำหรับแต่ละประเภทข้อความ
      const fontSizes = {
        title: 18,        // สำหรับชื่อผลิตภัณฑ์ (Product Name)
        itemKey: 32,      // สำหรับรหัสสินค้า (Item Key)
        label: 16,        // สำหรับป้ายชื่อ (เช่น NET WEIGHT, LOT CODE, BEST BEFORE)
        value: 16,        // สำหรับค่าข้อมูล (ค่า NET WEIGHT, วันที่, เลขที่ batch ฯลฯ)
        secondary: 14,    // สำหรับข้อมูลรอง (เช่น Storage Condition)
        footer: 10        // สำหรับข้อมูลบริษัท และข้อมูลส่วนท้าย
      };
      
      // 1. ชื่อสินค้า (Product Name) - Top Center
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 0,
        y: 10,
        width: 400,
        height: 20,
        text: selectedBatch.productName || '',
        fontSize: fontSizes.title,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'center',
        draggable: true,
        visible: true
      });
      
      // 2. Item Key ขนาดใหญ่ตรงกลาง
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 0,
        y: 32,
        width: 400,
        height: 40,
        text: selectedBatch.itemKey || selectedBatch.productKey || '',
        fontSize: fontSizes.itemKey,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: '#000000',
        align: 'center',
        draggable: true,
        visible: true
      });
      
      // 3. NET WEIGHT - Label
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 25,
        y: 80,
        width: 120,
        height: 20,
        text: 'NET WEIGHT',
        fontSize: fontSizes.label,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'left',
        draggable: true,
        visible: true
      });
      
      // 4. NET WEIGHT - Value with Process Cell
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 150,
        y: 80,
        width: 170,
        height: 20,
        text: `${selectedBatch.netWeight || '25.00'} KG/BAG ${selectedBatch.processCell || '1B'}`,
        fontSize: fontSizes.value,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'left',
        draggable: true,
        visible: true
      });
      
      // 5. LOT CODE - Label
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 25,
        y: 100,
        width: 120,
        height: 20,
        text: 'LOT CODE',
        fontSize: fontSizes.label,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'left',
        draggable: true,
        visible: true
      });
      
      // 6. LOT DATE - Value
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 150,
        y: 100,
        width: 130,
        height: 20,
        text: selectedBatch.lotDate || '',
        fontSize: fontSizes.value,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'left',
        draggable: true,
        visible: true
      });
      
      // 7. BATCH NO - Value (Center)
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 250,
        y: 100,
        width: 80,
        height: 20,
        text: selectedBatch.batchNo || '',
        fontSize: fontSizes.value,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'center',
        draggable: true,
        visible: true
      });
      
      // 8. LINE CODE - Value (Right)
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 400 - 25 - 60,
        y: 100,
        width: 60,
        height: 20,
        text: selectedBatch.lineCode || 'P01B01',
        fontSize: fontSizes.value,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'right',
        draggable: true,
        visible: true
      });
      
      // 9. BEST BEFORE - Label
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 25,
        y: 120,
        width: 120,
        height: 20,
        text: selectedBatch.expiryDateCaption || 'BEST BEFORE',
        fontSize: fontSizes.label,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'left',
        draggable: true,
        visible: true
      });
      
      // 10. BEST BEFORE - Value
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 150,
        y: 120,
        width: 170,
        height: 20,
        text: selectedBatch.bestBeforeDate || '',
        fontSize: fontSizes.value,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'left',
        draggable: true,
        visible: true
      });
      
      // 11. SO NUMBER - Value (Right)
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 400 - 25 - 80,
        y: 120,
        width: 80,
        height: 20,
        text: selectedBatch.soNumber || 'S2508217',
        fontSize: fontSizes.value,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'right',
        draggable: true,
        visible: true
      });
      
      // 12. ALLERGENS
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 25,
        y: 140,
        width: 350,
        height: 20,
        text: selectedBatch.allergensLabel?.startsWith('Allergens :') 
          ? selectedBatch.allergensLabel 
          : `Allergens : ${selectedBatch.allergensLabel || ''}`,
        fontSize: fontSizes.value,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'left',
        draggable: true,
        visible: true
      });
      
      // 13. STORAGE CONDITION
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 25,
        y: 160,
        width: 350,
        height: 20,
        text: `Recommended Storage : ${selectedBatch.storageCondition || ''}`,
        fontSize: fontSizes.secondary,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'left',
        draggable: true,
        visible: true
      });
      
      // 14. MANUFACTURER INFO - แยกเป็นหลายบรรทัด
      if (selectedBatch.manufacturerInfo) {
        // แยกข้อความตามบรรทัด
        const lines = selectedBatch.manufacturerInfo.split('\n');
        
        // แสดงบรรทัดแรกพร้อมหัวข้อ - เป็นชื่อบริษัท
        elements.push({
          id: uuidv4(),
          type: 'text',
          x: 25, 
          y: 185,
          width: 350,
          height: 15,
          text: lines[0] || '',
          fontSize: fontSizes.footer,
          fontFamily: 'Arial',
          fill: '#000000',
          align: 'left',
          draggable: true,
          visible: true
        });
        
        // แสดงที่อยู่ในบรรทัดที่ 2
        if (lines.length > 1) {
          elements.push({
            id: uuidv4(),
            type: 'text',
            x: 25,
            y: 200,
            width: 350,
            height: 15,
            text: lines[1] || '',
            fontSize: fontSizes.footer,
            fontFamily: 'Arial',
            fill: '#000000',
            align: 'left',
            draggable: true,
            visible: true
          });
        }
        
        // แสดงเบอร์โทรในบรรทัดที่ 3
        if (lines.length > 2) {
          elements.push({
            id: uuidv4(),
            type: 'text',
            x: 25,
            y: 215,
            width: 350,
            height: 15,
            text: lines[2] || '',
            fontSize: fontSizes.footer,
            fontFamily: 'Arial',
            fill: '#000000',
            align: 'left',
            draggable: true,
            visible: true
          });
        }
      }
      
      // 15. BARCODE - อยู่ตรงกลางด้านล่าง - ปรับค่าให้ตรงกับที่ใช้ใน JsBarcode
      elements.push({
        id: uuidv4(),
        type: 'barcode',
        x: (400 - 200) / 2, // ปรับให้อยู่ตรงกลางโดยคำนวณจากความกว้างของ canvas (400) ลบด้วยความกว้างของ barcode (200) หารด้วย 2
        y: 235,
        width: 200, // ลดขนาดลงเหลือ 200 เพื่อให้ตรงกับที่ใช้ใน useBatchData
        height: 70, // ลดความสูงเหลือ 70 (ส่วนของ barcode 50px + ส่วนของข้อความ 20px)
        value: selectedBatch.batchNo || '',
        format: 'CODE128',
        fill: '#000000',
        displayValue: true, 
        fontSize: 14,  // ต้องระบุเพื่อให้ขนาดตรงกับที่แสดงใน preview
        fontFamily: 'monospace',  // เปลี่ยนจาก Arial เป็น monospace เพื่อให้ตรงกับที่ใช้ใน ElementRenderer
        fontWeight: 'normal', // เพิ่มเพื่อไม่ให้เป็นตัวหนา
        textAlign: 'center',
        textPosition: 'bottom',
        textMargin: 2,
        background: '#FFFFFF',
        lineColor: '#000000',
        margin: 10, // เพิ่มระยะห่างจาก 5 เป็น 10 เพื่อให้เหมือนกับในหน้า Preview
        draggable: true,
        visible: true
      });
      
      // 16. PRINT DATE TIME - มุมขวาล่าง
      const now = new Date();
      const day = now.getDate().toString().padStart(2, '0');
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const year = now.getFullYear().toString().slice(-2);
      const hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const hrs = (hours % 12 || 12).toString().padStart(2, '0');
      
      const printDateTime = `${day}${month}${year} ${hrs}:${minutes}${ampm}`;
      
      elements.push({
        id: uuidv4(),
        type: 'text',
        x: 400 - 10,
        y: 400 - 10,
        width: 120,
        height: 10,
        text: printDateTime,
        fontSize: 10,
        fontFamily: 'Arial',
        fill: '#000000',
        align: 'right',
        draggable: true,
        visible: true
      });
      
      // 17. QR CODE (ถ้าต้องการ) - มุมขวาบน
      if (generateQRCode) {
        const qrValue = `BATCH:${selectedBatch.batchNo}\nPRODUCT:${selectedBatch.productName}\nLOT:${selectedBatch.lotCode}\nNET_WEIGHT:${selectedBatch.netWeight}\nBEST_BEFORE:${selectedBatch.bestBeforeDate}\nALLERGENS:${selectedBatch.allergensLabel}`;
        
        elements.push({
          id: uuidv4(),
          type: 'qr',
          x: 400 - 5 - 90,
          y: 5,
          width: 90,
          height: 90,
          value: qrValue,
          fill: '#000000',
          draggable: true,
          visible: true
        });
      }
      
      return elements;
    } catch (error) {
      console.error('Error creating elements from preview:', error);
      return [];
    }
  };

  // เพิ่มส่วนแสดง QR popup ในส่วน return
  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header bar with user info */}
      <Layout.Header style={{ 
        background: '#fff', 
        padding: '0 24px', 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
        height: '64px',
        position: 'sticky',
        top: 0,
        zIndex: 1000
      }}>
        {/* Left side - Logo and app name */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Typography.Title level={3} style={{ 
            margin: 15, 
            fontFamily: "'Kanit', 'Prompt', sans-serif", 
            fontWeight: 'bold',
            background: 'linear-gradient(45deg, #5D4037, #8D6E63)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
          }}>
            FG Label System
          </Typography.Title>
        </div>
        
        {/* Right side - User menu */}
        <div>
          <Space>
            {/* User dropdown */}
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'create-template',
                    icon: <PlusOutlined />,
                    label: 'Create Template',
                    onClick: handleNavigateToTemplateDesigner
                  },
                  {
                    key: 'templates',
                    icon: <FileTextOutlined />,
                    label: 'Template Management',
                    onClick: handleNavigateToTemplateManagement
                  },
                  {
                    key: 'printlog',
                    icon: <HistoryOutlined />,
                    label: 'Print Log',
                    onClick: handleNavigateToPrintLog
                  },
                  { type: 'divider' },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: 'Logout',
                    onClick: handleLogout
                  }
                ]
              }}
              trigger={['click']}
            >
              <a onClick={(e) => e.preventDefault()} style={{ 
                color: '#5D4037', 
                display: 'flex', 
                alignItems: 'center',
                background: 'rgba(93, 64, 55, 0.03)',
                padding: '2px 8px',
                borderRadius: '12px',
                border: '1px solid rgba(93, 64, 55, 0.15)',
                boxShadow: '0 1px 1px rgba(0,0,0,0.03)'
              }}>
                <Avatar style={{ 
                  backgroundColor: '#5D4037', 
                  marginRight: 4,
                  boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                  fontSize: '10px'
                }} icon={<UserOutlined />} size="small" />
                <span style={{ 
                  fontWeight: 'bold', 
                  fontSize: '13px',
                  color: '#5D4037'
                }}>{username || 'User'}</span>
                <DownOutlined style={{ fontSize: '9px', marginLeft: 4, color: '#5D4037' }} />
              </a>
            </Dropdown>
          </Space>
        </div>
      </Layout.Header>
      
      <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <Card variant="outlined" style={{ overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <Image
              src="https://img2.pic.in.th/pic/logo14821dedd19c2ad18.png"
              alt="FG Label Logo"
              preview={false}
              width={150}
              style={{ marginBottom: 20 }}
            />
            <Title level={3} style={{ margin: 0, color: '#5D4037', background: 'linear-gradient(45deg, #5D4037, #8D6E63)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Batch Search & Label Print</Title>
            <Text type="secondary">Search, preview and print labels for production batches</Text>
          </div>
          
          <Divider style={{ margin: '12px 0 24px' }} />

          {/* Search Box */}
          <Row justify="center" align="middle" style={{ marginBottom: 24 }}>
            <Col xs={24} md={16}>
              <Input.Search
                id="batch-search-input"
                placeholder="Scan or type batch number..."
                enterButton={<Button type="primary" icon={<BarcodeOutlined />} style={{ 
                  backgroundColor: '#5D4037', 
                  borderColor: '#5D4037',
                  boxShadow: '0 2px 6px rgba(93, 64, 55, 0.2)' 
                }}></Button>}
                allowClear
                value={searchText}
                autoFocus
                onChange={handleSearchInputChange}
                onSearch={handleSearch}
                size="large"
                style={{ width: '100%' }}
              />
              <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                Tip: Scan a 6-digit batch number for automatic display and printing
              </Text>
            </Col>
          </Row>
      
      {loading ? (
        <div style={{ textAlign: 'center', margin: '40px 0', padding: 32 }}>
          <Spin size="large">
            <div style={{ marginTop: 16 }}>Searching batch data...</div>
          </Spin>
        </div>
      ) : batches.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <Table<Batch>
            rowKey="id"
                dataSource={batches}
            pagination={{ pageSize: 10 }}
                style={{ marginTop: 16 }}
                onRow={(record) => ({
                  onClick: () => handlePreviewLabel(record),
                  style: { cursor: 'pointer' }
                })}
            columns={[
              {
                    title: 'Batch No',
                dataIndex: 'batchNo',
                sorter: (a, b) => a.batchNo.localeCompare(b.batchNo),
                    render: (text) => <Text strong>{text}</Text>,
              },
              {
                title: 'Production Date',
                dataIndex: 'productionDate',
                render: (date) => DateHelper.formatDateTime(date) || '-',
              },
              {
                title: 'Total Bags',
                dataIndex: 'totalBags',
                sorter: (a, b) => (a.totalBags || 0) - (b.totalBags || 0),
                render: (bags) => <Text strong>{bags}</Text>,
              },
              {
                title: 'ItemKey',
                dataIndex: 'itemKey',
                render: (text) => <Text strong>{text || '-'}</Text>,
              },
              {
                title: 'CustKey',
                dataIndex: 'custKey',
                render: (text) => <Text strong>{text || '-'}</Text>,
              },
              {
                title: 'Ship To Country',
                dataIndex: 'countryOfOrigin',
                render: (text) => text 
                  ? <Text strong style={{ color: '#1890ff' }}>{text}</Text> 
                  : <Text type="secondary">-</Text>,
              },
              {
                    title: 'Template Name',
                    dataIndex: 'templateName',
                    render: (text) => <Text>{text || '-'}</Text>,
              },
              {
                    title: 'Last Update',
                    dataIndex: 'templateUpdatedAt',
                    render: (date) => DateHelper.formatDateTime(date) || '-',
              },
              {
                    title: 'Action',
                key: 'action',
                    align: 'center',
                render: (_, record) => (
                      <Space>
                        <Tooltip title="Print">
                          <Button 
                            type="primary"
                            icon={<PrinterOutlined />} 
                            loading={isPrinting && selectedBatch?.id === record.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAutoPreviewAndPrint(record);
                            }}
                            style={{ 
                              backgroundColor: '#5D4037', 
                              borderColor: '#5D4037',
                              boxShadow: '0 2px 6px rgba(93, 64, 55, 0.2)' 
                            }}
                          />
                        </Tooltip>
                  </Space>
                ),
              },
            ]}
          />
        </div>
      ) : searchText.trim() !== '' && (
            <Empty 
              description="No batch found" 
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ margin: '40px 0', padding: 32 }}
            />
          )}
        </Card>
      
        
        {/* Print Preview Modal */}
        <Modal
          title={`Print Preview: ${selectedBatch?.batchNo}`}
          open={printModalVisible}
          onCancel={() => setPrintModalVisible(false)}
          width={1000}
          styles={{
            body: { padding: '20px' },
          }}
          footer={[
            <Button 
              key="close" 
              onClick={() => setPrintModalVisible(false)}
            >
              Close
            </Button>,
            <Button
              key="edit"
              icon={<EditOutlined />}
              onClick={() => {
                if (selectedBatch && selectedBatch.templateId) {
                  // ถ้าเป็น Special Label ให้นำทางไปหน้า Template Designer โดยตรง
                  if (isSpecialLabel) {
                    router.push(`/templates/designer?id=${selectedBatch.templateId}`);
                    return;
                  }
                  
                  // ถ้าเป็น Standard Label ให้ใช้วิธีเดิม
                  try {
                    // ก่อนที่จะไปยังหน้า Template Designer ให้เก็บข้อมูล elements ของ preview ลงใน localStorage
                    const elements = createElementsFromPreview();
                    
                    if (elements.length > 0) {
                      // สร้าง template ใหม่ที่มาจากข้อมูล elements ใน preview
                      const previewTemplate = {
                        name: selectedBatch.templateName || `Template-${selectedBatch.batchNo}`,
                        description: `Auto-generated from batch ${selectedBatch.batchNo}`,
                        productKey: selectedBatch.itemKey || selectedBatch.productKey,
                        customerKey: selectedBatch.custKey,
                        paperSize: '4x4',
                        orientation: 'Portrait',
                        templateType: 'Standard',
                        labelType: 'Standard',
                        elements: elements,
                        canvasSize: { width: 400, height: 400 }
                      };
                      
                      // เก็บข้อมูล preview template ลงใน localStorage
                      localStorage.setItem('batchSearchTemplate', JSON.stringify(previewTemplate));
                      
                      // ถ้ามี templateId ให้ไปที่หน้า Template Designer ด้วย id ของ template
                      if (selectedBatch.templateId) {
                        router.push(`/templates/designer?id=${selectedBatch.templateId}&batchNo=${selectedBatch.batchNo}&labelType=Standard&productKey=${selectedBatch.itemKey || selectedBatch.productKey || ''}&customerKey=${selectedBatch.custKey || ''}`);
                      } else {
                        // ถ้าไม่มี templateId ให้ไปที่หน้า Template Designer แบบสร้างใหม่ด้วยข้อมูลจาก localStorage
                        router.push(`/templates/designer?batchNo=${selectedBatch.batchNo}&labelType=Standard&productKey=${selectedBatch.itemKey || selectedBatch.productKey || ''}&customerKey=${selectedBatch.custKey || ''}`);
                      }
                    } else {
                      // ถ้าไม่สามารถสร้าง elements ได้ ให้ไปที่หน้า Template Designer ด้วย id ของ template แบบเดิม
                      router.push(`/templates/designer?id=${selectedBatch.templateId}`);
                    }
                  } catch (error) {
                    console.error('Error preparing template for edit:', error);
                    message.error('Failed to prepare template for editing');
                  }
                }
              }}
            >
              Edit Template
            </Button>,
            <Button
              key="print"
              type="primary"
              icon={<PrinterOutlined />}
              onClick={handleSystemPrint}
              loading={isPrinting}
              style={{ 
                backgroundColor: '#5D4037', 
                borderColor: '#5D4037',
                boxShadow: '0 2px 6px rgba(93, 64, 55, 0.2)' 
              }}
              disabled={!selectedBatch} // แก้ไขโดยลบเงื่อนไข || !generateQRCode
            >
              Print
            </Button>,
          ]}
        >
          {selectedBatch && (
            <Row gutter={[24, 24]} style={{ width: '100%' }}>
              {/* Print Options - Left Side */}
              <Col xs={24} md={10}>
                <Card title="Print Options" size="small" style={{ height: '100%' }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {/* Production Date picker - NEW */}
                    <div>
                      <Text strong>Production Date:</Text>
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center' }}>
                        <Input
                          type="date"
                          value={selectedProductionDate || ''}
                          onChange={(e) => setSelectedProductionDate(e.target.value)}
                          style={{ width: '100%', marginRight: 8 }}
                          disabled={isSpecialLabel} // ปิดการแก้ไขถ้าเป็น Special Label
                        />
                        <Button 
                          type="primary"
                          icon={<SyncOutlined />}
                          onClick={handleResyncPreview}
                          loading={isResyncingPreview}
                          disabled={isSpecialLabel} // ปิดการกด Resync ถ้าเป็น Special Label
                          style={{ 
                            backgroundColor: '#5D4037', 
                            borderColor: '#5D4037',
                            boxShadow: '0 2px 6px rgba(93, 64, 55, 0.2)' 
                          }}
                        >
                          Resync
                        </Button>
                      </div>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {isSpecialLabel 
                          ? 'Production date cannot be changed for Special Labels' 
                          : 'Change production date and click Resync to update the preview'}
                      </Text>
                    </div>
                    
                    <Divider style={{ margin: '16px 0' }} />
                    
                    <div>
                      <Text strong>Bag Range:</Text>
                      <div style={{ marginTop: 8 }}>
                        <Space>
                          <InputNumber 
                            min={1} 
                            max={selectedBatch.totalBags} 
                            value={startBag} 
                            onChange={(value) => setStartBag(value || 1)}
                            addonBefore="From"
                            style={{ width: 120 }}
                          />
                          <InputNumber 
                            min={startBag} 
                            max={selectedBatch.totalBags} 
                            value={endBag} 
                            onChange={(value) => setEndBag(value || startBag)}
                            addonBefore="To"
                            style={{ width: 120 }}
                          />
                        </Space>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center' }}>
                        <Button 
                          size="small"
                          onClick={() => {
                            setStartBag(1);
                            setEndBag(selectedBatch.totalBags || 1);
                          }}
                          style={{ marginRight: 16 }}
                        >
                          All Bags
                        </Button>
                        <div>
                          <Tooltip title="Generate QR code with batch data">
                            <Space align="start" direction="vertical">
                              <Space>
                                <input 
                                  type="checkbox" 
                                  checked={generateQRCode} 
                                  onChange={(e) => setGenerateQRCode(e.target.checked)}
                                  id="generate-qrcode"
                                  disabled={isSpecialLabel} // ปิดการใช้งานถ้าเป็น Special Label
                                />
                                <label 
                                  htmlFor="generate-qrcode"
                                  style={{ color: isSpecialLabel ? '#d9d9d9' : 'inherit' }}
                                >
                                  Generate QR Code
                                </label>
                              </Space>
                              {isSpecialLabel && (
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                  QR code generation is disabled for Special Labels
                                </Text>
                              )}
                            </Space>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                    
                    <Divider style={{ margin: '16px 0' }} />
                    
                    <div>
                      <Text strong>Special Labels:</Text>
                      <div style={{ marginTop: 8 }}>
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Tooltip title="QC Sample labels have black bottoms with white text">
                            <Space>
                              <input 
                                type="checkbox" 
                                checked={qcSample} 
                                onChange={(e) => setQcSample(e.target.checked)}
                                id="qc-sample"
                              />
                              <label htmlFor="qc-sample">QC Sample</label>
                            </Space>
                          </Tooltip>
                          
                          <Tooltip title="Formula Sheet labels for batch documentation">
                            <Space>
                              <input 
                                type="checkbox" 
                                checked={formSheet} 
                                onChange={(e) => setFormSheet(e.target.checked)}
                                id="formula-sheet"
                              />
                              <label htmlFor="formula-sheet">Formulation Sheet</label>
                            </Space>
                          </Tooltip>
                          
                          <Tooltip title="Pallet Tags labels for identifying pallets">
                            <Space>
                              <input 
                                type="checkbox" 
                                checked={palletTag} 
                                onChange={(e) => setPalletTag(e.target.checked)}
                                id="pallet-tag"
                              />
                              <label htmlFor="pallet-tag">Pallet Tags</label>
                            </Space>
                          </Tooltip>
                        </Space>
                      </div>
                    </div>

                    <Divider style={{ margin: '16px 0' }} />
                    
                    <div style={{ textAlign: 'center' }}>
                      <Text type="secondary" strong>
                        {startBag === endBag 
                          ? `Printing bag ${startBag}` 
                          : `Printing bags ${startBag} to ${endBag}`}
                        {qcSample || formSheet || palletTag 
                          ? ` + ${[qcSample && 'QC Sample', formSheet && 'Formulation Sheet', palletTag && 'Pallet Tag'].filter(Boolean).join(', ')}` 
                          : ''}
                      </Text>
                    </div>
                  </Space>
                </Card>
              </Col>
              
              {/* Label Preview - Right Side */}
              <Col xs={24} md={14}>
                <div 
                  style={{ 
                    width: '400px', 
                    height: '400px', 
                    border: '1px solid #ddd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    backgroundColor: '#fff',
                    margin: '0 auto'
                  }}
                >
                  {loadingPreview || isResyncingPreview ? (
                    <Spin>
                      <div style={{ marginTop: 16 }}>Loading preview...</div>
                    </Spin>
                  ) : (
                    <div
                      ref={previewContainerRef}
                      style={{ width: '100%', height: '100%' }}
                      dangerouslySetInnerHTML={{ __html: templatePreview || '<div style="display:flex;justify-content:center;align-items:center;height:100%;">No preview available</div>' }}
                    />
                  )}
                </div>
              </Col>
            </Row>
          )}
        </Modal>
        
        {/* Hidden iframe for printing */}
        <iframe 
          ref={printFrameRef} 
          style={{ display: 'none' }} 
          title="Print Frame"
        />
        
        {/* QR Code Scan Popup */}
        <Modal
          title="ข้อมูลจากการสแกน QR Code"
          open={qrPopupVisible}
          onCancel={() => setQrPopupVisible(false)}
          width={500}
          footer={[
            <Button key="close" onClick={() => setQrPopupVisible(false)}>
              ปิด
            </Button>
          ]}
        >
          {qrScanData ? (
            <List
              bordered
              itemLayout="horizontal"
              dataSource={Object.entries(qrScanData || {})}
              renderItem={(item: [string, any]) => (
                <List.Item>
                  <List.Item.Meta
                    title={<div style={{ fontWeight: 'bold', fontSize: '16px' }}>{item[0]}</div>}
                    description={<div style={{ fontSize: '14px', marginTop: '5px' }}>{String(item[1])}</div>}
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty description="ไม่พบข้อมูล QR code" />
          )}
        </Modal>
      </Content>
    </Layout>
  );
};

// แก้ไขการส่งออกคอมโพเนนต์เพื่อแก้ไขข้อผิดพลาด Type
function BatchSearchPage() {
  return (
  <RequireAuth>
    <BatchSearch />
  </RequireAuth>
); 
}

export default BatchSearchPage; 