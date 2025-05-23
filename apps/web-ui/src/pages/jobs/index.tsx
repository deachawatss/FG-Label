import React, { useState, useEffect } from 'react';
import axios from 'axios';
import RequireAuth from '../../components/RequireAuth'; // Assuming RequireAuth is in components

// Define PrintJob interface
interface PrintJob {
  PrintJobID: number;
  BatchNo: string;
  BagNo: string | null;
  StartBagNo: string | null; // Changed from number to string to match backend output from previous task
  EndBagNo: string | null;   // Changed from number to string to match backend output from previous task
  TotalBags: number | null;
  TemplateID: number | null;
  PrinterID: number | null;
  ItemKey: string | null;
  CustKey: string | null;
  ShipToCountry: string | null;
  PrintQuantity: number;
  PrinterName: string | null;
  PrintStatus: string;
  ErrorMessage: string | null;
  PrintData: string | null;
  RequestedByUsername: string | null; // Or UserID if that's what's returned
  RequestedDate: string;
  CompletedDate: string | null;
  PrintedAt: string | null; // Keep this as it was in the backend response for GET /api/print-log
}

// Minimal ApiHelper for jobs/index.tsx
const getApiBaseUrl = (): string => {
  let baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5051';
  if (baseUrl.endsWith('/api')) {
    baseUrl = baseUrl.slice(0, -4);
  }
  return `${baseUrl}/api`;
};

const getAuthHeaders = (): Record<string, string> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// Helper to format date string
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    // More robust check for invalid date
    if (isNaN(date.getTime()) || date.getFullYear() < 1900) return '-';
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    console.error("Error formatting date:", dateString, e);
    return dateString; // return original if formatting fails
  }
};


function JobsPageContent() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(`${getApiBaseUrl()}/print-log`, {
          headers: getAuthHeaders(),
        });
        setJobs(response.data);
      } catch (err: any) {
        console.error("Error fetching print jobs:", err);
        setError(err.message || "Failed to fetch print jobs. Please ensure you are logged in and the API is reachable.");
        if (err.response?.status === 401) {
           // Basic redirect if unauthorized, consider using router if available
           if (typeof window !== 'undefined') window.location.href = '/login';
        }
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, []);

  return (
    <main className="max-w-7xl mx-auto mt-10 p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Print Job History</h1>
      
      {loading && <p className="text-center text-gray-600">Loading print jobs...</p>}
      {error && <p className="text-center text-red-500 bg-red-100 p-3 rounded-md">{error}</p>}
      
      {!loading && !error && jobs.length === 0 && (
        <p className="text-center text-gray-600">No print jobs found.</p>
      )}

      {!loading && !error && jobs.length > 0 && (
        <div className="overflow-x-auto shadow-lg rounded-lg">
          <table className="min-w-full bg-white border border-gray-200">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Job ID</th>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Batch No</th>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Requested By</th>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Requested Date</th>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Status</th>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Item Key</th>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Cust Key</th>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Country</th>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Qty</th>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Bag Range / Info</th>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Printer</th>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Printed At</th>
                <th className="border-b px-4 py-3 text-left text-sm font-semibold">Error</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              {jobs.map(job => (
                <tr key={job.PrintJobID} className="hover:bg-gray-50 transition-colors duration-150">
                  <td className="border-b px-4 py-3 text-sm">{job.PrintJobID}</td>
                  <td className="border-b px-4 py-3 text-sm font-medium text-blue-600">{job.BatchNo}</td>
                  <td className="border-b px-4 py-3 text-sm">{job.RequestedByUsername || '-'}</td>
                  <td className="border-b px-4 py-3 text-sm">{formatDate(job.RequestedDate)}</td>
                  <td className="border-b px-4 py-3 text-sm">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      job.PrintStatus === 'printed' || job.PrintStatus === 'completed' ? 'bg-green-100 text-green-700' :
                      job.PrintStatus === 'queued' || job.PrintStatus === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
                      job.PrintStatus === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {job.PrintStatus}
                    </span>
                  </td>
                  <td className="border-b px-4 py-3 text-sm">{job.ItemKey || '-'}</td>
                  <td className="border-b px-4 py-3 text-sm">{job.CustKey || '-'}</td>
                  <td className="border-b px-4 py-3 text-sm">{job.ShipToCountry || '-'}</td>
                  <td className="border-b px-4 py-3 text-sm">{job.PrintQuantity}</td>
                  <td className="border-b px-4 py-3 text-sm">
                    {job.StartBagNo && job.EndBagNo ? `${job.StartBagNo} - ${job.EndBagNo}` : job.BagNo || '-'}
                  </td>
                  <td className="border-b px-4 py-3 text-sm">{job.PrinterName || '-'}</td>
                  <td className="border-b px-4 py-3 text-sm">{formatDate(job.PrintedAt || job.CompletedDate)}</td>
                  <td className="border-b px-4 py-3 text-sm text-red-500">{job.ErrorMessage || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

// Wrap JobsPageContent with RequireAuth for protected routing
export default function JobsPage() {
  return (
    <RequireAuth>
      <JobsPageContent />
    </RequireAuth>
  );
}