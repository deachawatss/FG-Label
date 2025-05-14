import axios from "axios";

// ใช้ API URL ตามที่กำหนดใน environment โดยไม่ต้องเพิ่ม '/api' อีก
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5051/api',
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor แนบ token ทุก request
api.interceptors.request.use((config) => {
  // ตรวจสอบว่าเรากำลังใช้งานใน browser หรือไม่ก่อนเรียก localStorage
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      // ใช้วิธีการกำหนด header แบบปลอดภัยกับ TypeScript
      if (config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  }
  return config;
}, (error) => Promise.reject(error));

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // ตรวจสอบว่าเรากำลังใช้งานใน browser หรือไม่ก่อนเรียก localStorage
    if (typeof window !== 'undefined') {
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api; 