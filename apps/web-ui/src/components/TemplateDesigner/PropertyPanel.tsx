import React from 'react';
import { Card, Form, Input, Select, Switch, Slider, InputNumber, Button, Row, Col, Space, Divider, Tooltip } from 'antd';
import { 
  AlignLeftOutlined, 
  AlignCenterOutlined, 
  AlignRightOutlined, 
  BoldOutlined, 
  ItalicOutlined, 
  DeleteOutlined, 
  LockOutlined, 
  UnlockOutlined, 
  EyeOutlined, 
  EyeInvisibleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
  BgColorsOutlined,
  SyncOutlined,
  UpOutlined,
  DownOutlined
} from '@ant-design/icons';
import { SketchPicker } from 'react-color';
import { ElementType } from '../../models/TemplateDesignerTypes';
import { message } from 'antd';

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

// Font families
const FONT_FAMILIES = [
  'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 
  'Verdana', 'Georgia', 'Tahoma', 'Trebuchet MS'
];

// Language-specific font families
const LANGUAGE_FONTS = {
  latin: ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Tahoma', 'Trebuchet MS'],
  arabic: ['Arial', 'Amiri', 'Scheherazade New', 'Traditional Arabic', 'Simplified Arabic'],
  hebrew: ['Arial', 'David', 'Times New Roman', 'Arial Hebrew', 'Narkisim'],
  thai: ['Tahoma', 'Sarabun', 'TH Sarabun New', 'Angsana New', 'Cordia New'],
  japanese: ['Meiryo', 'MS Gothic', 'Yu Gothic', 'HiraKaku', 'Osaka'],
  chinese: ['SimSun', 'Microsoft YaHei', 'NSimSun', 'KaiTi', 'SimHei'],
  korean: ['Malgun Gothic', 'Dotum', 'Batang', 'Gulim', 'GulimChe']
};

// Function to get fonts for detected language
const getFontsForLanguage = (text: string): string[] => {
  const lang = detectLanguage(text);
  
  // Return language-specific fonts and add common fonts
  const specificFonts = LANGUAGE_FONTS[lang] || [];
  
  // Create a unique set of fonts by combining language-specific fonts with common fonts
  // Filter out duplicates
  const allFonts = [...specificFonts, ...FONT_FAMILIES];
  return [...new Set(allFonts)]; // Remove duplicates
};

// Barcode formats
const BARCODE_FORMATS = [
  'CODE128', 'CODE39', 'EAN13', 'EAN8', 'UPC', 'ITF14', 'ITF', 'MSI', 'Pharmacode'
];

// Border styles
const BORDER_STYLES = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'none', label: 'None' }
];

