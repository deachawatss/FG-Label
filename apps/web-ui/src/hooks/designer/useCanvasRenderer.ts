import { useState, useRef, useCallback, useEffect, RefObject } from 'react';
import { ElementType, CanvasSize, CANVAS_INIT, ZOOM_STEP, MIN_ZOOM, MAX_ZOOM } from '../../models/TemplateDesignerTypes';
import { FEATURES } from '../../utils/template/constants';

/**
 * Custom hook สำหรับจัดการการแสดงผลบน Canvas และ Transformer
 */
export const useCanvasRenderer = () => {
  // เก็บ References
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const selectionRef = useRef<any>(null);
  
  // เก็บ State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({
    width: FEATURES.CANVAS.INIT_WIDTH || 400,
    height: FEATURES.CANVAS.INIT_HEIGHT || 400
  });
  const [zoom, setZoom] = useState<number>(1);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [elementBeingCreated, setElementBeingCreated] = useState<boolean>(false);
  const [selectionVisible, setSelectionVisible] = useState<boolean>(false);
  const [dragSelection, setDragSelection] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  /**
   * เพิ่มค่า zoom
   */
  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.1, FEATURES.ZOOM.MAX));
  }, []);

  /**
   * ลดค่า zoom
   */
  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.1, FEATURES.ZOOM.MIN));
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
  const resizeCanvas = useCallback((size: { width: number; height: number }) => {
    setCanvasSize(size);
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
  const selectElement = useCallback((id: string | null, isMultiSelect: boolean = false) => {
    if (isMultiSelect) {
      // กรณีการเลือกหลาย element (กดปุ่ม Ctrl/Command)
      if (id) {
        setSelectedIds(prevIds => {
          // ถ้า ID นี้ถูกเลือกอยู่แล้ว ให้ยกเลิกการเลือก
          if (prevIds.includes(id)) {
            return prevIds.filter(prevId => prevId !== id);
          }
          // ถ้ายังไม่ได้เลือก ให้เพิ่มเข้าไปในรายการ
          return [...prevIds, id];
        });
        
        // ไม่ต้องเซ็ต selectedId เพราะกำลังเลือกหลาย element
        setSelectedId(null);
      }
    } else {
      // กรณีเลือก element เดียว (คลิกปกติ)
      setSelectedId(id);
      setSelectedIds(id ? [id] : []);
    }
  }, []);

  /**
   * เลือก elements หลายรายการ
   */
  const selectElements = useCallback((ids: string[]) => {
    if (ids.length === 0) {
      setSelectedId(null);
      setSelectedIds([]);
    } else if (ids.length === 1) {
      setSelectedId(ids[0]);
      setSelectedIds(ids);
    } else {
      setSelectedId(null);
      setSelectedIds(ids);
    }
  }, []);

  /**
   * เริ่มการสร้าง element ใหม่
   */
  const startCreatingElement = useCallback(() => {
    setElementBeingCreated(true);
  }, []);

  /**
   * ยกเลิกการสร้าง element
   */
  const cancelCreatingElement = useCallback(() => {
    setElementBeingCreated(false);
  }, []);

  /**
   * อัพเดต Transformer เมื่อ selectedId เปลี่ยน
   */
  useEffect(() => {
    updateTransformer();
  }, [selectedId, updateTransformer]);

  // ฟังก์ชันช่วยในการหา DOM element ที่ถูกต้องสำหรับ Transformer
  // แก้ไขปัญหา querySelector กับ ID ที่มีเครื่องหมายพิเศษ
  const findNode = useCallback((id: string) => {
    if (!stageRef.current) return null;
    
    try {
      return stageRef.current.findOne(`#${id}`);
    } catch (error) {
      console.error(`Error finding node with id ${id}:`, error);
      
      // ถ้าเกิด error เนื่องจาก ID มีอักขระพิเศษ ให้ลองค้นหาด้วยวิธีอื่น
      try {
        // ทดลองค้นหาทุก node และเทียบ ID
        const allGroups = stageRef.current.find('Group');
        return allGroups.find((node: any) => node.id() === id);
      } catch (secondError) {
        console.error('Error in fallback node search:', secondError);
        return null;
      }
    }
  }, [stageRef]);

  // อัพเดท Transformer ทุกครั้งที่มีการเปลี่ยนแปลง selectedId หรือ selectedIds
  useEffect(() => {
    if (!trRef.current || (!selectedId && selectedIds.length === 0)) {
      return;
    }
    
    try {
      // เตรียม nodes สำหรับ transformer - แบบปลอดภัยไม่ใช้ querySelector โดยตรง
      const nodes = selectedIds.length > 0 
        ? selectedIds.map(id => findNode(id)).filter(Boolean)
        : selectedId ? [findNode(selectedId)].filter(Boolean) : [];
      
      if (nodes.length > 0) {
        trRef.current.nodes(nodes);
        trRef.current.getLayer().batchDraw();
      } else {
        trRef.current.nodes([]);
        trRef.current.getLayer().batchDraw();
      }
    } catch (error) {
      console.error('Error updating transformer:', error);
    }
  }, [selectedId, selectedIds, findNode]);

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
    setDragSelection,
    findNode
  };
}; 