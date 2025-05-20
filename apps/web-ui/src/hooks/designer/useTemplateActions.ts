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
        layer: el.layer || index * 10 // ใช้ช่วงที่กว้างขึ้นเพื่อให้มีช่องว่างระหว่าง layer
      }));
      
      const contentObj = {
        elements: elementsWithZIndex,
        canvasSize
      };
      
      // แปลง content เป็น JSON string
      const contentJson = JSON.stringify(contentObj);
      
      // ตรวจสอบขนาดของ content อย่าให้เกิน 8000 ตัวอักษร (เป็นขีดจำกัดของ SQL NVARCHAR(MAX))
      // ถ้าเกินให้ทำการ compress หรือ truncate
      let finalContent = contentJson;
      if (contentJson.length > 8000) {
        console.warn(`Content size (${contentJson.length}) exceeds recommended limit, applying compression...`);
        // ลดรายละเอียดของ element ที่ไม่จำเป็น
        const simplifiedElements = elementsWithZIndex.map(el => {
          // เก็บเฉพาะข้อมูลที่จำเป็น
          const essential = {
            id: el.id,
            type: el.type,
            x: Math.round(el.x),
            y: Math.round(el.y),
            width: Math.round(el.width),
            height: Math.round(el.height),
            layer: el.layer
          };
          
          // เพิ่มข้อมูลเฉพาะตาม type
          if (el.type === 'text') {
            return {
              ...essential,
              text: el.text,
              fontSize: el.fontSize,
              fontFamily: el.fontFamily,
              fill: el.fill,
              align: el.align
            };
          }
          else if (el.type === 'barcode') {
            return {
              ...essential,
              value: el.value,
              format: el.format,
              displayValue: el.displayValue
            };
          }
          else if (el.type === 'qr') {
            return {
              ...essential,
              value: el.value
            };
          }
          else if (el.type === 'image') {
            // สำหรับรูปภาพ ถ้ามี src เป็น data URL ที่ยาวมาก ให้ลบออก
            // ลบ data URL src ออกเพื่อลดขนาด
            return {
              ...essential,
              src: el.src?.startsWith('data:') ? '<data-url-removed>' : el.src
            };
          }
          
          return essential;
        });
        
        // สร้าง content ใหม่ด้วย element ที่ลดรายละเอียดแล้ว
        const compressedContent = {
          elements: simplifiedElements,
          canvasSize
        };
        
        finalContent = JSON.stringify(compressedContent);
      }
      
      // เตรียมข้อมูลตามโครงสร้างของตาราง LabelTemplate
      const templateData: any = {
        name: templateInfo.name || `Template-${batchNo || new Date().toISOString().slice(0, 10)}`,
        description: templateInfo.description || '',
        productKey: templateInfo.productKey || '',
        customerKey: templateInfo.customerKey || '',
        engine: 'Canvas', // ใช้ engine 'Canvas' สำหรับ designer ใหม่
        paperSize: templateInfo.paperSize || '4x4',
        orientation: templateInfo.orientation || 'Portrait',
        templateType: templateInfo.templateType || 'INNER',
        content: finalContent,
        customWidth: canvasSize.width,
        customHeight: canvasSize.height,
        active: true
      };
      
      // เตรียมข้อมูล components ตามโครงสร้างของตาราง LabelTemplateComponent
      const components = elements.map(el => {
        // สร้าง component ตามโครงสร้างในฐานข้อมูล
        const component: any = {
          componentType: el.type,
          x: Math.round(el.x),
          y: Math.round(el.y),
          w: Math.round(el.width),
          h: Math.round(el.height),
          visible: el.visible !== false, // ถ้าไม่ได้กำหนด ให้เป็น true
          layer: el.layer || 0
        };
        
        // เพิ่มข้อมูลเฉพาะตาม type
        if (el.type === 'text') {
          component.fontName = el.fontFamily;
          component.fontSize = el.fontSize;
          component.fill = el.fill;
          component.align = el.align;
          component.staticText = el.text;
        }
        else if (el.type === 'barcode') {
          component.barcodeFormat = el.format;
          component.staticText = el.value;
          component.placeholder = 'barcode';
        }
        else if (el.type === 'qr') {
          component.staticText = el.value;
          component.placeholder = 'qrcode';
        }
        
        return component;
      });
      
      // รับ token จาก localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('กรุณาเข้าสู่ระบบก่อนใช้งาน');
      }

      // ตั้งค่า API URL ให้ถูกต้อง
      const apiUrl = getApiBaseUrl();
      
      // เตรียม request data ที่จะส่งไป API
      const requestData: any = {
        ...templateData,
        components: components
      };
      
      // ถ้ามี templateId แล้ว ให้เพิ่มข้อมูลสำหรับการอัปเดต
      if (templateId) {
        requestData.templateID = parseInt(templateId);
        requestData.incrementVersion = true;
        
        const response = await fetch(`${apiUrl}/templates/${templateId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(requestData),
        });
        
        if (response.ok) {
          const data = await response.json();
          message.success('บันทึกการแก้ไข template เรียบร้อยแล้ว');
          setLastSaved(new Date());
          return data;
        } else {
          // ถ้า PUT ไม่สำเร็จ ให้ลองใช้ POST แทน
          console.warn('PUT request failed, trying POST with templateID...');
          
          const postResponse = await fetch(`${apiUrl}/templates`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestData),
          });
          
          if (postResponse.ok) {
            const data = await postResponse.json();
            message.success('บันทึกการแก้ไข template เรียบร้อยแล้ว');
            setLastSaved(new Date());
            return data;
          } else {
            const errorData = await postResponse.json().catch(() => ({}));
            throw new Error(errorData.message || postResponse.statusText);
          }
        }
      } else {
        // สร้าง Template ใหม่
        const response = await fetch(`${apiUrl}/templates`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(requestData),
        });
        
        if (response.ok) {
          const data = await response.json();
          setTemplateId(data.templateID?.toString() || data.id?.toString());
          message.success('บันทึก template เรียบร้อยแล้ว');
          setLastSaved(new Date());
          
          // ในกรณีที่มีการระบุ productKey และ customerKey ให้เพิ่มข้อมูลไปยังตาราง mapping
          if (templateInfo.productKey || templateInfo.customerKey) {
            try {
              // ไม่ต้องเรียกใช้งาน API แยกต่างหากสำหรับการทำ mapping
              // เนื่องจาก API /api/templates จะจัดการเรื่องนี้ให้อัตโนมัติโดยใช้ 
              // stored procedure FgL.UpdateTemplateMappingWithStringKeys
              console.log('Template mapping will be handled automatically by the API');
            } catch (mappingError) {
              console.error('Error in template mapping logic:', mappingError);
              // ไม่ throw error เนื่องจากไม่ใช่ข้อผิดพลาดสำคัญที่ควรทำให้การบันทึก template ล้มเหลว
            }
          }
          
          return data;
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || response.statusText);
        }
      }
    } catch (error: any) {
      console.error('เกิดข้อผิดพลาดในการบันทึก template:', error);
      message.error(`บันทึก template ไม่สำเร็จ: ${error.message}`);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [templateId, getApiBaseUrl]);

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