interface PropertyPanelProps {
  selectedElement: ElementType | null;
  elements: ElementType[];
  updateElementProperty: (id: string, property: string, value: any) => void;
  deleteElement: (id: string) => void;
  moveElementToTop: (id: string) => void;
  moveElementUp: (id: string) => void;
  moveElementDown: (id: string) => void;
  moveElementToBottom: (id: string) => void;
  updateQrDataUrl?: (element: any) => void;
  updateBarcodeDataUrl?: (element: any) => void;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedElement,
  elements,
  updateElementProperty,
  deleteElement,
  moveElementToTop,
  moveElementUp,
  moveElementDown,
  moveElementToBottom,
  updateQrDataUrl,
  updateBarcodeDataUrl
}) => {
  const [colorPickerVisible, setColorPickerVisible] = React.useState(false);
  const [borderColorPickerVisible, setBorderColorPickerVisible] = React.useState(false);
  const [property, setProperty] = React.useState<string>('');
  
  // Reset color picker visibility when element changes
  React.useEffect(() => {
    setColorPickerVisible(false);
    setBorderColorPickerVisible(false);
  }, [selectedElement?.id]);
  
  if (!selectedElement) {
    return (
      <Card title="Properties" className="element-properties-panel" style={{ padding: '8px' }}>
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          Select an element to edit its properties
        </div>
      </Card>
    );
  }

  // ฟังก์ชันสำหรับรวบรวมข้อความจาก text elements และอัปเดต QR code
  const syncQrWithTextElements = () => {
    if (!selectedElement || selectedElement.type !== 'qr') return;
    
    // กรองเฉพาะ text elements
    const textElements = elements.filter(el => el.type === 'text');
    
    if (textElements.length === 0) {
      message.info('No text found on canvas');
      return;
    }
    
    // รวบรวมข้อความจากทุก text element โดยไม่แสดงชื่อ element
    const collectedText = textElements.map(el => {
      let elementText = el.text || '';
      if (elementText) {
        return elementText; // แสดงเฉพาะข้อความ ไม่มีชื่อ element
      }
      return '';
    }).filter(text => text !== '').join('\n\n');
    
    // อัปเดต QR code value
    updateElementProperty(selectedElement.id, 'value', collectedText);
    
    // อัปเดต QR code data URL ถ้ามีฟังก์ชันนี้
    if (updateQrDataUrl) {
      // สร้าง element object ที่มี value ใหม่
      const updatedElement = {
        ...selectedElement,
        value: collectedText
      };
      updateQrDataUrl(updatedElement);
    }
    
    message.success('QR code updated successfully');
  };

  // Function to update element property
  const handlePropertyChange = (property: string, value: any) => {
    if (selectedElement) {
      // ถ้ามีการแก้ไขขนาดฟอนต์โดยตรง (property === 'fontSize')
      if (property === 'fontSize' && selectedElement.type === 'text') {
        // ตรวจสอบว่า value ไม่ใช่ null และเป็นตัวเลข
        if (value !== null && !isNaN(value)) {
          const textElement = selectedElement as any; // เป็น TextElement
          const text = textElement.text || '';
          
          // กำหนดฟอนต์ไซส์ขั้นต่ำ สำหรับภาษาอาราบิกคือ 14 ส่วนภาษาอื่นๆ คือ 12
          const detectedLanguage = detectLanguage(text);
          const isRTL = ['arabic', 'hebrew'].includes(detectedLanguage);
          const minFontSize = isRTL ? 14 : 12;
          
          // จำกัดฟอนต์ไซส์ให้อยู่ในช่วง 12-72
          const fontSize = Math.round(Math.max(minFontSize, Math.min(72, value)));
          
          // นับจำนวนบรรทัดและหาความยาวบรรทัดที่ยาวที่สุด
          const lines = text.split('\n');
          const lineCount = lines.length || 1;
          const longestLineLength = Math.max(...lines.map(line => line.length));
          
          // คำนวณความยาวต่อบรรทัดที่เหมาะสมสำหรับฟอนต์ไซส์ใหม่
          // ยิ่งฟอนต์ใหญ่ ยิ่งจำกัดตัวอักษรต่อบรรทัดให้น้อยลง
          const fontSizeAdjustment = Math.max(1, Math.floor(fontSize / 14)); 
          
          // ปรับจำนวนตัวอักษรต่อบรรทัดตามขนาดฟอนต์
          // สำหรับฟอนต์ขนาดใหญ่ (>30) จำกัดให้น้อยกว่า 20 ตัวอักษรต่อบรรทัด
          // สำหรับฟอนต์ขนาดกลาง (20-30) จำกัดประมาณ 30 ตัวอักษรต่อบรรทัด
          // สำหรับฟอนต์ขนาดเล็ก (<20) อนุญาตให้มากกว่า 40 ตัวอักษรต่อบรรทัด
          let maxCharsPerLine: number;
          
          if (fontSize > 30) {
            maxCharsPerLine = isRTL ? 15 : 20;
          } else if (fontSize > 20) {
            maxCharsPerLine = isRTL ? 20 : 30;
          } else {
            maxCharsPerLine = isRTL ? 25 : 40;
          }
          
          // ตรวจสอบว่าต้องตัดบรรทัดใหม่หรือไม่
          let formattedText = text;
          let newLineCount = lineCount;
          
          // แบ่งข้อความเป็นบรรทัดใหม่ถ้าบรรทัดยาวเกินไป
          if (longestLineLength > maxCharsPerLine) {
            const newLines = [];
            
            for (const line of lines) {
              if (line.length <= maxCharsPerLine) {
                newLines.push(line);
              } else {
                // แบ่งบรรทัดที่ยาวเกินให้สั้นลง
                let remainingText = line;
                
                while (remainingText.length > 0) {
                  let breakPoint = Math.min(maxCharsPerLine, remainingText.length);
                  
                  // พยายามตัดที่ช่องว่างเพื่อไม่ให้ตัดกลางคำ
                  if (breakPoint < remainingText.length) {
                    let spacePos = remainingText.lastIndexOf(' ', breakPoint);
                    if (spacePos > breakPoint / 2) { // ถ้าพบช่องว่างที่ไม่ไกลเกินไป
                      breakPoint = spacePos;
                    }
                  }
                  
                  newLines.push(remainingText.substring(0, breakPoint));
                  remainingText = remainingText.substring(breakPoint).trimStart();
                  
                  if (remainingText.length > 0) {
                    newLineCount++;
                  }
                }
              }
            }
            
            formattedText = newLines.join('\n');
          }
          
          // คำนวณขนาดกล่องที่เหมาะสมสำหรับข้อความและฟอนต์ไซส์
          // ปรับลดค่าสัมประสิทธิ์ width ให้น้อยลงเพื่อให้ฟอนต์มีขนาดใหญ่ขึ้น
          const fontCoefficient = {
            arabic: { width: 1.0, height: 1.6 },
            hebrew: { width: 0.9, height: 1.6 },
            thai: { width: 0.8, height: 1.5 },
            japanese: { width: 1.0, height: 1.5 },
            chinese: { width: 1.0, height: 1.5 },
            korean: { width: 1.0, height: 1.5 },
            latin: { width: 0.7, height: 1.3 },
          }[detectedLanguage] || { width: 0.7, height: 1.3 };
          
          let widthCoefficient = fontCoefficient.width;
          
          // สำหรับฟอนต์ขนาดใหญ่ ให้ลดค่าสัมประสิทธิ์ลงเพื่อให้พื้นที่มากขึ้น
          if (fontSize > 30) {
            widthCoefficient *= 0.8;
          } else if (fontSize > 20) {
            widthCoefficient *= 0.9;
          }
          
          // คำนวณความสูงต่อบรรทัด
          const lineHeight = fontSize * fontCoefficient.height;
          
          // กำหนดค่าแนวทางการคำนวณจากพารามิเตอร์ต่างๆ
          const CANVAS_PADDING = 20; // padding จากขอบ canvas
          const CANVAS_WIDTH = window.innerWidth * 0.6; // ประมาณการขนาด canvas
          const CANVAS_HEIGHT = window.innerHeight * 0.6;
          const MAX_BOX_WIDTH = CANVAS_WIDTH - (CANVAS_PADDING * 2); // ความกว้างสูงสุดของกล่อง
          const MAX_BOX_HEIGHT = CANVAS_HEIGHT - (CANVAS_PADDING * 2); // ความสูงสูงสุดของกล่อง
          
          // คำนวณความกว้างและความสูงใหม่ โดยไม่เพิ่ม padding มากเกินไป
          let newWidth, newHeight;
          
          // คำนวณความกว้าง
          if (isRTL) {
            // สำหรับภาษาอาราบิก เพิ่มความกว้างให้มากขึ้นเพื่อรองรับความซับซ้อน
            // แต่ไม่เกิน 60% เพื่อไม่ให้กว้างเกินไป
            const baseWidth = Math.max(fontSize * 3, longestLineLength * fontSize * widthCoefficient);
            newWidth = Math.min(MAX_BOX_WIDTH, baseWidth * 1.2); // เพิ่มอีก 20% สำหรับ RTL
          } else {
            // สำหรับภาษาอื่นๆ
            newWidth = Math.min(
              MAX_BOX_WIDTH,
              Math.max(fontSize * 3, longestLineLength * fontSize * widthCoefficient)
            );
          }
          
          // คำนวณความสูง
          newHeight = Math.min(
            MAX_BOX_HEIGHT,
            Math.max(fontSize * 1.5, newLineCount * lineHeight)
          );
          
          // ไม่เพิ่ม padding มากเกินไป
          // ใช้เพียงค่าน้อยๆ เพื่อให้มีพื้นที่ระหว่างขอบกับข้อความ
          const widthPadding = fontSize * 0.2;
          const heightPadding = fontSize * 0.1;
          
          newWidth += widthPadding;
          newHeight += heightPadding;
          
          // ปัดค่าเป็นเลขจำนวนเต็ม
          newWidth = Math.round(newWidth);
          newHeight = Math.round(newHeight);
          
          // สร้างอ็อบเจกต์เพื่อเก็บคุณสมบัติที่จะอัปเดต
          const updatedProperties: any = {
            fontSize,
            text: formattedText,
            width: newWidth,
            height: newHeight
          };
          
          // ตรวจสอบตำแหน่งปัจจุบันของกล่องข้อความ
          const currentX = selectedElement.x || 0;
          const currentY = selectedElement.y || 0;
          
          // คำนวณตำแหน่งสูงสุดที่อนุญาตให้กล่องอยู่เพื่อไม่ให้เกิน canvas
          const maxX = MAX_BOX_WIDTH - newWidth - CANVAS_PADDING;
          const maxY = MAX_BOX_HEIGHT - newHeight - CANVAS_PADDING;
          
          // ปรับตำแหน่ง x, y ถ้าจำเป็น
          if (currentX > maxX) {
            updatedProperties.x = Math.max(CANVAS_PADDING, maxX);
          }
          
          if (currentY > maxY) {
            updatedProperties.y = Math.max(CANVAS_PADDING, maxY);
          }
          
          // สำหรับภาษา RTL ให้จัดตำแหน่งข้อความเป็น right โดยอัตโนมัติถ้ายังไม่ได้ตั้งค่า
          if (isRTL && (!textElement.align || textElement.align === 'left')) {
            updatedProperties.align = 'right';
          }
          
          // อัปเดตคุณสมบัติทั้งหมดในครั้งเดียว
          Object.entries(updatedProperties).forEach(([prop, val]) => {
            updateElementProperty(selectedElement.id, prop, val);
          });
        }
      } else {
        // สำหรับการแก้ไขคุณสมบัติอื่นๆ ที่ไม่ใช่ fontSize หรือเป็น element ประเภทอื่น
        updateElementProperty(selectedElement.id, property, value);
      }
    }
  };

  // Handle text alignment change
  const handleAlignChange = (align: string) => {
    handlePropertyChange('align', align);
  };
  
  // Handle font style change locally
  const handleFontStyleChange = (style: string) => {
    if (selectedElement.type === 'text') {
      const currentStyle = selectedElement.fontStyle || 'normal';
      const newStyle = currentStyle === style ? 'normal' : style;
      handlePropertyChange('fontStyle', newStyle);
    }
  };
  
  // Handle font weight change
  const handleFontWeightChange = () => {
    if (selectedElement.type === 'text') {
      const currentWeight = selectedElement.fontWeight || 'normal';
      const newWeight = currentWeight === 'bold' ? 'normal' : 'bold';
      handlePropertyChange('fontWeight', newWeight);
    }
  };
  
  // Handle color change
  const handleColorChange = (color: any) => {
    if (selectedElement && property) {
      // แก้ไขให้สามารถรับรูปแบบสีที่หลากหลายได้
      if (typeof color === 'string') {
        // กรณีที่ส่งค่าสีมาเป็น string เช่น "#ff0000"
        handlePropertyChange(property, color);
      } else if (color && color.hex) {
        // กรณีที่ส่งค่าสีมาจาก color picker เป็น object ที่มี hex
        handlePropertyChange(property, color.hex);
      } else if (color && color.rgb) {
        // กรณีที่ส่งค่าเป็น rgba
        const { r, g, b, a } = color.rgb;
        if (a !== 1) {
          // ถ้ามีค่า alpha ให้แปลงเป็นรูปแบบ rgba
          handlePropertyChange(property, `rgba(${r}, ${g}, ${b}, ${a})`);
        } else {
          // ถ้าไม่มี alpha ให้ใช้ hexadecimal แทน
          handlePropertyChange(property, color.hex);
        }
      }
    }
  };

  // Handle border color change
  const handleBorderColorChange = (color: any) => {
    if (selectedElement) {
      if (typeof color === 'string') {
        handlePropertyChange('borderColor', color);
      } else if (color && color.hex) {
        handlePropertyChange('borderColor', color.hex);
      }
    }
  };

  // Render border properties
  const renderBorderProperties = () => {
    // Only show border properties for rect and ellipse elements, ไม่รวม text element
    if (!['rect', 'ellipse'].includes(selectedElement.type)) {
      return null;
    }
    
    return (
      <>
        <Divider orientation="left" style={{ margin: '8px 0' }}>Border</Divider>
        <Form.Item label="Border Width" style={{ marginBottom: '8px' }}>
          <InputNumber
            value={selectedElement.borderWidth || 0}
            onChange={value => handlePropertyChange('borderWidth', value)}
            min={0}
            max={20}
            style={{ width: '100%' }}
          />
        </Form.Item>
        
        <Form.Item label="Border Style" style={{ marginBottom: '8px' }}>
          <Select
            value={selectedElement.borderStyle || 'solid'}
            onChange={value => handlePropertyChange('borderStyle', value)}
            style={{ width: '100%' }}
            options={BORDER_STYLES}
          />
        </Form.Item>
        
        <Form.Item label="Border Color" style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                backgroundColor: selectedElement.borderColor || '#000000',
                cursor: 'pointer',
                border: '1px solid #d9d9d9',
                borderRadius: '2px'
              }}
              onClick={() => {
                setBorderColorPickerVisible(!borderColorPickerVisible);
                setProperty('borderColor');
                setColorPickerVisible(false);
              }}
            />
            <Input
              value={selectedElement.borderColor || '#000000'}
              onChange={e => handlePropertyChange('borderColor', e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          {borderColorPickerVisible && property === 'borderColor' && (
            <div style={{ position: 'absolute', zIndex: 999 }}>
              <div
                style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1 }}
                onClick={() => setBorderColorPickerVisible(false)}
              />
              <div style={{ position: 'relative', zIndex: 2 }}>
                <SketchPicker
                  color={selectedElement.borderColor || '#000000'}
                  onChange={handleBorderColorChange}
                  disableAlpha={false}
                />
              </div>
            </div>
          )}
        </Form.Item>
      </>
    );
  };
  
  // Render different property panels based on element type
  const renderSpecificProperties = () => {
    if (!selectedElement) return null;

    // Get type-specific properties
    switch (selectedElement.type) {
      case 'text': {
        const textElement = selectedElement as any;
        const text = textElement.text || '';
        
        // Detect language and get appropriate fonts
        const detectedLanguage = detectLanguage(text);
        const suggestedFonts = getFontsForLanguage(text);
        const isRTL = ['arabic', 'hebrew'].includes(detectedLanguage);
        
        return (
          <>
            <Form.Item label="Text Content">
              <Input.TextArea
                value={text}
                onChange={(e) => handlePropertyChange('text', e.target.value)}
                rows={4}
                style={{ 
                  fontFamily: textElement.fontFamily || 'Arial',
                  fontSize: `${Math.min(16, textElement.fontSize || 14)}px`,
                  direction: isRTL ? 'rtl' : 'ltr'
                }}
              />
            </Form.Item>
            
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="Font Size">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <InputNumber
                      min={12}
                      max={72}
                      step={1}
                      precision={0}
                      formatter={value => `${value}`}
                      parser={value => value ? parseInt(value.toString()) : 12}
                      value={textElement.fontSize || 16}
                      onChange={(value) => {
                        if (value !== null && !isNaN(value)) {
                          handlePropertyChange('fontSize', value);
                        }
                      }}
                      style={{ width: '100%' }}
                      controls={false} // ซ่อนปุ่มเพิ่ม-ลดในช่อง InputNumber
                    />
                    <div style={{ marginLeft: '8px', display: 'flex', flexDirection: 'column' }}>
                      <Button
                        size="small"
                        icon={<UpOutlined />}
                        onClick={() => {
                          const currentSize = textElement.fontSize || 16;
                          const newSize = Math.min(72, currentSize + 1);
                          handlePropertyChange('fontSize', newSize);
                        }}
                        style={{ marginBottom: '4px' }}
                      />
                      <Button
                        size="small"
                        icon={<DownOutlined />}
                        onClick={() => {
                          const currentSize = textElement.fontSize || 16;
                          const newSize = Math.max(12, currentSize - 1);
                          handlePropertyChange('fontSize', newSize);
                        }}
                      />
                    </div>
                  </div>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Font Family">
                  <Select
                    value={textElement.fontFamily || 'Arial'}
                    onChange={(value) => handlePropertyChange('fontFamily', value)}
                    style={{ width: '100%' }}
                    options={suggestedFonts.map(font => ({ 
                      value: font, 
                      label: <span style={{ fontFamily: font }}>{font}</span> 
                    }))}
                    showSearch
                    placeholder="Select a font"
                    optionFilterProp="children"
                    filterOption={(input, option) => 
                      (option?.label as any)?.props?.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                    }
                  />
                </Form.Item>
              </Col>
            </Row>
            
            <Form.Item label="Color">
              <div style={{ position: 'relative' }}>
                <div 
                  style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <div
                    style={{ 
                      background: textElement.fill || '#000000', 
                      width: '36px', 
                      height: '36px', 
                      borderRadius: '2px',
                      cursor: 'pointer',
                      border: '1px solid #d9d9d9'
                    }}
                    onClick={() => {
                      setProperty('fill');
                      setColorPickerVisible(!colorPickerVisible);
                      setBorderColorPickerVisible(false);
                    }}
                  />
                  <Input
                    value={textElement.fill || '#000000'}
                    onChange={(e) => handlePropertyChange('fill', e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                
                {colorPickerVisible && property === 'fill' && (
                  <div style={{ 
                    position: 'absolute', 
                    zIndex: 999,  // เพิ่ม z-index ให้สูงขึ้น
                    top: '40px',
                    left: '0'
                  }}>
                    <div 
                      style={{ 
                        position: 'fixed', 
                        top: '0', 
                        right: '0', 
                        bottom: '0', 
                        left: '0',
                        zIndex: 1 
                      }}
                      onClick={() => setColorPickerVisible(false)}
                    />
                    <div style={{ position: 'relative', zIndex: 2 }}>
                      <SketchPicker
                        color={textElement.fill || '#000000'}
                        onChange={handleColorChange}
                        disableAlpha={false}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Form.Item>
            
            <Form.Item label="Alignment">
              <Button.Group>
                <Tooltip title="Align Left">
                  <Button
                    type={textElement.align === 'left' ? 'primary' : 'default'}
                    icon={<AlignLeftOutlined />}
                    onClick={() => handleAlignChange('left')}
                  />
                </Tooltip>
                <Tooltip title="Align Center">
                  <Button
                    type={textElement.align === 'center' ? 'primary' : 'default'}
                    icon={<AlignCenterOutlined />}
                    onClick={() => handleAlignChange('center')}
                  />
                </Tooltip>
                <Tooltip title="Align Right">
                  <Button
                    type={textElement.align === 'right' ? 'primary' : 'default'}
                    icon={<AlignRightOutlined />}
                    onClick={() => handleAlignChange('right')}
                  />
                </Tooltip>
                
                <Tooltip title={textElement.fontWeight === 'bold' ? 'Normal Weight' : 'Bold'}>
                  <Button
                    type={textElement.fontWeight === 'bold' ? 'primary' : 'default'}
                    icon={<BoldOutlined />}
                    onClick={handleFontWeightChange}
                  />
                </Tooltip>
                <Tooltip title={textElement.fontStyle === 'italic' ? 'Normal Style' : 'Italic'}>
                  <Button
                    type={textElement.fontStyle === 'italic' ? 'primary' : 'default'}
                    icon={<ItalicOutlined />}
                    onClick={() => handleFontStyleChange('italic')}
                  />
                </Tooltip>
              </Button.Group>
            </Form.Item>
            
            {/* For RTL languages, show direction toggle */}
            {detectedLanguage === 'arabic' || detectedLanguage === 'hebrew' ? (
              <Form.Item label="Text Direction">
                <Select
                  value={textElement.direction || (isRTL ? 'rtl' : 'ltr')}
                  onChange={(value) => handlePropertyChange('direction', value)}
                  options={[
                    { value: 'rtl', label: 'Right to Left (RTL)' },
                    { value: 'ltr', label: 'Left to Right (LTR)' }
                  ]}
                />
              </Form.Item>
            ) : null}
          </>
        );
      }
      
      case 'rect':
        return (
          <>
            <Divider orientation="left" style={{ margin: '8px 0' }}>Rectangle</Divider>
            <Form.Item label="Background Color" style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    backgroundColor: selectedElement.fill || '#e0e0e0',
                    cursor: 'pointer',
                    border: '1px solid #d9d9d9',
                    borderRadius: '2px'
                  }}
                  onClick={() => {
                    setColorPickerVisible(!colorPickerVisible);
                    setProperty('fill');
                    setBorderColorPickerVisible(false);
                  }}
                />
                <Input
                  value={selectedElement.fill || '#e0e0e0'}
                  onChange={e => handlePropertyChange('fill', e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              {colorPickerVisible && property === 'fill' && (
                <div style={{ position: 'absolute', zIndex: 999 }}>
                  <div
                    style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1 }}
                    onClick={() => setColorPickerVisible(false)}
                  />
                  <div style={{ position: 'relative', zIndex: 2 }}>
                    <SketchPicker
                      color={selectedElement.fill || '#e0e0e0'}
                      onChange={handleColorChange}
                      disableAlpha={false}
                    />
                  </div>
                </div>
              )}
            </Form.Item>
            {selectedElement.type === 'rect' && (
              <Form.Item label="Corner Radius" style={{ marginBottom: '8px' }}>
                <InputNumber
                  value={selectedElement.cornerRadius || 0}
                  onChange={value => handlePropertyChange('cornerRadius', value)}
                  min={0}
                  max={100}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            )}
          </>
        );
        
      case 'line':
        return (
          <>
            <Divider orientation="left" style={{ margin: '8px 0' }}>Line</Divider>
            <Form.Item label="Color" style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    backgroundColor: selectedElement.fill || '#000000',
                    cursor: 'pointer',
                    border: '1px solid #d9d9d9',
                    borderRadius: '2px',
                    marginRight: '8px'
                  }}
                  onClick={() => {
                    setColorPickerVisible(!colorPickerVisible);
                    setProperty('fill');
                  }}
                />
                <Input
                  value={selectedElement.fill || '#000000'}
                  onChange={e => handlePropertyChange('fill', e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              {colorPickerVisible && property === 'fill' && (
                <div style={{ position: 'absolute', zIndex: 2 }}>
                  <div
                    style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
                    onClick={() => setColorPickerVisible(false)}
                  />
                  <SketchPicker
                    color={selectedElement.fill || '#000000'}
                    onChange={handleColorChange}
                  />
                </div>
              )}
            </Form.Item>
            <Form.Item label="Thickness" style={{ marginBottom: '8px' }}>
              <InputNumber
                value={selectedElement.height || selectedElement.strokeWidth || 2}
                onChange={value => {
                  // อัพเดททั้ง height (สำหรับความสูงของเส้น) และ strokeWidth (สำหรับความหนาของเส้น)
                  handlePropertyChange('height', value);
                  handlePropertyChange('strokeWidth', value);
                }}
                min={1}
                max={20}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label="Line Style" style={{ marginBottom: '8px' }}>
              <Select
                value={selectedElement.strokeStyle || 'solid'}
                onChange={value => handlePropertyChange('strokeStyle', value)}
                style={{ width: '100%' }}
              >
                <Select.Option value="solid">Solid</Select.Option>
                <Select.Option value="dashed">Dashed</Select.Option>
                <Select.Option value="dotted">Dotted</Select.Option>
              </Select>
            </Form.Item>
          </>
        );
        
      case 'barcode':
        return (
          <>
            <Divider orientation="left" style={{ margin: '8px 0' }}>Barcode</Divider>
            <Form.Item label="Value" style={{ marginBottom: '8px' }}>
              <Input
                value={selectedElement.value || ''}
                onChange={e => handlePropertyChange('value', e.target.value)}
                placeholder="Enter barcode value"
              />
            </Form.Item>
            <Form.Item label="Format" style={{ marginBottom: '8px' }}>
              <Select
                value={selectedElement.format || 'CODE128'}
                onChange={value => handlePropertyChange('format', value)}
                style={{ width: '100%' }}
              >
                {BARCODE_FORMATS.map(format => (
                  <Select.Option key={format} value={format}>
                    {format}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Display Value" style={{ marginBottom: '8px' }}>
              <Switch
                checked={selectedElement.displayValue !== false}
                onChange={value => {
                  // เจาะจงส่งค่า boolean ไม่ใช่ string "true"/"false"
                  handlePropertyChange('displayValue', value === true);
                }}
              />
            </Form.Item>
            {selectedElement.displayValue !== false && (
              <>
                <Form.Item label="Font Size" style={{ marginBottom: '8px' }}>
                  <InputNumber
                    value={selectedElement.fontSize || 14}
                    onChange={value => handlePropertyChange('fontSize', value)}
                    min={8}
                    max={36}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Form.Item label="Font Family" style={{ marginBottom: '8px' }}>
                  <Select
                    value={selectedElement.fontFamily || 'monospace'}
                    onChange={value => handlePropertyChange('fontFamily', value)}
                    style={{ width: '100%' }}
                  >
                    {FONT_FAMILIES.map(font => (
                      <Select.Option key={font} value={font}>
                        <span style={{ fontFamily: font }}>{font}</span>
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item label="Text Position" style={{ marginBottom: '8px' }}>
                  <Select
                    value={selectedElement.textPosition || 'bottom'}
                    onChange={value => handlePropertyChange('textPosition', value)}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="bottom">Bottom</Select.Option>
                    <Select.Option value="top">Top</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item label="Text Margin" style={{ marginBottom: '8px' }}>
                  <InputNumber
                    value={selectedElement.textMargin || 2}
                    onChange={value => handlePropertyChange('textMargin', value)}
                    min={1}
                    max={10}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </>
            )}
            <Form.Item label="Line Color" style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    backgroundColor: selectedElement.fill || '#000000',
                    cursor: 'pointer',
                    border: '1px solid #d9d9d9',
                    borderRadius: '2px',
                    marginRight: '8px'
                  }}
                  onClick={() => {
                    setColorPickerVisible(!colorPickerVisible);
                    setProperty('fill');
                  }}
                />
                <Input
                  value={selectedElement.fill || '#000000'}
                  onChange={e => handlePropertyChange('fill', e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              {colorPickerVisible && property === 'fill' && (
                <div style={{ position: 'absolute', zIndex: 2 }}>
                  <div
                    style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
                    onClick={() => setColorPickerVisible(false)}
                  />
                  <SketchPicker
                    color={selectedElement.fill || '#000000'}
                    onChange={handleColorChange}
                  />
                </div>
              )}
            </Form.Item>
          </>
        );
        
      case 'qr':
        return (
          <>
            <Divider orientation="left" style={{ margin: '8px 0' }}>QR Code</Divider>
            <Form.Item label="Value" style={{ marginBottom: '8px' }}>
              <Input.TextArea
                value={selectedElement.value || ''}
                onChange={e => handlePropertyChange('value', e.target.value)}
                rows={2}
              />
            </Form.Item>
            
            {/* เปลี่ยนปุ่ม Sync Data เป็นภาษาอังกฤษ */}
            <Form.Item style={{ marginBottom: '16px' }}>
              <Button 
                type="primary"
                onClick={syncQrWithTextElements}
                icon={<SyncOutlined />}
                style={{ width: '100%' }}
              >
                Sync All Text Content
              </Button>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                Import all text content from canvas to QR code
              </div>
            </Form.Item>
            
            <Form.Item label="Color" style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    backgroundColor: selectedElement.fill || '#000000',
                    cursor: 'pointer',
                    border: '1px solid #d9d9d9',
                    borderRadius: '2px',
                    marginRight: '8px'
                  }}
                  onClick={() => {
                    setColorPickerVisible(!colorPickerVisible);
                    setProperty('fill');
                  }}
                />
                <Input
                  value={selectedElement.fill || '#000000'}
                  onChange={e => handlePropertyChange('fill', e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              {colorPickerVisible && property === 'fill' && (
                <div style={{ position: 'absolute', zIndex: 2 }}>
                  <div
                    style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
                    onClick={() => setColorPickerVisible(false)}
                  />
                  <SketchPicker
                    color={selectedElement.fill || '#000000'}
                    onChange={handleColorChange}
                  />
                </div>
              )}
            </Form.Item>
          </>
        );
        
      case 'image':
        return (
          <>
            <Divider orientation="left" style={{ margin: '8px 0' }}>Image</Divider>
            <Form.Item label="Path" style={{ marginBottom: '8px' }}>
              <Input
                value={selectedElement.src || ''}
                disabled={true}
              />
            </Form.Item>
          </>
        );
        
      case 'group':
        return (
          <>
            <Divider orientation="left" style={{ margin: '8px 0' }}>Group</Divider>
            <Form.Item style={{ marginBottom: '8px' }}>
              <div style={{ color: '#888' }}>
                This group contains {selectedElement.elements?.length || 0} elements
              </div>
            </Form.Item>
          </>
        );
        
      default:
        return null;
    }
  };

  return (
    <Card title="Properties" className="element-properties-panel" style={{ height: '100%', overflow: 'auto', padding: '8px' }}>
      <Form layout="vertical" size="small">
        {renderBorderProperties()}
        {renderSpecificProperties()}
      </Form>
    </Card>
  );
};

export default PropertyPanel; 