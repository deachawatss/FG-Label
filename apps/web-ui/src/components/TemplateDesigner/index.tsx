import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Layout, message, Modal, Input, Collapse } from 'antd';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';

// Import components
import { DesignerSidebar } from './DesignerSidebar';
import { DesignerToolbar } from './DesignerToolbar';
import { ElementRenderer } from './ElementRenderer';
import { TemplateSettingsModal } from './TemplateSettingsModal';
import { PropertyPanel } from './PropertyPanel';
import BatchDataSelectionModal from './BatchDataSelectionModal';

// Import custom hooks
import { useQrAndBarcodeUtils } from '../../hooks/designer/useQrAndBarcodeUtils';
import { useBatchData } from '../../hooks/designer/useBatchData';
import { useElementReducer } from '../../hooks/designer/useElementReducer';
import { useTemplateActions } from '../../hooks/designer/useTemplateActions';
import { useCanvasRenderer } from '../../hooks/designer/useCanvasRenderer';

// Import types and constants
import { ElementType, TemplateInfo, CanvasSize, GroupElement } from '../../models/TemplateDesignerTypes';
import { FEATURES, KEYBOARD_SHORTCUTS } from '../../utils/template/constants';
import { getMessages, getMessage, setLocale } from '../../utils/template/locales';
import { getFileInput, loadImageFile, downloadJsonTemplate, cleanupFileResources } from '../../utils/template/fileUtils';
import { getApiBaseUrl } from '../../utils/template/helpers';

// Check if running on client side
const isClient = typeof window !== 'undefined';

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

// ค่าสัมประสิทธิ์สำหรับภาษาต่าง ๆ
const LANGUAGE_COEFFICIENTS = {
  latin: { width: 0.6, height: 1.2 },
  arabic: { width: 1.0, height: 1.6 },  // ลดค่าสัมประสิทธิ์เพื่อให้ค่าฟอนต์ไม่เล็กเกินไป
  hebrew: { width: 0.9, height: 1.6 },  // ลดค่าสัมประสิทธิ์เพื่อให้ค่าฟอนต์ไม่เล็กเกินไป
  thai: { width: 0.7, height: 1.4 },
  japanese: { width: 1.0, height: 1.2 },
  chinese: { width: 1.0, height: 1.2 },
  korean: { width: 1.0, height: 1.2 }
};

// Custom utility function to restrict element within canvas boundaries
const keepElementInCanvas = (element: ElementType, canvas: CanvasSize): ElementType => {
  // Create a new element with the same properties
  const result = {
    ...element,
    // Enforce minimum positions (don't move out of left/top edges)
    x: Math.max(0, element.x),
    y: Math.max(0, element.y)
  };
  
  // Enforce maximum positions (don't move out of right/bottom edges)
  if (result.width && canvas.width) {
    result.x = Math.min(result.x, canvas.width - result.width);
  }
  
  if (result.height && canvas.height) {
    result.y = Math.min(result.y, canvas.height - result.height);
  }
  
  return result;
};

// Import client-only modules
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
const { Panel } = Collapse;

// ค่า default สำหรับการคำนวณฟอนต์
const DEFAULT_FONT_SIZE = 18;
const FONT_SIZE_COEFFICIENT = 0.6;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 72;

interface TemplateDesignerProps {
  templateId?: string;
  initialTemplate?: any;
  initialTemplateFromLocalStorage?: boolean;
  locale?: string;
}

/**
 * Main component for Template Designer
 */
