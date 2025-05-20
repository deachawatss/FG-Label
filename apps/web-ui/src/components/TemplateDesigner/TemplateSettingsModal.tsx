import React, { memo, useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Row, Col, InputNumber, message } from 'antd';
import { TemplateInfo, CanvasSize } from '../../models/TemplateDesignerTypes';

const { Option } = Select;

// Define fixed paper sizes in pixels
const PAPER_SIZES = {
  '4x4': { width: 400, height: 400 },
  '4x6': { width: 400, height: 600 },
  '6x4': { width: 600, height: 400 },
  'A4': { width: 827, height: 1169 }, // A4 in pixels at 96 DPI
  'A5': { width: 583, height: 827 },  // A5 in pixels at 96 DPI
  'Custom': { width: 400, height: 400 } // Default custom size
};

// Define allowed orientation types
type OrientationType = 'Portrait' | 'Landscape';

interface TemplateSettingsModalProps {
  visible: boolean;
  onCancel: () => void;
  onSave: (templateInfo: TemplateInfo, canvasSize: CanvasSize) => void;
  templateInfo: TemplateInfo;
  canvasSize: CanvasSize;
  loading: boolean;
}

/**
 * Modal component for template settings
 */
export const TemplateSettingsModal: React.FC<TemplateSettingsModalProps> = memo(({
  visible,
  onCancel,
  onSave,
  templateInfo,
  canvasSize,
  loading
}) => {
  const [form] = Form.useForm();
  const [selectedPaperSize, setSelectedPaperSize] = useState(templateInfo.paperSize || '4x4');
  const [selectedOrientation, setSelectedOrientation] = useState<OrientationType>(
    (templateInfo.orientation as OrientationType) || 'Portrait'
  );

  // Calculate canvas size based on paper size and orientation
  const calculateCanvasSize = (paperSize: string, orientation: OrientationType): CanvasSize => {
    if (!PAPER_SIZES[paperSize as keyof typeof PAPER_SIZES]) {
      return { width: 400, height: 400 }; // Default fallback
    }

    const size = PAPER_SIZES[paperSize as keyof typeof PAPER_SIZES];
    
    // If orientation is Landscape and the paper size is not square, swap width and height
    if (orientation === 'Landscape' && size.width !== size.height) {
      return { width: size.height, height: size.width };
    }
    
    return { width: size.width, height: size.height };
  };

  // Set form values when modal becomes visible or when templateInfo changes
  useEffect(() => {
    if (visible) {
      form.setFieldsValue({
        ...templateInfo
      });
      setSelectedPaperSize(templateInfo.paperSize || '4x4');
      setSelectedOrientation((templateInfo.orientation as OrientationType) || 'Portrait');
    }
  }, [visible, templateInfo, form]);

  const handlePaperSizeChange = (value: string) => {
    setSelectedPaperSize(value);
    form.setFieldValue('paperSize', value);
  };

  const handleOrientationChange = (value: OrientationType) => {
    setSelectedOrientation(value);
    form.setFieldValue('orientation', value);
  };

  const handleSubmit = () => {
    form.validateFields().then(values => {
      // Calculate the canvas size based on selected paper size and orientation
      const newCanvasSize = calculateCanvasSize(selectedPaperSize, selectedOrientation);
      
      // Check if custom size is selected
      if (selectedPaperSize === 'Custom') {
        message.info('Custom size is set to 400x400 pixels by default');
      }
      
      onSave(values, newCanvasSize);
    });
  };

  return (
    <Modal
      title="Template Settings"
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={loading}
      width={700}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          ...templateInfo
        }}
      >
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="name"
              label="Template Name"
              rules={[{ required: true, message: 'Please enter template name' }]}
            >
              <Input placeholder="Enter template name" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="description"
              label="Description"
            >
              <Input.TextArea placeholder="Enter template description" rows={2} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="productKey"
              label="Product Code"
            >
              <Input placeholder="Enter product code" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="customerKey"
              label="Customer Code"
            >
              <Input placeholder="Enter customer code" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="paperSize"
              label="Paper Size"
              initialValue="4x4"
              rules={[{ required: true, message: 'Please select paper size' }]}
              help={
                <div style={{ marginTop: '5px', color: '#1890ff' }}>
                  Canvas size: {calculateCanvasSize(selectedPaperSize, selectedOrientation).width} x {calculateCanvasSize(selectedPaperSize, selectedOrientation).height} pixels
                </div>
              }
            >
              <Select onChange={handlePaperSizeChange}>
                <Option value="4x4">4 x 4 inches</Option>
                <Option value="4x6">4 x 6 inches</Option>
                <Option value="6x4">6 x 4 inches</Option>
                <Option value="A4">A4</Option>
                <Option value="A5">A5</Option>
                <Option value="Custom">Custom</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="orientation"
              label="Orientation"
              initialValue="Portrait"
              rules={[{ required: true, message: 'Please select orientation' }]}
            >
              <Select onChange={handleOrientationChange}>
                <Option value="Portrait">Portrait</Option>
                <Option value="Landscape">Landscape</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="templateType"
              label="Template Type"
              initialValue="Standard"
              rules={[{ required: true, message: 'Please select template type' }]}
            >
              <Select>
                <Option value="Standard">Standard</Option>
                <Option value="INNER">Inner Label</Option>
                <Option value="OUTER">Outer Label</Option>
                <Option value="MASTER">Master</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row>
          <Col span={24}>
            <div style={{ 
              padding: '8px 12px', 
              background: '#f5f5f5', 
              borderRadius: '4px',
              marginTop: '8px'
            }}>
              <p style={{ margin: '0', fontSize: '13px', color: '#666' }}>
                <strong>Note:</strong> Canvas size is automatically determined by the paper size you select. Elements will be contained within the canvas boundaries.
              </p>
            </div>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
});

TemplateSettingsModal.displayName = 'TemplateSettingsModal'; 