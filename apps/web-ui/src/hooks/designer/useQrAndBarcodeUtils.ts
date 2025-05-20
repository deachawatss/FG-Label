import { useState, useCallback, useEffect, useRef } from 'react';
import { QrElement, BarcodeElement } from '../../models/TemplateDesignerTypes';
import { debounce } from '../../utils/template/helpers';

// ตรวจสอบว่าอยู่ในฝั่ง client
const isClient = typeof window !== 'undefined';

// ประกาศตัวแปรสำหรับเก็บโมดูลที่โหลดในฝั่ง client
let QRCode: any = null;
let JsBarcode: any = null;

// โหลดโมดูลเฉพาะฝั่ง client
if (isClient) {
  try {
    // นำเข้าแบบ dynamic เพื่อให้ทำงานได้ใน Next.js
    import('qrcode').then(module => {
      QRCode = module.default || module;
      if (process.env.NODE_ENV !== 'production') {
        console.log('QRCode library loaded successfully');
      }
    }).catch(err => {
      console.error('Failed to load QRCode library:', err);
    });

    import('jsbarcode').then(module => {
      JsBarcode = module.default || module;
      if (process.env.NODE_ENV !== 'production') {
        console.log('JsBarcode library loaded successfully');
      }
    }).catch(err => {
      console.error('Failed to load JsBarcode library:', err);
    });
  } catch (error) {
    console.error('Error during dynamic import of barcode or QR code libraries:', error);
  }
}

interface QrAndBarcodeCache {
  qrDataUrls: { [key: string]: string };
  qrImages: { [key: string]: HTMLImageElement };
  barcodeDataUrls: { [key: string]: string };
  barcodeImages: { [key: string]: HTMLImageElement };
}

/**
 * Custom hook for managing QR codes and barcodes with optimized performance
 */
