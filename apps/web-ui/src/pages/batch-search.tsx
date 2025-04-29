import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Button, Table, Input, Space, DatePicker, message } from 'antd';
import { PrinterOutlined, SearchOutlined, ReloadOutlined, LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTranslation } from 'react-i18next';
import Image from "next/image";
import RequireAuth from '../components/RequireAuth';

interface Batch {
  batchNo: string;
  productKey: string | null;
  customerKey: string | null;
  createdAt: string;
}

function BatchSearch() {
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);

  const fetchBatches = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/batches/current');
      setBatches(response.data);
    } catch (error) {
      message.error(t('common.error'));
      console.error('Error fetching batches:', error);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    fetchBatches();
  }, [isAuthenticated, router, fetchBatches]);

  const handlePrint = async (batch: Batch) => {
    setSelectedBatch(batch);
    setShowConfirmDialog(true);
  };

  const handleConfirmPrint = async () => {
    if (!selectedBatch) return;

    try {
      setLoading(true);
      // Auto-create template
      await api.post('/api/templates/auto-create', {
        productKey: selectedBatch.productKey,
        customerKey: selectedBatch.customerKey
      });

      // Create print job
      await api.post('/api/jobs', {
        batchNo: selectedBatch.batchNo,
        copies: 1
      });

      message.success(t('batchSearch.print.success'));
    } catch (error) {
      message.error(t('batchSearch.print.error'));
      console.error('Error creating print job:', error);
    } finally {
      setLoading(false);
      setShowConfirmDialog(false);
      setSelectedBatch(null);
    }
  };

  const filteredBatches = batches.filter(batch => {
    const matchesSearch = searchText === '' || 
      batch.batchNo.toLowerCase().includes(searchText.toLowerCase()) ||
      (batch.productKey?.toLowerCase().includes(searchText.toLowerCase())) ||
      (batch.customerKey?.toLowerCase().includes(searchText.toLowerCase()));

    const batchDate = new Date(batch.createdAt);
    const matchesDateRange = (!dateRange[0] || batchDate >= dateRange[0]) &&
      (!dateRange[1] || batchDate <= dateRange[1]);

    return matchesSearch && matchesDateRange;
  });

  const columns = [
    {
      title: t('batchSearch.columns.batchNo'),
      dataIndex: 'batchNo',
      key: 'batchNo',
      sorter: (a: Batch, b: Batch) => a.batchNo.localeCompare(b.batchNo),
    },
    {
      title: t('batchSearch.columns.product'),
      dataIndex: 'productKey',
      key: 'productKey',
      sorter: (a: Batch, b: Batch) => (a.productKey || '').localeCompare(b.productKey || ''),
    },
    {
      title: t('batchSearch.columns.customer'),
      dataIndex: 'customerKey',
      key: 'customerKey',
      sorter: (a: Batch, b: Batch) => (a.customerKey || '').localeCompare(b.customerKey || ''),
    },
    {
      title: t('batchSearch.columns.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString(),
      sorter: (a: Batch, b: Batch) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    },
    {
      title: t('batchSearch.columns.action'),
      key: 'action',
      render: (_: unknown, record: Batch) => (
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          onClick={() => handlePrint(record)}
        >
          Print
        </Button>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <Image
              src="https://img2.pic.in.th/pic/logo14821dedd19c2ad18.png"
              alt="FG Label Logo"
              width={40}
              height={40}
              unoptimized
              className="h-10 w-auto mr-4"
              priority
              style={{ width: 'auto', height: 'auto' }}
            />
            <h1 className="text-xl font-bold text-gray-900">FG Label Management System</h1>
          </div>
          <Button 
            type="text" 
            icon={<LogoutOutlined />} 
            onClick={logout}
            className="text-gray-600 hover:text-red-500"
          >
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">{t('batchSearch.title')}</h2>
            <Space className="mb-4">
              <Input
                placeholder={t('batchSearch.search')}
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{ width: 300 }}
                className="rounded-md"
              />
              <DatePicker.RangePicker
                onChange={(dates) => setDateRange(dates as [Date | null, Date | null])}
                className="rounded-md"
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchBatches}
                loading={loading}
                className="rounded-md"
              >
                {t('batchSearch.refresh')}
              </Button>
            </Space>
          </div>

          <Table
            dataSource={filteredBatches}
            columns={columns}
            rowKey="batchNo"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => t('batchSearch.pagination.total', { total }),
            }}
            className="rounded-md"
          />
        </div>
      </main>

      <ConfirmDialog
        isOpen={showConfirmDialog}
        title={t('batchSearch.print.title')}
        message={t('batchSearch.print.message', { batchNo: selectedBatch?.batchNo })}
        onConfirm={handleConfirmPrint}
        onCancel={() => {
          setShowConfirmDialog(false);
          setSelectedBatch(null);
        }}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
      />
    </div>
  );
}

const GuardedBatchSearch = () => (
  <RequireAuth>
    <BatchSearch />
  </RequireAuth>
);

export default GuardedBatchSearch; 