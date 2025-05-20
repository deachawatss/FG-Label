import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ElementType, CanvasSize, TextElement, QrElement, BarcodeElement } from '../../models/TemplateDesignerTypes';
import { calculateBestBefore, formatDate, getApiBaseUrl } from '../../utils/template/helpers';

export const useBatchData = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [batchData, setBatchData] = useState<any>(null);

  /**
   * สร้าง elements จากข้อมูล batch
   * @param data ข้อมูล batch
   * @param options ตัวเลือกการแสดง QR code
   * @returns อาร์เรย์ของ elements ที่สร้างขึ้น
   */
  const buildElementsFromBatch = useCallback((data: any, options: { showQR?: boolean } = {}): ElementType[] => {
    // ถ้าไม่มีข้อมูล ให้สร้าง elements ว่างเปล่า
    if (!data) return [];
    
    console.log('Building elements from batch data:', data);
    console.log('QR visibility option:', options.showQR);
    
    const els: ElementType[] = [];
    
    // ตั้งค่าขนาด Canvas และขอบเขตเป็นค่ามาตรฐาน
    const cw = 700; // ความกว้างมาตรฐาน
    const ch = 350; // ความสูงมาตรฐาน
    
    // --------------------------------------------------------
    // ดึงข้อมูลจาก data object เพื่อแสดงผลให้ตรงกับหน้า Preview
    // --------------------------------------------------------
    
    // ข้อมูลพื้นฐาน
    const productName = data.Product || data.productName || data.DESCRIPTION || 'Predust, Southern Fried';
    const itemKey = data.itemKey || data.productKey || data.ITEM_KEY || 'TA3755BB';
    const processCell = data.processCell || data.PROCESS_CELL || '1B';
    const netWeight = data.netWeight || data.NET_WEIGHT1 || '25.00';
    const batchNo = data.batchNo || data.BatchNo || data.BATCH_NO || '843308';
    
    // ข้อมูลเกี่ยวกับวันที่
    // ใช้รูปแบบวันที่ที่ต้องการ เช่น "06/05/25" สำหรับ Lot Code
    let lotDate = data.lotDate || data.LOT_DATE || '';
    if (!lotDate) {
      // ถ้าไม่มี lotDate ให้ใช้ค่าเริ่มต้น
      lotDate = '06/05/25';
    } else {
      // แปลงวันที่เป็นรูปแบบที่แสดงในหน้า Preview (DD/MM/YY)
      try {
        // หากเป็นรูปแบบ DD MMM YYYY หรือรูปแบบอื่น
        if (lotDate.includes('/')) {
          // อาจเป็น DD/MM/YYYY
          const parts = lotDate.split('/');
          if (parts.length === 3) {
            lotDate = `${parts[0]}/${parts[1]}/${parts[2].substring(2)}`;
          }
        } else if (lotDate.includes('-')) {
          // อาจเป็น YYYY-MM-DD
          const dateObj = new Date(lotDate);
          const day = dateObj.getDate().toString().padStart(2, '0');
          const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
          const year = dateObj.getFullYear().toString().substring(2);
          lotDate = `${day}/${month}/${year}`;
        } else if (lotDate.includes(' ')) {
          // อาจเป็น DD MMM YYYY
          const dateObj = new Date(lotDate);
          if (!isNaN(dateObj.getTime())) {
            const day = dateObj.getDate().toString().padStart(2, '0');
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            const year = dateObj.getFullYear().toString().substring(2);
            lotDate = `${day}/${month}/${year}`;
          }
        }
      } catch (e) {
        console.error('Error parsing lot date:', e);
        lotDate = '06/05/25'; // ค่าเริ่มต้นถ้าแปลงไม่สำเร็จ
      }
    }
    
    // Best Before Date ใช้รูปแบบเดียวกันกับ Lot Date
    let bestBeforeDate = data.bestBeforeDate || data.BEST_BEFORE_DATE || '';
    if (!bestBeforeDate) {
      // ถ้าไม่มี bestBeforeDate ให้ใช้ค่าเริ่มต้น
      bestBeforeDate = '02/11/25';
    } else {
      // แปลงวันที่เป็นรูปแบบที่แสดงในหน้า Preview (DD/MM/YY)
      try {
        if (bestBeforeDate.includes('/')) {
          // อาจเป็น DD/MM/YYYY
          const parts = bestBeforeDate.split('/');
          if (parts.length === 3) {
            bestBeforeDate = `${parts[0]}/${parts[1]}/${parts[2].substring(2)}`;
          }
        } else if (bestBeforeDate.includes('-')) {
          // อาจเป็น YYYY-MM-DD
          const dateObj = new Date(bestBeforeDate);
          const day = dateObj.getDate().toString().padStart(2, '0');
          const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
          const year = dateObj.getFullYear().toString().substring(2);
          bestBeforeDate = `${day}/${month}/${year}`;
        } else if (bestBeforeDate.includes(' ')) {
          // อาจเป็น DD MMM YYYY
          const dateObj = new Date(bestBeforeDate);
          if (!isNaN(dateObj.getTime())) {
            const day = dateObj.getDate().toString().padStart(2, '0');
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            const year = dateObj.getFullYear().toString().substring(2);
            bestBeforeDate = `${day}/${month}/${year}`;
          }
        }
      } catch (e) {
        console.error('Error parsing best before date:', e);
        bestBeforeDate = '02/11/25'; // ค่าเริ่มต้นถ้าแปลงไม่สำเร็จ
      }
    }
    
    // ข้อมูลอื่นๆ
    const soNumber = data.soNumber || data.SONumber || data.SO_NUMBER || 'S2508217';
    const lineCode = data.lineCode || data.LINE_CODE || `P01B01`;
    
    // ตรวจสอบและจัดรูปแบบ allergens label
    let allergensLabel = data.allergensLabel || data.ALLERGEN1 || data.ALLERGENS_LABEL || 'Gluten (Wheat)';
    if (!allergensLabel.includes('Allergens :')) {
      allergensLabel = `Allergens : ${allergensLabel}`;
    }
    
    // ข้อมูลเพิ่มเติมที่อาจมี
    const additionalInfo = data.additionalInfo || data.ADDITIONAL_INFO || 'A : Wheat';
    const storageCondition = data.storageCondition || data.STORAGE_CONDITION || data.STORECAP1 || 'Store under dry cool condition';
    const expiryDateCaption = data.expiryDateCaption || data.EXPIRY_DATE_CAPTION || 'BEST BEFORE';
    
    // ข้อมูลผู้ผลิต
    const manufacturerInfo = data.manufacturerInfo || data.MANUFACTURER_INFO || 
      'MANUFACTURED BY : Newly Weds Foods (Thailand) Limited\n909 Moo 15, Teparak Road, T.Bangsaothong, A.Bangsaothong,\nSamutprakarn 10570\nThailand Phone (662) 3159000 Fax (662) 3131638-9';
    
    // สร้างวันที่ปัจจุบันในรูปแบบที่ต้องการ
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear().toString().slice(-2);
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hrs = (hours % 12 || 12).toString().padStart(2, '0');
    
    const printDateTime = `${day}${month}${year} ${hrs}:${minutes}${ampm}`;
    
    // แสดงข้อมูลที่จะใช้สร้าง elements ในคอนโซลเพื่อการตรวจสอบ
    console.log('Key batch data for visualization:', {
      productName,
      itemKey,
      processCell,
      netWeight,
      batchNo,
      lotDate,
      bestBeforeDate,
      allergensLabel,
      storageCondition,
      additionalInfo,
      showQR: options.showQR
    });
    
    // --------------------------------------------------------
    // สร้าง elements ตามรูปแบบใน Preview
    // --------------------------------------------------------
    
    // 1. ชื่อสินค้า (Product Name) - Top Center
    els.push({
      id: uuidv4(),
      type: 'text',
      x: 0,
      y: 10,
      width: cw,
      height: 25,
      text: productName,
      fontSize: 16,
      fontFamily: 'Arial',
      fill: '#000000',
      align: 'center',
      draggable: true,
      visible: true
    } as TextElement);
    
    // 2. Item Key ขนาดใหญ่ตรงกลาง
    els.push({
      id: uuidv4(),
      type: 'text',
      x: 0,
      y: 32,
      width: cw,
      height: 40,
      text: itemKey,
      fontSize: 28,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      fill: '#000000',
      align: 'center',
      draggable: true,
      visible: true
    } as TextElement);
    
    // คำนวณความยาวของข้อความเพื่อกำหนดความกว้างที่เหมาะสม
    const calcTextWidth = (text: string, fontSize: number, fontCoef: number = 0.6) => {
      // คำนวณสำหรับข้อความที่มีบรรทัดใหม่
      if (text.includes('\n')) {
        const lines = text.split('\n');
        const longestLine = lines.reduce((a, b) => a.length > b.length ? a : b, '');
        return Math.max(120, Math.min(cw - 50, longestLine.length * fontSize * fontCoef));
      }
      // ใช้ค่าสัมประสิทธิ์ที่มากขึ้นสำหรับข้อความยาว
      if (text.length > 30) {
        fontCoef = Math.max(fontCoef, 0.65);
      }
      // จำกัดความกว้างไม่ให้เกินขอบ canvas
      return Math.max(120, Math.min(cw - 50, text.length * fontSize * fontCoef));
    };
    
    // 3. NET WEIGHT - Label และค่า
    const netWeightText = `NET WEIGHT: ${netWeight} KG/BAG`;
    els.push({
      id: uuidv4(),
      type: 'text',
      x: 25,
      y: 80,
      width: calcTextWidth(netWeightText, 14, 0.7),
      height: 22,
      text: netWeightText,
      fontSize: 14,
      fontFamily: 'Arial',
      fill: '#000000',
      align: 'left',
      draggable: true,
      visible: true
    } as TextElement);
    
    // 4. LOT CODE - Label และค่า
    const lotCodeText = `LOT CODE: ${lotDate}`;
    els.push({
      id: uuidv4(),
      type: 'text',
      x: 25,
      y: 100,
      width: calcTextWidth(lotCodeText, 14, 0.7),
      height: 22,
      text: lotCodeText,
      fontSize: 14,
      fontFamily: 'Arial',
      fill: '#000000',
      align: 'left',
      draggable: true,
      visible: true
    } as TextElement);
    
    // 5. BEST BEFORE - Label และค่า
    const bestBeforeText = `${expiryDateCaption}: ${bestBeforeDate}`;
    els.push({
      id: uuidv4(),
      type: 'text',
      x: 25,
      y: 120,
      width: calcTextWidth(bestBeforeText, 14, 0.7),
      height: 22,
      text: bestBeforeText,
      fontSize: 14,
      fontFamily: 'Arial',
      fill: '#000000',
      align: 'left',
      draggable: true,
      visible: true
    } as TextElement);
    
    // 6. ALLERGENS
    els.push({
      id: uuidv4(),
      type: 'text',
      x: 25,
      y: 140,
      width: calcTextWidth(allergensLabel, 14, 0.7),
      height: 22,
      text: allergensLabel,
      fontSize: 14,
      fontFamily: 'Arial',
      fill: '#000000',
      align: 'left',
      draggable: true,
      visible: true
    } as TextElement);
    
    // 7. STORAGE CONDITION
    const storageText = `Recommended Storage: ${storageCondition}`;
    els.push({
      id: uuidv4(),
      type: 'text',
      x: 25,
      y: 160,
      width: calcTextWidth(storageText, 14, 0.7),
      height: 22,
      text: storageText,
      fontSize: 14,
      fontFamily: 'Arial',
      fill: '#000000',
      align: 'left',
      draggable: true,
      visible: true
    } as TextElement);
    
    // 8. ADDITIONAL INFO (A : Wheat)
    els.push({
      id: uuidv4(),
      type: 'text',
      x: 25,
      y: 180,
      width: calcTextWidth(additionalInfo, 14, 0.7),
      height: 22,
      text: additionalInfo,
      fontSize: 14,
      fontFamily: 'Arial',
      fill: '#000000',
      align: 'left',
      draggable: true,
      visible: true
    } as TextElement);
    
    // Manufacturer Info - อยู่ด้านล่าง
    els.push({
      id: uuidv4(),
      type: 'text',
      x: 25,
      y: 210,
      width: Math.min(cw - 50, calcTextWidth(manufacturerInfo, 10, 0.55)),
      height: 60,
      text: manufacturerInfo,
      fontSize: 10,
      fontFamily: 'Arial',
      fill: '#000000',
      align: 'left',
      draggable: true,
      visible: true
    } as TextElement);
    
    // 9. BARCODE - อยู่ตรงกลางด้านล่าง
    els.push({
      id: uuidv4(),
      type: 'barcode',
      x: (cw - 200) / 2, // จัดให้อยู่ตรงกลางแนวนอน
      y: ch - 90, // จัดให้อยู่ด้านล่างของ canvas
      width: 200,
      height: 70,
      value: batchNo,
      format: 'CODE128',
      fill: '#000000',
      draggable: true,
      visible: true,
      displayValue: true, // แสดงข้อความใต้บาร์โค้ด
      fontSize: 14,
      fontFamily: 'monospace',
      textAlign: 'center',
      textPosition: 'bottom',
      textMargin: 2,
      background: '#FFFFFF',
      lineColor: '#000000',
      margin: 5
    } as BarcodeElement);
    
    // 10. PRINT DATE TIME - มุมขวาล่าง
    els.push({
      id: uuidv4(),
      type: 'text',
      x: cw - 150,
      y: ch - 20,
      width: 140,
      height: 15,
      text: printDateTime,
      fontSize: 10,
      fontFamily: 'Arial',
      fill: '#000000',
      align: 'right',
      draggable: true,
      visible: true
    } as TextElement);
    
    // 11. QR CODE - มุมขวาบน (แสดงขึ้นอยู่กับตัวเลือก showQR)
    const qrValue = `BATCH:${batchNo}\nPRODUCT:${productName}\nLOT:${lotDate}\nNET_WEIGHT:${netWeight}\nBEST_BEFORE:${bestBeforeDate}\nALLERGENS:${allergensLabel}`;
    
    els.push({
      id: uuidv4(),
      type: 'qr',
      x: cw - 110,
      y: 10,
      width: 90,
      height: 90,
      value: qrValue,
      fill: '#000000',
      draggable: true,
      visible: options.showQR === true // แสดงเฉพาะเมื่อ showQR เป็น true
    } as QrElement);
    
    return els;
  }, []);

  /**
   * ดึงข้อมูล batch จากเซิร์ฟเวอร์
   * @param batchNo หมายเลข batch
   * @returns ข้อมูล batch หรือ null ถ้าไม่สำเร็จ
   */
  const fetchBatchData = useCallback(async (batchNo: string): Promise<any> => {
    if (!batchNo) {
      throw new Error('กรุณาระบุหมายเลข batch');
    }
    
    setLoading(true);
    
    try {
      const cleanBatchNo = batchNo.trim();
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('กรุณาเข้าสู่ระบบก่อนใช้งาน');
      }
      
      // สร้าง AbortController เพื่อป้องกัน memory leak
      const controller = new AbortController();
      const signal = controller.signal;
      
      // ดึงข้อมูล batch จาก API endpoint แรก
      const apiUrl = `${getApiBaseUrl()}/batches/${cleanBatchNo}`;
      console.log(`Fetching batch data from: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        signal
      });
      
      // ถ้าไม่สามารถดึงข้อมูลจาก endpoint แรก ให้ลองใช้ endpoint สำรอง
      if (!response.ok) {
        console.log('Primary API endpoint failed, trying alternative...');
        const alternativeUrl = `${getApiBaseUrl()}/batches/labeldata/${cleanBatchNo}`;
        
        const alternativeResponse = await fetch(alternativeUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          signal
        });
        
        if (!alternativeResponse.ok) {
          throw new Error(`Error ${alternativeResponse.status}: ${alternativeResponse.statusText}`);
        }
        
        const data = await alternativeResponse.json();
        if (!data) {
          throw new Error('ไม่พบข้อมูล batch');
        }
        
        setBatchData(data);
        return data;
      }
      
      // ถ้าดึงข้อมูลจาก endpoint แรกสำเร็จ
      const data = await response.json();
      if (!data) {
        throw new Error('ไม่พบข้อมูล batch');
      }
      
      setBatchData(data);
      return data;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Fetch aborted');
      } else {
        console.error('Error fetching batch data:', error);
        throw error;
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    batchData,
    fetchBatchData,
    buildElementsFromBatch
  };
}; 