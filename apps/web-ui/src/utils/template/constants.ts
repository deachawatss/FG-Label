import { FeaturesConfig, ToolboxItem } from '../../models/TemplateDesignerTypes';
import React from 'react';

// หมายเหตุ: เนื่องจากไม่สามารถ import icons โดยตรง จึงใช้ placeholder แบบ string
// แนะนำให้แก้ไขเป็น import จริงเมื่อใช้งาน
const PLACEHOLDER_ICON = "📝" as unknown as React.ReactNode;

export const TOOLBOX: ToolboxItem[] = [
  { type: 'text', label: 'Text', icon: PLACEHOLDER_ICON /* <FontSizeOutlined /> */ },
  { type: 'barcode', label: 'Barcode', icon: PLACEHOLDER_ICON /* <BarcodeOutlined /> */ },
  { type: 'qr', label: 'QR Code', icon: PLACEHOLDER_ICON /* <QrcodeOutlined /> */ },
  { type: 'rect', label: 'Rectangle', icon: PLACEHOLDER_ICON /* <AppstoreAddOutlined /> */ },
  { type: 'ellipse', label: 'Ellipse', icon: PLACEHOLDER_ICON /* <AppstoreAddOutlined /> */ },
  { type: 'line', label: 'Line', icon: PLACEHOLDER_ICON /* <MinusOutlined /> */ },
  { type: 'image', label: 'Image', icon: PLACEHOLDER_ICON /* <FileImageOutlined /> */ },
];

export const FEATURES: FeaturesConfig = {
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