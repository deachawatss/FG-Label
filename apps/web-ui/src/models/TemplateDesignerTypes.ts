// ไฟล์: apps/web-ui/src/models/TemplateDesignerTypes.ts

// แยก ElementType เป็น Union Type
export interface BaseElement {
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

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;
  align: string;
  fontStyle?: 'normal' | 'italic';
  fontWeight?: 'normal' | 'bold';
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  value: string;
  format: string;
  fill: string;
  displayValue?: boolean;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: string;
  textPosition?: string;
  textMargin?: number;
  background?: string;
  lineColor?: string;
  margin?: number;
}

export interface QrElement extends BaseElement {
  type: 'qr';
  value: string;
  fill: string;
}

export interface RectElement extends BaseElement {
  type: 'rect';
  fill: string;
  cornerRadius?: number;
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse';
  fill: string;
}

export interface LineElement extends BaseElement {
  type: 'line';
  fill: string;
  strokeWidth?: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  fill: string;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  imageObj?: HTMLImageElement;
}

export interface VariableElement extends BaseElement {
  type: 'variable';
  name: string;
  fill: string;
  dataType?: 'text' | 'number' | 'date' | 'counter';
  format?: string;
  defaultValue?: string;
}

export interface GroupElement extends BaseElement {
  type: 'group';
  elements: ElementType[];
  fill?: string;
}

export type ElementType = TextElement | BarcodeElement | QrElement | RectElement | 
                  EllipseElement | LineElement | ArrowElement | ImageElement | 
                  VariableElement | GroupElement;

export interface CanvasSize {
  width: number; 
  height: number;
}

export interface TemplateInfo {
  name: string;
  description: string;
  productKey: string;
  customerKey: string;
  paperSize: string;
  orientation: 'Portrait' | 'Landscape';
  templateType: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface ToolboxItem {
  type: string;
  label: string;
  icon: React.ReactNode | string;
}

export interface FeaturesConfig {
  SNAPPING: {
    ENABLED: boolean;
    GRID_SIZE: number;
    SNAP_DISTANCE: number;
  };
  GUIDES: {
    ENABLED: boolean;
    SPACING: number;
    SHOW_DISTANCE: boolean;
  };
  ZOOM: {
    MIN: number;
    MAX: number;
    STEP: number;
  };
  CANVAS: {
    INIT_WIDTH: number;
    INIT_HEIGHT: number;
    CONSTRAIN_ELEMENTS?: boolean;
  };
  KEYBOARD: {
    DELETE: string;
    UNDO: string[];
    REDO: string[];
    COPY: string[];
    PASTE: string[];
    CUT: string[];
    SELECT_ALL: string[];
    DUPLICATE: string[];
    GROUP: string[];
    UNGROUP: string[];
    MOVE: {
      UP: string;
      DOWN: string;
      LEFT: string;
      RIGHT: string;
    };
  };
  COUNTER: {
    PREFIX: string;
    SUFFIX: string;
    PADDING: number;
    START_VALUE: number;
    INCREMENT: number;
  };
}

// Export constants
export const CANVAS_INIT = { width: 400, height: 400 };
export const ZOOM_STEP = 0.1;
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2.5; 