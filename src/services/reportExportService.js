/**
 * Report Export Service — Professional Branded Design System
 *
 * Generates polished restaurant-management reports for PDF/print, Excel (.xlsx),
 * and CSV formats.  All exports pull restaurant branding from the settings store.
 *
 * Design tokens:
 *   GREEN   #16A34A  (primary accent)
 *   NAVY    #0f172a  (dark text / header)
 *   SLATE   #64748b  (secondary text)
 *   LIGHT   #f8fafc  (alternating rows)
 *   BORDER  #e2e8f0  (dividers)
 */
import * as XLSX from 'xlsx';
import { useSettingsStore } from '../store';

// ═══════════════════════════════════════════════════════════════════════════════
//  BRAND TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

const BRAND = {
  primary:       '#16A34A',
  primaryDark:   '#15803D',
  primaryLight:  '#f0fdf4',
  primaryBorder: '#bbf7d0',
  dark:          '#0f172a',
  navy:          '#1e293b',
  slate:         '#64748b',
  slateMid:      '#94a3b8',
  slateLight:    '#f8fafc',
  border:        '#e2e8f0',
  borderLight:   '#f1f5f9',
  white:         '#ffffff',
  red:           '#dc2626',
  redLight:      '#fee2e2',
  amber:         '#d97706',
  amberLight:    '#fef9c3',
  blue:          '#2563eb',
  blueLight:     '#dbeafe',
  greenText:     '#166534',
  greenBg:       '#dcfce7',
  redText:       '#991b1b',
  amberText:     '#854d0e',
  blueText:      '#1e40af',
};

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function dateStamp(dateRange) {
  if (!dateRange?.end) return new Date().toISOString().split('T')[0];
  return dateRange.end;
}

