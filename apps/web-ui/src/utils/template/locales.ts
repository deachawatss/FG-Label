/**
 * Localization strings for Template Designer
 */

// Default is English
export const DEFAULT_LOCALE = 'en';

// Available languages
export type Locale = 'en' | 'th';

// Message types by sections
interface CommonMessages {
  yes: string;
  no: string;
  ok: string;
  cancel: string;
  save: string;
  delete: string;
  edit: string;
  add: string;
  remove: string;
  update: string;
  loading: string;
  error: string;
  success: string;
  warning: string;
  confirm: string;
}

interface TemplateDesignerMessages {
  title: string;
  settings: string;
  elements: {
    text: string;
    rect: string;
    ellipse: string;
    line: string;
    image: string;
    barcode: string;
    qr: string;
    group: string;
  };
  actions: {
    undo: string;
    redo: string;
    group: string;
    ungroup: string;
    duplicate: string;
    delete: string;
    moveUp: string;
    moveDown: string;
    moveToTop: string;
    moveToBottom: string;
    zoomIn: string;
    zoomOut: string;
    resetZoom: string;
    exportTemplate: string;
    importTemplate: string;
    saveTemplate: string;
    newTemplate: string;
    rotate: string;
  };
  properties: {
    position: string;
    size: string;
    appearance: string;
    x: string;
    y: string;
    width: string;
    height: string;
    rotation: string;
    fill: string;
    stroke: string;
    strokeWidth: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    textAlign: string;
    lineHeight: string;
    opacity: string;
    visible: string;
    locked: string;
  };
  sidebar: {
    addElements: string;
    properties: string;
    layers: string;
    batchData: string;
    enterBatchNumber: string;
    applyBatchData: string;
  };
  templateSettings: {
    title: string;
    name: string;
    description: string;
    paperSize: string;
    orientation: string;
    portrait: string;
    landscape: string;
    productKey: string;
    customerKey: string;
    templateType: string;
  };
  modals: {
    importTitle: string;
    importPlaceholder: string;
    confirmDelete: string;
    imageUpload: {
      title: string;
      uploading: string;
      success: string;
      error: string;
    };
  };
  errors: {
    loadTemplate: string;
    saveTemplate: string;
    parseTemplate: string;
    invalidBatchNumber: string;
    batchDataFailed: string;
    imageUpload: string;
    invalidJson: string;
  };
  success: {
    saveTemplate: string;
    exportTemplate: string;
    importTemplate: string;
    imageUpload: string;
    batchData: string;
    groupElements: string;
    ungroupElements: string;
  };
  warnings: {
    selectTwoElements: string;
    selectGroupToUngroup: string;
    onlyGroupsCanBeUngrouped: string;
    noElementsInGroup: string;
  };
  canvas: {
    elementConstrainedWarning: string;
  };
}

// Interface for all localized messages
export interface LocalizedMessages {
  common: CommonMessages;
  templateDesigner: TemplateDesignerMessages;
}

