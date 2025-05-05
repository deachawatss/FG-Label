import { create } from 'zustand';
import type { StateCreator } from 'zustand';
import api from '@/lib/api';

export interface LabelTemplateComponent {
  ComponentID: number;
  TemplateID: number;
  ComponentType: 'text' | 'barcode' | 'qr' | 'image';
  X: number;
  Y: number;
  W?: number;
  H?: number;
  FontName: string;
  FontSize?: number;
  Placeholder: string;
  StaticText: string;
  BarcodeFormat: string;
  CreatedAt: string;
}

export interface LabelTemplate {
  TemplateID: number;
  Name: string;
  Description: string;
  Engine: string;
  PaperSize: string;
  Orientation: string;
  Content: string;
  Version: number;
  Active: boolean;
  Components: LabelTemplateComponent[];
  CreatedAt: string;
  UpdatedAt: string;
}

export interface LabelTemplateMapping {
  MappingID: number;
  TemplateID: number;
  ProductKey?: string;
  CustomerKey?: string;
  Priority: number;
  Active: boolean;
  CreatedAt: string;
}

interface TemplateStore {
  templates: LabelTemplate[];
  selectedTemplate: LabelTemplate | null;
  loading: boolean;
  error: string | null;
  fetchTemplates: () => Promise<void>;
  fetchStarterTemplates: () => Promise<void>;
  createTemplate: (template: Omit<LabelTemplate, 'TemplateID' | 'CreatedAt' | 'UpdatedAt'>) => Promise<void>;
  updateTemplate: (templateId: number, template: Partial<LabelTemplate>) => Promise<void>;
  deleteTemplate: (templateId: number) => Promise<void>;
  selectTemplate: (template: LabelTemplate | null) => void;
  mapTemplate: (templateId: number, productKey: string, customerKey: string) => Promise<void>;
  printLabel: (data: any) => Promise<void>;
}

const createTemplateStore: StateCreator<TemplateStore> = (set) => ({
  templates: [],
  selectedTemplate: null,
  loading: false,
  error: null,

  fetchTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/api/templates');
      set({ templates: response.data, loading: false });
    } catch (err) {
      set({ error: 'Failed to fetch templates', loading: false });
    }
  },

  fetchStarterTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/api/templates/starters');
      set({ templates: response.data, loading: false });
    } catch (err) {
      set({ error: 'Failed to fetch starter templates', loading: false });
    }
  },

  createTemplate: async (template) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/api/templates', template);
      set((state) => ({
        templates: [...state.templates, response.data],
        loading: false
      }));
    } catch (err) {
      set({ error: 'Failed to create template', loading: false });
    }
  },

  updateTemplate: async (templateId, template) => {
    set({ loading: true, error: null });
    try {
      const response = await api.put(`/api/templates/${templateId}`, template);
      set((state) => ({
        templates: state.templates.map((t) =>
          t.TemplateID === templateId ? { ...t, ...response.data } : t
        ),
        loading: false
      }));
    } catch (err) {
      set({ error: 'Failed to update template', loading: false });
    }
  },

  deleteTemplate: async (templateId) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/api/templates/${templateId}`);
      set((state) => ({
        templates: state.templates.filter((t) => t.TemplateID !== templateId),
        loading: false
      }));
    } catch (err) {
      set({ error: 'Failed to delete template', loading: false });
    }
  },

  selectTemplate: (template) => {
    set({ selectedTemplate: template });
  },

  mapTemplate: async (templateId, productKey, customerKey) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/api/templates/${templateId}/map`, {
        ProductKey: productKey,
        CustomerKey: customerKey,
        Priority: 5,
        Active: true,
      });
      set({ loading: false });
    } catch (err) {
      set({ error: 'Failed to map template', loading: false });
    }
  },

  printLabel: async (data) => {
    set({ loading: true, error: null });
    try {
      await api.post('/api/print', data);
      set({ loading: false });
    } catch (err) {
      set({ error: 'Failed to print label', loading: false });
    }
  },
});

const useTemplates = create<TemplateStore>()(createTemplateStore);

export default useTemplates; 