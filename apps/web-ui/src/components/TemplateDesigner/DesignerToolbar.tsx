import React, { memo } from 'react';
import { Button, Tooltip } from 'antd';
import { 
  SaveOutlined, 
  DownloadOutlined, 
  UploadOutlined, 
  UndoOutlined, 
  RedoOutlined, 
  DeleteOutlined, 
  ZoomInOutlined, 
  ZoomOutOutlined, 
  SettingOutlined, 
  CopyOutlined, 
  RotateRightOutlined
} from '@ant-design/icons';

interface DesignerToolbarProps {
  onSave: () => void;
  onExport: () => void;
  onImport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTemplateSettings: () => void;
  onDuplicate: () => void;
  onRotate: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  isSaving: boolean;
  zoom: number;
}

/**
 * คอมโพเนนต์แสดงแถบเครื่องมือด้านบนของ TemplateDesigner
 */
export const DesignerToolbar: React.FC<DesignerToolbarProps> = memo(({
  onSave,
  onExport,
  onImport,
  onUndo,
  onRedo,
  onDelete,
  onZoomIn,
  onZoomOut,
  onTemplateSettings,
  onDuplicate,
  onRotate,
  canUndo,
  canRedo,
  canDelete,
  canDuplicate,
  isSaving,
  zoom
}) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Tooltip title="บันทึกเทมเพลต">
          <Button 
            type="primary" 
            icon={<SaveOutlined />} 
            onClick={onSave}
            loading={isSaving}
          />
        </Tooltip>
        <Tooltip title="ส่งออกเป็น JSON">
          <Button 
            icon={<DownloadOutlined />} 
            onClick={onExport}
          />
        </Tooltip>
        <Tooltip title="นำเข้าจาก JSON">
          <Button 
            icon={<UploadOutlined />} 
            onClick={onImport}
          />
        </Tooltip>
        <div style={{ width: 1, height: 24, background: '#e8e8e8', margin: '0 8px' }} />
        <Tooltip title="เลิกทำ (Undo)">
          <Button 
            icon={<UndoOutlined />} 
            onClick={onUndo}
            disabled={!canUndo}
          />
        </Tooltip>
        <Tooltip title="ทำซ้ำ (Redo)">
          <Button 
            icon={<RedoOutlined />} 
            onClick={onRedo}
            disabled={!canRedo}
          />
        </Tooltip>
        <div style={{ width: 1, height: 24, background: '#e8e8e8', margin: '0 8px' }} />
        <Tooltip title="ลบองค์ประกอบที่เลือก">
          <Button 
            icon={<DeleteOutlined />} 
            onClick={onDelete}
            disabled={!canDelete}
            danger
          />
        </Tooltip>
        <Tooltip title="คัดลอกองค์ประกอบที่เลือก">
          <Button 
            icon={<CopyOutlined />} 
            onClick={onDuplicate}
            disabled={!canDuplicate}
          />
        </Tooltip>
        <Tooltip title="หมุนองค์ประกอบที่เลือก">
          <Button 
            icon={<RotateRightOutlined />} 
            onClick={onRotate}
            disabled={!canDuplicate}
          />
        </Tooltip>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>ขยาย: {Math.round(zoom * 100)}%</span>
        <Tooltip title="ขยาย">
          <Button 
            icon={<ZoomInOutlined />} 
            onClick={onZoomIn}
          />
        </Tooltip>
        <Tooltip title="ย่อ">
          <Button 
            icon={<ZoomOutOutlined />} 
            onClick={onZoomOut}
          />
        </Tooltip>
        <div style={{ width: 1, height: 24, background: '#e8e8e8', margin: '0 8px' }} />
        <Tooltip title="ตั้งค่าเทมเพลต">
          <Button 
            icon={<SettingOutlined />} 
            onClick={onTemplateSettings}
          />
        </Tooltip>
      </div>
    </div>
  );
});

DesignerToolbar.displayName = 'DesignerToolbar'; 