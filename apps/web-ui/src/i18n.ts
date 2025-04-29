import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      login: {
        title: 'FG Label Login',
        username: 'Username',
        password: 'Password',
        submit: 'Sign In',
        loading: 'Signing in...',
        error: 'Invalid username or password'
      },
      batchSearch: {
        title: 'Batch Search',
        search: 'Search batches...',
        refresh: 'Refresh',
        columns: {
          batchNo: 'Batch No',
          product: 'Product',
          customer: 'Customer',
          createdAt: 'Created At',
          action: 'Action'
        },
        print: {
          title: 'Confirm Print',
          message: 'Do you want to print Batch No: {{batchNo}}?',
          success: 'Print job created successfully',
          error: 'Failed to create print job'
        },
        pagination: {
          total: 'Total {{total}} items'
        }
      },
      common: {
        loading: 'Loading...',
        error: 'An error occurred',
        confirm: 'Confirm',
        cancel: 'Cancel'
      }
    }
  },
  th: {
    translation: {
      login: {
        title: 'เข้าสู่ระบบ FG Label',
        username: 'ชื่อผู้ใช้',
        password: 'รหัสผ่าน',
        submit: 'เข้าสู่ระบบ',
        loading: 'กำลังเข้าสู่ระบบ...',
        error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
      },
      batchSearch: {
        title: 'ค้นหา Batch',
        search: 'ค้นหา batch...',
        refresh: 'รีเฟรช',
        columns: {
          batchNo: 'เลขที่ Batch',
          product: 'สินค้า',
          customer: 'ลูกค้า',
          createdAt: 'วันที่สร้าง',
          action: 'ดำเนินการ'
        },
        print: {
          title: 'ยืนยันการพิมพ์',
          message: 'คุณต้องการพิมพ์ Batch No: {{batchNo}} ใช่หรือไม่?',
          success: 'สร้างงานพิมพ์สำเร็จ',
          error: 'ไม่สามารถสร้างงานพิมพ์ได้'
        },
        pagination: {
          total: 'ทั้งหมด {{total}} รายการ'
        }
      },
      common: {
        loading: 'กำลังโหลด...',
        error: 'เกิดข้อผิดพลาด',
        confirm: 'ยืนยัน',
        cancel: 'ยกเลิก'
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'th',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n; 