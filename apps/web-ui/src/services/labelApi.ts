import axios from "axios";
export interface LabelDetails {
  BatchNo: string;
  ProductCode: string;
  Description: string;
  NetWeight: number;
  BagNo?: string;
  BagSequence?: number;
  BagPosition?: string;
  BestBefore: string;
  BarcodeImage: string;
  ProductionDate: string;
  BagStart: number;
  BagEnd: number;
  PrintQcSample: boolean;
  PrintFormula: boolean;
  PrintPalletTag: boolean;
}

// ใช้ค่าจาก .env ผ่าน Next.js
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5051/api';
console.log('API URL:', API); // เพิ่ม log เพื่อตรวจสอบค่า

export const getLabelDetails = (batchNo: string, bagNo?: string) => {
  let url = `${API}/labels/${batchNo}`;
  if (bagNo) {
    url += `?bagNo=${bagNo}`;
  }
  return axios.get<LabelDetails>(url).then(r => r.data);
};

export const updateLabel = (batchNo: string, body: any) =>
  axios.put<LabelDetails>(`${API}/labels/${batchNo}`, body).then(r => r.data); 