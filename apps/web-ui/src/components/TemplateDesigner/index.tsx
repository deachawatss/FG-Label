import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Layout, message, Modal, Input } from 'antd';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';

// Import components
import { DesignerSidebar } from './DesignerSidebar';
import { DesignerToolbar } from './DesignerToolbar';
import { ElementRenderer } from './ElementRenderer';
import { TemplateSettingsModal } from './TemplateSettingsModal';

// Import custom hooks
import { useQrAndBarcode } from '../../hooks/designer/useQrAndBarcode';
import { useBatchData } from '../../hooks/designer/useBatchData';
import { useCanvasHistory } from '../../hooks/designer/useCanvasHistory';
import { useTemplateActions } from '../../hooks/designer/useTemplateActions';
import { useCanvasRenderer } from '../../hooks/designer/useCanvasRenderer';

// Import types and constants
import { ElementType, TemplateInfo, CanvasSize } from '../../models/TemplateDesignerTypes';
import { FEATURES } from '../../utils/template/constants';

// ตรวจสอบว่าอยู่ในฝั่ง client
const isClient = typeof window !== 'undefined';

// นำเข้าโมดูลที่ทำงานเฉพาะฝั่ง client
let Stage: any = null;
let Layer: any = null;
let Transformer: any = null;
let Line: any = null;
let Group: any = null;
let Rect: any = null;

if (isClient) {
  const Konva = require('react-konva');
  Stage = Konva.Stage;
  Layer = Konva.Layer;
  Transformer = Konva.Transformer;
  Line = Konva.Line;
  Group = Konva.Group;
  Rect = Konva.Rect;
}

const { Header, Sider, Content } = Layout;

interface TemplateDesignerProps {
  templateId?: string;
  initialTemplate?: any;
}

/**
 * คอมโพเนนต์หลักสำหรับ Template Designer
 */
