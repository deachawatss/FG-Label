import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Layout, Button, Divider, InputNumber, Modal, message, Tooltip, Input, Upload, Select } from 'antd';
import { PlusOutlined, SaveOutlined, DownloadOutlined, UploadOutlined, UndoOutlined, RedoOutlined, DeleteOutlined, ZoomInOutlined, ZoomOutOutlined, SettingOutlined, FileImageOutlined, FontSizeOutlined, BarcodeOutlined, QrcodeOutlined, AppstoreAddOutlined, EyeInvisibleOutlined, LockOutlined, UnlockOutlined, CopyOutlined, GroupOutlined, RotateRightOutlined, SyncOutlined, MinusOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

// ตรวจสอบว่าอยู่ในฝั่ง client
const isClient = typeof window !== 'undefined';

// นำเข้าโมดูลที่ทำงานเฉพาะฝั่ง client
let QRCode: any = null;
let JsBarcode: any = null;
let Stage: any = null;
let Layer: any = null;
let Rect: any = null;
let Text: any = null;
let Group: any = null;
let Transformer: any = null;
let Image: any = null;
let Line: any = null;

if (isClient) {
  QRCode = require('qrcode');
  JsBarcode = require('jsbarcode');
  const Konva = require('react-konva');
  Stage = Konva.Stage;
  Layer = Konva.Layer;
  Rect = Konva.Rect;
  Text = Konva.Text;
  Group = Konva.Group;
  Transformer = Konva.Transformer;
  Image = Konva.Image;
  Line = Konva.Line;
}

import { useRouter } from 'next/router';
import { truncateString } from '@/utils/string';

// ฟังก์ชันคำนวณวันหมดอายุตามเงื่อนไขที่กำหนด
function calculateBestBefore(
  productionDate: string | Date | null, 
  shelfLifeDays?: number | null,
  daysToExpire?: number | null
): string {
  if (!productionDate) {
    return '';
  }

  try {
    const prodDate = dayjs(productionDate);
    if (!prodDate.isValid()) {
      return '';
    }

    // ตามเงื่อนไขการคำนวณ:
    // IF {BME_LABEL.SHELFLIFE_DAY} > 0                                 THEN {@Batch Production Date}+{BME_LABEL_WIP.SHELFLIFE_DAY}
    // IF {BME_LABEL.SHELFLIFE_DAY} = 0 and {INMAST.DaysToExpire} = 0   THEN {@Batch Production Date}+{INMAST.DaysToExpire}
    // IF {BME_LABEL.SHELFLIFE_DAY} = 0 AND ISNULL({INMAST.DaysToExpire}) THEN {@Batch Production Date}+30
    // ELSE {@Batch Production Date}+{BME_LABEL.SHELFLIFE_DAY}
    
    if (shelfLifeDays && shelfLifeDays > 0) {
      return prodDate.add(shelfLifeDays, 'day').format('DD/MM/YYYY');
    } else if (shelfLifeDays === 0 && daysToExpire === 0) {
      return prodDate.add(daysToExpire, 'day').format('DD/MM/YYYY');
    } else if (shelfLifeDays === 0 && daysToExpire === null) {
      return prodDate.add(30, 'day').format('DD/MM/YYYY');
    } else {
      return prodDate.add(shelfLifeDays || 0, 'day').format('DD/MM/YYYY');
    }
  } catch (error) {
    console.error('Error calculating best before date:', error);
    return '';
  }
}

const { Header, Sider, Content } = Layout;
const { Option } = Select;

// ประกาศคอมโพเนนต์ Memoized สำหรับ Konva elements เพื่อเพิ่มประสิทธิภาพ
const MemoGroup = React.memo(Group);
const MemoText = React.memo(Text);
const MemoRect = React.memo(Rect);
const MemoKonvaImage = React.memo(Image);
const MemoLine = React.memo(Line);

const CANVAS_INIT = { width: 400, height: 400 };    // 4"×4"
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;

const TOOLBOX = [
  { type: 'text', label: 'Text', icon: <FontSizeOutlined /> },
  { type: 'barcode', label: 'Barcode', icon: <BarcodeOutlined /> },
  { type: 'qr', label: 'QR Code', icon: <QrcodeOutlined /> },
  { type: 'rect', label: 'Rectangle', icon: <AppstoreAddOutlined /> },
  { type: 'ellipse', label: 'Ellipse', icon: <AppstoreAddOutlined /> },
  { type: 'line', label: 'Line', icon: <MinusOutlined /> },
  { type: 'image', label: 'Image', icon: <FileImageOutlined /> },
];

// แยก ElementType เป็น Union Type
interface BaseElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  draggable?: boolean;
  locked?: boolean;
  visible?: boolean;
  layer?: number;
  rotation?: number;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
}

interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;
  align: string;
  fontStyle?: 'normal' | 'italic';
  fontWeight?: 'normal' | 'bold';
}

