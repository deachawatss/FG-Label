import { useCallback } from "react";

interface Printer {
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

interface PrintError extends Error {
  code?: string;
  details?: string;
}

export function usePrinter(printer: Printer) {
  return useCallback((content: string) => {
    try {
      if (printer.commandSet === "ZPL") {
        if (typeof window !== "undefined" && (window as { BrowserPrint?: { print: (content: string) => void } }).BrowserPrint) {
          (window as unknown as { BrowserPrint: { print: (content: string) => void } }).BrowserPrint.print(content);
        } else {
          throw new Error("Zebra BrowserPrint bridge not found");
        }
      } else if (printer.commandSet === "ESC/POS") {
        // ใช้ ESC/POS command set
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          throw new Error("ไม่สามารถเปิดหน้าต่างพิมพ์ได้");
        }

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Print Preview - ESC/POS</title>
              <style>
                body { margin: 0; padding: 20px; font-family: monospace; }
                @media print {
                  body { padding: 0; }
                }
              </style>
            </head>
            <body>
              ${content}
            </body>
          </html>
        `);

        printWindow.document.close();
        printWindow.focus();

        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 500);
        };
      } else if (printer.commandSet === "RAW") {
        // ใช้ RAW command set
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          throw new Error("ไม่สามารถเปิดหน้าต่างพิมพ์ได้");
        }

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Print Preview - RAW</title>
              <style>
                body { margin: 0; padding: 20px; font-family: monospace; }
                @media print {
                  body { padding: 0; }
                }
              </style>
            </head>
            <body>
              ${content}
            </body>
          </html>
        `);

        printWindow.document.close();
        printWindow.focus();

        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 500);
        };
      } else {
        // PDF command set
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          throw new Error("ไม่สามารถเปิดหน้าต่างพิมพ์ได้");
        }

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Print Preview - PDF</title>
              <style>
                body { margin: 0; padding: 20px; }
                @media print {
                  body { padding: 0; }
                }
              </style>
            </head>
            <body>
              ${content}
            </body>
          </html>
        `);

        printWindow.document.close();
        printWindow.focus();

        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 500);
        };
      }
    } catch (error) {
      let printError: PrintError;
      if (typeof error === 'object' && error !== null && 'message' in error) {
        printError = error as PrintError;
      } else {
        printError = { name: 'Error', message: String(error) };
      }
      console.error("Print Error:", printError);
      if (printError.code === "POPUP_BLOCKED") {
        alert("กรุณาอนุญาตให้เว็บไซต์เปิดหน้าต่างป๊อปอัพ");
      } else if (printError.message.includes("BrowserPrint")) {
        alert("ไม่พบ Zebra BrowserPrint bridge กรุณาติดตั้ง Zebra Browser Print");
      } else {
        alert(`เกิดข้อผิดพลาดในการพิมพ์: ${printError.message}`);
      }
    }
  }, [printer]);
} 