// English localization
const en: LocalizedMessages = {
  common: {
    yes: 'Yes',
    no: 'No',
    ok: 'OK',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    remove: 'Remove',
    update: 'Update',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    warning: 'Warning',
    confirm: 'Confirm',
  },
  templateDesigner: {
    title: 'Label Template Designer',
    settings: 'Template Settings',
    elements: {
      text: 'Text',
      rect: 'Rectangle',
      ellipse: 'Ellipse',
      line: 'Line',
      image: 'Image',
      barcode: 'Barcode',
      qr: 'QR Code',
      group: 'Group',
    },
    actions: {
      undo: 'Undo',
      redo: 'Redo',
      group: 'Group Elements',
      ungroup: 'Ungroup Elements',
      duplicate: 'Duplicate',
      delete: 'Delete',
      moveUp: 'Move Up',
      moveDown: 'Move Down',
      moveToTop: 'Move to Top',
      moveToBottom: 'Move to Bottom',
      zoomIn: 'Zoom In',
      zoomOut: 'Zoom Out',
      resetZoom: 'Reset Zoom',
      exportTemplate: 'Export Template',
      importTemplate: 'Import Template',
      saveTemplate: 'Save Template',
      newTemplate: 'New Template',
      rotate: 'Rotate',
    },
    properties: {
      position: 'Position',
      size: 'Size',
      appearance: 'Appearance',
      x: 'X',
      y: 'Y',
      width: 'Width',
      height: 'Height',
      rotation: 'Rotation',
      fill: 'Fill',
      stroke: 'Stroke',
      strokeWidth: 'Stroke Width',
      fontFamily: 'Font Family',
      fontSize: 'Font Size',
      fontWeight: 'Font Weight',
      textAlign: 'Text Align',
      lineHeight: 'Line Height',
      opacity: 'Opacity',
      visible: 'Visible',
      locked: 'Locked',
    },
    sidebar: {
      addElements: 'Add Elements',
      properties: 'Properties',
      layers: 'Layers',
      batchData: 'Batch Data',
      enterBatchNumber: 'Enter batch number',
      applyBatchData: 'Apply Batch Data',
    },
    templateSettings: {
      title: 'Template Settings',
      name: 'Name',
      description: 'Description',
      paperSize: 'Paper Size',
      orientation: 'Orientation',
      portrait: 'Portrait',
      landscape: 'Landscape',
      productKey: 'Product Key',
      customerKey: 'Customer Key',
      templateType: 'Template Type',
    },
    modals: {
      importTitle: 'Import Template from JSON',
      importPlaceholder: 'Paste JSON here...',
      confirmDelete: 'Are you sure you want to delete this element?',
      imageUpload: {
        title: 'Upload Image',
        uploading: 'Uploading image...',
        success: 'Image uploaded successfully',
        error: 'Cannot upload image',
      },
    },
    errors: {
      loadTemplate: 'Error loading template data',
      saveTemplate: 'Error saving template',
      parseTemplate: 'Error parsing template data',
      invalidBatchNumber: 'Please enter a valid batch number',
      batchDataFailed: 'Error loading batch data',
      imageUpload: 'Error uploading image',
      invalidJson: 'Invalid JSON format',
    },
    success: {
      saveTemplate: 'Template saved successfully',
      exportTemplate: 'Template exported successfully',
      importTemplate: 'Template imported successfully',
      imageUpload: 'Image uploaded successfully',
      batchData: 'Batch data loaded successfully',
      groupElements: 'Group elements successfully created',
      ungroupElements: 'Group elements successfully ungrouped',
    },
    warnings: {
      selectTwoElements: 'Please select at least 2 elements to create a group',
      selectGroupToUngroup: 'Please select a group to ungroup',
      onlyGroupsCanBeUngrouped: 'Only groups can be ungrouped',
      noElementsInGroup: 'No elements found in this group',
    },
    canvas: {
      elementConstrainedWarning: 'Element has been constrained to canvas boundaries',
    },
  },
};

