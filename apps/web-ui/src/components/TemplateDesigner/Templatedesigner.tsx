import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Layout, Button, Divider, InputNumber, Modal, message, Tooltip, Input, Upload, Select } from 'antd';
import { PlusOutlined, SaveOutlined, DownloadOutlined, UploadOutlined, UndoOutlined, RedoOutlined, DeleteOutlined, ZoomInOutlined, ZoomOutOutlined, SettingOutlined, FileImageOutlined, FontSizeOutlined, BarcodeOutlined, QrcodeOutlined, AppstoreAddOutlined, EyeInvisibleOutlined, LockOutlined, UnlockOutlined, CopyOutlined, GroupOutlined, RotateRightOutlined, SyncOutlined, MinusOutlined } from '@ant-design/icons';
import { Stage, Layer, Rect, Text, Group, Transformer, Image as KonvaImage, Line } from 'react-konva';
import jsPDF from 'jspdf';
import { v4 as uuidv4 } from 'uuid';

// ตรวจสอบว่าอยู่ในฝั่ง client
const isClient = typeof window !== 'undefined';

// นำเข้าโมดูลที่ทำงานเฉพาะฝั่ง client
let QRCode: any = null;
let JsBarcode: any = null;
if (isClient) {
  QRCode = require('qrcode');
  JsBarcode = require('jsbarcode');
}

import { useRouter } from 'next/router';

const { Header, Sider, Content } = Layout;
const { Option } = Select;

const CANVAS_INIT = { width: 900, height: 500 };
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
  // { type: 'variable', label: 'Field', icon: <PlusOutlined /> }, // ซ่อน Field
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
    INIT_WIDTH: 900,
    INIT_HEIGHT: 500,
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

// เพิ่มฟังก์ชันสำหรับ counter
const getNextCounterValue = (
  el: VariableElement, 
  counter: { [key: string]: number },
  setCounter: React.Dispatch<React.SetStateAction<{ [key: string]: number }>>
) => {
  if (el.dataType !== 'counter') return '';
  
  const currentValue = counter[el.id] || FEATURES.COUNTER.START_VALUE;
  const nextValue = currentValue + FEATURES.COUNTER.INCREMENT;
  setCounter((prev: { [key: string]: number }) => ({ ...prev, [el.id]: nextValue }));
  
  const paddedValue = nextValue.toString().padStart(FEATURES.COUNTER.PADDING, '0');
  return `${FEATURES.COUNTER.PREFIX}${paddedValue}${FEATURES.COUNTER.SUFFIX}`;
};

// เพิ่มฟังก์ชันสำหรับ alignment guides
const getAlignmentGuides = (elements: ElementType[], selectedId: string) => {
  if (!FEATURES.GUIDES.ENABLED) return [];
  
  const selected = elements.find(el => el.id === selectedId);
  if (!selected) return [];
  
  const guides: { type: 'vertical' | 'horizontal', pos: number, distance: number }[] = [];
  
  elements.forEach(el => {
    if (el.id === selectedId) return;
    
    // Vertical alignment
    if (Math.abs(el.x - selected.x) < FEATURES.GUIDES.SPACING) {
      guides.push({ type: 'vertical', pos: el.x, distance: Math.abs(el.x - selected.x) });
    }
    if (Math.abs(el.x + el.width - selected.x) < FEATURES.GUIDES.SPACING) {
      guides.push({ type: 'vertical', pos: el.x + el.width, distance: Math.abs(el.x + el.width - selected.x) });
    }
    if (Math.abs(el.x - (selected.x + selected.width)) < FEATURES.GUIDES.SPACING) {
      guides.push({ type: 'vertical', pos: el.x, distance: Math.abs(el.x - (selected.x + selected.width)) });
    }
    
    // Horizontal alignment
    if (Math.abs(el.y - selected.y) < FEATURES.GUIDES.SPACING) {
      guides.push({ type: 'horizontal', pos: el.y, distance: Math.abs(el.y - selected.y) });
    }
    if (Math.abs(el.y + el.height - selected.y) < FEATURES.GUIDES.SPACING) {
      guides.push({ type: 'horizontal', pos: el.y + el.height, distance: Math.abs(el.y + el.height - selected.y) });
    }
    if (Math.abs(el.y - (selected.y + selected.height)) < FEATURES.GUIDES.SPACING) {
      guides.push({ type: 'horizontal', pos: el.y, distance: Math.abs(el.y - (selected.y + selected.height)) });
    }
  });
  
  return guides;
};

// เพิ่มฟังก์ชันช่วยเหลือ
function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

function formatDate(date: Date, format: string): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return format.replace('DD', day).replace('MM', month).replace('YYYY', year.toString());
}

function getDefaultElement(type: ElementType['type']): ElementType {
  const id = uuidv4();
  switch (type) {
    case 'text':
      return {
        id,
        type: 'text',
        x: 100,
        y: 100,
        width: 180,
        height: 40,
        text: 'Text',
        fontSize: 24,
        fontFamily: 'Arial',
        fill: '#222',
        align: 'center',
        draggable: true,
        locked: false,
        visible: true,
        layer: 0
      };
    case 'barcode':
      return {
        id,
        type: 'barcode',
        x: 120,
        y: 120,
        width: 180,
        height: 60,
        value: '123456789012',
        format: 'CODE128',
        fill: '#000',
        draggable: true,
        locked: false,
        visible: true,
        layer: 0
      };
    case 'qr':
      return {
        id,
        type: 'qr',
        x: 140,
        y: 140,
        width: 80,
        height: 80,
        value: 'https://www.nwfap.com',
        fill: '#000',
        draggable: true,
        locked: false,
        visible: true,
        layer: 0
      };
    case 'rect':
      return {
        id,
        type: 'rect',
        x: 160,
        y: 160,
        width: 120,
        height: 60,
        fill: '#FFFFFF',
        draggable: true,
        locked: false,
        visible: true,
        layer: 0
      };
    case 'ellipse':
      return {
        id,
        type: 'ellipse',
        x: 200,
        y: 200,
        width: 100,
        height: 60,
        fill: '#FFFFFF',
        draggable: true,
        locked: false,
        visible: true,
        layer: 0
      };
    case 'line':
      return {
        id,
        type: 'line',
        x: 250,
        y: 250,
        width: 120,
        height: 3, // default thickness 3px
        fill: '#000',
        draggable: true,
        locked: false,
        visible: true,
        layer: 0
      };
    case 'image':
      return {
        id,
        type: 'image',
        x: 180,
        y: 180,
        width: 120,
        height: 80,
        src: '',
        draggable: true,
        locked: false,
        visible: true,
        layer: 0
      };
    case 'variable':
      return {
        id,
        type: 'variable',
        x: 200,
        y: 200,
        width: 120,
        height: 40,
        name: 'Variable',
        fill: '#FFFFFF',
        dataType: 'text',
        defaultValue: '',
        draggable: true,
        locked: false,
        visible: true,
        layer: 0
      };
    default:
      throw new Error(`Unknown element type: ${type}`);
  }
}

function urlToImage(url: string): Promise<HTMLImageElement> {
  if (!isClient) {
    return Promise.resolve({} as HTMLImageElement);
  }
  
  // ตรวจสอบว่า URL เป็นค่าว่างหรือไม่ถูกต้อง
  if (!url || url === 'undefined' || url === 'null') {
    console.warn("URL รูปภาพไม่ถูกต้องหรือเป็นค่าว่าง");
    // คืนค่ารูปภาพว่างแทน
    return Promise.resolve(new window.Image());
  }
  
  // ตรวจสอบว่าเป็น placeholder หรือไม่
  if (url === "placeholder_image" || url.includes("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0i")) {
    console.log("ตรวจพบรูปภาพ placeholder ใช้รูปภาพว่างแทน");
    const img = new window.Image();
    img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjwAsAAB4AAdpxxYoAAAAASUVORK5CYII=";
    return Promise.resolve(img);
  }

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      console.warn("ไม่สามารถโหลดรูปภาพได้:", err);
      // สร้างรูปภาพว่างแทนที่จะแสดง error
      const emptyImg = new window.Image();
      emptyImg.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjwAsAAB4AAdpxxYoAAAAASUVORK5CYII=";
      resolve(emptyImg);
    };
    try {
      img.src = url;
    } catch (err) {
      console.warn("URL รูปภาพไม่ถูกต้อง:", err);
      // สร้างรูปภาพว่างแทน
      const emptyImg = new window.Image();
      emptyImg.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjwAsAAB4AAdpxxYoAAAAASUVORK5CYII=";
      resolve(emptyImg);
    }
  });
}

// เพิ่ม config ไว้ด้านบนสุดของไฟล์ (หลัง import)
const FIELD_CONFIG = [
  { key: 'batchNo',        label: 'Batch No.' },
  { key: 'productionDate', label: 'Production Date', format: 'DD/MM/YYYY' },
  { key: 'finalExpiryDate',label: 'Expiry Date',    format: 'DD/MM/YYYY' },
  { key: 'netWeight',      label: 'NET WEIGHT',      isNumber: true },
  { key: 'totalBags',      label: 'Total Bags',      isNumber: true },
  { key: 'productKey',     label: 'Product Code' },
  { key: 'customerKey',    label: 'Customer Code' },
  { key: 'customerName',   label: 'Customer Name' },
];
const ADDRESS_FIELDS = [
  'address_1','address_2','address_3','city','state','zip_Code'
];

// Config constants
const LABEL_CONFIG = {
  margin: 20,
  headerFontSize: 24,
  normalFontSize: 16,
  labelWidth: 0.3, // 30% ของความกว้างที่ใช้ได้
  valueWidth: 0.5, // 50% ของความกว้างที่ใช้ได้
  spacing: 10,
  lineHeight: 24
};

// helper function สำหรับจัดการค่าที่แสดง (คืนค่า string สำหรับ label/value)
function getDisplayValue(raw: any, fmt?: string, key?: string) {
  if (raw == null || String(raw).trim() === '') {
    return '–';
  }
  // ถ้า key เป็นรหัส/ชื่อ/ที่อยู่ ให้แสดงตรง ๆ ไม่ต้อง format
  const plainKeys = [
    'productKey', 'customerKey', 'batchNo', 'totalBags', 'netWeight',
    'productName', 'customerName',
    'address_1', 'address_2', 'address_3', 'city', 'state', 'zip_Code'
  ];
  if (key && plainKeys.includes(key)) {
    return String(raw);
  }
  // ถ้าเป็นวันที่
  if (fmt && fmt.includes('DD/MM/YYYY')) {
    try {
      const dt = new Date(raw);
      if (isNaN(dt.getTime())) {
        return String(raw);
      }
      return formatDate(dt, fmt);
    } catch {
      return String(raw);
    }
  }
  // ถ้าเป็นตัวเลข (แต่ไม่ใช่ key ที่อยู่ใน plainKeys)
  if (typeof raw === 'number' || !isNaN(parseFloat(raw))) {
    return String(raw); // ไม่ต้อง .toLocaleString() ไม่ต้องมี comma
  }
  // กรณีอื่นๆ
  return String(raw);
}

// กำหนด Barcode Format สำหรับแต่ละมาตรฐาน
const BARCODE_FORMATS_BY_STANDARD: Record<string, string[]> = {
  GMP:    ['CODE128', 'CODE39', 'EAN13'],
  EXPORT: ['EAN13', 'EAN8', 'UPC', 'ITF14'],
  INTERNAL: ['CODE128', 'MSI', 'ITF'],
};

