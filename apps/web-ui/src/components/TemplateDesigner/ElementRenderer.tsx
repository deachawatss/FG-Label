import React, { memo } from 'react';
import { ElementType, TextElement, RectElement, BarcodeElement, QrElement, LineElement } from '../../models/TemplateDesignerTypes';

// ตรวจสอบว่าอยู่ในฝั่ง client
const isClient = typeof window !== 'undefined';

// นำเข้าโมดูลที่ทำงานเฉพาะฝั่ง client
let Group: any = null;
let Rect: any = null;
let Text: any = null;
let Image: any = null;
let Line: any = null;

if (isClient) {
  const Konva = require('react-konva');
  Group = Konva.Group;
  Rect = Konva.Rect;
  Text = Konva.Text;
  Image = Konva.Image;
  Line = Konva.Line;
}

interface ElementRendererProps {
  element: ElementType;
  qrDataUrls: {[key: string]: string};
  qrImages: {[key: string]: HTMLImageElement};
  barcodeDataUrls: {[key: string]: string};
  barcodeImages: {[key: string]: HTMLImageElement};
  updateQrDataUrl: (el: QrElement) => void;
  updateBarcodeDataUrl: (el: BarcodeElement) => void;
  isSelected: boolean;
}

/**
 * คอมโพเนนต์สำหรับแสดงองค์ประกอบต่างๆ บน Canvas
 */
