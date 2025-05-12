import React, { useState, useEffect } from "react";
import { Modal, Form, DatePicker, InputNumber, Switch, Button, Space, Spin } from "antd";
import type { LabelDetails } from "../services/labelApi";
import { updateLabel } from "../services/labelApi";
import dayjs from "dayjs";

interface EditFgLabelModalProps {
  open: boolean;
  onCancel: () => void;
  label: LabelDetails;
  onSaved: (updated: LabelDetails) => void;
}

const EditFgLabelModal: React.FC<EditFgLabelModalProps> = ({
  open,
  onCancel,
  label,
  onSaved,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [bagStart, setBagStart] = useState(1);

  // ตั้งค่าค่าเริ่มต้นให้กับฟอร์ม
  useEffect(() => {
    if (open && label) {
      form.setFieldsValue({
        productionDate: label.productionDate ? dayjs(label.productionDate) : null,
        bagStart: label.bagStart || 1,
        bagEnd: label.bagEnd || Math.max(1, label.totalBags || 10),
        qcSample: label.qcSample || false,
        formulaSheet: label.formulaSheet || false,
        palletTag: label.palletTag || false,
      });
      
      // อัปเดต state ของ bagStart สำหรับใช้ validate bagEnd
      setBagStart(label.bagStart || 1);
    }
  }, [open, label, form]);

  // อัปเดต bagStart state เมื่อมีการเปลี่ยนแปลงใน form
  const handleBagStartChange = (value: number | null) => {
    if (value !== null) {
      setBagStart(value);
      
      // ถ้า bagEnd น้อยกว่า bagStart ให้อัปเดต bagEnd ด้วย
      const currentBagEnd = form.getFieldValue("bagEnd");
      if (currentBagEnd < value) {
        form.setFieldValue("bagEnd", value);
      }
    }
  };

  const handleSave = async () => {
    try {
      await form.validateFields();
      const values = form.getFieldsValue();
      
      // แปลงรูปแบบวันที่จาก dayjs เป็น ISO string
      if (values.productionDate) {
        values.productionDate = values.productionDate.toISOString();
      }
      
      setLoading(true);
      const updatedLabel = await updateLabel(label.batchNo, values);
      onSaved(updatedLabel);
    } catch (error) {
      console.error("Error saving label:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Edit FG Label"
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="save" type="primary" onClick={handleSave} loading={loading}>
          Save
        </Button>,
      ]}
    >
      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            productionDate: label?.productionDate ? dayjs(label.productionDate) : null,
            bagStart: 1,
            bagEnd: 1,
            qcSample: false,
            formulaSheet: false,
            palletTag: false,
          }}
        >
          {/* Production Date */}
          <Form.Item
            name="productionDate"
            label="Production Date"
            rules={[{ required: true, message: "Production date is required" }]}
          >
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>

          {/* Bag Range */}
          <Form.Item label="Bag Range">
            <Space>
              <Form.Item
                name="bagStart"
                noStyle
                rules={[{ required: true, message: "Start bag is required" }]}
              >
                <InputNumber
                  min={1}
                  placeholder="Start"
                  onChange={handleBagStartChange}
                />
              </Form.Item>
              <span>to</span>
              <Form.Item
                name="bagEnd"
                noStyle
                rules={[
                  { required: true, message: "End bag is required" },
                  () => ({
                    validator(_, value) {
                      if (!value || value >= bagStart) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error("End bag must be greater than or equal to start bag"));
                    },
                  }),
                ]}
              >
                <InputNumber min={bagStart} placeholder="End" />
              </Form.Item>
            </Space>
          </Form.Item>

          {/* Switches */}
          <Form.Item name="qcSample" valuePropName="checked">
            <Switch checkedChildren="QC Sample" unCheckedChildren="QC Sample" /> QC Sample
          </Form.Item>

          <Form.Item name="formulaSheet" valuePropName="checked">
            <Switch checkedChildren="Formula Sheet" unCheckedChildren="Formula Sheet" /> Formula Sheet
          </Form.Item>

          <Form.Item name="palletTag" valuePropName="checked">
            <Switch checkedChildren="Pallet Tag" unCheckedChildren="Pallet Tag" /> Pallet Tag
          </Form.Item>
        </Form>
      </Spin>
    </Modal>
  );
};

export default EditFgLabelModal; 