export interface PrintJob {
  id: number;
  batchNo: string;
  customerName: string;
  address: string;
  items: string[];
  copies: number;
  createdAt: string;
}

export interface PrintJobRequest {
  batchNo: string;
  copies: number;
} 