// เพิ่มฟังก์ชัน normalizeColor สำหรับแปลงค่าสี shorthand เป็น full hex
function normalizeColor(color: string): string {
  if (!color) return '#000000';
  
  // แปลง shorthand hex (#rgb) เป็น full hex (#rrggbb)
  if (/^#([0-9a-fA-F]{3})$/.test(color)) {
    return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
  }
  
  // ถ้าเป็น color name เช่น "black", "red" ให้แปลงเป็น hex
  if (color === 'black') return '#000000';
  if (color === 'red') return '#ff0000';
  if (color === 'green') return '#008000';
  if (color === 'blue') return '#0000ff';
  if (color === 'yellow') return '#ffff00';
  if (color === 'white') return '#ffffff';
  
  // ถ้าไม่ใช่ hexadecimal format แต่เป็น rgb/rgba
  if (color.startsWith('rgb')) {
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
  }
  
  return color;
}

// เพิ่มฟังก์ชัน normalizeElementColors สำหรับ normalize สีใน elements
function normalizeElementColors(elements: ElementType[]): ElementType[] {
  return elements.map(el => {
    if ((el.type === 'text' || el.type === 'barcode' || el.type === 'qr' || el.type === 'variable') && 'fill' in el) {
      return { ...el, fill: normalizeColor(el.fill) };
    }
    return el;
  });
}

