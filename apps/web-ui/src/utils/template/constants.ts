import { FeaturesConfig, ToolboxItem } from '../../models/TemplateDesignerTypes';
import React from 'react';
// เอา import ของ icons ออก เพราะเราจะไม่ใช้ JSX ใน .ts file

// ประกาศ icon เป็น string แทนการใช้ JSX components
const ICONS = {
  TEXT: 'FontSizeOutlined',
  BARCODE: 'BarcodeOutlined',
  QRCODE: 'QrcodeOutlined',
  RECTANGLE: 'BorderOutlined',
  LINE: 'MinusOutlined',
  IMAGE: 'FileImageOutlined',
  LAYERS: 'LayersOutlined'  // เพิ่ม icon สำหรับ Layer manager
};

export const TOOLBOX: ToolboxItem[] = [
  { type: 'text', label: 'Text', icon: ICONS.TEXT },
  { type: 'barcode', label: 'Barcode', icon: ICONS.BARCODE },
  { type: 'qr', label: 'QR Code', icon: ICONS.QRCODE },
  { type: 'rect', label: 'Rectangle', icon: ICONS.RECTANGLE },
  { type: 'line', label: 'Line', icon: ICONS.LINE },
  { type: 'image', label: 'Image', icon: ICONS.IMAGE },
];

// แยกการกำหนดค่าคุณสมบัติของแต่ละประเภทของ element ออกจาก FEATURES
export const ELEMENT_PROPERTIES = {
  text: [
    'text',       // text content
    'fontSize',   // font size
    'fontFamily', // font family
    'fill',       // color
    'align',      // alignment
    'width',      // width
    'height',     // height
    'x',          // x position
    'y',          // y position
    'rotation',   // rotation angle
    'locked',     // locked
    'visible',    // visibility
    'layer',      // layer order (z-index)
  ],
  rect: [
    'fill',       // color
    'width',      // width
    'height',     // height
    'x',          // x position
    'y',          // y position
    'rotation',   // rotation angle
    'locked',     // locked
    'visible',    // visibility
    'layer',      // layer order (z-index)
  ],
  barcode: [
    'value',      // value to be converted to barcode
    'format',     // format (CODE128, EAN13, etc.)
    'width',      // width
    'height',     // height
    'x',          // x position
    'y',          // y position
    'rotation',   // rotation angle
    'displayValue', // display barcode value
    'fontSize',   // font size for displayed text
    'textAlign',  // text alignment
    'textPosition', // text position
    'locked',     // locked
    'visible',    // visibility
    'layer',      // layer order (z-index)
  ],
  qr: [
    'value',      // value to be converted to QR code
    'width',      // width
    'height',     // height
    'x',          // x position
    'y',          // y position
    'rotation',   // rotation angle
    'locked',     // locked
    'visible',    // visibility
    'layer',      // layer order (z-index)
  ],
  line: [
    'fill',       // color
    'width',      // width
    'height',     // height
    'x',          // x position
    'y',          // y position
    'rotation',   // rotation angle
    'locked',     // locked
    'visible',    // visibility
    'layer',      // layer order (z-index)
  ],
  image: [
    'src',        // image source
    'width',      // width
    'height',     // height
    'x',          // x position
    'y',          // y position
    'rotation',   // rotation angle
    'locked',     // locked
    'visible',    // visibility
    'layer',      // layer order (z-index)
  ]
};

/**
 * Constants for Template Designer
 */

