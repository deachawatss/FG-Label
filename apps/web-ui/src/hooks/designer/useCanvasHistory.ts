import { useState, useCallback, useEffect } from 'react';
import { ElementType } from '../../models/TemplateDesignerTypes';

/**
 * Custom hook สำหรับจัดการประวัติการแก้ไข (history) และ undo/redo
 */
export const useCanvasHistory = (initialElements: ElementType[] = []) => {
  const [elements, setElements] = useState<ElementType[]>(initialElements);
  const [history, setHistory] = useState<ElementType[][]>([initialElements]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [future, setFuture] = useState<ElementType[][]>([]);

  // เมื่อ initialElements เปลี่ยน และเป็นการโหลดครั้งแรก ให้ reset history
  useEffect(() => {
    if (initialElements.length > 0 && history.length === 1 && history[0].length === 0) {
      setElements(initialElements);
      setHistory([initialElements]);
      setHistoryIndex(0);
      setFuture([]);
    }
  }, [initialElements, history]);

  /**
   * อัพเดต elements และบันทึกประวัติการแก้ไข
   */
  const updateElements = useCallback((newElements: ElementType[]) => {
    setElements(newElements);
    
    // บันทึกการเปลี่ยนแปลงลงใน history ถ้ามีการเปลี่ยนแปลงจริง
    const lastElements = history[historyIndex];
    if (JSON.stringify(lastElements) !== JSON.stringify(newElements)) {
      // ตัด history หลังจาก index ปัจจุบัน
      const newHistory = history.slice(0, historyIndex + 1);
      setHistory([...newHistory, newElements]);
      setHistoryIndex(newHistory.length);
      setFuture([]); // ล้าง future history เมื่อมีการแก้ไขใหม่
    }
  }, [history, historyIndex]);

  /**
   * ย้อนกลับไปยังการแก้ไขก่อนหน้า (Undo)
   */
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setElements(history[newIndex]);
      setHistoryIndex(newIndex);
      setFuture([history[historyIndex], ...future]);
    }
  }, [history, historyIndex, future]);

  /**
   * ทำซ้ำการแก้ไขที่เพิ่งย้อนกลับ (Redo)
   */
  const redo = useCallback(() => {
    if (future.length > 0) {
      const [nextState, ...remainingFuture] = future;
      setElements(nextState);
      setHistory([...history.slice(0, historyIndex + 1), nextState]);
      setHistoryIndex(historyIndex + 1);
      setFuture(remainingFuture);
    }
  }, [history, historyIndex, future]);

  /**
   * ลบ element ที่เลือก
   */
  const deleteElement = useCallback((elementId: string) => {
    const newElements = elements.filter(el => el.id !== elementId);
    updateElements(newElements);
  }, [elements, updateElements]);

  /**
   * ลบ elements หลายรายการ
   */
  const deleteElements = useCallback((elementIds: string[]) => {
    const newElements = elements.filter(el => !elementIds.includes(el.id));
    updateElements(newElements);
  }, [elements, updateElements]);

  /**
   * อัพเดตคุณสมบัติของ element
   */
  const updateElementProperty = useCallback((elementId: string, property: string, value: any) => {
    const newElements = elements.map(el => {
      if (el.id === elementId) {
        return { ...el, [property]: value };
      }
      return el;
    });
    updateElements(newElements);
  }, [elements, updateElements]);

  /**
   * เพิ่ม element ใหม่
   */
  const addElement = useCallback((element: ElementType) => {
    updateElements([...elements, element]);
  }, [elements, updateElements]);

  /**
   * อัพเดต element ตาม ID
   */
  const updateElement = useCallback((updatedElement: ElementType) => {
    const newElements = elements.map(el => {
      if (el.id === updatedElement.id) {
        return updatedElement;
      }
      return el;
    });
    updateElements(newElements);
  }, [elements, updateElements]);

  /**
   * เพิ่ม elements หลายรายการ
   */
  const addElements = useCallback((newElements: ElementType[]) => {
    updateElements([...elements, ...newElements]);
  }, [elements, updateElements]);

  /**
   * อัพเดต elements ทั้งหมด (แทนที่)
   */
  const replaceAllElements = useCallback((newElements: ElementType[]) => {
    updateElements(newElements);
  }, [updateElements]);

  /**
   * คัดลอก element
   */
  const duplicateElement = useCallback((elementId: string, offsetX: number = 10, offsetY: number = 10) => {
    const elementToDuplicate = elements.find(el => el.id === elementId);
    if (elementToDuplicate) {
      const newElement = {
        ...elementToDuplicate,
        id: `${elementToDuplicate.id}-copy-${Date.now()}`,
        x: elementToDuplicate.x + offsetX,
        y: elementToDuplicate.y + offsetY
      };
      updateElements([...elements, newElement]);
    }
  }, [elements, updateElements]);

  return {
    elements,
    setElements: updateElements,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: future.length > 0,
    deleteElement,
    deleteElements,
    updateElementProperty,
    addElement,
    updateElement,
    addElements,
    replaceAllElements,
    duplicateElement
  };
}; 