export const useQrAndBarcodeUtils = () => {
  const [qrDataUrls, setQrDataUrls] = useState<{[key: string]: string}>({});
  const [qrImages, setQrImages] = useState<{[key: string]: HTMLImageElement}>({});
  const [barcodeDataUrls, setBarcodeDataUrls] = useState<{[key: string]: string}>({});
  const [barcodeImages, setBarcodeImages] = useState<{[key: string]: HTMLImageElement}>({});
  
  // Using refs to track pending operations
  const pendingQrUpdates = useRef(new Set<string>());
  const pendingBarcodeUpdates = useRef(new Set<string>());
  
  /**
   * Generate Data URL for QR Code
   */
  const generateQrDataUrl = useCallback(async (el: QrElement): Promise<string | null> => {
    if (!isClient || !el.value) return null;
    
    try {
      // Check if QRCode library is loaded
      if (!QRCode) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('QRCode library not loaded yet, loading now...');
        }
        try {
          const module = await import('qrcode');
          QRCode = module.default || module;
          if (process.env.NODE_ENV !== 'production') {
            console.log('QRCode library loaded successfully in generateQrDataUrl');
          }
        } catch (err) {
          console.error('Failed to load QRCode library in generateQrDataUrl:', err);
          return null;
        }
      }
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Generating QR code for ${el.id} with value: ${el.value.substring(0, 30)}...`);
      }
      
      // Generate QR Code with qrcode library
      const dataUrl = await QRCode.toDataURL(el.value, {
        margin: 0,
        width: el.width,
        color: {
          dark: el.fill || '#000000',
          light: '#FFFFFF'
        }
      });
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`QR code generated successfully for ${el.id}`);
      }
      return dataUrl;
    } catch (error) {
      console.error(`Error generating QR code for ${el.id}:`, error);
      return null;
    }
  }, []);

  /**
   * Generate Data URL for Barcode
   */
  const generateBarcodeDataUrl = useCallback(async (el: BarcodeElement): Promise<string | null> => {
    if (!isClient || !el.value) return null;
    
    try {
      // Check if JsBarcode library is loaded
      if (!JsBarcode) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('JsBarcode library not loaded yet, loading now...');
        }
        try {
          const module = await import('jsbarcode');
          JsBarcode = module.default || module;
          if (process.env.NODE_ENV !== 'production') {
            console.log('JsBarcode library loaded successfully in generateBarcodeDataUrl');
          }
        } catch (err) {
          console.error('Failed to load JsBarcode library in generateBarcodeDataUrl:', err);
          return null;
        }
      }
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Generating barcode for ${el.id} with value: ${el.value}`);
      }
      
      // Create Canvas for Barcode
      const canvas = document.createElement('canvas');
      
      // Set appropriate canvas size
      canvas.width = el.width;
      
      // Height should be enough for barcode and text
      const minHeight = 90; // Appropriate minimum height
      canvas.height = Math.max(el.height, minHeight);
      
      try {
        // Apply barcode to canvas
        JsBarcode(canvas, el.value, {
          format: el.format || 'CODE128',
          width: 2,
          height: Math.max(el.height - 20, 40), // Reserve space for text
          displayValue: el.displayValue !== false,
          font: el.fontFamily || 'monospace',
          textAlign: el.textAlign || 'center',
          textPosition: el.textPosition || 'bottom',
          textMargin: el.textMargin || 2,
          fontSize: el.fontSize || 14,
          background: el.background || '#FFFFFF',
          lineColor: el.lineColor || el.fill || '#000000',
          margin: el.margin || 5
        });
        
        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/png');
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Barcode generated successfully for ${el.id}`);
        }
        return dataUrl;
      } catch (error) {
        console.error(`Error rendering barcode for ${el.id}:`, error);
        
        // Draw error message on canvas instead
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#FF0000';
          ctx.font = '12px Arial';
          ctx.fillText('Invalid barcode', 10, 20);
          ctx.fillText(`Format: ${el.format}, Value: ${el.value}`, 10, 40);
          return canvas.toDataURL('image/png');
        }
        return null;
      }
    } catch (error) {
      console.error(`Error generating barcode for ${el.id}:`, error);
      return null;
    }
  }, []);

  /**
   * Update QR code for a single element
   */
  const updateQrDataUrl = useCallback(async (element: QrElement) => {
    // Skip if no value or if already being processed
    if (!element.value || pendingQrUpdates.current.has(element.id)) {
      return;
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Generating QR code data URL for element ${element.id}`);
    }
    
    // Mark as being processed
    pendingQrUpdates.current.add(element.id);
    
    try {
      const dataUrl = await generateQrDataUrl(element);
      
      // Check if the new dataUrl is different from existing one
      if (dataUrl !== qrDataUrls[element.id]) {
        // Update state with new data URL
        setQrDataUrls(prev => ({
          ...prev,
          [element.id]: dataUrl,
        }));

        // Create and cache image element
        if (dataUrl) {
          const imgElement = new Image();
          imgElement.src = dataUrl;
          imgElement.onload = () => {
            setQrImages(prev => ({
              ...prev,
              [element.id]: imgElement,
            }));
          };
        }
      }
    } catch (error) {
      console.error(`Error generating QR code for element ${element.id}:`, error);
    } finally {
      // Remove from pending set when done
      pendingQrUpdates.current.delete(element.id);
    }
  }, [qrDataUrls, generateQrDataUrl]);

  /**
   * Update Barcode for a single element
   */
  const updateBarcodeDataUrl = useCallback(async (element: BarcodeElement) => {
    // Skip if no value or if already being processed
    if (!element.value || pendingBarcodeUpdates.current.has(element.id)) {
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`Generating barcode data URL for element ${element.id}`);
    }
    
    // Mark as being processed
    pendingBarcodeUpdates.current.add(element.id);
    
    try {
      const dataUrl = await generateBarcodeDataUrl(element);
      
      // Check if the new dataUrl is different from existing one
      if (dataUrl !== barcodeDataUrls[element.id]) {
        // Update state with new data URL
        setBarcodeDataUrls(prev => ({
          ...prev,
          [element.id]: dataUrl,
        }));

        // Create and cache image element
        if (dataUrl) {
          const imgElement = new Image();
          imgElement.src = dataUrl;
          imgElement.onload = () => {
            setBarcodeImages(prev => ({
              ...prev,
              [element.id]: imgElement,
            }));
          };
        }
      }
    } catch (error) {
      console.error(`Error generating barcode for element ${element.id}:`, error);
    } finally {
      // Remove from pending set when done
      pendingBarcodeUpdates.current.delete(element.id);
    }
  }, [barcodeDataUrls, generateBarcodeDataUrl]);

  /**
   * Debounced version of updateQrDataUrl to prevent excessive updates
   */
  const debouncedUpdateQrDataUrl = useCallback(
    debounce((element: QrElement) => {
      updateQrDataUrl(element);
    }, 300),
    [updateQrDataUrl]
  );

  /**
   * Debounced version of updateBarcodeDataUrl to prevent excessive updates
   */
  const debouncedUpdateBarcodeDataUrl = useCallback(
    debounce((element: BarcodeElement) => {
      updateBarcodeDataUrl(element);
    }, 300),
    [updateBarcodeDataUrl]
  );

  /**
   * Update all QR codes
   */
  const updateAllQrCodes = useCallback((elements: QrElement[]) => {
    if (!elements || elements.length === 0) {
      return;
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Updating ${elements.length} QR elements`);
    }
    
    // Filter elements that need updating - only those not being processed
    const elementsToUpdate = elements.filter(el => 
      !pendingQrUpdates.current.has(el.id) && el.value
    );
    
    if (elementsToUpdate.length === 0) {
      return;
    }
    
    // Process in batches to avoid freezing the UI
    elementsToUpdate.forEach((el, index) => {
      setTimeout(() => {
        updateQrDataUrl(el);
      }, index * 50); // Stagger updates by 50ms each
    });
  }, [updateQrDataUrl]);

  /**
   * Update all barcodes
   */
  const updateAllBarcodes = useCallback((elements: BarcodeElement[]) => {
    if (!elements || elements.length === 0) {
      return;
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Updating ${elements.length} barcode elements`);
    }
    
    // Filter elements that need updating - only those not being processed
    const elementsToUpdate = elements.filter(el => 
      !pendingBarcodeUpdates.current.has(el.id) && el.value
    );
    
    if (elementsToUpdate.length === 0) {
      return;
    }
    
    // Process in batches to avoid freezing the UI
    elementsToUpdate.forEach((el, index) => {
      setTimeout(() => {
        updateBarcodeDataUrl(el);
      }, index * 50); // Stagger updates by 50ms each
    });
  }, [updateBarcodeDataUrl]);

  /**
   * Clear cache to force regeneration of all QR codes and barcodes
   */
  const clearCache = useCallback(() => {
    if (process.env.NODE_ENV !== 'production') {
      const qrCount = Object.keys(qrDataUrls).length;
      const barcodeCount = Object.keys(barcodeDataUrls).length;
      console.log(`Clearing QR and barcode cache: ${qrCount} QR codes, ${barcodeCount} barcodes`);
    }
    
    // Clear all caches
    setQrDataUrls({});
    setQrImages({});
    setBarcodeDataUrls({});
    setBarcodeImages({});
    
    // Clear pending operations
    pendingQrUpdates.current.clear();
    pendingBarcodeUpdates.current.clear();
  }, [qrDataUrls, barcodeDataUrls]);

  return {
    qrDataUrls,
    qrImages,
    barcodeDataUrls,
    barcodeImages,
    updateQrDataUrl,
    updateBarcodeDataUrl,
    debouncedUpdateQrDataUrl,
    debouncedUpdateBarcodeDataUrl,
    updateAllQrCodes,
    updateAllBarcodes,
    clearCache
  };
}; 