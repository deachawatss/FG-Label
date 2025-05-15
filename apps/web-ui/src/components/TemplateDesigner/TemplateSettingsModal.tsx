import React, { memo } from 'react';
import { Modal, Form, Input, Select, Row, Col, InputNumber } from 'antd';
import { TemplateInfo, CanvasSize } from '../../models/TemplateDesignerTypes';

const { Option } = Select;

interface TemplateSettingsModalProps {
  visible: boolean;
  onCancel: () => void;
  onSave: (templateInfo: TemplateInfo, canvasSize: CanvasSize) => void;
  templateInfo: TemplateInfo;
  canvasSize: CanvasSize;
  loading: boolean;
}

/**
 * คอมโพเนนต์ Modal สำหรับตั้งค่าเทมเพลต
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

  // ตั้งค่าฟอร์มเมื่อ visible หรือ templateInfo เปลี่ยน
  React.useEffect(() => {
    if (visible) {
      form.setFieldsValue({
        ...templateInfo,
        width: canvasSize.width,
        height: canvasSize.height
      });
    }
  }, [visible, templateInfo, canvasSize, form]);

  const handleSubmit = () => {
    form.validateFields().then(values => {
      const { width, height, ...restValues } = values;
      onSave(restValues, { width, height });
    });
  };

  return (
    <Modal
      title="ตั้งค่าเทมเพลต"
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
          ...templateInfo,
          width: canvasSize.width,
          height: canvasSize.height
        }}
      >
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="name"
              label="ชื่อเทมเพลต"
              rules={[{ required: true, message: 'กรุณาระบุชื่อเทมเพลต' }]}
            >
              <Input placeholder="ระบุชื่อเทมเพลต" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="description"
              label="คำอธิบาย"
            >
              <Input.TextArea placeholder="ระบุคำอธิบายเทมเพลต" rows={2} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="productKey"
              label="รหัสสินค้า"
            >
              <Input placeholder="ระบุรหัสสินค้า" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="customerKey"
              label="รหัสลูกค้า"
            >
              <Input placeholder="ระบุรหัสลูกค้า" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="paperSize"
              label="ขนาดกระดาษ"
              initialValue="4x4"
            >
              <Select>
                <Option value="4x4">4 x 4 นิ้ว</Option>
                <Option value="4x6">4 x 6 นิ้ว</Option>
                <Option value="A4">A4</Option>
                <Option value="A5">A5</Option>
                <Option value="Custom">กำหนดเอง</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="orientation"
              label="การวางแนว"
              initialValue="Portrait"
            >
              <Select>
                <Option value="Portrait">แนวตั้ง</Option>
                <Option value="Landscape">แนวนอน</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="width"
              label="ความกว้าง (พิกเซล)"
              rules={[{ required: true, message: 'กรุณาระบุความกว้าง' }]}
            >
              <InputNumber min={100} max={2000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="height"
              label="ความสูง (พิกเซล)"
              rules={[{ required: true, message: 'กรุณาระบุความสูง' }]}
            >
              <InputNumber min={100} max={2000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="templateType"
              label="ประเภทเทมเพลต"
              initialValue="Standard"
            >
              <Select>
                <Option value="Standard">มาตรฐาน</Option>
                <Option value="INNER">ฉลากภายใน</Option>
                <Option value="OUTER">ฉลากภายนอก</Option>
                <Option value="MASTER">มาสเตอร์</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
});

TemplateSettingsModal.displayName = 'TemplateSettingsModal'; 