import React, { memo } from 'react';
import { Button, Tooltip, Input, Space, Typography } from 'antd';
import { 
  SaveOutlined, 
  UndoOutlined, 
  RedoOutlined, 
  DeleteOutlined, 
  ZoomInOutlined, 
  ZoomOutOutlined, 
  SettingOutlined, 
  CopyOutlined, 
  RotateRightOutlined,
  EyeOutlined,
  GroupOutlined,
  ScissorOutlined,
  FilePdfOutlined,
  FileImageOutlined
} from '@ant-design/icons';

interface DesignerToolbarProps {
  onSave: () => void;
  onExportPdf?: () => void;
  onExportPng?: () => void;
  onPrintPreview?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom?: () => void;
  onAddTemplate?: () => void;
  onTemplateSettings: () => void;
  onDuplicate?: () => void;
  onRotate?: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  canvasSize?: { width: number; height: number };
  onSizeChange?: (newSize: { width: number; height: number }) => void;
  templateLoaded?: boolean;
  lastSaved?: string;
  canUndo: boolean;
  canRedo: boolean;
  canDelete?: boolean;
  canDuplicate?: boolean;
  canGroup?: boolean;
  canUngroup?: boolean;
  isSaving: boolean;
  isPreviewing?: boolean;
  zoom: number;
  batchNo?: string;
  onBatchNoChange?: React.Dispatch<React.SetStateAction<string>>;
  onApplyBatchData?: () => void;
  isBatchLoading?: boolean;
}

/**
 * Component that displays the top toolbar for TemplateDesigner
 */
export const DesignerToolbar: React.FC<DesignerToolbarProps> = memo(({
  onSave,
  onExportPdf,
  onExportPng,
  onPrintPreview,
  onUndo,
  onRedo,
  onDelete,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onAddTemplate,
  onTemplateSettings,
  onDuplicate,
  onRotate,
  onGroup,
  onUngroup,
  canvasSize,
  onSizeChange,
  templateLoaded,
  lastSaved,
  canUndo,
  canRedo,
  canDelete,
  canDuplicate,
  canGroup,
  canUngroup,
  isSaving,
  isPreviewing,
  zoom,
  batchNo = '',
  onBatchNoChange,
  onApplyBatchData,
  isBatchLoading = false
}) => {
  return (
    <div style={{
      display: 'flex',
      gap: '4px',
      alignItems: 'center',
      width: '100%',
      justifyContent: 'space-between'
    }}>
      {/* Left side - Title */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>
          Label Template Designer
        </div>
      </div>
      
      {/* Center - Batch search */}
      {onApplyBatchData && onBatchNoChange && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          width: '220px'
        }}>
          <Typography.Text style={{ color: '#fff', marginRight: '8px', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
            Sync Batch
          </Typography.Text>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="######"
              value={batchNo}
              onChange={(e) => onBatchNoChange(e.target.value)}
              style={{ flex: 1, width: '100px' }}
              maxLength={6}
            />
            <Button
              type="primary"
              onClick={onApplyBatchData}
              loading={isBatchLoading}
            >
              Apply
            </Button>
          </Space.Compact>
        </div>
      )}
      
      {/* Right side - All tools */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <Tooltip title="Save Template">
          <Button 
            type="primary" 
            icon={<SaveOutlined />} 
            onClick={onSave}
            loading={isSaving}
          />
        </Tooltip>
        
        {onExportPdf && (
          <Tooltip title="Export PDF">
            <Button 
              icon={<FilePdfOutlined />} 
              onClick={onExportPdf}
            />
          </Tooltip>
        )}
        
        {onExportPng && (
          <Tooltip title="Export PNG">
            <Button 
              icon={<FileImageOutlined />} 
              onClick={onExportPng}
            />
          </Tooltip>
        )}
        
        <Tooltip title="Undo">
          <Button 
            icon={<UndoOutlined />} 
            onClick={onUndo}
            disabled={!canUndo}
          />
        </Tooltip>
        
        <Tooltip title="Redo">
          <Button 
            icon={<RedoOutlined />} 
            onClick={onRedo}
            disabled={!canRedo}
          />
        </Tooltip>
        
        {onDelete && (
          <Tooltip title="Delete Element">
            <Button 
              icon={<DeleteOutlined />} 
              onClick={onDelete}
              disabled={!canDelete}
            />
          </Tooltip>
        )}
        
        {onDuplicate && (
          <Tooltip title="Duplicate Element">
            <Button 
              icon={<CopyOutlined />} 
              onClick={onDuplicate}
              disabled={!canDuplicate}
            />
          </Tooltip>
        )}
        
        {onRotate && (
          <Tooltip title="Rotate Element">
            <Button 
              icon={<RotateRightOutlined />} 
              onClick={onRotate}
              disabled={!canDuplicate}
            />
          </Tooltip>
        )}
        
        {onGroup && (
          <Tooltip title="Group Elements (Ctrl+G)">
            <Button 
              icon={<GroupOutlined />} 
              onClick={onGroup}
              disabled={!canGroup}
            />
          </Tooltip>
        )}
        
        {onUngroup && (
          <Tooltip title="Ungroup Elements">
            <Button 
              icon={<ScissorOutlined />} 
              onClick={onUngroup}
              disabled={!canUngroup}
            />
          </Tooltip>
        )}
        
        <Tooltip title="Zoom In">
          <Button 
            icon={<ZoomInOutlined />} 
            onClick={onZoomIn}
          />
        </Tooltip>
        
        <Tooltip title="Zoom Out">
          <Button 
            icon={<ZoomOutOutlined />} 
            onClick={onZoomOut}
          />
        </Tooltip>
        
        {onResetZoom && (
          <Tooltip title="Reset Zoom">
            <Button onClick={onResetZoom}>
              {Math.round(zoom * 100)}%
            </Button>
          </Tooltip>
        )}
        
        <Tooltip title="Template Settings">
          <Button 
            icon={<SettingOutlined />} 
            onClick={onTemplateSettings}
          />
        </Tooltip>
        
        {onPrintPreview && (
          <Tooltip title="Print Preview">
            <Button 
              icon={<EyeOutlined />} 
              onClick={onPrintPreview}
              loading={isPreviewing}
            />
          </Tooltip>
        )}
        
        {lastSaved && (
          <div style={{ marginLeft: '4px', fontSize: '12px', color: '#ffffff80' }}>
            Last saved: {lastSaved}
          </div>
        )}
      </div>
    </div>
  );
});

DesignerToolbar.displayName = 'DesignerToolbar'; 