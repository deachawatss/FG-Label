import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { Spin } from 'antd';
import RequireAuth from '@/components/RequireAuth';

// โหลด TemplateDesigner เฉพาะฝั่ง client ด้วย dynamic import
const TemplateDesigner = dynamic(
  () => import('../../components/TemplateDesigner/index'),
  { ssr: false }
);

export default function DesignerPage() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [initialTemplate, setInitialTemplate] = useState<any>(null);
  
  // ตรวจสอบว่าเป็นการรันที่ฝั่ง client
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  useEffect(() => {
    if (router.isReady) {
      setIsReady(true);
    }
  }, [router.isReady]);
  
  // โหลดข้อมูล template จาก localStorage เมื่อ parameter initialTemplate=true
  useEffect(() => {
    if (isReady && isClient) {
      const { initialTemplate: shouldLoadFromLocalStorage } = router.query;
      
      if (shouldLoadFromLocalStorage === 'true') {
        console.log('Loading template from localStorage with key: batchSearchTemplate');
        
        try {
          const savedTemplate = localStorage.getItem('batchSearchTemplate');
          
          if (savedTemplate) {
            // แปลงข้อมูล JSON เป็น object
            const templateData = JSON.parse(savedTemplate);
            console.log('Template loaded from localStorage successfully:', templateData);
            
            // ตรวจสอบว่ามี elements หรือไม่
            if (templateData.elements && Array.isArray(templateData.elements)) {
              console.log(`Found ${templateData.elements.length} elements in localStorage template`);
              
              // ปรับแต่ง elements ก่อนใช้งาน
              templateData.elements = templateData.elements.map(el => {
                if (el.type === 'barcode') {
                  console.log(`Adjusting barcode element properties for consistent display, original height: ${el.height}`);
                  return {
                    ...el,
                    // กำหนดความสูงคงที่ 70px (50px สำหรับแท่ง barcode + 20px สำหรับข้อความด้านล่าง)
                    // การแสดงผลจริงจะแยกเป็น:
                    // - ส่วนแท่งบาร์โค้ด 50px (แสดงโดย Image จาก dataUrl ที่สร้างใน useQrAndBarcode)
                    // - ส่วนข้อความด้านล่าง 20px (แสดงโดย Text component แยกต่างหาก)
                    height: 70,
                    format: el.format || 'CODE128',
                    fontSize: 14, // ค่าคงที่สำหรับข้อความใต้บาร์โค้ด ตรงกับ batch-search.tsx
                    fontFamily: el.fontFamily || 'monospace',
                    textAlign: el.textAlign || 'center',
                    textPosition: el.textPosition || 'bottom',
                    textMargin: el.textMargin || 2,
                    margin: el.margin || 5,
                    displayValue: true
                  };
                }
                return el;
              });
            }
            
            setInitialTemplate(templateData);
          } else {
            console.warn('No template data found in localStorage with key: batchSearchTemplate');
          }
        } catch (error) {
          console.error('Error loading template from localStorage:', error);
        }
      }
    }
  }, [isReady, isClient, router.query]);
  
  if (!isReady || !isClient) {
    return (
      <RequireAuth>
        <div className="flex justify-center items-center min-h-screen">
          <Spin size="large" spinning={true}>
            <div style={{ padding: '50px', minHeight: '80px' }}>กำลังเตรียมข้อมูล...</div>
          </Spin>
        </div>
      </RequireAuth>
    );
  }
  
  return (
    <RequireAuth>
      <TemplateDesigner initialTemplate={initialTemplate} />
    </RequireAuth>
  );
} 