export default function TemplateDesigner({ templateId, initialTemplate }: { templateId?: string, initialTemplate?: any }) {
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 500 }); // Size of A6 landscape in pixels
  const [elements, setElements] = useState<ElementType[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false); // เพิ่ม state นี้
  const [isSaving, setIsSaving] = useState(false); // เพิ่ม state นี้
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [importModal, setImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [counter, setCounter] = useState<{ [key: string]: number }>({});
  const stageRef = useRef<any>();
  const trRef = useRef<any>();
  const [qrDataUrls, setQrDataUrls] = useState<{ [id: string]: string }>({});
  const [qrImages, setQrImages] = useState<{ [id: string]: HTMLImageElement }>({});
  const [selectionVisible, setSelectionVisible] = useState(false);
  const selectionRef = useRef<{ x: number; y: number; width: number; height: number }>({ x: 0, y: 0, width: 0, height: 0 });
  const [, setDragSelection] = useState<{}>({});
  const [barcodeDataUrls, setBarcodeDataUrls] = useState<{ [id: string]: string }>({});
  const [barcodeImages, setBarcodeImages] = useState<{ [id: string]: HTMLImageElement }>({});
  const [copiedElement, setCopiedElement] = useState<ElementType | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchNo, setBatchNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [templateInfo, setTemplateInfo] = useState({
    name: '',
    description: '',
    productKey: '',
    customerKey: ''
  });
  const [templateInfoModal, setTemplateInfoModal] = useState(false);
  // เพิ่ม state สำหรับมาตรฐาน
  const [labelStandard, setLabelStandard] = useState<'GMP' | 'EXPORT' | 'INTERNAL'>('GMP');
  const [isEditMode, setIsEditMode] = useState<boolean>(!!templateId);
  const router = useRouter();

  // ฟังก์ชันสำหรับตรวจสอบและแก้ไข Content ที่ไม่ถูกต้อง
  const extractAndFixContent = (data: any) => {
    // รองรับทั้ง Content (ตัวพิมพ์ใหญ่) และ content (ตัวพิมพ์เล็ก)
    const rawContent = data.Content || data.content;
    if (!rawContent) {
      console.warn("ไม่พบข้อมูล Content ในเทมเพลต");
      return null;
    }

    try {
      // ถ้าเป็น string ก็แปลงเป็น object
      if (typeof rawContent === 'string') {
        console.log("กำลังแปลงข้อมูล Content:", rawContent.substring(0, 100) + "...");
        
        // ตรวจสอบการถูกตัดกลางคันที่ 50000 ตัวอักษร
        if (rawContent.length >= 50000) {
          console.warn("พบข้อมูล Content ขนาดใหญ่ที่อาจถูกตัด", rawContent.length);
          
          try {
            // พยายามซ่อมแซม JSON ที่ไม่สมบูรณ์
            let fixedContent = rawContent;
            // ถ้าสิ้นสุดด้วยเครื่องหมายคำพูดที่ไม่มีปิด ให้ปิดให้
            if (fixedContent.endsWith('"') || fixedContent.endsWith("'")) {
              fixedContent += '"';
            }
            
            // ปิดวงเล็บและเครื่องหมายปีกกาที่อาจขาดหายไป
            let openBraces = (fixedContent.match(/\{/g) || []).length;
            let closeBraces = (fixedContent.match(/\}/g) || []).length;
            let openBrackets = (fixedContent.match(/\[/g) || []).length;
            let closeBrackets = (fixedContent.match(/\]/g) || []).length;
            
            // เพิ่มวงเล็บปีกกาปิดที่ขาดหาย
            for (let i = 0; i < openBraces - closeBraces; i++) {
              fixedContent += '}';
            }
            
            // เพิ่มวงเล็บเหลี่ยมปิดที่ขาดหาย
            for (let i = 0; i < openBrackets - closeBrackets; i++) {
              fixedContent += ']';
            }
            
            return JSON.parse(fixedContent);
          } catch (repairError) {
            console.error("ไม่สามารถซ่อมแซม JSON ที่ถูกตัดได้:", repairError);
            
            // ถ้าไม่สามารถซ่อมแซมได้ ลองสร้างโครงสร้างข้อมูลเริ่มต้นแทน
            return {
              elements: [],
              canvasSize: { width: 900, height: 500 }
            };
          }
        }
        
        return JSON.parse(rawContent);
      }
      
      // ถ้าเป็น object อยู่แล้วก็ใช้ได้เลย
      return rawContent; 
    } catch (e: any) {
      console.error('Error parsing template content:', e);
      message.error(`เกิดข้อผิดพลาดในการอ่านข้อมูลเทมเพลต: ${e.message}`);
      
      // ถ้าแปลงไม่ได้ ให้คืนค่าโครงสร้างข้อมูลเริ่มต้น
      return {
        elements: [],
        canvasSize: { width: 900, height: 500 }
      };
    }
  };

  // เพิ่ม useEffect เพื่อดึงข้อมูล template เมื่อเป็นโหมดแก้ไข
  useEffect(() => {
    const fetchTemplate = async () => {
      if (!templateId) return;
      
      try {
        console.log(`เรียกข้อมูล template ID: ${templateId}`);
        setLoading(true);
        
        // ถ้ามี initialTemplate ให้ใช้ข้อมูลนั้นแทนการเรียก API
        if (initialTemplate) {
          console.log("Fetched template data:", initialTemplate);
          
          // ตั้งค่าข้อมูล template
          setTemplateInfo({
            name: initialTemplate.Name || initialTemplate.name || '',
            description: initialTemplate.Description || initialTemplate.description || '',
            productKey: initialTemplate.ProductKey || initialTemplate.productKey || '',
            customerKey: initialTemplate.CustomerKey || initialTemplate.customerKey || ''
          });
          
          // โหลด elements จาก Content
          const parsedContent = extractAndFixContent(initialTemplate);
          if (parsedContent) {
            console.log("ข้อมูล Content หลังแปลง:", parsedContent);
            
            if (parsedContent.elements && Array.isArray(parsedContent.elements)) {
              console.log(`พบ elements จำนวน ${parsedContent.elements.length} รายการ`);
              setElements(parsedContent.elements);
              
              // ถ้าเป็นเอลิเมนต์ประเภทรูปภาพ ให้สร้างอ็อบเจกต์รูปภาพ
              const loadedElements = await Promise.all(parsedContent.elements.map(async (el: ElementType) => {
                if (el.type === 'image' && 'src' in el) {
                  const imgEl = el as ImageElement;
                  try {
                    const img = await urlToImage(imgEl.src);
                    return { ...imgEl, imageObj: img };
                  } catch (err: any) {
                    console.error('Error loading image:', err);
                    return el;
                  }
                } else if (el.type === 'barcode') {
                  // สร้าง barcode dataURL
                  try {
                    const barcodeEl = el as BarcodeElement;
                    await updateBarcodeDataUrl(barcodeEl);
                  } catch (err: any) {
                    console.error('Error generating barcode:', err);
                  }
                } else if (el.type === 'qr') {
                  // สร้าง QR dataURL
                  try {
                    const qrEl = el as QrElement;
                    await updateQrDataUrl(qrEl);
                  } catch (err: any) {
                    console.error('Error generating QR code:', err);
                  }
                }
                return el;
              }));
              
              setElements(loadedElements);
            } else {
              console.warn("ไม่พบข้อมูล elements หรือไม่ใช่ array ในข้อมูล Content");
              // สร้าง elements ว่างไว้เป็นค่าตั้งต้น
              setElements([]);
            }
            
            if (parsedContent.canvasSize) {
              console.log("ตั้งค่า canvasSize:", parsedContent.canvasSize);
              setCanvasSize(parsedContent.canvasSize);
            } else {
              console.warn("ไม่พบข้อมูล canvasSize ในข้อมูล Content");
            }
          } else {
            console.warn("ไม่สามารถแปลงข้อมูล Content ได้");
            // สร้าง elements ว่างไว้เป็นค่าตั้งต้น
            setElements([]);
          }
          
          setIsEditMode(true);
          setLoading(false);
          return; // ออกจากฟังก์ชันหลังจากใช้ initialTemplate
        }
        
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('กรุณาเข้าสู่ระบบก่อน');
        }

        const res = await fetch(`http://localhost:5051/api/templates/${templateId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        console.log("Fetched template data:", data);
        
        // ตั้งค่าข้อมูล template
        setTemplateInfo({
          name: data.Name || data.name || '',
          description: data.Description || data.description || '',
          productKey: data.ProductKey || data.productKey || '',
          customerKey: data.CustomerKey || data.customerKey || ''
        });
        
        // โหลด elements จาก Content
        const parsedContent = extractAndFixContent(data);
        if (parsedContent) {
          console.log("ข้อมูล Content หลังแปลง:", parsedContent);
          
          if (parsedContent.elements && Array.isArray(parsedContent.elements)) {
            console.log(`พบ elements จำนวน ${parsedContent.elements.length} รายการ`);
            setElements(parsedContent.elements);
            
            // ถ้าเป็นเอลิเมนต์ประเภทรูปภาพ ให้สร้างอ็อบเจกต์รูปภาพ
            const loadedElements = await Promise.all(parsedContent.elements.map(async (el: ElementType) => {
              if (el.type === 'image' && 'src' in el) {
                const imgEl = el as ImageElement;
                try {
                  const img = await urlToImage(imgEl.src);
                  return { ...imgEl, imageObj: img };
                } catch (err: any) {
                  console.error('Error loading image:', err);
                  return el;
                }
              } else if (el.type === 'barcode') {
                // สร้าง barcode dataURL
                try {
                  const barcodeEl = el as BarcodeElement;
                  await updateBarcodeDataUrl(barcodeEl);
                } catch (err: any) {
                  console.error('Error generating barcode:', err);
                }
              } else if (el.type === 'qr') {
                // สร้าง QR dataURL
                try {
                  const qrEl = el as QrElement;
                  await updateQrDataUrl(qrEl);
                } catch (err: any) {
                  console.error('Error generating QR code:', err);
                }
              }
              return el;
            }));
            
            setElements(loadedElements);
          } else {
            console.warn("ไม่พบข้อมูล elements หรือไม่ใช่ array ในข้อมูล Content");
            // สร้าง elements ว่างไว้เป็นค่าตั้งต้น
            setElements([]);
          }
          
          if (parsedContent.canvasSize) {
            console.log("ตั้งค่า canvasSize:", parsedContent.canvasSize);
            setCanvasSize(parsedContent.canvasSize);
          } else {
            console.warn("ไม่พบข้อมูล canvasSize ในข้อมูล Content");
          }
        } else {
          console.warn("ไม่สามารถแปลงข้อมูล Content ได้");
          // สร้าง elements ว่างไว้เป็นค่าตั้งต้น
          setElements([]);
        }
        
        setIsEditMode(true);
      } catch (err: any) {
        console.error('Error fetching template:', err);
        message.error(`ไม่สามารถดึงข้อมูล template ได้: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (templateId) {
      fetchTemplate();
    }
  }, [templateId, initialTemplate]);

  // เมื่อเปลี่ยนมาตรฐาน ให้เปลี่ยน format ของ barcode ที่เลือกอยู่ (ถ้ามี)
  useEffect(() => {
    setElements(els => els.map(el => {
      if (el.type === 'barcode') {
        const allowed = BARCODE_FORMATS_BY_STANDARD[labelStandard];
        // ถ้า format เดิมไม่อยู่ใน allowed ให้เปลี่ยนเป็นตัวแรก
        if (!allowed.includes(el.format)) {
          return { ...el, format: allowed[0] };
        }
      }
      return el;
    }));
  }, [labelStandard]);

  // Undo/Redo
  const pushHistory = (els: ElementType[]) => {
    // Deep clone elements to prevent reference issues
    const clonedElements = els.map(el => {
      const cloned = { ...el };
      if (el.type === 'image' && 'imageObj' in el) {
        delete (cloned as any).imageObj;  // Remove imageObj before storing
      }
      return cloned;
    });
    setHistory(h => [...h, JSON.stringify(clonedElements)]);
  };

  const handleUndo = () => {
    if (history.length > 0) {
      setFuture(f => [JSON.stringify(elements), ...f]);
      const prev = JSON.parse(history[history.length - 1]);
      
      // Restore elements but rebuild image objects
      const restoredElements = prev.map((el: ElementType) => {
        if (el.type === 'image' && el.src) {
          // Re-create image object
          const img = new window.Image();
          img.src = el.src;
          return { ...el, imageObj: img };
        }
        return el;
      });
      
      setElements(restoredElements);
      setHistory(h => h.slice(0, h.length - 1));
      setSelectedIds([]);
    }
  };

  const handleRedo = () => {
    if (future.length > 0) {
      pushHistory(elements);
      const next = JSON.parse(future[0]);
      setElements(next);
      setFuture(f => f.slice(1));
      setSelectedIds([]);
    }
  };

  // Add element
  const handleAddElement = (type: string) => {
    const newEl = getDefaultElement(type as ElementType['type']);
    pushHistory(elements);
    setElements([...elements, newEl]);
    setSelectedIds([newEl.id]);
  };

  // Select
  const handleSelect = (id: string, isMultiSelect: boolean) => {
    setSelectedIds(prev => {
      if (isMultiSelect) {
        // toggle select
        if (prev.includes(id)) {
          return prev.filter(i => i !== id);
        } else {
          return [...prev, id];
        }
      } else {
        return [id];
      }
    });
  };

  // Delete
  const handleDelete = () => {
    if (selectedIds.length) {
      pushHistory(elements);
      setElements(elements.filter(el => !selectedIds.includes(el.id)));
      setSelectedIds([]);
    }
  };

  // Move Layer
  const moveLayer = (id: string, dir: 'up' | 'down') => {
    const idx = elements.findIndex(el => el.id === id);
    if (idx < 0) return;
    let newEls = [...elements];
    if (dir === 'up' && idx < elements.length - 1) {
      [newEls[idx], newEls[idx + 1]] = [newEls[idx + 1], newEls[idx]];
    } else if (dir === 'down' && idx > 0) {
      [newEls[idx], newEls[idx - 1]] = [newEls[idx - 1], newEls[idx]];
    }
    pushHistory(elements);
    setElements(newEls);
  };

  // Lock/Hide
  const toggleLock = (id: string) => {
    setElements(elements.map(el => el.id === id ? { ...el, locked: !el.locked } : el));
  };
  const toggleVisible = (id: string) => {
    setElements(elements.map(el => el.id === id ? { ...el, visible: !el.visible } : el));
  };

  // Export PNG
  const handleExportPNG = async () => {
    if (!stageRef.current) return;
    const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = 'label.png';
    link.href = uri;
    link.click();
  };

  // Export PDF
  const handleExportPDF = async () => {
    if (!stageRef.current) return;
    const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [canvasSize.width, canvasSize.height] });
    pdf.addImage(uri, 'PNG', 0, 0, canvasSize.width, canvasSize.height);
    pdf.save('label.pdf');
  };

  // Export JSON
  const handleExportJSON = () => {
    const data = JSON.stringify({ elements, canvasSize });
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = 'label.json';
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  // Import JSON
  const handleImportJSON = () => {
    try {
      const data = JSON.parse(importJson);
      if (data.elements && data.canvasSize) {
        pushHistory(elements);
        setElements(data.elements);
        setCanvasSize(data.canvasSize);
        setImportModal(false);
        setImportJson('');
        message.success('Import successful');
      } else {
        message.error('Invalid JSON');
      }
    } catch {
      message.error('Invalid JSON');
    }
  };

  // Zoom
  const handleZoom = (inOrOut: 'in' | 'out') => {
    setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + (inOrOut === 'in' ? ZOOM_STEP : -ZOOM_STEP))));
  };

  // Canvas size
  const handleCanvasSize = (w: number, h: number) => {
    // คำนวณอัตราส่วนใหม่
    const scaleX = w / canvasSize.width;
    const scaleY = h / canvasSize.height;
    
    // สร้าง elements ชุดใหม่ที่ปรับขนาดและตำแหน่งให้เหมาะสมกับ canvas ใหม่
    setElements(els => els.map(el => {
      // resize ตำแหน่งและขนาด
      let newX = el.x * scaleX;
      let newY = el.y * scaleY;
      let newWidth = el.width * scaleX;
      let newHeight = el.height * scaleY;
      
      // ปรับขนาดตัวอักษรตามอัตราส่วน ถ้าเป็น text element
      let newFontSize = el.type === 'text' ? 
        Math.max(8, Math.round((el as TextElement).fontSize * Math.min(scaleX, scaleY))) : 
        undefined;
      
      // ถ้าเป็น line อาจจะไม่ต้องปรับความสูงให้เต็มที่
      if (el.type === 'line') {
        newHeight = el.height; // คงความหนาของเส้นไว้
      }
      
      // ถ้าหลุดขอบ ให้ขยับกลับเข้ามา
      if (newX < 0) newX = 0;
      if (newY < 0) newY = 0;
      if (newX + newWidth > w) {
        // ถ้าเกิดจากการลดขนาด canvas ให้ลดขนาด element ลงให้พอดี
        newWidth = Math.max(20, w - newX);
      }
      if (newY + newHeight > h) {
        // ถ้าเกิดจากการลดขนาด canvas ให้ลดขนาด element ลงให้พอดี
        newHeight = Math.max(10, h - newY);
      }
      
      // ส่งค่ากลับไปตามชนิดของ element
      if (el.type === 'text') {
        return {
          ...el,
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
          fontSize: newFontSize
        } as TextElement;
      } else {
        return {
          ...el,
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight
        };
      }
    }));
    
    setCanvasSize({ width: w, height: h });
  };

  // Image upload
  const handleImageUpload = async (file: any, elId: string) => {
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      const url = e.target.result;
      const img = await urlToImage(url);
      setElements(els => els.map(el => el.id === elId ? { ...el, src: url, imageObj: img } : el));
    };
    reader.readAsDataURL(file);
    return false;
  };

  // Properties update
  const handlePropChange = (key: string, value: any) => {
    if (selectedIds.length === 1) {
      setElements(els => els.map(el => {
        if (el.id === selectedIds[0]) {
          // Type assertion เพื่อให้ TypeScript รู้ว่า key เป็น property ของ el
          return { ...el, [key]: value } as ElementType;
        }
        return el;
      }));
    }
  };

  // ฟังก์ชันสร้าง dataURL สำหรับ QR
  async function updateQrDataUrl(el: ElementType) {
    if (el.type === 'qr' && el.value) {
      const url = await QRCode.toDataURL(el.value, { width: el.width, margin: 0 });
      setQrDataUrls(prev => ({ ...prev, [el.id]: url }));
    }
  }

  // ฟังก์ชันสร้าง dataURL สำหรับ Barcode (ใช้ jsbarcode)
  async function updateBarcodeDataUrl(el: ElementType) {
    if (el.type === 'barcode' && el.value) {
      const canvas = document.createElement('canvas');
      try {
        JsBarcode(canvas, el.value, {
          format: el.format || 'CODE128',
          width: 2,
          height: el.height,
          displayValue: false,
          margin: 0,
        });
        const url = canvas.toDataURL('image/png');
        setBarcodeDataUrls(prev => ({ ...prev, [el.id]: url }));
      } catch (err) {
        // handle error
      }
    }
  }

  useEffect(() => {
    elements.forEach(el => {
      if (el.type === 'qr' && el.value && !qrDataUrls[el.id]) {
        updateQrDataUrl(el);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  // โหลด image object จาก dataURL
  useEffect(() => {
    Object.entries(qrDataUrls).forEach(([id, url]) => {
      if (!qrImages[id] && url) {
        const img = new window.Image();
        img.onload = () => {
          setQrImages(prev => ({ ...prev, [id]: img }));
        };
        img.src = url;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrDataUrls]);

  // ลบ qrDataUrls/qrImages เมื่อขนาด canvas เปลี่ยน
  useEffect(() => {
    setQrDataUrls({});
    setQrImages({});
  }, [canvasSize.width, canvasSize.height]);

  // useEffect สำหรับ barcode
  useEffect(() => {
    elements.forEach(el => {
      if (el.type === 'barcode' && el.value && !barcodeDataUrls[el.id]) {
        updateBarcodeDataUrl(el);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  useEffect(() => {
    Object.entries(barcodeDataUrls).forEach(([id, url]) => {
      if (!barcodeImages[id] && url) {
        const img = new window.Image();
        img.onload = () => {
          setBarcodeImages(prev => ({ ...prev, [id]: img }));
        };
        img.src = url;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcodeDataUrls]);

  // เพิ่มฟังก์ชันสำหรับ snapping
  const snapToNearest = (pos: { x: number, y: number }, elements: ElementType[]) => {
    if (!FEATURES.SNAPPING.ENABLED) return pos;

    const snapToGrid = (value: number) => Math.round(value / FEATURES.SNAPPING.GRID_SIZE) * FEATURES.SNAPPING.GRID_SIZE;
    
    let newX = snapToGrid(pos.x);
    let newY = snapToGrid(pos.y);

    // Snap to other elements
    elements.forEach(el => {
      if (el.id === selectedIds[0]) return; // Skip selected element
      
      // Snap to edges
      const snapDistance = FEATURES.SNAPPING.SNAP_DISTANCE;
      if (Math.abs(pos.x - el.x) < snapDistance) newX = el.x;
      if (Math.abs(pos.x - (el.x + el.width)) < snapDistance) newX = el.x + el.width;
      if (Math.abs(pos.y - el.y) < snapDistance) newY = el.y;
      if (Math.abs(pos.y - (el.y + el.height)) < snapDistance) newY = el.y + el.height;
    });

    return { x: newX, y: newY };
  };

  // เพิ่มฟังก์ชันสำหรับ keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent) => {
    // Handle Ctrl+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
      return;
    }

    // Handle Ctrl+A for select all
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      const selectableElements = elements.filter(el => !el.locked && el.visible !== false);
      setSelectedIds(selectableElements.map(el => el.id));
      return;
    }

    if (!selectedIds.length) return;

    const selectedElement = elements.find(el => el.id === selectedIds[0]);
    if (!selectedElement) return;

    const moveStep = FEATURES.SNAPPING.GRID_SIZE;
    let newX = selectedElement.x;
    let newY = selectedElement.y;

    switch (e.key) {
      case FEATURES.KEYBOARD.DELETE:
        handleDelete();
        break;
      case FEATURES.KEYBOARD.MOVE.UP:
        newY -= moveStep;
        break;
      case FEATURES.KEYBOARD.MOVE.DOWN:
        newY += moveStep;
        break;
      case FEATURES.KEYBOARD.MOVE.LEFT:
        newX -= moveStep;
        break;
      case FEATURES.KEYBOARD.MOVE.RIGHT:
        newX += moveStep;
        break;
      case 'c':
        if (e.ctrlKey || e.metaKey) {
          if (e.shiftKey) {
            // Cut
            setCopiedElement(selectedElement);
            handleDelete();
          } else {
            // Copy
            setCopiedElement(selectedElement);
          }
        }
        break;
      case 'v':
        if ((e.ctrlKey || e.metaKey) && copiedElement) {
          const newEl = { ...copiedElement, id: uuidv4(), x: newX + 10, y: newY + 10 };
          setElements([...elements, newEl]);
          setSelectedIds([newEl.id]);
        }
        break;
      case 'd':
        if (e.ctrlKey || e.metaKey) {
          const newEls = selectedIds.map(id => {
            const el = elements.find(e => e.id === id);
            if (!el) return null;
            return { ...el, id: uuidv4(), x: el.x + 10, y: el.y + 10 };
          }).filter(Boolean) as ElementType[];
          setElements([...elements, ...newEls]);
          setSelectedIds(newEls.map(el => el.id));
        }
        break;
    }

    if (newX !== selectedElement.x || newY !== selectedElement.y) {
      setElements(els => els.map(el => {
        if (selectedIds.includes(el.id)) {
          return { ...el, x: newX, y: newY };
        }
        return el;
      }));
    }
  };

  // เพิ่ม useEffect สำหรับ keyboard shortcuts
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, elements, copiedElement]);

  // ปรับปรุงฟังก์ชัน onDragEnd ให้ใช้ snapping
  const handleDragEnd = (e: any) => {
    const node = e.target;
    const pos = snapToNearest(node.position(), elements);
    node.position(pos);
    setElements(els => els.map(el => {
      if (el.id === node.id()) {
        return { ...el, x: pos.x, y: pos.y };
      }
      return el;
    }));
  };

  // ปรับปรุงฟังก์ชัน render element
  const renderElement = (el: ElementType) => {
    const isSelected = selectedIds.includes(el.id);
    // สี highlight เข้มขึ้น
    const highlightColor = '#1976d2';
    const selectionStyle = isSelected ? {
      fill: highlightColor
    } : {
      fill: 'text' in el ? el.fill : '#000000'
    };

    switch (el.type) {
      case 'text':
        return (
          <MemoText
            text={el.text}
            fontSize={el.fontSize}
            width={el.width}
            height={el.height}
            align={el.align}
            verticalAlign="middle"
            fontFamily={el.fontFamily}
            fontStyle={el.fontStyle || 'normal'}
            fontWeight={el.fontWeight || 'normal'}
            rotation={el.rotation}
            fill={isSelected ? highlightColor : el.fill}
            onDblClick={(e) => handleTextDblClick(e, el as TextElement)}
            wrap="word"
            lineHeight={1.2}
          />
        );
      case 'variable':
        const variableText = el.defaultValue || `{${el.name}}`;
        return (
          <>
            <MemoRect
              width={Math.max(el.width, getTextWidth(variableText, 18, 'Arial') + 20)}
              height={el.height}
              fill={el.fill}
            />
            <MemoText
              text={variableText}
              fontSize={18}
              x={0}
              y={0}
              width={Math.max(el.width, getTextWidth(variableText, 18, 'Arial') + 20)}
              height={el.height}
              align="center"
              verticalAlign="middle"
              fill={isSelected ? highlightColor : '#000000'}
            />
          </>
        );
      case 'qr':
        return qrImages[el.id] && qrImages[el.id].width > 0 && qrImages[el.id].height > 0 && (
          <MemoKonvaImage
            image={qrImages[el.id]}
            width={el.width}
            height={el.height}
          />
        );
      case 'image':
        return el.src && el.imageObj && (
          <MemoKonvaImage image={el.imageObj} width={el.width} height={el.height} />
        );
      case 'rect':
        return (
          <MemoRect 
            width={el.width} 
            height={el.height} 
            fill={el.fill}
            stroke={el.borderColor || '#000000'}
            strokeWidth={el.borderWidth ?? 1}
            dash={el.borderStyle === 'dashed' ? [8, 4] : el.borderStyle === 'dotted' ? [2, 4] : []}
            onDblClick={() => {
              const x = typeof el.x === 'number' ? el.x : 0;
              const y = typeof el.y === 'number' ? el.y : 0;
              const w = typeof el.width === 'number' ? el.width : 80;
              const h = typeof el.height === 'number' ? el.height : 24;
              setElements(els => [
                ...els.filter(Boolean),
                {
                  id: uuidv4(),
                  type: 'text',
                  x: x + w / 2 - 40,
                  y: y + h / 2 - 12,
                  width: 80,
                  height: 24,
                  text: 'Text',
                  fontSize: 18,
                  fontFamily: 'Arial',
                  fill: '#000',
                  align: 'center',
                  draggable: true,
                  visible: true,
                  layer: 0,
                  fontWeight: 'normal'
                } as TextElement
              ]);
            }}
          />
        );
      case 'ellipse':
        return (
          <MemoRect
            width={el.width}
            height={el.height}
            cornerRadius={Math.min(el.width, el.height) / 2}
            fill={el.fill}
            stroke={el.borderColor || '#000000'}
            strokeWidth={el.borderWidth ?? 1}
            dash={el.borderStyle === 'dashed' ? [8, 4] : el.borderStyle === 'dotted' ? [2, 4] : []}
            onDblClick={() => {
              const x = typeof el.x === 'number' ? el.x : 0;
              const y = typeof el.y === 'number' ? el.y : 0;
              const w = typeof el.width === 'number' ? el.width : 80;
              const h = typeof el.height === 'number' ? el.height : 24;
              setElements(els => [
                ...els.filter(Boolean),
                {
                  id: uuidv4(),
                  type: 'text',
                  x: x + w / 2 - 40,
                  y: y + h / 2 - 12,
                  width: 80,
                  height: 24,
                  text: 'Text',
                  fontSize: 18,
                  fontFamily: 'Arial',
                  fill: '#000',
                  align: 'center',
                  draggable: true,
                  visible: true,
                  layer: 0,
                  fontWeight: 'normal'
                } as TextElement
              ]);
            }}
          />
        );
      case 'line':
        return (
          <MemoRect
            x={0}
            y={0}
            width={el.width}
            height={Math.max(1, el.height)}
            fill={el.fill}
            opacity={isSelected ? 0.7 : 1}
            stroke={isSelected ? highlightColor : undefined}
            strokeWidth={isSelected ? 2 : 0}
          />
        );
      case 'arrow':
        return (
          <>
            <MemoRect
              x={0}
              y={el.height / 2 - 1}
              width={el.width - 10}
              height={2}
              {...selectionStyle}
            />
            <MemoRect
              x={el.width - 10}
              y={el.height / 2 - 6}
              width={10}
              height={12}
              rotation={45}
              {...selectionStyle}
            />
          </>
        );
      case 'barcode':
        return barcodeImages[el.id] && (
          <MemoKonvaImage
            image={barcodeImages[el.id]}
            width={el.width}
            height={el.height}
          />
        );
      default:
        return null;
    }
  };

  // เพิ่มฟังก์ชันคำนวณความกว้างของข้อความ
  const getTextWidth = (text: string, fontSize: number, fontFamily: string): number => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      context.font = `${fontSize}px ${fontFamily}`;
      return context.measureText(text).width + 20; // เพิ่ม padding 20px
    }
    return 100; // ค่าเริ่มต้นถ้าไม่สามารถคำนวณได้
  };

  // Add text editing handlers
  const handleTextDblClick = (e: any, el: TextElement) => {
    const stage = e.target.getStage();
    const container = stage.container();
    setElements(els => els.map(e => e.id === el.id ? { ...e, visible: false } : e));
    // textarea รองรับหลายบรรทัดและตัดคำอัตโนมัติ
    const textArea = document.createElement('textarea');
    container.appendChild(textArea);
    textArea.value = el.text;
    textArea.style.position = 'absolute';
    textArea.style.top = el.y + stage.container().offsetTop + 'px';
    textArea.style.left = el.x + stage.container().offsetLeft + 'px';
    textArea.style.width = el.width + 'px';
    textArea.style.height = el.height + 'px';
    textArea.style.fontSize = el.fontSize + 'px';
    textArea.style.border = '1px solid #00A1FF';
    textArea.style.padding = '0px';
    textArea.style.margin = '0px';
    textArea.style.overflow = 'auto';
    textArea.style.background = 'none';
    textArea.style.outline = 'none';
    textArea.style.resize = 'none';
    textArea.style.lineHeight = '1.2';
    textArea.style.fontFamily = el.fontFamily;
    textArea.style.transformOrigin = 'left top';
    textArea.style.textAlign = el.align;
    textArea.style.color = el.fill;
    textArea.wrap = 'soft';
    textArea.spellcheck = false;
    textArea.focus();
    // Enter = ขึ้นบรรทัดใหม่, Esc = blur
    textArea.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape') {
        textArea.blur();
      }
    });
    textArea.addEventListener('blur', function() {
      container.removeChild(textArea);
      setElements(els => els.map(e => 
        e.id === el.id 
          ? { ...e, text: textArea.value, visible: true } as TextElement
          : e
      ));
    });
  };

  // Add save template function
  const handleSaveTemplate = async () => {
    if (!templateInfo.name) {
      message.error('กรุณาใส่ชื่อเทมเพลต');
      setIsSettingsVisible(true);
      return;
    }
    
    setIsSaving(true);
    
    try {
      // ฟังก์ชันช่วยจำกัดความยาวของสตริง
      const truncateString = (str: string | undefined | null, maxLength: number) => {
        if (!str) return null;
        return str.substring(0, maxLength);
      };
      
      // ฟังก์ชันลดขนาดของ data URL สำหรับรูปภาพ
      const compressImageDataUrl = async (dataUrl: string, maxSize: number = 20000): Promise<string> => {
        if (!dataUrl || dataUrl.length <= maxSize || !dataUrl.startsWith('data:image')) {
          return dataUrl;
        }
        
        // ถ้าเราอยู่ในเบราว์เซอร์ จะใช้ Canvas API เพื่อลดขนาดรูปภาพ
        if (typeof window !== 'undefined') {
          return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              
              // ลดขนาดตามอัตราส่วน 
              let { width, height } = img;
              let scale = 1;
              
              // ถ้าข้อมูลมีขนาดใหญ่มาก ลดขนาดรูปภาพลง
              if (dataUrl.length > 100000) {
                scale = 0.3; // ลดขนาดลง 70%
              } else if (dataUrl.length > 50000) {
                scale = 0.5; // ลดขนาดลง 50%
              } else if (dataUrl.length > 30000) {
                scale = 0.7; // ลดขนาดลง 30%
              }
              
              width = Math.floor(width * scale);
              height = Math.floor(height * scale);
              
              canvas.width = width;
              canvas.height = height;
              
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                resolve(dataUrl); // ถ้าไม่สามารถสร้าง context ได้ ส่งคืนค่าเดิม
                return;
              }
              
              // วาดรูปภาพลงบน canvas ด้วยขนาดที่ลดลง
              ctx.drawImage(img, 0, 0, width, height);
              
              // ปรับคุณภาพ JPEG ให้ต่ำลงเพื่อลดขนาดไฟล์ (0.5 = 50% quality)
              const quality = 0.6;
              // แปลง canvas กลับเป็น data URL ด้วยคุณภาพที่ลดลง
              const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
              
              console.log(`ลดขนาดรูปภาพจาก ${dataUrl.length} เป็น ${compressedDataUrl.length} ไบต์`);
              resolve(compressedDataUrl);
            };
            
            img.onerror = () => {
              // ถ้าไม่สามารถโหลดรูปภาพได้ ส่งคืนค่า placeholder แทน
              resolve("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjwAsAAB4AAdpxxYoAAAAASUVORK5CYII=");
            };
            
            img.src = dataUrl;
          });
        }
        
        // ถ้าไม่สามารถลดขนาดได้ ส่งคืนรูปภาพ placeholder
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjwAsAAB4AAdpxxYoAAAAASUVORK5CYII=";
      };
      
      // ปรับปรุง elements โดยลดขนาดรูปภาพ (ทำให้เป็น async function)
      const optimizeElements = async (elements: ElementType[]): Promise<ElementType[]> => {
        // Normalize สีให้เป็นรูปแบบที่กระชับ
        const normalizedElements = normalizeElementColors(elements);
        
        // สร้าง array ของ Promise สำหรับแต่ละ element
        const optimizationPromises = normalizedElements.map(async (el) => {
          // ถ้าเป็น image element ให้ลดขนาดรูปภาพ
          if (el.type === 'image' && 'src' in el) {
            const imageEl = el as ImageElement;
            // ลดขนาด data URL
            const compressedSrc = await compressImageDataUrl(imageEl.src);
            return { ...imageEl, src: compressedSrc };
          }
          return el;
        });
        
        // รอให้ทุก promise เสร็จสิ้น
        return Promise.all(optimizationPromises);
      };
      
      // ดำเนินการลดขนาดข้อมูล elements
      const optimizedElements = await optimizeElements(elements);
      
      // เตรียมข้อมูลเทมเพลต - เก็บเฉพาะข้อมูลที่จำเป็น
      const safeElements = optimizedElements.map(el => {
        // ลบ imageObj เพราะไม่จำเป็นต้องส่งไป backend และอาจมีขนาดใหญ่
        if (el.type === 'image' && 'imageObj' in el) {
          const { imageObj, ...rest } = el as ImageElement;
          return rest;
        }
        return el;
      });
      
      const contentData = {
        elements: safeElements,
        canvasSize,
      };
      
      // แปลง elements เป็น components สำหรับ backend และทำให้ข้อมูลมีขนาดเล็กที่สุด
      const components = elements.map(el => {
        // แปลง type ให้ตรงกับที่ backend ต้องการ
        // ต้องเป็นค่าที่ตรงกับที่ฐานข้อมูลกำหนดไว้ใน CHECK constraint
        let componentType;
        switch (el.type) {
          case 'text': componentType = 'TEXT'; break;
          case 'barcode': componentType = 'BARCODE'; break;
          case 'qr': componentType = 'QR'; break;
          case 'rect': componentType = 'RECTANGLE'; break;
          case 'ellipse': componentType = 'ELLIPSE'; break;
          case 'line': componentType = 'LINE'; break;
          case 'arrow': componentType = 'ARROW'; break;
          case 'image': componentType = 'IMAGE'; break;
          case 'variable': componentType = 'VARIABLE'; break;
          default: componentType = 'TEXT';
        }

        // สร้าง base component ที่มีเฉพาะค่าที่จำเป็น
        // ตัดข้อมูลที่ไม่จำเป็นออกให้มากที่สุด
        const baseComponent: any = {
          componentType,
          ComponentType: componentType, // ส่งทั้งตัวพิมพ์ใหญ่และตัวพิมพ์เล็ก
          x: Math.round(el.x),
          X: Math.round(el.x),
          y: Math.round(el.y),
          Y: Math.round(el.y),
          w: el.width != null ? Math.round(el.width) : 0,
          W: el.width != null ? Math.round(el.width) : 0,
          h: el.height != null ? Math.round(el.height) : 0,
          H: el.height != null ? Math.round(el.height) : 0
        };

        // เพิ่ม properties ตามประเภทของ component
        if (el.type === 'text') {
          const textEl = el as TextElement;
          baseComponent.fontName = truncateString(textEl.fontFamily, 50) || null;
          baseComponent.FontName = truncateString(textEl.fontFamily, 50) || null;
          baseComponent.fontSize = textEl.fontSize != null ? Math.round(textEl.fontSize) : null;
          baseComponent.FontSize = textEl.fontSize != null ? Math.round(textEl.fontSize) : null;
          baseComponent.staticText = truncateString(textEl.text, 255) || null;
          baseComponent.StaticText = truncateString(textEl.text, 255) || null;
        } else if (el.type === 'barcode') {
          const barcodeEl = el as BarcodeElement;
          baseComponent.placeholder = truncateString(barcodeEl.value, 100) || null;
          baseComponent.Placeholder = truncateString(barcodeEl.value, 100) || null;
          baseComponent.barcodeFormat = truncateString(barcodeEl.format, 20) || null;
          baseComponent.BarcodeFormat = truncateString(barcodeEl.format, 20) || null;
        } else if (el.type === 'qr') {
          const qrEl = el as QrElement;
          baseComponent.placeholder = truncateString(qrEl.value, 100) || null;
          baseComponent.Placeholder = truncateString(qrEl.value, 100) || null;
        } else if (el.type === 'image') {
          const imageEl = el as ImageElement;
          baseComponent.placeholder = "image_placeholder";
          baseComponent.Placeholder = "image_placeholder";
        } else if (el.type === 'variable') {
          const varEl = el as VariableElement;
          baseComponent.placeholder = truncateString(varEl.name, 100) || null;
          baseComponent.Placeholder = truncateString(varEl.name, 100) || null;
        }

        return baseComponent;
      });

      // แปลง content เป็น JSON string
      const contentJsonString = JSON.stringify(contentData);
      console.log(`ขนาดของ JSON content: ${contentJsonString.length} ตัวอักษร`);
      
      // เพิ่มขนาดลิมิตเป็น 100,000 ตัวอักษร (เดิมใช้ 50,000)
      const MAX_CONTENT_LENGTH = 100000;
      
      // ถ้าขนาดใหญ่เกินไป ให้บีบอัดเพิ่มเติม
      let finalContent = contentJsonString;
      if (contentJsonString.length > MAX_CONTENT_LENGTH) {
        console.warn(`ขนาด JSON เกินลิมิต (${contentJsonString.length} > ${MAX_CONTENT_LENGTH}), กำลังบีบอัดเพิ่มเติม...`);
        
        // ดำเนินการบีบอัดโดยการลบ properties ที่ไม่สำคัญออก
        const compressedData = {
          elements: safeElements.map(el => {
            // ลบ properties ที่ไม่จำเป็นออก
            const { id, draggable, locked, layer, visible, rotation, ...essentials } = el as any;
            
            // ถ้าเป็น text element ให้ลบ properties ของ style ที่ไม่จำเป็นด้วย
            if (el.type === 'text') {
              const { fontStyle, fontWeight, align, ...textEssentials } = essentials;
              if (fontStyle === 'normal') delete textEssentials.fontStyle;
              if (fontWeight === 'normal') delete textEssentials.fontWeight;
              if (align === 'left') delete textEssentials.align;
              return { id, type: el.type, ...textEssentials };
            }
            
            return { id, type: el.type, ...essentials };
          }),
          canvasSize,
        };
        
        finalContent = JSON.stringify(compressedData);
        console.log(`หลังบีบอัด: ${finalContent.length} ตัวอักษร`);
        
        // ถ้ายังใหญ่เกินไป ตัดให้พอดีกับลิมิตแล้วให้ warning
        if (finalContent.length > MAX_CONTENT_LENGTH) {
          console.warn(`ขนาด JSON ยังเกินลิมิตหลังบีบอัด จะตัดให้เหลือ ${MAX_CONTENT_LENGTH} ตัวอักษร`);
          finalContent = finalContent.substring(0, MAX_CONTENT_LENGTH - 1) + '}';
        }
      }

      // สร้าง template data และกำหนด type เป็น any เพื่อให้สามารถเพิ่ม property ได้
      const templateData: any = {
        name: truncateString(templateInfo.name, 100) || 'Untitled Template', // NVARCHAR(100) NOT NULL
        Name: truncateString(templateInfo.name, 100) || 'Untitled Template', // ใช้ทั้งตัวพิมพ์ใหญ่
        description: truncateString(templateInfo.description, 255), // NVARCHAR(255)
        Description: truncateString(templateInfo.description, 255), // ใช้ทั้งตัวพิมพ์ใหญ่
        productKey: truncateString(templateInfo.productKey, 50), // VARCHAR(50)
        ProductKey: truncateString(templateInfo.productKey, 50), // ใช้ทั้งตัวพิมพ์ใหญ่
        customerKey: truncateString(templateInfo.customerKey, 50), // VARCHAR(50)
        CustomerKey: truncateString(templateInfo.customerKey, 50), // ใช้ทั้งตัวพิมพ์ใหญ่
        orientation: canvasSize.width > canvasSize.height ? 'Landscape' : 'Portrait',
        Orientation: canvasSize.width > canvasSize.height ? 'Landscape' : 'Portrait', // ใช้ทั้งตัวพิมพ์ใหญ่
        paperSize: 'A6',
        PaperSize: 'A6', // ใช้ทั้งตัวพิมพ์ใหญ่
        engine: 'html',
        Engine: 'html', // ใช้ทั้งตัวพิมพ์ใหญ่
        active: true,
        Active: true, // ใช้ทั้งตัวพิมพ์ใหญ่
        // ใช้ทั้ง Content และ content เพื่อให้แน่ใจว่าจะตรงกับที่ backend คาดหวัง
        Content: finalContent, // ตัวพิมพ์ใหญ่
        content: finalContent, // ตัวพิมพ์เล็ก
        components,
        Components: components // ใช้ทั้งตัวพิมพ์ใหญ่
      };

      if (templateId) {
        templateData.id = templateId;
        templateData.ID = templateId; // ใช้ทั้งตัวพิมพ์ใหญ่
        templateData.templateID = templateId; // ชื่อฟิลด์ที่ถูกต้องตามแบบฟอร์ม
        templateData.TemplateID = templateId; // ใช้ทั้งตัวพิมพ์ใหญ่
        templateData.incrementVersion = true; // สำคัญ: ต้องส่งค่านี้เป็น true เสมอเมื่อเป็นการแก้ไข
        templateData.IncrementVersion = true; // ใช้ทั้งตัวพิมพ์ใหญ่
        // ไม่กำหนดค่า version เมื่อเป็นการแก้ไข ให้ backend เป็นผู้เพิ่ม version
      } else {
        // กำหนดค่า version เฉพาะเมื่อเป็นการสร้างใหม่เท่านั้น
        templateData.version = 1;
        templateData.Version = 1;
      }
      
      console.log("กำลังบันทึกเทมเพลต:", templateData);
      
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('กรุณาเข้าสู่ระบบก่อน');
      }
      
      // สร้าง/อัพเดตเทมเพลต
      let endpoint = 'http://localhost:5051/api/templates';
      let method = 'POST';
      
      // ถ้ามี templateId ให้ใช้ POST แทน PUT เพื่อหลีกเลี่ยงปัญหา endpoint PUT ที่มีข้อผิดพลาด
      if (templateId) {
        // แทนที่จะใช้ endpoint = `http://localhost:5051/api/templates/${templateId}`; method = 'PUT';
        // เปลี่ยนเป็นการส่งข้อมูลด้วย POST แต่คงค่า id/templateID เพื่อให้ backend รู้ว่าเป็นการแก้ไข
        templateData.isUpdate = true; // เพิ่มฟิลด์เพื่อบ่งบอกว่านี่คือการอัพเดต
        templateData.IsUpdate = true; // ใช้ทั้งตัวพิมพ์ใหญ่และเล็ก
      }
      
      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(templateData)
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.message || 
          `HTTP error! status: ${res.status}`
        );
      }
      
      const savedTemplate = await res.json();
      console.log("บันทึกเทมเพลตสำเร็จ:", savedTemplate);
      
      message.success(`บันทึกเทมเพลต ${templateInfo.name} สำเร็จ`);
      
      // เปลี่ยนเส้นทางไปยังหน้า template management
      router.push('/templates/management');
    } catch (err: any) {
      console.error('Error saving template:', err);
      message.error(`ไม่สามารถบันทึกเทมเพลตได้: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Update save button click handler
  const handleSaveClick = () => {
    // หา Product Name จาก elements
    const productNameElement = elements.find(el => 
      el.type === 'text' && 
      el.fontWeight === 'bold' && 
      el.fontSize >= LABEL_CONFIG.headerFontSize
    ) as TextElement | undefined;

    // หา Product Code และ Customer Code จาก text element
    let productKey = '';
    let customerKey = '';
    const productCodeIdx = elements.findIndex(el => el.type === 'text' && el.text.trim().toLowerCase() === 'product code:');
    if (productCodeIdx !== -1 && elements[productCodeIdx + 1]?.type === 'text') {
      productKey = (elements[productCodeIdx + 1] as TextElement).text;
    }
    const customerCodeIdx = elements.findIndex(el => el.type === 'text' && el.text.trim().toLowerCase() === 'customer code:');
    if (customerCodeIdx !== -1 && elements[customerCodeIdx + 1]?.type === 'text') {
      customerKey = (elements[customerCodeIdx + 1] as TextElement).text;
    }

    // แก้ไข productName: ตัดอักขระพิเศษและช่องว่างออก
    let cleanProductName = productNameElement?.text || '';
    cleanProductName = cleanProductName.replace(/[^a-zA-Z0-9ก-๙]/g, '');

    setTemplateInfo({
      name: cleanProductName,
      description: '',
      productKey: productKey,
      customerKey: customerKey
    });

    setTemplateInfoModal(true);
  };

  // เพิ่มฟังก์ชัน buildElementsFromBatch
  const buildElementsFromBatch = useCallback((data: any): ElementType[] => {
    const els: ElementType[] = [];
    const { width: cw, height: ch } = canvasSize;
    
    // คำนวณอัตราส่วนสเกลเมื่อเทียบกับ canvas มาตรฐาน 900x500
    const scaleX = cw / 900;
    const scaleY = ch / 500;
    
    const margin = Math.min(cw, ch) * 0.05;
    const contentWidth = cw - margin * 2;
    const labelWidth = contentWidth * LABEL_CONFIG.labelWidth;
    const valueWidth = contentWidth * LABEL_CONFIG.valueWidth;
    let y = margin;

    // คำนวณขนาดอักษรโดยปรับตามขนาด canvas
    const scaleFontSize = (size: number) => Math.max(8, Math.round(size * Math.min(scaleX, scaleY)));
    const headerFontSize = scaleFontSize(LABEL_CONFIG.headerFontSize);
    const normalFontSize = scaleFontSize(LABEL_CONFIG.normalFontSize);
    const lineHeight = scaleFontSize(LABEL_CONFIG.lineHeight);
    const spacing = Math.max(4, LABEL_CONFIG.spacing * Math.min(scaleX, scaleY));

    // header
    els.push({
      id: uuidv4(), type: 'text',
      x: margin, y,
      width: getTextWidth(data.productName || '', headerFontSize, 'Arial'),
      height: lineHeight * 1.2,
      text: data.productName || '–',
      fontSize: headerFontSize,
      fontFamily: 'Arial', fill: '#000', align: 'left',
      fontWeight: 'bold', draggable: true, visible: true, layer: 0
    } as TextElement);
    y += lineHeight * 1.5;

    // main fields
    FIELD_CONFIG.forEach(field => {
      const rawVal = (() => {
        if (field.key === 'finalExpiryDate') {
          return data.finalExpiryDate ?? data.dateExpiry ?? (
            data.productionDate
              ? (() => {
                  const pd = new Date(data.productionDate);
                  pd.setDate(pd.getDate() + 365);
                  return pd;
                })()
              : undefined
          );
        }
        return data[field.key];
      })();
      // label — คำนวณความกว้างตามข้อความจริง
      const labelText = field.label + ':';
      const textWLabel = getTextWidth(labelText, normalFontSize, 'Arial');
      els.push({
        id: uuidv4(), type: 'text',
        x: margin, y,
        width: Math.min(labelWidth, textWLabel),
        height: lineHeight,
        text: labelText,
        fontSize: normalFontSize,
        fontFamily: 'Arial', fill: '#000', align: 'left',
        draggable: true, visible: true, layer: 0
      } as TextElement);
      // value — คำนวณความกว้างตามข้อความจริง
      const display = getDisplayValue(rawVal, field.format);
      const textW = getTextWidth(display, normalFontSize, 'Arial');
      els.push({
        id: uuidv4(), type: 'text',
        x: margin + Math.min(labelWidth, textWLabel) + spacing, y,
        width: Math.min(valueWidth, textW),
        height: lineHeight,
        text: display,
        fontSize: normalFontSize,
        fontFamily: 'Arial', fill: '#000', align: 'left',
        draggable: true, visible: true, layer: 0
      } as TextElement);
      y += lineHeight + spacing;
    });

    // shipping address
    els.push({
      id: uuidv4(), type: 'text',
      x: margin, y,
      width: contentWidth, height: lineHeight,
      text: 'Shipping Address:',
      fontSize: normalFontSize * 1.1,
      fontFamily: 'Arial', fill: '#000', align: 'left',
      draggable: true, visible: true, layer: 0
    } as TextElement);
    y += lineHeight + spacing;

    // ตรวจสอบว่าพื้นที่ที่เหลือเพียงพอสำหรับ address fields หรือไม่
    const remainingHeight = ch - y - margin;
    const estimatedAddressHeight = ADDRESS_FIELDS.length * (lineHeight + spacing * 0.5);
    
    // ถ้าไม่พอ ให้ปรับขนาดและระยะห่างลง
    let addressLineHeight = lineHeight;
    let addressSpacing = spacing * 0.5;
    
    if (estimatedAddressHeight > remainingHeight && ADDRESS_FIELDS.length > 0) {
      const reductionFactor = remainingHeight / estimatedAddressHeight;
      addressLineHeight = Math.max(8, Math.floor(lineHeight * reductionFactor));
      addressSpacing = Math.max(2, Math.floor(spacing * 0.5 * reductionFactor));
    }

    ADDRESS_FIELDS.forEach(key => {
      const labelText = key.replace('_', ' ').toUpperCase() + ':';
      const valueText = data[key] ?? '–';
      const labelWidth = getTextWidth(labelText, normalFontSize, 'Arial');
      const valueWidth = getTextWidth(String(valueText), normalFontSize, 'Arial');
      els.push({
        id: uuidv4(), type: 'text',
        x: margin + spacing, y,
        width: labelWidth,
        height: addressLineHeight,
        text: labelText,
        fontSize: normalFontSize,
        fontFamily: 'Arial', fill: '#000', align: 'left',
        draggable: true, visible: true, layer: 0
      } as TextElement);
      els.push({
        id: uuidv4(), type: 'text',
        x: margin + spacing + labelWidth + spacing, y,
        width: valueWidth,
        height: addressLineHeight,
        text: String(valueText),
        fontSize: normalFontSize,
        fontFamily: 'Arial', fill: '#000', align: 'left',
        draggable: true, visible: true, layer: 0
      } as TextElement);
      y += addressLineHeight + addressSpacing;
    });

    // barcode (ถ้ามี)
    const upc = data.UPCCODE ?? data.upccode;
    if (upc) {
      y += lineHeight;
      // ตรวจสอบว่ามีพื้นที่เพียงพอหรือไม่
      const barcodeHeight = Math.min(Math.max(40, lineHeight * 2), ch - y - margin);
      if (y + barcodeHeight + margin <= ch) {
        els.push({
          id: uuidv4(), type: 'barcode',
          x: margin, y,
          width: Math.min(contentWidth * 0.4, 300 * scaleX),
          height: barcodeHeight,
          value: String(upc),
          format: 'CODE128', fill: '#000',
          draggable: true, visible: true, layer: 0
        } as BarcodeElement);
      }
    }

    // ตรวจสอบว่ามี element ที่อยู่นอก canvas หรือไม่ และปรับตำแหน่งเข้ามา
    els.forEach(el => {
      if (el.x + el.width > cw) {
        el.width = Math.max(20, cw - el.x);
      }
      if (el.y + el.height > ch) {
        el.height = Math.max(10, ch - el.y);
      }
    });

    return els;
  }, [canvasSize]);

  // ปรับปรุงฟังก์ชัน fetchAndApplyBatch
  const fetchAndApplyBatch = async () => {
    if (!batchNo) {
      message.error('กรุณาระบุเลข Batch');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('กรุณาเข้าสู่ระบบก่อน');
      }

      // ทำความสะอาด batchNo โดยตัด :1 ออก
      const cleanBatchNo = batchNo.split(':')[0];
      console.log('>> clean batch no:', cleanBatchNo);

      const response = await fetch(`http://localhost:5051/api/batch/${cleanBatchNo}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('ไม่พบข้อมูล Batch');
      }

      const payload = await response.json();
      // ถ้าเป็น array ให้ใช้ตัวแรก
      const data = Array.isArray(payload) ? payload[0] : payload;
      console.log('>> batch record =', data);
      // สร้าง elements ใหม่จาก batch data
      const newElements = buildElementsFromBatch(data);
      console.log('>> generated elements:', newElements);
      
      pushHistory(elements);  // เก็บประวัติสำหรับ undo
      setElements(newElements);  // อัพเดท canvas ด้วย elements ใหม่

      setBatchModalVisible(false);
      message.success('Sync และสร้าง elements สำเร็จ');
    } catch (error) {
      message.error('ไม่สามารถดึงข้อมูล Batch ได้');
      console.error('Error fetching batch:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- Layout ---
  return (
    <Layout style={{ height: '100vh', background: '#f4f4f4' }}>
      {/* TopBar */}
      <Header style={{ background: '#3A2F2A', display: 'flex', alignItems: 'center', gap: 12, height: 56 }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 20, letterSpacing: 1 }}>Label Designer</span>
        <Button icon={<PlusOutlined />} onClick={() => { setElements([]); setSelectedIds([]); }}>New</Button>
        <Button icon={<SaveOutlined />} onClick={handleSaveClick}>Save</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExportPNG}>Export PNG</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExportPDF}>Export PDF</Button>
        <Button icon={<UploadOutlined />} onClick={() => setImportModal(true)}>Import</Button>
        <Button icon={<UndoOutlined />} onClick={handleUndo} disabled={history.length === 0}>Undo</Button>
        <Button icon={<RedoOutlined />} onClick={handleRedo} disabled={future.length === 0}>Redo</Button>
        <Button icon={<ZoomInOutlined />} onClick={() => handleZoom('in')}>Zoom In</Button>
        <Button icon={<ZoomOutOutlined />} onClick={() => handleZoom('out')}>Zoom Out</Button>
        <Button icon={<SettingOutlined />} onClick={() => setShowSettings(true)}>Canvas Size</Button>
        <Button danger icon={<DeleteOutlined />} onClick={handleDelete} disabled={selectedIds.length === 0}>Delete</Button>
        <Button icon={<SyncOutlined />} onClick={() => {
          setBatchNo('');  // เคลียร์ค่าเก่า
          setBatchModalVisible(true);
        }}>Sync Batch</Button>
        {lastSaved && (
          <span style={{ color: '#fff', fontSize: 12 }}>
            Last saved: {lastSaved.toLocaleTimeString()}
          </span>
        )}
      </Header>
      <Layout>
        {/* Toolbox Sidebar */}
        <Sider width={200} style={{ background: '#232323', padding: '16px 0', minHeight: '100%' }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, padding: '0 24px 16px 24px' }}>Toolbox</div>
          <Divider style={{ margin: '8px 0', borderColor: '#444' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 12px' }}>
            {TOOLBOX.map(item => (
              <Button key={item.type} icon={item.icon} block style={{ marginBottom: 8 }} onClick={() => handleAddElement(item.type)}>
                {item.label}
              </Button>
            ))}
          </div>
          <Divider style={{ margin: '16px 0', borderColor: '#444' }} />
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 16, margin: '8px 0 4px 24px' }}>Layers</div>
          <div style={{ padding: '0 12px', maxHeight: 200, overflowY: 'auto' }}>
            {elements.map((el, idx) => (
              <div key={el.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 4, background: selectedIds.includes(el.id) ? '#B8794B22' : 'transparent', borderRadius: 4 }}>
                <Button 
                  size="small" 
                  icon={<GroupOutlined />} 
                  style={{ marginRight: 4 }} 
                  onClick={e => handleSelect(el.id, e.ctrlKey || e.metaKey)} 
                />
                <span 
                  style={{ flex: 1, color: '#fff', fontSize: 13, cursor: 'pointer' }} 
                  onClick={e => handleSelect(el.id, e.ctrlKey || e.metaKey)}
                >
                  {el.type}
                </span>
                <Tooltip title={el.locked ? 'Unlock' : 'Lock'}>
                  <Button size="small" icon={el.locked ? <UnlockOutlined /> : <LockOutlined />} onClick={() => toggleLock(el.id)} style={{ marginRight: 2 }} />
                </Tooltip>
                <Tooltip title={el.visible ? 'Hide' : 'Show'}>
                  <Button size="small" icon={<EyeInvisibleOutlined />} onClick={() => toggleVisible(el.id)} style={{ marginRight: 2 }} />
                </Tooltip>
                <Tooltip title="Move Up">
                  <Button size="small" icon={<PlusOutlined />} onClick={() => moveLayer(el.id, 'up')} style={{ marginRight: 2 }} />
                </Tooltip>
                <Tooltip title="Move Down">
                  <Button size="small" icon={<MinusOutlined />} onClick={() => moveLayer(el.id, 'down')} />
                </Tooltip>
              </div>
            ))}
          </div>
        </Sider>
        {/* Canvas */}
        <Content style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f4' }}>
          <div style={{ background: '#fff', border: '2px solid #C19A6B', borderRadius: 12, boxShadow: '0 4px 24px #0002', width: canvasSize.width + 40, height: canvasSize.height + 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Stage
              ref={stageRef}
              width={canvasSize.width}
              height={canvasSize.height}
              scaleX={zoom}
              scaleY={zoom}
              style={{ background: '#fff', borderRadius: 8 }}
              onMouseDown={e => {
                if (e.target === e.target.getStage()) {
                  setSelectedIds([]);
                  const stage = e.target.getStage();
                  const pos = stage.getPointerPosition();
                  if (pos) {
                    selectionRef.current = { x: pos.x, y: pos.y, width: 0, height: 0 };
                    setSelectionVisible(true);
                  }
                }
              }}
              onMouseMove={e => {
                if (!selectionVisible) return;
                const stage = stageRef.current.getStage();
                const pos = stage.getPointerPosition();
                if (pos) {
                  selectionRef.current.width = pos.x - selectionRef.current.x;
                  selectionRef.current.height = pos.y - selectionRef.current.y;
                  setDragSelection({});
                }
              }}
              onMouseUp={() => {
                if (selectionVisible) {
                  const sel = selectionRef.current;
                  const box = {
                    x: Math.min(sel.x, sel.x + sel.width),
                    y: Math.min(sel.y, sel.y + sel.height),
                    width: Math.abs(sel.width),
                    height: Math.abs(sel.height)
                  };
                  const ids = elements.filter(el =>
                    el.x + el.width > box.x &&
                    el.x < box.x + box.width &&
                    el.y + el.height > box.y &&
                    el.y < box.y + box.height
                  ).map(el => el.id);
                  setSelectedIds(ids);
                  setSelectionVisible(false);
                  selectionRef.current = { x: 0, y: 0, width: 0, height: 0 };
                }
              }}
            >
              <Layer>
                {/* ลบ grid lines */}
                {elements.map(el => el.visible !== false && (
                  <MemoGroup
                    key={el.id}
                    id={el.id}
                    x={el.x}
                    y={el.y}
                    draggable={!el.locked}
                    dragBoundFunc={pos => {
                      let newX = Math.max(0, Math.min(pos.x, canvasSize.width - el.width));
                      let newY = Math.max(0, Math.min(pos.y, canvasSize.height - el.height));
                      return { x: newX, y: newY };
                    }}
                    onClick={e => {
                      const evt = e.evt as MouseEvent;
                      handleSelect(el.id, Boolean(evt && (evt.ctrlKey || evt.metaKey)));
                    }}
                    onTap={e => {
                      const evt = e.evt as MouseEvent;
                      handleSelect(el.id, Boolean(evt && (evt.ctrlKey || evt.metaKey)));
                    }}
                    onDragEnd={handleDragEnd}
                    onTransformEnd={e => {
                      const node = e.target;
                      let scaleX = node.scaleX();
                      let scaleY = node.scaleY();
                      let newWidth = Math.max(20, el.width * scaleX);
                      let newHeight = el.height; // default: ไม่เปลี่ยนความหนา
                      let newX = node.x();
                      let newY = node.y();
                      // ถ้าไม่ใช่ line ให้ปรับ height ตามปกติ
                      if (el.type !== 'line') {
                        newHeight = Math.max(20, el.height * scaleY);
                      }
                      // Lock boundary
                      if (newX < 0) newX = 0;
                      if (newY < 0) newY = 0;
                      if (newX + newWidth > canvasSize.width) newX = canvasSize.width - newWidth;
                      if (newY + newHeight > canvasSize.height) newY = canvasSize.height - newHeight;
                      node.scaleX(1);
                      node.scaleY(1);
                      setElements(els => els.map(item => item.id === el.id ? {
                        ...item,
                        x: newX,
                        y: newY,
                        width: newWidth,
                        height: newHeight
                      } : item));
                    }}
                  >
                    {renderElement(el)}
                  </MemoGroup>
                ))}
                {/* Multi-Transformer */}
                {selectedIds.length > 0 && stageRef.current && (() => {
                  const selectedEls = selectedIds.map(id => elements.find(el => el.id === id)).filter(Boolean);
                  // ถ้าเลือก element เดียวและเป็น line ให้ล็อก anchor เฉพาะซ้าย-ขวา
                  if (selectedEls.length === 1 && selectedEls[0]?.type === 'line') {
                    return (
                      <Transformer
                        ref={trRef}
                        nodes={selectedIds.map(id => stageRef.current && stageRef.current.findOne(`#${id}`)).filter(Boolean)}
                        enabledAnchors={['middle-left', 'middle-right']}
                        rotateEnabled={true}
                      />
                    );
                  }
                  // กรณีอื่น ๆ ใช้ anchor ปกติ
                  return (
                    <Transformer
                      ref={trRef}
                      nodes={selectedIds.map(id => stageRef.current && stageRef.current.findOne(`#${id}`)).filter(Boolean)}
                      enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center', 'middle-left', 'middle-right']}
                      rotateEnabled={true}
                    />
                  );
                })()}
              </Layer>
              {/* Selection Box Layer - อยู่ด้านบนสุด */}
              <Layer>
                {selectionVisible && (
                  <>
                    {/* Selection box */}
                    <Rect
                      x={Math.min(selectionRef.current.x, selectionRef.current.x + selectionRef.current.width)}
                      y={Math.min(selectionRef.current.y, selectionRef.current.y + selectionRef.current.height)}
                      width={Math.abs(selectionRef.current.width)}
                      height={Math.abs(selectionRef.current.height)}
                      fill="rgba(0,161,255,0.15)"
                      stroke="#1976d2"
                      strokeWidth={2}
                      dash={[10, 5]}
                    />
                    {/* เส้นประแนวตั้ง */}
                    <Line
                      points={[selectionRef.current.x, 0, selectionRef.current.x, canvasSize.height]}
                      stroke="#1976d2"
                      strokeWidth={1}
                      dash={[10, 5]}
                    />
                    <Line
                      points={[selectionRef.current.x + selectionRef.current.width, 0, selectionRef.current.x + selectionRef.current.width, canvasSize.height]}
                      stroke="#1976d2"
                      strokeWidth={1}
                      dash={[10, 5]}
                    />
                    {/* เส้นประแนวนอน */}
                    <Line
                      points={[0, selectionRef.current.y, canvasSize.width, selectionRef.current.y]}
                      stroke="#1976d2"
                      strokeWidth={1}
                      dash={[10, 5]}
                    />
                    <Line
                      points={[0, selectionRef.current.y + selectionRef.current.height, canvasSize.width, selectionRef.current.y + selectionRef.current.height]}
                      stroke="#1976d2"
                      strokeWidth={1}
                      dash={[10, 5]}
                    />
                    {/* แสดงขนาด */}
                    <Text
                      x={selectionRef.current.x + selectionRef.current.width + 5}
                      y={selectionRef.current.y + selectionRef.current.height + 5}
                      text={`${Math.abs(Math.round(selectionRef.current.width))} x ${Math.abs(Math.round(selectionRef.current.height))}`}
                      fontSize={14}
                      fill="#1976d2"
                      padding={5}
                      background="#FFFFFF"
                      backgroundOpacity={0.7}
                    />
                  </>
                )}
              </Layer>
            </Stage>
          </div>
        </Content>
        {/* Properties Sidebar */}
        <Sider width={340} style={{ background: '#fff', borderLeft: '1px solid #eee', padding: 0 }}>
          <div style={{ padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Properties</div>
            {selectedIds.length === 1 ? (
              <div>
                {/* <div>ID: <b>{selectedIds[0]}</b></div> */}
                {(() => {
                  const el = elements.find(e => e.id === selectedIds[0]);
                  if (!el) return null;
                  switch (el.type) {
                    case 'text':
                      return <>
                        <div style={{ margin: '8px 0' }}>
                          <Input value={el.text} onChange={e => handlePropChange('text', e.target.value)} addonBefore="Text" />
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <InputNumber value={el.fontSize} min={8} max={120} onChange={v => handlePropChange('fontSize', v)} addonBefore="Font Size" style={{ width: '100%' }} />
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <Input value={el.fontFamily} onChange={e => handlePropChange('fontFamily', e.target.value)} addonBefore="Font Family" />
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <Input type="color" value={el.fill} onChange={e => handlePropChange('fill', e.target.value)} addonBefore="Color" />
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <Select value={el.align} onChange={v => handlePropChange('align', v)} style={{ width: '100%' }}>
                            <Option value="left">Left</Option>
                            <Option value="center">Center</Option>
                            <Option value="right">Right</Option>
                          </Select>
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <InputNumber value={el.rotation} min={0} max={360} onChange={v => handlePropChange('rotation', v)} addonBefore="Rotation" style={{ width: '100%' }} />
                        </div>
                        <div style={{ margin: '16px 0' }}>
                          <div style={{ marginBottom: 8 }}>Border</div>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <InputNumber
                              value={el.borderWidth || 1}
                              min={0}
                              max={10}
                              onChange={v => handlePropChange('borderWidth', v)}
                              addonBefore="Width"
                              style={{ width: 120 }}
                            />
                            <Input
                              type="color"
                              value={el.borderColor || '#222222'}
                              onChange={e => handlePropChange('borderColor', e.target.value)}
                              style={{ width: 100 }}
                            />
                            <Select
                              value={el.borderStyle || 'solid'}
                              onChange={v => handlePropChange('borderStyle', v)}
                              style={{ width: 100 }}
                            >
                              <Option value="none">None</Option>
                              <Option value="solid">Solid</Option>
                              <Option value="dashed">Dashed</Option>
                              <Option value="dotted">Dotted</Option>
                            </Select>
                          </div>
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <Select value={el.fontWeight || 'normal'} onChange={v => handlePropChange('fontWeight', v)} style={{ width: '100%' }}>
                            <Option value="normal">Normal</Option>
                            <Option value="bold">Bold</Option>
                          </Select>
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <Select value={el.fontStyle || 'normal'} onChange={v => handlePropChange('fontStyle', v)} style={{ width: '100%' }}>
                            <Option value="normal">Normal</Option>
                            <Option value="italic">Italic</Option>
                          </Select>
                        </div>
                      </>;
                    case 'qr':
                      return <>
                        <div style={{ margin: '8px 0' }}>
                          <Input value={el.value} onChange={e => handlePropChange('value', e.target.value)} addonBefore="QR Value" />
                        </div>
                        <div style={{ margin: '16px 0' }}>
                          <div style={{ marginBottom: 8 }}>Border</div>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <InputNumber
                              value={el.borderWidth || 1}
                              min={0}
                              max={10}
                              onChange={v => handlePropChange('borderWidth', v)}
                              addonBefore="Width"
                              style={{ width: 120 }}
                            />
                            <Input
                              type="color"
                              value={el.borderColor || '#222222'}
                              onChange={e => handlePropChange('borderColor', e.target.value)}
                              style={{ width: 100 }}
                            />
                            <Select
                              value={el.borderStyle || 'solid'}
                              onChange={v => handlePropChange('borderStyle', v)}
                              style={{ width: 100 }}
                            >
                              <Option value="none">None</Option>
                              <Option value="solid">Solid</Option>
                              <Option value="dashed">Dashed</Option>
                              <Option value="dotted">Dotted</Option>
                            </Select>
                          </div>
                        </div>
                      </>;
                    case 'image':
                      return <>
                        <div style={{ margin: '8px 0' }}>
                          <Upload showUploadList={false} beforeUpload={file => handleImageUpload(file, el.id)}>
                            <Button icon={<FileImageOutlined />}>Upload Image</Button>
                          </Upload>
                        </div>
                      </>;
                    case 'variable':
                      return <>
                        <div style={{ margin: '8px 0' }}>
                          <Input value={el.name} onChange={e => handlePropChange('name', e.target.value)} addonBefore="Field Name" />
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <Select value={el.dataType} onChange={v => handlePropChange('dataType', v)} style={{ width: '100%' }}>
                            <Option value="text">Text</Option>
                            <Option value="number">Number</Option>
                            <Option value="date">Date</Option>
                            <Option value="counter">Counter</Option>
                          </Select>
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <Input value={el.format} onChange={e => handlePropChange('format', e.target.value)} addonBefore="Format" />
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <Input value={el.defaultValue} onChange={e => handlePropChange('defaultValue', e.target.value)} addonBefore="Default Value" />
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <Input type="color" value={el.fill} onChange={e => handlePropChange('fill', e.target.value)} addonBefore="Background" />
                        </div>
                      </>;
                    case 'rect':
                      return <>
                        <div style={{ margin: '8px 0' }}>
                          <Input type="color" value={el.fill} onChange={e => handlePropChange('fill', e.target.value)} addonBefore="Background" />
                        </div>
                      </>;
                    case 'ellipse':
                      return <>
                        <div style={{ margin: '8px 0' }}>
                          <Input type="color" value={el.fill} onChange={e => handlePropChange('fill', e.target.value)} addonBefore="Background" />
                        </div>
                      </>;
                    case 'arrow':
                      return <>
                        <div style={{ margin: '8px 0' }}>
                          <Input type="color" value={el.fill} onChange={e => handlePropChange('fill', e.target.value)} addonBefore="Background" />
                        </div>
                      </>;
                    case 'variable':
                      return <>
                        <div style={{ margin: '8px 0' }}>
                          <Input type="color" value={el.fill} onChange={e => handlePropChange('fill', e.target.value)} addonBefore="Background" />
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <Input value={el.name} onChange={e => handlePropChange('name', e.target.value)} addonBefore="Field Name" />
                        </div>
                      </>;
                    case 'line':
                      return <>
                        <div style={{ margin: '8px 0' }}>
                          <InputNumber value={el.width} min={10} max={canvasSize.width} onChange={v => handlePropChange('width', v)} addonBefore="Width" style={{ width: '100%' }} />
                        </div>
                        <div style={{ margin: '8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ minWidth: 80 }}>Thickness</span>
                          <Select
                            value={el.height}
                            onChange={v => handlePropChange('height', v)}
                            style={{ width: 90 }}
                          >
                            {[1,2,3,4,5,6].map(val => (
                              <Option key={val} value={val}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ width: 32, height: val, background: '#222', borderRadius: 2 }} />
                                  <span>{val}px</span>
                                </div>
                              </Option>
                            ))}
                          </Select>
                          <InputNumber value={el.height} min={1} max={20} onChange={v => handlePropChange('height', v)} style={{ width: 60 }} />
                        </div>
                        <div style={{ margin: '8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ minWidth: 60 }}>Color</span>
                          <Input type="color" value={el.fill} onChange={e => handlePropChange('fill', e.target.value)} style={{ width: 48, height: 32, padding: 0, border: 'none', background: 'none' }} />
                          <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{el.fill}</span>
                        </div>
                      </>;
                    case 'barcode':
                      return <>
                        <div style={{ margin: '8px 0' }}>
                          <Input value={el.value} onChange={e => handlePropChange('value', e.target.value)} addonBefore="Barcode Value" />
                        </div>
                        <div style={{ margin: '8px 0' }}>
                          <Select value={el.format} onChange={v => handlePropChange('format', v)} style={{ width: '100%' }}>
                            <Option value="CODE128">CODE128</Option>
                            <Option value="CODE39">CODE39</Option>
                            <Option value="EAN13">EAN13</Option>
                            <Option value="EAN8">EAN8</Option>
                            <Option value="UPC">UPC</Option>
                            <Option value="ITF14">ITF14</Option>
                            <Option value="ITF">ITF</Option>
                            <Option value="MSI">MSI</Option>
                            <Option value="pharmacode">pharmacode</Option>
                            <Option value="codabar">codabar</Option>
                          </Select>
                        </div>
                      </>;
                    default:
                      return null;
                  }
                })()}
              </div>
            ) : (
              <div style={{ color: '#888' }}>Select an element on the canvas</div>
            )}
          </div>
        </Sider>
      </Layout>
      {/* Import Modal */}
      <Modal open={importModal} onCancel={() => setImportModal(false)} onOk={handleImportJSON} title="Import JSON" okText="Import">
        <Input.TextArea rows={8} value={importJson} onChange={e => setImportJson(e.target.value)} placeholder="Paste JSON here" />
      </Modal>
      {/* Canvas Size Modal */}
      <Modal open={showSettings} onCancel={() => setShowSettings(false)} onOk={() => setShowSettings(false)} title="Canvas Size" okText="OK">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>Width:</span>
          <InputNumber min={100} max={2000} value={canvasSize.width} onChange={w => handleCanvasSize(Number(w), canvasSize.height)} />
          <span>Height:</span>
          <InputNumber min={100} max={2000} value={canvasSize.height} onChange={h => handleCanvasSize(canvasSize.width, Number(h))} />
        </div>
      </Modal>
      {/* เพิ่ม Modal สำหรับ sync batch */}
      <Modal
        title="Sync Batch Data"
        open={batchModalVisible}
        onOk={fetchAndApplyBatch}
        okButtonProps={{ loading }}
        confirmLoading={loading}
        onCancel={() => setBatchModalVisible(false)}
      >
        <Input
          placeholder="Enter Batch No"
          value={batchNo}
          onChange={e => {
            setBatchNo(e.target.value.trim());
          }}
          disabled={loading}
          onPressEnter={fetchAndApplyBatch}
          style={{ 
            color: '#000000',
            fontWeight: 'normal'
          }}
        />
      </Modal>
      {/* Add template info modal */}
      <Modal
        title="Save Template"
        open={templateInfoModal}
        onOk={handleSaveTemplate}
        onCancel={() => setTemplateInfoModal(false)}
      >
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Template Name"
            value={templateInfo.name}
            onChange={e => setTemplateInfo(prev => ({ ...prev, name: e.target.value }))}
            style={{ marginBottom: 8 }}
          />
          <Input.TextArea
            placeholder="Description"
            value={templateInfo.description}
            onChange={e => setTemplateInfo(prev => ({ ...prev, description: e.target.value }))}
            style={{ marginBottom: 8 }}
          />
          <Input
            placeholder="Product Code"
            value={templateInfo.productKey}
            onChange={e => setTemplateInfo(prev => ({ ...prev, productKey: e.target.value }))}
            style={{ marginBottom: 8 }}
          />
          <Input
            placeholder="Customer Code"
            value={templateInfo.customerKey}
            onChange={e => setTemplateInfo(prev => ({ ...prev, customerKey: e.target.value }))}
          />
        </div>
      </Modal>
    </Layout>
  );
}

// Memoized components for performance
const MemoGroup = React.memo(Group);
const MemoRect = React.memo(Rect);
const MemoText = React.memo(Text);
const MemoKonvaImage = React.memo(KonvaImage);

// MinusIcon component
const MinusIcon = () => (
  <MinusOutlined />
);

// เพิ่มฟังก์ชัน getComponentContent
const getComponentContent = (el: ElementType) => {
  if (el.type === 'text') {
    const textEl = el as TextElement;
    return {
      staticText: textEl.text,
      fontName: textEl.fontFamily,
      fontSize: textEl.fontSize
    };
  } else if (el.type === 'barcode') {
    const barcodeEl = el as BarcodeElement;
    return {
      placeholder: barcodeEl.value,
      barcodeFormat: barcodeEl.format
    };
  } else if (el.type === 'qr') {
    const qrEl = el as QrElement;
    return {
      placeholder: qrEl.value
    };
  } else if (el.type === 'image') {
    const imageEl = el as ImageElement;
    // ส่งเฉพาะข้อความอ้างอิงถึงรูปภาพ ไม่ส่ง data URL ขนาดใหญ่
    return {
      placeholder: 'image_reference' 
    };
  } else if (el.type === 'variable') {
    const varEl = el as VariableElement;
    return {
      placeholder: varEl.name
    };
  }
  
  return {};
};