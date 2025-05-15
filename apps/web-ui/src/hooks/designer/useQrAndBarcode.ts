import { useState, useCallback, useEffect } from 'react';
import { QrElement, BarcodeElement } from '../../models/TemplateDesignerTypes';

// ตรวจสอบว่าอยู่ในฝั่ง client
const isClient = typeof window !== 'undefined';

// ประกาศตัวแปรสำหรับเก็บโมดูลที่โหลดในฝั่ง client
let QRCode: any = null;
let JsBarcode: any = null;

// โหลดโมดูลเฉพาะฝั่ง client
if (isClient) {
  try {
    // นำเข้าแบบ dynamic เพื่อให้ทำงานได้ใน Next.js
    import('qrcode').then(module => {
      QRCode = module.default || module;
      console.log('QRCode library loaded successfully');
    }).catch(err => {
      console.error('Failed to load QRCode library:', err);
    });

    import('jsbarcode').then(module => {
      JsBarcode = module.default || module;
      console.log('JsBarcode library loaded successfully');
    }).catch(err => {
      console.error('Failed to load JsBarcode library:', err);
    });
  } catch (error) {
    console.error('Error during dynamic import of barcode or QR code libraries:', error);
  }
}

interface QrAndBarcodeState {
  qrDataUrls: { [key: string]: string };
  qrImages: { [key: string]: HTMLImageElement };
  barcodeDataUrls: { [key: string]: string };
  barcodeImages: { [key: string]: HTMLImageElement };
}

/**
 * Custom hook สำหรับจัดการ QR code และ barcode
 */
