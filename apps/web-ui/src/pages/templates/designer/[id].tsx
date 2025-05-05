import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { Spin, message } from 'antd';
import RequireAuth from '@/components/RequireAuth';

// โหลด TemplateDesigner เฉพาะฝั่ง client ด้วย dynamic import
const TemplateDesigner = dynamic(
  () => import('../../../components/TemplateDesigner'),
  { ssr: false } // ต้องตั้งค่า ssr: false เพื่อให้แน่ใจว่าไม่พยายามทำงานฝั่ง server
);

export default function EditTemplate() {
  const router = useRouter();
  const { id } = router.query;
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // ตรวจสอบว่าเป็นการรันที่ฝั่ง client
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (router.isReady) {
      setIsReady(true);
    }
  }, [router.isReady]);

  const fetchTemplate = async (templateId: string) => {
    if (!templateId) {
      console.error('ไม่พบ Template ID');
      message.error('ไม่พบ Template ID');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('กรุณาเข้าสู่ระบบก่อน');
      }

      console.log(`Fetching template with ID: ${templateId}`);
      const res = await fetch(`http://localhost:5051/api/templates/${templateId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      console.log('Template data:', data);
      setTemplate(data);
    } catch (err: any) {
      console.error('Error fetching template:', err);
      message.error(`ไม่สามารถดึงข้อมูล template ได้: ${err.message}`);
      router.push('/templates/management');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isReady && id && isClient) {
      fetchTemplate(id as string);
    }
  }, [isReady, id, isClient]);

  if (!isReady || loading || !isClient) {
    return (
      <RequireAuth>
        <div className="flex justify-center items-center min-h-screen">
          <Spin size="large" tip="กำลังโหลดข้อมูล..." />
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div>
        {template ? (
          <TemplateDesigner 
            templateId={id as string} 
            initialTemplate={template}
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