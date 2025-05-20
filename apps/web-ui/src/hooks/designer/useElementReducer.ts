import { useReducer, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ElementType, GroupElement, CanvasSize } from '../../models/TemplateDesignerTypes';

// Define types for actions in our reducer
export type ElementAction = 
  | { type: 'ADD_ELEMENT'; payload: ElementType }
  | { type: 'ADD_ELEMENTS'; payload: ElementType[] }
  | { type: 'UPDATE_ELEMENT'; payload: ElementType }
  | { type: 'UPDATE_PROPERTY'; payload: { id: string; property: string; value: any } }
  | { type: 'DELETE_ELEMENT'; payload: string }
  | { type: 'DELETE_ELEMENTS'; payload: string[] }
  | { type: 'DUPLICATE_ELEMENT'; payload: { id: string; offsetX?: number; offsetY?: number } }
  | { type: 'REPLACE_ALL'; payload: ElementType[] }
  | { type: 'CREATE_GROUP'; payload: { ids: string[] } }
  | { type: 'UNGROUP'; payload: string }
  | { type: 'MOVE_TO_TOP'; payload: string }
  | { type: 'MOVE_TO_BOTTOM'; payload: string }
  | { type: 'MOVE_UP'; payload: string }
  | { type: 'MOVE_DOWN'; payload: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'GROUP'; payload: { elementIds: string[]; groupConfig?: { name?: string } } };

// Define state interface
interface ElementState {
  elements: ElementType[];
  history: ElementType[][];
  historyIndex: number;
  future: ElementType[][];
}

const initialElementState: ElementState = {
  elements: [],
  history: [[]],
  historyIndex: 0,
  future: []
};

/**
 * Creates a deep copy of an array of elements to avoid reference issues
 */
const cloneElements = (elements: ElementType[]): ElementType[] => {
  return elements.map(el => ({ ...el }));
};

/**
 * Handles all element operations with history tracking for undo/redo
 * 
 * ระบบการจัดเรียงเลเยอร์:
 * - อิลิเมนต์ที่มีค่า layer สูงจะอยู่บนอิลิเมนต์ที่มีค่า layer ต่ำเสมอ
 * - การเพิ่มอิลิเมนต์ใหม่จะให้ค่า layer สูงกว่าค่ามากสุดในอาร์เรย์ปัจจุบัน
 * - ในอาร์เรย์ elements นั้น อิลิเมนต์ที่มีค่า layer สูงจะอยู่ต้นอาร์เรย์เสมอ
 * - ใน Canvas จะวาดอิลิเมนต์ที่มีค่า layer ต่ำก่อน เพื่อให้อิลิเมนต์ที่มีค่า layer สูงอยู่ทับด้านบน
 * - ในตาราง Layer Manager จะแสดงอิลิเมนต์ที่มีค่า layer สูงไว้ด้านบนของตาราง
 */