export const useQrAndBarcode = () => {
  const [qrDataUrls, setQrDataUrls] = useState<{[key: string]: string}>({});
  const [qrImages, setQrImages] = useState<{[key: string]: HTMLImageElement}>({});
  const [barcodeDataUrls, setBarcodeDataUrls] = useState<{[key: string]: string}>({});
  const [barcodeImages, setBarcodeImages] = useState<{[key: string]: HTMLImageElement}>({});

  /**
   * สร้าง Data URL สำหรับ QR Code
   */
  const generateQrDataUrl = useCallback(async (el: QrElement): Promise<string | null> => {
    if (!isClient || !el.value) return null;
    
    try {
      // ตรวจสอบว่า QRCode library โหลดเรียบร้อยแล้วหรือไม่
      if (!QRCode) {
        console.log('QRCode library not loaded yet, loading now...');
        try {
          const module = await import('qrcode');
          QRCode = module.default || module;
          console.log('QRCode library loaded successfully in generateQrDataUrl');
        } catch (err) {
          console.error('Failed to load QRCode library in generateQrDataUrl:', err);
          return null;
        }
      }
      
      console.log(`Generating QR code for ${el.id} with value: ${el.value.substring(0, 30)}...`);
      
      // สร้าง QR Code ด้วย qrcode library
      const dataUrl = await QRCode.toDataURL(el.value, {
        margin: 0,
        width: el.width,
        color: {
          dark: el.fill || '#000000',
          light: '#FFFFFF'
        }
      });
      
      console.log(`QR code generated successfully for ${el.id}`);
      return dataUrl;
    } catch (error) {
      console.error(`Error generating QR code for ${el.id}:`, error);
      return null;
    }
  }, []);

  /**
   * สร้าง Data URL สำหรับ Barcode
   */
  const generateBarcodeDataUrl = useCallback(async (el: BarcodeElement): Promise<string | null> => {
    if (!isClient || !el.value) return null;
    
    try {
      // ตรวจสอบว่า JsBarcode library โหลดเรียบร้อยแล้วหรือไม่
      if (!JsBarcode) {
        console.log('JsBarcode library not loaded yet, loading now...');
        try {
          const module = await import('jsbarcode');
          JsBarcode = module.default || module;
          console.log('JsBarcode library loaded successfully in generateBarcodeDataUrl');
        } catch (err) {
          console.error('Failed to load JsBarcode library in generateBarcodeDataUrl:', err);
          return null;
        }
      }
      
      console.log(`Generating barcode for ${el.id} with value: ${el.value}`);
      
      // สร้าง Canvas สำหรับ Barcode
      const canvas = document.createElement('canvas');
      
      // กำหนดขนาดของ canvas ให้เหมาะสม
      canvas.width = el.width;
      
      // ขนาดความสูงต้องเพียงพอสำหรับ barcode และข้อความด้านล่าง
      const minHeight = 90; // ความสูงขั้นต่ำที่เหมาะสม
      canvas.height = Math.max(el.height, minHeight);
      
      try {
        // ปรับค่าพารามิเตอร์ให้เหมือนกับในหน้า Print Preview ของ batch-search
        JsBarcode(canvas, el.value, {
          format: el.format || 'CODE128',
          width: 2, // ความกว้างของแต่ละแท่ง barcode
          height: 70, // ความสูงของ barcode - ปรับเป็น 70 เพื่อให้ตรงกับใน batch-search print preview
          displayValue: el.displayValue !== undefined ? el.displayValue : true,
          fontSize: el.fontSize || 14,
          font: 'monospace', // เปลี่ยนเป็น 'monospace' ตรงตาม batch-search เสมอเพื่อความสม่ำเสมอ
          fontOptions: 'bold', // เพิ่ม fontOptions เป็น bold เพื่อให้ตัวเลขชัดเจนขึ้น
          textAlign: 'center', // ตั้งค่าให้ตรงกับใน batch-search เสมอ
          textPosition: 'bottom', // ตั้งค่าให้ตรงกับใน batch-search เสมอ
          textMargin: 2, // ตั้งค่าให้ตรงกับใน batch-search เสมอ
          background: '#FFFFFF', // กำหนดพื้นหลังเป็นสีขาวเพื่อความชัดเจน
          lineColor: '#000000', // กำหนดสีเส้นเป็นสีดำสนิท
          margin: 5 // ตรงกับ batch-search ที่ใช้ margin: 5
        });
      } catch (barcodeError) {
        console.error(`Error generating barcode with JsBarcode: ${barcodeError}`);
        
        // ถ้าสร้าง barcode ไม่สำเร็จ สร้าง placeholder แทน
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // วาด placeholder สำหรับ barcode - แก้ไขให้เข้มและชัดเจนมากขึ้น
          ctx.fillStyle = '#000000'; // เปลี่ยนจาก 'black' เป็น '#000000' เพื่อความเข้มของสี
          for (let i = 0; i < 20; i++) {
            const x = 10 + i * 5;
            const height = 30 + Math.random() * 30;
            ctx.fillRect(x, 15, 2, height);
          }
          
          // เพิ่มข้อความ barcode value - ปรับให้เป็น monospace และเข้มขึ้น
          ctx.font = 'bold 14px monospace'; // เพิ่ม bold เพื่อให้เห็นชัดขึ้น
          ctx.textAlign = 'center';
          ctx.fillText(el.value, canvas.width / 2, el.height - 15);
        }
      }
      
      const dataUrl = canvas.toDataURL('image/png');
      console.log(`Barcode generated successfully for ${el.id}`);
      return dataUrl;
    } catch (error) {
      console.error(`Error generating barcode for ${el.id}:`, error);
      return null;
    }
  }, []);

  /**
   * อัพเดต QR code ตาม element
   */
  const updateQrDataUrl = useCallback(
    async (element: QrElement) => {
      // ตรวจสอบว่า element มี value หรือไม่
      if (!element.value) {
        console.log(`QR element ${element.id} has no value, skipping update`);
        return;
      }

      // ตรวจสอบว่ามี dataUrl อยู่แล้วหรือไม่
      if (qrDataUrls[element.id]) {
        console.log(`QR element ${element.id} already has dataUrl, skipping update`);
        return;
      }

      console.log(`Generating QR code data URL for element ${element.id} with value: ${element.value}`);
      
      try {
        const dataUrl = await generateQrDataUrl(element);
        console.log(`Successfully generated QR data URL for element ${element.id}`);
        
        setQrDataUrls((prev) => ({
          ...prev,
          [element.id]: dataUrl,
        }));

        const imgElement = new Image();
        imgElement.src = dataUrl;
        imgElement.onload = () => {
          setQrImages((prev) => ({
            ...prev,
            [element.id]: imgElement,
          }));
        };
      } catch (error) {
        console.error(`Error generating QR code for element ${element.id}:`, error);
      }
    },
    [qrDataUrls, setQrDataUrls, setQrImages, generateQrDataUrl]
  );

  /**
   * อัพเดต Barcode ตาม element
   */
  const updateBarcodeDataUrl = useCallback(
    async (element: BarcodeElement) => {
      // ตรวจสอบว่า element มี value หรือไม่
      if (!element.value) {
        console.log(`Barcode element ${element.id} has no value, skipping update`);
        return;
      }

      // ตรวจสอบว่ามี dataUrl อยู่แล้วหรือไม่
      if (barcodeDataUrls[element.id]) {
        console.log(`Barcode element ${element.id} already has dataUrl, skipping update`);
        return;
      }

      console.log(`Generating barcode data URL for element ${element.id} with value: ${element.value}`);
      
      try {
        const dataUrl = await generateBarcodeDataUrl(element);
        console.log(`Successfully generated barcode data URL for element ${element.id}`);
        
        setBarcodeDataUrls((prev) => ({
          ...prev,
          [element.id]: dataUrl,
        }));

        const imgElement = new Image();
        imgElement.src = dataUrl;
        imgElement.onload = () => {
          setBarcodeImages((prev) => ({
            ...prev,
            [element.id]: imgElement,
          }));
        };
      } catch (error) {
        console.error(`Error generating barcode for element ${element.id}:`, error);
      }
    },
    [barcodeDataUrls, setBarcodeDataUrls, setBarcodeImages, generateBarcodeDataUrl]
  );

  /**
   * อัปเดต QR code ทั้งหมดในหน้า
   * @param elements อาร์เรย์ของ element ทั้งหมด (ถ้าไม่ระบุจะใช้ elements จากข้อมูลที่มีอยู่แล้ว)
   */
  const updateAllQrCodes = useCallback((elements) => {
    console.log('Updating all QR codes');
    
    if (!elements || elements.length === 0) {
      console.log('No elements to update QR codes');
      return;
    }
    
    // กรองเฉพาะ QR elements
    const qrElements = elements.filter(el => el.type === 'qr');
    
    if (qrElements.length === 0) {
      console.log('No QR elements found in the provided elements array');
      return;
    }
    
    console.log(`Found ${qrElements.length} QR elements to update`);
    
    // กรองเฉพาะ elements ที่ยังไม่มี dataUrl
    const elementsToUpdate = qrElements.filter(el => !qrDataUrls[el.id]);
    
    if (elementsToUpdate.length === 0) {
      console.log('All QR elements already have dataUrl, skipping updates');
      return;
    }
    
    console.log(`Updating ${elementsToUpdate.length} QR elements that don't have dataUrl`);
    elementsToUpdate.forEach(el => {
      console.log(`Updating QR element ${el.id} with value: ${el.value?.substring(0, 20)}...`);
      updateQrDataUrl(el);
    });
  }, [updateQrDataUrl, qrDataUrls]);

  /**
   * อัปเดต barcode ทั้งหมดในหน้า
   * @param elements อาร์เรย์ของ element ทั้งหมด (ถ้าไม่ระบุจะใช้ elements จากข้อมูลที่มีอยู่แล้ว)
   */
  const updateAllBarcodes = useCallback((elements) => {
    console.log('Updating all barcodes');
    
    if (!elements || elements.length === 0) {
      console.log('No elements to update barcodes');
      return;
    }
    
    // กรองเฉพาะ barcode elements
    const barcodeElements = elements.filter(el => el.type === 'barcode');
    
    if (barcodeElements.length === 0) {
      console.log('No barcode elements found in the provided elements array');
      return;
    }
    
    console.log(`Found ${barcodeElements.length} barcode elements to update`);
    
    // กรองเฉพาะ elements ที่ยังไม่มี dataUrl
    const elementsToUpdate = barcodeElements.filter(el => !barcodeDataUrls[el.id]);
    
    if (elementsToUpdate.length === 0) {
      console.log('All barcode elements already have dataUrl, skipping updates');
      return;
    }
    
    console.log(`Updating ${elementsToUpdate.length} barcode elements that don't have dataUrl`);
    elementsToUpdate.forEach(el => {
      console.log(`Updating barcode element ${el.id} with value: ${el.value}`);
      updateBarcodeDataUrl(el);
    });
  }, [updateBarcodeDataUrl, barcodeDataUrls]);

  /**
   * ล้าง cache ทั้งหมดเพื่อให้สร้าง dataUrl ใหม่
   * ใช้เมื่อต้องการให้ render ใหม่ทั้งหมด เช่น หลังจากโหลดข้อมูลจาก localStorage หรือฐานข้อมูล
   */
  const clearCache = useCallback(() => {
    const timestamp = new Date().toISOString();
    console.log(`Clearing QR and barcode cache to force re-rendering ${timestamp}`);
    
    // เช็คจำนวน entries ก่อนล้าง cache
    const qrCount = Object.keys(qrDataUrls).length;
    const barcodeCount = Object.keys(barcodeDataUrls).length;
    
    // ล้าง cache
    setQrDataUrls({});
    setQrImages({});
    setBarcodeDataUrls({});
    setBarcodeImages({});
    
    console.log(`Cache cleared - Previous entries: ${qrCount} QR codes, ${barcodeCount} barcodes`);
  }, [qrDataUrls, barcodeDataUrls]);

  return {
    qrDataUrls,
    qrImages,
    barcodeDataUrls,
    barcodeImages,
    updateQrDataUrl,
    updateBarcodeDataUrl,
    updateAllQrCodes,
    updateAllBarcodes,
    clearCache
  };
}; 