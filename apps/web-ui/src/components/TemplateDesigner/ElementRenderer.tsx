import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Rect,
  Text,
  Image,
  Line,
  Ellipse,
  Group
} from 'react-konva';
import { ElementType, TextElement, BarcodeElement, QrElement, RectElement, LineElement, ImageElement, EllipseElement, GroupElement } from '../../models/TemplateDesignerTypes';

// Default font values
const DEFAULT_FONT_FAMILY = 'Arial';
const DEFAULT_FONT_SIZE = 18;
const DEFAULT_TEXT_COLOR = '#000000';
const DEFAULT_TEXT_ALIGN = 'left';

// Font mapping for different languages
const LANGUAGE_FONTS = {
  arabic: ['Amiri', 'Scheherazade', 'Arial'],
  hebrew: ['David', 'Arial Hebrew', 'Arial'],
  thai: ['Sarabun', 'Tahoma', 'Arial'],
  japanese: ['Meiryo', 'MS Gothic', 'Arial'],
  chinese: ['SimSun', 'Microsoft YaHei', 'Arial'],
  korean: ['Malgun Gothic', 'Dotum', 'Arial'],
};

// Function to detect language from text
const detectLanguage = (text: string): string => {
  if (!text) return 'latin';
  
  // Arabic character range
  if (/[\u0600-\u06FF]/.test(text)) return 'arabic';
  
  // Hebrew character range
  if (/[\u0590-\u05FF]/.test(text)) return 'hebrew';
  
  // Thai character range
  if (/[\u0E00-\u0E7F]/.test(text)) return 'thai';
  
  // Japanese character ranges (Hiragana, Katakana, and Kanji)
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) return 'japanese';
  
  // Chinese character range
  if (/[\u4E00-\u9FFF]/.test(text)) return 'chinese';
  
  // Korean character range
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) return 'korean';
  
  // Default to latin
  return 'latin';
};

// Get appropriate font family for text
const getFontForLanguage = (text: string, preferredFont?: string): string => {
  if (preferredFont && preferredFont !== DEFAULT_FONT_FAMILY) {
    return preferredFont;
  }
  
  const detectedLanguage = detectLanguage(text);
  
  if (detectedLanguage !== 'latin' && LANGUAGE_FONTS[detectedLanguage]) {
    // Return the first font in the array for the detected language
    return LANGUAGE_FONTS[detectedLanguage][0];
  }
  
  return DEFAULT_FONT_FAMILY;
};

// Default rectangle values
const DEFAULT_RECT_FILL = '#FFFFFF';
const DEFAULT_RECT_STROKE = '#000000';
const DEFAULT_RECT_STROKE_WIDTH = 1;

// Default line values
const DEFAULT_LINE_COLOR = '#000000';
const DEFAULT_LINE_WIDTH = 2;

// Minimum clickable area for lines (px)
const MIN_LINE_CLICK_AREA = 10;

// ค่าสัมประสิทธิ์การคำนวณขนาดฟอนต์จากมิติของกล่องข้อความ
const FONT_SIZE_COEFFICIENT = 0.6; // ค่าที่ใช้ในการคำนวณขนาดฟอนต์จากความกว้าง
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 72;

// เพิ่มค่าความกว้างสูงสุดอ้างอิงตามขนาดของข้อความ
const MAX_TEXT_WIDTH_RATIO = 0.95; // 95% ของความกว้างกล่อง

// ค่าสัมประสิทธิ์สำหรับภาษาต่าง ๆ
const LANGUAGE_COEFFICIENTS = {
  latin: { width: 0.6, height: 1.2 },
  arabic: { width: 1.0, height: 1.8 },  // เพิ่มค่าสำหรับอาหรับ
  hebrew: { width: 0.9, height: 1.8 },  // เพิ่มค่าสำหรับฮีบรู
  thai: { width: 0.7, height: 1.4 },
  japanese: { width: 1.0, height: 1.2 },
  chinese: { width: 1.0, height: 1.2 },
  korean: { width: 1.0, height: 1.2 }
};

