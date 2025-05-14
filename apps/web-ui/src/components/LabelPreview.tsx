import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Modal, Button, Spin, message } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

// Check if we're on the client side
const isClient = typeof window !== 'undefined';

interface LabelPreviewProps {
  visible: boolean;
  onClose: () => void;
  batchNo: string;
  bagNo?: string;
  templateId?: string | number;
  apiEndpoint?: string;
}

interface BagData {
  bagNo: string;
  bagSequence: number;
  bagPosition: string;
  totalBags: number;
}

const LabelPreview: React.FC<LabelPreviewProps> = ({ 
  visible, 
  onClose, 
  batchNo, 
  bagNo, 
  templateId, 
  apiEndpoint = '/api/templates/preview' 
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [labelData, setLabelData] = useState<any>(null);
  const [labelWidth, setLabelWidth] = useState<number>(400);
  const [labelHeight, setLabelHeight] = useState<number>(400);
  const [barcodeImages, setBarcodeImages] = useState<Record<string, string>>({});
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [bagData, setBagData] = useState<BagData | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const printContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setError(null);
      fetchLabelData();
    }
  }, [visible, batchNo, bagNo, templateId, apiEndpoint]);

  const fetchLabelData = async () => {
    try {
      // Construct API URL
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5051';
      const apiBase = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
      
      let url = `${apiBase}/templates/preview?`;
      if (templateId) {
        url += `templateId=${encodeURIComponent(templateId)}`;
      }
      if (batchNo) {
        url += `&batchNo=${encodeURIComponent(batchNo)}`;
      }
      if (bagNo) {
        url += `&bagNo=${encodeURIComponent(bagNo)}`;
      }
      
      console.log('Fetching label data from:', url);
      
      // Get token from localStorage
      const token = isClient ? localStorage.getItem('token') : null;
      
      // Setup headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add token if available
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await axios.get(url, { headers });
      
      if (response.status === 200 && response.data) {
        const data = response.data;
        
        // Set label data and dimensions
        setLabelData(data);
        setLabelWidth(data.canvasSize?.width || 100);
        setLabelHeight(data.canvasSize?.height || 100);
        
        // Set bag data
        setBagData({
          bagNo: bagNo || '1',
          bagSequence: parseInt(bagNo || '1', 10),
          bagPosition: bagNo || '1',
          totalBags: 1
        });
        
        setLoading(false);
      } else {
        setError('ไม่สามารถโหลดข้อมูลฉลากได้');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Error fetching label data:', err);
      
      // Handle 401 Unauthorized error
      if (err.response && err.response.status === 401) {
        // Redirect to login page
        if (isClient) {
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
        setError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
      } else {
        setError(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้'}`);
      }
      
      setLoading(false);
    }
  };

  // ปรับฟังก์ชัน createQrCode ให้สร้าง Data URL แทนการสร้าง HTMLImageElement
  const createQrCode = async (value: string, size: number = 200): Promise<string> => {
    try {
      // Replace placeholders
      const processedValue = value
        .replace(/{batchNo}/g, batchNo)
        .replace(/{bagNo}/g, bagData?.bagNo || '')
        .replace(/{bagSequence}/g, String(bagData?.bagSequence || 1));
      
      try {
        if (typeof QRCode !== 'undefined') {
          // Create a temporary canvas for QR code generation
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = size;
          tempCanvas.height = size;
          
          // Generate QR code on the temporary canvas
          await QRCode.toCanvas(tempCanvas, processedValue, {
            errorCorrectionLevel: 'M',
            width: size
          });
          
          // Return the data URL from the canvas
          return tempCanvas.toDataURL('image/png');
        } else {
          throw new Error('QRCode library not loaded');
        }
      } catch (e) {
        console.error('QR code generation error:', e);
        return '';
      }
    } catch (e) {
      console.error('Error in createQrCode:', e);
      return '';
    }
  };

  // ปรับฟังก์ชัน createBarcode ให้แสดง barcode ที่ชัดเจนและอยู่ตรงกลาง
  const createBarcode = (value: string, format: string = 'CODE128', width: number = 300, height: number = 70): string => {
    try {
      // Replace placeholders
      const processedValue = value
        .replace(/{batchNo}/g, batchNo)
        .replace(/{bagNo}/g, bagData?.bagNo || '')
        .replace(/{bagSequence}/g, String(bagData?.bagSequence || 1));
      
      try {
        // Create a temporary canvas for barcode generation
        const tempCanvas = document.createElement('canvas');
        
        // ปรับขนาด canvas ให้ใหญ่ขึ้นเพื่อให้รองรับ barcode ที่ใหญ่ขึ้น
        tempCanvas.width = width;
        tempCanvas.height = height;
        
        // Use JsBarcode to generate the barcode
        if (typeof JsBarcode !== 'undefined') {
          JsBarcode(tempCanvas, processedValue, {
            format: format,
            width: 2,
            height: height - 20,
            displayValue: true,
            fontSize: 14,
            textMargin: 6,
            background: '#FFFFFF',
            lineColor: '#000000',
            textAlign: 'center',
            margin: 5
          });
          
          // Return the data URL from the canvas
          return tempCanvas.toDataURL('image/png');
        } else {
          throw new Error('JsBarcode library not loaded');
        }
      } catch (e) {
        console.error('Barcode generation error:', e);
        return '';
      }
    } catch (e) {
      console.error('Error in createBarcode:', e);
      return '';
    }
  };

  // Process and replace template placeholders with actual data
  const processPlaceholders = (text: string): string => {
    if (!text || typeof text !== 'string') return text;
    
    // Create a map of all available data from labelData
    const dataMap: Record<string, any> = {};
    if (labelData) {
      // Add all labelData properties to dataMap
      Object.entries(labelData).forEach(([key, value]) => {
        if (typeof value !== 'object') {
          dataMap[key.toLowerCase()] = value;
        }
      });
    }
    
    // Replace basic placeholders
    let processed = text
      .replace(/{batchNo}/g, batchNo)
      .replace(/{bagNo}/g, bagData?.bagNo || '')
      .replace(/{bagSequence}/g, String(bagData?.bagSequence || 1))
      .replace(/{bagPosition}/g, bagData?.bagPosition || '')
      .replace(/{totalBags}/g, String(bagData?.totalBags || 1))
      .replace(/{printDate}/g, dayjs().format('DD/MM/YY'))
      .replace(/{printDateTime}/g, dayjs().format('DD/MM/YY HH:mm'));
      
    // Replace more specific placeholders from labelData
    processed = processed
      .replace(/{productKey}/g, dataMap.itemkey || dataMap.productkey || '')
      .replace(/{productName}/g, dataMap.product || dataMap.description || '')
      .replace(/{customerKey}/g, dataMap.custkey || dataMap.customerkey || '')
      .replace(/{customerName}/g, dataMap.customer_name || '')
      .replace(/{productionDate}/g, dataMap.productiondate ? dayjs(dataMap.productiondate).format('DD MMM YYYY') : '')
      .replace(/{expiryDate}/g, dataMap.expirydate ? dayjs(dataMap.expirydate).format('DD MMM YYYY') : '')
      .replace(/{bestBefore}/g, dataMap.best_before || dataMap.expirydate ? dayjs(dataMap.expirydate).format('DD MMM YYYY') : '')
      .replace(/{netWeight}/g, dataMap.net_weight1 || dataMap.packsize1 || '');
    
    // Handle formula fields from LabelFormula.txt
    let allergen = dataMap.allergen1 || '';
    
    // ถ้ามีเครื่องหมาย ":" ในข้อมูล allergen ให้แยกเอาเฉพาะข้อมูลหลังเครื่องหมาย
    if (allergen && allergen.includes(':')) {
      const allergenParts = allergen.split(':');
      if (allergenParts.length > 1) {
        allergen = allergenParts[1].trim();
      }
    }
    
    // ถ้าไม่มีค่า allergen แต่มี allergen2 หรือ allergen3 ให้ใช้ค่านั้นแทน
    if (!allergen || allergen === '') {
      const allergen2 = dataMap.allergen2 || '';
      const allergen3 = dataMap.allergen3 || '';
      
      if (allergen2 && allergen2 !== '') {
        // ถ้า allergen2 มี ":" ให้แยกเอาเฉพาะข้อมูลหลังเครื่องหมาย
        if (allergen2.includes(':')) {
          const allergenParts = allergen2.split(':');
          if (allergenParts.length > 1) {
            allergen = allergenParts[1].trim();
          } else {
            allergen = allergen2;
          }
        } else {
          allergen = allergen2;
        }
      } else if (allergen3 && allergen3 !== '') {
        // ถ้า allergen3 มี ":" ให้แยกเอาเฉพาะข้อมูลหลังเครื่องหมาย
        if (allergen3.includes(':')) {
          const allergenParts = allergen3.split(':');
          if (allergenParts.length > 1) {
            allergen = allergenParts[1].trim();
          } else {
            allergen = allergen3;
          }
        } else {
          allergen = allergen3;
        }
      } else {
        allergen = 'Gluten (Wheat)'; // ค่าเริ่มต้นที่ถูกต้องตามข้อมูล
      }
    }
    
    // ถ้าเป็นสินค้า TC410C05 ให้ใช้ค่า "แป้งสาลี" ตามสูตร
    if (dataMap.itemkey === 'TC410C05' || dataMap.productkey === 'TC410C05') {
      allergen = 'แป้งสาลี';
    }
    
    // แก้ไข LineCode ให้ถูกต้อง
    let lineCode = dataMap.linecode || '';
    if (!lineCode) {
      const palletNo = dataMap.palletno || '01';
      const bagNo = dataMap.bagno || '1';
      const formattedBagNo = parseInt(bagNo) < 10 ? `0${bagNo}` : bagNo;
      lineCode = `P${palletNo}B${formattedBagNo}`;
    }
    
    processed = processed
      .replace(/{allergen1}/g, allergen)
      .replace(/{allergen2}/g, dataMap.allergen2 || '')
      .replace(/{allergen3}/g, dataMap.allergen3 || '')
      .replace(/{allergen}/g, allergen)
      .replace(/{storagecondition}/g, dataMap.storecap1 || 'Store under dry cool condition')
      .replace(/{lotcode}/g, dataMap.lot_code || batchNo)
      .replace(/{lineCode}/g, lineCode)
      .replace(/{formulaID}/g, dataMap.formulaid || '')
      .replace(/{ingredientList}/g, 
        (dataMap.ingredlist1 || '') + (dataMap.ingredlist2 || '') + (dataMap.ingredlist3 || ''));
      
    return processed;
  };

  // ปรับปรุงฟังก์ชัน renderElement ให้แสดงรูปภาพ barcode และ qrcode จาก Data URL
  const renderElement = (
    ctx: CanvasRenderingContext2D, 
    element: any, 
    data: any,
    barcodeImages: Record<string, string>,
    qrImages: Record<string, string>
  ) => {
    if (!element.visible) {
      return;
    }

    const x = element.x || 0;
    const y = element.y || 0;
    const width = element.width || 100;
    const height = element.height || 20;
    
    // คำนวณค่า rotation (ถ้ามี)
    const rotation = element.rotation || 0;
    
    // บันทึกสถานะปัจจุบันของ canvas
    ctx.save();
    
    // ถ้ามีการหมุน
    if (rotation !== 0) {
      // หาจุดศูนย์กลางของ element
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      
      // ย้ายจุดอ้างอิงไปที่ศูนย์กลางของ element
      ctx.translate(centerX, centerY);
      
      // หมุน canvas ตามองศาที่กำหนด (แปลงจากองศาเป็น radian)
      ctx.rotate(rotation * Math.PI / 180);
      
      // ย้ายจุดอ้างอิงกลับ
      ctx.translate(-centerX, -centerY);
    }

    switch (element.type) {
      case 'rectangle':
      case 'rect':
        // วาด rectangle พร้อม border
        ctx.beginPath();
        
        // ตั้งค่าสีพื้นหลัง
        if (element.fill && element.fill !== 'transparent') {
          ctx.fillStyle = element.fill;
          ctx.fillRect(x, y, width, height);
        }
        
        // กำหนดค่า border ถ้ามี
        const borderWidth = element.borderWidth || element.strokeWidth || 0;
        const borderColor = element.borderColor || element.stroke || '#000000';
        
        if (borderWidth > 0) {
          ctx.lineWidth = borderWidth;
          ctx.strokeStyle = borderColor;
          ctx.strokeRect(x, y, width, height);
        }
        break;
      
      case 'text':
        const processedText = processPlaceholders(element.text || '');
        
        // ตั้งค่า text styling
        ctx.font = `${element.fontStyle || ''} ${element.fontWeight || ''} ${element.fontSize || 12}px ${element.fontFamily || 'Arial'}`;
        ctx.fillStyle = element.fill || '#000000';
        ctx.textBaseline = 'top';
        
        // ตั้งค่าการจัดตำแหน่งข้อความ
        let textAlign = element.align || element.textAlign || 'left';
        ctx.textAlign = textAlign as CanvasTextAlign;
        
        let textX = x;
        if (textAlign === 'center') {
          textX = x + width / 2;
        } else if (textAlign === 'right') {
          textX = x + width;
        }
        
        // ถ้าข้อความมีหลายบรรทัด ให้แบ่งออกเป็นบรรทัดๆ
        const lines = processedText.split('\n');
        const lineHeight = element.fontSize ? element.fontSize * 1.2 : 14; // 1.2 เท่าของขนาดตัวอักษร
        
        // วาดข้อความแต่ละบรรทัด
        lines.forEach((line, index) => {
          ctx.fillText(line, textX, y + index * lineHeight);
        });
        break;
      
      case 'barcode':
        // แสดงผล barcode จาก Data URL
        const barcodeKey = `${element.id}-${element.value}`;
        if (barcodeImages[barcodeKey] && barcodeImages[barcodeKey] !== '') {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, x, y, width, height);
          };
          img.src = barcodeImages[barcodeKey];
        } else {
          // ถ้าไม่มีรูปภาพ barcode ให้แสดงข้อความ placeholder และลองสร้างใหม่
          ctx.strokeStyle = '#000000';
          ctx.strokeRect(x, y, width, height);
          ctx.font = '10px Arial';
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('Barcode: ' + (element.value || ''), x + width / 2, y + height / 2);
          
          // สร้าง barcode ใหม่และเก็บไว้
          const processedValue = processPlaceholders(element.value || '');
          const barcodeUrl = createBarcode(processedValue, element.format, width, height);
          
          if (barcodeUrl) {
            // เก็บ barcode ไว้ใช้งานอีกครั้งในการ render ถัดไป
            setBarcodeImages(prev => ({...prev, [barcodeKey]: barcodeUrl}));
          }
        }
        break;
      
      case 'qr':
      case 'qrcode':
        // แสดงผล QR code จาก Data URL
        const qrKey = `${element.id}-${element.value}`;
        if (qrImages[qrKey] && qrImages[qrKey] !== '') {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, x, y, width, height);
          };
          img.src = qrImages[qrKey];
        } else {
          // ถ้าไม่มีรูปภาพ QR code ให้แสดงข้อความ placeholder และลองสร้างใหม่
          ctx.strokeStyle = '#000000';
          ctx.strokeRect(x, y, width, height);
          ctx.font = '10px Arial';
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('QR: ' + (element.value || ''), x + width / 2, y + height / 2);
          
          // สร้าง QR code ใหม่และเก็บไว้
          const processedValue = processPlaceholders(element.value || '');
          createQrCode(processedValue, Math.min(width, height)).then(qrUrl => {
            if (qrUrl) {
              // เก็บ QR code ไว้ใช้งานอีกครั้งในการ render ถัดไป
              setQrImages(prev => ({...prev, [qrKey]: qrUrl}));
            }
          });
        }
        break;
      
      case 'image':
        if (element.src) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, x, y, width, height);
          };
          img.src = element.src;
        }
        break;
      
      default:
        // ในกรณีที่ไม่รู้จักประเภทของ element ให้แสดง placeholder
        ctx.strokeStyle = '#ff0000';
        ctx.strokeRect(x, y, width, height);
        ctx.font = '10px Arial';
        ctx.fillStyle = '#ff0000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Unknown: ${element.type}`, x + width / 2, y + height / 2);
    }
    
    // คืนค่าสถานะเดิมของ canvas
    ctx.restore();
  };

  // Render the label with all elements
  const renderLabel = (
    canvasRef: React.RefObject<HTMLCanvasElement>,
    elements: any[],
    data: any,
    barcodeImages: Record<string, string>,
    qrImages: Record<string, string>
  ) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // ถ้ามีการกำหนด border ให้วาด border สำหรับทั้ง label
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // Sort elements by layer
    const sortedElements = [...elements].sort((a, b) => {
      return (a.layer || 0) - (b.layer || 0);
    });

    // Draw each element
    sortedElements.forEach(element => {
      renderElement(ctx, element, data, barcodeImages, qrImages);
    });
  };

  // แก้ไข useEffect สำหรับการแสดง barcode และ QR code
  useEffect(() => {
    if (labelData && !loading && !error) {
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Clear canvas
          ctx.clearRect(0, 0, labelWidth, labelHeight);
          
          // Draw white background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, labelWidth, labelHeight);
          
          // ถ้ามีการกำหนด border ให้วาด border สำหรับทั้ง label
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.strokeRect(0, 0, labelWidth, labelHeight);
          
          // Sort elements by layer
          if (labelData.elements && Array.isArray(labelData.elements)) {
            // ตรวจสอบว่ามี barcode element หรือไม่
            const hasBarcodeElement = labelData.elements.some((element: any) => 
              element.type === 'barcode' || element.id?.includes('barcode')
            );
            
            // ถ้าไม่มี barcode element และมีค่า batchNo ให้เพิ่ม barcode element ตรงกลาง
            if (!hasBarcodeElement && batchNo) {
              labelData.elements.push({
                id: `barcode-${batchNo}`,
                type: 'barcode',
                x: 50, // เริ่มที่ตำแหน่ง x = 50 (ใช้ค่าประมาณเพื่อจัดให้อยู่ตรงกลาง)
                y: 235, // เริ่มที่ตำแหน่ง y = 235 (ใช้ค่าประมาณเพื่อจัดให้อยู่ด้านล่าง)
                width: 300, // ความกว้าง 300
                height: 70, // ความสูง 70
                value: batchNo,
                format: 'CODE128',
                displayValue: true,
                fontSize: 14,
                textAlign: 'center',
                layer: 10
              });
            }
            
            const sortedElements = [...labelData.elements].sort((a, b) => {
              return (a.layer || 0) - (b.layer || 0);
            });
            
            // Draw each element
            sortedElements.forEach(element => {
              // ถ้าเป็น barcode element ให้ปรับตำแหน่งให้อยู่ตรงกลาง
              if (element.type === 'barcode' && element.value) {
                // ปรับค่า x และความกว้างเพื่อให้ barcode อยู่ตรงกลาง
                element.x = 50; // เริ่มที่ตำแหน่ง x = 50
                element.width = 300; // ความกว้าง 300
                element.textAlign = 'center'; // จัดตำแหน่งข้อความให้อยู่ตรงกลาง
              }
              
              renderElement(ctx, element, labelData, barcodeImages, qrImages);
            });
          }
        }
      }
    }
  }, [labelData, loading, error, labelWidth, labelHeight, barcodeImages, qrImages, batchNo]);

  // เพิ่มฟังก์ชัน effect สำหรับการตั้งค่าขนาด canvas เมื่อข้อมูลพร้อม
  useEffect(() => {
    if (canvasRef.current && labelData) {
      const canvas = canvasRef.current;
      
      // ตั้งค่าขนาด canvas ตามขนาดเลเบล
      // แปลงค่า mm เป็น pixels ด้วยความละเอียดสูงเพื่อคุณภาพที่ดีขึ้น
      // ใช้ 10 pixels ต่อ mm สำหรับการแสดงผลที่ดีขึ้น
      const pixelsPerMm = 10;
      canvas.width = labelWidth * pixelsPerMm;
      canvas.height = labelHeight * pixelsPerMm;
      
      // ตั้งค่าขนาดการแสดงผล (CSS) ให้ตรงกับขนาดเลเบลใน mm
      // เพื่อให้แน่ใจว่า canvas มีขนาดที่ถูกต้องบนหน้าจอ
      canvas.style.width = `${labelWidth}mm`;
      canvas.style.height = `${labelHeight}mm`;
      
      // ปรับสเกลให้ตรงกับ canvas ความละเอียดสูง
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(pixelsPerMm, pixelsPerMm);
      }
    }
  }, [labelData, labelWidth, labelHeight]);

  // Handle print functionality
  const handlePrint = () => {
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('ไม่สามารถเปิดหน้าต่างการพิมพ์ได้ โปรดตรวจสอบการตั้งค่าบล็อกป๊อปอัพของเบราว์เซอร์');
      return;
    }
    
    // Get the canvas element
    const canvas = document.getElementById('label-canvas') as HTMLCanvasElement;
    if (!canvas) {
      setError('ไม่พบ canvas สำหรับพิมพ์');
      return;
    }
    
    // Create a data URL from the canvas
    const dataUrl = canvas.toDataURL('image/png');
    
    // Calculate print dimensions based on label size
    // Convert mm to pixels at 96 DPI (standard screen resolution)
    // 1 mm = 3.779528 pixels at 96 DPI
    const pixelsPerMm = 3.779528;
    const printWidthPx = labelWidth * pixelsPerMm;
    const printHeightPx = labelHeight * pixelsPerMm;
    
    // Create print-specific CSS
    const printCSS = `
      @page {
        size: ${labelWidth}mm ${labelHeight}mm;
        margin: 0;
      }
      body {
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
      }
      img {
        width: ${printWidthPx}px;
        height: ${printHeightPx}px;
        max-width: 100%;
        object-fit: contain;
      }
      @media print {
        body {
          width: ${labelWidth}mm;
          height: ${labelHeight}mm;
        }
        img {
          width: 100%;
          height: 100%;
        }
      }
    `;
    
    // Write content to the new window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>พิมพ์ฉลาก - Batch ${batchNo}${bagNo ? ` - Bag ${bagNo}` : ''}</title>
          <style>${printCSS}</style>
        </head>
        <body>
          <img src="${dataUrl}" alt="Label" />
          <script>
            // Auto-print when loaded
            window.onload = function() {
              setTimeout(function() {
                window.print();
                // Close window after print dialog is closed (or after 2 seconds if print is canceled)
                setTimeout(function() {
                  window.close();
                }, 2000);
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    
    printWindow.document.close();
  };

  return (
    <Modal
      title={`ตัวอย่างฉลาก - Batch ${batchNo}${bagNo ? ` - Bag ${bagNo}` : ''}`}
      open={visible}
      onCancel={onClose}
      width={Math.max(labelWidth * 3.8, 600)}
      footer={[
        <Button key="close" onClick={onClose}>
          ปิด
        </Button>,
        <Button key="print" type="primary" onClick={handlePrint} disabled={loading || !!error}>
          พิมพ์
        </Button>
      ]}
    >
      <div style={{ textAlign: 'center' }}>
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>กำลังโหลดข้อมูลฉลาก...</div>
          </div>
        ) : error ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'red' }}>
            <div style={{ fontSize: 24, marginBottom: 16 }}>⚠️</div>
            <div>{error}</div>
          </div>
        ) : (
          <div 
            style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              padding: '20px 0',
              overflow: 'auto'
            }}
          >
            <div 
              id="print-container" 
              ref={printContainerRef}
              style={{ 
                width: `${labelWidth}mm`,
                height: `${labelHeight}mm`,
                border: '1px solid #ddd',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                position: 'relative',
                backgroundColor: 'white'
              }}
            >
              <canvas 
                id="label-canvas" 
                ref={canvasRef}
                style={{
                  width: `${labelWidth}mm`,
                  height: `${labelHeight}mm`
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default LabelPreview;