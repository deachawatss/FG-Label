import React, { memo } from 'react';
import { Button, Input, Divider } from 'antd';
import { TOOLBOX } from '../../utils/template/constants';

interface DesignerSidebarProps {
  onAddElement: (type: string) => void;
  batchNo: string;
  onBatchNoChange: (value: string) => void;
  onApplyBatchData: () => void;
  isLoading: boolean;
}

/**
 * คอมโพเนนต์แสดงแถบเครื่องมือด้านข้างของ TemplateDesigner
 */
export const DesignerSidebar: React.FC<DesignerSidebarProps> = memo(({
  onAddElement,
  batchNo,
  onBatchNoChange,
  onApplyBatchData,
  isLoading
}) => {
  return (
    <div style={{ padding: '16px' }}>
      <div style={{ marginBottom: 16 }}>
        <h3>เพิ่มองค์ประกอบ</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TOOLBOX.map((tool) => (
            <Button 
              key={tool.type}
              icon={tool.icon} 
              onClick={() => onAddElement(tool.type)}
              title={tool.label}
            >
              {tool.label}
            </Button>
          ))}
        </div>
      </div>
      <Divider />
      
      <div style={{ marginBottom: 16 }}>
        <h3>ข้อมูล Batch</h3>
        <Input
          placeholder="ระบุหมายเลข Batch"
          value={batchNo}
          onChange={(e) => onBatchNoChange(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <Button 
          type="primary" 
          onClick={onApplyBatchData} 
          loading={isLoading}
          style={{ width: '100%' }}
        >
          ใช้ข้อมูล Batch
        </Button>
      </div>
    </div>
  );
});

DesignerSidebar.displayName = 'DesignerSidebar'; 