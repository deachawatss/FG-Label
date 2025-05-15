import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { Spin, message } from 'antd';
import RequireAuth from '@/components/RequireAuth';
import { getApiBaseUrl } from '../../../utils/template/helpers';

// โหลด TemplateDesigner เฉพาะฝั่ง client ด้วย dynamic import
const TemplateDesigner = dynamic(
  () => import('../../../components/TemplateDesigner/index'),
  { ssr: false } // ต้องตั้งค่า ssr: false เพื่อให้แน่ใจว่าไม่พยายามทำงานฝั่ง server
);

export default function EditTemplate() {
  const router = useRouter();
  const { id } = router.query;
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [templateData, setTemplateData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [localStorageTemplate, setLocalStorageTemplate] = useState<any>(null);

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
            
            setLocalStorageTemplate(templateData);
          } else {
            console.warn('No template data found in localStorage with key: batchSearchTemplate');
          }
        } catch (error) {
          console.error('Error loading template from localStorage:', error);
        }
      }
    }
  }, [isReady, isClient, router.query]);

  const fetchTemplate = async (templateId: string) => {
    if (!templateId) {
      setError('ไม่พบ Template ID');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('กรุณาเข้าสู่ระบบก่อน');
      }

      console.log(`Fetching template with ID: ${templateId}`);
      const res = await fetch(`${getApiBaseUrl()}/templates/${templateId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      console.log('Template data:', data);

      // ถ้ามีข้อมูลจาก localStorage ให้ใช้ elements จาก localStorage แทน
      if (localStorageTemplate && localStorageTemplate.elements) {
        console.log('Using elements from localStorage instead of API data');
        
        // สร้าง template data ใหม่โดยใช้ข้อมูลพื้นฐานจาก API แต่ใช้ elements จาก localStorage
        const mergedData = {
          ...data,
          content: JSON.stringify({
            elements: localStorageTemplate.elements,
            canvasSize: localStorageTemplate.canvasSize || data.canvasSize || { width: 400, height: 400 }
          })
        };
        
        setTemplateData(mergedData);
      } else {
        setTemplateData(data);
      }
      
      setError(null);
    } catch (err: any) {
      console.error('Error fetching template:', err);
      setError(`ไม่สามารถดึงข้อมูล template ได้: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isReady && id && isClient) {
      fetchTemplate(id as string);
    }
  }, [isReady, id, isClient, localStorageTemplate]); // เพิ่ม localStorageTemplate เป็น dependency เพื่อรัน fetchTemplate อีกครั้งเมื่อมีการโหลด template จาก localStorage

  if (!isReady || !isClient) {
    return (
      <RequireAuth>
        <div className="flex justify-center items-center min-h-screen">
          <div style={{ textAlign: 'center' }}>
            <Spin size="large" tip="กำลังเตรียมข้อมูล..." />
          </div>
        </div>
      </RequireAuth>
    );
  }

  // แสดงสถานะการโหลด
  if (loading) {
    return (
      <RequireAuth>
        <div className="flex justify-center items-center min-h-screen">
          <div style={{ textAlign: 'center' }}>
            <Spin size="large" tip="กำลังโหลดข้อมูล template..." />
          </div>
        </div>
      </RequireAuth>
    );
  }

  // กรณีเกิด error
  if (error) {
    return (
      <RequireAuth>
        <div className="flex justify-center items-center min-h-screen">
          <div style={{ textAlign: 'center', color: 'red' }}>
            <p>{error}</p>
            <button 
              onClick={() => router.push('/templates/management')}
              style={{ marginTop: '16px', padding: '8px 16px', background: '#1890ff', color: 'white', border: 'none', borderRadius: '4px' }}
            >
              กลับไปยังหน้าจัดการ Template
            </button>
          </div>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div>
        {templateData ? (
          <TemplateDesigner 
            templateId={id as string} 
            initialTemplate={templateData}
          />
        ) : (
          <div className="flex justify-center items-center min-h-screen">
            <p className="text-red-500">ไม่พบข้อมูล template หรือเกิดข้อผิดพลาดในการโหลดข้อมูล</p>
          </div>
        )}
      </div>
    </RequireAuth>
  );
} 