interface BarcodeElement extends BaseElement {
  type: 'barcode';
  value: string;
  format: string;
  fill: string;
}

interface QrElement extends BaseElement {
  type: 'qr';
  value: string;
  fill: string;
}

interface RectElement extends BaseElement {
  type: 'rect';
  fill: string;
}

interface EllipseElement extends BaseElement {
  type: 'ellipse';
  fill: string;
}

interface LineElement extends BaseElement {
  type: 'line';
  fill: string;
}

interface ArrowElement extends BaseElement {
  type: 'arrow';
  fill: string;
}

interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  imageObj?: HTMLImageElement;
}

interface VariableElement extends BaseElement {
  type: 'variable';
  name: string;
  fill: string;
  dataType?: 'text' | 'number' | 'date' | 'counter';
  format?: string;
  defaultValue?: string;
}

type ElementType = TextElement | BarcodeElement | QrElement | RectElement | 
                  EllipseElement | LineElement | ArrowElement | ImageElement | 
                  VariableElement;

// เพิ่มฟีเจอร์ใหม่
const FEATURES = {
  SNAPPING: {
    ENABLED: true,
    GRID_SIZE: 20,
    SNAP_DISTANCE: 10,
  },
  GUIDES: {
    ENABLED: true,
    SPACING: 50,
    SHOW_DISTANCE: true,
  },
  ZOOM: {
    MIN: 0.3,
    MAX: 2.5,
    STEP: 0.1,
  },
  CANVAS: {
    INIT_WIDTH: 400,
    INIT_HEIGHT: 400,
  },
  KEYBOARD: {
    DELETE: 'Delete',
    UNDO: ['Ctrl+Z', 'Cmd+Z'],
    REDO: ['Ctrl+Y', 'Cmd+Y'],
    COPY: ['Ctrl+C', 'Cmd+C'],
    PASTE: ['Ctrl+V', 'Cmd+V'],
    CUT: ['Ctrl+X', 'Cmd+X'],
    SELECT_ALL: ['Ctrl+A', 'Cmd+A'],
    DUPLICATE: ['Ctrl+D', 'Cmd+D'],
    GROUP: ['Ctrl+G', 'Cmd+G'],
    UNGROUP: ['Ctrl+Shift+G', 'Cmd+Shift+G'],
    MOVE: {
      UP: 'ArrowUp',
      DOWN: 'ArrowDown',
      LEFT: 'ArrowLeft',
      RIGHT: 'ArrowRight',
    },
  },
  COUNTER: {
    PREFIX: '',
    SUFFIX: '',
    PADDING: 4,
    START_VALUE: 1,
    INCREMENT: 1,
  }
};

// Helper functions
function formatDate(date: Date | string | null, format: string = "DD/MM/YYYY"): string {
  if (!date) return "";
  
  try {
    return dayjs(date).format(format);
  } catch (error) {
    return "";
  }
}

