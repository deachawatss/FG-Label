import { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { message } from 'antd';
import { ElementType, CanvasSize, TemplateInfo } from '../../models/TemplateDesignerTypes';
import { getApiBaseUrl } from '../../utils/template/helpers';

/**
 * Custom hook สำหรับจัดการการบันทึกและโหลดเทมเพลต
 */
export const useTemplateActions = () => {
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [templateLoaded, setTemplateLoaded] = useState<boolean>(false);
  
  const router = useRouter();

  /**
   * บันทึกเทมเพลต
   * @param templateInfo ข้อมูลทั่วไปของเทมเพลต
   * @param elements รายการ elements
   * @param canvasSize ขนาดของ canvas
   * @param batchNo หมายเลข batch (ถ้ามี)
   */
  const saveTemplate = useCallback(async (
    templateInfo: TemplateInfo,
    elements: ElementType[],
    canvasSize: CanvasSize,
    batchNo?: string
  ) => {
    try {
      setIsSaving(true);
      
      // เตรียมข้อมูลที่จะบันทึก
      // ให้แต่ละ element มี z-index ที่แตกต่างกัน
      const elementsWithZIndex = elements.map((el, index) => ({
        ...el,
        layer: el.layer || index
      }));
      
      const contentWithZIndex = {
        elements: elementsWithZIndex,
        canvasSize
      };
      
      const templateData = {
        name: templateInfo.name || `Standard Template - ${batchNo || 'New'}`,
        description: templateInfo.description || `Template created for batch ${batchNo || 'unknown'}`,
        productKey: templateInfo.productKey || null,
        customerKey: templateInfo.customerKey || null,
        batchNo: batchNo || null, // เพิ่ม batchNo สำหรับการ link กับ batch
        content: JSON.stringify(contentWithZIndex),
        engine: 'Canvas',
        paperSize: templateInfo.paperSize || 'Custom',
        customWidth: canvasSize.width,
        customHeight: canvasSize.height,
        templateType: templateInfo.templateType || 'Standard',
        orientation: templateInfo.orientation || 'Portrait'
      };
      
      // รับ token จาก localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('กรุณาเข้าสู่ระบบก่อนใช้งาน');
      }

      // ตั้งค่า API URL ให้ถูกต้อง
      const apiUrl = getApiBaseUrl();
      
      // ถ้ามี templateId แล้ว ให้ทำการอัปเดต
      if (templateId) {
        const response = await fetch(`${apiUrl}/templates/${templateId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(templateData),
        });
        
        if (response.ok) {
          message.success('บันทึกการแก้ไข template เรียบร้อยแล้ว');
          setLastSaved(new Date());
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || response.statusText);
        }
      } else {
        // สร้าง Template ใหม่
        const response = await fetch(`${apiUrl}/templates`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(templateData),
        });
        
        if (response.ok) {
          const data = await response.json();
          setTemplateId(data.templateId || data.id);
          message.success('บันทึก template เรียบร้อยแล้ว');
          setLastSaved(new Date());
          
          // เปลี่ยน URL หากมีการใช้ router และเป็นการสร้างใหม่
          if (router && data.templateId) {
            router.push(`/templates/designer/${data.templateId || data.id}`);
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || response.statusText);
        }
      }
      
      return true;
    } catch (error: any) {
      console.error('เกิดข้อผิดพลาดในการบันทึก template:', error);
      message.error(`เกิดข้อผิดพลาดในการบันทึก template: ${error.message}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [templateId, router]);

  /**
   * โหลดเทมเพลตจาก API
   * @param id ID ของเทมเพลตที่ต้องการโหลด
   * @param initialTemplate ข้อมูล template ที่โหลดมาแล้ว (ถ้ามี)
   */
  const loadTemplate = useCallback(async (id: string, initialTemplate?: any) => {
    try {
      setIsLoading(true);

      // ถ้ามี initialTemplate อยู่แล้ว ให้ใช้ข้อมูลนั้นแทนการเรียก API ใหม่
      if (initialTemplate) {
        console.log('Using provided initialTemplate:', initialTemplate.name);
        console.log('initialTemplate type:', typeof initialTemplate);
        console.log('initialTemplate structure:', Object.keys(initialTemplate));
        
        // ตั้งค่า templateId
        setTemplateId(id);
        setTemplateLoaded(true);
        
        // แปลง content เป็น object
        let content;
        try {
          if (typeof initialTemplate.content === 'string') {
            console.log('Content is string, parsing to JSON...');
            content = JSON.parse(initialTemplate.content);
            console.log('Content parsed successfully:', 
              'elements:', Array.isArray(content.elements) ? content.elements.length : 'no elements array', 
              'canvasSize:', content.canvasSize ? 'exists' : 'missing');
          } else if (initialTemplate.content) {
            console.log('Content is already an object');
            content = initialTemplate.content;
          } else if (initialTemplate.elements && Array.isArray(initialTemplate.elements)) {
            console.log('No content property, but elements array found directly on initialTemplate');
            content = {
              elements: initialTemplate.elements,
              canvasSize: initialTemplate.canvasSize || { width: 400, height: 400 }
            };
          }
        } catch (e) {
          console.error('Error parsing template content from initialTemplate:', e);
          // สร้าง content เปล่าถ้าแปลงไม่สำเร็จ
          content = { 
            elements: [], 
            canvasSize: { width: 400, height: 400 } 
          };
          console.warn('Created empty content due to parsing error');
        }
        
        // ตรวจสอบรูปแบบของ elements
        if (content?.elements) {
          if (!Array.isArray(content.elements)) {
            console.warn('elements is not an array, converting to array');
            content.elements = [];
          } else if (content.elements.length > 0) {
            console.log('First element type:', content.elements[0].type);
            console.log('Number of elements:', content.elements.length);
          }
        } else {
          console.warn('No elements found in content, creating empty array');
          content = content || {};
          content.elements = [];
        }
        
        // ส่งผลลัพธ์กลับ
        return {
          templateInfo: {
            name: initialTemplate.name || 'Unnamed Template',
            description: initialTemplate.description || '',
            productKey: initialTemplate.productKey || initialTemplate.ProductKey || '',
            customerKey: initialTemplate.customerKey || initialTemplate.CustomerKey || '',
            paperSize: initialTemplate.paperSize || initialTemplate.PaperSize || '4x4',
            orientation: initialTemplate.orientation || initialTemplate.Orientation || 'Portrait',
            templateType: initialTemplate.templateType || initialTemplate.TemplateType || 'Standard'
          },
          elements: content?.elements || [],
          canvasSize: content?.canvasSize || { width: 400, height: 400 }
        };
      }
      
      // ถ้าไม่มี initialTemplate ให้เรียก API ตามปกติ
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('กรุณาเข้าสู่ระบบก่อนใช้งาน');
      }
      
      const API_BASE_URL = getApiBaseUrl();
      console.log(`Fetching template with ID: ${id} from ${API_BASE_URL}/templates/${id}`);
      
      const response = await fetch(`${API_BASE_URL}/templates/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const template = await response.json();
      console.log('Template loaded from API:', template.name);
      console.log('Template structure:', Object.keys(template));
      
      // แปลง content เป็น object
      let content;
      try {
        if (typeof template.content === 'string') {
          console.log('API template content is string, parsing to JSON...');
          content = JSON.parse(template.content);
          console.log('API content parsed successfully:', 
            'elements:', Array.isArray(content.elements) ? content.elements.length : 'no elements array', 
            'canvasSize:', content.canvasSize ? 'exists' : 'missing');
        } else if (template.content) {
          console.log('API content is already an object');
          content = template.content;
        }
      } catch (e) {
        console.error('Error parsing template content from API:', e);
        throw new Error('Template เสียหาย กรุณาสร้าง template ใหม่');
      }
      
      // ตรวจสอบรูปแบบของ elements
      if (content?.elements) {
        if (!Array.isArray(content.elements)) {
          console.warn('API elements is not an array, converting to array');
          content.elements = [];
        } else if (content.elements.length > 0) {
          console.log('First API element type:', content.elements[0].type);
          console.log('Number of API elements:', content.elements.length);
        }
      } else {
        console.warn('No elements found in API content, creating empty array');
        content = content || {};
        content.elements = [];
      }
      
      // ตั้งค่า templateId
      setTemplateId(id);
      setTemplateLoaded(true);
      
      // ส่งผลลัพธ์กลับ
      return {
        templateInfo: {
          name: template.name || 'Unnamed Template',
          description: template.description || '',
          productKey: template.productKey || template.ProductKey || '',
          customerKey: template.customerKey || template.CustomerKey || '',
          paperSize: template.paperSize || template.PaperSize || '4x4',
          orientation: template.orientation || template.Orientation || 'Portrait',
          templateType: template.templateType || template.TemplateType || 'Standard'
        },
        elements: content?.elements || [],
        canvasSize: content?.canvasSize || { width: 400, height: 400 }
      };
    } catch (error: any) {
      console.error('Error loading template:', error);
      message.error(`เกิดข้อผิดพลาดในการโหลด template: ${error.message}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * ส่งออกเทมเพลตเป็น JSON
   * @param elements รายการ elements
   * @param canvasSize ขนาดของ canvas
   */
  const exportTemplateAsJson = useCallback((elements: ElementType[], canvasSize: CanvasSize): string => {
    try {
      const templateData = {
        elements,
        canvasSize,
        exportDate: new Date().toISOString()
      };
      
      return JSON.stringify(templateData, null, 2);
    } catch (error) {
      console.error('Error exporting template:', error);
      message.error('เกิดข้อผิดพลาดในการส่งออก template');
      return '';
    }
  }, []);

  /**
   * นำเข้าเทมเพลตจาก JSON
   * @param json ข้อมูล JSON ของเทมเพลต
   */
  const importTemplateFromJson = useCallback((json: string) => {
    try {
      const data = JSON.parse(json);
      
      if (!data.elements || !Array.isArray(data.elements)) {
        throw new Error('รูปแบบ JSON ไม่ถูกต้อง (elements ไม่พบหรือไม่ใช่ array)');
      }
      
      const canvasSize = data.canvasSize || { width: 400, height: 400 };
      
      return {
        elements: data.elements,
        canvasSize
      };
    } catch (error: any) {
      console.error('Error importing template:', error);
      message.error(`เกิดข้อผิดพลาดในการนำเข้า template: ${error.message}`);
      return null;
    }
  }, []);

  return {
    isSaving,
    isLoading,
    lastSaved,
    templateId,
    templateLoaded,
    saveTemplate,
    loadTemplate,
    exportTemplateAsJson,
    importTemplateFromJson,
    setTemplateId
  };
}; 