import React, { memo, useState, useEffect } from 'react';
import { Button, Tooltip, Input, Space, Typography, Dropdown, Menu, Popover, List, Empty } from 'antd';
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
  FileImageOutlined,
  HistoryOutlined,
  DownOutlined,
  ReloadOutlined
} from '@ant-design/icons';

// Interface for batch history
interface BatchHistory {
  batchNo: string;
  timestamp: number;
}

// Key for storing history in localStorage
const BATCH_HISTORY_KEY = 'fglabel_batch_history';

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
  onBatchNoChange?: (newBatchNo: string) => void;
  batchError?: string | null;
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
  batchError,
  onApplyBatchData,
  isBatchLoading = false
}) => {
  // State for batch history
  const [batchHistory, setBatchHistory] = useState<BatchHistory[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  
  // Load batch history from localStorage when component mounts
  useEffect(() => {
    loadBatchHistory();
  }, []);
  
  // Save batch history when batchNo changes and Apply is clicked
  useEffect(() => {
    if (batchNo && isBatchLoading === false) {
      saveBatchHistory(batchNo);
    }
  }, [batchNo, isBatchLoading]);
  
  // Function to load batch history from localStorage
  const loadBatchHistory = () => {
    try {
      const historyJson = localStorage.getItem(BATCH_HISTORY_KEY);
      if (historyJson) {
        const history = JSON.parse(historyJson) as BatchHistory[];
        // Sort by timestamp (newest first)
        const sortedHistory = history.sort((a, b) => b.timestamp - a.timestamp);
        // Remove duplicates, keeping only the latest entry for each batchNo
        const uniqueHistory = sortedHistory.filter((item, index, self) => 
          index === self.findIndex(t => t.batchNo === item.batchNo)
        );
        // Limit to 10 entries
        setBatchHistory(uniqueHistory.slice(0, 10));
      }
    } catch (error) {
      console.error('Error loading batch history:', error);
    }
  };
  
  // Function to save batch history to localStorage
  const saveBatchHistory = (batchNumber: string) => {
    try {
      // Validate batch number
      if (!batchNumber || batchNumber.trim() === '') {
        return;
      }
      
      const newEntry: BatchHistory = {
        batchNo: batchNumber.trim(),
        timestamp: Date.now()
      };
      
      // Load current history
      const historyJson = localStorage.getItem(BATCH_HISTORY_KEY);
      let history: BatchHistory[] = [];
      
      if (historyJson) {
        history = JSON.parse(historyJson) as BatchHistory[];
      }
      
      // Add new entry
      history.push(newEntry);
      
      // Sort and remove duplicates
      const sortedHistory = history.sort((a, b) => b.timestamp - a.timestamp);
      const uniqueHistory = sortedHistory.filter((item, index, self) => 
        index === self.findIndex(t => t.batchNo === item.batchNo)
      );
      
      // Limit to 10 entries
      const limitedHistory = uniqueHistory.slice(0, 10);
      
      // Save to localStorage
      localStorage.setItem(BATCH_HISTORY_KEY, JSON.stringify(limitedHistory));
      
      // Update state
      setBatchHistory(limitedHistory);
    } catch (error) {
      console.error('Error saving batch history:', error);
    }
  };
  
  // Function to select a batch from history
  const handleSelectBatch = (batch: BatchHistory) => {
    if (onBatchNoChange) {
      onBatchNoChange(batch.batchNo);
      setHistoryVisible(false);
      
      // Update history to make this the most recent entry
      saveBatchHistory(batch.batchNo);
      
      // If onApplyBatchData exists, call it automatically
      if (onApplyBatchData) {
        onApplyBatchData();
      }
    }
  };
  
  // Function to handle Enter key press in the search field
  const handleBatchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onApplyBatchData) {
      onApplyBatchData();
    }
  };
  
  // Function to handle Alt+H shortcut to toggle history
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.altKey && e.key === 'h') {
      setHistoryVisible(prev => !prev);
    }
  };
  
  // Register event listener for shortcuts
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  
  // Function to clear all history
  const clearAllHistory = () => {
    localStorage.removeItem(BATCH_HISTORY_KEY);
    setBatchHistory([]);
  };
  
  // Content of the batch history popover
  const historyContent = (
    <div style={{ width: '250px' }}>
      {batchHistory.length === 0 ? (
        <Empty description="No batch history available" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          header={
            <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Recent Batch History</span>
              <Space>
                <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                  Alt+H
                </Typography.Text>
                <Button 
                  type="text" 
                  size="small" 
                  icon={<DeleteOutlined />} 
                  onClick={(e) => {
                    e.stopPropagation();
                    clearAllHistory();
                  }}
                  title="Clear All History"
                />
              </Space>
            </div>
          }
          bordered
          dataSource={batchHistory}
          renderItem={(item) => (
            <List.Item 
              style={{ 
                cursor: 'pointer',
                padding: '8px 12px',
                transition: 'background-color 0.3s',
                backgroundColor: item.batchNo === batchNo ? '#f0f5ff' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between'
              }}
              onClick={() => handleSelectBatch(item)}
            >
              <Typography.Text strong style={{ fontSize: '14px' }}>
                {item.batchNo}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                {new Date(item.timestamp).toLocaleDateString()}
              </Typography.Text>
            </List.Item>
          )}
          footer={
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Button 
                type="link" 
                size="small" 
                icon={<ReloadOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  loadBatchHistory();
                }}
              >
                Refresh History
              </Button>
            </div>
          }
        />
      )}
    </div>
  );

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
      
      {/* Center - Batch search with history */}
      {onApplyBatchData && onBatchNoChange && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          width: '260px'
        }}>
          <Typography.Text style={{ color: '#fff', marginRight: '8px', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
            Sync Batch
          </Typography.Text>
          <Space.Compact style={{ width: '100%' }}>
            <Popover
              content={historyContent}
              title={null}
              trigger="click"
              open={historyVisible}
              onOpenChange={setHistoryVisible}
              placement="bottomLeft"
            >
              <Tooltip title="View recent batch history (Alt+H)">
                <Button 
                  icon={<HistoryOutlined />}
                  disabled={batchHistory.length === 0}
                />
              </Tooltip>
            </Popover>
            <Input
              placeholder="######"
              value={batchNo}
              onChange={(e) => onBatchNoChange(e.target.value)}
              style={{ flex: 1, width: '100px' }}
              maxLength={6}
              onKeyDown={handleBatchKeyDown}
              status={batchError ? 'error' : undefined}
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