interface ElementRendererProps {
  element: ElementType;
  qrDataUrls?: Record<string, string>;
  qrImages?: Record<string, HTMLImageElement>;
  barcodeDataUrls?: Record<string, string>;
  barcodeImages?: Record<string, HTMLImageElement>;
  updateQrDataUrl?: (element: any) => void;
  updateBarcodeDataUrl?: (element: any) => void;
  isSelected?: boolean;
}

export const ElementRenderer: React.FC<ElementRendererProps> = ({
  element,
  qrDataUrls = {},
  qrImages = {},
  barcodeDataUrls = {},
  barcodeImages = {},
  updateQrDataUrl,
  updateBarcodeDataUrl,
  isSelected = false
}) => {
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);

  // When QR element loads, update data URL if needed
  useEffect(() => {
    if (element.type === 'qr' && updateQrDataUrl && !qrDataUrls[element.id]) {
      updateQrDataUrl(element);
    }
  }, [element, qrDataUrls, updateQrDataUrl]);

  // When Barcode element loads, update data URL if needed
  useEffect(() => {
    if (element.type === 'barcode' && updateBarcodeDataUrl && !barcodeDataUrls[element.id]) {
      updateBarcodeDataUrl(element);
    }
  }, [element, barcodeDataUrls, updateBarcodeDataUrl]);

  // For image elements, load image when src changes
  useEffect(() => {
    if (element.type === 'image' && (element as ImageElement).src) {
      const imgSrc = (element as ImageElement).src;
      
      // Reset error state when trying to load a new image
      setImageLoadError(false);
      setImageObj(null);
      
      // Don't try to load images with invalid/removed data URLs
      if (imgSrc === '<data-url-removed>') {
        setImageLoadError(true);
        return;
      }
      
      const img = new window.Image();
      
      // Handle image load errors
      img.onerror = () => {
        console.error(`Failed to load image: ${imgSrc.substring(0, 100)}...`);
        setImageLoadError(true);
        
        // Revoke blob URL if it failed to load to clean up resources
        if (imgSrc.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(imgSrc);
          } catch (e) {
            console.warn('Failed to revoke object URL:', e);
          }
        }
      };
      
      img.onload = () => {
        setImageObj(img);
        setImageLoadError(false);
      };
      
      img.src = imgSrc;
    }
  }, [element]);

  // Render based on element type
  switch (element.type) {
    case 'text': {
      const textElement = element as TextElement;
      const text = textElement.text || '';
      
      // Detect language and direction
      const detectedLanguage = detectLanguage(text);
      const isRTL = ['arabic', 'hebrew'].includes(detectedLanguage);
      
      // Get appropriate font family based on text content
      const fontFamily = getFontForLanguage(text, textElement.fontFamily);
      
      // คำนวณขนาดฟอนต์ที่เหมาะสมตามขนาดของกล่องข้อความ
      const calculateFontSize = useMemo(() => {
        const { width, height } = element;
        
        if (!text) return textElement.fontSize || DEFAULT_FONT_SIZE;
        
        // ตรวจสอบจำนวนบรรทัด
        const lineCount = text.split('\n').length || 1;
        // หาความยาวของบรรทัดที่ยาวที่สุด
        const longestLineLength = Math.max(...text.split('\n').map(line => line.length));
        
        // ปรับค่า font size coefficient ตามภาษาที่ตรวจพบ
        // ภาษาที่มีตัวอักษรกว้างหรือมีความซับซ้อนสูงควรมีค่า coefficient สูงกว่า
        const langCoeffs = LANGUAGE_COEFFICIENTS[detectedLanguage] || LANGUAGE_COEFFICIENTS.latin;
        let fontCoefficient = langCoeffs.width;
        let heightCoefficient = langCoeffs.height;
        
        // ตัวแปรเพื่อตรวจสอบว่าเป็นภาษาซับซ้อนหรือไม่
        const isComplexScript = ['arabic', 'hebrew', 'thai', 'japanese', 'chinese', 'korean'].includes(detectedLanguage);
        
        // สำหรับภาษาอาหรับและฮีบรู ใช้ค่าพิเศษ
        if (isRTL) {
          // ถ้าเป็นข้อความอาหรับหรือฮีบรูที่มีความยาวมากกว่า 10 ตัวอักษร
          if (text.length > 10) {
            // ลดขนาดฟอนต์ลงเพื่อป้องกันการล้น
            return Math.min(
              width / (longestLineLength * fontCoefficient * 1.2), // เพิ่มค่าเพื่อให้ขนาดฟอนต์เล็กลง
              height / (lineCount * heightCoefficient),
              textElement.fontSize || DEFAULT_FONT_SIZE
            );
          }
        }
        
        // สำหรับภาษาอื่นๆ ทำตามเดิม
        // ถ้าข้อความสั้นกว่า 20 ตัวอักษรและเป็นบรรทัดเดียว ใช้ fontSize ที่กำหนดไว้
        if (text.length < 20 && lineCount === 1 && !isRTL) {
          const definedFontSize = textElement.fontSize || DEFAULT_FONT_SIZE;
          
          // ตรวจสอบว่าขนาดฟอนต์ไม่เกินข้อจำกัดของกล่อง
          const maxWidthFontSize = width / (text.length * fontCoefficient);
          const maxHeightFontSize = height * 0.8;
          
          return Math.min(definedFontSize, maxWidthFontSize, maxHeightFontSize);
        }
        
        // คำนวณขนาดฟอนต์จากความกว้างของกล่อง โดยคำนึงถึงความยาวและความซับซ้อนของข้อความ
        let estimatedFontSizeByWidth = width / (Math.max(1, longestLineLength) * fontCoefficient);
        
        // ปรับลดขนาดฟอนต์ลงสำหรับภาษาที่ซับซ้อนหรือข้อความยาว
        if (isRTL || isComplexScript || longestLineLength > 30) {
          estimatedFontSizeByWidth *= 0.9; // ลดขนาดลงเล็กน้อย
        }
        
        // ลดขนาดฟอนต์ลงอีกสำหรับภาษาอาหรับที่มีข้อความยาว
        if (isRTL && text.length > 30) {
          estimatedFontSizeByWidth *= 0.8; // ลดลงอีก 20%
        }
        
        // คำนวณขนาดฟอนต์ตามความสูงของกล่อง (สำหรับข้อความหลายบรรทัด)
        const lineHeightMultiplier = isRTL ? 1.4 : (isComplexScript ? 1.3 : 1.2);
        const estimatedFontSizeByHeight = height / (lineCount * lineHeightMultiplier);
        
        // เลือกขนาดฟอนต์ที่เล็กกว่าระหว่างความกว้างและความสูง 
        const calculatedFontSize = Math.min(estimatedFontSizeByWidth, estimatedFontSizeByHeight);
        
        // จำกัดขนาดฟอนต์สำหรับข้อความยาวหรือหลายบรรทัด
        if (text.length > 80 || lineCount > 3 || isRTL || isComplexScript) {
          return Math.max(MIN_FONT_SIZE, Math.min(20, calculatedFontSize));
        }
        
        // จำกัดขนาดฟอนต์ให้อยู่ในช่วงที่กำหนด
        return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, calculatedFontSize));
      }, [element.width, element.height, text, textElement.fontSize, detectedLanguage, isRTL]);
      
      // เลือกใช้ขนาดฟอนต์ที่คำนวณได้หรือที่ผู้ใช้กำหนด
      // แก้ไข: กำหนดค่าฟอนต์ไซส์สูงสุดไม่เกิน element width/height เพื่อไม่ให้ล้นกรอบ
      // ปรับค่าสัมประสิทธิ์สำหรับภาษาที่ตัวอักษรมีขนาดใหญ่
      const isComplexScript = ['thai', 'japanese', 'chinese', 'korean'].includes(detectedLanguage);
      
      // กำหนดค่าสัมประสิทธิ์การจำกัดขนาดตามภาษา
      let maxSizeWidthRatio = isRTL ? 10 : (isComplexScript ? 6 : 4);
      let maxSizeHeightRatio = isRTL ? 0.35 : (isComplexScript ? 0.5 : 0.7);
      
      // สำหรับภาษาอาหรับและฮีบรู ปรับค่าเพิ่มเติมตามความยาวของข้อความ
      if (isRTL && text.length > 20) {
        maxSizeWidthRatio += 2; // เพิ่มขึ้นอีกเพื่อทำให้ฟอนต์ไซส์เล็กลง
        maxSizeHeightRatio -= 0.05; // ลดลงเพื่อให้ฟอนต์ไซส์เล็กลง
      }
      
      // ปรับค่าสัมประสิทธิ์ตามขนาดของกล่องและความยาวของข้อความ
      if (text.length > 50 || text.split('\n').length > 2) {
        maxSizeWidthRatio += 2; // เพิ่มอัตราส่วนความกว้างสำหรับข้อความยาว
        maxSizeHeightRatio -= 0.1; // ลดอัตราส่วนความสูงสำหรับข้อความยาว
      }
      
      // จำกัดขนาดฟอนต์ตามขนาดของกล่อง
      const maxAllowableFontSize = Math.min(
        element.width / maxSizeWidthRatio, 
        element.height * maxSizeHeightRatio,
        textElement.fontSize || MAX_FONT_SIZE // ให้คงขนาดฟอนต์ที่ผู้ใช้เลือกหากไม่เกินขอบเขต
      );
      
      // ถ้าขนาดฟอนต์ที่ผู้ใช้กำหนดมีค่ามากกว่าค่าที่คำนวณได้ ให้ใช้ค่าที่คำนวณได้แทน
      // เพื่อป้องกันข้อความล้นออกจากกรอบ
      const fontSize = textElement.fontSize 
        ? Math.min(textElement.fontSize, maxAllowableFontSize) 
        : Math.min(calculateFontSize, maxAllowableFontSize);
        
      // คำนวณความกว้างที่แท้จริงที่จะใช้ให้พอดีกับพื้นที่
      const effectiveWidth = Math.max(5, element.width);
      
      // ลดค่า padding ลงเพื่อให้กล่องข้อความเท่ากับข้อความจริง
      const textPadding = 0;
      
      return (
        <Text
          x={0}
          y={0}
          width={effectiveWidth}
          height={element.height}
          text={text}
          fontSize={fontSize}
          fontFamily={fontFamily}
          fill={textElement.fill || DEFAULT_TEXT_COLOR}
          align={textElement.align || (isRTL ? 'right' : DEFAULT_TEXT_ALIGN)}
          fontStyle={textElement.fontStyle || 'normal'}
          fontWeight={textElement.fontWeight || 'normal'}
          perfectDrawEnabled={false}
          listening={true}
          wrap="word"
          verticalAlign="middle"
          ellipsis={false}  // ปิดการตัดข้อความที่ยาวเกินไปด้วย ellipsis เพื่อให้แสดงข้อความเต็ม
          padding={0}  // ลบ padding เพื่อให้ข้อความพอดีกับกล่อง
          stroke="transparent"
          strokeWidth={0}
          direction={isRTL ? 'rtl' : 'ltr'}
          onDblClick={(e) => {
            console.log('Double-click detected on text element:', element.id);
            
            // เก็บ ID ของ element ที่กำลังแก้ไขในตัวแปร global
            (window as any).__editingTextId = element.id;
            
            // ทำให้ Konva stage ออก pointer events เพื่อให้สามารถแก้ไข input ได้
            if (e.target.getStage()) {
              const container = e.target.getStage().container();
              if (container) {
                container.style.pointerEvents = 'none';
              }
            }
            
            // ป้องกันการเลือก transformer และการทำงานอื่นๆ
            e.cancelBubble = true;
            
            // ส่งข้อมูลไปที่ handler ทันที
            setTimeout(() => {
              window.dispatchEvent(new Event('click'));
            }, 10); // เพิ่ม timeout เล็กน้อยเพื่อให้แน่ใจว่ากระบวนการอื่นทำงานเสร็จก่อน
          }}
        />
      );
    }
    case 'rect': {
      const rectElement = element as RectElement;
      return (
        <Rect
          x={0}
          y={0}
          width={element.width}
          height={element.height}
          fill={rectElement.fill || DEFAULT_RECT_FILL}
          stroke={rectElement.borderColor || DEFAULT_RECT_STROKE}
          strokeWidth={rectElement.borderWidth || DEFAULT_RECT_STROKE_WIDTH}
          strokeDashArray={rectElement.borderStyle === 'dashed' ? [10, 5] : 
                          rectElement.borderStyle === 'dotted' ? [2, 2] : undefined}
          cornerRadius={rectElement.cornerRadius}
          perfectDrawEnabled={false}
          listening={true}
        />
      );
    }
    case 'line': {
      const lineElement = element as LineElement;
      const strokeWidth = lineElement.height || lineElement.strokeWidth || DEFAULT_LINE_WIDTH;
      
      // เพิ่มพื้นที่สำหรับการคลิก โดยจะใช้ Rect ที่โปร่งใสและมีพื้นที่ใหญ่กว่าเส้นจริงเล็กน้อย
      const clickAreaHeight = Math.max(MIN_LINE_CLICK_AREA, strokeWidth);
      
      return (
        <Group>
          {/* เส้นจริงที่แสดง */}
          <Line
            x={0}
            y={(clickAreaHeight - strokeWidth) / 2}
            points={[0, 0, element.width, 0]}
            stroke={lineElement.fill || DEFAULT_LINE_COLOR}
            strokeWidth={strokeWidth}
            strokeDashArray={lineElement.strokeStyle === 'dashed' ? [10, 5] : 
                           lineElement.strokeStyle === 'dotted' ? [2, 2] : undefined}
            perfectDrawEnabled={false}
            listening={false} // เส้นจริงไม่รับการคลิก
          />
          
          {/* พื้นที่สำหรับคลิกที่มองไม่เห็น */}
          <Rect
            x={0}
            y={0}
            width={element.width}
            height={clickAreaHeight}
            fill="transparent"
            perfectDrawEnabled={false}
            listening={true} // รับการคลิกแทน
          />
        </Group>
      );
    }
    case 'ellipse': {
      const ellipseElement = element as EllipseElement;
      return (
        <Ellipse
          x={element.width / 2}
          y={element.height / 2}
          radiusX={element.width / 2}
          radiusY={element.height / 2}
          fill={ellipseElement.fill || DEFAULT_RECT_FILL}
          stroke={ellipseElement.borderColor || DEFAULT_RECT_STROKE}
          strokeWidth={ellipseElement.borderWidth || DEFAULT_RECT_STROKE_WIDTH}
          strokeDashArray={ellipseElement.borderStyle === 'dashed' ? [10, 5] : 
                          ellipseElement.borderStyle === 'dotted' ? [2, 2] : undefined}
          perfectDrawEnabled={false}
          listening={true}
        />
      );
    }
    case 'image': {
      // If there was an error loading the image, show a placeholder with error message
      if (imageLoadError) {
        return (
          <Group>
            <Rect
              x={0}
              y={0}
              width={element.width}
              height={element.height}
              fill="#f5f5f5"
              stroke="#ccc"
              strokeWidth={1}
              dash={[5, 5]}
              cornerRadius={2}
              perfectDrawEnabled={false}
              listening={true}
            />
            <Text
              x={0}
              y={0}
              width={element.width}
              height={element.height}
              text="⚠️ Image failed to load"
              fontSize={12}
              fontFamily="Arial"
              fill="#666"
              align="center"
              verticalAlign="middle"
              perfectDrawEnabled={false}
              listening={false}
            />
          </Group>
        );
      }
      
      return imageObj ? (
        <Image
          x={0}
          y={0}
          width={element.width}
          height={element.height}
          image={imageObj}
          perfectDrawEnabled={false}
          listening={true}
        />
      ) : (
        <Rect
          x={0}
          y={0}
          width={element.width}
          height={element.height}
          fill="#f0f0f0"
          stroke="#d9d9d9"
          perfectDrawEnabled={false}
          listening={true}
        />
      );
    }
    case 'qr': {
      const qrElement = element as QrElement;
      // Use pre-generated image if available
      const qrImage = qrImages[element.id];
      if (qrImage) {
        return (
          <Image
            x={0}
            y={0}
            width={element.width}
            height={element.height}
            image={qrImage}
            perfectDrawEnabled={false}
            listening={true}
          />
        );
      }
      
      // Otherwise use data URL if available
      const dataUrl = qrDataUrls[element.id];
      if (dataUrl) {
        const img = new window.Image();
        img.src = dataUrl;
        return (
          <Image
            x={0}
            y={0}
            width={element.width}
            height={element.height}
            image={img}
            perfectDrawEnabled={false}
            listening={true}
          />
        );
      }
      
      // Fallback
      return (
        <Rect
          x={0}
          y={0}
          width={element.width}
          height={element.height}
          fill="#f0f0f0"
          stroke="#d9d9d9"
          perfectDrawEnabled={false}
          listening={true}
        />
      );
    }
    case 'barcode': {
      const barcodeElement = element as BarcodeElement;
      
      // Use ref to store previous values and compare
      const prevValueRef = useRef(barcodeElement.value);
      const prevDisplayValueRef = useRef(barcodeElement.displayValue);
      const prevFontSizeRef = useRef(barcodeElement.fontSize);
      const prevFontFamilyRef = useRef(barcodeElement.fontFamily);
      const prevFormatRef = useRef(barcodeElement.format);
      
      // Force barcode regeneration if properties changed
      useEffect(() => {
        // Check if values actually changed
        const valueChanged = prevValueRef.current !== barcodeElement.value;
        const displayValueChanged = prevDisplayValueRef.current !== barcodeElement.displayValue;
        const fontSizeChanged = prevFontSizeRef.current !== barcodeElement.fontSize;
        const fontFamilyChanged = prevFontFamilyRef.current !== barcodeElement.fontFamily;
        const formatChanged = prevFormatRef.current !== barcodeElement.format;
        
        // Only update if something actually changed
        if (valueChanged || displayValueChanged || fontSizeChanged || fontFamilyChanged || formatChanged) {
          // Update refs to current values
          prevValueRef.current = barcodeElement.value;
          prevDisplayValueRef.current = barcodeElement.displayValue;
          prevFontSizeRef.current = barcodeElement.fontSize;
          prevFontFamilyRef.current = barcodeElement.fontFamily;
          prevFormatRef.current = barcodeElement.format;
          
          if (updateBarcodeDataUrl) {
            updateBarcodeDataUrl(barcodeElement);
          }
        }
      }, [barcodeElement.value, barcodeElement.displayValue, barcodeElement.fontSize, barcodeElement.fontFamily, barcodeElement.format, updateBarcodeDataUrl]);
      
      // Use pre-generated image if available
      const barcodeImage = barcodeImages[element.id];
      if (barcodeImage) {
        return (
          <Image
            x={0}
            y={0}
            width={element.width}
            height={element.height}
            image={barcodeImage}
            perfectDrawEnabled={false}
            listening={true}
          />
        );
      }
      
      // Otherwise use data URL if available
      const dataUrl = barcodeDataUrls[element.id];
      if (dataUrl) {
        const img = new window.Image();
        img.src = dataUrl;
        return (
          <Image
            x={0}
            y={0}
            width={element.width}
            height={element.height}
            image={img}
            perfectDrawEnabled={false}
            listening={true}
          />
        );
      }
      
      // Fallback
      return (
        <Rect
          x={0}
          y={0}
          width={element.width}
          height={element.height}
          fill="#f0f0f0"
          stroke="#d9d9d9"
          perfectDrawEnabled={false}
          listening={true}
        />
      );
    }
    case 'group': {
      const groupElement = element as GroupElement;
      return (
        <Group>
          {/* Render each child element */}
          {groupElement.elements?.map((childElement) => (
            <Group 
              key={childElement.id} 
              x={childElement.x} 
              y={childElement.y}
            >
              <ElementRenderer 
                element={childElement}
                qrDataUrls={qrDataUrls}
                qrImages={qrImages}
                barcodeDataUrls={barcodeDataUrls}
                barcodeImages={barcodeImages}
                isSelected={false}
              />
            </Group>
          ))}
          
          {/* Show dashed border around group when selected */}
          {isSelected && (
            <Rect
              x={0}
              y={0}
              width={element.width}
              height={element.height}
              stroke="#1890ff"
              strokeWidth={1}
              dash={[4, 4]}
              fill="transparent"
              listening={false}
            />
          )}
        </Group>
      );
    }
    default:
      return null;
  }
}; 