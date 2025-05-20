import React, { memo, useState, useEffect } from 'react';
import { Button, Input, Divider, Card, Space, message, Spin, Tooltip, List, Typography, Collapse, Empty } from 'antd';
import { 
  SearchOutlined, 
  FontSizeOutlined, 
  BorderOutlined, 
  QrcodeOutlined, 
  BarcodeOutlined, 
  MinusOutlined, 
  OrderedListOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  LockOutlined,
  UnlockOutlined,
  DeleteOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
  PictureOutlined,
  ClearOutlined,
  LineOutlined,
  GroupOutlined
} from '@ant-design/icons';
import { TOOLBOX } from '../../utils/template/constants';
import { getApiBaseUrl } from '../../utils/template/helpers';

// ใช้ interface ที่เหมาะสมแทนการ import โดยตรง
interface TextElement {
  id: string;
  type: string;
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: boolean;
  locked?: boolean;
  layer?: number;
}

interface BarcodeElement {
  id: string;
  type: string;
  value?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: boolean;
  locked?: boolean;
  layer?: number;
}

interface QrElement {
  id: string;
  type: string;
  value?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: boolean;
  locked?: boolean;
  layer?: number;
}

interface Element {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: boolean;
  locked?: boolean;
  layer?: number;
  rotation?: number;
}

// อ็อบเจกต์ที่เก็บ icon component ทั้งหมดสำหรับอ้างอิง
const IconMap = {
  FontSizeOutlined: <FontSizeOutlined />,
  BorderOutlined: <BorderOutlined />,
  QrcodeOutlined: <QrcodeOutlined />,
  BarcodeOutlined: <BarcodeOutlined />,
  MinusOutlined: <MinusOutlined />,
};

// ฟังก์ชันสำหรับแปลงชื่อ icon เป็น component
const getIconComponent = (iconName: string | React.ReactNode): React.ReactNode => {
  if (typeof iconName === 'string') {
    // ถ้าเป็น string ให้ดึง component จาก map
    return IconMap[iconName as keyof typeof IconMap] || '📝';
  }
  // ถ้าเป็น React component อยู่แล้ว ให้ใช้เลย
  return iconName;
};

interface BatchInfo {
  batchNo: string;
  productName?: string;
  productKey?: string;
  customerKey?: string;
  totalBags?: number;
  lotNo?: string;
  expDate?: string;
  qty?: number;
  unit?: string;
}

interface DesignerSidebarProps {
  onAddElement?: (type: string) => void;  // Generic add element function
  onAddImage?: () => void;
  onAddText?: () => void;
  onAddWatermark?: () => void;
  onAddRect?: () => void;
  onAddLine?: () => void;
  onAddQRCode?: () => void;
  onAddBarcode?: () => void;
  onApplyBatchData?: () => void;
  onLayerManager?: () => void;
  batchInfo?: BatchInfo | null;
  batchNo?: string;
  onBatchNoChange?: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  onSearch?: (query: string) => void;
  isSidebarCollapsed?: boolean;
  toggleSidebar?: () => void;
  elements?: Element[];
  selectedId?: string | null;
  selectedIds?: string[];
  selectElement?: (id: string | null) => void;
  handleMoveElementUp?: (id: string) => void;
  handleMoveElementDown?: (id: string) => void;
  handleMoveElementToTop?: (id: string) => void;
  handleMoveElementToBottom?: (id: string) => void;
  handleToggleElementVisibility?: (id: string) => void;
  handleToggleElementLock?: (id: string) => void;
  deleteElement?: (id: string) => void;
  showLayerPanel?: boolean;
  toggleLayerPanel?: () => void;
  updateElementProperty?: (id: string, property: string, value: any) => void;
}

/**
 * Component that displays the sidebar tools for TemplateDesigner
 */
