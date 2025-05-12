import React, { useState } from "react";
import { Layout, Input, Card, Button, Row, Col, message } from "antd";
import { PrinterOutlined, EditOutlined } from "@ant-design/icons";
import LabelPreview from "../components/LabelPreview";
import EditFgLabelModal from "../components/EditFgLabelModal";
import { getLabelDetails } from "../services/labelApi";
import type { LabelDetails } from "../services/labelApi";

const { Content } = Layout;

const BatchSearchPage: React.FC = () => {
  const [batchNo, setBatchNo] = useState("");
  const [label, setLabel] = useState<LabelDetails | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  /** called every keystroke */
  const onBatchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setBatchNo(value);
    if (value.length === 6) fetchLabel(value);
  };

  const fetchLabel = async (bn: string) => {
    try {
      const data = await getLabelDetails(bn);
      setLabel(data);
    } catch {
      message.error("Batch not found");
      setLabel(null);
    }
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Content style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Row gutter={32} align="middle">
          <Col>
            <Input
              size="large"
              value={batchNo}
              onChange={onBatchChange}
              placeholder="Please scan batch number"
              autoFocus
              style={{ width: 320, marginBottom: 24 }}
            />
            {label && (
              <Card
                style={{ width: 420 }}
                actions={[
                  <Button type="link" icon={<EditOutlined />} key="edit" onClick={() => setEditOpen(true)}>
                    Edit FG Label
                  </Button>,
                  <Button type="link" icon={<PrinterOutlined />} key="print" onClick={() => window.print()}>
                    Print
                  </Button>,
                ]}
              >
                <LabelPreview data={label} />
              </Card>
            )}
          </Col>
        </Row>

        {/* edit‑modal */}
        {label && (
          <EditFgLabelModal
            open={editOpen}
            onCancel={() => setEditOpen(false)}
            label={label}
            onSaved={(updated) => {
              setLabel(updated);
              setEditOpen(false);
            }}
          />
        )}
      </Content>
    </Layout>
  );
};

export default BatchSearchPage; 