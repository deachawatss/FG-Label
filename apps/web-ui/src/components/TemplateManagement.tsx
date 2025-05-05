import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, message } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useRouter } from 'next/router';

interface Template {
  templateID: number;
  name: string;
  description: string;
  productKey: string | null;
  customerKey: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export default function TemplateManagement() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('กรุณาเข้าสู่ระบบก่อน');
      }

      const res = await fetch('http://localhost:5051/api/templates', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      console.log('Templates data:', data);
      
      // แปลงชื่อฟิลด์จาก API ให้ตรงกับที่ component คาดหวัง
      const formattedTemplates = data.map((template: any) => ({
        templateID: template.templateID || template.TemplateID,
        name: template.name || template.Name,
        description: template.description || template.Description,
        productKey: template.productKey || template.ProductKey,
        customerKey: template.customerKey || template.CustomerKey,
        version: template.version || template.Version,
        createdAt: template.createdAt || template.CreatedAt,
        updatedAt: template.updatedAt || template.UpdatedAt
      }));
      
      const validTemplates = formattedTemplates.filter((template: any) => typeof template.templateID === 'number');
      setTemplates(validTemplates);
    } catch (err: any) {
      console.error('Error fetching templates:', err);
      message.error(`ไม่สามารถดึงข้อมูล template ได้: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleEdit = (templateId: number) => {
    if (!templateId) {
      message.error('Template ID ไม่ถูกต้อง');
      return;
    }
    router.push(`/templates/designer/${templateId}`);
  };

  const handleDelete = async (templateId: number) => {
    if (!templateId) {
      message.error('Template ID ไม่ถูกต้อง');
      return;
    }

    Modal.confirm({
      title: 'ยืนยันการลบ Template',
      content: 'คุณแน่ใจหรือไม่ที่จะลบ template นี้?',
      okText: 'ลบ',
      okType: 'danger',
      cancelText: 'ยกเลิก',
      onOk: async () => {
        try {
          const token = localStorage.getItem('token');
          if (!token) {
            throw new Error('กรุณาเข้าสู่ระบบก่อน');
          }

          console.log(`Deleting template ID: ${templateId}`);
          const res = await fetch(`http://localhost:5051/api/templates/${templateId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }

          message.success('ลบ template สำเร็จ');
          fetchTemplates();
        } catch (err: any) {
          console.error('Error deleting template:', err);
          message.error(`ไม่สามารถลบ template ได้: ${err.message}`);
        }
      }
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    
    try {
      // แปลงสตริงเวลาให้เป็นวัตถุ Date
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "-"; 
      
      // เปลี่ยนเป็นการใช้ toLocaleString สำหรับการแสดงเวลาท้องถิ่น
      return date.toLocaleString('th-TH', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return "-";
    }
  };
  
  // เพิ่มฟังก์ชันสำหรับแสดงเวอร์ชันในรูปแบบ 1.01, 1.02, etc.
  const formatVersion = (version: number | null) => {
    if (!version && version !== 0) return "-";
    
    try {
      // ตรวจสอบว่าเป็นตัวเลขหรือไม่
      if (isNaN(Number(version))) {
        return String(version);
      }
      
      // แปลงเป็นทศนิยม 2 ตำแหน่ง
      return Number(version).toFixed(2);
    } catch (error) {
      console.error('Error formatting version:', error);
      return String(version);
    }
  };

  const columns = [
    {
      title: 'Template Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => text || '-',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => text || '-',
    },
    {
      title: 'Product Code',
      dataIndex: 'productKey',
      key: 'productKey',
      render: (text: string) => text || '-',
    },
    {
      title: 'Customer Code',
      dataIndex: 'customerKey',
      key: 'customerKey',
      render: (text: string) => text || '-',
    },
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      render: (version: number) => formatVersion(version),
    },
    {
      title: 'Last Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (text: string) => formatDate(text),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Template) => (
        <Space>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record.templateID)}
            disabled={!record.templateID}
          >
            Edit
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.templateID)}
            disabled={!record.templateID}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-xl font-bold text-gray-900">Template Management</h1>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Templates</h2>
            <Button 
              type="primary" 
              onClick={() => router.push('/templates/designer')}
              className="rounded-md"
            >
              Create New Template
            </Button>
          </div>
          
          <Table
            columns={columns}
            dataSource={templates}
            loading={loading}
            rowKey="templateID"
            className="rounded-md"
            pagination={{
              defaultPageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
            }}
            locale={{
              emptyText: 'ไม่มีข้อมูล Template',
            }}
          />
        </div>
      </main>
    </div>
  );
} 