import dayjs from 'dayjs';

/**
 * ฟังก์ชันคำนวณวันหมดอายุตามเงื่อนไขที่กำหนด
 * @param productionDate วันที่ผลิต
 * @param shelfLifeDays จำนวนวันอายุการเก็บรักษา
 * @param daysToExpire จำนวนวันที่จะหมดอายุ
 * @returns วันหมดอายุในรูปแบบ DD/MM/YYYY
 */
export function calculateBestBefore(
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
    // 1. IF {BME_LABEL.SHELFLIFE_DAY} > 0
    //    THEN {@Batch Production Date}+{BME_LABEL_WIP.SHELFLIFE_DAY}
    if (shelfLifeDays !== null && shelfLifeDays !== undefined && shelfLifeDays > 0) {
      return prodDate.add(shelfLifeDays, 'day').format('DD/MM/YYYY');
    }
    // 2. IF {BME_LABEL.SHELFLIFE_DAY} = 0 and {INMAST.DaysToExpire} > 0
    //    THEN {@Batch Production Date}+{INMAST.DaysToExpire}
    else if (shelfLifeDays === 0 && daysToExpire !== null && daysToExpire !== undefined && daysToExpire > 0) {
      return prodDate.add(daysToExpire, 'day').format('DD/MM/YYYY');
    }
    // 3. IF {BME_LABEL.SHELFLIFE_DAY} = 0 AND ISNULL({INMAST.DaysToExpire})
    //    THEN {@Batch Production Date}+30
    else if (shelfLifeDays === 0 && (daysToExpire === null || daysToExpire === undefined)) {
      return prodDate.add(30, 'day').format('DD/MM/YYYY');
    }
    // 4. ELSE {@Batch Production Date}+{BME_LABEL.SHELFLIFE_DAY}
    else {
      return prodDate.add(shelfLifeDays || 0, 'day').format('DD/MM/YYYY');
    }
  } catch (error) {
    console.error('Error calculating best before date:', error);
    return '';
  }
}

/**
 * ฟังก์ชันสำหรับจัดรูปแบบวันที่
 * @param date วันที่ที่ต้องการจัดรูปแบบ
 * @param format รูปแบบที่ต้องการ (เช่น DD/MM/YYYY หรือ YYYY-MM-DD)
 * @returns วันที่ในรูปแบบที่กำหนด
 */
export function formatDate(date: Date | string | null, format: string = "DD/MM/YYYY"): string {
  if (!date) return '';
  
  try {
    // ถ้าใช้ dayjs
    if (typeof dayjs === 'function') {
      const dateObj = dayjs(date);
      if (!dateObj.isValid()) return '';
      return dateObj.format(format);
    } 
    // ถ้าไม่มี dayjs หรือต้องการ YYYY-MM-DD format โดยเฉพาะ
    else if (format === "YYYY-MM-DD" && date instanceof Date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    // แปลง date เป็น Date object ถ้าเป็น string
    else if (typeof date === 'string') {
      const dateObj = new Date(date);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      
      if (format === "YYYY-MM-DD") {
        return `${year}-${month}-${day}`;
      } else if (format === "DD/MM/YYYY") {
        return `${day}/${month}/${year}`;
      } else {
        return `${day}/${month}/${year}`;
      }
    }
    // ถ้าเป็น Date object
    else if (date instanceof Date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      if (format === "YYYY-MM-DD") {
        return `${year}-${month}-${day}`;
      } else if (format === "DD/MM/YYYY") {
        return `${day}/${month}/${year}`;
      } else {
        return `${day}/${month}/${year}`;
      }
    }
    
    return '';
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
}

/**
 * ฟังก์ชันสำหรับสร้าง URL API ที่ถูกต้อง
 * ป้องกันการเกิดปัญหา path ซ้ำกัน เช่น /api/api/...
 */
export function getApiBaseUrl(): string {
  let baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5051';
  
  // ตรวจสอบว่า baseUrl มี /api อยู่แล้วหรือไม่
  if (baseUrl.endsWith('/api')) {
    baseUrl = baseUrl.slice(0, -4); // ตัด /api ออก
  }
  
  return `${baseUrl}/api`;
}

/**
 * ช่วยแบ่งข้อความให้พอดีกับความกว้าง
 * @param text ข้อความที่ต้องการแบ่ง
 * @param maxWidth ความกว้างสูงสุด
 * @param fontSize ขนาดตัวอักษร
 * @param fontFamily ชนิดตัวอักษร
 * @returns อาร์เรย์ของข้อความที่แบ่งแล้ว
 */
export function fitTextInWidth(text: string, maxWidth: number, fontSize: number, fontFamily: string): string[] {
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

/**
 * Helper functions for template designer
 */

/**
 * Generate a unique ID for elements
 * @returns string - A unique ID
 */
export function generateUniqueId(): string {
  return `el_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

/**
 * Download data as a file
 * @param data - Data to download
 * @param filename - Name of the file
 * @param type - MIME type of the file
 */
export function downloadFile(data: any, filename: string, type: string): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  
  // Clean up
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Deep clone an object
 * @param obj - Object to clone
 * @returns T - Cloned object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if two objects are equal
 * @param obj1 - First object
 * @param obj2 - Second object
 * @returns boolean - Whether the objects are equal
 */
export function isEqual(obj1: any, obj2: any): boolean {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}

/**
 * Get element by ID from elements array
 * @param elements - Array of elements
 * @param id - ID of element to find
 * @returns ElementData | undefined - Found element or undefined
 */
export function getElementById(elements: any[], id: string): any | undefined {
  return elements.find(element => element.id === id);
}

/**
 * Calculate center point of element
 * @param element - Element to calculate center for
 * @returns {x: number, y: number} - Center coordinates
 */
export function getElementCenter(element: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2
  };
}

/**
 * Check if point is inside element bounds
 * @param point - Point coordinates
 * @param element - Element bounds
 * @returns boolean - Whether point is inside element
 */
export function isPointInElement(
  point: { x: number; y: number },
  element: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x >= element.x &&
    point.x <= element.x + element.width &&
    point.y >= element.y &&
    point.y <= element.y + element.height
  );
}

/**
 * Convert degrees to radians
 * @param degrees - Angle in degrees
 * @returns number - Angle in radians
 */
export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 * @param radians - Angle in radians
 * @returns number - Angle in degrees
 */
export function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Create a singleton file input element for reuse
 * @returns HTMLInputElement - File input element
 */
export function getFileInput(): HTMLInputElement {
  let fileInput = document.getElementById('hidden-file-input') as HTMLInputElement;
  
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'hidden-file-input';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }
  
  return fileInput;
}

/**
 * Clean up file input element
 */
export function cleanupFileInput(): void {
  const fileInput = document.getElementById('hidden-file-input');
  if (fileInput) {
    document.body.removeChild(fileInput);
  }
}

/**
 * Debounce function
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Function - Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function(...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
} 