export const ElementRenderer: React.FC<ElementRendererProps> = memo(({
  element,
  qrDataUrls,
  qrImages,
  barcodeDataUrls,
  barcodeImages,
  updateQrDataUrl,
  updateBarcodeDataUrl,
  isSelected
}) => {
  // ถ้าไม่ได้อยู่ในฝั่ง client ไม่แสดงอะไร
  if (!isClient) return null;

  // เตรียม components ที่จำเป็น
  const MemoGroup = memo(Group);
  const MemoText = memo(Text);
  const MemoRect = memo(Rect);
  const MemoKonvaImage = memo(Image);
  const MemoLine = memo(Line);

  // แสดงผลตามประเภทของ element
  if (element.type === 'text') {
    const textElement = element as TextElement;
    return (
      <MemoText
        text={textElement.text}
        fontSize={textElement.fontSize}
        fontFamily={textElement.fontFamily}
        fill={textElement.fill}
        width={textElement.width}
        height={textElement.height}
        align={textElement.align || 'left'}
        verticalAlign="middle"
        fontStyle={textElement.fontStyle || 'normal'}
        fontVariant="normal"
        fontWeight={textElement.fontWeight || 'normal'}
        lineHeight={1.2}
      />
    );
  }
  
  if (element.type === 'rect') {
    const rectElement = element as RectElement;
    return (
      <MemoRect
        width={rectElement.width}
        height={rectElement.height}
        fill={rectElement.fill}
        cornerRadius={5}
        stroke={rectElement.borderColor}
        strokeWidth={rectElement.borderWidth}
      />
    );
  }
  
  if (element.type === 'barcode') {
    const barcodeElement = element as BarcodeElement;
    // ใช้ข้อมูลจาก state ถ้ามี หรือ render placeholder
    const barcodeUrl = barcodeDataUrls[barcodeElement.id];
    
    // ลดการ log ที่ไม่จำเป็น โดย log เฉพาะเมื่อมีการอัพเดต
    if (!barcodeUrl) {
      console.log(`Rendering barcode element ${barcodeElement.id}:`, { 
        value: barcodeElement.value,
        hasDataUrl: false,
        hasImage: false
      });
    }
    
    if (barcodeUrl) {
      const imageObj = barcodeImages[barcodeElement.id] || new window.Image();
      if (!barcodeImages[barcodeElement.id]) {
        imageObj.src = barcodeUrl;
        console.log(`Setting barcode image source for ${barcodeElement.id}`);
        
        imageObj.onload = () => {
          console.log(`Barcode image loaded for ${barcodeElement.id}`);
        };
        
        imageObj.onerror = (err) => {
          console.error(`Error loading barcode image for ${barcodeElement.id}:`, err);
        };
      }
      
      if (imageObj.complete && imageObj.naturalWidth !== 0) {
        return (
          <MemoKonvaImage
            image={imageObj}
            width={barcodeElement.width}
            height={barcodeElement.height}
          />
        );
      }
    }
    
    // ถ้าไม่มี dataUrl หรือรูปภาพยังโหลดไม่เสร็จ ให้สร้าง barcode
    if (!barcodeUrl && barcodeElement.value) {
      // ใช้ ref เพื่อป้องกันการเรียกหลายครั้ง
      const requestTimerId = React.useRef<any>(null);
      
      if (!requestTimerId.current) {
        console.log(`Requesting barcode update for ${barcodeElement.id} with value ${barcodeElement.value}`);
        // เรียก update แค่ครั้งเดียวในครั้งต่อไปที่ render
        requestTimerId.current = setTimeout(() => {
          if (!barcodeDataUrls[barcodeElement.id]) {
            updateBarcodeDataUrl(barcodeElement);
          }
          requestTimerId.current = null;
        }, 50);
      }
    }
    
    // แสดง placeholder พร้อมข้อความ
    return (
      <MemoGroup>
        <MemoRect 
          width={barcodeElement.width} 
          height={barcodeElement.height} 
          fill="#ffffff"
          cornerRadius={2}
          stroke="#eeeeee"
          strokeWidth={1}
        />
        {/* สร้างแท่ง Barcode จำลอง - ปรับให้ใกล้เคียงกับของจริงมากขึ้น */}
        {Array.from({ length: 20 }).map((_, i) => {
          // คำนวณความสูงแบบสมมาตร เพื่อให้ดูเหมือนจริงมากขึ้น
          const baseHeight = 70; // ความสูงพื้นฐานเท่ากับค่าที่ใช้ใน JsBarcode
          const randomHeight = baseHeight - Math.abs((i % 7) - 3) * 8; // สร้างรูปแบบที่เป็นระเบียบมากขึ้น
          
          return (
            <MemoRect 
              key={`bar-${i}`}
              x={barcodeElement.width / 2 - 50 + i * 5}
              y={10}
              width={2}
              height={randomHeight}
              fill="#000000"
            />
          );
        })}
        <MemoText
          text={barcodeElement.value || ""}
          fontSize={14}
          fontFamily="monospace"
          fontStyle="bold"
          fill="#000000"
          width={barcodeElement.width}
          height={30}
          y={barcodeElement.height - 20}
          align="center"
          verticalAlign="middle"
        />
      </MemoGroup>
    );
  }
  
  if (element.type === 'qr') {
    const qrElement = element as QrElement;
    // ใช้ข้อมูลจาก state ถ้ามี หรือ render placeholder
    const qrUrl = qrDataUrls[qrElement.id];
    
    // ลดการ log ที่ไม่จำเป็น โดย log เฉพาะเมื่อมีการอัพเดต
    if (!qrUrl) {
      console.log(`Rendering QR element ${qrElement.id}:`, { 
        value: qrElement.value,
        hasDataUrl: false,
        hasImage: false
      });
    }
    
    if (qrUrl) {
      const imageObj = qrImages[qrElement.id] || new window.Image();
      if (!qrImages[qrElement.id]) {
        imageObj.src = qrUrl;
        console.log(`Setting QR image source for ${qrElement.id}`);
        
        imageObj.onload = () => {
          console.log(`QR image loaded for ${qrElement.id}`);
        };
        
        imageObj.onerror = (err) => {
          console.error(`Error loading QR image for ${qrElement.id}:`, err);
        };
      }
      
      if (imageObj.complete && imageObj.naturalWidth !== 0) {
        return (
          <MemoKonvaImage
            image={imageObj}
            width={qrElement.width}
            height={qrElement.height}
          />
        );
      }
    }
    
    // ถ้าไม่มี dataUrl หรือรูปภาพยังโหลดไม่เสร็จ ให้สร้าง QR code
    if (!qrUrl && qrElement.value) {
      // ใช้ ref เพื่อป้องกันการเรียกหลายครั้ง
      const requestTimerId = React.useRef<any>(null);
      
      if (!requestTimerId.current) {
        console.log(`Requesting QR update for ${qrElement.id} with value ${qrElement.value.substring(0, 20)}...`);
        // เรียก update แค่ครั้งเดียวในครั้งต่อไปที่ render
        requestTimerId.current = setTimeout(() => {
          if (!qrDataUrls[qrElement.id]) {
            updateQrDataUrl(qrElement);
          }
          requestTimerId.current = null;
        }, 50);
      }
    }
    
    // แสดง placeholder พร้อมข้อความ
    return (
      <MemoGroup>
        <MemoRect
          width={qrElement.width}
          height={qrElement.height}
          fill="#f0f0f0"
          cornerRadius={5}
        />
        <MemoText
          text={qrElement.value?.substring(0, 20) + "..." || "QR Code"}
          fontSize={12}
          fontFamily="Arial"
          fill="#999"
          width={qrElement.width}
          height={qrElement.height}
          align="center"
          verticalAlign="middle"
        />
      </MemoGroup>
    );
  }
  
  if (element.type === 'line') {
    const lineElement = element as LineElement;
    return (
      <MemoLine
        points={[0, 0, lineElement.width, 0]}
        stroke={lineElement.fill}
        strokeWidth={2}
      />
    );
  }
  
  // Default placeholder
  return (
    <MemoRect
      width={element.width}
      height={element.height}
      fill="#ddd"
      cornerRadius={5}
    />
  );
});

ElementRenderer.displayName = 'ElementRenderer'; 