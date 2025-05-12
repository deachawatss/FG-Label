/**
 * ฟังก์ชันบีบอัดรูปภาพแบบ Data URL
 * @param dataUrl Data URL ของรูปภาพที่ต้องการบีบอัด
 * @param quality คุณภาพของรูปภาพหลังบีบอัด (0-1, default: 0.7)
 * @returns Data URL ของรูปภาพที่ถูกบีบอัดแล้ว
 */
export const compressImageDataUrl = async (dataUrl: string, quality = 0.7): Promise<string> => {
  if (!dataUrl || !dataUrl.startsWith('data:image')) {
    return dataUrl;
  }
  
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      
      // Calculate new size (reduced by 30%)
      let { width, height } = img;
      let scale = quality * 1.0;
      
      width = Math.floor(width * scale);
      height = Math.floor(height * scale);
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      
      // Draw image on canvas with reduced size
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert canvas back to data URL
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      
      console.log(`Reduced image size from ${dataUrl.length} to ${compressedDataUrl.length} bytes`);
      resolve(compressedDataUrl);
    };
    
    img.onerror = () => {
      // If loading fails, return original value
      resolve(dataUrl);
    };
    
    img.src = dataUrl;
  });
}; 