import React, { useState, useCallback } from 'react';
import { FileText, FileSpreadsheet, Download, ChevronDown } from 'lucide-react';

/**
 * ReportExportBar — Dropdown with PDF / Excel / CSV export options.
 *
 * Usage in a report component:
 *   <ReportExportBar
 *     title="Item-wise Sales"
 *     columns={[{ key: 'itemName', label: 'Item' }, ...]}
 *     data={filteredItems}
 *     dateRange={dateRange}
 *     summaryRow={{ itemName: 'TOTAL', ... }}
 *   />
 */
export default function ReportExportBar({
  title,
  columns,
  data,
  dateRange,
  filename,
  summaryRow,
  kpis,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(null);

  const handleExport = useCallback(async (format) => {
    setOpen(false);
    setExporting(format);
    try {
      // Dynamic import to avoid loading xlsx unless needed
      const svc = await import('../../services/reportExportService');
      const base = { title, columns, data: data || [], dateRange, filename, summaryRow, kpis };

      switch (format) {
        case 'csv':
          svc.exportReportCSV(base);
          break;
        case 'excel':
          svc.exportReportExcel(base);
          break;
        case 'pdf':
          svc.exportReportPDF(base);
          break;
      }
    } catch (err) {
      console.error(`Export ${format} failed:`, err);
      // Show a non-blocking notification instead of crashing
      const msg = `Unable to export ${title} as ${format.toUpperCase()}. Please try again.`;
      if (typeof window !== 'undefined' && window.toast) {
        window.toast(msg, 'error');
      } else {
        alert(msg);
      }
    } finally {
      setExporting(null);
    }
  }, [title, columns, data, dateRange, filename, summaryRow, kpis]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={exporting !== null}
        className={`flex items-center gap-1.5 ${compact ? 'h-7 px-2 text-[9px]' : 'h-8 px-3 text-[10px]'} bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-all disabled:opacity-50`}
      >
        {exporting ? (
          <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        ) : (
          <Download className="w-3 h-3" />
        )}
        <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[140px] animate-fade-in">
            <button onClick={() => handleExport('pdf')}
              className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
              <FileText className="w-3.5 h-3.5 text-red-500" /> PDF
            </button>
            <button onClick={() => handleExport('excel')}
              className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Excel
            </button>
            <button onClick={() => handleExport('csv')}
              className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
              <Download className="w-3.5 h-3.5 text-blue-600" /> CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}
