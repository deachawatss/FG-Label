import React from "react";
import { Typography, Divider, Space } from "antd";
import type { LabelDetails } from "../services/labelApi";

const { Title, Text } = Typography;

interface LabelPreviewProps {
  data: LabelDetails;
}

const LabelPreview: React.FC<LabelPreviewProps> = ({ data }) => {
  return (
    <div className="label-preview">
      {/* ส่วนหัวของฉลาก */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{data.productName}</Title>
        <Title level={3} style={{ margin: 0, color: "#1890ff" }}>{data.productKey}</Title>
      </div>
      
      <Divider style={{ margin: "12px 0" }} />
      
      {/* ข้อมูลสำคัญ */}
      <Space direction="vertical" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Text strong>Batch No:</Text>
          <Text>{data.batchNo}</Text>
        </div>
        
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Text strong>Bag No:</Text>
          <Text>{data.bagNo}</Text>
        </div>
        
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Text strong>Production Date:</Text>
          <Text>{new Date(data.productionDate).toLocaleDateString()}</Text>
        </div>
        
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Text strong>Net Weight:</Text>
          <Text>{data.netWeight} {data.packUnit1}</Text>
        </div>
        
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Text strong>Best Before:</Text>
          <Text>{new Date(data.expiryDate).toLocaleDateString()}</Text>
        </div>
      </Space>
      
      <Divider style={{ margin: "12px 0" }} />
      
      {/* ข้อมูลเพิ่มเติม */}
      <div style={{ fontSize: "12px" }}>
        <div style={{ marginBottom: 8 }}>
          <Text strong>Allergens:</Text> {data.allergen1 || "-"}
        </div>
        <div>
          <Text strong>Storage Condition:</Text> {data.storageCondition || "Store in cool dry place"}
        </div>
      </div>
      
      {/* ตัวอย่างบาร์โค้ด */}
      <div style={{ 
        height: "60px", 
        margin: "16px 0", 
        background: "#f5f5f5", 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "center",
        border: "1px dashed #d9d9d9" 
      }}>
        <Text type="secondary">Barcode: {data.batchNo}-{data.bagNo}</Text>
      </div>
      
      {/* ข้อมูลลูกค้า */}
      <div style={{ fontSize: "12px", textAlign: "center" }}>
        <Text>Customer: {data.customerName || "-"}</Text>
      </div>
    </div>
  );
};

export default LabelPreview; 