import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { usePrinter } from "@/hooks/usePrinter";
import api from '@/lib/api';

interface Batch {
  batchNo: string;
  productKey: string;
  customerKey: string;
  productName: string;
  customerName: string;
  quantity: number;
  printDate: string;
  status: string;
}

interface PrinterData {
  printerId: number;
  name: string;
  description?: string;
  location?: string;
  model?: string;
  dpi?: number;
  commandSet: "ZPL" | "ESC/POS" | "RAW" | "PDF";
  isDefault: boolean;
  active: boolean;
}

interface Template {
  templateId: number;
  name: string;
  description?: string;
  content: string;
  active: boolean;
}

const fallbackPrinter: PrinterData = {
  printerId: -1,
  name: '',
  commandSet: 'RAW',
  isDefault: false,
  active: false,
};

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const { printers: printerList, loading: printersLoading } = usePrinter();
  const [batchNo, setBatchNo] = useState("");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [printers, setPrinters] = useState<PrinterData[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterData | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    const fetchPrintersAndTemplates = async () => {
      try {
        const [printersRes, templatesRes] = await Promise.all([
          api.get("/printers"),
          api.get("/templates")
        ]);
        setPrinters(printersRes.data);
        setTemplates(templatesRes.data);
        
        // เลือก printer และ template เริ่มต้น
        const defaultPrinter = printersRes.data.find((p: PrinterData) => p.isDefault);
        if (defaultPrinter) {
          setSelectedPrinter(defaultPrinter);
        }
        
        const defaultTemplate = templatesRes.data.find((t: Template) => t.active);
        if (defaultTemplate) {
          setSelectedTemplate(defaultTemplate);
        }
      } catch (error) {
        console.error("Error fetching printers and templates:", error);
        setError("ไม่สามารถโหลดข้อมูลเครื่องพิมพ์และเทมเพลตได้");
      }
    };

    fetchPrintersAndTemplates();
  }, []);

  const handleSearch = async () => {
    if (!batchNo.trim()) {
      setError("กรุณากรอกเลขที่ Batch");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/batch/${batchNo}`);
      setBatch(response.data);
    } catch (error: unknown) {
      console.error("Error searching batch:", error);
      if (typeof error === 'object' && error !== null && 'response' in error && typeof (error as { response?: { data?: { message?: string } } }).response === 'object') {
        setError((error as { response?: { data?: { message?: string } } }).response?.data?.message || "ไม่พบข้อมูล Batch");
      } else {
        setError("ไม่พบข้อมูล Batch");
      }
      setBatch(null);
    } finally {
      setLoading(false);
    }
  };

  // สร้างฟังก์ชันสำหรับการพิมพ์
  const printDocument = async (content: string) => {
    // ส่งข้อมูลไปที่เครื่องพิมพ์
    console.log(`พิมพ์เอกสาร: ${content}`);
    return true;
  };

  const handlePrint = async () => {
    if (!batch || !selectedPrinter || !selectedTemplate) {
      setError("กรุณาเลือกเครื่องพิมพ์และเทมเพลต");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // ส่งข้อมูลไปยัง API เพื่อบันทึก print job
      const printJobResponse = await api.post("/jobs", {
        batchNo: batch.batchNo,
        productKey: batch.productKey,
        customerKey: batch.customerKey,
        printerId: selectedPrinter.printerId,
        templateId: selectedTemplate.templateId,
        quantity: batch.quantity,
        status: "PENDING"
      });

      // ใช้ printer function เพื่อพิมพ์
      await printDocument(selectedTemplate.content);

      // อัพเดทสถานะ print job เป็น COMPLETED
      await api.put(`/jobs/${printJobResponse.data.jobId}`, {
        status: "COMPLETED"
      });

      setError(null);
    } catch (error: unknown) {
      console.error("Error printing:", error);
      if (typeof error === 'object' && error !== null && 'response' in error && typeof (error as { response?: { data?: { message?: string } } }).response === 'object') {
        setError((error as { response?: { data?: { message?: string } } }).response?.data?.message || "เกิดข้อผิดพลาดในการพิมพ์");
      } else {
        setError("เกิดข้อผิดพลาดในการพิมพ์");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">FG Label Printing System</h1>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-gray-700 mr-4">{user?.username}</span>
              <button
                onClick={() => {
                  localStorage.removeItem("token");
                  router.push("/login");
                }}
                className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="mb-6">
              <label htmlFor="batchNo" className="block text-sm font-medium text-gray-700">
                เลขที่ Batch
              </label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="text"
                  name="batchNo"
                  id="batchNo"
                  value={batchNo}
                  onChange={(e) => setBatchNo(e.target.value)}
                  className="flex-1 min-w-0 block w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="กรอกเลขที่ Batch"
                />
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="ml-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  {loading ? "กำลังค้นหา..." : "ค้นหา"}
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {batch && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">เลือกเครื่องพิมพ์</label>
                    <select
                      value={selectedPrinter?.printerId || ""}
                      onChange={(e) => {
                        const printer = printers.find(p => p.printerId === Number(e.target.value));
                        setSelectedPrinter(printer || null);
                      }}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    >
                      <option value="">เลือกเครื่องพิมพ์</option>
                      {printers.map((printer) => (
                        <option key={printer.printerId} value={printer.printerId}>
                          {printer.name} ({printer.commandSet})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">เลือกเทมเพลต</label>
                    <select
                      value={selectedTemplate?.templateId || ""}
                      onChange={(e) => {
                        const template = templates.find(t => t.templateId === Number(e.target.value));
                        setSelectedTemplate(template || null);
                      }}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    >
                      <option value="">เลือกเทมเพลต</option>
                      {templates.map((template) => (
                        <option key={template.templateId} value={template.templateId}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">ข้อมูล Batch</h3>
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">เลขที่ Batch</dt>
                      <dd className="mt-1 text-sm text-gray-900">{batch.batchNo}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">รหัสสินค้า</dt>
                      <dd className="mt-1 text-sm text-gray-900">{batch.productKey}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">ชื่อสินค้า</dt>
                      <dd className="mt-1 text-sm text-gray-900">{batch.productName}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">รหัสลูกค้า</dt>
                      <dd className="mt-1 text-sm text-gray-900">{batch.customerKey}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">ชื่อลูกค้า</dt>
                      <dd className="mt-1 text-sm text-gray-900">{batch.customerName}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">จำนวน</dt>
                      <dd className="mt-1 text-sm text-gray-900">{batch.quantity}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">วันที่พิมพ์</dt>
                      <dd className="mt-1 text-sm text-gray-900">{batch.printDate}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">สถานะ</dt>
                      <dd className="mt-1 text-sm text-gray-900">{batch.status}</dd>
                    </div>
                  </dl>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handlePrint}
                    disabled={loading || !selectedPrinter || !selectedTemplate}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "กำลังพิมพ์..." : "พิมพ์"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
} 