function slugify(text) {
  return (text || 'Report').replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

function csvEscape(val) {
  const str = String(val == null ? '' : val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatVal(value, column) {
  if (value == null || value === '') return '';
  if (column?.format === 'currency') {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (column?.format === 'number') {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return num.toLocaleString('en-IN');
  }
  return String(value);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RESTAURANT INFO
// ═══════════════════════════════════════════════════════════════════════════════

function getRestaurantInfo() {
  try {
    const state = useSettingsStore.getState();
    const s = state?.settings || {};
    return {
      name: s.branding?.restaurantName || 'Restaurant',
      logo: s.branding?.logo || '',
      address: s.address || '',
      phone: s.contactNumber || '',
      email: s.email || '',
      gstNumber: s.gstNumber || '',
      fssaiNumber: s.fssaiNumber || '',
      city: s.city || '',
      state: s.state || '',
      currency: s.currencySymbol || '₹',
    };
  } catch {
    return {
      name: 'Restaurant', logo: '', address: '', phone: '', email: '',
      gstNumber: '', fssaiNumber: '', city: '', state: '', currency: '₹',
    };
  }
}

function formatDateRange(dateRange) {
  if (!dateRange?.start || !dateRange?.end) return '';
  return `${dateRange.start} — ${dateRange.end}`;
}

function formatGeneratedAt() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STATUS BADGE STYLES
// ═══════════════════════════════════════════════════════════════════════════════

function getStatusStyle(val) {
  const s = String(val || '').toUpperCase();
  switch (s) {
    case 'PAID': case 'COMPLETED': case 'SERVED': case 'READY':
      return `background:${BRAND.greenBg};color:${BRAND.greenText};`;
    case 'PENDING': case 'PREPARING':
      return `background:${BRAND.amberLight};color:${BRAND.amberText};`;
    case 'CANCELLED': case 'REFUNDED':
      return `background:${BRAND.redLight};color:${BRAND.redText};`;
    case 'RESERVED':
      return `background:${BRAND.blueLight};color:${BRAND.blueText};`;
    default:
      return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PDF / PRINT  —  HTML GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the compact logo HTML for the fixed print header (repeated on every page).
 */
function buildCompactLogoHtml(info) {
  if (info.logo) {
    return `<img src="${esc(info.logo)}" alt="" style="height:28px;width:auto;border-radius:4px;vertical-align:middle;" onerror="this.style.display='none'" referrerpolicy="no-referrer">`;
  }
  const initial = (info.name || 'R').charAt(0).toUpperCase();
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:${BRAND.primary};color:white;border-radius:5px;font-size:12px;font-weight:800;vertical-align:middle;">${initial}</span>`;
}

/**
 * Build the full branded header for page 1 (screen + first print page).
 */
function buildFullHeaderHtml(info) {
  const details = [info.address, [info.city, info.state].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  const contactParts = [
    info.phone ? `📞 ${esc(info.phone)}` : '',
    info.email ? `✉ ${esc(info.email)}` : '',
    info.gstNumber ? `GSTIN: ${esc(info.gstNumber)}` : '',
    info.fssaiNumber ? `FSSAI: ${esc(info.fssaiNumber)}` : '',
  ].filter(Boolean).join('  ·  ');

  return `
    <div class="report-header-block">
      <div style="flex-shrink:0;">${buildLogoHtml(info)}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:20px;font-weight:800;color:${BRAND.dark};line-height:1.2;letter-spacing:-0.3px;">${esc(info.name)}</div>
        <div style="font-size:9px;color:${BRAND.slate};margin-top:2px;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;">Nirka POS · Management System</div>
        ${details ? `<div style="font-size:9px;color:${BRAND.slateMid};margin-top:5px;">${esc(details)}</div>` : ''}
        ${contactParts ? `<div style="font-size:9px;color:${BRAND.slateMid};margin-top:2px;">${contactParts}</div>` : ''}
      </div>
    </div>`;
}

function buildLogoHtml(info) {
  if (info.logo) {
    return `<img src="${esc(info.logo)}" alt="Logo" style="height:48px;max-width:100px;object-fit:contain;border-radius:8px;" onerror="this.style.display='none'" referrerpolicy="no-referrer">`;
  }
  const initial = (info.name || 'R').charAt(0).toUpperCase();
  return `<div style="width:48px;height:48px;background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});color:white;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;flex-shrink:0;box-shadow:0 2px 8px rgba(22,163,74,0.3);">${initial}</div>`;
}

function buildTitleHtml(title) {
  return `
    <div class="report-title-bar">
      <div class="report-title-text">${esc(title)}</div>
    </div>`;
}

function buildMetaHtml(dateRange, generatedAt) {
  const parts = [];
  if (dateRange) {
    parts.push(`<span class="meta-item"><span class="meta-label">Period:</span> ${esc(dateRange)}</span>`);
  }
  parts.push(`<span class="meta-item"><span class="meta-label">Generated:</span> ${esc(generatedAt)}</span>`);
  return `<div class="report-meta-bar">${parts.join('')}</div>`;
}

function buildKpiHtml(kpis, currency) {
  if (!kpis || kpis.length === 0) return '';
  const c = currency || '₹';
  const cards = kpis.map(kpi => {
    const rawVal = kpi.value;
    let displayVal;
    if (typeof rawVal === 'number') {
      displayVal = `${c}${rawVal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    } else {
      displayVal = formatVal(rawVal, { format: 'currency' });
      if (typeof rawVal === 'number' && !displayVal.startsWith(c)) {
        displayVal = `${c}${displayVal}`;
      }
    }
    if (typeof rawVal === 'number') {
      displayVal = `${c}${rawVal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }
    return `
      <div class="kpi-card">
        <div class="kpi-label">${esc(kpi.label)}</div>
        <div class="kpi-value">${esc(displayVal)}</div>
      </div>`;
  }).join('');
  return `<div class="kpi-grid">${cards}</div>`;
}

function buildTableHtml(columns, data, summaryRow) {
  const ths = columns.map(c => {
    const isNum = c.format === 'currency' || c.format === 'number';
    return `<th style="${isNum ? 'text-align:right;' : ''}">${esc(c.label)}</th>`;
  }).join('');

  const rows = (data || []).map((row, idx) => {
    const tds = columns.map(c => {
      const val = row[c.key];
      const formatted = formatVal(val, c);
      const isNum = c.format === 'currency' || c.format === 'number';
      const isStatus = (c.key === 'status' || c.label?.toLowerCase() === 'status') && val;
      const statusStyle = isStatus ? getStatusStyle(val) : '';
      let cellContent = esc(formatted || (val != null ? String(val) : '-'));
      if (isStatus && statusStyle) {
        cellContent = `<span class="status-badge" style="${statusStyle}">${cellContent}</span>`;
      }
      return `<td style="${isNum ? 'text-align:right;font-variant-numeric:tabular-nums;' : ''}${isStatus && statusStyle ? 'text-align:center;' : ''}">${cellContent}</td>`;
    }).join('');
    return `<tr class="${idx % 2 === 1 ? 'alt-row' : ''}">${tds}</tr>`;
  }).join('');

  let tfootHtml = '';
  if (summaryRow) {
    const tds = columns.map(c => {
      const val = summaryRow[c.key];
      const formatted = formatVal(val, c);
      const isNum = c.format === 'currency' || c.format === 'number';
      return `<td class="summary-cell" style="${isNum ? 'text-align:right;' : ''}">${esc(formatted || '')}</td>`;
    }).join('');
    tfootHtml = `<tfoot><tr class="summary-row">${tds}</tr></tfoot>`;
  }

  return `
    <table class="report-table">
      <thead><tr>${ths}</tr></thead>
      <tbody>${rows}</tbody>
      ${tfootHtml}
    </table>`;
}

function buildFooterHtml(info, generatedAt) {
  return `
    <div class="report-footer">
      <div class="footer-left">
        <span class="footer-brand">${esc(info.name)}</span>
        <span class="footer-sep">·</span>
        <span>Nirka POS</span>
      </div>
      <div class="footer-right">
        <span>Generated: ${esc(generatedAt)}</span>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PRINT STYLESHEET — A4 Portrait, Fixed Header/Footer, Proper Pagination
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The fixed print header appears on every page.
 * It is compact: logo + restaurant name + report title + date range.
 * Height ~40px, so content gets padding-top to avoid overlap.
 */
function buildFixedPrintHeaderHtml(info, title, dateRange) {
  return `
    <div class="print-fixed-header">
      <div class="print-header-left">
        ${buildCompactLogoHtml(info)}
        <span class="print-header-name">${esc(info.name)}</span>
      </div>
      <div class="print-header-center">
        <span class="print-header-title">${esc(title)}</span>
      </div>
      <div class="print-header-right">
        ${dateRange ? `<span class="print-header-date">${esc(dateRange)}</span>` : ''}
      </div>
    </div>`;
}

/**
 * The fixed print footer appears on every page.
 * Height ~28px, so content gets padding-bottom to avoid overlap.
 */
function buildFixedPrintFooterHtml(info, generatedAt) {
  return `
    <div class="print-fixed-footer">
      <span>${esc(info.name)} · Nirka POS</span>
      <span>Generated: ${esc(generatedAt)}</span>
    </div>`;
}

function getGlobalStyles() {
  return `
    /* ── Page Setup ─────────────────────────────────────────── */
    @page {
      size: A4 portrait;
      margin: 0;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 10px;
      color: ${BRAND.dark};
      padding: 28px 32px;
      background: white;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Header (screen / page 1) ───────────────────────────── */
    .report-header-block {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding-bottom: 14px;
      border-bottom: 2px solid ${BRAND.primary};
    }

    /* ── Title ──────────────────────────────────────────────── */
    .report-title-bar {
      text-align: center;
      padding: 14px 0 10px;
      margin-top: 14px;
      border-bottom: 1px solid ${BRAND.border};
      background: linear-gradient(180deg, ${BRAND.primaryLight} 0%, transparent 100%);
      border-radius: 6px 6px 0 0;
    }
    .report-title-text {
      font-size: 16px;
      font-weight: 800;
      color: ${BRAND.dark};
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    /* ── Meta ───────────────────────────────────────────────── */
    .report-meta-bar {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px 0;
      border-bottom: 1px solid ${BRAND.border};
      font-size: 9px;
      color: #475569;
    }
    .meta-label {
      font-weight: 700;
      color: ${BRAND.slate};
    }

    /* ── KPI Cards ──────────────────────────────────────────── */
    .kpi-grid {
      display: flex;
      gap: 10px;
      margin: 14px 0;
      flex-wrap: wrap;
    }
    .kpi-card {
      border: 1px solid ${BRAND.border};
      border-top: 3px solid ${BRAND.primary};
      border-radius: 6px;
      padding: 10px 14px;
      text-align: center;
      flex: 1;
      min-width: 110px;
      background: ${BRAND.white};
    }
    .kpi-label {
      font-size: 8px;
      text-transform: uppercase;
      color: ${BRAND.slateMid};
      font-weight: 700;
      letter-spacing: 0.6px;
    }
    .kpi-value {
      font-size: 16px;
      font-weight: 800;
      color: ${BRAND.primary};
      margin-top: 4px;
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }

    /* ── Table ──────────────────────────────────────────────── */
    /* Note: border-collapse is overridden to collapse in @media print.
       Separate + border-spacing:0 is used on screen for crisp cell borders;
       collapse is required in print for reliable table-header-group. */
    .report-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 12px 0;
      font-size: 8.5px;
    }
    .report-table thead tr {
      background: ${BRAND.primary};
    }
    .report-table th {
      padding: 8px 10px;
      text-align: left;
      font-weight: 700;
      color: ${BRAND.white};
      border-bottom: 2px solid ${BRAND.primaryDark};
      text-transform: uppercase;
      font-size: 8px;
      letter-spacing: 0.6px;
      white-space: nowrap;
    }
    .report-table td {
      padding: 6px 10px;
      border-bottom: 1px solid ${BRAND.borderLight};
      font-size: 8.5px;
      vertical-align: middle;
    }
    .report-table tr.alt-row td {
      background: ${BRAND.slateLight};
    }
    .report-table tfoot tr {
      background: ${BRAND.primaryLight};
    }
    .report-table .summary-row td {
      border-top: 2px solid ${BRAND.primary};
      border-bottom: 2px solid ${BRAND.primary};
      font-weight: 800;
      background: ${BRAND.primaryLight} !important;
      color: ${BRAND.dark};
      padding: 10px 10px;
      font-size: 9.5px;
    }

    /* ── Status Badge ───────────────────────────────────────── */
    .status-badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 8px;
      display: inline-block;
      white-space: nowrap;
      letter-spacing: 0.3px;
    }

    /* ── Footer (screen) ────────────────────────────────────── */
    .report-footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 2px solid ${BRAND.primary};
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8px;
      color: ${BRAND.slateMid};
    }
    .footer-brand {
      font-weight: 700;
      color: ${BRAND.primary};
    }
    .footer-sep {
      margin: 0 4px;
      color: ${BRAND.border};
    }

    /* ── Fixed print header (hidden on screen) ──────────────── */
    .print-fixed-header {
      display: none;
    }
    .print-fixed-footer {
      display: none;
    }

    /* ── Empty State ────────────────────────────────────────── */
    .empty-message {
      text-align: center;
      padding: 48px 24px;
      color: ${BRAND.slateMid};
      font-style: italic;
      font-size: 11px;
    }

    /* ══════════════════════════════════════════════════════════
       PRINT STYLES — A4 Portrait, Fixed Header/Footer
       ══════════════════════════════════════════════════════════ */
    @media print {
      /* Reset body for print */
      body {
        margin: 0;
        padding: 0;
        font-size: 9px;
        background: white;
      }

      .no-print { display: none !important; }

      /* Hide screen-only elements */
      .report-header-block,
      .report-title-bar,
      .report-meta-bar,
      .report-footer {
        display: none !important;
      }

      /* ── Fixed Header (repeats on every page) ─────────────── */
      .print-fixed-header {
        display: flex !important;
        justify-content: space-between;
        align-items: center;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 36px;
        padding: 0 24px;
        background: ${BRAND.white};
        border-bottom: 2px solid ${BRAND.primary};
        z-index: 1000;
        font-size: 8px;
      }
      .print-header-left {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .print-header-name {
        font-weight: 800;
        font-size: 10px;
        color: ${BRAND.dark};
      }
      .print-header-center {
        flex: 1;
        text-align: center;
      }
      .print-header-title {
        font-weight: 700;
        font-size: 9px;
        color: ${BRAND.primary};
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .print-header-right {
        flex-shrink: 0;
        text-align: right;
      }
      .print-header-date {
        font-size: 8px;
        color: ${BRAND.slate};
      }

      /* ── Fixed Footer (repeats on every page) ─────────────── */
      .print-fixed-footer {
        display: flex !important;
        justify-content: space-between;
        align-items: center;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 24px;
        padding: 0 24px;
        background: ${BRAND.white};
        border-top: 1px solid ${BRAND.border};
        z-index: 1000;
        font-size: 8px;
        color: ${BRAND.slateMid};
      }

      /* ── Content padding to avoid overlap ──────────────────── */
      /* Fixed header is 36px, footer is 24px. Add breathing room. */
      .report-content {
        padding-top: 42px;
        padding-bottom: 30px;
        padding-left: 12px;
        padding-right: 12px;
      }

      /* ── Table pagination ──────────────────────────────────── */
      /* Explicit display types ensure Chrome's print engine recognises
         the table structure and repeats <thead> on every continuation page.
         border-collapse:collapse is critical — separate can silently break
         table-header-group in Blink's print layout. */
      .report-table {
        display: table;
        width: 100%;
        border-collapse: collapse;
        page-break-inside: auto;
      }
      .report-table thead {
        display: table-header-group;
      }
      .report-table tbody {
        display: table-row-group;
      }
      .report-table tfoot {
        display: table-footer-group;
      }
      .report-table tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .report-table th {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .report-table .summary-row {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      /* ── KPI cards: prevent orphan page ────────────────────── */
      .kpi-grid {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      /* ── Prevent large empty gaps ──────────────────────────── */
      .report-content {
        page-break-before: auto;
        page-break-after: auto;
      }
    }
  `;
}

/**
 * Generate the complete branded report HTML for PDF/print.
 *
 * Architecture:
 *   - Page 1: full branded header (on-screen), title, meta, KPIs, table
 *   - Every page (print): fixed compact header via position:fixed
 *   - Every page (print): fixed footer via position:fixed
 *   - Table headers repeat via thead { display: table-header-group }
 *   - Content has padding to avoid overlap with fixed header/footer
 */
function generateReportHtml({ title, restaurantInfo, dateRange, generatedAt, kpis, columns, data, summaryRow }) {
  const currency = restaurantInfo.currency || '₹';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — ${esc(restaurantInfo.name)}</title>
  <style>${getGlobalStyles()}</style>
</head>
<body>
  <!-- Fixed print header (visible only in print, position:fixed on every page) -->
  ${buildFixedPrintHeaderHtml(restaurantInfo, title, dateRange)}

  <!-- Fixed print footer (visible only in print, position:fixed on every page) -->
  ${buildFixedPrintFooterHtml(restaurantInfo, generatedAt)}

  <!-- Main report content -->
  <div class="report-content">
    <!-- Page 1: Full branded header (hidden in print, replaced by fixed header) -->
    ${buildFullHeaderHtml(restaurantInfo)}
    ${buildTitleHtml(title)}
    ${buildMetaHtml(dateRange, generatedAt)}
    ${buildKpiHtml(kpis, currency)}

    ${(data && data.length > 0)
      ? buildTableHtml(columns, data, summaryRow)
      : '<div class="empty-message">No data available for the selected period.</div>'
    }

    <!-- Screen-only footer (hidden in print, replaced by fixed footer) -->
    ${buildFooterHtml(restaurantInfo, generatedAt)}
  </div>
</body>
</html>`;
}

function openPrintWindow(html) {
  const printWindow = window.open('', '_blank', 'width=800,height=1000,scrollbars=yes');
  if (!printWindow) {
    alert('Please allow pop-ups to print the report. You can enable pop-ups for this site in your browser settings.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    try { printWindow.print(); } catch (e) { /* browser may block auto-print */ }
  }, 500);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORT:  CSV
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Export report data as CSV with restaurant branding metadata.
 */
export function exportReportCSV({ title, columns, data, dateRange, filename, summaryRow }) {
  const name = filename || slugify(title);
  const date = dateStamp(dateRange);
  const fullName = `${name}-${date}.csv`;
  const info = getRestaurantInfo();
  const generatedAt = formatGeneratedAt();

  const lines = [];

  // ── Metadata header ──
  lines.push(csvEscape(info.name));
  if (info.address || info.city) lines.push(csvEscape([info.address, info.city, info.state].filter(Boolean).join(', ')));
  if (info.phone) lines.push(csvEscape(`Phone: ${info.phone}`));
  if (info.email) lines.push(csvEscape(`Email: ${info.email}`));
  if (info.gstNumber) lines.push(csvEscape(`GSTIN: ${info.gstNumber}`));
  lines.push(`Report: ${csvEscape(title)}`);
  if (dateRange?.start && dateRange?.end) {
    lines.push(`Period: ${dateRange.start} — ${dateRange.end}`);
  }
  lines.push(`Generated: ${csvEscape(generatedAt)}`);
  lines.push(''); // blank separator

  // ── Column headers ──
  lines.push(columns.map(c => csvEscape(c.label)).join(','));

  // ── Data rows ──
  (data || []).forEach(row => {
    lines.push(
      columns.map(c => {
        const val = row[c.key];
        return csvEscape(formatVal(val, c));
      }).join(',')
    );
  });

  // ── Summary row ──
  if (summaryRow) {
    lines.push('');
    lines.push(
      columns.map(c => {
        const val = summaryRow[c.key];
        return csvEscape(val != null ? formatVal(val, c) : '');
      }).join(',')
    );
  }

  const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, fullName);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORT:  EXCEL  (.xlsx)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Export report data as a professionally formatted Excel workbook.
 */
export function exportReportExcel({ title, columns, data, dateRange, filename, summaryRow, kpis }) {
  const name = filename || slugify(title);
  const date = dateStamp(dateRange);
  const fullName = `${name}-${date}.xlsx`;
  const info = getRestaurantInfo();
  const generatedAt = formatGeneratedAt();

  const wb = XLSX.utils.book_new();
  const wsData = [];
  const merges = [];

  const maxCol = Math.max(columns.length - 1, 3);

  // ── Row 0: Restaurant name (green branded) ──
  wsData.push([info.name]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: maxCol } });

  // ── Row 1: Contact info ──
  const contactParts = [info.address, info.city, info.state, info.phone, info.email, info.gstNumber].filter(Boolean);
  wsData.push([contactParts.join(' | ')]);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: maxCol } });

  // ── Row 2: blank ──
  wsData.push([]);

  // ── Row 3: Report title ──
  wsData.push([title.toUpperCase()]);
  merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: maxCol } });

  // ── Row 4+: Period / Generated ──
  let rowIdx = 4;
  if (dateRange?.start && dateRange?.end) {
    wsData.push([`Period: ${dateRange.start} — ${dateRange.end}`]);
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: maxCol } });
    rowIdx++;
  }
  wsData.push([`Generated: ${generatedAt}`]);
  merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: maxCol } });
  rowIdx++;

  // ── Blank ──
  wsData.push([]);
  rowIdx++;

  // ── KPI Summary ──
  if (kpis && kpis.length > 0) {
    kpis.forEach(kpi => {
      wsData.push([kpi.label, typeof kpi.value === 'number' ? kpi.value : formatVal(kpi.value, { format: 'currency' })]);
      rowIdx++;
    });
    wsData.push([]);
    rowIdx++;
  }

  // ── Column headers (green branded) ──
  const headerRowIndex = rowIdx;
  wsData.push(columns.map(c => c.label));
  rowIdx++;

  // ── Data rows ──
  (data || []).forEach(row => {
    wsData.push(columns.map(c => {
      const val = row[c.key];
      if (val == null || val === '') return '';
      if (c.format === 'currency' || c.format === 'number') {
        const num = Number(val);
        return isNaN(num) ? val : num;
      }
      return val;
    }));
    rowIdx++;
  });

  // ── Summary row ──
  if (summaryRow) {
    wsData.push([]);
    rowIdx++;
    wsData.push(columns.map(c => {
      const label = summaryRow[c.key];
      if (label != null && typeof label === 'string' && isNaN(Number(label))) return label;
      const val = summaryRow[c.key];
      if (val == null || val === '') return '';
      if (c.format === 'currency' || c.format === 'number') {
        const num = Number(val);
        return isNaN(num) ? val : num;
      }
      return val;
    }));
    rowIdx++;
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // ── Merges ──
  if (merges.length > 0) ws['!merges'] = merges;

  // ── Column widths (auto-sized) ──
  const colWidths = columns.map(c => {
    let maxLen = c.label.length;
    (data || []).forEach(row => {
      const cellVal = String(row[c.key] ?? '');
      if (cellVal.length > maxLen) maxLen = cellVal.length;
    });
    return { wch: Math.min(Math.max(maxLen + 2, 12), 40) };
  });
  ws['!cols'] = colWidths;

  // ── AutoFilter ──
  const dataRowCount = (data || []).length;
  if (dataRowCount > 0) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: headerRowIndex, c: 0 },
        e: { r: headerRowIndex + dataRowCount, c: columns.length - 1 },
      }),
    };
  }

  // ── Freeze panes (freeze header row) ──
  ws['!freeze'] = { xSplit: 0, ySplit: headerRowIndex + 1 };

  // ── Apply styling via cell styles (if supported by xlsx community edition) ──
  applyExcelStyles(ws, headerRowIndex, dataRowCount, columns.length, merges);

  XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
  XLSX.writeFile(wb, fullName);
}

