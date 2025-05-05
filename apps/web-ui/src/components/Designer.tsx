import React, { useState, useEffect } from 'react';
import { Button, Card, Space, Select, Input, InputNumber, Typography, message } from 'antd';
import { DeleteOutlined, CopyOutlined, PlusOutlined } from '@ant-design/icons';
import { ComponentTypes, BarcodeFormats, Placeholders } from '@/utils/constants';

const { Title, Text } = Typography;
const { Option } = Select;

interface ComponentItem {
  ComponentID?: number;
  TemplateID?: number;
  ComponentType: string;
  X: number;
  Y: number;
  W?: number;
  H?: number;
  FontName?: string;
  FontSize?: number;
  Placeholder?: string;
  StaticText?: string;
  BarcodeFormat?: string;
  CreatedAt?: string;
  id?: string; // สำหรับใช้ในการระบุตัวตนในหน้าจอเท่านั้น
}

interface DesignerProps {
  initialComponents: ComponentItem[];
  paperSize: string;
  orientation: string;
  onComponentsUpdate: (components: ComponentItem[]) => void;
}

export default function Designer({ initialComponents = [], paperSize, orientation, onComponentsUpdate }: DesignerProps) {
  const [components, setComponents] = useState<ComponentItem[]>([]);
  const [selectedComponent, setSelectedComponent] = useState<ComponentItem | null>(null);
  const [designerWidth, setDesignerWidth] = useState<number>(400);
  const [designerHeight, setDesignerHeight] = useState<number>(300);

  // กำหนดขนาดของพื้นที่ออกแบบตาม paperSize และ orientation
  useEffect(() => {
    let width = 400;
    let height = 300;

    switch (paperSize) {
      case 'ZD411':
        width = 400;
        height = 100;
        break;
      case 'ZD421':
        width = 400;
        height = 200;
        break;
      case 'ZD621':
        width = 600;
        height = 300;
        break;
      case 'A6':
        width = 410;
        height = 580;
        break;
      case 'A7':
        width = 290;
        height = 410;
        break;
      default:
        width = 400;
        height = 300;
    }

    // สลับค่าถ้าเป็น landscape
    if (orientation === 'landscape') {
      const temp = width;
      width = height;
      height = temp;
    }

    setDesignerWidth(width);
    setDesignerHeight(height);
  }, [paperSize, orientation]);

  // โหลดค่าเริ่มต้นจาก props
  useEffect(() => {
    if (initialComponents && initialComponents.length > 0) {
      // เพิ่ม id ที่ไม่ซ้ำกันสำหรับใช้ในการแสดงผล
      const componentsWithIds = initialComponents.map(comp => ({
        ...comp,
        id: comp.ComponentID ? `comp-${comp.ComponentID}` : `comp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      }));
      setComponents(componentsWithIds);
    } else {
      setComponents([]);
    }
  }, [initialComponents]);

  // ส่งการเปลี่ยนแปลงไปยัง parent component
  useEffect(() => {
    // ต้องตัด id ที่เพิ่มเข้ามาออกก่อนส่งไปให้ parent
    const componentsForParent = components.map(({ id, ...comp }) => comp);
    onComponentsUpdate(componentsForParent);
  }, [components, onComponentsUpdate]);

  const handleAddComponent = (type: string) => {
    const newComponent: ComponentItem = {
      ComponentType: type,
      X: 10,
      Y: 10,
      W: type === 'barcode' || type === 'qrcode' ? 150 : 100,
      H: type === 'barcode' ? 60 : (type === 'qrcode' ? 100 : 30),
      FontName: type === 'text' ? 'Arial' : undefined,
      FontSize: type === 'text' ? 12 : undefined,
      StaticText: type === 'text' ? 'ข้อความใหม่' : undefined,
      BarcodeFormat: type === 'barcode' ? 'CODE128' : undefined,
      Placeholder: type === 'placeholder' ? 'BatchNo' : undefined,
      id: `comp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    };

    setComponents([...components, newComponent]);
    setSelectedComponent(newComponent);
    message.success(`เพิ่ม${type === 'text' ? 'ข้อความ' : type} สำเร็จ`);
  };

  const handleComponentSelect = (component: ComponentItem) => {
    setSelectedComponent(component);
  };

  const handleComponentUpdate = (id: string | undefined, updates: Partial<ComponentItem>) => {
    if (!id) return;

    const updatedComponents = components.map(comp => {
      if (comp.id === id) {
        const updated = { ...comp, ...updates };
        if (comp === selectedComponent) {
          setSelectedComponent(updated);
        }
        return updated;
      }
      return comp;
    });

    setComponents(updatedComponents);
  };

  const handleComponentDelete = (id: string | undefined) => {
    if (!id) return;

    const filteredComponents = components.filter(comp => comp.id !== id);
    setComponents(filteredComponents);
    
    if (selectedComponent && selectedComponent.id === id) {
      setSelectedComponent(null);
    }
    
    message.success('ลบคอมโพเนนต์สำเร็จ');
  };

  const handleComponentDuplicate = (component: ComponentItem) => {
    if (!component.id) return;
    
    const duplicated: ComponentItem = {
      ...component,
      ComponentID: undefined,
      X: component.X + 20,
      Y: component.Y + 20,
      id: `comp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    };
    
    setComponents([...components, duplicated]);
    setSelectedComponent(duplicated);
    message.success('คัดลอกคอมโพเนนต์สำเร็จ');
  };

  const renderComponentProperties = () => {
    if (!selectedComponent) return null;

    switch (selectedComponent.ComponentType) {
      case 'text':
        return (
          <div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text>ข้อความ:</Text>
                <Input 
                  value={selectedComponent.StaticText || ''} 
                  onChange={e => handleComponentUpdate(selectedComponent.id, { StaticText: e.target.value })}
                  placeholder="ป้อนข้อความ"
                />
              </div>
              <div>
                <Text>Font:</Text>
                <Select 
                  value={selectedComponent.FontName || 'Arial'}
                  style={{ width: '100%' }}
                  onChange={value => handleComponentUpdate(selectedComponent.id, { FontName: value })}
                >
                  <Option value="Arial">Arial</Option>
                  <Option value="Calibri">Calibri</Option>
                  <Option value="Verdana">Verdana</Option>
                  <Option value="Tahoma">Tahoma</Option>
                </Select>
              </div>
              <div>
                <Text>ขนาดตัวอักษร:</Text>
                <InputNumber 
                  value={selectedComponent.FontSize || 12}
                  min={8}
                  max={72}
                  style={{ width: '100%' }}
                  onChange={value => handleComponentUpdate(selectedComponent.id, { FontSize: value !== null ? value : 12 })}
                />
              </div>
            </Space>
          </div>
        );
      
      case 'barcode':
        return (
          <div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text>รูปแบบบาร์โค้ด:</Text>
                <Select 
                  value={selectedComponent.BarcodeFormat || 'CODE128'}
                  style={{ width: '100%' }}
                  onChange={value => handleComponentUpdate(selectedComponent.id, { BarcodeFormat: value })}
                >
                  {BarcodeFormats.map(format => (
                    <Option key={format.value} value={format.value}>{format.label}</Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text>ตัวแปรข้อมูล:</Text>
                <Select 
                  value={selectedComponent.Placeholder || 'BatchNo'}
                  style={{ width: '100%' }}
                  onChange={value => handleComponentUpdate(selectedComponent.id, { Placeholder: value })}
                >
                  {Placeholders.map(placeholder => (
                    <Option key={placeholder.value} value={placeholder.value}>{placeholder.label}</Option>
                  ))}
                </Select>
              </div>
            </Space>
          </div>
        );
      
      case 'qrcode':
        return (
          <div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text>ตัวแปรข้อมูล:</Text>
                <Select 
                  value={selectedComponent.Placeholder || 'BatchNo'}
                  style={{ width: '100%' }}
                  onChange={value => handleComponentUpdate(selectedComponent.id, { Placeholder: value })}
                >
                  {Placeholders.map(placeholder => (
                    <Option key={placeholder.value} value={placeholder.value}>{placeholder.label}</Option>
                  ))}
                </Select>
              </div>
            </Space>
          </div>
        );

      case 'placeholder':
        return (
          <div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text>ตัวแปร:</Text>
                <Select 
                  value={selectedComponent.Placeholder || 'BatchNo'}
                  style={{ width: '100%' }}
                  onChange={value => handleComponentUpdate(selectedComponent.id, { Placeholder: value })}
                >
                  {Placeholders.map(placeholder => (
                    <Option key={placeholder.value} value={placeholder.value}>{placeholder.label}</Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text>Font:</Text>
                <Select 
                  value={selectedComponent.FontName || 'Arial'}
                  style={{ width: '100%' }}
                  onChange={value => handleComponentUpdate(selectedComponent.id, { FontName: value })}
                >
                  <Option value="Arial">Arial</Option>
                  <Option value="Calibri">Calibri</Option>
                  <Option value="Verdana">Verdana</Option>
                  <Option value="Tahoma">Tahoma</Option>
                </Select>
              </div>
              <div>
                <Text>ขนาดตัวอักษร:</Text>
                <InputNumber 
                  value={selectedComponent.FontSize || 12}
                  min={8}
                  max={72}
                  style={{ width: '100%' }}
                  onChange={value => handleComponentUpdate(selectedComponent.id, { FontSize: value !== null ? value : 12 })}
                />
              </div>
            </Space>
          </div>
        );

      default:
        return <div>ไม่มีคุณสมบัติที่สามารถแก้ไขได้</div>;
    }
  };

  const getComponentStyle = (component: ComponentItem) => {
    const isSelected = selectedComponent && selectedComponent.id === component.id;
    
    const style: React.CSSProperties = {
      position: 'absolute',
      left: `${component.X}px`,
      top: `${component.Y}px`,
      width: component.W ? `${component.W}px` : 'auto',
      height: component.H ? `${component.H}px` : 'auto',
      border: isSelected ? '1px dashed #1890ff' : '1px solid #f0f0f0',
      backgroundColor: isSelected ? 'rgba(24, 144, 255, 0.1)' : 'rgba(255, 255, 255, 0.8)',
      padding: '4px',
      cursor: 'pointer',
      zIndex: isSelected ? 100 : 10,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: component.FontSize ? `${component.FontSize}px` : '12px',
      fontFamily: component.FontName || 'Arial',
      overflow: 'hidden'
    };
    
    return style;
  };

  const renderComponentPreview = (component: ComponentItem) => {
    switch (component.ComponentType) {
      case 'text':
        return component.StaticText || 'ข้อความ';
      case 'barcode':
        return `Barcode: ${component.BarcodeFormat || 'CODE128'} (${component.Placeholder || 'BatchNo'})`;
      case 'qrcode':
        return `QR Code (${component.Placeholder || 'BatchNo'})`;
      case 'placeholder':
        return `Var: ${component.Placeholder || 'BatchNo'}`;
      default:
        return component.ComponentType;
    }
  };

  return (
    <div className="designer-container">
      <div className="designer-toolbar mb-4">
        <Space>
          <Title level={5} style={{ margin: 0 }}>เพิ่มคอมโพเนนต์:</Title>
          {ComponentTypes.map(type => (
            <Button 
              key={type.value} 
              onClick={() => handleAddComponent(type.value)}
              icon={<PlusOutlined />}
              style={{ marginRight: 8 }}
            >
              {type.label}
            </Button>
          ))}
        </Space>
      </div>

      <div className="designer-content" style={{ display: 'flex', gap: '16px' }}>
        <div 
          className="designer-canvas" 
          style={{ 
            position: 'relative', 
            width: `${designerWidth}px`, 
            height: `${designerHeight}px`, 
            border: '1px solid #d9d9d9', 
            backgroundColor: '#fff', 
            overflow: 'hidden',
            margin: 'auto'
          }}
        >
          {components.map(component => (
            <div
              key={component.id}
              style={getComponentStyle(component)}
              onClick={() => handleComponentSelect(component)}
            >
              {renderComponentPreview(component)}
            </div>
          ))}
        </div>

        <div className="component-properties" style={{ width: '300px' }}>
          <Card 
            title="คุณสมบัติของคอมโพเนนต์" 
            extra={
              selectedComponent && (
                <Space>
                  <Button 
                    icon={<CopyOutlined />} 
                    onClick={() => selectedComponent && handleComponentDuplicate(selectedComponent)} 
                    size="small"
                  />
                  <Button 
                    icon={<DeleteOutlined />} 
                    danger 
                    onClick={() => selectedComponent && handleComponentDelete(selectedComponent.id)} 
                    size="small"
                  />
                </Space>
              )
            }
          >
            {selectedComponent ? (
              <div>
                <div className="mb-4">
                  <Text>X:</Text>
                  <InputNumber 
                    value={selectedComponent.X}
                    min={0}
                    max={designerWidth - (selectedComponent.W || 0)}
                    style={{ width: '100%', marginBottom: 8 }}
                    onChange={value => handleComponentUpdate(selectedComponent.id, { X: value !== null ? value : 0 })}
                  />

                  <Text>Y:</Text>
                  <InputNumber 
                    value={selectedComponent.Y}
                    min={0}
                    max={designerHeight - (selectedComponent.H || 0)}
                    style={{ width: '100%', marginBottom: 8 }}
                    onChange={value => handleComponentUpdate(selectedComponent.id, { Y: value !== null ? value : 0 })}
                  />

                  <Text>Width:</Text>
                  <InputNumber 
                    value={selectedComponent.W}
                    min={10}
                    max={designerWidth - selectedComponent.X}
                    style={{ width: '100%', marginBottom: 8 }}
                    onChange={value => handleComponentUpdate(selectedComponent.id, { W: value !== null ? value : 100 })}
                  />

                  <Text>Height:</Text>
                  <InputNumber 
                    value={selectedComponent.H}
                    min={10}
                    max={designerHeight - selectedComponent.Y}
                    style={{ width: '100%', marginBottom: 8 }}
                    onChange={value => handleComponentUpdate(selectedComponent.id, { H: value !== null ? value : 30 })}
                  />
                </div>
                
                {renderComponentProperties()}
              </div>
            ) : (
              <div className="text-center text-gray-400">เลือกคอมโพเนนต์เพื่อแก้ไขคุณสมบัติ</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
} 