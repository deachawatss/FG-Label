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
 * @param format รูปแบบที่ต้องการ (เช่น DD/MM/YYYY)
 * @returns วันที่ในรูปแบบที่กำหนด
 */
export function formatDate(date: Date | string | null, format: string = "DD/MM/YYYY"): string {
  if (!date) return '';
  try {
    const dateObj = dayjs(date);
    if (!dateObj.isValid()) return '';
    return dateObj.format(format);
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