/**
 * Apply visual styling to Excel cells.
 */
function applyExcelStyles(ws, headerRowIndex, dataRowCount, colCount, merges) {
  const GREEN_BG  = { fgColor: { rgb: '16A34A' } };
  const GREEN_BD  = { top: { style: 'thin', color: { rgb: '15803D' } }, bottom: { style: 'thin', color: { rgb: '15803D' } }, left: { style: 'thin', color: { rgb: 'BBF7D0' } }, right: { style: 'thin', color: { rgb: 'BBF7D0' } } };
  const LIGHT_BG  = { fgColor: { rgb: 'F8FAFC' } };
  const THIN_BORDER = { top: { style: 'thin', color: { rgb: 'E2E8F0' } }, bottom: { style: 'thin', color: { rgb: 'E2E8F0' } }, left: { style: 'thin', color: { rgb: 'E2E8F0' } }, right: { style: 'thin', color: { rgb: 'E2E8F0' } } };
  const SUMMARY_STYLE = { fgColor: { rgb: 'F0FDF4' }, border: { top: { style: 'medium', color: { rgb: '16A34A' } }, bottom: { style: 'medium', color: { rgb: '16A34A' } }, left: { style: 'thin', color: { rgb: 'BBF7D0' } }, right: { style: 'thin', color: { rgb: 'BBF7D0' } } } };

  // Row 0: Restaurant name
  for (let c = 0; c <= Math.max(colCount - 1, 3); c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 }, fill: GREEN_BG, alignment: { horizontal: 'left', vertical: 'center' } };
  }

  // Row 1: Contact
  for (let c = 0; c <= Math.max(colCount - 1, 3); c++) {
    const addr = XLSX.utils.encode_cell({ r: 1, c });
    if (ws[addr]) ws[addr].s = { font: { color: { rgb: '64748B' }, sz: 9 }, alignment: { horizontal: 'left' } };
  }

  // Row 3: Title
  for (let c = 0; c <= Math.max(colCount - 1, 3); c++) {
    const addr = XLSX.utils.encode_cell({ r: 3, c });
    if (ws[addr]) ws[addr].s = { font: { bold: true, color: { rgb: '0F172A' }, sz: 13 }, alignment: { horizontal: 'center' } };
  }

  // Header row
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRowIndex, c });
    if (ws[addr]) ws[addr].s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: GREEN_BG, border: GREEN_BD, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
  }

  // Data rows
  for (let r = headerRowIndex + 1; r < headerRowIndex + 1 + dataRowCount; r++) {
    const isAlt = (r - headerRowIndex - 1) % 2 === 1;
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr]) {
        const baseStyle = { border: THIN_BORDER };
        if (isAlt) baseStyle.fill = LIGHT_BG;
        ws[addr].s = { ...baseStyle, alignment: { horizontal: 'right', vertical: 'center' } };
      }
    }
  }

  // Summary row
  const summaryRowIndex = headerRowIndex + 1 + dataRowCount + 1;
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: summaryRowIndex, c });
    if (ws[addr]) {
      ws[addr].s = { font: { bold: true, sz: 10 }, fill: SUMMARY_STYLE.fgColor ? { fgColor: SUMMARY_STYLE.fgColor } : undefined, border: SUMMARY_STYLE.border, alignment: { horizontal: 'right', vertical: 'center' } };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORT:  PDF  (via browser print dialog)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Export report data as a professionally branded PDF (via browser print dialog).
 */
export function exportReportPDF({ title, columns, data, dateRange, summaryRow, kpis }) {
  const restaurantInfo = getRestaurantInfo();
  const dateRangeStr = formatDateRange(dateRange);
  const generatedAt = formatGeneratedAt();

  const html = generateReportHtml({
    title,
    restaurantInfo,
    dateRange: dateRangeStr,
    generatedAt,
    kpis,
    columns,
    data,
    summaryRow,
  });

  openPrintWindow(html);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BACKWARD COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert tabular data into sections format for PDF/Print export.
 */
export function buildPdfSections({ title, columns, data, summaryRow, kpis }) {
  const sections = [];
  if (kpis && kpis.length > 0) {
    sections.push({
      title: 'Summary',
      headers: ['Metric', 'Value'],
      rows: kpis.map(k => ({ cells: [k.label, formatVal(k.value, { format: 'currency' })] })),
    });
  }
  const headers = columns.map(c => c.label);
  const rows = (data || []).map(row => columns.map(c => formatVal(row[c.key], c)));
  if (summaryRow) {
    rows.push(columns.map(c => {
      const val = summaryRow[c.key];
      return val != null ? formatVal(val, c) : '';
    }));
  }
  sections.push({ title, headers, rows: rows.map(cells => ({ cells })) });
  return sections;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  exportReportCSV,
  exportReportExcel,
  exportReportPDF,
  buildPdfSections,
};
