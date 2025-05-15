import { useState, useRef, useCallback, useEffect, RefObject } from 'react';
import { ElementType, CanvasSize } from '../../models/TemplateDesignerTypes';

/**
 * Custom hook สำหรับจัดการการแสดงผลบน Canvas และ Transformer
 */
export const useCanvasRenderer = () => {
  // เก็บ References
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const selectionRef = useRef<{x: number, y: number, width: number, height: number}>({
    x: 0, y: 0, width: 0, height: 0
  });
  
  // เก็บ State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 400, height: 400 });
  const [zoom, setZoom] = useState<number>(1);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [elementBeingCreated, setElementBeingCreated] = useState<string | null>(null);
  const [selectionVisible, setSelectionVisible] = useState<boolean>(false);
  const [dragSelection, setDragSelection] = useState<{}>({});

  /**
   * เพิ่มค่า zoom
   */
  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.1, 2.5));
  }, []);

  /**
   * ลดค่า zoom
   */
  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.1, 0.3));
  }, []);

  /**
   * reset zoom กลับไปค่าเริ่มต้น
   */
  const resetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  /**
   * เปลี่ยนขนาด Canvas
   */
  const resizeCanvas = useCallback((newSize: CanvasSize) => {
    setCanvasSize(newSize);
  }, []);

  /**
   * อัพเดต Transformer ตาม element ที่เลือก
   */
  const updateTransformer = useCallback(() => {
    if (!trRef.current || !selectedId) return;
    
    // ค้นหา node ของ element ที่เลือก
    const selectedNode = stageRef.current?.findOne(`#${selectedId}`);
    if (selectedNode) {
      // ตั้งค่า nodes ของ Transformer
      trRef.current.nodes([selectedNode]);
      trRef.current.getLayer().batchDraw();
    }
  }, [selectedId]);

  /**
   * เลือก element
   */
  const selectElement = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      setSelectedIds([id]);
    } else {
      setSelectedIds([]);
    }
  }, []);

  /**
   * เลือก elements หลายรายการ
   */
  const selectElements = useCallback((ids: string[]) => {
    if (ids.length === 1) {
      setSelectedId(ids[0]);
    } else if (ids.length > 1) {
      setSelectedId(null);
    } else {
      setSelectedId(null);
    }
    setSelectedIds(ids);
  }, []);

  /**
   * เริ่มการสร้าง element ใหม่
   */
  const startCreatingElement = useCallback((type: string) => {
    setElementBeingCreated(type);
  }, []);

  /**
   * ยกเลิกการสร้าง element
   */
  const cancelCreatingElement = useCallback(() => {
    setElementBeingCreated(null);
  }, []);

  /**
   * อัพเดต Transformer เมื่อ selectedId เปลี่ยน
   */
  useEffect(() => {
    updateTransformer();
  }, [selectedId, updateTransformer]);

  return {
    stageRef,
    trRef,
    selectionRef,
    selectedId,
    selectedIds,
    canvasSize,
    zoom,
    dragStart,
    elementBeingCreated,
    selectionVisible,
    dragSelection,
    zoomIn,
    zoomOut,
    resetZoom,
    resizeCanvas,
    selectElement,
    selectElements,
    startCreatingElement,
    cancelCreatingElement,
    setDragStart,
    setSelectionVisible,
    setDragSelection
  };
}; 