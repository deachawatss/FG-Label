/**
 * ฟังก์ชันตัดข้อความให้สั้นลงตามความยาวที่กำหนด
 * @param s ข้อความที่ต้องการตัด
 * @param max ความยาวสูงสุดที่ต้องการ (default: 100)
 * @returns ข้อความที่ถูกตัดแล้ว หรือ null ถ้าข้อความเป็น null/undefined/empty
 */
export const truncateString = (s?: string|null, max = 100) =>
  !s || !s.trim() ? null : (s.length > max ? s.slice(0, max) : s); 