const TemplateDesigner: React.FC<TemplateDesignerProps> = ({ 
  templateId: templateIdProp, 
  initialTemplate 
}) => {
  // State variables
  const [batchNo, setBatchNo] = useState<string>('');
  const [templateInfoModal, setTemplateInfoModal] = useState<boolean>(false);
  const [importJson, setImportJson] = useState<string>('');
  const [importModal, setImportModal] = useState<boolean>(false);
  const [isTemplateLoading, setIsTemplateLoading] = useState<boolean>(false);
  const [templateLoaded, setTemplateLoaded] = useState<boolean>(false);
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo>({
    name: '',
    description: '',
    productKey: '',
    customerKey: '',
    paperSize: '4x4',
    orientation: 'Portrait',
    templateType: 'INNER'
  });

  // เพิ่ม useRef เพื่อติดตามว่าได้โหลด template ไปแล้วหรือยัง
  const templateLoadedRef = useRef<boolean>(false);
  const initialRenderRef = useRef<boolean>(true);
  const batchAppliedRef = useRef<{[key: string]: boolean}>({});

  // Custom hooks
  const router = useRouter();
  const { 
    qrDataUrls, qrImages, barcodeDataUrls, barcodeImages,
    updateQrDataUrl, updateBarcodeDataUrl, updateAllQrCodes, updateAllBarcodes,
    clearCache
  } = useQrAndBarcode();
  
  const {
    loading: batchLoading,
    fetchBatchData,
    buildElementsFromBatch
  } = useBatchData();
  
  const {
    elements,
    setElements,
    undo,
    redo,
    canUndo,
    canRedo,
    deleteElement,
    updateElementProperty,
    addElement,
    updateElement,
    replaceAllElements,
    duplicateElement
  } = useCanvasHistory([]);
  
  const {
    isSaving,
    isLoading,
    lastSaved,
    templateId,
    templateLoaded: templateLoadedFromActions,
    saveTemplate,
    loadTemplate,
    exportTemplateAsJson,
    importTemplateFromJson,
    setTemplateId
  } = useTemplateActions();
  
  const {
    stageRef,
    trRef,
    selectionRef,
    selectedId,
    selectedIds,
    canvasSize,
    zoom,
    dragStart,
    elementBeingCreated,
    selectionVisible,
    dragSelection,
    zoomIn,
    zoomOut,
    resetZoom,
    resizeCanvas,
    selectElement,
    selectElements,
    startCreatingElement,
    cancelCreatingElement,
    setDragStart,
    setSelectionVisible,
    setDragSelection
  } = useCanvasRenderer();

  // Side Effects
  
  // ตรวจสอบ query parameters เมื่อโหลด
  useEffect(() => {
    if (!router.isReady) return;
    
    const { batchNo: batchNoParam, syncBatch, productKey, customerKey } = router.query;
    
    if (batchNoParam && typeof batchNoParam === 'string') {
      setBatchNo(batchNoParam);
      
      // บันทึกค่า syncBatch เพื่อใช้ในครั้งต่อไป
      if (syncBatch === 'true' && !batchAppliedRef.current[batchNoParam]) {
        // ใช้ setTimeout เพื่อให้แน่ใจว่า component ได้ render ครั้งแรกเสร็จแล้ว
        setTimeout(() => {
          // ตรวจสอบก่อนว่าได้ทำการโหลด batch ไปแล้วหรือยัง
          if (!batchAppliedRef.current[batchNoParam]) {
            fetchAndApplyBatch(batchNoParam);
            batchAppliedRef.current[batchNoParam] = true;
          }
        }, 800);
      }
    }
    
    if (productKey && typeof productKey === 'string') {
      setTemplateInfo(prev => ({ ...prev, productKey }));
    }
    
    if (customerKey && typeof customerKey === 'string') {
      setTemplateInfo(prev => ({ ...prev, customerKey }));
    }
  }, [router.isReady, router.query]);
  
  // โหลดเทมเพลตเมื่อมี templateId - ปรับปรุงการทำงานของ useEffect
  useEffect(() => {
    // เช็คว่าพร้อมจะโหลดหรือยัง
    if (!router.isReady) return;
    
    // อ่านค่า query parameters จาก URL
    const { templateId, batchNum, showQR } = router.query;
    
    // หากมีการโหลด template ไปแล้ว ให้ข้ามการโหลดครั้งนี้
    if (templateLoadedRef.current) {
      console.log('Skip loading template: already loaded via templateLoadedRef');
      return;
    }
    
    // หากกำลังโหลดอยู่ ให้ข้าม
    if (isTemplateLoading) {
      console.log('Skip loading template: loading in progress');
      return;
    }
    
    // ถ้า templateLoaded เป็น true แล้ว ให้ข้าม
    if (templateLoaded) {
      console.log('Skip loading template: already loaded via templateLoaded state');
      templateLoadedRef.current = true;
      return;
    }

    const loadInitialTemplate = async () => {
      try {
        setIsTemplateLoading(true);
        console.log('Starting to load initial template...');
        
        // ล้าง cache เฉพาะเมื่อจำเป็น - ครั้งแรกเท่านั้น
        if (initialRenderRef.current) {
          console.log('Initial render, clearing cache');
          clearCache();
          initialRenderRef.current = false;
        }

        // กรณีมี templateId
        if (templateId && typeof templateId === 'string') {
          console.log(`Loading template with ID: ${templateId}`);
          
          // โหลดเทมเพลตจาก API
          const templateData = await loadTemplate(templateId, initialTemplate);
          
          if (templateData) {
            console.log('Template loaded successfully, setting state...');
            setTemplateInfo({
              name: templateData.templateInfo.name,
              description: templateData.templateInfo.description,
              productKey: templateData.templateInfo.productKey,
              customerKey: templateData.templateInfo.customerKey,
              paperSize: templateData.templateInfo.paperSize,
              orientation: templateData.templateInfo.orientation,
              templateType: templateData.templateInfo.templateType,
            });
            
            // ตั้งค่าขนาด canvas ตามข้อมูลที่โหลด
            if (templateData.canvasSize) {
              resizeCanvas(templateData.canvasSize);
            }
            
            // ตั้งค่า elements ตามข้อมูลที่โหลด
            if (templateData.elements && Array.isArray(templateData.elements)) {
              console.log(`Setting ${templateData.elements.length} elements from loaded template`);
              selectElement(null);
              setElements(templateData.elements);
              
              // อัปเดตข้อมูล QR code และ barcode - ใช้การ delay เพื่อให้ elements ถูกเซตก่อน
              setTimeout(() => {
                console.log('Updating QR codes and barcodes after template load');
                updateAllQrCodes(templateData.elements);
                updateAllBarcodes(templateData.elements);
              }, 100);
            } else {
              console.warn('No elements or invalid elements in loaded template');
              setElements([]);
            }
            
            setTemplateLoaded(true);
            templateLoadedRef.current = true;
            console.log('Initial template setup complete');
          } else {
            console.error('Failed to load template data');
            message.error('เกิดข้อผิดพลาดในการโหลด template');
            // ถ้าโหลดไม่สำเร็จ ให้ถือว่าโหลดเสร็จสิ้นแล้ว เพื่อป้องกันการโหลดซ้ำ
            setTemplateLoaded(true);
            templateLoadedRef.current = true;
          }
        } else {
          console.log('No templateId provided, checking for initialTemplate...');
          
          // ตรวจสอบว่ามี initialTemplate หรือไม่
          if (initialTemplate) {
            console.log('initialTemplate provided directly:', initialTemplate);
            
            // ตรวจสอบรูปแบบของ initialTemplate
            // กรณีที่ 1: initialTemplate มี elements และ canvasSize โดยตรง (จาก localStorage)
            if (initialTemplate.elements && Array.isArray(initialTemplate.elements)) {
              console.log(`Found ${initialTemplate.elements.length} elements directly in initialTemplate`);
              
              setElements(initialTemplate.elements);
              
              if (initialTemplate.canvasSize) {
                console.log('Using canvasSize from initialTemplate:', initialTemplate.canvasSize);
                resizeCanvas(initialTemplate.canvasSize);
              }
              
              // อัปเดต QR code และ barcode
              setTimeout(() => {
                console.log('Updating QR codes and barcodes from direct initialTemplate');
                updateAllQrCodes(initialTemplate.elements);
                updateAllBarcodes(initialTemplate.elements);
              }, 100);
              
              setTemplateLoaded(true);
              templateLoadedRef.current = true;
            }
            // กรณีที่ 2: initialTemplate.content เป็น string ที่ต้องแปลงเป็น JSON
            else if (typeof initialTemplate.content === 'string') {
              console.log('Content is string, parsing to JSON...');
              
              try {
                const contentObj = JSON.parse(initialTemplate.content);
                
                if (contentObj.elements && Array.isArray(contentObj.elements)) {
                  console.log(`Found ${contentObj.elements.length} elements in content string`);
                  
                  setElements(contentObj.elements);
                  
                  if (contentObj.canvasSize) {
                    console.log('Using canvasSize from content:', contentObj.canvasSize);
                    resizeCanvas(contentObj.canvasSize);
                  }
                  
                  // อัปเดต QR code และ barcode - ใช้ delay ที่นานขึ้นเพื่อให้แน่ใจว่า elements ถูกเซตก่อน
                  setTimeout(() => {
                    console.log('Updating QR codes and barcodes from parsed content');
                    updateAllQrCodes(contentObj.elements);
                    updateAllBarcodes(contentObj.elements);
                  }, 300);
                  
                  // ตั้งค่า templateInfo จาก initialTemplate
                  setTemplateInfo({
                    name: initialTemplate.name || '',
                    description: initialTemplate.description || '',
                    productKey: initialTemplate.productKey || '',
                    customerKey: initialTemplate.customerKey || '',
                    paperSize: initialTemplate.paperSize || '4x4',
                    orientation: initialTemplate.orientation || 'Portrait',
                    templateType: initialTemplate.templateType || 'Standard'
                  });
                  
                  setTemplateLoaded(true);
                  templateLoadedRef.current = true;
                } else {
                  console.warn('No elements array found in parsed content');
                  setTemplateLoaded(true);
                  templateLoadedRef.current = true;
                }
              } catch (e) {
                console.error('Error parsing initialTemplate content:', e);
                message.error('เกิดข้อผิดพลาดในการแปลงข้อมูล template');
                setTemplateLoaded(true);
                templateLoadedRef.current = true;
              }
            } 
            // กรณีที่ 3: initialTemplate.content เป็น object ที่มี elements
            else if (initialTemplate.content?.elements && Array.isArray(initialTemplate.content.elements)) {
              console.log(`Found ${initialTemplate.content.elements.length} elements in content object`);
              
              setElements(initialTemplate.content.elements);
              
              if (initialTemplate.content.canvasSize) {
                console.log('Using canvasSize from content object:', initialTemplate.content.canvasSize);
                resizeCanvas(initialTemplate.content.canvasSize);
              }
              
              // อัปเดต QR code และ barcode
              setTimeout(() => {
                console.log('Updating QR codes and barcodes from content object');
                updateAllQrCodes(initialTemplate.content.elements);
                updateAllBarcodes(initialTemplate.content.elements);
              }, 100);
              
              // ตั้งค่า templateInfo จาก initialTemplate
              setTemplateInfo({
                name: initialTemplate.name || '',
                description: initialTemplate.description || '',
                productKey: initialTemplate.productKey || '',
                customerKey: initialTemplate.customerKey || '',
                paperSize: initialTemplate.paperSize || '4x4',
                orientation: initialTemplate.orientation || 'Portrait',
                templateType: initialTemplate.templateType || 'Standard'
              });
              
              setTemplateLoaded(true);
              templateLoadedRef.current = true;
            } else {
              console.warn('initialTemplate provided but no valid elements found');
              setElements([]);
              setTemplateLoaded(true);
              templateLoadedRef.current = true;
            }
          } else {
            console.log('No initialTemplate provided, using empty template');
            setElements([]);
            setTemplateLoaded(true);
            templateLoadedRef.current = true;
          }
        }

        // โหลดและประยุกต์ใช้ข้อมูล batch ถ้ามีเลข batch และยังไม่เคยโหลดมาก่อน
        if (batchNum && typeof batchNum === 'string' && !batchAppliedRef.current[batchNum]) {
          console.log(`Batch number found in URL: ${batchNum}, fetching data...`);
          fetchAndApplyBatch(batchNum);
          batchAppliedRef.current[batchNum] = true;
        }
      } catch (error) {
        console.error('Error in loadInitialTemplate:', error);
        message.error('เกิดข้อผิดพลาดในการโหลดข้อมูล template');
        setTemplateLoaded(true);
        templateLoadedRef.current = true;
      } finally {
        setIsTemplateLoading(false);
      }
    };

    loadInitialTemplate();
  }, [router.isReady, router.query]);
  
  // อัพเดต QR codes และ Barcodes เมื่อ elements เปลี่ยน - ปรับปรุงการใช้ useEffect
  useEffect(() => {
    if (elements.length === 0) return;
    
    console.log('Checking elements for QR codes and barcodes:', elements.length, 'elements');
    
    // กรองเฉพาะ elements ประเภท qr และ barcode
    const qrElements = elements.filter(el => el.type === 'qr');
    const barcodeElements = elements.filter(el => el.type === 'barcode');
    
    console.log('Found', qrElements.length, 'QR elements and', barcodeElements.length, 'barcode elements');
    
    // ใช้ debounce timer เพื่อป้องกันการอัพเดตซ้ำซ้อน
    const timer = setTimeout(() => {
      // อัพเดตเฉพาะ elements ที่ยังไม่มี dataUrl
      if (qrElements.length > 0) {
        const qrElementsToUpdate = qrElements.filter(el => !qrDataUrls[el.id]);
        
        if (qrElementsToUpdate.length > 0) {
          console.log(`Updating ${qrElementsToUpdate.length} QR elements that don't have dataUrl`);
          
          qrElementsToUpdate.forEach(el => {
            console.log('Updating QR data URL for element:', el.id, 'with id hash:', el.id.substring(0, 8));
            updateQrDataUrl(el as any);
          });
        } else {
          console.log('All QR elements already have dataUrl');
        }
      }
      
      if (barcodeElements.length > 0) {
        const barcodeElementsToUpdate = barcodeElements.filter(el => !barcodeDataUrls[el.id]);
        
        if (barcodeElementsToUpdate.length > 0) {
          console.log(`Updating ${barcodeElementsToUpdate.length} barcode elements that don't have dataUrl`);
          
          barcodeElementsToUpdate.forEach(el => {
            console.log('Updating barcode data URL for element:', el.id, 'with id hash:', el.id.substring(0, 8));
            updateBarcodeDataUrl(el as any);
          });
        } else {
          console.log('All barcode elements already have dataUrl');
        }
      }
    }, 500); // เพิ่ม delay เป็น 500ms เพื่อป้องกันการอัพเดตถี่เกินไป
    
    // ยกเลิก timer เมื่อ unmount หรือเมื่อ dependency เปลี่ยน
    return () => clearTimeout(timer);
  }, [elements, qrDataUrls, barcodeDataUrls, updateQrDataUrl, updateBarcodeDataUrl]);
  
  // ตั้งค่าคีย์บอร์ดชอร์ตคัท
  useEffect(() => {
    if (!isClient) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z (Undo)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Ctrl+Y or Ctrl+Shift+Z (Redo)
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      // Delete/Backspace
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteElement(selectedId);
        selectElement(null);
      }
      // Ctrl+D (Duplicate)
      else if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedId) {
        e.preventDefault();
        duplicateElement(selectedId);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteElement, duplicateElement, selectedId, selectElement]);

  // Event handlers
  
  /**
   * ฟังก์ชันสำหรับดึงข้อมูล batch และนำมาประยุกต์ใช้
   */
  const fetchAndApplyBatch = useCallback(
    async (batchNumber: string) => {
      console.log(`Fetching batch data for batch number: ${batchNumber}`);
      
      // เช็คว่าได้โหลด batch นี้ไปแล้วหรือยัง
      if (batchAppliedRef.current[batchNumber]) {
        console.log(`Batch ${batchNumber} already applied, skipping`);
        return;
      }
      
      try {
        // ตรวจสอบว่ามี initialTemplate หรือไม่
        if (initialTemplate) {
          console.log('Initial template exists when fetchAndApplyBatch called:');
          console.log('- Type:', typeof initialTemplate);
          console.log('- Keys:', Object.keys(initialTemplate));
          
          // ตรวจสอบว่ามี elements อยู่แล้วหรือไม่
          if (typeof initialTemplate.content === 'string') {
            try {
              const contentObj = JSON.parse(initialTemplate.content);
              if (contentObj.elements && contentObj.elements.length > 0) {
                console.log(`- Found ${contentObj.elements.length} elements in content string`);
                
                // ถ้ามี elements อยู่แล้ว ไม่ต้องโหลดข้อมูล batch
                console.log('Skipping batch data loading: Template already has elements');
                batchAppliedRef.current[batchNumber] = true;
                return;
              }
            } catch (e) {
              console.error('Error parsing initialTemplate content:', e);
            }
          }
        }
        
        // ล้าง cache เฉพาะเมื่อต้องมีการโหลดข้อมูล batch และสร้าง elements ใหม่
        clearCache();
        
        // อ่านค่า showQR จาก URL
        const { showQR } = router.query;
        console.log(`showQR parameter: ${showQR}`);
        
        // โหลดข้อมูล batch
        const result = await fetchBatchData(batchNumber);
        
        if (result) {
          console.log('Batch data loaded successfully, building elements...');
          
          // สร้าง elements จากข้อมูล batch
          const options = { showQR: showQR === 'true' || showQR === '1' };
          console.log('Building elements with options:', options);
          
          const batchElements = buildElementsFromBatch(result, options);
          
          console.log(`Built ${batchElements.length} elements from batch data`);
          
          // อัปเดต elements โดยใช้ฟังก์ชันที่ปรับปรุงค่าแทนการส่ง function กลับ
          const newElements = elements.length > 0 
            ? [...elements, ...batchElements] 
            : batchElements;
            
          console.log(`Setting ${newElements.length} elements (${elements.length} existing + ${batchElements.length} new)`);
          setElements(newElements);
          
          // อัปเดต QR code และ barcode
          setTimeout(() => {
            console.log('Updating QR codes and barcodes after batch data applied');
            updateAllQrCodes(newElements.filter(el => el.type === 'qr'));
            updateAllBarcodes(newElements.filter(el => el.type === 'barcode'));
          }, 300); // เพิ่ม delay เป็น 300ms
          
          message.success('โหลดข้อมูล batch สำเร็จ');
          batchAppliedRef.current[batchNumber] = true;
        } else {
          console.error('Failed to load batch data');
          message.error('เกิดข้อผิดพลาดในการโหลดข้อมูล batch');
        }
      } catch (error) {
        console.error('Error in fetchAndApplyBatch:', error);
        message.error('เกิดข้อผิดพลาดในการดึงข้อมูล batch');
      }
    },
    [buildElementsFromBatch, fetchBatchData, updateAllQrCodes, updateAllBarcodes, initialTemplate, router.query, elements, setElements, clearCache]
  );
  
  /**
   * เพิ่ม element ใหม่
   */
  const handleAddElement = useCallback((type: string) => {
    let newElement: ElementType;
    
    const centerX = canvasSize.width / 2 - 50;
    const centerY = canvasSize.height / 2 - 50;
    
    switch (type) {
      case 'text':
        newElement = {
          id: uuidv4(),
          type: 'text',
          x: centerX,
          y: centerY,
          width: 100,
          height: 30,
          text: 'ข้อความ',
          fontSize: 16,
          fontFamily: 'Arial',
          fill: '#000000',
          align: 'center',
          draggable: true,
          visible: true
        };
        break;
      case 'rect':
        newElement = {
          id: uuidv4(),
          type: 'rect',
          x: centerX,
          y: centerY,
          width: 100,
          height: 100,
          fill: '#e0e0e0',
          draggable: true,
          visible: true
        };
        break;
      case 'barcode':
        newElement = {
          id: uuidv4(),
          type: 'barcode',
          x: centerX,
          y: centerY,
          width: 200,
          height: 90,
          value: '12345678',
          format: 'CODE128',
          fill: '#000000',
          draggable: true,
          visible: true,
          displayValue: true,
          fontSize: 14,
          fontFamily: 'monospace',
          textAlign: 'center',
          textPosition: 'bottom',
          textMargin: 2,
          background: '#FFFFFF',
          lineColor: '#000000',
          margin: 5
        };
        break;
      case 'qr':
        newElement = {
          id: uuidv4(),
          type: 'qr',
          x: centerX,
          y: centerY,
          width: 100,
          height: 100,
          value: 'https://example.com',
          fill: '#000000',
          draggable: true,
          visible: true
        };
        break;
      case 'line':
        newElement = {
          id: uuidv4(),
          type: 'line',
          x: centerX,
          y: centerY,
          width: 200,
          height: 2,
          fill: '#000000',
          draggable: true,
          visible: true
        };
        break;
      default:
        return;
    }
    
    addElement(newElement);
    selectElement(newElement.id);
    
    if (type === 'qr') {
      setTimeout(() => {
        updateQrDataUrl(newElement as any);
      }, 100);
    } else if (type === 'barcode') {
      setTimeout(() => {
        updateBarcodeDataUrl(newElement as any);
      }, 100);
    }
  }, [canvasSize, addElement, selectElement, updateQrDataUrl, updateBarcodeDataUrl]);
  
  /**
   * หมุน element ที่เลือก
   */
  const handleRotateElement = useCallback(() => {
    if (!selectedId) return;
    
    const selectedElement = elements.find(el => el.id === selectedId);
    if (selectedElement) {
      const newRotation = ((selectedElement.rotation || 0) + 90) % 360;
      updateElementProperty(selectedId, 'rotation', newRotation);
    }
  }, [selectedId, elements, updateElementProperty]);
  
  /**
   * บันทึกการตั้งค่าเทมเพลต
   */
  const handleSaveTemplateSettings = useCallback((newTemplateInfo: TemplateInfo, newCanvasSize: CanvasSize) => {
    setTemplateInfo(newTemplateInfo);
    resizeCanvas(newCanvasSize);
    setTemplateInfoModal(false);
  }, [resizeCanvas]);
  
  /**
   * บันทึกเทมเพลต
   */
  const handleSaveTemplate = useCallback(async () => {
    const result = await saveTemplate(templateInfo, elements, canvasSize, batchNo);
    if (result) {
      setTemplateInfoModal(false);
    }
  }, [saveTemplate, templateInfo, elements, canvasSize, batchNo]);
  
  /**
   * ส่งออกเทมเพลตเป็น JSON
   */
  const handleExportTemplate = useCallback(() => {
    const jsonData = exportTemplateAsJson(elements, canvasSize);
    
    // สร้าง Blob และ URL
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // สร้างลิงก์ดาวน์โหลด
    const a = document.createElement('a');
    a.href = url;
    a.download = `${templateInfo.name || 'template'}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    
    // ทำความสะอาด
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    message.success('ส่งออกเทมเพลตสำเร็จ');
  }, [exportTemplateAsJson, elements, canvasSize, templateInfo.name]);
  
  /**
   * นำเข้าเทมเพลตจาก JSON
   */
  const handleImportTemplate = useCallback(() => {
    setImportModal(true);
  }, []);
  
  /**
   * ยืนยันการนำเข้า JSON
   */
  const handleConfirmImport = useCallback(() => {
    try {
      // ล้าง cache ก่อนนำเข้า template ใหม่
      clearCache();
      
      const result = importTemplateFromJson(importJson);
      
      if (result) {
        replaceAllElements(result.elements);
        resizeCanvas(result.canvasSize);
        
        // เพิ่ม delay ในการอัพเดต QR และ Barcode หลังจากนำเข้า
        setTimeout(() => {
          const qrElements = result.elements.filter(el => el.type === 'qr');
          const barcodeElements = result.elements.filter(el => el.type === 'barcode');
          
          if (qrElements.length > 0) {
            console.log(`Updating ${qrElements.length} QR elements after JSON import`);
            updateAllQrCodes(qrElements);
          }
          
          if (barcodeElements.length > 0) {
            console.log(`Updating ${barcodeElements.length} barcode elements after JSON import`);
            updateAllBarcodes(barcodeElements);
          }
        }, 500);
        
        setImportModal(false);
        setImportJson('');
        message.success('นำเข้าเทมเพลตสำเร็จ');
      }
    } catch (error: any) {
      message.error(`เกิดข้อผิดพลาดในการนำเข้าเทมเพลต: ${error.message}`);
    }
  }, [importJson, importTemplateFromJson, replaceAllElements, resizeCanvas, updateAllQrCodes, updateAllBarcodes, clearCache]);
  
  // อัปเดตฟังก์ชันตอบสนองการกดปุ่ม "เติมข้อมูล Batch"
  const handleUseBatchData = useCallback(() => {
    if (!batchNo) {
      message.error('กรุณาระบุเลข Batch');
      return;
    }
    
    // เรียกใช้ฟังก์ชันดึงข้อมูล batch
    fetchAndApplyBatch(batchNo);
  }, [batchNo, fetchAndApplyBatch]);

  return (
    <div className="template-designer">
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ paddingLeft: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>
            Label Template Designer
          </div>
          <DesignerToolbar
            onSave={handleSaveTemplate}
            onExport={handleExportTemplate}
            onImport={handleImportTemplate}
            onUndo={undo}
            onRedo={redo}
            onDelete={() => selectedId && deleteElement(selectedId)}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onTemplateSettings={() => setTemplateInfoModal(true)}
            onDuplicate={() => selectedId && duplicateElement(selectedId)}
            onRotate={handleRotateElement}
            canUndo={canUndo}
            canRedo={canRedo}
            canDelete={!!selectedId}
            canDuplicate={!!selectedId}
            isSaving={isSaving}
            zoom={zoom}
          />
        </Header>
        <Layout>
          <Sider width={250} style={{ background: '#fff' }}>
            <DesignerSidebar
              onAddElement={handleAddElement}
              batchNo={batchNo}
              onBatchNoChange={setBatchNo}
              onApplyBatchData={handleUseBatchData}
              isLoading={batchLoading}
            />
          </Sider>
          
          <Content style={{ padding: '20px', background: '#f0f2f5' }}>
            <div style={{ 
              background: '#fff', 
              padding: '16px', 
              borderRadius: '4px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              height: 'calc(100vh - 104px)',
              overflow: 'auto'
            }}>
              <div
                style={{
                  border: '1px solid #ddd',
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  position: 'relative',
                  overflow: 'auto'
                }}
              >
                <div
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: '50% 50%',
                    position: 'relative'
                  }}
                >
                  {isClient && (
                    <Stage
                      width={canvasSize.width}
                      height={canvasSize.height}
                      ref={stageRef}
                      style={{ 
                        background: '#fff',
                        boxShadow: '0 0 10px rgba(0,0,0,0.2)'
                      }}
                      onClick={(e: any) => {
                        // ยกเลิกการเลือกถ้าคลิกพื้นที่ว่าง
                        if (e.target === e.currentTarget) {
                          selectElement(null);
                        }
                      }}
                    >
                      <Layer>
                        {/* แสดงเส้นตาราง grid ถ้าต้องการ */}
                        {FEATURES.SNAPPING.ENABLED && Array.from({ length: Math.ceil(canvasSize.width / FEATURES.SNAPPING.GRID_SIZE) }).map((_, i) => (
                          <Line
                            key={`vgrid-${i}`}
                            points={[i * FEATURES.SNAPPING.GRID_SIZE, 0, i * FEATURES.SNAPPING.GRID_SIZE, canvasSize.height]}
                            stroke="#ddd"
                            strokeWidth={i % 5 === 0 ? 0.5 : 0.2}
                          />
                        ))}
                        {FEATURES.SNAPPING.ENABLED && Array.from({ length: Math.ceil(canvasSize.height / FEATURES.SNAPPING.GRID_SIZE) }).map((_, i) => (
                          <Line
                            key={`hgrid-${i}`}
                            points={[0, i * FEATURES.SNAPPING.GRID_SIZE, canvasSize.width, i * FEATURES.SNAPPING.GRID_SIZE]}
                            stroke="#ddd"
                            strokeWidth={i % 5 === 0 ? 0.5 : 0.2}
                          />
                        ))}
                        
                        {/* แสดง elements */}
                        {elements.map((el) => (
                          <Group
                            key={el.id}
                            id={el.id}
                            draggable={!el.locked && (el.draggable !== false)}
                            x={el.x}
                            y={el.y}
                            width={el.width}
                            height={el.height}
                            rotation={el.rotation || 0}
                            onClick={(e: any) => {
                              // เลือก element
                              e.cancelBubble = true;
                              selectElement(el.id);
                            }}
                            visible={el.visible !== false}
                            opacity={el.visible === false ? 0.4 : 1}
                            onDragEnd={(e: any) => {
                              // อัพเดตตำแหน่งเมื่อลากเสร็จ
                              const { x, y } = e.target.position();
                              updateElementProperty(el.id, 'x', x);
                              updateElementProperty(el.id, 'y', y);
                            }}
                            onTransformEnd={(e: any) => {
                              // อัพเดตขนาดและมุมหมุนเมื่อปรับเสร็จ
                              const node = e.target;
                              const scaleX = node.scaleX();
                              const scaleY = node.scaleY();
                              
                              // รีเซ็ตสเกลและอัพเดตขนาด
                              node.scaleX(1);
                              node.scaleY(1);
                              
                              const updatedEl = {
                                ...el,
                                x: node.x(),
                                y: node.y(),
                                width: Math.max(5, node.width() * scaleX),
                                height: Math.max(5, node.height() * scaleY),
                                rotation: node.rotation()
                              };
                              
                              updateElement(updatedEl);
                            }}
                          >
                            <ElementRenderer
                              element={el}
                              qrDataUrls={qrDataUrls}
                              qrImages={qrImages}
                              barcodeDataUrls={barcodeDataUrls}
                              barcodeImages={barcodeImages}
                              updateQrDataUrl={updateQrDataUrl}
                              updateBarcodeDataUrl={updateBarcodeDataUrl}
                              isSelected={selectedId === el.id}
                            />
                            
                            {/* แสดงเส้นขอบเมื่อเลือก element */}
                            {selectedId === el.id && (
                              <Rect
                                x={0}
                                y={0}
                                width={el.width}
                                height={el.height}
                                stroke="#1890ff"
                                strokeWidth={1}
                                dash={[4, 4]}
                                fill="transparent"
                              />
                            )}
                          </Group>
                        ))}
                        
                        {/* Transformer สำหรับปรับขนาด element ที่เลือก */}
                        {selectedId && (
                          <Transformer
                            ref={trRef}
                            rotateEnabled={true}
                            keepRatio={false}
                            boundBoxFunc={(oldBox, newBox) => {
                              // จำกัดขนาดไม่ให้เล็กเกินไป
                              if (newBox.width < 5 || newBox.height < 5) {
                                return oldBox;
                              }
                              return newBox;
                            }}
                          />
                        )}
                      </Layer>
                    </Stage>
                  )}
                </div>
              </div>
            </div>
          </Content>
        </Layout>
      </Layout>
      
      {/* Modal การตั้งค่าเทมเพลต */}
      <TemplateSettingsModal
        visible={templateInfoModal}
        onCancel={() => setTemplateInfoModal(false)}
        onSave={handleSaveTemplateSettings}
        templateInfo={templateInfo}
        canvasSize={canvasSize}
        loading={isSaving}
      />
      
      {/* Modal การนำเข้า JSON */}
      <Modal
        title="นำเข้าเทมเพลตจาก JSON"
        open={importModal}
        onCancel={() => {
          setImportModal(false);
          setImportJson('');
        }}
        onOk={handleConfirmImport}
        width={700}
      >
        <Input.TextArea
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          placeholder="วาง JSON ที่นี่..."
          rows={10}
        />
      </Modal>
    </div>
  );
};

export default TemplateDesigner; 