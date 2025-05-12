import axios from "axios";

export interface LabelDetails {
  batchNo: string;
  bagNo: string;
  bagStart?: number;
  bagEnd?: number;
  totalBags?: number;
  productKey: string;
  productName: string;
  customerKey: string;
  customerName: string;
  lotCode?: string;
  bestBefore?: string;
  productionDate: string;
  expiryDate: string;
  netWeight: string;
  packUnit1?: string;
  packSize1?: string;
  packUnit2?: string;
  packSize2?: string;
  allergen1?: string;
  allergen2?: string;
  allergen3?: string;
  storageCondition?: string;
  qcSample?: boolean;
  formulaSheet?: boolean;
  palletTag?: boolean;
}

export const getLabelDetails = (bn: string) =>
  axios.get<LabelDetails>(`/api/labels/${bn}`).then(r => r.data);

export const updateLabel = (bn: string, body: any) =>
  axios.put<LabelDetails>(`/api/labels/${bn}`, body).then(r => r.data); 