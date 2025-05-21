/**
 * Utility functions for handling files and URL objects in Template Designer
 */

// Singleton for file input element to prevent multiple instances
let fileInputSingleton: HTMLInputElement | null = null;

// เก็บรายการ Blob URL ที่สร้างไว้เพื่อล้างทิ้งเมื่อไม่ได้ใช้งาน
const createdBlobUrls: string[] = [];

/**
 * Get a singleton file input element to reuse across the application
 * @param accept File type MIME or extension to accept (e.g. 'image/*')
 * @param onChange Callback when file is selected
 * @returns The file input element
 */
export const getFileInput = (
  accept: string = 'image/*',
  onChange?: (e: Event) => void
): HTMLInputElement => {
  if (!fileInputSingleton) {
    fileInputSingleton = document.createElement('input');
    fileInputSingleton.type = 'file';
    fileInputSingleton.style.display = 'none';
    document.body.appendChild(fileInputSingleton);
  }
  
  // Update accept attribute
  fileInputSingleton.accept = accept;
  
  // Remove existing listeners to prevent memory leaks
  const newInput = fileInputSingleton.cloneNode(true) as HTMLInputElement;
  document.body.replaceChild(newInput, fileInputSingleton);
  fileInputSingleton = newInput;
  
  // Add new listener if provided
  if (onChange) {
    fileInputSingleton.addEventListener('change', onChange, { once: true });
  }
  
  return fileInputSingleton;
};

/**
 * Load an image and return dimensions and object URL
 * @param file The image file to load
 * @param maxWidth Maximum width constraint (optional)
 * @param maxHeight Maximum height constraint (optional)
 * @returns Promise with image details: width, height, url
 */
export const loadImageFile = async (
  file: File, 
  maxWidth?: number, 
  maxHeight?: number
): Promise<{ width: number; height: number; url: string }> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    // เก็บ URL ที่สร้างไว้ในรายการเพื่อล้างทิ้งภายหลัง
    createdBlobUrls.push(url);
    
    const image = new Image();
    
    // Set timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      // ลบออกจากรายการ
      const index = createdBlobUrls.indexOf(url);
      if (index !== -1) {
        createdBlobUrls.splice(index, 1);
      }
      reject(new Error('Image loading timeout'));
    }, 10000); // 10 second timeout
    
    image.onload = () => {
      clearTimeout(timeout);
      
      let width = image.width;
      let height = image.height;
      
      // Apply size constraints if provided
      if (maxWidth && width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = Math.round(height * ratio);
      }
      
      if (maxHeight && height > maxHeight) {
        const ratio = maxHeight / height;
        height = maxHeight;
        width = Math.round(width * ratio);
      }
      
      resolve({ width, height, url });
    };
    
    image.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      // ลบออกจากรายการ
      const index = createdBlobUrls.indexOf(url);
      if (index !== -1) {
        createdBlobUrls.splice(index, 1);
      }
      reject(new Error('Error loading image'));
    };
    
    image.src = url;
  });
};

/**
 * Clean up any file resources created during the session
 * to prevent memory leaks
 */
export const cleanupFileResources = () => {
  // Cleanup file input
  if (fileInputSingleton) {
    try {
      if (fileInputSingleton.parentNode) {
        fileInputSingleton.parentNode.removeChild(fileInputSingleton);
      }
    } catch (e) {
      console.warn('Error cleaning up file input:', e);
    }
    fileInputSingleton = null;
  }
  
  // รีวอค (revoke) ทุก Blob URL ที่ได้สร้างไว้
  if (createdBlobUrls.length > 0) {
    createdBlobUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.warn('Error revoking URL:', e);
      }
    });
    
    // ล้างรายการ URL ทั้งหมด
    createdBlobUrls.length = 0;
  }
};

/**
 * Convert file size to human readable format
 * @param bytes Size in bytes
 * @returns Formatted string (e.g. "1.5 MB")
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * Check if a file is an image based on its MIME type
 * @param file The file to check
 * @returns true if file is an image
 */
export const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/');
};

/**
 * Generate a download for exported templates
 * @param jsonData The JSON data to export
 * @param filename The filename to use
 */
export const downloadJsonTemplate = (jsonData: string, filename: string): void => {
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}; 