// Thai localization
const th: LocalizedMessages = {
  common: {
    yes: 'ใช่',
    no: 'ไม่',
    ok: 'ตกลง',
    cancel: 'ยกเลิก',
    save: 'บันทึก',
    delete: 'ลบ',
    edit: 'แก้ไข',
    add: 'เพิ่ม',
    remove: 'ลบออก',
    update: 'อัปเดต',
    loading: 'กำลังโหลด...',
    error: 'ข้อผิดพลาด',
    success: 'สำเร็จ',
    warning: 'คำเตือน',
    confirm: 'ยืนยัน',
  },
  templateDesigner: {
    title: 'โปรแกรมออกแบบฉลาก',
    settings: 'ตั้งค่าเทมเพลต',
    elements: {
      text: 'ข้อความ',
      rect: 'สี่เหลี่ยม',
      ellipse: 'วงรี',
      line: 'เส้น',
      image: 'รูปภาพ',
      barcode: 'บาร์โค้ด',
      qr: 'คิวอาร์โค้ด',
      group: 'กลุ่ม',
    },
    actions: {
      undo: 'เลิกทำ',
      redo: 'ทำซ้ำ',
      group: 'จัดกลุ่ม',
      ungroup: 'ยกเลิกกลุ่ม',
      duplicate: 'ทำซ้ำ',
      delete: 'ลบ',
      moveUp: 'เลื่อนขึ้น',
      moveDown: 'เลื่อนลง',
      moveToTop: 'ย้ายไปด้านบนสุด',
      moveToBottom: 'ย้ายไปด้านล่างสุด',
      zoomIn: 'ขยาย',
      zoomOut: 'ย่อ',
      resetZoom: 'รีเซ็ตการขยาย',
      exportTemplate: 'ส่งออกเทมเพลต',
      importTemplate: 'นำเข้าเทมเพลต',
      saveTemplate: 'บันทึกเทมเพลต',
      newTemplate: 'เทมเพลตใหม่',
      rotate: 'หมุน',
    },
    properties: {
      position: 'ตำแหน่ง',
      size: 'ขนาด',
      appearance: 'ลักษณะ',
      x: 'แกน X',
      y: 'แกน Y',
      width: 'ความกว้าง',
      height: 'ความสูง',
      rotation: 'การหมุน',
      fill: 'สีพื้น',
      stroke: 'สีเส้นขอบ',
      strokeWidth: 'ความหนาเส้นขอบ',
      fontFamily: 'แบบอักษร',
      fontSize: 'ขนาดตัวอักษร',
      fontWeight: 'ความหนาตัวอักษร',
      textAlign: 'การจัดตำแหน่งข้อความ',
      lineHeight: 'ความสูงบรรทัด',
      opacity: 'ความโปร่งใส',
      visible: 'แสดง',
      locked: 'ล็อค',
    },
    sidebar: {
      addElements: 'เพิ่มองค์ประกอบ',
      properties: 'คุณสมบัติ',
      layers: 'เลเยอร์',
      batchData: 'ข้อมูลแบตช์',
      enterBatchNumber: 'ใส่หมายเลขแบตช์',
      applyBatchData: 'ใช้ข้อมูลแบตช์',
    },
    templateSettings: {
      title: 'ตั้งค่าเทมเพลต',
      name: 'ชื่อ',
      description: 'คำอธิบาย',
      paperSize: 'ขนาดกระดาษ',
      orientation: 'การวางแนว',
      portrait: 'แนวตั้ง',
      landscape: 'แนวนอน',
      productKey: 'รหัสสินค้า',
      customerKey: 'รหัสลูกค้า',
      templateType: 'ประเภทเทมเพลต',
    },
    modals: {
      importTitle: 'นำเข้าเทมเพลตจาก JSON',
      importPlaceholder: 'วาง JSON ที่นี่...',
      confirmDelete: 'คุณแน่ใจหรือไม่ว่าต้องการลบองค์ประกอบนี้?',
      imageUpload: {
        title: 'อัปโหลดรูปภาพ',
        uploading: 'กำลังอัปโหลดรูปภาพ...',
        success: 'อัปโหลดรูปภาพสำเร็จ',
        error: 'ไม่สามารถอัปโหลดรูปภาพได้',
      },
    },
    errors: {
      loadTemplate: 'เกิดข้อผิดพลาดในการโหลดข้อมูลเทมเพลต',
      saveTemplate: 'เกิดข้อผิดพลาดในการบันทึกเทมเพลต',
      parseTemplate: 'เกิดข้อผิดพลาดในการแปลงข้อมูลเทมเพลต',
      invalidBatchNumber: 'กรุณาใส่หมายเลขแบตช์ที่ถูกต้อง',
      batchDataFailed: 'เกิดข้อผิดพลาดในการโหลดข้อมูลแบตช์',
      imageUpload: 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ',
      invalidJson: 'รูปแบบ JSON ไม่ถูกต้อง',
    },
    success: {
      saveTemplate: 'บันทึกเทมเพลตสำเร็จ',
      exportTemplate: 'ส่งออกเทมเพลตสำเร็จ',
      importTemplate: 'นำเข้าเทมเพลตสำเร็จ',
      imageUpload: 'อัปโหลดรูปภาพสำเร็จ',
      batchData: 'โหลดข้อมูลแบตช์สำเร็จ',
      groupElements: 'สร้างกลุ่มองค์ประกอบสำเร็จ',
      ungroupElements: 'ยกเลิกการจัดกลุ่มสำเร็จ',
    },
    warnings: {
      selectTwoElements: 'กรุณาเลือกอย่างน้อย 2 องค์ประกอบเพื่อสร้างกลุ่ม',
      selectGroupToUngroup: 'กรุณาเลือกกลุ่มที่ต้องการยกเลิกการจัดกลุ่ม',
      onlyGroupsCanBeUngrouped: 'เฉพาะกลุ่มเท่านั้นที่สามารถยกเลิกการจัดกลุ่มได้',
      noElementsInGroup: 'ไม่พบองค์ประกอบในกลุ่มนี้',
    },
    canvas: {
      elementConstrainedWarning: 'องค์ประกอบถูกจำกัดให้อยู่ภายในขอบเขตของแคนวาส',
    },
  },
};

// Collection of all localizations
export const messages: Record<Locale, LocalizedMessages> = {
  en,
  th,
};

// Context for current locale
let currentLocale: Locale = DEFAULT_LOCALE;

/**
 * Set the current locale
 * @param locale The locale to set
 */
export const setLocale = (locale: Locale): void => {
  currentLocale = locale;
};

/**
 * Get the current locale
 * @returns The current locale code
 */
export const getLocale = (): Locale => {
  return currentLocale;
};

/**
 * Get messages for the current locale
 * @returns Localized messages
 */
export const getMessages = (): LocalizedMessages => {
  return messages[currentLocale];
};

/**
 * Get a localized message by key path
 * @param keyPath Dot-separated key path (e.g. 'common.save')
 * @returns The localized string
 */
export const getMessage = (keyPath: string): string => {
  const keys = keyPath.split('.');
  let value: any = messages[currentLocale];
  
  for (const key of keys) {
    if (!value[key]) {
      // Fallback to English if key doesn't exist in current locale
      value = messages[DEFAULT_LOCALE];
      break;
    }
    value = value[key];
  }
  
  // Try to traverse original path in value (which might be the fallback)
  for (const key of keys) {
    if (!value[key]) {
      console.warn(`Missing localization key: ${keyPath}`);
      return keyPath; // Return the key path as fallback
    }
    value = value[key];
  }
  
  return value;
}; 