const TemplateDesigner: React.FC<TemplateDesignerProps> = ({ 
  templateId: templateIdProp, 
  initialTemplate,
  initialTemplateFromLocalStorage,
  locale = 'en'
}) => {
  // Set locale
  useEffect(() => {
    setLocale(locale as any);
  }, [locale]);
  
  // Messages for localization
  const msgs = getMessages().templateDesigner;
  
  // State variables
  const [batchNo, setBatchNo] = useState<string>('');
  const [batchError, setBatchError] = useState<string | null>(null);
  const [templateInfoModal, setTemplateInfoModal] = useState<boolean>(false);
  const [importJson, setImportJson] = useState<string>('');
  const [importModal, setImportModal] = useState<boolean>(false);
  const [isTemplateLoading, setIsTemplateLoading] = useState<boolean>(false);
  const [templateLoaded, setTemplateLoaded] = useState<boolean>(false);
  const [batchInfo, setBatchInfo] = useState<any>(null);
  const [batchDataSelectionModalVisible, setBatchDataSelectionModalVisible] = useState<boolean>(false);
  const [selectedBatchRow, setSelectedBatchRow] = useState<any>(null);
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo>({
    name: '',
    description: '',
    productKey: '',
    customerKey: '',
    paperSize: '4x4',
    orientation: 'Portrait',
    templateType: 'INNER',
    labelType: 'Standard'
  });

  // Refs for tracking statuses
  const templateLoadedRef = useRef<boolean>(false);
  const initialRenderRef = useRef<boolean>(true);
  const batchAppliedRef = useRef<{[key: string]: boolean}>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Ref เพื่อเก็บสถานะว่าได้แสดง warning เกี่ยวกับการ constrain element แล้วหรือไม่
  const hasShowedConstrainWarningRef = useRef<boolean>(false);

  // Router for navigation and URL parameters
  const router = useRouter();
  
  // Custom hooks
  const { 
    qrDataUrls, qrImages, barcodeDataUrls, barcodeImages,
    debouncedUpdateQrDataUrl, debouncedUpdateBarcodeDataUrl, 
    updateAllQrCodes, updateAllBarcodes,
    clearCache
  } = useQrAndBarcodeUtils();
  
  const {
    loading: batchLoading,
    fetchBatchData,
    buildElementsFromBatch
  } = useBatchData();
  
  const {
    elements,
    qrElements,
    barcodeElements,
    canUndo,
    canRedo,
    addElement,
    updateElement,
    updateElementProperty,
    deleteElement,
    deleteElements,
    duplicateElement,
    replaceAllElements,
    createGroup,
    ungroup,
    moveElementToTop,
    moveElementToBottom,
    moveElementUp,
    moveElementDown,
    undo,
    redo
  } = useElementReducer([]);
  
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
    setDragSelection,
    findNode
  } = useCanvasRenderer();

  // State สำหรับการแก้ไขข้อความโดยตรง
  const [editingText, setEditingText] = useState<boolean>(false);
  const [editingTextPosition, setEditingTextPosition] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [editingTextValue, setEditingTextValue] = useState<string>('');
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  
  // Ref เพื่อเก็บ ID ของ text element ที่กำลังถูกแก้ไข
  const editingTextIdRef = useRef<string | null>(null);
  
  // Ref สำหรับเก็บ handler ของ keyboard event
  const keyboardHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});

  // Side Effects
  
  // Load template when templateId is present - adjust useEffect logic
  useEffect(() => {
    // Check if ready to load
    if (!router.isReady) return;
    
    // ตรวจสอบว่ามี id ส่งมาจากหน้า TemplateManagement หรือไม่
    const urlTemplateId = router.query.id as string;
    
    // ถ้ามี id ใหม่จาก URL และไม่ตรงกับ templateId ที่มีอยู่ ให้กำหนดค่าใหม่
    if (urlTemplateId && urlTemplateId !== templateId) {
      setTemplateId(urlTemplateId);
      if (process.env.NODE_ENV === 'development') {
        console.log(`Setting templateId from URL: ${urlTemplateId}`);
      }
    }
    
    // Skip loading if already loaded via templateLoadedRef
    if (templateLoadedRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Skip loading template: already loaded via templateLoadedRef');
      }
      return;
    }
    
    // Skip if loading in progress
    if (isTemplateLoading) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Skip loading template: loading in progress');
      }
      return;
    }
    
    // Skip if templateLoaded is true
    if (templateLoaded) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Skip loading template: already loaded via templateLoaded state');
      }
      templateLoadedRef.current = true;
      return;
    }

    const loadInitialTemplate = async () => {
      try {
        setIsTemplateLoading(true);
        if (process.env.NODE_ENV === 'development') {
          console.log('Starting to load initial template...');
        }
        
        // อย่าเคลียร์ cache ก่อนโหลด! ย้ายออกไปจากตรงนี้
        // ถ้าจำเป็นต้องเคลียร์ อย่างน้อยต้องทำแค่เมื่อ templateId เปลี่ยนเท่านั้น
        /*
        if (initialRenderRef.current) {
          if (process.env.NODE_ENV === 'development') {
            console.log('Initial render, clearing cache');
          }
          clearCache();
          initialRenderRef.current = false;
        }
        */
        
        // Check for URL parameters
        const { labelType, productKey, customerKey } = router.query;
        
        // Check if template should be loaded from localStorage based on labelType
        if (labelType && typeof labelType === 'string') {
          const localStorageTemplate = localStorage.getItem('batchSearchTemplate');
          if (localStorageTemplate) {
            try {
              console.log(`Found template in localStorage with labelType=${labelType}`);
              const template = JSON.parse(localStorageTemplate);
              
              if (template.elements && Array.isArray(template.elements)) {
                console.log(`Loading ${template.elements.length} elements from localStorage`);
                
                replaceAllElements(template.elements);
                
                if (template.canvasSize) {
                  resizeCanvas(template.canvasSize);
                }
                
                // Update QR codes and barcodes
                updateAllQrCodes(template.elements.filter(el => el.type === 'qr'));
                updateAllBarcodes(template.elements.filter(el => el.type === 'barcode'));
                
                // Set template info with labelType from URL
                setTemplateInfo({
                  name: template.templateInfo?.name || `New Template ${new Date().toISOString().slice(0, 10)}`,
                  description: template.templateInfo?.description || '',
                  productKey: productKey as string || template.templateInfo?.productKey || '',
                  customerKey: customerKey as string || template.templateInfo?.customerKey || '',
                  paperSize: template.templateInfo?.paperSize || '4x4',
                  orientation: template.templateInfo?.orientation || 'Portrait',
                  templateType: template.templateInfo?.templateType || 'Standard',
                  labelType: labelType as 'Standard' | 'Special'
                });
                
                // Clear localStorage after loading
                localStorage.removeItem('batchSearchTemplate');
                
                setTemplateLoaded(true);
                templateLoadedRef.current = true;
                return;
              }
            } catch (error) {
              console.error('Error parsing template from localStorage:', error);
              // Continue with normal loading flow
            }
          }
        }

        // ตรวจสอบว่าต้องโหลดเทมเพลตจาก API ตาม ID หรือไม่
        const idFromUrl = router.query.id as string;
        if (idFromUrl) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`Loading template by ID from URL: ${idFromUrl}`);
          }
          
          try {
            // โหลดข้อมูลเทมเพลตจาก API
            const templateData = await loadTemplate(idFromUrl);
            if (templateData) {
              const { templateInfo: loadedTemplateInfo, elements: loadedElements, canvasSize: loadedCanvasSize } = templateData;
              
              // บันทึกข้อมูลลงในสถานะ
              setTemplateInfo(loadedTemplateInfo);
              replaceAllElements(loadedElements);
              resizeCanvas(loadedCanvasSize);
              
              // อัปเดต QR codes และ barcodes
              updateAllQrCodes(loadedElements.filter(el => el.type === 'qr'));
              updateAllBarcodes(loadedElements.filter(el => el.type === 'barcode'));
              
              setTemplateLoaded(true);
              templateLoadedRef.current = true;
              
              // ถ้าจำเป็นต้องเคลียร์ cache ให้ทำหลังจากโหลดเสร็จ
              if (initialRenderRef.current) {
                if (process.env.NODE_ENV === 'development') {
                  console.log('Clearing cache after template load completed');
                }
                // clearCache(); // ถ้าจำเป็นต้องเคลียร์ ให้เอาคอมเมนต์ออก
                initialRenderRef.current = false;
              }
              
              return;
            }
          } catch (err) {
            console.error('Error loading template by ID:', err);
            message.error('Failed to load template. Creating a new one instead.');
          }
        }

        // Check if initialTemplate is provided
        if (initialTemplate) {
          if (process.env.NODE_ENV === 'development') {
            console.log('initialTemplate provided directly:', initialTemplate);
          }
          
          // Case when initialTemplate comes from batch-search and passed via Props
          if (initialTemplateFromLocalStorage && initialTemplate.elements) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`Found ${initialTemplate.elements.length} elements directly in initialTemplate from localStorage`);
            }
            
            replaceAllElements(initialTemplate.elements);
            
            if (initialTemplate.canvasSize) {
              if (process.env.NODE_ENV === 'development') {
                console.log('Using canvasSize from initialTemplate:', initialTemplate.canvasSize);
              }
              resizeCanvas(initialTemplate.canvasSize);
            }
            
            // Update QR codes and barcodes
            updateAllQrCodes(initialTemplate.elements.filter(el => el.type === 'qr'));
            updateAllBarcodes(initialTemplate.elements.filter(el => el.type === 'barcode'));
            
            // Set templateInfo from initialTemplate
            setTemplateInfo({
              name: initialTemplate.name || '',
              description: initialTemplate.description || '',
              productKey: initialTemplate.productKey || '',
              customerKey: initialTemplate.customerKey || '',
              paperSize: initialTemplate.paperSize || '4x4',
              orientation: initialTemplate.orientation || 'Portrait',
              templateType: initialTemplate.templateType || 'Standard',
              labelType: initialTemplate.labelType || 'Standard'
            });
            
            // If data comes from localStorage and batchNo is in URL parameters
            // Set batchAppliedRef to prevent calling again
            const { batchNo: batchNoParam } = router.query;
            if (batchNoParam && typeof batchNoParam === 'string') {
              if (process.env.NODE_ENV === 'development') {
                console.log(`Setting batchAppliedRef for ${batchNoParam} to true as data loaded from localStorage`);
              }
              batchAppliedRef.current[batchNoParam] = true;
              setBatchNo(batchNoParam);
            }
            
            setTemplateLoaded(true);
            templateLoadedRef.current = true;
            return;
          }
          
          // Case when initialTemplate comes from API or format is string that needs to be converted
          if (typeof initialTemplate.content === 'string') {
            if (process.env.NODE_ENV === 'development') {
              console.log('Content is string, parsing to JSON...');
            }
            
            try {
              const contentObj = JSON.parse(initialTemplate.content);
              
              if (contentObj.elements && Array.isArray(contentObj.elements)) {
                if (process.env.NODE_ENV === 'development') {
                  console.log(`Found ${contentObj.elements.length} elements in content string`);
                }
                
                replaceAllElements(contentObj.elements);
                
                if (contentObj.canvasSize) {
                  if (process.env.NODE_ENV === 'development') {
                    console.log('Using canvasSize from content:', contentObj.canvasSize);
                  }
                  resizeCanvas(contentObj.canvasSize);
                }
                
                // Update QR codes and barcodes
                updateAllQrCodes(contentObj.elements.filter(el => el.type === 'qr'));
                updateAllBarcodes(contentObj.elements.filter(el => el.type === 'barcode'));
                
                // Set templateInfo from initialTemplate
                setTemplateInfo({
                  name: initialTemplate.name || '',
                  description: initialTemplate.description || '',
                  productKey: initialTemplate.productKey || '',
                  customerKey: initialTemplate.customerKey || '',
                  paperSize: initialTemplate.paperSize || '4x4',
                  orientation: initialTemplate.orientation || 'Portrait',
                  templateType: initialTemplate.templateType || 'Standard',
                  labelType: initialTemplate.labelType || 'Standard'
                });
                
                setTemplateLoaded(true);
                templateLoadedRef.current = true;
              } else {
                if (process.env.NODE_ENV === 'development') {
                  console.warn('No elements array found in parsed content');
                }
                setTemplateLoaded(true);
                templateLoadedRef.current = true;
              }
            } catch (e) {
              if (process.env.NODE_ENV === 'development') {
                console.error('Error parsing initialTemplate content:', e);
              }
              message.error('Error parsing template data');
              setTemplateLoaded(true);
              templateLoadedRef.current = true;
            }
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.warn('initialTemplate provided but no valid elements found');
            }
            replaceAllElements([]);
            setTemplateLoaded(true);
            templateLoadedRef.current = true;
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log('No initialTemplate provided, using empty template');
          }
          replaceAllElements([]);
          setTemplateLoaded(true);
          templateLoadedRef.current = true;
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error in loadInitialTemplate:', error);
        }
        message.error('Error loading template data');
        setTemplateLoaded(true);
        templateLoadedRef.current = true;
      } finally {
        setIsTemplateLoading(false);
      }
    };

    loadInitialTemplate();
  }, [initialTemplate, initialTemplateFromLocalStorage, router.query, router.isReady, clearCache, resizeCanvas, replaceAllElements, updateAllQrCodes, updateAllBarcodes, templateId, setTemplateId, loadTemplate]);
  
  // Update QR codes and Barcodes when elements change - adjust useEffect logic
  useEffect(() => {
    if (elements.length === 0) return;
    
    // Filter out only qr and barcode elements that don't have dataUrl
    const qrElementsToUpdate = elements
      .filter(el => el.type === 'qr' && !qrDataUrls[el.id]);
    
    const barcodeElementsToUpdate = elements
      .filter(el => el.type === 'barcode' && !barcodeDataUrls[el.id]);
    
    if (qrElementsToUpdate.length > 0) {
      qrElementsToUpdate.forEach(el => {
        debouncedUpdateQrDataUrl(el as any);
      });
    }
    
    if (barcodeElementsToUpdate.length > 0) {
      barcodeElementsToUpdate.forEach(el => {
        debouncedUpdateBarcodeDataUrl(el as any);
      });
    }
  }, [elements, qrDataUrls, barcodeDataUrls, debouncedUpdateQrDataUrl, debouncedUpdateBarcodeDataUrl]);
  
  // แยก handleKeyDown ออกเป็น useCallback เพื่อป้องกันการสร้างใหม่ทุกครั้ง
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // If editing text in input/textarea, don't delete element
    const isEditingText = document.activeElement?.tagName === 'INPUT' || 
                         document.activeElement?.tagName === 'TEXTAREA' || 
                         document.activeElement?.getAttribute('role') === 'textbox';
    
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
    // Delete/Backspace - adjust to check if focus is on input or not
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditingText) {
      e.preventDefault();
      // Delete all selected elements
      if (selectedIds.length > 0) {
        selectedIds.forEach(id => deleteElement(id));
        selectElement(null);
      } else if (selectedId) {
        deleteElement(selectedId);
        selectElement(null);
      }
    }
    // Ctrl+D (Duplicate)
    else if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedId) {
      e.preventDefault();
      duplicateElement(selectedId);
    }
    // Ctrl+Shift+G (Ungroup) 
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'g') {
      e.preventDefault();
      const selectedElement = elements.find(el => el.id === selectedId);
      if (selectedElement && selectedElement.type === 'group') {
        ungroup(selectedId);
        message.success(msgs.success.ungroupElements);
      } else {
        message.warning(msgs.warnings.onlyGroupsCanBeUngrouped);
      }
    }
    // Ctrl+G (Group)
    else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'g') {
      e.preventDefault();
      if (selectedIds.length >= 2) {
        createGroup(selectedIds);
        message.success(msgs.success.groupElements);
      } else {
        message.warning(msgs.warnings.selectTwoElements);
      }
    }
  }, [undo, redo, deleteElement, duplicateElement, selectedId, selectedIds, selectElement, createGroup, ungroup, elements]);
  
  // อัปเดต ref เมื่อ handleKeyDown เปลี่ยน
  useEffect(() => {
    keyboardHandlerRef.current = handleKeyDown;
  }, [handleKeyDown]);
  
  // Set keyboard shortcuts for undo, redo, delete, duplicate, group, ungroup
  useEffect(() => {
    if (!isClient) return;
    
    // ใช้ event handler ที่เรียก ref.current
    const eventHandler = (e: KeyboardEvent) => keyboardHandlerRef.current(e);
    
    // ลงทะเบียนเพียงครั้งเดียว
    window.addEventListener('keydown', eventHandler);
    
    // ทำความสะอาดเมื่อ unmount
    return () => window.removeEventListener('keydown', eventHandler);
  }, []); // ไม่มี dependency เพื่อให้ effect ทำงานเพียงครั้งเดียว

  // Event handlers
  
  /**
   * Function to fetch and apply batch data
   */
  const fetchAndApplyBatch = useCallback(
    async (batchNumber: string) => {
      if (!batchNumber || batchNumber.trim() === '') {
        message.error(msgs.errors.invalidBatchNumber);
        return;
      }
      
      // Skip if already applied or if template not loaded
      if (batchAppliedRef.current[batchNumber] || !templateLoaded) {
        return;
      }
      
      // Skip if data already from localStorage
      if (initialTemplateFromLocalStorage && batchNo === batchNumber) {
        batchAppliedRef.current[batchNumber] = true;
        return;
      }
      
      try {
        // Clear cache if no elements
        if (elements.length === 0) {
          clearCache();
        }
        
        // Read showQR parameter from URL
        const { showQR } = router.query;
        const options = { showQR: showQR === 'true' || showQR === '1' };
        
        // Fetch and process batch data
        const result = await fetchBatchData(batchNumber);
        
        if (result) {
          // Store batch info
          setBatchInfo({
            batchNo: batchNumber,
            productName: result.productName,
            productKey: result.productKey,
            customerKey: result.customerKey
          });
          
          const batchElements = buildElementsFromBatch(result, options);
          
          // Instead of using replaceAllElements which resets history
          // Add elements to the existing list
          if (batchElements.length > 0) {
            // If we have batch elements, we should add them to the existing list
            // Since there's no addElements function, we'll do it this way
            const appendElements = () => {
              // Store current elements
              const currentElements = [...elements];
              
              // หาค่า layer มากที่สุดในอาร์เรย์ปัจจุบัน
              const maxLayer = currentElements.length > 0
                ? Math.max(...currentElements.map(el => el.layer || 0))
                : 0;
              
              // กำหนดค่า layer ให้กับองค์ประกอบที่จะเพิ่ม - ค่าสูงขึ้นเรื่อยๆ ตามลำดับที่ใส่
              // ใช้ช่วงกว้างเพื่อให้มีพื้นที่สำหรับแทรกในอนาคต
              const batchElementsWithLayers = batchElements.map((el, index) => ({
                ...el,
                layer: maxLayer + ((index + 1) * 10) // ให้องค์ประกอบใหม่อยู่บนสุด
              }));
              
              // สร้างลิสต์ใหม่ด้วยองค์ประกอบทั้งหมด - เพิ่มองค์ประกอบใหม่ไว้ที่ต้นอาร์เรย์
              const newElements = [...batchElementsWithLayers, ...currentElements];
              
              // Call replaceAllElements with all elements
              replaceAllElements(newElements);
            };
            
            // Call the function we created
            appendElements();
            
            // Update QR codes and barcodes
            updateAllQrCodes(batchElements.filter(el => el.type === 'qr'));
            updateAllBarcodes(batchElements.filter(el => el.type === 'barcode'));
            
            message.success(msgs.success.batchData);
            batchAppliedRef.current[batchNumber] = true;
          } else {
            message.info('No elements found in batch data');
          }
        } else {
          message.error(msgs.errors.batchDataFailed);
        }
      } catch (error) {
        console.error('Error in fetchAndApplyBatch:', error);
        message.error(msgs.errors.batchDataFailed);
      }
    },
    [buildElementsFromBatch, fetchBatchData, updateAllQrCodes, updateAllBarcodes, router.query, elements, replaceAllElements, clearCache, initialTemplateFromLocalStorage, batchNo, templateLoaded, msgs]
  );
  
  // Check query parameters when loading
  useEffect(() => {
    if (!router.isReady) return;
    
    const { batchNo: batchNoParam, syncBatch, productKey, customerKey } = router.query;
    
    if (batchNoParam && typeof batchNoParam === 'string') {
      setBatchNo(batchNoParam);
      
      // Apply batch data if syncBatch=true and template loaded
      if (syncBatch === 'true' && templateLoaded && !batchAppliedRef.current[batchNoParam] && !initialTemplateFromLocalStorage) {
        fetchAndApplyBatch(batchNoParam);
      }
    }
    
    // Update template info from URL params
    if (productKey && typeof productKey === 'string') {
      setTemplateInfo(prev => ({ ...prev, productKey }));
    }
    
    if (customerKey && typeof customerKey === 'string') {
      setTemplateInfo(prev => ({ ...prev, customerKey }));
    }
  }, [router.isReady, router.query, templateLoaded, fetchAndApplyBatch, initialTemplateFromLocalStorage]);
  
  /**
   * Add new element
   */
  const handleAddElement = useCallback((type: string) => {
    let newElement: ElementType;
    
    // Calculate center position and ensure elements are fully visible within canvas
    const centerX = Math.max(10, Math.min(canvasSize.width / 2 - 25, canvasSize.width - 100));
    const centerY = Math.max(10, Math.min(canvasSize.height / 2 - 25, canvasSize.height - 50));
    
    switch (type) {
      case 'text':
        const fontSize = 18;
        const textContent = 'Text';
        // ปรับค่าสัมประสิทธิ์ให้มากขึ้นเพื่อให้ความกว้างมากขึ้นกว่าเดิมและมีพื้นที่เพียงพอสำหรับข้อความ
        const estimatedWidth = Math.max(120, textContent.length * fontSize * 1.5);
        // Height is typically ~1.2x fontSize for single line, เพิ่มพื้นที่ให้มากขึ้น
        const estimatedHeight = Math.max(40, fontSize * 2.5);
        
        // Ensure text element fits within canvas
        const textX = Math.min(centerX, canvasSize.width - estimatedWidth);
        const textY = Math.min(centerY, canvasSize.height - estimatedHeight);
        
        newElement = {
          id: uuidv4(),
          type: 'text',
          x: textX,
          y: textY,
          width: estimatedWidth,
          height: estimatedHeight,
          text: textContent,
          fontSize: fontSize,
          fontFamily: 'Arial',
          fill: '#000000',
          align: 'center',
          draggable: true,
          visible: true
        };
        break;
      case 'rect':
        // Ensure rectangle fits within canvas
        const rectSize = Math.min(100, Math.min(canvasSize.width - centerX, canvasSize.height - centerY));
        newElement = {
          id: uuidv4(),
          type: 'rect',
          x: centerX,
          y: centerY,
          width: rectSize,
          height: rectSize,
          fill: '#FFFFFF',
          draggable: true,
          visible: true
        };
        break;
      case 'barcode':
        // Ensure barcode fits within canvas
        const barcodeWidth = Math.min(200, canvasSize.width - 20);
        const barcodeHeight = Math.min(90, canvasSize.height - 20);
        const barcodeX = Math.min(centerX, canvasSize.width - barcodeWidth);
        const barcodeY = Math.min(centerY, canvasSize.height - barcodeHeight);
        
        newElement = {
          id: uuidv4(),
          type: 'barcode',
          x: barcodeX,
          y: barcodeY,
          width: barcodeWidth,
          height: barcodeHeight,
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
        // Ensure QR code fits within canvas
        const qrSize = Math.min(100, Math.min(canvasSize.width - centerX, canvasSize.height - centerY));
        newElement = {
          id: uuidv4(),
          type: 'qr',
          x: centerX,
          y: centerY,
          width: qrSize,
          height: qrSize,
          value: 'https://nwfap.com',
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
      case 'image':
        // For image, use handleAddImage instead
        handleAddImage();
        return;
      default:
        return;
    }
    
    // ตรวจสอบเพิ่มเติมให้แน่ใจว่า element อยู่ในกรอบ canvas
    const boundedElement = keepElementInCanvas(newElement, canvasSize);
    
    addElement(boundedElement);
    selectElement(boundedElement.id);
    
    // Update QR codes and barcodes as needed
    if (type === 'qr') {
      debouncedUpdateQrDataUrl(boundedElement as any);
    } else if (type === 'barcode') {
      debouncedUpdateBarcodeDataUrl(boundedElement as any);
    }
  }, [canvasSize, addElement, selectElement, debouncedUpdateQrDataUrl, debouncedUpdateBarcodeDataUrl, keepElementInCanvas]);
  
  /**
   * Add image by uploading from device
   */
  const handleAddImage = useCallback(async () => {
    // Use singleton file input from utils
    const fileInput = getFileInput('image/*');
    
    // Store reference to clean up later
    fileInputRef.current = fileInput;

    // ล้าง listener เก่าก่อนเพื่อป้องกัน stacking
    fileInput.onchange = null;
    
    // When file is selected
    fileInput.onchange = async (e: Event) => {
      try {
        const target = e.target as HTMLInputElement;
        if (!target.files || target.files.length === 0) {
          return;
        }

        const file = target.files[0];
        
        // ตรวจสอบขนาดไฟล์ (จำกัดไว้ที่ 5MB)
        const maxFileSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxFileSize) {
          message.error('Image file too large (max 5MB)');
          return;
        }
        
        // ตรวจสอบประเภทไฟล์ว่าเป็นรูปภาพจริงๆ
        if (!file.type.startsWith('image/')) {
          message.error('Invalid image format');
          return;
        }
        
        // ตรวจสอบว่ามี element ที่เลือกอยู่หรือไม่
        const isUpdatingExistingImage = selectedId && elements.find(el => el.id === selectedId && el.type === 'image');
        
        // Show loading
        message.loading('Uploading image...', 0);
        
        try {
          // เปลี่ยนจากการใช้ URL.createObjectURL เป็น FileReader.readAsDataURL
          const reader = new FileReader();
          
          reader.onloadend = () => {
            const dataUrl = reader.result as string; // ได้ data URL แบบ base64 แล้ว
            
            // คำนวณขนาดรูปภาพจาก data URL
            const img = new Image();
            img.onload = () => {
              // ปรับขนาดรูปภาพตามข้อจำกัดของ canvas
              let width = img.width;
              let height = img.height;
              
              const maxWidth = Math.min(canvasSize.width - 40, 300);
              const maxHeight = Math.min(canvasSize.height - 40, 300);
              
              if (width > maxWidth) {
                const ratio = maxWidth / width;
                width = maxWidth;
                height = Math.round(height * ratio);
              }
              
              if (height > maxHeight) {
                const ratio = maxHeight / height;
                height = maxHeight;
                width = Math.round(width * ratio);
              }
              
              // ถ้ากำลังอัปเดต element ที่มีอยู่แล้ว
              if (isUpdatingExistingImage) {
                // อัปเดต src ของ element ที่มีอยู่แล้ว
                updateElementProperty(selectedId, 'src', dataUrl);
                message.destroy();
                message.success('Image updated successfully');
                return;
              }
              
              // สร้าง element ใหม่
          const centerX = canvasSize.width / 2 - width / 2;
          const centerY = canvasSize.height / 2 - height / 2;
          
          const newImageElement: ElementType = {
            id: uuidv4(),
            type: 'image',
            x: centerX,
            y: centerY,
            width,
            height,
                src: dataUrl, // ใช้ data URL โดยตรง
            draggable: true,
            visible: true
          };
          
          // Add new element
          addElement(newImageElement);
          selectElement(newImageElement.id);
          
          // Close loading and show success
          message.destroy();
              message.success('Image uploaded successfully');
            };
            
            img.onerror = () => {
              // หากไม่สามารถโหลดรูปภาพได้
              message.destroy();
              message.error('Error processing image');
            };
            
            // เริ่มโหลดรูปภาพจาก data URL
            img.src = dataUrl;
          };
          
          reader.onerror = () => {
            message.destroy();
            message.error('Error reading the image file');
            console.error('FileReader error:', reader.error);
          };
          
          // อ่านไฟล์เป็น Data URL (base64)
          reader.readAsDataURL(file);
          
        } catch (error) {
          message.destroy();
          message.error('Error uploading image');
          if (process.env.NODE_ENV === 'development') {
            console.error('Error uploading image:', error);
          }
        }
      } catch (error) {
        message.destroy();
        message.error('Error in image upload process');
        if (process.env.NODE_ENV === 'development') {
          console.error('Error in image upload process:', error);
        }
      }
    };
    
    // Trigger file selection
    fileInput.click();
  }, [canvasSize, addElement, selectElement, selectedId, elements, updateElementProperty]);
  
  /**
   * Rotate selected element
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
   * Save template settings
   */
  const handleSaveTemplateSettings = useCallback((newTemplateInfo: TemplateInfo, newCanvasSize: CanvasSize) => {
    // บันทึกค่าที่เปลี่ยนแปลงลงในสถานะ (state)
    setTemplateInfo(newTemplateInfo);
    resizeCanvas(newCanvasSize);
    
    // ปิด modal
    setTemplateInfoModal(false);
    
    // แสดงข้อความยืนยันการบันทึกการตั้งค่า
    message.success('Template settings updated');
  }, [resizeCanvas]);
  
  /**
   * Export template as PDF
   */
  const handleExportPdf = useCallback(() => {
    try {
      // ตรวจสอบว่า stageRef มีค่าหรือไม่
      if (!stageRef.current) {
        message.error('ไม่พบ stage สำหรับการส่งออก');
        return;
      }

      // สร้าง dialog สำหรับแสดงสถานะการทำงาน
      message.loading('กำลังสร้างไฟล์ PDF...', 0);

      // ใช้ setTimeout เพื่อให้ UI มีเวลาอัปเดตก่อนการทำงานหนัก
      setTimeout(async () => {
        try {
          // นำเข้า jspdf เมื่อต้องการใช้งาน
          const { jsPDF } = await import('jspdf');

          // ตั้งค่าคุณภาพของรูปภาพ
          const pixelRatio = 3;  // คุณภาพสูงกว่าหน้าจอ 3 เท่า - เพิ่มเป็น 3 เท่า

          // บันทึกค่า background color เดิมของ stage
          const originalBackground = stageRef.current.container().style.background;
          
          // ซ่อนเส้นตารางโดยการกำหนดพื้นหลังเป็นสีขาวก่อนการส่งออก
          stageRef.current.container().style.background = '#FFFFFF';
          
          // ซ่อน grid lines ชั่วคราว (หากมี)
          const gridLinesVisible = document.querySelector('.konvajs-content');
          const gridLineDisplayStyle = gridLinesVisible ? getComputedStyle(gridLinesVisible).display : '';
          if (gridLinesVisible) {
            (gridLinesVisible as HTMLElement).style.background = '#FFFFFF';
          }

          // แปลง stage เป็น Data URL แบบ PNG เพื่อรักษาความโปร่งใส
          const dataURL = stageRef.current.toDataURL({
            pixelRatio,
            mimeType: 'image/png',
            quality: 1,
            width: canvasSize.width,
            height: canvasSize.height,
            backgroundColor: '#FFFFFF' // กำหนดสีพื้นหลังเป็นสีขาว
          });

          // คืนค่า background color เดิม
          stageRef.current.container().style.background = originalBackground;
          
          // คืนค่า grid lines display (หากมีการเปลี่ยน)
          if (gridLinesVisible && gridLineDisplayStyle) {
            (gridLinesVisible as HTMLElement).style.background = '';
          }

          // กำหนดชื่อไฟล์
          const filename = `${templateInfo.name || 'template'}-${batchNo || new Date().toISOString().slice(0, 10)}`;

          // สร้าง PDF โดยใช้ขนาดตาม paperSize ที่ผู้ใช้กำหนด 
          // กำหนดหน่วยเป็น px (pixels) จะทำให้ขนาดตรงกับที่แสดงในหน้า Template designer
          const orientation = canvasSize.width > canvasSize.height ? 'landscape' : 'portrait';
          
          // กำหนดขนาด margin ขอบกระดาษ (px)
          const margin = 0; // ไม่มี margin
          
          // สร้าง PDF โดยกำหนดหน่วยเป็น px และขนาดตรงกับ canvas
          const pdf = new jsPDF({
            orientation,
            unit: 'px',
            format: [canvasSize.width, canvasSize.height],
            hotfixes: ['px_scaling'],
            compress: true
          });

          // เพิ่มรูปภาพลงใน PDF ขนาดเท่ากับ canvas
          pdf.addImage(
            dataURL,
            'PNG',
            0,
            0,
            canvasSize.width,
            canvasSize.height
          );

          // บันทึก PDF
          pdf.save(`${filename}.pdf`);

          // แสดงข้อความสำเร็จ
          message.destroy();
          message.success('ส่งออกเป็น PDF สำเร็จ');
        } catch (error) {
          console.error('Error generating PDF:', error);
          message.destroy();
          message.error('ไม่สามารถสร้างไฟล์ PDF ได้');
        }
      }, 100);
    } catch (error) {
      message.destroy();
      message.error('เกิดข้อผิดพลาดในการส่งออกเป็น PDF');
      console.error('Error in PDF export:', error);
    }
  }, [stageRef, canvasSize, templateInfo.name, batchNo]);

  /**
   * Export template as PNG
   */
  const handleExportPng = useCallback(() => {
    try {
      // ตรวจสอบว่า stageRef มีค่าหรือไม่
      if (!stageRef.current) {
        message.error('ไม่พบ stage สำหรับการส่งออก');
        return;
      }

      // แสดงสถานะการทำงาน
      message.loading('กำลังสร้างไฟล์ PNG...', 0);

      // ใช้ setTimeout เพื่อให้ UI มีเวลาอัปเดตก่อนการทำงานหนัก
      setTimeout(() => {
        try {
          // ตั้งค่าคุณภาพของรูปภาพ
          const pixelRatio = 3;  // คุณภาพสูงกว่าหน้าจอ 3 เท่า
          
          // บันทึกค่า background color เดิมของ stage
          const originalBackground = stageRef.current.container().style.background;
          
          // ซ่อนเส้นตารางโดยการกำหนดพื้นหลังเป็นสีขาวก่อนการส่งออก
          stageRef.current.container().style.background = '#FFFFFF';
          
          // ซ่อน grid lines ชั่วคราว (หากมี)
          const gridLinesVisible = document.querySelector('.konvajs-content');
          const gridLineDisplayStyle = gridLinesVisible ? getComputedStyle(gridLinesVisible).display : '';
          if (gridLinesVisible) {
            (gridLinesVisible as HTMLElement).style.background = '#FFFFFF';
          }

          // แปลง stage เป็น Data URL
          const dataURL = stageRef.current.toDataURL({
            pixelRatio,
            mimeType: 'image/png',
            quality: 1,
            width: canvasSize.width,
            height: canvasSize.height,
            backgroundColor: '#FFFFFF' // กำหนดสีพื้นหลังเป็นสีขาว
          });
          
          // คืนค่า background color เดิม
          stageRef.current.container().style.background = originalBackground;
          
          // คืนค่า grid lines display (หากมีการเปลี่ยน)
          if (gridLinesVisible && gridLineDisplayStyle) {
            (gridLinesVisible as HTMLElement).style.background = '';
          }

          // สร้างลิงก์สำหรับดาวน์โหลด
          const link = document.createElement('a');
          link.download = `${templateInfo.name || 'template'}-${batchNo || new Date().toISOString().slice(0, 10)}.png`;
          link.href = dataURL;

          // เพิ่มลิงก์ลงใน document แล้วคลิก
          document.body.appendChild(link);
          link.click();

          // ล้าง resources
          setTimeout(() => {
            document.body.removeChild(link);
          }, 100);

          // แสดงข้อความสำเร็จ
          message.destroy();
          message.success('ส่งออกเป็น PNG สำเร็จ');
        } catch (error) {
          console.error('Error generating PNG:', error);
          message.destroy();
          message.error('ไม่สามารถสร้างไฟล์ PNG ได้');
        }
      }, 100);
    } catch (error) {
      message.destroy();
      message.error('เกิดข้อผิดพลาดในการส่งออกเป็น PNG');
      console.error('Error in PNG export:', error);
    }
  }, [stageRef, canvasSize, templateInfo.name, batchNo]);

  /**
   * Save template
   */
  const handleSaveTemplate = useCallback(async () => {
    // ตรวจสอบชื่อเทมเพลต เนื่องจากเป็นข้อมูลที่จำเป็น
    if (!templateInfo.name || templateInfo.name.trim() === '') {
      message.warning('Template name is required');
      setTemplateInfoModal(true);
      return;
    }
    
    try {
    const result = await saveTemplate(templateInfo, elements, canvasSize, batchNo);
    if (result) {
        message.success(msgs.success.saveTemplate || 'Template saved successfully');
        
        // รอสักครู่เพื่อให้ UI แสดงข้อความสำเร็จก่อนเปลี่ยนหน้า
        setTimeout(() => {
          // นำทางไปยังหน้า Template Management ที่ถูกต้อง
          router.push('/templates/management');
        }, 1000);
      }
    } catch (error: any) {
      console.error('Error saving template:', error);
      message.error(`${msgs.errors.saveTemplate || 'Failed to save template'}: ${error.message}`);
    }
  }, [saveTemplate, templateInfo, elements, canvasSize, batchNo, router, msgs]);
  
  /**
   * Export template as JSON
   */
  const handleExportTemplate = useCallback(() => {
    const jsonData = exportTemplateAsJson(elements, canvasSize);
    
    // Use utility function to download JSON
    const filename = `${templateInfo.name || 'template'}-${new Date().toISOString().slice(0, 10)}.json`;
    downloadJsonTemplate(jsonData, filename);
    
    message.success(msgs.success.exportTemplate);
  }, [exportTemplateAsJson, elements, canvasSize, templateInfo.name, msgs.success.exportTemplate]);
  
  /**
   * Import template from JSON
   */
  const handleImportTemplate = useCallback(() => {
    setImportModal(true);
  }, []);
  
  /**
   * Confirm import of JSON
   */
  const handleConfirmImport = useCallback(() => {
    try {
      // Clear cache before importing new template
      clearCache();
      
      const result = importTemplateFromJson(importJson);
      
      if (result) {
        // ประกาศแยก qrElements และ barcodeElements ก่อนแทนที่ elements
        // เพื่อให้ง่ายต่อการอัปเดตในภายหลัง
        const qrElements = result.elements.filter(el => el.type === 'qr');
        const barcodeElements = result.elements.filter(el => el.type === 'barcode');
        const otherElements = result.elements.filter(el => el.type !== 'qr' && el.type !== 'barcode');
        
        // กำหนดค่า layer ตามลำดับความสำคัญ เริ่มจากค่าสูงสำหรับอิลิเมนต์บนสุด
        // โดยให้ค่าห่างกันเพื่อให้มีที่ว่างสำหรับแทรกอิลิเมนต์ในอนาคต
        const startLayer = 1000; // เริ่มต้นที่ค่าสูงเพื่อให้แน่ใจว่าทุกอิลิเมนต์มีค่า layer เป็นบวก
        
        // กำหนดค่า layer ให้กับองค์ประกอบทั้งหมด - QR บนสุด, ตามด้วย Barcode, และ otherElements ล่างสุด
        const qrWithLayers = qrElements.map((el, index) => ({ 
          ...el, 
          layer: startLayer + 200 + index * 10 // QR มีค่า layer สูงสุด = อยู่บนสุด
        }));
        
        const barcodesWithLayers = barcodeElements.map((el, index) => ({
          ...el,
          layer: startLayer + 100 + index * 10 // Barcode มีค่า layer รองลงมา
        }));
        
        const otherWithLayers = otherElements.map((el, index) => ({
          ...el,
          layer: startLayer + index * 10 // องค์ประกอบอื่นๆ มีค่า layer ต่ำสุด = อยู่ล่างสุด
        }));
        
        // รวมองค์ประกอบทั้งหมดเข้าด้วยกัน - เรียงจากค่า layer มากไปน้อย เพื่อให้องค์ประกอบที่มีค่า layer สูงอยู่ต้นอาร์เรย์
        const sortedElements = [
          ...qrWithLayers,       // QR codes ขึ้นก่อน (บนสุด)
          ...barcodesWithLayers, // ตามด้วย Barcodes
          ...otherWithLayers     // และองค์ประกอบอื่นๆ (ล่างสุด)
        ];
        
        // จากนั้นแทนที่ elements ทั้งหมด
        replaceAllElements(sortedElements);
        resizeCanvas(result.canvasSize);
        
        // อัปเดต QR และ barcode elements
        if (qrElements.length > 0) {
          updateAllQrCodes(qrWithLayers);
        }
        
        if (barcodeElements.length > 0) {
          updateAllBarcodes(barcodesWithLayers);
        }
        
        setImportModal(false);
        setImportJson('');
        message.success(msgs.success.importTemplate);
      }
    } catch (error: any) {
      message.error(`${msgs.errors.parseTemplate}: ${error.message}`);
    }
  }, [importJson, importTemplateFromJson, replaceAllElements, resizeCanvas, updateAllQrCodes, updateAllBarcodes, clearCache, msgs]);

  // ฟังก์ชันสำหรับจัดการเมื่อมีการเปลี่ยนแปลงค่า batchNo
  const handleBatchChange = useCallback((newBatchNo: string) => {
    setBatchNo(newBatchNo);
    
    // clear existing error as soon as we get something non-blank
    if (newBatchNo.trim()) {
      setBatchError(null);
    }
  }, []);

  // Update event handler for "Add Batch Data" button
  const handleUseBatchData = useCallback(() => {
    if (!batchNo) {
      setBatchError(msgs.errors.invalidBatchNumber);
      return;
    }
    
    // เปิด Modal แสดงข้อมูล batch แทนที่จะเรียกฟังก์ชัน fetchAndApplyBatch โดยตรง
    setBatchDataSelectionModalVisible(true);
  }, [batchNo, msgs.errors.invalidBatchNumber, setBatchError]);
  
  // รับข้อมูล elements จาก BatchDataSelectionModal
  const handleBatchDataSelection = useCallback((newElements: ElementType[], selectedRow?: any) => {
    // ปิด Modal
    setBatchDataSelectionModalVisible(false);
    
    // บันทึกข้อมูลแถวที่เลือกหากมีการส่งมา
    if (selectedRow) {
      setSelectedBatchRow(selectedRow);
    }
    
    if (newElements.length === 0) {
      message.info('ไม่มีข้อมูลที่เลือก');
      return;
    }
    
    // เพิ่ม elements ใหม่เข้าไปใน canvas
    // หาค่า layer มากที่สุดในอาร์เรย์ปัจจุบัน
    const maxLayer = elements.length > 0
      ? Math.max(...elements.map(el => el.layer || 0))
      : 0;
    
    // กำหนดค่า layer ให้กับองค์ประกอบที่จะเพิ่ม
    const elementsWithLayers = newElements.map((el, index) => ({
      ...el,
      layer: maxLayer + ((index + 1) * 10) // ให้องค์ประกอบใหม่อยู่บนสุด
    }));
    
    // สร้างลิสต์ใหม่ด้วยองค์ประกอบทั้งหมด - เพิ่มองค์ประกอบใหม่ไว้ที่ต้นอาร์เรย์
    const allElements = [...elementsWithLayers, ...elements];
    
    // Call replaceAllElements with all elements
    replaceAllElements(allElements);
    
    // อัพเดต QR codes และ barcodes ถ้ามี
    const newQrElements = elementsWithLayers.filter(el => el.type === 'qr');
    const newBarcodeElements = elementsWithLayers.filter(el => el.type === 'barcode');
    
    if (newQrElements.length > 0) {
      updateAllQrCodes(newQrElements);
    }
    
    if (newBarcodeElements.length > 0) {
      updateAllBarcodes(newBarcodeElements);
    }
    
    // ตรวจสอบและอัพเดต CustKey และ ItemKey จากข้อมูล batch ลงใน templateInfo
    const batchRowToUse = selectedRow || selectedBatchRow;
    if (batchRowToUse) {
      // สร้าง templateInfo ใหม่ โดยเพิ่ม customerKey และ productKey ถ้ามีค่าใน batch data
      const newTemplateInfo = { ...templateInfo };
      
      // ปรับปรุง customerKey ถ้ามีค่า custKey ในข้อมูล batch
      if (batchRowToUse.custKey) {
        newTemplateInfo.customerKey = batchRowToUse.custKey;
        console.log(`ปรับปรุง Customer Code: ${batchRowToUse.custKey}`);
      }
      
      // ปรับปรุง productKey ถ้ามีค่า itemKey ในข้อมูล batch
      if (batchRowToUse.itemKey) {
        newTemplateInfo.productKey = batchRowToUse.itemKey;
        console.log(`ปรับปรุง Product Code: ${batchRowToUse.itemKey}`);
      }
      
      // ปรับปรุงค่า templateInfo เฉพาะเมื่อมีการเปลี่ยนแปลง
      if (newTemplateInfo.customerKey !== templateInfo.customerKey || 
          newTemplateInfo.productKey !== templateInfo.productKey) {
        setTemplateInfo(newTemplateInfo);
        message.info('อัพเดต Customer Code และ Product Code จากข้อมูล batch แล้ว');
      }
    }
    
    message.success(`สร้าง ${newElements.length} elements จากข้อมูล batch สำเร็จ`);
    
    // ทำเครื่องหมายว่าได้ sync batch นี้แล้ว
    batchAppliedRef.current[batchNo] = true;
  }, [elements, replaceAllElements, updateAllQrCodes, updateAllBarcodes, batchNo, selectedBatchRow, templateInfo, setTemplateInfo]);

  /**
   * Effect: Cleanup resources when component unmounts
   */
  useEffect(() => {
    return () => {
      // Revoke any object URLs when component unmounts
      const images = elements.filter(el => el.type === 'image');
      images.forEach(img => {
        if ((img as any).src && typeof (img as any).src === 'string' && (img as any).src.startsWith('blob:')) {
          URL.revokeObjectURL((img as any).src);
        }
      });
      
      // ใช้ cleanupFileResources ที่ import มาแล้ว
          cleanupFileResources();
      
      // Reset ref
      fileInputRef.current = null;
    };
  }, [elements]);

  /**
   * Handle element drag end
   */
  const handleElementDragEnd = useCallback((id: string, x: number, y: number) => {
    const elementToUpdate = elements.find(element => element.id === id);
    if (!elementToUpdate) return;

    // Create updated element with new position
    const updatedElement = {
      ...elementToUpdate,
      x, 
      y
    } as ElementType;
    
    // Keep element inside canvas boundaries
    const boundedElement = keepElementInCanvas(updatedElement, canvasSize);
    
    updateElement(boundedElement);
  }, [elements, updateElement, canvasSize]);

  /**
   * Handle element resize
   */
  const handleElementResize = useCallback((id: string, width: number, height: number, x?: number, y?: number) => {
    const elementToUpdate = elements.find(element => element.id === id);
    if (!elementToUpdate) return;
    
    // กำหนดค่าขั้นต่ำสำหรับ width และ height
    const minWidth = 20;
    const minHeight = 20;
    
    const updatedElement = {
      ...elementToUpdate,
      width: Math.max(minWidth, width),
      height: Math.max(minHeight, height),
      ...(x !== undefined && { x }),
      ...(y !== undefined && { y })
    } as ElementType;
    
    // หากเป็นอิลิเมนต์ข้อความ ให้คำนวณขนาดฟอนต์ที่เหมาะสม
    if (elementToUpdate.type === 'text') {
      const textElement = elementToUpdate as any; // TextElement
      const text = textElement.text || '';
      
      // คำนวณขนาดฟอนต์เมื่อการเปลี่ยนขนาดกล่องมีนัยสำคัญ
      const significantResize = 
        Math.abs(width - elementToUpdate.width) > elementToUpdate.width * 0.15 || 
        Math.abs(height - elementToUpdate.height) > elementToUpdate.height * 0.15;
      
      if (significantResize) {
        // คำนวณขนาดฟอนต์ตามความกว้างของกล่อง
        const lineCount = text.split('\n').length || 1;
        
        // คำนวณขนาดฟอนต์จากความกว้างและความสูง
        const estimatedFontSizeByWidth = updatedElement.width / (Math.max(1, text.length) * FONT_SIZE_COEFFICIENT);
        const estimatedFontSizeByHeight = updatedElement.height / (lineCount * 1.2);
        
        // เลือกค่าที่เล็กกว่าและจำกัดให้อยู่ในช่วงที่เหมาะสม
        const calculatedFontSize = Math.min(estimatedFontSizeByWidth, estimatedFontSizeByHeight);
        // จำกัดฟอนต์ไซส์ไม่ให้มากเกินไปเมื่อเทียบกับขนาดกล่อง
        const constrainedFontSize = Math.min(calculatedFontSize, updatedElement.width / 2, updatedElement.height * 0.8);
        const newFontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, constrainedFontSize));
        
        // อัพเดตค่าฟอนต์ไปที่อิลิเมนต์ที่จะอัพเดต
        (updatedElement as any).fontSize = newFontSize;
      } else {
        // แม้ไม่มีการเปลี่ยนขนาดกล่องมากนัก ยังต้องตรวจสอบว่าฟอนต์ไซส์ไม่เกินขนาดกล่อง
        const currentFontSize = textElement.fontSize || DEFAULT_FONT_SIZE;
        const maxFontSize = Math.min(updatedElement.width / 2, updatedElement.height * 0.8);
        
        if (currentFontSize > maxFontSize) {
          (updatedElement as any).fontSize = maxFontSize;
        }
      }
    }
    
    // Keep element inside canvas boundaries
    const boundedElement = keepElementInCanvas(updatedElement, canvasSize);
    
    updateElement(boundedElement);
  }, [elements, updateElement, canvasSize]);

  /**
   * Handle element edit
   */
  const handleElementEdit = useCallback((id: string, newProps: Partial<ElementType>) => {
    const elementToUpdate = elements.find(element => element.id === id);
    if (!elementToUpdate) return;

    const updatedElement = {
      ...elementToUpdate,
      ...newProps
    } as ElementType;
    
    // ถ้าเป็น text element และมีการเปลี่ยนแปลงที่ส่งผลต่อขนาด ให้คำนวณขนาดที่เหมาะสม
    if (updatedElement.type === 'text' && 
        ('text' in newProps || 'fontSize' in newProps || 'fontFamily' in newProps)) {
      // ดึงค่าจาก updatedElement
      const text = updatedElement.text || '';
      const fontSize = (updatedElement as any).fontSize || DEFAULT_FONT_SIZE;
      const fontFamily = (updatedElement as any).fontFamily || 'Arial';
      
      // คำนวณความกว้างและความสูงที่เหมาะสมกับข้อความ
      const lines = text.split('\n');
      const lineCount = lines.length;
      
      // ค่าประมาณการความกว้างของตัวอักษร (เฉลี่ย) - ปรับตามประเภทฟอนต์
      let avgCharWidth;
      if (fontFamily.toLowerCase().includes('monospace') || fontFamily.toLowerCase().includes('courier')) {
        // สำหรับ monospace font จะมีความกว้างเท่ากันทุกตัวอักษร
        avgCharWidth = fontSize * 0.65;
      } else if (fontFamily.toLowerCase().includes('serif')) {
        // สำหรับ serif font (เช่น Times New Roman)
        avgCharWidth = fontSize * 0.55;
      } else {
        // สำหรับ sans-serif font (เช่น Arial)
        avgCharWidth = fontSize * 0.5;
      }
      
      // หาความยาวของบรรทัดที่ยาวที่สุด
      let longestLineLength = 0;
      for (const line of lines) {
        // คำนวณความยาวของบรรทัดนี้โดยประมาณ
        let lineLength = 0;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          // ตัวอักษรกว้าง (W, M) จะใช้พื้นที่มากกว่า
          if ('WM@wmm'.includes(char)) {
            lineLength += avgCharWidth * 1.3;
          } else if (':.;,!iIl'.includes(char)) {
            // ตัวอักษรแคบ (i, l) จะใช้พื้นที่น้อยกว่า
            lineLength += avgCharWidth * 0.6;
          } else {
            lineLength += avgCharWidth;
          }
        }
        longestLineLength = Math.max(longestLineLength, lineLength);
      }
      
      // คำนวณขนาดที่เหมาะสม
      // ลด padding ให้น้อยลง เพื่อให้กรอบพอดีกับข้อความมากขึ้น
      const horizontalPadding = fontSize * 0.2; // ลดลงจาก 0.5
      const verticalPadding = fontSize * 0.1; // ลดลงจาก 0.5
      
      // ปรับความกว้างและความสูงให้พอดีกับข้อความ
      // ความกว้าง = ความยาวของข้อความที่ยาวที่สุด + padding ด้านข้าง
      const calculatedWidth = Math.max(30, Math.ceil(longestLineLength + horizontalPadding * 2));
      
      // ความสูง = จำนวนบรรทัด * ความสูงของบรรทัด + padding ด้านบนล่าง
      const lineHeight = fontSize * 1.15; // ความสูงต่อบรรทัด
      const calculatedHeight = Math.max(fontSize, Math.ceil(lineCount * lineHeight + verticalPadding * 2));
      
      // อัพเดตขนาดอัตโนมัติ
      updatedElement.width = calculatedWidth;
      updatedElement.height = calculatedHeight;
    }

    // Apply boundary restrictions if position or size changed
    const needsRestriction = newProps.x !== undefined || 
                            newProps.y !== undefined || 
                            newProps.width !== undefined || 
                            newProps.height !== undefined;
                            
    const finalElement = needsRestriction 
                        ? keepElementInCanvas(updatedElement, canvasSize) 
                        : updatedElement;
    
    // Update element using the reducer
    updateElement(finalElement);
  }, [elements, updateElement, canvasSize]);

  /**
   * Toggle element visibility
   */
  const handleToggleElementVisibility = useCallback((id: string) => {
    const element = elements.find(el => el.id === id);
    if (element) {
      updateElementProperty(id, 'visible', element.visible === false ? true : false);
    }
  }, [elements, updateElementProperty]);

  /**
   * Toggle element lock
   */
  const handleToggleElementLock = useCallback((id: string) => {
    const element = elements.find(el => el.id === id);
    if (element) {
      updateElementProperty(id, 'locked', !element.locked);
    }
  }, [elements, updateElementProperty]);

  // เช็คว่ามีการดับเบิลคลิกที่ text element หรือไม่
  useEffect(() => {
    // สร้างฟังก์ชันสำหรับการจัดการเมื่อมีการ double click บน text element
    const handleDblClickOnText = () => {
      // ตรวจสอบว่ามี ID ที่กำลังแก้ไขหรือไม่
      const editingId = editingTextIdRef.current;
      if (editingId) {
        console.log('Handling double-click on text element:', editingId);
        
        // หา element ที่กำลังแก้ไข
        const element = elements.find(el => el.id === editingId);
        if (element && element.type === 'text') {
          // เลือก element ที่กำลังแก้ไขก่อน
          selectElement(editingId);
          
          // คำนวณตำแหน่งของ text element บน stage
          const node = findNode(editingId);
          if (node) {
            const stage = node.getStage();
            if (stage) {
              // ตรวจสอบว่า element นี้มีอยู่จริงและมีตำแหน่งที่ถูกต้อง
              const transform = node.getAbsoluteTransform();
              if (transform) {
                const position = { 
                  x: transform.getTranslation().x * zoom, 
                  y: transform.getTranslation().y * zoom,
                  width: element.width * zoom,
                  height: element.height * zoom
                };
                
                // เก็บค่าต่างๆ สำหรับการแสดง textarea
                setEditingText(true);
                setEditingTextPosition(position);
                setEditingTextValue(element.text || '');
                
                // ปิด pointer events ของ stage เพื่อให้สามารถคลิกที่ textarea ได้
                const container = stage.container();
                if (container) {
                  container.style.pointerEvents = 'none';
                }
                
                // ล้างค่า editingTextId
                editingTextIdRef.current = null;
                
                // โฟกัสที่ textarea ทันที
                requestAnimationFrame(() => {
                  if (textAreaRef.current) {
                    textAreaRef.current.focus();
                    textAreaRef.current.select();
                  }
                });
              }
            }
          }
        }
      }
    };
    
    // ติดตั้ง event listener สำหรับ double click
    window.addEventListener('dblclick', handleDblClickOnText);
    
    return () => {
      window.removeEventListener('dblclick', handleDblClickOnText);
    };
  }, [elements, findNode, zoom, selectElement]);
  
  // ฟังก์ชันสำหรับการจัดการเมื่อกด Enter หรือ Escape
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextareaBlur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingText(false);
      // เปิด pointer events กลับมา
      if (stageRef.current) {
        const container = stageRef.current.container();
        if (container) {
          container.style.pointerEvents = 'auto';
        }
      }
    }
  };
  
  // ฟังก์ชันสำหรับการจัดการเมื่อ blur
  const handleTextareaBlur = () => {
    if (editingText && selectedId) {
      // อัพเดตข้อความและขนาดฟอนต์
      const element = elements.find(el => el.id === selectedId);
      if (element && element.type === 'text') {
        // ถ้าไม่มีการเปลี่ยนแปลงข้อความ ไม่ต้องทำอะไร
        if (element.text === editingTextValue) {
          // ปิดโหมดแก้ไขเท่านั้น
          setEditingText(false);
          
          // เปิด pointer events กลับมา
          if (stageRef.current) {
            const container = stageRef.current.container();
            if (container) {
              container.style.pointerEvents = 'auto';
            }
          }
          return;
        }
        
        // คำนวณขนาดกล่องและฟอนต์ที่เหมาะสมสำหรับข้อความ
        const text = editingTextValue || '';
        
        // ตรวจสอบภาษาของข้อความ
        const detectedLanguage = detectLanguage(text);
        const isRTL = ['arabic', 'hebrew'].includes(detectedLanguage);
        const isComplexScript = ['thai', 'japanese', 'chinese', 'korean'].includes(detectedLanguage);
        
        // ค่าสัมประสิทธิ์ตามภาษา - เพิ่มค่าเป็นพิเศษสำหรับอาหรับเพื่อให้มีพื้นที่เพียงพอ
        const fontCoefficient = {
          arabic: { width: 1.4, height: 2.0 },  // เพิ่มค่าสำหรับอาหรับ
          hebrew: { width: 1.2, height: 2.0 },  // เพิ่มค่าสำหรับฮีบรู
          thai: { width: 0.8, height: 1.5 },
          japanese: { width: 1.0, height: 1.5 },
          chinese: { width: 1.0, height: 1.5 },
          korean: { width: 1.0, height: 1.5 },
          latin: { width: 0.7, height: 1.3 },
        }[detectedLanguage] || { width: 0.7, height: 1.3 };
        
        const lines = text.split('\n');
        const lineCount = lines.length;
        const longestLineLength = Math.max(...lines.map(line => line.length));
        
        // ค่าเริ่มต้นสำหรับการคำนวณ
        let fontSize = element.fontSize || DEFAULT_FONT_SIZE;
        let newWidth, newHeight;
        
        // ปรับปรุงการคำนวณเพื่อให้ข้อความมีพื้นที่เพียงพอ
        // ถ้าเป็นข้อความยาว (> 30 ตัวอักษร หรือมีหลายบรรทัด) หรือเป็นภาษาที่ซับซ้อน
        if (longestLineLength > 30 || lineCount > 1 || isRTL || isComplexScript) {
          // จำกัดความกว้างไม่ให้เกิน 500px และไม่เกิน 80% ของ canvas
          const maxWidth = Math.min(500, canvasSize.width * 0.8);
          
          // ประมาณความกว้างขั้นต้นโดยใช้สัมประสิทธิ์ตามภาษา
          if (isRTL) {
            // สำหรับภาษา RTL เพิ่มความกว้างมากขึ้น
            newWidth = Math.min(maxWidth, Math.max(200, longestLineLength * fontSize * fontCoefficient.width * 1.2));
            
            // ถ้าข้อความยาวมาก เพิ่มความกว้างอีก
            if (longestLineLength > 20) {
              newWidth *= 1.2;
            } else if (longestLineLength > 10) {
              newWidth *= 1.1;
            }
          } else if (isComplexScript) {
            // สำหรับภาษาที่ซับซ้อนอื่นๆ
            newWidth = Math.min(maxWidth, Math.max(200, longestLineLength * fontSize * fontCoefficient.width));
          } else {
            // สำหรับภาษาละติน
            newWidth = Math.min(maxWidth, Math.max(200, longestLineLength * fontSize * fontCoefficient.width));
          }
          
          // คำนวณความสูงจากฟอนต์ไซส์และจำนวนบรรทัด ใช้ค่าตามภาษา
          let heightMultiplier = fontCoefficient.height;
          
          if (lineCount > 1) {
            heightMultiplier *= 1 + (lineCount - 1) * 0.15; // เพิ่ม 15% ต่อบรรทัดที่เพิ่มขึ้น
          }
          
          newHeight = Math.max(fontSize * 1.8, lineCount * fontSize * heightMultiplier);
          
          // คำนวณขนาดฟอนต์ที่เหมาะสม
          const estimatedFontSizeByWidth = newWidth / (Math.max(1, longestLineLength) * fontCoefficient.width);
          const estimatedFontSizeByHeight = newHeight / (lineCount * heightMultiplier);
          let calculatedFontSize = Math.min(estimatedFontSizeByWidth, estimatedFontSizeByHeight);
          
          // ปรับขนาดฟอนต์ลงถ้าข้อความยาวมาก
          if (longestLineLength > 50 || lineCount > 3) {
            fontSize = Math.max(12, Math.min(16, calculatedFontSize));
          } else {
            fontSize = Math.max(12, Math.min(fontSize, calculatedFontSize));
          }
          
          // สำหรับภาษา RTL เพิ่มขนาดกล่องขึ้นอีก
          if (isRTL) {
            // เพิ่มขนาดกล่องอีก 40% สำหรับภาษาอาหรับ
            newWidth = Math.min(newWidth * 1.4, canvasSize.width * 0.95);
          }
        } else {
          // ถ้าเป็นข้อความสั้น คำนวณให้มีพื้นที่เพียงพอ
          newWidth = Math.max(150, longestLineLength * fontSize * fontCoefficient.width);
          newHeight = Math.max(35, fontSize * fontCoefficient.height);
        }
        
        // ตรวจสอบให้แน่ใจว่ากล่องอยู่ในขอบเขตของ canvas
        const currentX = element.x;
        const currentY = element.y;
        
        // ถ้ากล่องใหม่ใหญ่กว่าเดิมและจะล้นออกนอก canvas ให้พยายามปรับตำแหน่ง
        let newX = currentX;
        let newY = currentY;
        
        if (currentX + newWidth > canvasSize.width) {
          // ถ้าเลื่อนไปทางซ้ายไม่พอ ให้จำกัดความกว้างแทน
          if (canvasSize.width - newWidth < 0) {
            newWidth = canvasSize.width * 0.95; // ใช้ 95% ของความกว้าง canvas
            newX = canvasSize.width * 0.025; // ชิดซ้าย 2.5%
          } else {
            newX = canvasSize.width - newWidth; // เลื่อนซ้ายให้พอดี
          }
        }
        
        if (currentY + newHeight > canvasSize.height) {
          // ถ้าเลื่อนขึ้นไม่พอ ให้จำกัดความสูงแทน
          if (canvasSize.height - newHeight < 0) {
            newHeight = canvasSize.height * 0.95; // ใช้ 95% ของความสูง canvas
            newY = canvasSize.height * 0.025; // ชิดบน 2.5%
          } else {
            newY = canvasSize.height - newHeight; // เลื่อนขึ้นให้พอดี
          }
        }
        
        // ตรวจสอบอีกครั้งว่าฟอนต์ไซส์เหมาะสมกับขนาดกล่องหลังจากปรับ
        fontSize = Math.min(fontSize, newWidth / 2, newHeight * 0.8);
        
        // ปัดให้เป็นจำนวนเต็มเสมอ และไม่น้อยกว่า 12
        fontSize = Math.round(Math.max(12, fontSize));
        
        // เตรียมข้อมูลที่จะอัพเดต
        const updateData: any = {
          text: editingTextValue,
          fontSize: fontSize,
          width: Math.round(newWidth),
          height: Math.round(newHeight),
          x: Math.round(newX),
          y: Math.round(newY)
        };
        
        // สำหรับภาษา RTL ให้จัดตำแหน่งเป็น right โดยอัตโนมัติถ้ายังไม่ได้ตั้งค่า
        if (isRTL && (!element.align || element.align === 'left')) {
          updateData.align = 'right';
        }
        
        // อัพเดตข้อความและคุณสมบัติอื่นๆทั้งหมดในครั้งเดียว
        handleElementEdit(selectedId, updateData);

        // แสดงข้อความยืนยันการแก้ไข
        message.success('ข้อความถูกอัพเดตเรียบร้อยแล้ว');
      }
    }
    
    // ปิดโหมดแก้ไข
    setEditingText(false);
    
    // เปิด pointer events กลับมา
    if (stageRef.current) {
      const container = stageRef.current.container();
      if (container) {
        container.style.pointerEvents = 'auto';
      }
    }
  };

  // Memoize grid lines to avoid recreating them on every render
  const gridLines = useMemo(() => {
    // เปลี่ยนเงื่อนไขเป็น false เสมอเพื่อไม่แสดงเส้นตาราง
    return null; // ไม่แสดงเส้นตารางโดยคืนค่า null เสมอ
    
    /* ปิดการทำงานของโค้ดเดิม
    if (!FEATURES.SNAPPING.ENABLED) return null;
    
    const verticalLines = Array.from({ length: Math.ceil(canvasSize.width / FEATURES.SNAPPING.GRID_SIZE) }).map((_, i) => (
      <Line
        key={`vgrid-${i}`}
        points={[i * FEATURES.SNAPPING.GRID_SIZE, 0, i * FEATURES.SNAPPING.GRID_SIZE, canvasSize.height]}
        stroke={FEATURES.CANVAS.GRID_COLOR}
        strokeWidth={i % 5 === 0 ? 0.5 : 0.2}
      />
    ));
    
    const horizontalLines = Array.from({ length: Math.ceil(canvasSize.height / FEATURES.SNAPPING.GRID_SIZE) }).map((_, i) => (
      <Line
        key={`hgrid-${i}`}
        points={[0, i * FEATURES.SNAPPING.GRID_SIZE, canvasSize.width, i * FEATURES.SNAPPING.GRID_SIZE]}
        stroke={FEATURES.CANVAS.GRID_COLOR}
        strokeWidth={i % 5 === 0 ? 0.5 : 0.2}
      />
    ));
    
    return [...verticalLines, ...horizontalLines];
    */
  }, [canvasSize.width, canvasSize.height]);

  // Memoize sorted elements to avoid sorting on every render
  const sortedElements = useMemo(() => {
    return elements
      .slice()
      .sort((a, b) => {
        // เรียงลำดับตาม layer value - ค่าน้อยอยู่ด้านล่าง ค่ามากอยู่ด้านบน
        const layerA = a.layer || 0;
        const layerB = b.layer || 0;
        return layerA - layerB; // น้อยไปมาก = วาดก่อน = อยู่ด้านล่าง
      });
  }, [elements]);

  // แก้ไข style ของ .konvajs-content เพื่อลบตารางพื้นหลัง
  useEffect(() => {
    if (isClient) {
      // กำหนด background ของ .konvajs-content เป็นสีขาว
      const checkAndUpdateKonvaContainer = () => {
        const konvaContainer = document.querySelector('.konvajs-content');
        if (konvaContainer) {
          (konvaContainer as HTMLElement).style.background = '#FFFFFF';
        } else {
          // หากยังไม่พบ container ให้ตรวจสอบอีกครั้งในไม่ช้า
          setTimeout(checkAndUpdateKonvaContainer, 100);
        }
      };
      
      checkAndUpdateKonvaContainer();
    }
  }, [isClient, templateLoaded]);

  return (
    <div className="template-designer">
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ paddingLeft: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DesignerToolbar
            onSave={handleSaveTemplate}
            onExportPdf={handleExportPdf}
            onExportPng={handleExportPng}
            onUndo={undo}
            onRedo={redo}
            onDelete={() => selectedId && deleteElement(selectedId)}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onTemplateSettings={() => setTemplateInfoModal(true)}
            onDuplicate={() => selectedId && duplicateElement(selectedId)}
            onRotate={handleRotateElement}
            onGroup={() => {
              if (selectedIds.length >= 2) {
                createGroup(selectedIds);
                message.success(msgs.success.groupElements);
              } else {
                message.warning(msgs.warnings.selectTwoElements);
              }
            }}
            onUngroup={() => {
              if (selectedIds.length === 1) {
                const selectedElement = elements.find(el => el.id === selectedIds[0]);
                if (selectedElement?.type === 'group') {
                  ungroup(selectedIds[0]);
                  message.success(msgs.success.ungroupElements);
                } else {
                  message.warning(msgs.warnings.onlyGroupsCanBeUngrouped);
                }
              } else {
                message.warning(msgs.warnings.selectGroupToUngroup);
              }
            }}
            canUndo={canUndo}
            canRedo={canRedo}
            canDelete={!!selectedId || selectedIds.length > 0}
            canDuplicate={!!selectedId}
            canGroup={selectedIds.length > 1}
            canUngroup={!!selectedId && elements.find(el => el.id === selectedId)?.type === 'group'}
            isSaving={isSaving}
            zoom={zoom}
            batchNo={batchNo}
            onBatchNoChange={handleBatchChange}
            batchError={batchError}
            onApplyBatchData={handleUseBatchData}
            isBatchLoading={batchLoading}
          />
        </Header>
        <Layout>
          <Sider width={250} style={{ background: '#fff' }}>
            <DesignerSidebar
              onAddElement={handleAddElement}
              elements={elements}
              selectedId={selectedId}
              selectElement={selectElement}
              handleMoveElementUp={moveElementUp}
              handleMoveElementDown={moveElementDown}
              handleMoveElementToTop={moveElementToTop}
              handleMoveElementToBottom={moveElementToBottom}
              deleteElement={deleteElement}
              updateElementProperty={updateElementProperty}
              selectedIds={selectedIds}
              isLoading={false}
              handleToggleElementVisibility={handleToggleElementVisibility}
              handleToggleElementLock={handleToggleElementLock}
            />
          </Sider>
          
          <Content style={{ padding: '8px', background: '#f0f2f5' }}>
            <div style={{ 
              background: '#fff', 
              padding: '8px', 
              borderRadius: '4px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              height: 'calc(100vh - 88px)',
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
                        background: '#FFFFFF', // กำหนดเป็นสีขาวล้วนแทนที่จะใช้ FEATURES.CANVAS.BACKGROUND_COLOR
                        boxShadow: '0 0 10px rgba(0,0,0,0.2)'
                      }}
                      onClick={(e: any) => {
                        // Cancel selection if clicking on empty space
                        if (e.target === e.currentTarget) {
                          selectElement(null);
                        }
                      }}
                      onMouseDown={(e: any) => {
                        // Start dragging to select elements when clicking on empty space
                        if (e.target === e.target.getStage()) {
                          const pointerPos = e.target.getStage().getPointerPosition();
                          setDragStart({
                            x: pointerPos.x / zoom,
                            y: pointerPos.y / zoom
                          });
                          setSelectionVisible(true);
                          setDragSelection({
                            x: pointerPos.x / zoom,
                            y: pointerPos.y / zoom,
                            width: 0,
                            height: 0
                          });
                        }
                      }}
                      onMouseMove={(e: any) => {
                        // Update selection size according to mouse movement
                        if (dragStart && selectionVisible) {
                          const stage = e.target.getStage();
                          const pointerPos = stage.getPointerPosition();
                          
                          const x = Math.min(dragStart.x, pointerPos.x / zoom);
                          const y = Math.min(dragStart.y, pointerPos.y / zoom);
                          const width = Math.abs(pointerPos.x / zoom - dragStart.x);
                          const height = Math.abs(pointerPos.y / zoom - dragStart.y);
                          
                          setDragSelection({ x, y, width, height });
                        }
                      }}
                      onMouseUp={(e: any) => {
                        // When mouse is released, select elements in selected area
                        if (dragStart && selectionVisible && dragSelection) {
                          // Check if selected area is large enough
                          if (dragSelection.width > 5 && dragSelection.height > 5) {
                            // Find elements in selected area
                            const selectedElements = elements.filter(el => {
                              // Check if element is in selected area
                              const elRight = el.x + el.width;
                              const elBottom = el.y + el.height;
                              
                              return (
                                el.x < dragSelection.x + dragSelection.width &&
                                elRight > dragSelection.x &&
                                el.y < dragSelection.y + dragSelection.height &&
                                elBottom > dragSelection.y
                              );
                            });
                            
                            // Select elements found in selected area
                            if (selectedElements.length > 0) {
                              const elementIds = selectedElements.map(el => el.id);
                              selectElements(elementIds);
                            }
                          }
                          
                          // Reset dragging selection data
                          setDragStart(null);
                          setSelectionVisible(false);
                          setDragSelection(null);
                        }
                      }}
                    >
                      <Layer>
                        {/* Show grid lines if needed - turned off to have clean white background */}
                        {/* {FEATURES.SNAPPING.ENABLED && gridLines} */}
                        
                        {/* Show elements */}
                        {sortedElements.map((el) => (
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
                              // Select element
                              e.cancelBubble = true;
                              // Check if Ctrl is pressed
                              const isMultiSelect = e.evt.ctrlKey || e.evt.metaKey;
                              selectElement(el.id, isMultiSelect);
                            }}
                            onDblClick={(e: any) => {
                              // ถ้าเป็น text element ให้เข้าสู่โหมดแก้ไข
                              if (el.type === 'text') {
                                e.cancelBubble = true;
                                editingTextIdRef.current = el.id;
                                // ไม่ต้องเรียก handleDblClickOnText โดยตรง
                                // เพราะอีเวนต์ dblclick จะทำงานโดยอัตโนมัติ
                              }
                            }}
                            visible={el.visible !== false}
                            opacity={el.visible === false ? 0.4 : 1}
                            onDragEnd={(e: any) => {
                              // Update position when dragging ends
                              const { x, y } = e.target.position();
                              
                              // Constrain elements to stay within canvas boundaries
                              const constrainedX = Math.max(0, Math.min(x, canvasSize.width - el.width));
                              const constrainedY = Math.max(0, Math.min(y, canvasSize.height - el.height));
                              
                              // If position was constrained, update the node position visually
                              if (x !== constrainedX || y !== constrainedY) {
                                e.target.position({
                                  x: constrainedX,
                                  y: constrainedY
                                });
                                
                                // แสดง warning เมื่อสิ้นสุดการลากเท่านั้น และยังไม่เคยแสดงในรอบนี้
                                if (!hasShowedConstrainWarningRef.current) {
                                message.warning(msgs.canvas.elementConstrainedWarning || 'Element has been constrained to canvas boundaries');
                                  hasShowedConstrainWarningRef.current = true;
                                  
                                  // รีเซ็ตสถานะหลังจากแสดงแล้ว 3 วินาที
                                  setTimeout(() => {
                                    hasShowedConstrainWarningRef.current = false;
                                  }, 3000);
                                }
                              }
                              
                              updateElementProperty(el.id, 'x', constrainedX);
                              updateElementProperty(el.id, 'y', constrainedY);
                            }}
                            onDragMove={(e: any) => {
                              // Constrain movement during drag to prevent elements from going outside canvas
                              const { x, y } = e.target.position();
                              
                              // Constrain elements to stay within canvas boundaries
                              const constrainedX = Math.max(0, Math.min(x, canvasSize.width - el.width));
                              const constrainedY = Math.max(0, Math.min(y, canvasSize.height - el.height));
                              
                              // If position needs to be constrained, update it immediately
                              if (x !== constrainedX || y !== constrainedY) {
                                e.target.position({
                                  x: constrainedX,
                                  y: constrainedY
                                });
                              }
                            }}
                            onTransformEnd={(e: any) => {
                              // Update size and rotation when adjusting ends
                              const node = e.target;
                              const scaleX = node.scaleX();
                              const scaleY = node.scaleY();
                              
                              // Reset scale and update size
                              node.scaleX(1);
                              node.scaleY(1);
                              
                              // Calculate new dimensions
                              const newWidth = Math.max(5, node.width() * scaleX);
                              const newHeight = Math.max(5, node.height() * scaleY);
                              
                              // Get new position
                              let newX = node.x();
                              let newY = node.y();
                              
                              // Constrain position to keep element within canvas
                              const originalX = newX;
                              const originalY = newY;
                              newX = Math.max(0, Math.min(newX, canvasSize.width - newWidth));
                              newY = Math.max(0, Math.min(newY, canvasSize.height - newHeight));
                              
                              // Update node position if it was constrained
                              if (newX !== originalX || newY !== originalY) {
                                node.position({
                                  x: newX,
                                  y: newY
                                });
                                
                                // แสดง warning เมื่อสิ้นสุดการลากเท่านั้น และยังไม่เคยแสดงในรอบนี้
                                if (!hasShowedConstrainWarningRef.current) {
                                message.warning(msgs.canvas.elementConstrainedWarning || 'Element has been constrained to canvas boundaries');
                                  hasShowedConstrainWarningRef.current = true;
                                  
                                  // รีเซ็ตสถานะหลังจากแสดงแล้ว 3 วินาที
                                  setTimeout(() => {
                                    hasShowedConstrainWarningRef.current = false;
                                  }, 3000);
                                }
                              }
                              
                              // สร้างอ็อบเจกต์สำหรับอัพเดต - ไม่รวมการปรับฟอนต์ไซส์อัตโนมัติ
                              const updatedEl = {
                                ...el,
                                x: newX,
                                y: newY,
                                width: newWidth,
                                height: newHeight,
                                rotation: node.rotation()
                              };
                              
                              // ลบโค้ดที่เกี่ยวกับการปรับฟอนต์ไซส์อัตโนมัติออก
                              // เมื่อขยายกรอบข้อความ จะไม่ปรับฟอนต์ไซส์อีกต่อไป
                              
                              // จำกัดขนาดกรอบไม่ให้เกิน canvas
                              if (updatedEl.width > canvasSize.width) {
                                updatedEl.width = canvasSize.width - 40; // เว้น padding ด้านละ 20px
                                updatedEl.x = 20; // จัดให้อยู่ชิดขอบซ้ายพร้อม padding
                              }
                              if (updatedEl.height > canvasSize.height) {
                                updatedEl.height = canvasSize.height - 40; // เว้น padding ด้านละ 20px
                                updatedEl.y = 20; // จัดให้อยู่ชิดขอบบนพร้อม padding
                              }
                              
                              updateElement(updatedEl);
                            }}
                          >
                            <ElementRenderer
                              element={el}
                              qrDataUrls={qrDataUrls}
                              qrImages={qrImages}
                              barcodeDataUrls={barcodeDataUrls}
                              barcodeImages={barcodeImages}
                              updateQrDataUrl={debouncedUpdateQrDataUrl}
                              updateBarcodeDataUrl={debouncedUpdateBarcodeDataUrl}
                              isSelected={selectedId === el.id || selectedIds.includes(el.id)}
                            />
                            
                            {/* Show border when selecting element */}
                            {(selectedId === el.id || selectedIds.includes(el.id)) && (
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
                        
                        {/* Transformer for resizing selected element - adjust to support multiple elements */}
                        {(selectedId || selectedIds.length > 0) && (
                          <Transformer
                            ref={trRef}
                            rotateEnabled={true}
                            keepRatio={false}
                            // Use findNode instead of direct querySelector
                            nodes={
                              selectedIds.length > 0 
                                ? selectedIds.map(id => findNode(id)).filter(Boolean)
                                : selectedId 
                                  ? [findNode(selectedId)].filter(Boolean) 
                                  : []
                            }
                            boundBoxFunc={(oldBox, newBox) => {
                              // Limit size to not get too small
                              if (newBox.width < FEATURES.ELEMENT.MIN_SIZE || newBox.height < FEATURES.ELEMENT.MIN_SIZE) {
                                return oldBox;
                              }
                              return newBox;
                            }}
                          />
                        )}
                        
                        {/* Show selection area for dragging */}
                        {selectionVisible && dragSelection && (
                          <Rect
                            x={dragSelection.x}
                            y={dragSelection.y}
                            width={dragSelection.width}
                            height={dragSelection.height}
                            fill="rgba(0, 161, 255, 0.2)"
                            stroke="#00a1ff"
                            strokeWidth={1}
                            dash={[2, 2]}
                          />
                        )}
                      </Layer>
                    </Stage>
                  )}
                </div>
              </div>
            </div>
          </Content>
          
          <Sider width={300} style={{ background: '#fff' }}>
            <PropertyPanel
              selectedElement={selectedId ? elements.find(el => el.id === selectedId) || null : null}
              elements={elements}
              updateElementProperty={updateElementProperty}
              deleteElement={deleteElement}
              moveElementToTop={moveElementToTop}
              moveElementUp={moveElementUp}
              moveElementDown={moveElementDown}
              moveElementToBottom={moveElementToBottom}
              updateQrDataUrl={debouncedUpdateQrDataUrl}
              updateBarcodeDataUrl={debouncedUpdateBarcodeDataUrl}
            />
          </Sider>
        </Layout>
      </Layout>
      
      {/* TextArea สำหรับการแก้ไขข้อความโดยตรง */}
      {editingText && editingTextPosition && (
        <div 
          style={{
            position: 'absolute',
            left: `${editingTextPosition.x}px`,
            top: `${editingTextPosition.y}px`,
            width: `${editingTextPosition.width}px`,
            height: `${editingTextPosition.height}px`,
            zIndex: 1000,
            boxShadow: '0 0 5px rgba(24,144,255,0.5)'
          }}
        >
          <textarea
            ref={textAreaRef}
            value={editingTextValue}
            onChange={(e) => setEditingTextValue(e.target.value)}
            onBlur={handleTextareaBlur}
            onKeyDown={handleTextareaKeyDown}
            style={{
              width: '100%',
              height: '100%',
              padding: '8px',
              border: '1px solid #1890ff',
              fontFamily: selectedId ? 
                ((elements.find(el => el.id === selectedId && el.type === 'text') as any)?.fontFamily || 'Arial') 
                : 'Arial',
              fontSize: `${Math.max(12, Math.min(32, 
                selectedId && elements.find(el => el.id === selectedId && el.type === 'text') 
                  ? ((elements.find(el => el.id === selectedId) as any)?.fontSize || 16)
                  : 16))}px`,
              resize: 'none',
              backgroundColor: 'white',
              color: selectedId && elements.find(el => el.id === selectedId && (el.type === 'text' || el.type === 'rect'))
                ? ((elements.find(el => el.id === selectedId) as any)?.fill || '#000')
                : '#000',
              textAlign: selectedId && elements.find(el => el.id === selectedId && el.type === 'text')
                ? ((elements.find(el => el.id === selectedId) as any)?.align || 'left')
                : 'left',
              outline: 'none',
              borderRadius: '3px'
            }}
            autoFocus
          />
        </div>
      )}
      
      {/* Modal for template settings */}
      <TemplateSettingsModal
        visible={templateInfoModal}
        onCancel={() => setTemplateInfoModal(false)}
        onSave={handleSaveTemplateSettings}
        templateInfo={templateInfo}
        canvasSize={canvasSize}
        loading={isSaving}
      />
      
      {/* Modal for importing JSON */}
      <Modal
        title={msgs.modals.importTitle}
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
          placeholder={msgs.modals.importPlaceholder}
          rows={10}
        />
      </Modal>
      
      {/* Modal เลือกข้อมูล Batch */}
      <BatchDataSelectionModal
        visible={batchDataSelectionModalVisible}
        batchNo={batchNo}
        onCancel={() => setBatchDataSelectionModalVisible(false)}
        onConfirm={handleBatchDataSelection}
        apiBaseUrl={getApiBaseUrl()}
        onBatchChange={handleBatchChange}
      />
    </div>
  );
};

export default TemplateDesigner; 