import React from "react";
import { Modal, Form, DatePicker, InputNumber, Switch, Space } from "antd";
import dayjs from "dayjs";
import { LabelDetails, updateLabel } from "../services/labelApi";

interface Props {
  open: boolean;
  label: LabelDetails;
  onCancel: () => void;
  onSaved: (updated: LabelDetails) => void;
}

const EditFgLabelModal: React.FC<Props> = ({ open, label, onCancel, onSaved }) => {
  const [form] = Form.useForm();

  const onOk = async () => {
    const vals = await form.validateFields();
    const payload = {
      productionDate: vals.productionDate.format("YYYY-MM-DD"),
      bagStart: vals.bagStart,
      bagEnd: vals.bagEnd,
      qcSample: vals.qcSample,
      formulaSheet: vals.formulaSheet,
      palletTag: vals.palletTag,
    };
    onSaved(await updateLabel(label.BatchNo, payload));
  };

  return (
    <Modal title="Edit FG Label" open={open} onOk={onOk} onCancel={onCancel} okText="Save">
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          productionDate: dayjs(label.ProductionDate),
          bagStart: label.BagStart,
          bagEnd: label.BagEnd,
          qcSample: label.PrintQcSample,
          formulaSheet: label.PrintFormula,
          palletTag: label.PrintPalletTag,
        }}
      >
        <Form.Item name="productionDate" label="Production Date" rules={[{ required: true }]}>
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>

        <Space.Compact style={{ width: "100%" }}>
          <Form.Item name="bagStart" label="Bag Start" style={{ flex: 1 }} rules={[{ required: true, type: "number", min: 1 }]}>
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="bagEnd" label="Bag End" style={{ flex: 1 }} rules={[{ required: true, type: "number", min: 1 }]}>
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
        </Space.Compact>

        <Form.Item name="qcSample" label="Print QC Sample" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="formulaSheet" label="Print Formula Sheet" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="palletTag" label="Print Pallet Tag" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EditFgLabelModal; 