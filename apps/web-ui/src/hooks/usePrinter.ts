import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

export type Printer = {
  id: string;
  name: string;
  status: string;
  printerId?: number;
  commandSet?: string;
  isDefault?: boolean;
  active?: boolean;
};

export function usePrinter() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrinters = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/printers');
      setPrinters(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch printers');
      console.error('Error fetching printers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrinters();
  }, [fetchPrinters]);

  const getPrinterById = useCallback((id: string) => {
    return printers.find(printer => printer.id === id) || null;
  }, [printers]);

  const getPrinterByName = useCallback((name: string) => {
    return printers.find(printer => printer.name === name) || null;
  }, [printers]);

  return { 
    printers, 
    loading, 
    error, 
    fetchPrinters, 
    getPrinterById,
    getPrinterByName 
  };
} 