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
  Popover
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  PrinterOutlined,
  EditOutlined,
  BarcodeOutlined,
  SyncOutlined,
  FileOutlined
} from '@ant-design/icons';
import axios from 'axios';
import RequireAuth from '../components/RequireAuth';
import LabelPreview from '../components/LabelPreview';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';

// เพิ่มการนำเข้า Option จาก Select
const { Option } = Select;

// เพิ่ม type declaration สำหรับ QRCode ใน Window interface
declare global {
  interface Window {
    QRCode: any;
    JsBarcode: any;
    renderAllBarcodes?: () => void; // เพิ่มฟังก์ชัน renderAllBarcodes
    handleQrCodeScanned?: (data: string) => void; // เพิ่มฟังก์ชัน handleQrCodeScanned
  }
}

// Check if we're on client-side
const isClient = typeof window !== 'undefined';

// Import client-only modules
let QRCode: any = null;
let JsBarcode: any = null;
if (isClient) {
  // ทำการโหลด JsBarcode ทันทีเมื่อหน้าเว็บโหลดเสร็จ
  try {
  QRCode = require('qrcode');
  JsBarcode = require('jsbarcode');
    
    // ตรวจสอบว่าไลบรารีถูกโหลดหรือไม่
    window.addEventListener('DOMContentLoaded', () => {
      if (typeof JsBarcode === 'undefined' || JsBarcode === null) {
        console.warn('JsBarcode not loaded during initialization, attempting to load dynamically');
        const script = document.createElement('script');
        script.id = 'jsbarcode-script';
        script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
        script.onload = function() {
          console.log('JsBarcode loaded dynamically');
          // กำหนดค่า JsBarcode ให้กับตัวแปรโกลบอล
          JsBarcode = window.JsBarcode;
        };
        document.head.appendChild(script);
      }
    });
  } catch (e) {
    console.error('Error loading barcode libraries:', e);
  }
}

