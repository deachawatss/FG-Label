import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function TemplatesRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    // นำทางไปยังหน้า management โดยอัตโนมัติ
    router.replace('/templates/management');
  }, [router]);
  
  // คืนค่า null เพื่อไม่ต้องแสดง UI ใดๆ ในระหว่างการรีไดเร็ค
  return null;
} 