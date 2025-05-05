import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import { Button, Table, Input, Space, DatePicker, message, Modal, Select, Spin, InputNumber, Tooltip } from 'antd';
import { PrinterOutlined, SearchOutlined, ReloadOutlined, LogoutOutlined, PlusOutlined, SettingOutlined, EditOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { useTranslation } from 'react-i18next';
import Image from "next/image";
import RequireAuth from '../components/RequireAuth';
import jsPDF from 'jspdf';

// ตรวจสอบว่าอยู่ในฝั่ง client
const isClient = typeof window !== 'undefined';

// นำเข้าโมดูลที่ทำงานเฉพาะฝั่ง client
let QRCode: any = null;
let JsBarcode: any = null;
if (isClient) {
  QRCode = require('qrcode');
  JsBarcode = require('jsbarcode');
}

interface Batch {
  batchNo: string;
  productKey: string | null;
  customerKey: string | null;
  updatedAt: string;          // ← always *UTC* from API
  templateId?: number | null;
  templateName?: string;
  templateUpdatedAt?: string | null;
}

interface Template {
  templateID: number;
  name: string;
  productKey: string | null;
  customerKey: string | null;
  version: number;
  content?: string;
  updatedAt?: string;
}

interface Printer {
  id: number;
  name: string;
  isSystem?: boolean;
}

/* ---------- helper: convert UTC time to local time with specific format ---------- */
function formatDateTime(ds?: string | null) {
  if (!ds) return null;
  // Add Z suffix if not already present to ensure UTC parsing
  const d = new Date(ds.endsWith('Z') ? ds : `${ds}Z`);
  // Format to local time with Western digits
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Bangkok', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function BatchSearch() {
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [selectedPrinter, setSelectedPrinter] = useState<number | null>(null);
  const [copies, setCopies] = useState(1);
  const [templatePreview, setTemplatePreview] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const [systemPrinters, setSystemPrinters] = useState<string[]>([]);
  
  // คงค่าไว้ระหว่าง renders
  const apiCallInProgress = useRef(false);
  const templatesCache = useRef<Template[]>([]);
  const pdfDocRef = useRef<jsPDF | null>(null);

  // Default database printers (ใช้ useMemo แทน const เพื่อป้องกันการสร้างใหม่ใน re-renders)
  const dbPrinters = useMemo(() => [
    { id: 1, name: 'Office Printer', isSystem: false },
    { id: 2, name: 'Production Floor', isSystem: false },
    { id: 3, name: 'Warehouse', isSystem: false }
  ], []);

  // Format the date correctly - ใช้ useCallback เพื่อป้องกันการสร้างฟังก์ชันใหม่ใน render
  const formatDate = useCallback((dateString: string | null) => {
    if (!dateString) return "-";
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "-"; 
      
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return "-";
    }
  }, []);

  // Separate fetch functions to avoid circular dependencies
  const fetchTemplates = useCallback(async () => {
    try {
      // ถ้ามีข้อมูล cache และไม่ได้เรียกข้อมูลอยู่แล้ว ให้ใช้ข้อมูลจาก cache
      if (templatesCache.current.length > 0) {
        return templatesCache.current;
      }
      
      const response = await api.get('/api/templates');
      // เก็บข้อมูลไว้ใน cache
      templatesCache.current = response.data;
      return response.data;
    } catch (error) {
      console.error('Error fetching templates:', error);
      return [];
    }
  }, []);

  const fetchBatchesData = useCallback(async () => {
    try {
      const response = await api.get('/api/batches/current');
      return response.data;
    } catch (error) {
      console.error('Error fetching batches data:', error);
      return [];
    }
  }, []);

  // Combined fetch and match function
  const fetchAndMatchData = useCallback(async () => {
    // ป้องกันการเรียก API ซ้ำซ้อน
    if (apiCallInProgress.current || !isAuthenticated) return;
    
    apiCallInProgress.current = true;
    
    try {
      setLoading(true);
      
      // Fetch batches and templates in parallel
      const [batchesData, templatesData] = await Promise.all([
        fetchBatchesData(),
        fetchTemplates()
      ]);
      
      // Store templates data separately
      setTemplates(templatesData);
      
      // Match batches with templates and include template updatedAt
      const matchedBatches = batchesData.map((batch: any) => {
        const matchedTemplate = templatesData.find((template: Template) => 
          template.productKey === batch.productKey && 
          template.customerKey === batch.customerKey
        );
        
        return {
          ...batch,
          updatedAt: batch.updatedAt || batch.createdAt,
          templateId: matchedTemplate?.templateID || null,
          templateName: matchedTemplate?.name || '-',
          templateUpdatedAt: matchedTemplate?.updatedAt || null
        };
      });
      
      setBatches(matchedBatches);
    } catch (error) {
      message.error('Error loading data');
      console.error('Error in fetchAndMatchData:', error);
    } finally {
      setLoading(false);
      apiCallInProgress.current = false;
    }
  }, [fetchBatchesData, fetchTemplates, isAuthenticated]);

  // Try to detect system printers using browser APIs
  const detectSystemPrinters = useCallback(() => {
    if (navigator.userAgent.includes('Chrome') && 'print' in window) {
      setSystemPrinters(['System Default Printer']);
    }
  }, []);

  // Initial setup
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // Set up printers only once
    setPrinters(dbPrinters);
    detectSystemPrinters();

    // Initial data fetch
    fetchAndMatchData();
  }, [isAuthenticated, router, dbPrinters, detectSystemPrinters, fetchAndMatchData]);

  // Handler ต่างๆ
  const handleRefresh = useCallback(() => {
    // ล้าง cache เพื่อให้โหลดข้อมูลใหม่
    templatesCache.current = [];
    setPdfPreviewUrl(null);
    fetchAndMatchData();
  }, [fetchAndMatchData]);

  const handleDateRangeChange = useCallback((dates: any) => {
    setDateRange(dates as [Date | null, Date | null]);
  }, []);

  /* ---------- preview helpers ---------- */
  // Improved function to safely parse template content
  const safeParseContent = (tpl:any)=>{
    // Support various content formats from API
    const raw = tpl?.content || tpl?.Content || tpl?.CONTENT;
    if (!raw) {
      console.warn("Content not found in template");
      return {
        elements: [],
        canvasSize: { width: 800, height: 500 }
      };
    }
    
    try{ 
      return typeof raw === 'string' ? JSON.parse(raw) : raw; 
    } catch(err){
      // Try to repair malformed JSON
      try{
        let str = typeof raw === 'string' ? raw : ''+raw;
        // Balance braces/brackets
        const oB = (str.match(/{/g)||[]).length;
        const cB = (str.match(/}/g)||[]).length;
        const oS = (str.match(/\[/g)||[]).length;
        const cS = (str.match(/]/g)||[]).length;
        str += '}'.repeat(Math.max(0, oB-cB))+']'.repeat(Math.max(0, oS-cS));
        return JSON.parse(str);
      } catch(error){
        console.error("JSON repair failed:", error);
        // Return minimal working structure
        return {
          elements: [],
          canvasSize: { width: 800, height: 500 }
        };
      }
    }
  };

  // Improved function to fetch template preview
  const fetchTemplatePreview = async (templateId: number, currentBatch: Batch) => {
    if (!templateId) {
      setTemplatePreview('<div class="error">Invalid Template ID</div>');
      return;
    }
    
    if (!currentBatch) {
      console.error("Batch data not found");
      setTemplatePreview('<div class="error">Batch data not found</div>');
      return;
    }
    
    setLoadingPreview(true);
    setPdfPreviewUrl(null);
    
    try {
      console.log("Loading template ID:", templateId);
      const response = await api.get(`/api/templates/${templateId}`);
      
      // Use safeParseContent for robust parsing
      const contentObj = safeParseContent(response.data);
      
      if (!contentObj || !contentObj.elements || !Array.isArray(contentObj.elements)) {
        setTemplatePreview('<div class="error">Invalid template structure</div>');
        return;
      }
      
      console.log("Template data found:", contentObj.elements.length, "elements");
      
      // Generate HTML preview
      const previewHtml = generatePreviewHtml(contentObj, currentBatch);
      setTemplatePreview(previewHtml);
      
      // Generate PDF preview
      await generatePdfPreview(contentObj, currentBatch);
      
    } catch (error) {
      console.error('Error fetching template preview:', error);
      setTemplatePreview('<div class="error">Error loading template</div>');
      message.error('Error loading template');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Improved PDF preview generation function
  const generatePdfPreview = async (content: any, batch: Batch | null) => {
    if (!content || !content.elements) {
      console.warn("Incomplete template data");
      setPdfPreviewUrl(null);
      return;
    }
    
    if (!batch) {
      console.warn("Batch data not found");
      setPdfPreviewUrl(null);
      return;
    }
    
    console.log("Generating PDF preview with batch data:", batch.batchNo);
    
    try {
      // Set dimensions based on template data
      const width = content.canvasSize?.width || 800;
      const height = content.canvasSize?.height || 500;
      
      // Create PDF with correct dimensions
      const pdf = new jsPDF({
        orientation: width > height ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [width, height]
      });
      
      // Set white background
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, width, height, 'F');
      
      // Sort elements by layer if available, to ensure correct rendering order
      const sortedElements = [...content.elements].sort((a, b) => {
        if (a.layer !== undefined && b.layer !== undefined) {
          return a.layer - b.layer;
        }
        if (a.layer !== undefined) return -1;
        if (b.layer !== undefined) return 1;
        return 0;
      });
      
      // Render each element to PDF
      for (const el of sortedElements) {
        if (!el || el.visible === false) continue;
        
        // Get element coordinates and dimensions
        const x = typeof el.x === 'number' ? el.x : 0;
        const y = typeof el.y === 'number' ? el.y : 0;
        const w = typeof el.width === 'number' && el.width > 0 ? el.width : 100;
        const h = typeof el.height === 'number' && el.height > 0 ? el.height : 20;
        
        try {
          if (el.type === 'text') {
            // Process text elements
            let txt = el.text || '';
            const fontSize = typeof el.fontSize === 'number' ? el.fontSize : 12;
            
            // Replace variables with batch data
            txt = txt.replace(/{batchNo}/g, batch.batchNo || '')
                   .replace(/{productKey}/g, batch.productKey || '')
                   .replace(/{customerKey}/g, batch.customerKey || '');
            
            pdf.setFontSize(fontSize);
            pdf.setTextColor(0, 0, 0);
            
            // Set font style
            if (el.fontWeight === 'bold') {
              pdf.setFont('helvetica', 'bold');
            } else if (el.fontStyle === 'italic') {
              pdf.setFont('helvetica', 'italic');
            } else if (el.fontWeight === 'bold' && el.fontStyle === 'italic') {
              pdf.setFont('helvetica', 'bolditalic');
            } else {
              pdf.setFont('helvetica', 'normal');
            }
            
            // Handle text alignment
            let xPos = x;
            if (el.align === 'center') xPos = x + w/2;
            else if (el.align === 'right') xPos = x + w;
            
            pdf.text(txt, xPos, y + fontSize, { 
              align: el.align || 'left'
            });
          } 
          else if (el.type === 'rect') {
            // Draw rectangles
            if (el.fill) {
              pdf.setFillColor(el.fill);
              pdf.rect(x, y, w, h, 'F');
            }
            
            // Draw border if specified
            if (el.borderWidth && el.borderWidth > 0) {
              pdf.setDrawColor(el.borderColor || '#000000');
              pdf.setLineWidth(el.borderWidth);
              pdf.rect(x, y, w, h, 'S');
            }
          }
          else if (el.type === 'barcode' || el.type === 'qr') {
            // For barcodes and QR codes, create temporary canvas to generate the image
            // Then add the image to PDF
            if (isClient) {
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              
              if (ctx) {
                if (el.type === 'barcode' && JsBarcode) {
                  let value = el.value || '';
                  
                  // Replace variables with batch data
                  value = value.replace(/{batchNo}/g, batch.batchNo || '')
                          .replace(/{productKey}/g, batch.productKey || '')
                          .replace(/{customerKey}/g, batch.customerKey || '');
                  
                  try {
                    JsBarcode(canvas, value, {
                      format: el.format || 'CODE128',
                      width: 2,
                      height: h - 20, // Leave space for text
                      displayValue: true,
                      margin: 0,
                      background: '#FFFFFF',
                      lineColor: '#000000',
                    });
                    
                    const imgData = canvas.toDataURL('image/png');
                    pdf.addImage(imgData, 'PNG', x, y, w, h);
                  } catch (barcodeErr) {
                    console.error("Error generating barcode:", barcodeErr);
                    // Fallback text
                    pdf.setFontSize(10);
                    pdf.text(`BARCODE: ${value}`, x + 5, y + h/2);
                  }
                } 
                else if (el.type === 'qr' && QRCode) {
                  let value = el.value || '';
                  
                  // Replace variables with batch data
                  value = value.replace(/{batchNo}/g, batch.batchNo || '')
                          .replace(/{productKey}/g, batch.productKey || '')
                          .replace(/{customerKey}/g, batch.customerKey || '');
                  
                  try {
                    await QRCode.toCanvas(canvas, value, {
                      width: Math.min(w, h) - 10,
                      margin: 0,
                      color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                      }
                    });
                    
                    const imgData = canvas.toDataURL('image/png');
                    pdf.addImage(imgData, 'PNG', x, y, w, h);
                  } catch (qrErr) {
                    console.error("Error generating QR code:", qrErr);
                    // Fallback text
                    pdf.setFontSize(10);
                    pdf.text(`QR CODE: ${value}`, x + 5, y + h/2);
                  }
                } else {
                  // Fallback for when libraries are not available
                  pdf.setFontSize(10);
                  pdf.setDrawColor('#999999');
                  pdf.setLineWidth(1);
                  pdf.rect(x, y, w, h, 'S');
                  pdf.text(`${el.type === 'barcode' ? 'BARCODE' : 'QR'}: ${el.value || ''}`, x + 5, y + h/2);
                }
              }
            } else {
              // Fallback for server-side rendering
              pdf.setFontSize(10);
              pdf.setDrawColor('#999999');
              pdf.setLineWidth(1);
              pdf.rect(x, y, w, h, 'S');
              pdf.text(`${el.type === 'barcode' ? 'BARCODE' : 'QR'}: ${el.value || ''}`, x + 5, y + h/2);
            }
          }
          else if (el.type === 'image' && el.src) {
            // For image elements, add them directly to PDF
            try {
              pdf.addImage(el.src, 'PNG', x, y, w, h);
            } catch (imgErr) {
              console.error("Error adding image to PDF:", imgErr);
              // Draw placeholder box
              pdf.setDrawColor('#999999');
              pdf.setLineWidth(1);
              pdf.rect(x, y, w, h, 'S');
              pdf.setFontSize(10);
              pdf.text('IMAGE PLACEHOLDER', x + 5, y + h/2);
            }
          }
        } catch (elementError) {
          console.error(`Error rendering element ${el.type}:`, elementError);
        }
      }
      
      // Store PDF reference for saving later
      pdfDocRef.current = pdf;
      
      // Create URL for preview
      const pdfBlob = pdf.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      
      // Revoke old URL if exists (prevent memory leaks)
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
      
      // Update state
      setPdfPreviewUrl(url);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      message.error('Cannot generate PDF file');
      setPdfPreviewUrl(null);
    }
  };

  // Improved HTML preview generation function
  const generatePreviewHtml = (content: any, batch: Batch | null) => {
    if(!content || !content.elements || !batch) {
      return '<div class="error" style="color:red;padding:20px;text-align:center;font-family:Arial;">Invalid template data</div>';
    }

    try {
      // Canvas size from template or default value
      const width = content.canvasSize?.width || 800;
      const height = content.canvasSize?.height || 500;
      
      // Improved mini renderer
      const els = content.elements.map((e:any)=>{
        if(!e || e.visible === false) return '';
        
        // Check coordinates and dimensions
        const x = typeof e.x === 'number' ? e.x : 0;
        const y = typeof e.y === 'number' ? e.y : 0;
        const w = typeof e.width === 'number' && e.width > 0 ? e.width : 100;
        const h = typeof e.height === 'number' && e.height > 0 ? e.height : 20;
        
        if (e.type === 'text'){
          // Support variable replacement in text
          let txt = e.text || '';
          const fontSize = typeof e.fontSize === 'number' ? e.fontSize : 16;
          const fontFamily = e.fontFamily || 'Arial, sans-serif';
          const color = e.fill || '#000';
          const align = e.align || 'center';
          
          // Replace batch variables
          txt = txt.replace(/{batchNo}/g, batch.batchNo || '')
                  .replace(/{productKey}/g, batch.productKey || '')
                  .replace(/{customerKey}/g, batch.customerKey || '');
          
          return `<div style="position:absolute;left:${x}px;top:${y}px;
            width:${w}px;height:${h}px;font-size:${fontSize}px;
            font-family:${fontFamily};color:${color};
            display:flex;align-items:center;justify-content:${align};
            ${e.fontWeight ? `font-weight:${e.fontWeight};` : ''}
            ${e.fontStyle ? `font-style:${e.fontStyle};` : ''}
            overflow:hidden;word-break:break-word;">${txt}</div>`;
        }
        
        if (e.type === 'barcode') {
          // For barcodes, use the batch-search.tsx codebase's barcodeDataUrls if available
          // Otherwise, create a placeholder for visual representation
          const value = (e.value || '').replace(/{batchNo}/g, batch.batchNo || '')
                        .replace(/{productKey}/g, batch.productKey || '')
                        .replace(/{customerKey}/g, batch.customerKey || '');
                        
          // Create a barcode dynamically using JsBarcode if available
          if (isClient && JsBarcode) {
            const canvas = document.createElement('canvas');
            try {
              JsBarcode(canvas, value, {
                format: e.format || 'CODE128',
                width: 2,
                height: h,
                displayValue: true,
                margin: 0,
              });
              const dataUrl = canvas.toDataURL('image/png');
              return `<div style="position:absolute;left:${x}px;top:${y}px;
                width:${w}px;height:${h}px;overflow:hidden;">
                <img src="${dataUrl}" style="width:100%;height:100%;object-fit:contain;" alt="Barcode: ${value}"/>
              </div>`;
            } catch (err) {
              console.error("Error generating barcode:", err);
            }
          }
          
          // Fallback to a visual placeholder
          return `<div style="position:absolute;left:${x}px;top:${y}px;
            width:${w}px;height:${h}px;
            border:1px dashed #999;background:#f7f7f7;
            display:flex;align-items:center;justify-content:center;
            font-size:12px;font-family:Arial,sans-serif;">
            BARCODE: ${value}</div>`;
        }
        
        if (e.type === 'qr') {
          // For QR codes, create a visual representation or generate dynamically
          const value = (e.value || '').replace(/{batchNo}/g, batch.batchNo || '')
                        .replace(/{productKey}/g, batch.productKey || '')
                        .replace(/{customerKey}/g, batch.customerKey || '');
                        
          // Use QRCode library if available
          if (isClient && QRCode) {
            try {
              const canvas = document.createElement('canvas');
              QRCode.toCanvas(canvas, value, {
                width: Math.min(w, h),
                margin: 0
              });
              const dataUrl = canvas.toDataURL('image/png');
              return `<div style="position:absolute;left:${x}px;top:${y}px;
                width:${w}px;height:${h}px;overflow:hidden;">
                <img src="${dataUrl}" style="width:100%;height:100%;object-fit:contain;" alt="QR Code: ${value}"/>
              </div>`;
            } catch (err) {
              console.error("Error generating QR code:", err);
            }
          }
          
          // Fallback to a visual placeholder
          return `<div style="position:absolute;left:${x}px;top:${y}px;
            width:${w}px;height:${h}px;
            border:1px dashed #999;background:#f7f7f7;
            display:flex;align-items:center;justify-content:center;
            font-size:12px;font-family:Arial,sans-serif;">
            QR CODE: ${value}</div>`;
        }
        
        if (e.type === 'rect') {
          // Support border and background
          const fill = e.fill || '#ffffff';
          const borderWidth = typeof e.borderWidth === 'number' ? e.borderWidth : 1;
          const borderColor = e.borderColor || '#000000';
          const borderStyle = e.borderStyle || 'solid';
          
          return `<div style="position:absolute;left:${x}px;top:${y}px;
            width:${w}px;height:${h}px;
            background:${fill};
            border:${borderWidth}px ${borderStyle} ${borderColor};"></div>`;
        }
        
        if (e.type === 'image' && e.src) {
          // Handle image elements
          return `<div style="position:absolute;left:${x}px;top:${y}px;
            width:${w}px;height:${h}px;overflow:hidden;">
            <img src="${e.src}" style="width:100%;height:100%;object-fit:contain;" alt="Image"/>
          </div>`;
        }
        
        // For other types not yet supported
        return '';
      }).join('');
      
      // Create a complete HTML document for display
      return `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Label Preview</title>
        <style>
          body { margin: 0; padding: 0; }
          .canvas { position: relative; width: ${width}px; height: ${height}px; background: white; border: 1px solid #ccc; overflow: hidden; }
        </style>
      </head>
      <body>
        <div class="canvas">${els}</div>
      </body>
      </html>`;
    } catch (err) {
      console.error("Error generating HTML preview:", err);
      return '<div class="error" style="color:red;padding:20px;text-align:center;font-family:Arial;">Error generating preview</div>';
    }
  };

  // Improved function to open print modal
  const openPrintModal = useCallback(async (batch: Batch) => {
    if (!batch?.batchNo) {
      message.error('Batch data not found');
      return;
    }
    
    // Set selected batch before calling fetchTemplatePreview
    setSelectedBatch(batch);
    setCopies(1);
    setSelectedPrinter(-1); // default "System"
    setPrintModalVisible(true);
    setLoadingPreview(true);
    
    try {
      // Check templateId before calling fetchTemplatePreview
      if (batch.templateId) {
        await fetchTemplatePreview(batch.templateId, batch);
      } else {
        // When no templateId found
        console.warn("No templateId found for batch", batch.batchNo);
        setTemplatePreview('<div style="padding:20px;text-align:center;">No template found for this batch</div>');
        setPdfPreviewUrl(null);
      }
    } catch (err) {
      console.error("Error opening print modal:", err);
      setTemplatePreview('<div style="padding:20px;text-align:center;">Error loading template</div>');
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  // useMemo สำหรับการกรองข้อมูล เพื่อป้องกันการคำนวณทุกครั้งที่ render
  const filteredBatches = useMemo(() => {
    return batches.filter(batch => {
      const matchesSearch = searchText === '' || 
        batch.batchNo.toLowerCase().includes(searchText.toLowerCase()) ||
        (batch.productKey?.toLowerCase().includes(searchText.toLowerCase())) ||
        (batch.customerKey?.toLowerCase().includes(searchText.toLowerCase())) ||
        (batch.templateName?.toLowerCase().includes(searchText.toLowerCase()));
  
      const batchDate = new Date(batch.updatedAt);
      const matchesDateRange = (!dateRange[0] || batchDate >= dateRange[0]) &&
        (!dateRange[1] || batchDate <= dateRange[1]);
  
      return matchesSearch && matchesDateRange;
    });
  }, [batches, searchText, dateRange]);

  // พิมพ์โดยตรงจากข้อมูล batch ที่เลือก
  const printDirectly = async (batch: Batch) => {
    // ตรวจสอบว่ามีข้อมูล batch
    if (!batch || !batch.batchNo) {
      message.error('No batch data available for printing');
      return;
    }
    
    setSelectedBatch(batch);
    setIsPrinting(true);
    
    try {
      // ตรวจสอบว่ามี templateId หรือไม่
      if (!batch.templateId) {
        message.error('No template found for this batch');
        setIsPrinting(false);
        return;
      }
      
      console.log(`Printing batch ${batch.batchNo} with template ID ${batch.templateId}`);
      
      // ดึงข้อมูล template จาก API
      const response = await api.get(`/api/templates/${batch.templateId}`);
      const template = response.data;
      
      // ตรวจสอบว่ามีข้อมูล content หรือไม่
      const contentObj = safeParseContent(template);
      if (!contentObj || !contentObj.elements || !Array.isArray(contentObj.elements)) {
        message.error('Invalid template structure');
        setIsPrinting(false);
        return;
      }
      
      console.log(`Template loaded with ${contentObj.elements.length} elements`);
      
      // สร้าง PDF
      const width = contentObj.canvasSize?.width || 800;
      const height = contentObj.canvasSize?.height || 500;
      
      const pdf = new jsPDF({
        orientation: width > height ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [width, height]
      });
      
      // Set white background
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, width, height, 'F');
      
      // Sort elements by layer to ensure correct rendering order
      const sortedElements = [...contentObj.elements].sort((a, b) => {
        if (a.layer !== undefined && b.layer !== undefined) {
          return a.layer - b.layer;
        }
        if (a.layer !== undefined) return -1;
        if (b.layer !== undefined) return 1;
        return 0;
      });
      
      // วาดแต่ละ element ลงใน PDF
      for (const el of sortedElements) {
        if (!el || el.visible === false) continue;
        
        // รับค่าพิกัดและขนาดของ element
        const x = typeof el.x === 'number' ? el.x : 0;
        const y = typeof el.y === 'number' ? el.y : 0;
        const w = typeof el.width === 'number' && el.width > 0 ? el.width : 100;
        const h = typeof el.height === 'number' && el.height > 0 ? el.height : 20;
        
        try {
          if (el.type === 'text') {
            // แสดงข้อความ
            let txt = el.text || '';
            const fontSize = typeof el.fontSize === 'number' ? el.fontSize : 12;
            
            // แทนที่ตัวแปรด้วยข้อมูลจาก batch
            txt = txt.replace(/{batchNo}/g, batch.batchNo || '')
                 .replace(/{productKey}/g, batch.productKey || '')
                 .replace(/{customerKey}/g, batch.customerKey || '');
            
            pdf.setFontSize(fontSize);
            pdf.setTextColor(0, 0, 0);
            
            // ตั้งค่ารูปแบบตัวอักษร
            if (el.fontWeight === 'bold') {
              pdf.setFont('helvetica', 'bold');
            } else if (el.fontStyle === 'italic') {
              pdf.setFont('helvetica', 'italic');
            } else if (el.fontWeight === 'bold' && el.fontStyle === 'italic') {
              pdf.setFont('helvetica', 'bolditalic');
            } else {
              pdf.setFont('helvetica', 'normal');
            }
            
            // จัดการ alignment ของข้อความ
            let xPos = x;
            if (el.align === 'center') xPos = x + w/2;
            else if (el.align === 'right') xPos = x + w;
            
            pdf.text(txt, xPos, y + fontSize, { 
              align: el.align || 'left'
            });
          } 
          else if (el.type === 'rect') {
            // วาดสี่เหลี่ยม
            if (el.fill) {
              pdf.setFillColor(el.fill);
              pdf.rect(x, y, w, h, 'F');
            }
            
            // วาดเส้นขอบถ้ามีการระบุ
            if (el.borderWidth && el.borderWidth > 0) {
              pdf.setDrawColor(el.borderColor || '#000000');
              pdf.setLineWidth(el.borderWidth);
              pdf.rect(x, y, w, h, 'S');
            }
          }
          else if (el.type === 'barcode' || el.type === 'qr') {
            // สำหรับ barcode และ QR code สร้าง canvas ชั่วคราวเพื่อสร้างภาพ
            if (isClient) {
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              
              if (ctx) {
                if (el.type === 'barcode' && JsBarcode) {
                  let value = el.value || '';
                  
                  // แทนที่ตัวแปรด้วยข้อมูลจาก batch
                  value = value.replace(/{batchNo}/g, batch.batchNo || '')
                          .replace(/{productKey}/g, batch.productKey || '')
                          .replace(/{customerKey}/g, batch.customerKey || '');
                  
                  try {
                    JsBarcode(canvas, value, {
                      format: el.format || 'CODE128',
                      width: 2,
                      height: h - 20, // เหลือพื้นที่สำหรับข้อความ
                      displayValue: true,
                      margin: 0,
                      background: '#FFFFFF',
                      lineColor: '#000000',
                    });
                    
                    const imgData = canvas.toDataURL('image/png');
                    pdf.addImage(imgData, 'PNG', x, y, w, h);
                  } catch (barcodeErr) {
                    console.error("Error generating barcode:", barcodeErr);
                    // ข้อความแทน
                    pdf.setFontSize(10);
                    pdf.text(`BARCODE: ${value}`, x + 5, y + h/2);
                  }
                } 
                else if (el.type === 'qr' && QRCode) {
                  let value = el.value || '';
                  
                  // แทนที่ตัวแปรด้วยข้อมูลจาก batch
                  value = value.replace(/{batchNo}/g, batch.batchNo || '')
                          .replace(/{productKey}/g, batch.productKey || '')
                          .replace(/{customerKey}/g, batch.customerKey || '');
                  
                  try {
                    await QRCode.toCanvas(canvas, value, {
                      width: Math.min(w, h) - 10,
                      margin: 0,
                      color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                      }
                    });
                    
                    const imgData = canvas.toDataURL('image/png');
                    pdf.addImage(imgData, 'PNG', x, y, w, h);
                  } catch (qrErr) {
                    console.error("Error generating QR code:", qrErr);
                    // ข้อความแทน
                    pdf.setFontSize(10);
                    pdf.text(`QR CODE: ${value}`, x + 5, y + h/2);
                  }
                } else {
                  // fallback
                  pdf.setFontSize(10);
                  pdf.setDrawColor('#999999');
                  pdf.setLineWidth(1);
                  pdf.rect(x, y, w, h, 'S');
                  pdf.text(`${el.type === 'barcode' ? 'BARCODE' : 'QR'}: ${el.value || ''}`, x + 5, y + h/2);
                }
              }
            } else {
              // Server-side fallback
              pdf.setFontSize(10);
              pdf.setDrawColor('#999999');
              pdf.setLineWidth(1);
              pdf.rect(x, y, w, h, 'S');
              pdf.text(`${el.type === 'barcode' ? 'BARCODE' : 'QR'}: ${el.value || ''}`, x + 5, y + h/2);
            }
          }
          else if (el.type === 'image' && el.src) {
            // สำหรับรูปภาพ เพิ่มลงใน PDF โดยตรง
            try {
              pdf.addImage(el.src, 'PNG', x, y, w, h);
            } catch (imgErr) {
              console.error("Error adding image to PDF:", imgErr);
              // วาดกล่องสำหรับแทนรูปภาพ
              pdf.setDrawColor('#999999');
              pdf.setLineWidth(1);
              pdf.rect(x, y, w, h, 'S');
              pdf.setFontSize(10);
              pdf.text('IMAGE PLACEHOLDER', x + 5, y + h/2);
            }
          }
        } catch (elementError) {
          console.error(`Error rendering element ${el.type}:`, elementError);
        }
      }
      
      // แปลง PDF เป็น blob
      const pdfBlob = pdf.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      
      // แสดงในกรอบ iframe และพิมพ์
      if (printFrameRef.current) {
        const iframe = printFrameRef.current;
        
        // ตั้งค่าเหตุการณ์เมื่อโหลดเสร็จ
        iframe.onload = function() {
          setTimeout(() => {
            try {
              if (iframe.contentWindow) {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                
                // แสดงข้อความสำเร็จ
                message.success('Print job sent to printer');
              }
            } catch (printErr) {
              console.error('Error during printing:', printErr);
              message.error('Print error: ' + (printErr instanceof Error ? printErr.message : String(printErr)));
            } finally {
              setIsPrinting(false);
            }
          }, 500);
        };
        
        // ตั้งค่าเหตุการณ์เมื่อเกิดข้อผิดพลาด
        iframe.onerror = function(err) {
          console.error('Error loading PDF into iframe:', err);
          message.error('Error preparing print preview');
          setIsPrinting(false);
        };
        
        // โหลด PDF
        iframe.src = pdfUrl;
      } else {
        message.error('Print frame not found');
        setIsPrinting(false);
      }
    } catch (error) {
      console.error('Error in printDirectly:', error);
      message.error('Print error: ' + (error instanceof Error ? error.message : String(error)));
      setIsPrinting(false);
    }
  };

  // columns with formatDateTime date formatter
  const cols = useMemo(()=>[
    {title:'Batch No', dataIndex:'batchNo', sorter:(a:Batch,b:Batch)=>a.batchNo.localeCompare(b.batchNo)},
    {title:'Product',  dataIndex:'productKey', sorter:(a:Batch,b:Batch)=>(a.productKey||'').localeCompare(b.productKey||'')},
    {title:'Customer', dataIndex:'customerKey'},
    {title:'Template', dataIndex:'templateName'},
    {
      title:'Last Updated', key:'last',
      render:(_:any,r:Batch)=> formatDateTime(r.templateUpdatedAt||r.updatedAt)||'-',
      sorter:(a:Batch,b:Batch)=>{
        const A=new Date(a.templateUpdatedAt||a.updatedAt).getTime();
        const B=new Date(b.templateUpdatedAt||b.updatedAt).getTime(); return A-B;
      }
    },{
      title:'Action',key:'act',render:(_:any,r:Batch)=>(
        <Space>
          <Tooltip title="Print Directly">
            <Button 
              type='primary' 
              icon={<PrinterOutlined/>} 
              onClick={()=>printDirectly(r)}
              loading={isPrinting && selectedBatch?.batchNo === r.batchNo}
            >
              Print
            </Button>
          </Tooltip>
          <Tooltip title="Open Print Preview">
            <Button 
              icon={<FileTextOutlined/>} 
              onClick={()=>openPrintModal(r)}
            >
              Preview
            </Button>
          </Tooltip>
          <Button 
            icon={<EditOutlined/>} 
            onClick={()=>router.push(
              r.templateId?`/templates/designer/${r.templateId}`:
              `/templates/designer?productKey=${r.productKey}&customerKey=${r.customerKey}`
            )}
          >
            Edit Template
          </Button>
        </Space>)
    }
  ],[openPrintModal, router, printDirectly, selectedBatch, isPrinting]);

  // useMemo สำหรับ printers เพื่อป้องกันการสร้างอาร์เรย์ใหม่ทุกครั้งที่ render
  const allPrinters = useMemo(() => [
    ...printers,
    ...systemPrinters.map((name) => ({ 
      id: -1,  // Use negative ID to indicate system printer
      name,
      isSystem: true
    }))
  ], [printers, systemPrinters]);

  // แยก DatePicker.RangePicker ออกมาเพื่อป้องกัน re-render
  const DateRangePicker = useMemo(() => (
    <DatePicker.RangePicker
      onChange={handleDateRangeChange}
      className="rounded-md"
    />
  ), [handleDateRangeChange]);

  // Improved printing function
  const printWithSystem = () => {
    try {
      const iframe = printFrameRef.current;
      if (!iframe) {
        message.error('Print frame not found');
        return;
      }
      
      if (pdfPreviewUrl) {
        // Use PDF for printing
        iframe.src = pdfPreviewUrl;
      } else if (templatePreview) {
        // Use HTML fallback
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) {
          message.error('Cannot access document for printing');
          return;
        }
        
        doc.open();
        doc.write(templatePreview);
        doc.close();
      } else {
        message.error('No data available for printing');
        return;
      }
      
      // Allow time for content to load before printing
      setTimeout(() => {
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          }
        } catch (err) {
          console.error("Error during printing:", err);
          message.error('Error during printing');
        }
      }, 500);
      
      // Close modal after print triggered
      setTimeout(() => {
        setPrintModalVisible(false);
      }, 1000);
    } catch (err) {
      console.error("Error invoking print system:", err);
      message.error('Error invoking print system');
    }
  };

  // Function to handle PDF saving
  const handleSavePdf = () => {
    if (!pdfDocRef.current) {
      message.error('No PDF file ready for saving');
      return;
    }
    
    try {
      const fileName = `${selectedBatch?.batchNo || 'label'}.pdf`;
      pdfDocRef.current.save(fileName);
      message.success(`Saved as ${fileName}`);
    } catch (error) {
      console.error('Error saving PDF:', error);
      message.error('Cannot save PDF file');
    }
  };

  const handleEditTemplate = (batch: Batch) => {
    if (batch.templateId) {
      router.push(`/templates/designer/${batch.templateId}`);
    } else {
      message.info('No template found for this batch. Creating a new template...');
      router.push(`/templates/designer?productKey=${batch.productKey}&customerKey=${batch.customerKey}`);
    }
  };

  const handleCreateTemplate = () => {
    router.push('/templates/designer');
  };

  const handleTemplateManagement = () => {
    router.push('/templates/management');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* hidden frame */}
      <iframe ref={printFrameRef} style={{display:'none'}} title="print"/>
      {/* header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-4 py-3">
          <div className="flex items-center">
            <Image src="https://img2.pic.in.th/pic/logo14821dedd19c2ad18.png"
              alt="logo" width={36} height={36} className="mr-3" unoptimized/>
            <h1 className="text-lg font-bold">FG Label Management System</h1>
          </div>
          <Button type="text" icon={<LogoutOutlined/>} onClick={logout}>Logout</Button>
        </div>
      </header>

      {/* main */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white shadow-md p-6 rounded">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">{t('Batch Search')}</h2>
          <Space className="mb-4 w-full justify-between">
            <Space>
              <Input
                placeholder="Search…" prefix={<SearchOutlined/>}
                value={searchText} onChange={e=>setSearchText(e.target.value)} style={{width:260}}
              />
              <DatePicker.RangePicker onChange={v=>setDateRange(v as any)} />
              <Button icon={<ReloadOutlined/>} onClick={()=>{templatesCache.current=[];fetchAndMatchData();}} loading={loading}>Refresh</Button>
            </Space>
            <Space>
              <Button type="primary" icon={<PlusOutlined/>} onClick={()=>router.push('/templates/designer')}>Create Template</Button>
              <Button icon={<SettingOutlined/>} onClick={()=>router.push('/templates/management')}>Template Management</Button>
            </Space>
          </Space>

          <Table dataSource={filteredBatches} columns={cols} rowKey="batchNo" loading={loading}
                 pagination={{pageSize:10,showSizeChanger:true}}/>
        </div>
      </main>

      {/* print modal */}
      <Modal title="Print Label" open={printModalVisible}
             onCancel={()=>setPrintModalVisible(false)}
             onOk={printWithSystem} okText="Print" width={900}>
        {selectedBatch && (
          <div className="grid grid-cols-2 gap-4">
            {/* info */}
            <div>
              <p><b>Batch No:</b> {selectedBatch.batchNo}</p>
              <p><b>Product Code:</b> {selectedBatch.productKey||'-'}</p>
              <p><b>Customer Code:</b> {selectedBatch.customerKey||'-'}</p>
              <p><b>Template:</b> {selectedBatch.templateName||'-'}</p>
              <div className="mt-3">
                <label>Copies</label>
                <InputNumber min={1} value={copies} onChange={v=>setCopies(v||1)} />
              </div>
              <div className="mt-3">
                <Button 
                  icon={<DownloadOutlined />}
                  onClick={handleSavePdf}
                  disabled={!pdfDocRef.current}
                >
                  Save PDF
                </Button>
              </div>
            </div>
            {/* preview */}
            <div className="border h-[320px] overflow-auto">
              {loadingPreview && (
                <div className="flex items-center justify-center h-full">
                  <Spin />
                  <span className="ml-2">Loading data...</span>
                </div>
              )}
              {!loadingPreview && pdfPreviewUrl && (
                <iframe src={pdfPreviewUrl} width="100%" height="100%" style={{border:'none'}}/>
              )}
              {!loadingPreview && !pdfPreviewUrl && templatePreview && (
                <div dangerouslySetInnerHTML={{__html:templatePreview}}
                     style={{transform:'scale(0.6)',transformOrigin:'top left'}}/>
              )}
              {!loadingPreview && !pdfPreviewUrl && !templatePreview && (
                <div className="flex items-center justify-center h-full text-red-500">
                  Template data not found
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const GuardedBatchSearch = () => (
  <RequireAuth>
    <BatchSearch />
  </RequireAuth>
);

export default GuardedBatchSearch;  