const { Content } = Layout;
const { Title, Text } = Typography;

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
  if (!productionDate) {
    return '';
  }

  try {
    console.log('Input values:', { productionDate, shelfLifeDays, daysToExpire });
    const prodDate = dayjs(productionDate);
    if (!prodDate.isValid()) {
      return '';
    }
    
    console.log('Parsed production date:', prodDate.format('DD/MM/YYYY'));

    // เตรียมวันเริ่มต้นที่จะใช้ในการคำนวณ - เริ่มจากวันถัดไปของวันผลิต
    const startDate = prodDate.add(1, 'day'); // เริ่มนับจากวันถัดไป
    console.log('Start date for calculation:', startDate.format('DD/MM/YYYY'));
    
    // According to calculation rules:
    // IF {BME_LABEL.SHELFLIFE_DAY} > 0                                 THEN {@Batch Production Date}+{BME_LABEL_WIP.SHELFLIFE_DAY}
    // IF {BME_LABEL.SHELFLIFE_DAY} = 0 and {INMAST.DaysToExpire} = 0   THEN {@Batch Production Date}+{INMAST.DaysToExpire}
    // IF {BME_LABEL.SHELFLIFE_DAY} = 0 AND ISNULL({INMAST.DaysToExpire}) THEN {@Batch Production Date}+30
    // ELSE {@Batch Production Date}+{BME_LABEL.SHELFLIFE_DAY}
    
    let resultDate = '';
    
    if (shelfLifeDays && shelfLifeDays > 0) {
      // หากมีค่า shelfLifeDays และมีค่ามากกว่า 0
      resultDate = startDate.add(shelfLifeDays - 1, 'day').format('DD/MM/YYYY');
      console.log(`Calculated with shelfLifeDays (${shelfLifeDays}):`, resultDate);
    } else if (shelfLifeDays === 0 && daysToExpire === 0) {
      // หากทั้ง shelfLifeDays และ daysToExpire เป็น 0
      resultDate = startDate.add(daysToExpire - 1, 'day').format('DD/MM/YYYY');
      console.log(`Calculated with daysToExpire (${daysToExpire}):`, resultDate);
    } else if (shelfLifeDays === 0 && daysToExpire === null) {
      // หากไม่มีค่า shelfLifeDays และไม่มีค่า daysToExpire (null)
      resultDate = startDate.add(29, 'day').format('DD/MM/YYYY'); // 30 - 1 = 29 days
      console.log('Calculated with default (30 days):', resultDate);
    } else {
      // กรณีอื่นๆ
      resultDate = startDate.add((shelfLifeDays || 0) - 1, 'day').format('DD/MM/YYYY');
      console.log(`Calculated with fallback (${shelfLifeDays || 0}):`, resultDate);
    }
    
    console.log('Final Best Before date:', resultDate);
    return resultDate;
  } catch (error) {
    console.error('Error calculating best before date:', error);
    return '';
    }
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
  
  // คำนวณ Best Before Date ถ้าไม่มีข้อมูล
  if (!expiryDate && productionDate) {
    try {
      // ใช้ DateHelper.calculateBestBefore แทนการคำนวณแบบเดิม
      const shelfLifeDays = parseInt(getRecordValue('shelfLifeDays') || getRecordValue('SHELFLIFE_DAY') || '540', 10);
      const daysToExpire = parseInt(getRecordValue('DaysToExpire') || '0', 10);
      expiryDate = DateHelper.calculateBestBefore(productionDate, shelfLifeDays, daysToExpire);
      
      // แปลงจากรูปแบบ DD/MM/YYYY เป็น YYYY-MM-DD สำหรับเก็บในตัวแปร expiryDate
      if (expiryDate) {
        const parts = expiryDate.split('/');
        if (parts.length === 3) {
          expiryDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }
      
      console.log('Calculated expiry date:', expiryDate);
    } catch (e) {
      console.error('Error calculating expiry date:', e);
    }
  }
  
  // ใช้ฟังก์ชัน formatDate เพื่อรูปแบบวันที่ที่ถูกต้อง "06 May 2025"
  const lotDate = DateHelper.formatDate(getRecordValue('lotDate') || getRecordValue('LOT CODE') || productionDate);
  const bestBeforeDate = DateHelper.formatDate(getRecordValue('bestBeforeDate') || expiryDate || getRecordValue('BEST BEFORE'));
  
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
  const countryOfOrigin = getRecordValue('COUNTRYOFORIGIN') || '';
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
    shelfLifeDays: parseInt(getRecordValue('shelfLifeDays') || getRecordValue('SHELFLIFE_DAY') || '540', 10),
    palletNo,
    bagNo,
    bagSequence: Math.round(parseInt(getRecordValue('bagSequence') || '0') || 0),
    bagPosition: getRecordValue('bagPosition') || '0',
    printCount: Math.round(parseInt(getRecordValue('printCount') || '0') || 0),
    printDate: new Date().toISOString().split('T')[0],
    totalBags,
    daysToExpire: parseInt(getRecordValue('DaysToExpire') || '0', 10),
    expiryDateCaption,
    manufacturerInfo,
    batchWithPallet: `${batchNo} ${lineCode}`,
    allergenOverride: getRecordValue('allergenOverride') || '',
    countryOfOrigin,
    itemKey: getRecordValue('ItemKey') || '',
    custKey: getRecordValue('CustKey') || '',
    templateId: parseInt(getRecordValue('TemplateID') || '0', 10) || undefined,
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
      text: batch.productKey || '',
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
      text: batch.productName || '',
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
      text: batch.processCell || '',
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
      text: `${batch.netWeight || '25.00'} KG/BAG`,
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
      text: batch.processCell || '1B',
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
      text: batch.lotDate || '',
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
      text: batch.expiryDateCaption || 'BEST BEFORE:',
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
      text: batch.bestBeforeDate || '',
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
      text: batch.soNumber || 'S2508217',
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
      text: `Allergens : ${batch.allergensLabel || ''}`,
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
      text: `Recommended Storage : ${batch.storageCondition || ''}`,
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
      text: batch.manufacturerInfo || 'MANUFACTURED BY : Newly Weds Foods (Thailand) Limited\n909 Moo 15, Teparak Road, T.Bangsaothong, A.Bangsaothong, Samutprakarn 10570\nThailand Phone (662) 3159000 Fax (662) 3131638-9',
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
      width: 300,
      height: 80,
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

const BatchSearch: React.FC = () => {
  // State variables
  const [searchText, setSearchText] = useState<string>('');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [previewVisible, setPreviewVisible] = useState<boolean>(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  
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
  
  // Refs
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [printingBags, setPrintingBags] = useState<string>('');
  const [showPrintDialog, setShowPrintDialog] = useState<boolean>(false);
  
  // เพิ่ม state สำหรับ QR popup
  const [qrScanData, setQrScanData] = useState<any>(null);
  const [qrPopupVisible, setQrPopupVisible] = useState<boolean>(false);
  
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
                margin: 5,
                textAlign: "center",
                textPosition: "bottom",
                textMargin: 2
              });
            }
          } else {
            console.warn('JsBarcode library not loaded yet');
            // โหลด JsBarcode ถ้ายังไม่มี
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
            script.onload = function() {
              const barcodeElement = document.getElementById(`barcode-${selectedBatch.batchNo}`);
              if (barcodeElement) {
                window.JsBarcode(barcodeElement, selectedBatch.batchNo, {
                  format: 'CODE128',
                  width: 2,
                  height: 50,
                  displayValue: true,
                  fontSize: 14,
                  margin: 5,
                  textAlign: "center",
                  textPosition: "bottom",
                  textMargin: 2
                });
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
      
      const apiUrl = `${ApiHelper.getApiBaseUrl()}/batches/labelview?batchNo=${encodeURIComponent(searchQuery)}`;
      console.log('Fetching from API URL:', apiUrl);
      
      // ใช้ headers ที่มี Authorization
      const headers = ApiHelper.getAuthHeaders();
      
      // ใช้ axios โดยตรงแทนที่จะใช้ api instance เพื่อให้สามารถกำหนด URL ที่ถูกต้องได้
      const response = await axios.get(apiUrl, { headers });
      console.log('API response:', response);
      
      if (response.data && Array.isArray(response.data)) {
        // กรองข้อมูลที่ซ้ำกันออก โดยใช้ batchNo เป็นเกณฑ์
        const uniqueData = response.data.filter((item, index, self) =>
          index === self.findIndex((t) => t.batchNo === item.batchNo)
        );
        
        const processedData = uniqueData.map(batch => extractBatchData(batch));
        setBatches(processedData);
        console.log('Processed batches:', processedData);
        
        // ถ้ามีข้อมูลเพียงรายการเดียว ให้แสดง preview และเตรียมพิมพ์อัตโนมัติ
        if (processedData.length === 1) {
          handleAutoPreviewAndPrint(processedData[0]);
        }
      } else if (response.data) {
        // ถ้าข้อมูลไม่ใช่ array แต่เป็น object เดียว
        const processedData = [extractBatchData(response.data)];
        setBatches(processedData);
        console.log('Processed single batch:', processedData);
        
        // แสดง preview และเตรียมพิมพ์อัตโนมัติ
        if (processedData.length === 1) {
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
        message.error(`API Error (${error.response.status}): ${error.response.data?.message || 'Unknown error'}`);
        
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
        message.error('No response from server. Please check your network connection.');
      } else {
        // มีข้อผิดพลาดในการตั้งค่า request
        message.error(`Error: ${error.message}`);
      }
      
      // ไม่ใช้ mock data ตามที่ผู้ใช้ต้องการ
      setBatches([]);
    } finally {
      setLoading(false);
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
      
      // ถ้ามี templateId ให้โหลด template จาก API
      if (batch.templateId) {
        try {
          const response = await loadTemplateById(batch.templateId);
          
          // สร้าง HTML preview
          const { width: canvasWidth, height: canvasHeight } = TemplateHelper.getTemplateDimensions(response);
          const previewHtml = generatePreviewHtml(canvasWidth, canvasHeight, batch);
          setTemplatePreview(previewHtml);
          
          message.success('Template preview loaded successfully');
        } catch (error) {
          console.error('Error loading template:', error);
          
          // ถ้าโหลด template ไม่สำเร็จ ให้สร้าง standard template
          const standardTemplate = createStandardTemplate(batch);
          const { width: canvasWidth, height: canvasHeight } = TemplateHelper.getTemplateDimensions(standardTemplate);
          const previewHtml = generatePreviewHtml(canvasWidth, canvasHeight, batch);
          setTemplatePreview(previewHtml);
          
          message.warning('Using standard template as fallback');
        }
      } else {
        // ถ้าไม่มี templateId ให้สร้าง standard template
        const standardTemplate = createStandardTemplate(batch);
        const { width: canvasWidth, height: canvasHeight } = TemplateHelper.getTemplateDimensions(standardTemplate);
        const previewHtml = generatePreviewHtml(canvasWidth, canvasHeight, batch);
        setTemplatePreview(previewHtml);
        
        message.info('Using standard template');
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
      
      // คำนวณวันหมดอายุใหม่
      let bestBefore = null;
      if (selectedProductionDate) {
        bestBefore = DateHelper.calculateBestBefore(
          selectedProductionDate,
          selectedBatch.shelfLifeDays,
          selectedBatch.daysToExpire
        );
        
        // ปรับปรุงค่าวันหมดอายุใน newBatch
        if (bestBefore) {
          const bestBeforeDate = dayjs(bestBefore, 'DD/MM/YYYY').toDate();
          newBatch.expiryDate = dayjs(bestBeforeDate).format('YYYY-MM-DD');
        }
      }
      
      console.log('Resyncing preview with new production date:', selectedProductionDate);
      console.log('New best before date:', bestBefore);
      console.log('Updated batch data:', newBatch);
      
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
      if (formSheet) specialLabels.push("FORMULA SHEET");
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
          
          // สร้าง HTML header
          let printHTML = `
            <!DOCTYPE html>
            <html>
              <head>
                <title>Label Print - ${selectedBatch.batchNo}</title>
                <style>
                  @page { 
                    size: 4in 4in; 
                    margin: 0;
                    page-break-after: always;
                  }
                  body { 
                    margin: 0; 
                    padding: 0;
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
                </style>
                <!-- เพิ่ม JsBarcode ทันทีในส่วนหัว -->
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                <!-- เพิ่ม QRCode library ด้วย -->
                <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.0/build/qrcode.min.js"></script>
                <script>
                  // ฟังก์ชันสำหรับแสดง barcode ในทุกหน้า
                  function renderAllBarcodes() {
                    try {
                      // ค้นหา barcode elements ทั้งหมด
                      const barcodeElements = document.querySelectorAll('[id^="barcode-"]');
                      barcodeElements.forEach(element => {
                        // ดึง batchNo จาก id
                        const batchNo = element.id.replace('barcode-', '');
                        // แสดง barcode
                        JsBarcode(element, batchNo, {
                          format: "CODE128",
                          width: 2,
                          height: 50,
                          displayValue: true,
                          fontSize: 14,
                          margin: 5
                        });
                      });
                      
                      // ค้นหา QR code elements ทั้งหมด
                      const qrElements = document.querySelectorAll('[id^="qrcode-"]');
                      qrElements.forEach(element => {
                        // ดึง batchNo จาก id
                        const batchNo = element.id.replace('qrcode-', '');
                        // สร้างข้อมูลสำหรับ QR code
                        const qrValue = element.getAttribute('data-qr-value') || batchNo;
                        
                        // แสดง QR code
                        if (window.QRCode) {
                          QRCode.toCanvas(element, qrValue, {
                            width: 80,
                            margin: 1
                          });
                        }
                      });
                    } catch(e) {
                      console.error('Error rendering codes:', e);
                    }
                  }
                  
                  // รอให้เอกสารโหลดเสร็จแล้วค่อยแสดง barcode และ QR code
                  window.onload = renderAllBarcodes;
                </script>
              </head>
              <body>
          `;
          
          // สร้างฉลากสำหรับแต่ละถุง
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
          
          // เพิ่มฉลากพิเศษ (QC, Formula Sheet, Pallet Tag)
          specialLabels.forEach(labelType => {
            printHTML += `
              <div class="label-container special-label" data-label-type="${labelType}">
                ${templatePreview}
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
              // แสดง barcode และ QR code ทันทีเมื่อโหลดเสร็จ
              if (iframe.contentWindow && iframe.contentWindow.renderAllBarcodes) {
                iframe.contentWindow.renderAllBarcodes();
              }
              
              setTimeout(() => {
                if (iframe.contentWindow) {
                  iframe.contentWindow.focus();
                  iframe.contentWindow.print();
                  
                  // แก้ไขปัญหา optional chaining
                  const contentWindow = iframe.contentWindow;
                  if (contentWindow) {
                    contentWindow.onafterprint = () => {
                      setIsPrinting(false);
                    };
                  }
                }
              }, 800); // เพิ่มเวลารอให้นานขึ้นเพื่อให้แน่ใจว่า barcode และ QR code แสดงเรียบร้อยแล้ว
              
              // กรณีที่ onafterprint ไม่ทำงาน ให้เซ็ต timeout เพื่อยกเลิกสถานะ printing
              setTimeout(() => {
                setIsPrinting(false);
              }, 5000);
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
                  margin: 5
                });
              }
            } catch(e) {
              console.error("Error rendering barcode:", e);
            }
          }, 100);
        </script>
      `;
      
      // แสดง BARCODE ด้านล่าง - แก้ไขให้อยู่ตรงกลางอย่างแท้จริง
      html += `<div style="position:absolute;top:235px;left:0;width:100%;text-align:center;margin:0 auto;display:flex;justify-content:center;align-items:center;">`;
      html += `<svg id="barcode-${batchNo}" width="300" height="70" style="display:block;margin:0 auto;"></svg>`;
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
                    margin: 5
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
    
    // ตรวจสอบว่า QRCode ถูกโหลดแล้วหรือยัง
    if (typeof window.QRCode === 'undefined') {
      // ถ้ายังไม่ถูกโหลดให้ลองโหลดจาก module
      try {
        import('qrcode').then(qrcodeModule => {
          window.QRCode = qrcodeModule.default || qrcodeModule;
          console.log('QRCode library loaded successfully');
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
    }
  };

  // ฟังก์ชันสำหรับติดตั้ง QR scanner global
  const setupQrScanner = () => {
    if (typeof window !== 'undefined') {
      // กำหนด global function สำหรับการสแกน QR code
      window.handleQrCodeScanned = (data: string) => {
        handleQrScan(data);
      };
      
      // เพิ่ม event listener สำหรับการสแกน QR code จากภายนอก
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'qrcode_scanned') {
          handleQrScan(event.data.content);
        }
      });
    }
  };

  // เรียกใช้ setupQrScanner เมื่อโหลดหน้า
  useEffect(() => {
    setupQrScanner();
  }, []);

  // เพิ่มส่วนแสดง QR popup ในส่วน return
  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <Card variant="outlined" style={{ overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          {/* Header with Logo */}
          <Row justify="center" style={{ marginBottom: 24 }}>
            <Col>
              <div style={{ textAlign: 'center' }}>
                <Image
                  src="https://img2.pic.in.th/pic/logo14821dedd19c2ad18.png"
                  alt="FG Label Logo"
                  preview={false}
                  width={140}
                  style={{ marginBottom: 8 }}
                />
                <Title level={3} style={{ margin: 0, color: '#1890ff' }}>FG Label System</Title>
                <Text type="secondary">Batch Search & Label Print</Text>
              </div>
            </Col>
          </Row>
          
          <Divider style={{ margin: '12px 0 24px' }} />

          {/* Search Box */}
          <Row justify="center" align="middle" style={{ marginBottom: 24 }}>
            <Col xs={24} md={16}>
              <Input.Search
                id="batch-search-input"
                placeholder="Scan or type batch number..."
                enterButton={<Button type="primary" icon={<SearchOutlined />}>Search</Button>}
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
                    title: 'Product',
                dataIndex: 'productKey',
                    render: (text, record) => (
                      <div>
                        <div><Text strong>{text}</Text></div>
                        <div><Text type="secondary" ellipsis>{record.productName}</Text></div>
                      </div>
                    ),
              },
              {
                title: 'Production Date',
                dataIndex: 'productionDate',
                render: (date) => DateHelper.formatDateTime(date) || '-',
              },
              {
                    title: 'Best Before',
                    key: 'bestBefore',
                    render: (_, record) => 
                      DateHelper.calculateBestBefore(
                        record.productionDate, 
                        record.shelfLifeDays, 
                        record.daysToExpire
                      ) || '-',
                  },
                  {
                    title: 'Bags',
                dataIndex: 'totalBags',
                sorter: (a, b) => a.totalBags - b.totalBags,
                    render: (bags) => <Text strong>{bags}</Text>,
              },
              {
                    title: 'Action',
                key: 'action',
                    align: 'center',
                render: (_, record) => (
                      <Space>
                        <Tooltip title="Preview">
                    <Button 
                      icon={<EyeOutlined />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreviewLabel(record);
                            }} 
                          />
                        </Tooltip>
                        <Tooltip title="Print">
                          <Button 
                            type="primary"
                            icon={<PrinterOutlined />} 
                            loading={isPrinting && selectedBatch?.id === record.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAutoPreviewAndPrint(record);
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
      
      {/* LabelPreview component */}
      {selectedBatch && (
        <LabelPreview
          visible={previewVisible}
          onClose={handleClosePreview}
          batchNo={selectedBatch.batchNo}
          bagNo={selectedBatch.bagNo}
          templateId={selectedBatch.templateId}
          apiEndpoint="/batches/preview"
        />
      )}
        
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
                if (selectedBatch?.templateId) {
                  window.location.href = `/templates/designer/${selectedBatch.templateId}`;
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
                        />
                        <Button 
                          type="primary"
                          icon={<SyncOutlined />}
                          onClick={handleResyncPreview}
                          loading={isResyncingPreview}
                        >
                          Resync
                        </Button>
                      </div>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        Change production date and click Resync to update the preview
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
                                />
                                <label htmlFor="generate-qrcode">Generate QR Code</label>
                              </Space>
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
                              <label htmlFor="formula-sheet">Formula Sheet</label>
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
                          ? ` + ${[qcSample && 'QC Sample', formSheet && 'Formula Sheet', palletTag && 'Pallet Tag'].filter(Boolean).join(', ')}` 
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