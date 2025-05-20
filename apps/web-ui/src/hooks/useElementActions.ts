import { useCallback } from 'react';
import { notification } from 'antd';
import { ElementType } from '../models/TemplateDesignerTypes';
import { generateUniqueId } from '../utils/template/helpers';
import { DEFAULT_ELEMENT_VALUES } from '../utils/template/constants';

interface UseElementActionsProps {
  selectedElements: ElementType[];
  elements: ElementType[];
  updateElements: (elements: ElementType[]) => void;
  updateSelectedElements: (elements: ElementType[]) => void;
  messages: {
    success: {
      groupElements: string;
      ungroupElements: string;
    };
    warning: {
      selectTwoElements: string;
      selectGroupToUngroup: string;
      onlyGroupsCanBeUngrouped: string;
      noElementsInGroup: string;
    };
  };
}

export function useElementActions({
  selectedElements,
  elements,
  updateElements,
  updateSelectedElements,
  messages,
}: UseElementActionsProps) {
  
  // Create a group from selected elements
  const createGroup = useCallback(() => {
    if (selectedElements.length < 2) {
      notification.warning({
        message: messages.warning.selectTwoElements,
      });
      return;
    }

    // Get all ids of selected elements
    const selectedIds = selectedElements.map((element) => element.id);
    
    // Calculate group bounds
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    selectedElements.forEach((element) => {
      const left = element.x;
      const top = element.y;
      const right = element.x + element.width;
      const bottom = element.y + element.height;
      
      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, right);
      maxY = Math.max(maxY, bottom);
    });
    
    const groupWidth = maxX - minX;
    const groupHeight = maxY - minY;
    
    // Create new group element
    const groupId = generateUniqueId();
    const groupElement: ElementType = {
      ...DEFAULT_ELEMENT_VALUES,
      id: groupId,
      type: 'group',
      x: minX,
      y: minY,
      width: groupWidth,
      height: groupHeight,
      elements: selectedElements.map(element => ({
        ...element,
        x: element.x - minX,
        y: element.y - minY
      })),
      rotation: 0
    };
    
    // Update elements positions relative to group
    const updatedElements = elements.map((element) => {
      if (selectedIds.includes(element.id)) {
        return {
          ...element,
          groupId: groupId,
          x: element.x - minX,
          y: element.y - minY,
          parentX: minX,
          parentY: minY,
        };
      }
      return element;
    });
    
    // Add the new group element to the elements array
    const newElements = [...updatedElements, groupElement];
    updateElements(newElements);
    updateSelectedElements([groupElement]);
    
    notification.success({
      message: messages.success.groupElements,
    });
  }, [selectedElements, elements, updateElements, updateSelectedElements, messages]);
  
  // Ungroup elements
  const ungroupElements = useCallback(() => {
    if (selectedElements.length !== 1) {
      notification.warning({
        message: messages.warning.selectGroupToUngroup,
      });
      return;
    }
    
    const selectedElement = selectedElements[0];
    
    if (selectedElement.type !== 'group') {
      notification.warning({
        message: messages.warning.onlyGroupsCanBeUngrouped,
      });
      return;
    }
    
    const groupElement = selectedElement as any;
    
    if (!groupElement.elements || groupElement.elements.length === 0) {
      notification.warning({
        message: messages.warning.noElementsInGroup,
      });
      return;
    }
    
    // Create new elements with absolute position
    const childElements = groupElement.elements.map((groupChild: any) => {
      const newId = generateUniqueId();
      return {
        ...groupChild,
        id: newId,
        x: groupElement.x + groupChild.x,
        y: groupElement.y + groupChild.y,
        groupId: undefined,
        parentX: undefined,
        parentY: undefined,
      };
    });
    
    // Remove the group element and add the child elements
    const elementsWithoutGroup = elements.filter(
      (element) => element.id !== selectedElement.id
    );
    
    const newElements = [...elementsWithoutGroup, ...childElements];
    updateElements(newElements);
    updateSelectedElements(childElements);
    
    notification.success({
      message: messages.success.ungroupElements,
    });
  }, [selectedElements, elements, updateElements, updateSelectedElements, messages, generateUniqueId]);

  // Duplicate selected elements
  const duplicateElements = useCallback(() => {
    if (selectedElements.length === 0) return;

    const duplicatedElements: ElementType[] = [];
    
    // Create duplicates of all selected elements
    selectedElements.forEach((element) => {
      const duplicatedId = generateUniqueId();
      const duplicated: ElementType = {
        ...element,
        id: duplicatedId,
        x: element.x + 10, // Offset duplicate slightly
        y: element.y + 10,
      };
      
      duplicatedElements.push(duplicated);
    });
    
    // Add duplicated elements to canvas
    const newElements = [...elements, ...duplicatedElements];
    updateElements(newElements);
    updateSelectedElements(duplicatedElements);
    
  }, [selectedElements, elements, updateElements, updateSelectedElements]);

  // Delete selected elements
  const deleteElements = useCallback(() => {
    if (selectedElements.length === 0) return;
    
    const selectedIds = selectedElements.map((element) => element.id);
    
    // Remove selected elements
    const newElements = elements.filter(
      (element) => !selectedIds.includes(element.id)
    );
    
    updateElements(newElements);
    updateSelectedElements([]);
    
  }, [selectedElements, elements, updateElements, updateSelectedElements]);

  return {
    createGroup,
    ungroupElements,
    duplicateElements,
    deleteElements,
  };
} 