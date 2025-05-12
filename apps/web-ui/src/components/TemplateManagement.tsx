import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, message, Tag, Tooltip, Typography, Input } from 'antd';
import { EditOutlined, DeleteOutlined, FileTextOutlined, CopyOutlined, PrinterOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useRouter } from 'next/router';

const { Title, Text } = Typography;

interface Template {
  id: number;
  name: string;
  description: string;
  productKey: string;
  customerKey: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  paperSize: string;
  orientation: string;
  templateType: string;
  engine: string;
}

export default function TemplateManagement() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const router = useRouter();

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Please login first');
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
      
      // Transform field names from API to match component expectations
      const formattedTemplates = data.map((template: any) => ({
        id: template.id || template.ID,
        name: template.name || template.Name,
        description: template.description || template.Description || '',
        productKey: template.productKey || template.ProductKey || '',
        customerKey: template.customerKey || template.CustomerKey || '',
        version: template.version || template.Version || 1,
        createdAt: template.createdAt || template.CreatedAt,
        updatedAt: template.updatedAt || template.UpdatedAt,
        active: template.active || template.Active,
        paperSize: template.paperSize || template.PaperSize || '4x4',
        orientation: template.orientation || template.Orientation || 'Portrait',
        templateType: template.templateType || template.TemplateType || 'INNER',
        engine: template.engine || template.Engine || 'html'
      }));
      
      const validTemplates = formattedTemplates.filter((template: any) => typeof template.id === 'number');
      setTemplates(validTemplates);
    } catch (err: any) {
      console.error('Error fetching templates:', err);
      message.error(`Unable to fetch templates: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleEdit = (id: number) => {
    if (!id) {
      message.error('Invalid Template ID');
      return;
    }
    router.push(`/template-designer/${id}`);
  };

  const handleClone = (template: Template) => {
    // Create URL with all parameters to send to the designer page
    const params = new URLSearchParams({
      clone: template.id.toString(),
      name: `Copy of ${template.name}`,
      productKey: template.productKey || '',
      customerKey: template.customerKey || '',
      paperSize: template.paperSize || '4x4',
      orientation: template.orientation || 'Portrait',
      templateType: template.templateType || 'INNER'
    });
    
    router.push(`/templates/designer?${params.toString()}`);
  };

  const handleDelete = async (id: number) => {
    if (!id) {
      message.error('Invalid Template ID');
      return;
    }

    Modal.confirm({
      title: 'Confirm Template Deletion',
      content: 'Are you sure you want to delete this template?',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const token = localStorage.getItem('token');
          if (!token) {
            throw new Error('Please login first');
          }

          console.log(`Deleting template ID: ${id}`);
          const res = await fetch(`http://localhost:5051/api/templates/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }

          message.success('Template deleted successfully');
          fetchTemplates();
        } catch (err: any) {
          console.error('Error deleting template:', err);
          message.error(`Cannot delete template: ${err.message}`);
        }
      }
    });
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return '-';
    
    try {
      // Use native JavaScript Date instead of moment-timezone
      const date = new Date(dateString);
      
      // Set time to GMT+7 (Thailand timezone)
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Bangkok'
      };
      
      return new Intl.DateTimeFormat('en-US', options).format(date);
    } catch (error) {
      console.error("Error formatting date:", error);
      return dateString;
    }
  };
  
  const formatVersion = (version: number) => {
    return `v${version.toFixed(1)}`;
  };

  const getPaperSizeDisplayName = (paperSize: string) => {
    switch (paperSize) {
      case '2x3': return '2" × 3"';
      case '4x4': return '4" × 4"';
      case '4x6': return '4" × 6"';
      case 'A4': return 'A4';
      case 'A6': return 'A6';
      case 'OTHER': return 'Custom';
      default: return paperSize;
    }
  };

  const columns = [
    {
      title: 'Template Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Template) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text || 'Untitled'}</Text>
          {record.description && (
            <Text type="secondary" style={{ fontSize: '12px' }}>{record.description}</Text>
          )}
          <Space size={2} style={{ marginTop: 4 }}>
            <Tag color="blue">{formatVersion(record.version)}</Tag>
            <Tag color="purple">{record.engine}</Tag>
            <Tag color="cyan">{getPaperSizeDisplayName(record.paperSize)}</Tag>
            <Tag color="orange">{record.orientation}</Tag>
            <Tag color="green">{record.templateType}</Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: 'Product',
      dataIndex: 'productKey',
      key: 'productKey',
      render: (text: string) => text || '-',
    },
    {
      title: 'Customer',
      dataIndex: 'customerKey',
      key: 'customerKey',
      render: (text: string) => text || '-',
    },
    {
      title: 'Last Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (text: string) => (
        <Tooltip title={`Created: ${formatDate(text)}`}>
          {formatDate(text)}
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Template) => (
        <Space>
          <Tooltip title="Edit Template">
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record.id)}
              disabled={!record.id}
            />
          </Tooltip>
          <Tooltip title="Clone Template">
            <Button
              icon={<CopyOutlined />}
              onClick={() => handleClone(record)}
              disabled={!record.id}
            />
          </Tooltip>
          <Tooltip title="Delete Template">
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record.id)}
              disabled={!record.id}
            />
          </Tooltip>
          <Tooltip title="Print Preview">
            <Button
              icon={<EyeOutlined />}
              onClick={() => router.push(`/templates/preview/${record.id}`)}
              disabled={!record.id}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const filteredTemplates = templates.filter(template => 
    template.name.toLowerCase().includes(searchText.toLowerCase()) ||
    template.description.toLowerCase().includes(searchText.toLowerCase()) ||
    template.productKey.toLowerCase().includes(searchText.toLowerCase()) ||
    template.customerKey.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-xl font-bold text-gray-900">Label Template Management</h1>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Template List</h2>
            <Space>
              <Input
                placeholder="Search Templates"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                prefix={<SearchOutlined />}
                style={{ width: '250px' }}
              />
              <Button 
                type="primary" 
                onClick={() => router.push('/templates/designer')}
                className="rounded-md"
              >
                Create New Template
              </Button>
            </Space>
          </div>
          
          <Table
            columns={columns}
            dataSource={filteredTemplates}
            loading={loading}
            rowKey="id"
            className="rounded-md"
            pagination={{
              defaultPageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
            }}
            locale={{
              emptyText: 'No template data',
            }}
          />
        </div>
      </main>
    </div>
  );
} 