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
          <Spin size="large" tip="กำลังเตรียมข้อมูล..." />
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