// ฟังก์ชันสำหรับสร้าง QR code dataUrl
const updateQrDataUrl = async (el: ElementType): Promise<string | null> => {
  if (!isClient || el.type !== 'qr') return null;
  if (!el.value) return null;
  
  try {
    const canvas = document.createElement('canvas');
    
    // ตั้งขนาด canvas เท่ากับขนาดของ element
    const scale = 2; // เพิ่ม scale สำหรับความคมชัด
    canvas.width = el.width * scale;
    canvas.height = el.height * scale;
    
    // สร้าง QR code ด้วย QRCode library
    await QRCode.toCanvas(canvas, el.value, {
      width: Math.min(el.width, el.height) * scale, // ใช้ด้านที่มีขนาดเล็กกว่า
      margin: 0,
      scale: 4,
      color: {
        dark: el.fill || '#000000',
        light: '#FFFFFF'
      }
    });
    
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
};

// ฟังก์ชันสำหรับสร้าง Barcode dataUrl
const updateBarcodeDataUrl = async (el: ElementType): Promise<string | null> => {
  if (!isClient || el.type !== 'barcode') return null;
  if (!el.value) return null;
  
  try {
    const canvas = document.createElement('canvas');
    
    // กำหนดคุณสมบัติของ barcode
    const format = el.format || 'CODE128';
    const scaleFactor = 2; // เพิ่ม scale สำหรับความคมชัด
    
    // เพิ่มความสูงเล็กน้อยเพื่อรองรับข้อความใต้ barcode
    canvas.width = el.width * scaleFactor;
    canvas.height = el.height * scaleFactor;
    
    // สร้าง barcode ด้วย JsBarcode library
    JsBarcode(canvas, el.value, {
      format,
      width: 2,
      height: el.height * 0.8 * scaleFactor, // ใช้ 80% ของความสูงเพื่อเผื่อที่ว่างสำหรับข้อความ
      displayValue: true,
      text: el.value,
      textAlign: 'center',
      textPosition: 'bottom',
      textMargin: 2,
      fontSize: 12 * scaleFactor,
      lineColor: el.fill || '#000000',
      background: '#FFFFFF'
    });
    
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error generating barcode:', error);
    return null;
  }
};

export default function TemplateDesigner({ templateId: templateIdProp, initialTemplate }: { templateId?: string, initialTemplate?: any }) {
  // Initialize refs
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const selectionRef = useRef<{x: number, y: number, width: number, height: number}>({
    x: 0, y: 0, width: 0, height: 0
  });
  
  // Initialize state variables
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 400, height: 400 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [elements, setElements] = useState<ElementType[]>([]);
  const [history, setHistory] = useState<ElementType[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [counter, setCounter] = useState<{ [key: string]: number }>({});
  const [zoom, setZoom] = useState<number>(1);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [elementBeingCreated, setElementBeingCreated] = useState<string | null>(null);
  const [temporaryElement, setTemporaryElement] = useState<ElementType | null>(null);
  const [templateInfo, setTemplateInfo] = useState<any>({
    name: '',
    description: '',
    productKey: '',
    customerKey: '',
    paperSize: '4x4',
    orientation: 'Portrait',
    templateType: 'INNER'
  });
  const [templateInfoModal, setTemplateInfoModal] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(!!templateIdProp);
  const [templateId, setTemplateId] = useState<string | undefined>(templateIdProp);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<any>(null);
  const [selectionVisible, setSelectionVisible] = useState<boolean>(false);
  const [dragSelection, setDragSelection] = useState<{}>({});
  const [qrDataUrls, setQrDataUrls] = useState<{[key: string]: string}>({});
  const [qrImages, setQrImages] = useState<{[key: string]: HTMLImageElement}>({});
  const [barcodeDataUrls, setBarcodeDataUrls] = useState<{[key: string]: string}>({});
  const [barcodeImages, setBarcodeImages] = useState<{[key: string]: HTMLImageElement}>({});
  const [copiedElement, setCopiedElement] = useState<ElementType | null>(null);
  const [importJson, setImportJson] = useState<string>('');
  const [importModal, setImportModal] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [batchNo, setBatchNo] = useState<string>('');
  const [batchModalVisible, setBatchModalVisible] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [templateLoaded, setTemplateLoaded] = useState<boolean>(false);
  
  const router = useRouter();
  const { query } = router;

  // Define all state variables
  const [labelStandard, setLabelStandard] = useState<'GMP' | 'EXPORT' | 'INTERNAL'>('GMP');
  const [loading, setLoading] = useState<boolean>(false);
  const [future, setFuture] = useState<ElementType[][]>([]);

  // ตรวจสอบ query parameters เมื่อคอมโพเนนต์โหลด
  useEffect(() => {
    if (router.isReady) {
      // รับค่า query parameters จาก URL
      const { batchNo: batchNoParam, syncBatch, initialTemplate: initialTemplateParam } = router.query;
      
      // โหลด template จาก localStorage หากมีการกำหนด initialTemplate
      if (initialTemplateParam === 'true' && isClient && !templateLoaded) {
        const tempTemplate = localStorage.getItem('tempTemplate');
        if (tempTemplate) {
          try {
            const template = JSON.parse(tempTemplate);
            if (template && template.elements) {
              setElements(template.elements);
              setCanvasSize(template.canvasSize || { width: 400, height: 400 });
              setTemplateLoaded(true);
              message.success('Template loaded from previous session');
              // ลบข้อมูลชั่วคราวออกจาก localStorage เพื่อป้องกันการโหลดซ้ำ
              localStorage.removeItem('tempTemplate');
            }
          } catch (error) {
            console.error('Error parsing template from localStorage:', error);
          }
        }
      }
      
      if (batchNoParam && typeof batchNoParam === 'string') {
        setBatchNo(batchNoParam);
        
        // ถ้ามีการระบุให้ sync ข้อมูล batch ให้ทำการ sync โดยอัตโนมัติ
        if (syncBatch === 'true') {
          setTimeout(() => {
            fetchAndApplyBatch();
          }, 800); // รอสักเล็กน้อยเพื่อให้คอมโพเนนต์ได้โหลดสมบูรณ์ก่อน
        }
      } else {
        // ถ้าไม่มี batchNo ใน URL ให้ลองดูใน localStorage
        const savedBatchNo = localStorage.getItem('tempBatchNo');
        if (savedBatchNo) {
          setBatchNo(savedBatchNo);
          localStorage.removeItem('tempBatchNo');
        }
      }
      
      // ตั้งค่า productKey จาก query parameters ถ้ามี
      const { productKey } = router.query;
      if (productKey && typeof productKey === 'string') {
        setTemplateInfo(prev => ({ ...prev, productKey }));
      }
    }
  }, [router.isReady, router.query, templateLoaded]);

  // สร้าง QR code
  const generateQRCode = useCallback((data: any): string => {
    // ตรวจสอบค่าที่ส่งเข้ามา
    if (!data) return '';
    
    // ลำดับการใช้ข้อมูล
    const batchNumber = data.batchNo || data.BatchNo || data.LOT_CODE || '';
    const productKey = data.productKey || data.ProductKey || data.ItemKey || '';
    
    // สร้าง text สำหรับ QR code
    return `${batchNumber}|${productKey}`;
  }, []);

  // สร้าง element จากข้อมูล batch
  const buildElementsFromBatch = useCallback((data: any): ElementType[] => {
    // ถ้าไม่มีข้อมูล ให้สร้าง elements ว่างเปล่า
    if (!data) return [];
    
    const els: ElementType[] = [];
    
    // ตั้งค่าขนาด Canvas และขอบเขต
    const cw = canvasSize.width;
    const ch = canvasSize.height;
    const margin = 20;
    const contentWidth = cw - (margin * 2);
    const lineHeight = 30;
    let y = margin;
    
    // คำนวณอัตราส่วนเพื่อปรับขนาดตัวอักษรให้พอดีกับขนาด Canvas
    const scaleX = cw / 400;
    const scaleY = ch / 450;
    
    // เตรียมข้อมูลสำหรับแสดงผล
    const productName = data.Product || data.productName || '';
    const productKey = data.productKey || '';
    
    // คำนวณข้อมูลวัน-เวลา
    const prodDate = data.SchStartDate || data.productionDate || '';
    const shelfLifeDays = data.shelfLifeDays || 0;
    const daysToExpire = data.daysToExpire || 0;
    const bestBefore = calculateBestBefore(prodDate, shelfLifeDays, daysToExpire) || '';
    
    // คำนวณ Lot Code - ใช้ Production Date หรือ Batch No
    // โดยไม่ต้องอ้างอิงถึง LotCode ที่ไม่มีใน schema ใหม่
    const lotCode = prodDate ? dayjs(prodDate).format('YYMMDD') : data.batchNo;
    
    // ข้อมูลอื่นๆ
    const batchNumber = data.batchNo || '';
    const soNumber = data.SONumber || '';
    const storageCondition = data.StorageCondition || 'STORE UNDER DRY COOL CONDITION';
    const allergen = data.ALLERGEN1 || '';
    const printDate = dayjs().format('DD/MM/YY');
    
    // 1. ชื่อสินค้า (Product Name)
    els.push({
      id: uuidv4(), type: 'text',
      x: margin, y,
      width: contentWidth,
      height: lineHeight,
      text: productName,
      fontSize: 16,
      fontFamily: 'Arial',
      fill: '#000',
      align: 'left',
      draggable: true, visible: true
    } as TextElement);
    y += lineHeight + 10;
    
    // 2. รหัสสินค้า (Product Key) - แสดงตรงกลาง ตัวอักษรใหญ่และสีน้ำเงิน
    els.push({
      id: uuidv4(), type: 'text',
      x: 0, y,
      width: cw,
      height: 50,
      text: productKey,
      fontSize: 28, 
      fontFamily: 'Arial',
      fill: '#0000FF', // สีน้ำเงิน
      align: 'center',
      draggable: true, visible: true
    } as TextElement);
    y += 60; // เพิ่มระยะห่างมากขึ้น
    
    // 3. NET WEIGHT - ส่วนนี้จะแสดงตามข้อมูลที่ได้รับ
    els.push({
      id: uuidv4(), type: 'text',
      x: margin, y,
      width: contentWidth,
      height: lineHeight,
      text: `NET WEIGHT: ${data.NetWeight || ''} KG/CTN`,
      fontSize: 16,
      fontFamily: 'Arial',
      fill: '#000',
      align: 'left',
      draggable: true, visible: true
    } as TextElement);
    y += lineHeight;
    
    // 4. LOT CODE - ตอนนี้ใช้ SchStartDate ในรูปแบบ YYMMDD
    els.push({
      id: uuidv4(), type: 'text',
      x: margin, y,
      width: contentWidth,
      height: lineHeight,
      text: `LOT CODE: ${lotCode}`,
      fontSize: 16,
      fontFamily: 'Arial',
      fill: '#000',
      align: 'left',
      draggable: true, visible: true
    } as TextElement);
    y += lineHeight;
    
    // 5. PRODUCTION DATE - ใช้ SchStartDate หรือ Batch Production Date
    if (prodDate) {
      els.push({
        id: uuidv4(), type: 'text',
        x: margin, y,
        width: contentWidth,
        height: lineHeight,
        text: `PRODUCTION DATE: ${dayjs(prodDate).format('DD/MM/YYYY')}`,
        fontSize: 16,
        fontFamily: 'Arial',
        fill: '#000',
        align: 'left',
        draggable: true, visible: true
      } as TextElement);
      y += lineHeight;
    }
    
    // 6. BEST BEFORE date + SO Number - รวมเข้าด้วยกัน
    const bestBeforeText = `BEST BEFORE: ${bestBefore}${soNumber ? ` S/O: ${soNumber}` : ''}`;
    els.push({
      id: uuidv4(), type: 'text',
      x: margin, y,
      width: contentWidth,
      height: lineHeight,
      text: bestBeforeText,
      fontSize: 16,
      fontFamily: 'Arial',
      fill: '#000',
      align: 'left',
      draggable: true, visible: true
    } as TextElement);
    y += lineHeight;
    
    // 7. RECOMMENDED STORAGE - ปรับให้อยู่บรรทัดเดียว
    els.push({
      id: uuidv4(), type: 'text',
      x: margin, y,
      width: contentWidth,
      height: lineHeight,
      text: `RECOMMENDED STORAGE: ${storageCondition}`,
      fontSize: 14, // ลดขนาดตัวอักษรลงเพื่อให้อยู่บรรทัดเดียว
      fontFamily: 'Arial',
      fill: '#000',
      align: 'left',
      draggable: true, visible: true
    } as TextElement);
    y += lineHeight;
    
    // 8. ALLERGEN (ถ้ามี)
    if (allergen) {
      els.push({
        id: uuidv4(), type: 'text',
        x: margin, y,
        width: contentWidth,
        height: lineHeight,
        text: `ALLERGEN: ${allergen}`,
        fontSize: 16,
        fontFamily: 'Arial',
        fill: '#000',
        align: 'left',
        draggable: true, visible: true
      } as TextElement);
      y += lineHeight;
    }
    
    // 9. Barcode (CODE128) ถูกต้องตาม spec
    els.push({
      id: uuidv4(), type: 'barcode',
      x: margin + 30, // ปรับตำแหน่งให้อยู่ตรงกลาง
      y: y + 10,
      width: contentWidth - 60,
      height: 50,
      value: batchNumber, // ใช้ BatchNo สำหรับ barcode
      format: 'CODE128',
      fill: '#000',
      draggable: true, visible: true
    } as BarcodeElement);
    
    // 10. Print Date แบบใหม่ - เป็นตัวเล็กๆ มุมขวาล่าง
    els.push({
      id: uuidv4(), type: 'text',
      x: cw - margin - 50, // จัดชิดขวา
      y: ch - margin - 15, // จัดชิดล่าง
      width: 50,
      height: 15,
      text: printDate, // วันที่อย่างเดียว ไม่มีคำว่า "PRINT DATE:"
      fontSize: 10, // ตัวอักษรเล็ก
      fontFamily: 'Arial',
      fill: '#777', // สีเทาเพื่อไม่ให้เด่นเกินไป
      align: 'right',
      draggable: true, visible: true
    } as TextElement);
    
    return els;
  }, [canvasSize]);

// Helper function ช่วยแบ่งข้อความให้พอดีกับความกว้าง
function fitTextInWidth(text: string, maxWidth: number, fontSize: number, fontFamily: string): string[] {
  if (!text) return [];
  
  // ประมาณความกว้างของตัวอักษร (ตัวอย่างเท่านั้น ไม่แม่นยำ 100%)
  const avgCharWidth = fontSize * 0.6;
  const charsPerLine = Math.floor(maxWidth / avgCharWidth);
  
  if (text.length <= charsPerLine) return [text];
  
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    
    if (testLine.length <= charsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      
      // ถ้าคำเดียวยาวเกินบรรทัด ให้ตัดคำ
      if (word.length > charsPerLine) {
        let remainingWord = word;
        while (remainingWord.length > 0) {
          const chunk = remainingWord.substring(0, charsPerLine);
          lines.push(chunk);
          remainingWord = remainingWord.substring(charsPerLine);
        }
        currentLine = '';
      } else {
        currentLine = word;
      }
    }
  });
  
  if (currentLine) lines.push(currentLine);
  
  return lines;
}

  // Function to fetch and apply batch data
  const fetchAndApplyBatch = async () => {
    // ตรวจสอบว่ามี batchNo จาก state หรือไม่ ถ้าไม่มีให้ดึงจาก localStorage
    let currentBatchNo = batchNo;
    if (!currentBatchNo && isClient) {
      const savedBatchNo = localStorage.getItem('tempBatchNo');
      if (savedBatchNo) {
        currentBatchNo = savedBatchNo;
        setBatchNo(savedBatchNo);
        // ลบข้อมูลออกจาก localStorage หลังจากใช้งาน
        localStorage.removeItem('tempBatchNo');
      }
    }

    if (!currentBatchNo) {
      message.error('Please enter a Batch Number');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Please login first');
      }

      // Clean batchNo by removing ':1' if present
      const cleanBatchNo = currentBatchNo.split(':')[0];
      console.log('>> clean batch no:', cleanBatchNo);

      // แก้ไข URL เรียก API ให้ถูกต้อง
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5051';
      const response = await fetch(`${API_URL}/api/batches/labelview?batchNo=${cleanBatchNo}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // รับข้อมูล batch
      const payload = await response.json();
      
      // ถ้าเป็น array ให้ใช้ item แรก
      const data = Array.isArray(payload) && payload.length > 0 ? payload[0] : payload;
      
      if (!data) {
        throw new Error('No batch data found');
      }
      
      console.log('>> batch record =', data);
      
      // สร้าง elements จากข้อมูล batch
      const newElements = buildElementsFromBatch(data);
      setElements(newElements);
      
      // อัพเดต template info ด้วยข้อมูลจาก batch
      setTemplateInfo(prev => ({
        ...prev,
        name: `${data.productKey || 'Template'} - ${data.batchNo}`,
        description: `Template for ${data.productName || 'product'} (${data.batchNo})`,
        productKey: data.productKey || prev.productKey,
        customerKey: data.custKey || prev.customerKey
      }));
      
      message.success(`Applied data from batch: ${cleanBatchNo}`);

    } catch (error: any) {
      console.error('Failed to fetch batch data:', error);
      message.error(`Failed to fetch batch data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // รวมฟังก์ชันต่าง ๆ ที่จำเป็น แต่ในตัวอย่างนี้ทำงานเบื้องต้นเท่านั้น
  const handleSaveTemplate = async () => {
    try {
      setIsSaving(true);
      
      // เตรียมข้อมูลที่จะบันทึก
      const content = {
        elements,
        canvasSize
      };
      
      // ให้แต่ละ element มี z-index ที่แตกต่างกัน
      const elementsWithZIndex = elements.map((el, index) => ({
        ...el,
        layer: el.layer || index
      }));
      
      const contentWithZIndex = {
        elements: elementsWithZIndex,
        canvasSize
      };
      
      const templateData = {
        name: templateInfo.name || `Standard Template - ${batchNo || 'New'}`,
        description: templateInfo.description || `Template created for batch ${batchNo || 'unknown'}`,
        productKey: templateInfo.productKey || null,
        customerKey: templateInfo.customerKey || null,
        batchNo: batchNo || null, // เพิ่ม batchNo สำหรับการ link กับ batch
        content: JSON.stringify(contentWithZIndex),
        engine: 'Canvas',
        paperSize: 'Custom',
        customWidth: canvasSize.width,
        customHeight: canvasSize.height,
        templateType: 'Standard'
      };
      
      // รับ token จาก localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Please login first');
      }

      // ตั้งค่า API URL ให้ถูกต้อง
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5051';
      
      // ถ้ามี templateId แล้ว ให้ทำการอัปเดต
      if (templateId) {
        const response = await fetch(`${API_URL}/api/templates/${templateId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(templateData),
        });
        
        if (response.ok) {
          message.success('Template updated successfully');
          setLastSaved(new Date());
        } else {
          const errorData = await response.json().catch(() => ({}));
          message.error(`Error saving template: ${errorData.message || response.statusText}`);
        }
      } else {
        // สร้าง Template ใหม่
        const response = await fetch(`${API_URL}/api/templates`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(templateData),
        });
        
        if (response.ok) {
          const data = await response.json();
          setTemplateId(data.templateId || data.id);
          message.success('Template saved successfully');
          setLastSaved(new Date());
          
          // เปลี่ยน URL หากมีการใช้ router และเป็นการสร้างใหม่
          if (router && data.templateId) {
            router.push(`/templates/designer/${data.templateId || data.id}`);
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          message.error(`Error saving template: ${errorData.message || response.statusText}`);
        }
      }
    } catch (error: any) {
      console.error('Error saving template:', error);
      message.error(`Error saving template: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  // ฟังก์ชันสำหรับสร้าง QR code และ Barcode ในแบบ real-time
  const updateQrDataUrlInRealtime = useCallback(async (el: QrElement) => {
    if (!isClient || !el.value) return;
    
    try {
      const dataUrl = await updateQrDataUrl(el);
      if (dataUrl) {
        setQrDataUrls(prev => ({ ...prev, [el.id]: dataUrl }));
      }
    } catch (error) {
      console.error('Error updating QR code in real-time:', error);
    }
  }, []);
  
  const updateBarcodeDataUrlInRealtime = useCallback(async (el: BarcodeElement) => {
    if (!isClient || !el.value) return;
    
    try {
      const dataUrl = await updateBarcodeDataUrl(el);
      if (dataUrl) {
        setBarcodeDataUrls(prev => ({ ...prev, [el.id]: dataUrl }));
      }
    } catch (error) {
      console.error('Error updating barcode in real-time:', error);
    }
  }, []);

  // ฟังก์ชันสำหรับแสดงองค์ประกอบต่างๆ บน canvas
  const renderElementInDesigner = useCallback((el: ElementType) => {
    if (el.type === 'text') {
        return (
          <MemoText
            text={el.text}
            fontSize={el.fontSize}
            fontFamily={el.fontFamily}
            fill={el.fill}
            width={el.width}
            height={el.height}
            align={el.align || 'left'}
            verticalAlign="middle"
            fontStyle={el.fontStyle || 'normal'}
            fontVariant="normal"
            fontWeight={el.fontWeight || 'normal'}
            lineHeight={1.2}
          />
        );
    }
    
    if (el.type === 'rect') {
        return (
            <MemoRect
              width={el.width}
              height={el.height}
              fill={el.fill}
              cornerRadius={5}
            />
        );
    }
    
    if (el.type === 'barcode') {
      // ใช้ข้อมูลจาก state ถ้ามี หรือ render placeholder
      const barcodeUrl = barcodeDataUrls[el.id];
      
      if (barcodeUrl) {
        const imageObj = barcodeImages[el.id] || new window.Image();
        if (!barcodeImages[el.id]) {
          imageObj.src = barcodeUrl;
          imageObj.onload = () => {
            // เพิ่มการตรวจสอบว่ารูปภาพโหลดเสร็จแล้ว
            setBarcodeImages(prev => ({ ...prev, [el.id]: imageObj }));
          };
        }
        
        if (imageObj.complete && imageObj.naturalWidth !== 0) {
          return (
            <MemoKonvaImage
              image={imageObj}
              width={el.width}
              height={el.height}
            />
          );
        }
      }
      
      // ถ้าไม่มี dataUrl หรือรูปภาพยังโหลดไม่เสร็จ ให้สร้าง barcode
      if (!barcodeUrl) {
        setTimeout(() => {
          updateBarcodeDataUrlInRealtime(el);
        }, 0);
      }
      
      // แสดง placeholder พร้อมข้อความ
      return (
        <Group>
          <MemoRect 
            width={el.width} 
            height={el.height} 
            fill="#f0f0f0"
            cornerRadius={5}
          />
          <MemoText
            text={(el as BarcodeElement).value || "Barcode"}
            fontSize={12}
            fontFamily="Arial"
            fill="#999"
            width={el.width}
            height={el.height}
            align="center"
            verticalAlign="middle"
          />
        </Group>
      );
    }
    
    if (el.type === 'qr') {
      // ใช้ข้อมูลจาก state ถ้ามี หรือ render placeholder
      const qrUrl = qrDataUrls[el.id];
      
      if (qrUrl) {
        const imageObj = qrImages[el.id] || new window.Image();
        if (!qrImages[el.id]) {
          imageObj.src = qrUrl;
          imageObj.onload = () => {
            // เพิ่มการตรวจสอบว่ารูปภาพโหลดเสร็จแล้ว
            setQrImages(prev => ({ ...prev, [el.id]: imageObj }));
          };
        }
        
        if (imageObj.complete && imageObj.naturalWidth !== 0) {
          return (
            <MemoKonvaImage
              image={imageObj}
              width={el.width}
              height={el.height}
            />
          );
        }
      }
      
      // ถ้าไม่มี dataUrl หรือรูปภาพยังโหลดไม่เสร็จ ให้สร้าง QR code
      if (!qrUrl) {
        setTimeout(() => {
          updateQrDataUrlInRealtime(el);
        }, 0);
      }
      
      // แสดง placeholder พร้อมข้อความ
      return (
        <Group>
          <MemoRect
            width={el.width}
            height={el.height}
            fill="#f0f0f0"
            cornerRadius={5}
          />
          <MemoText
            text={(el as QrElement).value || "QR Code"}
            fontSize={12}
            fontFamily="Arial"
            fill="#999"
            width={el.width}
            height={el.height}
            align="center"
            verticalAlign="middle"
          />
        </Group>
      );
    }
    
    if (el.type === 'line') {
        return (
        <MemoLine
          points={[0, 0, el.width, 0]}
          stroke={el.fill}
          strokeWidth={2}
        />
      );
    }
    
    // Default placeholder
    return (
      <MemoRect
        width={el.width}
        height={el.height}
        fill="#ddd"
        cornerRadius={5}
      />
    );
  }, [barcodeDataUrls, barcodeImages, qrDataUrls, qrImages, updateBarcodeDataUrlInRealtime, updateQrDataUrlInRealtime]);
  
  // Render
  return (
    <div className="template-designer">
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ paddingLeft: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>
            Label Template Designer
          </div>
          <div>
            <Button 
              type="primary" 
              icon={<SaveOutlined />} 
              onClick={handleSaveTemplate}
              loading={isSaving}
              style={{ marginRight: 8 }}
            >
              Save Template
            </Button>
            <Button 
              icon={<SettingOutlined />} 
              onClick={() => setTemplateInfoModal(true)}
            >
              Template Info
            </Button>
          </div>
      </Header>
      <Layout>
          <Sider width={250} style={{ background: '#fff', padding: '16px' }}>
            <div style={{ marginBottom: 16 }}>
              <h3>Add Elements</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TOOLBOX.map((tool) => (
                  <Button 
                    key={tool.type}
                    icon={tool.icon} 
                    onClick={() => {
                      // Add element function would be implemented here
                      message.info(`Adding ${tool.label} element`);
                    }}
                    title={tool.label}
                  >
                    {tool.label}
              </Button>
            ))}
          </div>
            </div>
            <Divider />
            
            <div style={{ marginBottom: 16 }}>
              <h3>Batch Data</h3>
              <Input
                placeholder="Enter Batch Number"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <Button 
                type="primary" 
                onClick={fetchAndApplyBatch} 
                loading={loading}
                style={{ width: '100%' }}
              >
                Apply Batch Data
              </Button>
          </div>
        </Sider>
          
          <Content style={{ padding: '20px', background: '#f0f2f5' }}>
            <div style={{ 
              background: '#fff', 
              padding: '16px', 
              borderRadius: '4px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              height: 'calc(100vh - 104px)',
              overflow: 'auto'
            }}>
              <div
                style={{
                  border: '1px solid #ddd',
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  position: 'relative',
                  overflow: 'auto'
                }}
              >
                <div
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: '50% 50%',
                    position: 'relative'
                  }}
                >
            <Stage
              width={canvasSize.width}
              height={canvasSize.height}
                    ref={stageRef}
                    style={{ 
                      background: '#fff',
                      boxShadow: '0 0 10px rgba(0,0,0,0.2)'
              }}
            >
              <Layer>
                      {/* แสดงเส้นตาราง grid ถ้าต้องการ */}
                      {FEATURES.SNAPPING.ENABLED && Array.from({ length: Math.ceil(canvasSize.width / FEATURES.SNAPPING.GRID_SIZE) }).map((_, i) => (
                        <Line
                          key={`vgrid-${i}`}
                          points={[i * FEATURES.SNAPPING.GRID_SIZE, 0, i * FEATURES.SNAPPING.GRID_SIZE, canvasSize.height]}
                          stroke="#ddd"
                          strokeWidth={i % 5 === 0 ? 0.5 : 0.2}
                        />
                      ))}
                      {FEATURES.SNAPPING.ENABLED && Array.from({ length: Math.ceil(canvasSize.height / FEATURES.SNAPPING.GRID_SIZE) }).map((_, i) => (
                        <Line
                          key={`hgrid-${i}`}
                          points={[0, i * FEATURES.SNAPPING.GRID_SIZE, canvasSize.width, i * FEATURES.SNAPPING.GRID_SIZE]}
                          stroke="#ddd"
                          strokeWidth={i % 5 === 0 ? 0.5 : 0.2}
                        />
                      ))}
                      
                      {/* แสดง elements */}
                      {elements.map((el) => (
                  <MemoGroup
                    key={el.id}
                          draggable={!el.locked && (el.draggable !== false)}
                    x={el.x}
                    y={el.y}
                          width={el.width}
                          height={el.height}
                          rotation={el.rotation || 0}
                          onClick={(e) => {
                            // handle element selection
                            if (el.id !== selectedId) {
                              setSelectedId(el.id);
                            }
                            e.cancelBubble = true;
                          }}
                          visible={el.visible !== false}
                          opacity={el.visible === false ? 0.4 : 1}
                        >
                          {renderElementInDesigner(el)}
                          
                          {/* แสดงเส้นขอบเมื่อเลือก element */}
                          {selectedId === el.id && (
                            <Rect
                              x={0}
                              y={0}
                              width={el.width}
                              height={el.height}
                              stroke="#1890ff"
                              strokeWidth={1}
                              dash={[4, 4]}
                              fill="transparent"
                            />
                          )}
                  </MemoGroup>
                ))}
                      
                      {/* Transformer สำหรับปรับขนาด element ที่เลือก */}
                      {selectedId && (
                      <Transformer
                        ref={trRef}
                        rotateEnabled={true}
                          keepRatio={false}
                          boundBoxFunc={(oldBox, newBox) => {
                            // จำกัดขนาดไม่ให้เล็กเกินไป
                            if (newBox.width < 5 || newBox.height < 5) {
                              return oldBox;
                            }
                            return newBox;
                          }}
                        />
                )}
              </Layer>
            </Stage>
          </div>
                        </div>
                        </div>
          </Content>
      </Layout>
    </Layout>
    </div>
  );
} 