const elementReducer = (state: ElementState, action: ElementAction): ElementState => {
  switch (action.type) {
    case 'ADD_ELEMENT': {
      // หาค่า layer มากที่สุดในอาร์เรย์ปัจจุบัน และกำหนดให้องค์ประกอบใหม่มีค่ามากกว่า 1
      const maxLayer = state.elements.length > 0
        ? Math.max(...state.elements.map(el => el.layer || 0))
        : 0;
      
      // กำหนดค่า layer ให้กับองค์ประกอบใหม่
      const newElement = {
        ...action.payload,
        layer: maxLayer + 10 // เพิ่มค่า layer มากขึ้นโดยมีช่องว่าง เผื่อสำหรับการแทรกอิลิเมนต์ในอนาคต
      };
      
      // เพิ่มองค์ประกอบใหม่เข้าไปที่ต้นอาร์เรย์ - องค์ประกอบที่มีค่า layer สูงจะอยู่ต้นอาร์เรย์เสมอ
      const newElements = [newElement, ...state.elements];
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'ADD_ELEMENTS': {
      // หาค่า layer มากที่สุดในอาร์เรย์ปัจจุบัน
      const maxLayer = state.elements.length > 0
        ? Math.max(...state.elements.map(el => el.layer || 0))
        : 0;
      
      // กำหนดค่า layer ให้กับองค์ประกอบใหม่ทุกตัว โดยเริ่มจากค่าสูงขึ้นไป
      const newElementsWithLayer = action.payload.map((el, index) => ({
        ...el,
        layer: maxLayer + ((index + 1) * 10) // ใช้ช่วงห่าง 10 เพื่อเว้นพื้นที่สำหรับแทรกในอนาคต
      }));
      
      // เพิ่มองค์ประกอบใหม่เข้าไปที่ต้นอาร์เรย์ - องค์ประกอบใหม่จะอยู่บนองค์ประกอบเดิม
      const newElements = [...newElementsWithLayer, ...state.elements];
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'UPDATE_ELEMENT': {
      const newElements = state.elements.map(el => 
        el.id === action.payload.id ? action.payload : el
      );
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'UPDATE_PROPERTY': {
      const { id, property, value } = action.payload;
      const newElements = state.elements.map(el => {
        if (el.id === id) {
          return { ...el, [property]: value };
        }
        return el;
      });
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'DELETE_ELEMENT': {
      const newElements = state.elements.filter(el => el.id !== action.payload);
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'DELETE_ELEMENTS': {
      const ids = new Set(action.payload);
      const newElements = state.elements.filter(el => !ids.has(el.id));
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'DUPLICATE_ELEMENT': {
      const { id, offsetX = 10, offsetY = 10 } = action.payload;
      const elementToDuplicate = state.elements.find(el => el.id === id);
      
      if (!elementToDuplicate) {
        return state;
      }
      
      // หาค่า layer มากที่สุดในอาร์เรย์ปัจจุบัน
      const maxLayer = Math.max(...state.elements.map(el => el.layer || 0));
      
      const newElement = {
        ...elementToDuplicate,
        id: uuidv4(),
        x: elementToDuplicate.x + offsetX,
        y: elementToDuplicate.y + offsetY,
        layer: maxLayer + 10 // ให้สำเนาอยู่บนต้นฉบับ - เพิ่มช่องว่างเผื่อแทรกในอนาคต
      };
      
      // เพิ่มองค์ประกอบที่ถูกทำสำเนาไว้ที่ต้นอาร์เรย์ - จะได้อยู่บนสุดในแคนวาส
      const newElements = [newElement, ...state.elements];
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'REPLACE_ALL': {
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: action.payload,
        history: [...newHistory, cloneElements(action.payload)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'CREATE_GROUP': {
      const { ids } = action.payload;
      if (ids.length < 2) {
        return state;
      }
      
      // Get elements to group
      const elementsToGroup = state.elements.filter(el => ids.includes(el.id));
      if (elementsToGroup.length < 2) {
        return state;
      }
      
      // Calculate group bounds
      const minX = Math.min(...elementsToGroup.map(el => el.x));
      const minY = Math.min(...elementsToGroup.map(el => el.y));
      const maxX = Math.max(...elementsToGroup.map(el => el.x + el.width));
      const maxY = Math.max(...elementsToGroup.map(el => el.y + el.height));
      
      // หาค่า layer มากที่สุดในอาร์เรย์ปัจจุบัน
      const maxLayer = Math.max(...state.elements.map(el => el.layer || 0));
      
      // Create group
      const groupId = uuidv4();
      const groupElement: GroupElement = {
        id: groupId,
        type: 'group',
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        elements: elementsToGroup.map(el => ({
          ...el,
          x: el.x - minX,
          y: el.y - minY,
          // Preserve all properties
          rotation: el.rotation,
          visible: el.visible,
          draggable: el.draggable,
          locked: el.locked,
          borderColor: el.borderColor,
          borderWidth: el.borderWidth,
          borderStyle: el.borderStyle
        })),
        draggable: true,
        visible: true,
        layer: maxLayer + 10 // ให้กลุ่มอยู่บนสุด - เพิ่มช่องว่างเผื่อแทรกในอนาคต
      };
      
      // Replace original elements with group - เพิ่มกลุ่มไว้ที่ต้นอาร์เรย์ (บนสุดในแคนวาส)
      const elementsWithoutGroup = state.elements.filter(el => !ids.includes(el.id));
      const newElements = [groupElement, ...elementsWithoutGroup];
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'UNGROUP': {
      const groupId = action.payload;
      const groupElement = state.elements.find(el => el.id === groupId) as GroupElement;
      
      if (!groupElement || groupElement.type !== 'group' || !groupElement.elements || groupElement.elements.length === 0) {
        return state;
      }
      
      // หาค่า layer มากที่สุดในอาร์เรย์ปัจจุบัน
      const maxLayer = Math.max(...state.elements.map(el => el.layer || 0));
      
      // Transform elements to absolute coordinates
      const transformedElements = groupElement.elements.map((el, index) => ({
        ...el,
        id: uuidv4(), // New ID to prevent duplicates
        x: groupElement.x + el.x,
        y: groupElement.y + el.y,
        // Ensure all properties are preserved
        rotation: (el.rotation || 0) + (groupElement.rotation || 0), // Combine rotations
        visible: el.visible !== undefined ? el.visible : true,
        draggable: el.draggable !== undefined ? el.draggable : true,
        locked: el.locked || false,
        layer: maxLayer + 10 + index * 10 // ให้แต่ละองค์ประกอบอยู่บนสุดโดยมีช่องว่างระหว่างกัน
      }));
      
      // Remove group and add individual elements at the beginning of array
      const elementsWithoutGroup = state.elements.filter(el => el.id !== groupId);
      const newElements = [...transformedElements, ...elementsWithoutGroup];
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'MOVE_TO_TOP': {
      const elementId = action.payload;
      const elementToMove = state.elements.find(el => el.id === elementId);
      
      if (!elementToMove) {
        return state;
      }
      
      // หาค่า layer ที่มากที่สุดในอาร์เรย์ปัจจุบัน
      const maxLayer = Math.max(...state.elements.map(el => el.layer || 0));
      
      // อัพเดตเฉพาะค่า layer ของอิลิเมนต์ที่ต้องการย้าย
      const newElements = state.elements.map(el => {
        if (el.id === elementId) {
          return { ...el, layer: maxLayer + 1 };
        }
        return el;
      });
      
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'MOVE_TO_BOTTOM': {
      const elementId = action.payload;
      const elementToMove = state.elements.find(el => el.id === elementId);
      
      if (!elementToMove) {
        return state;
      }
      
      // หาค่า layer ที่น้อยที่สุดในอาร์เรย์ปัจจุบัน
      const minLayer = Math.min(...state.elements.map(el => el.layer || 0));
      
      // อัพเดตเฉพาะค่า layer ของอิลิเมนต์ที่ต้องการย้าย
      const newElements = state.elements.map(el => {
        if (el.id === elementId) {
          return { ...el, layer: minLayer - 1 };
        }
        return el;
      });
      
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'MOVE_UP': {
      const elementId = action.payload;
      const currentElement = state.elements.find(el => el.id === elementId);
      
      if (!currentElement) {
        return state;
      }
      
      // เรียงลำดับอิลิเมนต์ตาม layer จากมากไปน้อย (ค่าสูง = บน, ค่าต่ำ = ล่าง)
      const sortedElements = [...state.elements].sort((a, b) => (b.layer || 0) - (a.layer || 0));
      
      // หาตำแหน่งปัจจุบันใน sortedElements
      const currentIndex = sortedElements.findIndex(el => el.id === elementId);
      
      // ถ้าอยู่บนสุดแล้ว ไม่ต้องทำอะไร
      if (currentIndex <= 0) {
        return state;
      }
      
      // หาอิลิเมนต์ที่อยู่เหนือกว่า
      const aboveElement = sortedElements[currentIndex - 1];
      
      // สลับค่า layer กับอิลิเมนต์ที่อยู่เหนือกว่า
      const currentLayer = currentElement.layer || 0;
      const aboveLayer = aboveElement.layer || 0;
      
      const newElements = state.elements.map(el => {
        if (el.id === elementId) {
          return { ...el, layer: aboveLayer };
        } else if (el.id === aboveElement.id) {
          return { ...el, layer: currentLayer };
        }
        return el;
      });
      
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'MOVE_DOWN': {
      const elementId = action.payload;
      const currentElement = state.elements.find(el => el.id === elementId);
      
      if (!currentElement) {
        return state;
      }
      
      // เรียงลำดับอิลิเมนต์ตาม layer จากมากไปน้อย (ค่าสูง = บน, ค่าต่ำ = ล่าง)
      const sortedElements = [...state.elements].sort((a, b) => (b.layer || 0) - (a.layer || 0));
      
      // หาตำแหน่งปัจจุบันใน sortedElements
      const currentIndex = sortedElements.findIndex(el => el.id === elementId);
      
      // ถ้าอยู่ล่างสุดแล้ว ไม่ต้องทำอะไร
      if (currentIndex >= sortedElements.length - 1) {
        return state;
      }
      
      // หาอิลิเมนต์ที่อยู่ต่ำกว่า
      const belowElement = sortedElements[currentIndex + 1];
      
      // สลับค่า layer กับอิลิเมนต์ที่อยู่ต่ำกว่า
      const currentLayer = currentElement.layer || 0;
      const belowLayer = belowElement.layer || 0;
      
      const newElements = state.elements.map(el => {
        if (el.id === elementId) {
          return { ...el, layer: belowLayer };
        } else if (el.id === belowElement.id) {
          return { ...el, layer: currentLayer };
        }
        return el;
      });
      
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    case 'UNDO': {
      if (state.historyIndex <= 0) {
        return state;
      }
      
      const newIndex = state.historyIndex - 1;
      const previousElements = state.history[newIndex];
      
      return {
        elements: previousElements,
        history: state.history,
        historyIndex: newIndex,
        future: [state.elements, ...state.future]
      };
    }
    
    case 'REDO': {
      if (state.future.length === 0) {
        return state;
      }
      
      const [nextElements, ...remainingFuture] = state.future;
      
      return {
        elements: nextElements,
        history: [...state.history.slice(0, state.historyIndex + 1), nextElements],
        historyIndex: state.historyIndex + 1,
        future: remainingFuture
      };
    }
    
    case 'GROUP': {
      const { elementIds, groupConfig } = action.payload;
      if (!elementIds || elementIds.length < 2) {
        return state;
      }

      // Get elements to be grouped
      const groupElements = state.elements.filter(el => elementIds.includes(el.id));
      if (groupElements.length === 0) {
        return state;
      }

      // Calculate group bounds
      const minX = Math.min(...groupElements.map(el => el.x));
      const minY = Math.min(...groupElements.map(el => el.y));
      const maxX = Math.max(...groupElements.map(el => el.x + el.width));
      const maxY = Math.max(...groupElements.map(el => el.y + el.height));
      
      // หาค่า layer มากที่สุดในกลุ่มองค์ประกอบที่จัดกลุ่ม
      const maxLayerInGroup = Math.max(...groupElements.map(el => el.layer || 0));
      
      // หาค่า layer มากที่สุดในอาร์เรย์ทั้งหมด
      const maxLayerInAll = Math.max(...state.elements.map(el => el.layer || 0));
      
      // Calculate relative positions of each element
      const relativeElements = groupElements.map(el => ({
        ...el,
        id: uuidv4(),
        x: el.x - minX,
        y: el.y - minY
      }));
      
      // Create group element
      const groupElement: GroupElement = {
        id: uuidv4(),
        type: 'group',
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        elements: relativeElements,
        draggable: true,
        visible: true,
        locked: false,
        layer: maxLayerInAll + 10 // ให้กลุ่มอยู่บนองค์ประกอบทั้งหมด - เพิ่มช่องว่างเผื่อแทรกในอนาคต
      };
      
      // Remove grouped elements and add group at the top (beginning of array)
      const elementsWithoutGroup = state.elements.filter(el => !elementIds.includes(el.id));
      const newElements = [groupElement, ...elementsWithoutGroup];
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      
      return {
        elements: newElements,
        history: [...newHistory, cloneElements(newElements)],
        historyIndex: newHistory.length,
        future: []
      };
    }
    
    default:
      return state;
  }
};

/**
 * Custom hook to manage elements with undo/redo capabilities using reducer
 */
export const useElementReducer = (initialElements: ElementType[] = []) => {
  const [state, dispatch] = useReducer(elementReducer, {
    ...initialElementState,
    elements: initialElements,
    history: [initialElements]
  });
  
  // Memoized selectors for derived state
  const canUndo = useMemo(() => state.historyIndex > 0, [state.historyIndex]);
  const canRedo = useMemo(() => state.future.length > 0, [state.future.length]);
  
  // Memoized selectors for specific element types
  const qrElements = useMemo(() => 
    state.elements.filter(el => el.type === 'qr'),
    [state.elements]
  );
  
  const barcodeElements = useMemo(() => 
    state.elements.filter(el => el.type === 'barcode'),
    [state.elements]
  );
  
  // Action creators as callbacks
  const addElement = useCallback((element: ElementType) => {
    dispatch({ type: 'ADD_ELEMENT', payload: element });
  }, []);
  
  const addElements = useCallback((elements: ElementType[]) => {
    dispatch({ type: 'ADD_ELEMENTS', payload: elements });
  }, []);
  
  const updateElement = useCallback((element: ElementType) => {
    dispatch({ type: 'UPDATE_ELEMENT', payload: element });
  }, []);
  
  const updateElementProperty = useCallback((id: string, property: string, value: any) => {
    dispatch({ type: 'UPDATE_PROPERTY', payload: { id, property, value } });
  }, []);
  
  const deleteElement = useCallback((id: string) => {
    dispatch({ type: 'DELETE_ELEMENT', payload: id });
  }, []);
  
  const deleteElements = useCallback((ids: string[]) => {
    dispatch({ type: 'DELETE_ELEMENTS', payload: ids });
  }, []);
  
  const duplicateElement = useCallback((id: string, offsetX = 10, offsetY = 10) => {
    dispatch({ type: 'DUPLICATE_ELEMENT', payload: { id, offsetX, offsetY } });
  }, []);
  
  const replaceAllElements = useCallback((elements: ElementType[]) => {
    dispatch({ type: 'REPLACE_ALL', payload: elements });
  }, []);
  
  const createGroup = useCallback((ids: string[]) => {
    dispatch({ type: 'CREATE_GROUP', payload: { ids } });
  }, []);
  
  const ungroup = useCallback((id: string) => {
    dispatch({ type: 'UNGROUP', payload: id });
  }, []);
  
  const moveElementToTop = useCallback((id: string) => {
    dispatch({ type: 'MOVE_TO_TOP', payload: id });
  }, []);
  
  const moveElementToBottom = useCallback((id: string) => {
    dispatch({ type: 'MOVE_TO_BOTTOM', payload: id });
  }, []);
  
  const moveElementUp = useCallback((id: string) => {
    dispatch({ type: 'MOVE_UP', payload: id });
  }, []);
  
  const moveElementDown = useCallback((id: string) => {
    dispatch({ type: 'MOVE_DOWN', payload: id });
  }, []);
  
  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);
  
  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);
  
  return {
    elements: state.elements,
    qrElements,
    barcodeElements,
    canUndo,
    canRedo,
    addElement,
    addElements,
    updateElement,
    updateElementProperty,
    deleteElement,
    deleteElements,
    duplicateElement,
    replaceAllElements,
    createGroup,
    ungroup,
    moveElementToTop,
    moveElementToBottom,
    moveElementUp,
    moveElementDown,
    undo,
    redo
  };
}; 