export const DesignerSidebar: React.FC<DesignerSidebarProps> = memo(({
  onAddElement,
  onAddImage,
  onAddText,
  onAddWatermark,
  onAddRect,
  onAddLine,
  onAddQRCode,
  onAddBarcode,
  onApplyBatchData,
  onLayerManager,
  batchInfo,
  batchNo,
  onBatchNoChange,
  isLoading,
  onSearch,
  isSidebarCollapsed,
  toggleSidebar,
  elements = [],
  selectedId = null,
  selectedIds = [],
  selectElement = () => {},
  handleMoveElementUp = () => {},
  handleMoveElementDown = () => {},
  handleMoveElementToTop = () => {},
  handleMoveElementToBottom = () => {},
  handleToggleElementVisibility = () => {},
  handleToggleElementLock = () => {},
  deleteElement = () => {},
  showLayerPanel = false,
  toggleLayerPanel = () => {},
  updateElementProperty = () => {}
}) => {
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('elements');
  const [batchValue, setBatchValue] = useState(batchNo || '');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const { Panel } = Collapse;

  useEffect(() => {
    if (batchNo) {
      setBatchValue(batchNo);
    }
  }, [batchNo]);

  const handleSearch = () => {
    if (!searchQuery) return;
    
    setSearchLoading(true);
    onSearch?.(searchQuery);
    setSearchLoading(false);
  };

  // Handle batch number change
  const handleBatchChange = (value: string) => {
    setBatchValue(value);
    if (onBatchNoChange) {
      onBatchNoChange(value);
    }
  };

  // Handle render tabs
  const renderElementsTab = () => {
    return (
      <div style={{ padding: '10px' }}>
        <h3 style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>Add Elements</h3>
        <Space direction="vertical" size="small" style={{ display: 'flex' }}>
          <div className="element-tool-section">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
              <Button
                size="large"
                icon={<FontSizeOutlined />}
                onClick={() => onAddElement && onAddElement('text')}
                disabled={!onAddElement}
                style={{ height: '72px', display: 'flex', flexDirection: 'column', padding: '8px' }}
              >
                <span>Text</span>
              </Button>
              <Button
                size="large"
                icon={<BorderOutlined />}
                onClick={() => onAddElement && onAddElement('rect')}
                disabled={!onAddElement}
                style={{ height: '72px', display: 'flex', flexDirection: 'column', padding: '8px' }}
              >
                <span>Box</span>
              </Button>
              <Button
                size="large"
                icon={<LineOutlined />}
                onClick={() => onAddElement && onAddElement('line')}
                disabled={!onAddElement}
                style={{ height: '72px', display: 'flex', flexDirection: 'column', padding: '8px' }}
              >
                <span>Line</span>
              </Button>
              <Button
                size="large"
                icon={<BarcodeOutlined />}
                onClick={() => onAddElement && onAddElement('barcode')}
                disabled={!onAddElement}
                style={{ height: '72px', display: 'flex', flexDirection: 'column', padding: '8px' }}
              >
                <span>Barcode</span>
              </Button>
              <Button
                size="large"
                icon={<QrcodeOutlined />}
                onClick={() => onAddElement && onAddElement('qr')}
                disabled={!onAddElement}
                style={{ height: '72px', display: 'flex', flexDirection: 'column', padding: '8px' }}
              >
                <span>QR Code</span>
              </Button>
              <Button
                size="large"
                icon={<PictureOutlined />}
                onClick={() => {
                  if (onAddImage) {
                    onAddImage();
                  } else if (onAddElement) {
                    onAddElement('image');
                  }
                }}
                disabled={!onAddImage && !onAddElement}
                style={{ height: '72px', display: 'flex', flexDirection: 'column', padding: '8px' }}
              >
                <span>Image</span>
              </Button>
            </div>
          </div>
        </Space>
      </div>
    );
  };

  // Sort elements by layer - higher layer elements shown at top
  const sortedElements = [...elements].sort((a, b) => {
    const layerA = a.layer || 0;
    const layerB = b.layer || 0;
    return layerB - layerA; // เรียงลำดับจากค่า layer มากไปน้อย (บนลงล่าง)
  });

  // Keep track of elements count and re-render when it changes
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`DesignerSidebar: Elements count: ${elements.length}`);
    }
  }, [elements.length]);

  return (
    <div style={{ padding: '8px' }}>
      {renderElementsTab()}
      
      <Divider style={{ margin: '8px 0' }} />
      
      {/* Layer Manager Section */}
      <div style={{ marginTop: '8px' }}>
        <Typography.Title level={5} style={{ marginBottom: '8px' }}>
          Layer Manager
        </Typography.Title>
        
        <div style={{ marginBottom: '6px', fontSize: '13px', color: '#777' }}>
          {elements.length > 0 
            ? 'Click to select, drag to change layer order'
            : 'No elements in canvas'}
        </div>
        
        {/* Element List */}
        <div style={{ 
          maxHeight: '250px', 
          overflowY: 'auto', 
          border: '1px solid #f0f0f0', 
          borderRadius: '4px',
          backgroundColor: '#fafafa' 
        }}>
          {elements.length > 0 ? (
            <div>
              {/* เรียงลำดับตาม layer สูงไปต่ำ (ค่ามากอยู่ด้านบนของรายการ) */}
              {elements.sort((a, b) => {
                const layerA = a.layer || 0;
                const layerB = b.layer || 0;
                return layerB - layerA; // เรียงจากค่า layer มากไปน้อย (บนลงล่าง)
              }).map(item => (
                <div
                  id={`layer-item-${item.id}`}
                  key={item.id}
                  onClick={() => selectElement(item.id)}
                  style={{
                    padding: '6px 8px',
                    margin: '2px',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    backgroundColor: selectedId === item.id 
                      ? '#e6f7ff' 
                      : 'white',
                    border: selectedId === item.id 
                      ? '1px solid #1890ff' 
                      : '1px solid #f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    position: 'relative',
                    opacity: item.visible === false ? 0.5 : 1
                  }}
                  draggable="true"
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', item.id);
                    setDraggedId(item.id);
                    
                    // Create ghost image
                    const element = document.getElementById(`layer-item-${item.id}`);
                    if (element) {
                      const ghostElement = element.cloneNode(true) as HTMLElement;
                      ghostElement.style.width = `${element.offsetWidth}px`;
                      ghostElement.style.opacity = '0.8';
                      ghostElement.style.backgroundColor = '#f0f0f0';
                      ghostElement.style.position = 'absolute';
                      ghostElement.style.top = '-1000px';
                      document.body.appendChild(ghostElement);
                      
                      e.dataTransfer.setDragImage(ghostElement, 20, 20);
                      
                      setTimeout(() => {
                        document.body.removeChild(ghostElement);
                      }, 0);
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (item.id !== draggedId) {
                      setDragOverId(item.id);
                    }
                  }}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDragOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sourceId = e.dataTransfer.getData('text/plain');
                    
                    if (!sourceId || !item.id || sourceId === item.id) {
                      setDraggedId(null);
                      setDragOverId(null);
                      return;
                    }
                    
                    if (!elements || !updateElementProperty || typeof updateElementProperty !== 'function') {
                      console.error('Elements array or updateElementProperty function is not available');
                      setDraggedId(null);
                      setDragOverId(null);
                      return;
                    }
                    
                    // Get source and target element layers
                    const sourceItem = elements.find(el => el.id === sourceId);
                    const targetItem = elements.find(el => el.id === item.id);
                    
                    if (sourceItem && targetItem) {
                      // Instead of just swapping, we'll update all elements
                      // between the source and target to reorder properly
                      
                      // เรียงลำดับตาม layer มากไปน้อย (บนลงล่าง)
                      const sortedElements = [...elements].sort((a, b) => {
                        const layerA = a.layer || 0;
                        const layerB = b.layer || 0;
                        return layerB - layerA; // เรียงจากค่า layer มากไปน้อย (บนลงล่าง)
                      });
                      
                      // Find indices in sorted array
                      const sourceIndex = sortedElements.findIndex(el => el.id === sourceId);
                      const targetIndex = sortedElements.findIndex(el => el.id === item.id);
                      
                      if (sourceIndex !== -1 && targetIndex !== -1) {
                        // Reorder the array by moving source to target position
                        const elementToMove = sortedElements.splice(sourceIndex, 1)[0];
                        sortedElements.splice(targetIndex, 0, elementToMove);
                        
                        // Reassign layer values to maintain order
                        // เรียงลำดับจากบนลงล่าง โดยให้ค่า layer มากที่สุดอยู่บนสุด และลดหลั่นลงมา
                        const maxLayer = sortedElements.length * 10; // ใช้ช่วงกว้างเพื่อให้มีพื้นที่สำหรับแทรกในอนาคต
                        
                        sortedElements.forEach((el, idx) => {
                          const newLayer = maxLayer - (idx * 10); // อิลิเมนต์บนสุดมีค่า layer มากที่สุด
                          if ((el.layer || 0) !== newLayer) {
                            updateElementProperty(el.id, 'layer', newLayer);
                          }
                        });
                        
                        // Select the moved element
                        selectElement(sourceId);
                        
                        // Show message
                        message.success('Layer order updated');
                      }
                    } else {
                      console.warn('Could not find source or target element:', { sourceId, targetId: item.id });
                    }
                    
                    setDraggedId(null);
                    setDragOverId(null);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden' }}>
                    {/* Element Type Icon */}
                    <div style={{ marginRight: '6px', color: '#1890ff' }}>
                      {item.type === 'text' && <FontSizeOutlined />}
                      {item.type === 'rect' && <BorderOutlined />}
                      {item.type === 'image' && <PictureOutlined />}
                      {item.type === 'line' && <LineOutlined />}
                      {item.type === 'barcode' && <BarcodeOutlined />}
                      {item.type === 'qr' && <QrcodeOutlined />}
                      {item.type === 'group' && <GroupOutlined />}
                    </div>
                    
                    {/* Element Name */}
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.type === 'text' ? 
                        (item as any).text ? (item as any).text.substring(0, 20) : 'Text' : 
                        `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} ${item.id.substring(0, 5)}`}
                    </div>
                  </div>
                  
                  {/* Visual indicators for visibility and lock status */}
                  <div style={{ display: 'flex' }}>
                    {item.visible === false && (
                      <Tooltip title="Hidden">
                        <EyeInvisibleOutlined style={{ marginRight: '4px', color: '#999' }} />
                      </Tooltip>
                    )}
                    {item.locked && (
                      <Tooltip title="Locked">
                        <LockOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    )}
                  </div>
                  
                  {/* Show drag over indicator */}
                  {dragOverId === item.id && draggedId !== item.id && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: '-3px',
                      height: '3px',
                      backgroundColor: '#1890ff',
                      borderRadius: '2px'
                    }} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px', textAlign: 'center', color: '#999' }}>
              Add elements to display here
            </div>
          )}
        </div>
        
        {/* Element Control Panel */}
        {selectedId && (
          <div style={{ 
            marginTop: '8px',
            padding: '8px', 
            border: '1px solid #f0f0f0', 
            borderRadius: '4px',
            backgroundColor: '#fafafa' 
          }}>
            <div style={{ fontSize: '13px', marginBottom: '4px', color: '#666' }}>
              Manage selected element
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {/* Element Control Buttons */}
              {selectedId && elements.find(el => el.id === selectedId) && (
                <>
                  <Tooltip title={elements.find(el => el.id === selectedId)?.visible === false ? "Show" : "Hide"}>
                    <Button 
                      size="small"
                      icon={elements.find(el => el.id === selectedId)?.visible === false ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                      onClick={() => {
                        if (handleToggleElementVisibility) {
                          handleToggleElementVisibility(selectedId);
                        } else {
                          // Fallback to old implementation
                          const element = elements.find(el => el.id === selectedId);
                          if (element) {
                            updateElementProperty(selectedId, 'visible', element.visible === false ? true : false);
                          }
                        }
                      }}
                    />
                  </Tooltip>
                
                  <Tooltip title={elements.find(el => el.id === selectedId)?.locked ? "Unlock" : "Lock"}>
                    <Button 
                      size="small"
                      icon={elements.find(el => el.id === selectedId)?.locked ? <UnlockOutlined /> : <LockOutlined />}
                      onClick={() => {
                        if (handleToggleElementLock) {
                          handleToggleElementLock(selectedId);
                        } else {
                          // Fallback to old implementation
                          const element = elements.find(el => el.id === selectedId);
                          if (element) {
                            updateElementProperty(selectedId, 'locked', !element.locked);
                          }
                        }
                      }}
                    />
                  </Tooltip>
                  
                  <Tooltip title="Move to Bottom">
                    <Button 
                      size="small"
                      icon={<VerticalAlignBottomOutlined />}
                      onClick={() => handleMoveElementToBottom(selectedId)}
                    />
                  </Tooltip>
                  
                  <Tooltip title="Move Down">
                    <Button 
                      size="small"
                      icon={<ArrowDownOutlined />}
                      onClick={() => handleMoveElementDown(selectedId)}
                    />
                  </Tooltip>
                  
                  <Tooltip title="Move Up">
                    <Button 
                      size="small"
                      icon={<ArrowUpOutlined />}
                      onClick={() => handleMoveElementUp(selectedId)}
                    />
                  </Tooltip>
                  
                  <Tooltip title="Move to Top">
                    <Button 
                      size="small"
                      icon={<VerticalAlignTopOutlined />}
                      onClick={() => handleMoveElementToTop(selectedId)}
                    />
                  </Tooltip>
                  
                  <Tooltip title="Delete">
                    <Button 
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => deleteElement(selectedId)}
                      danger
                    />
                  </Tooltip>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

DesignerSidebar.displayName = 'DesignerSidebar'; 