// Feature flags and configuration
export const FEATURES = {
  // Canvas settings
  CANVAS: {
    INIT_WIDTH: 400,
    INIT_HEIGHT: 400,
    MIN_WIDTH: 100,
    MIN_HEIGHT: 100,
    MAX_WIDTH: 2000,
    MAX_HEIGHT: 2000,
    BACKGROUND_COLOR: '#FFFFFF',
    GRID_COLOR: 'rgba(200, 200, 200, 0.2)', // Configurable grid color
  },
  
  // Zoom settings
  ZOOM: {
    DEFAULT: 1,
    MIN: 0.1,
    MAX: 3,
    STEP: 0.1,
  },
  
  // Grid and snapping
  SNAPPING: {
    ENABLED: true,
    GRID_SIZE: 10,
    SNAP_THRESHOLD: 5,
    SHOW_GRID: true,
  },
  
  // Element defaults
  ELEMENT: {
    MIN_SIZE: 5,
    DEFAULT_FILL: '#E0E0E0',
    DEFAULT_STROKE: '#000000',
    DEFAULT_TEXT: 'Text',
    DEFAULT_FONT_FAMILY: 'Arial',
    DEFAULT_FONT_SIZE: 16,
    DEFAULT_BARCODE_VALUE: '12345678',
    DEFAULT_QR_VALUE: 'https://example.com',
  },
  
  // Default timings
  TIMING: {
    DEBOUNCE_DELAY: 300,
    QR_BARCODE_BATCH_DELAY: 50,
    IMAGE_LOAD_TIMEOUT: 10000,
  },
};

// Paper sizes in pixels (assuming 96 DPI)
export const PAPER_SIZES = {
  '4x4': { width: 384, height: 384 }, // 4 inches square
  '4x6': { width: 384, height: 576 }, // 4x6 inches
  '2x3': { width: 192, height: 288 }, // 2x3 inches
  'A4': { width: 794, height: 1123 }, // A4 paper
  'A5': { width: 559, height: 794 }, // A5 paper
  'A6': { width: 397, height: 559 }, // A6 paper
  'Custom': { width: 400, height: 400 }, // Default custom size
};

// Element type options
export const ELEMENT_TYPES = {
  TEXT: 'text',
  RECT: 'rect',
  ELLIPSE: 'ellipse',
  LINE: 'line',
  IMAGE: 'image',
  BARCODE: 'barcode',
  QR: 'qr',
  GROUP: 'group',
  VARIABLE: 'variable',
};

// Font families for text elements
export const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Verdana',
  'Tahoma',
];

// Font sizes
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 42, 48, 56, 64, 72];

// Text alignments
export const TEXT_ALIGNS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

// Barcode formats
export const BARCODE_FORMATS = [
  { value: 'CODE128', label: 'CODE128' },
  { value: 'CODE39', label: 'CODE39' },
  { value: 'EAN13', label: 'EAN-13' },
  { value: 'EAN8', label: 'EAN-8' },
  { value: 'UPC', label: 'UPC' },
  { value: 'ITF14', label: 'ITF-14' },
];

// Template types
export const TEMPLATE_TYPES = [
  { value: 'INNER', label: 'Inner' },
  { value: 'OUTER', label: 'Outer' },
  { value: 'STANDARD', label: 'Standard' },
];

// Orientation options
export const ORIENTATIONS = [
  { value: 'Portrait', label: 'Portrait' },
  { value: 'Landscape', label: 'Landscape' },
];

// Keyboard shortcuts
export const KEYBOARD_SHORTCUTS = {
  UNDO: { key: 'z', ctrlKey: true },
  REDO: { key: 'y', ctrlKey: true },
  REDO_ALT: { key: 'z', ctrlKey: true, shiftKey: true },
  DELETE: { key: 'Delete' },
  DELETE_ALT: { key: 'Backspace' },
  DUPLICATE: { key: 'd', ctrlKey: true },
  GROUP: { key: 'g', ctrlKey: true },
  UNGROUP: { key: 'g', ctrlKey: true, shiftKey: true },
  SAVE: { key: 's', ctrlKey: true },
  ZOOM_IN: { key: '+', ctrlKey: true },
  ZOOM_OUT: { key: '-', ctrlKey: true },
  RESET_ZOOM: { key: '0', ctrlKey: true },
};

// Default values for new elements
export const DEFAULT_ELEMENT_VALUES = {
  fill: '#ffffff',
  stroke: '#000000',
  strokeWidth: 1,
  opacity: 1,
  draggable: true,
  fontSize: 16,
  fontFamily: 'Arial',
  align: 'left' as 'left' | 'center' | 'right',
  zIndex: 1,
}; 