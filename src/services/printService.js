/**
 * Generate an HTML string for a printable bill/invoice.
 * Supports 58mm thermal, 80mm thermal, and A4 paper sizes.
 *
 * Layout structure:
 *   ── Restaurant Identity ──
 *   Bill/Order Info
 *   ── Items Table ──
 *   ── Totals ──
 *   ── Payment ──
 *   ── Footer ──
 */
export function generateBillHtml({
  restaurantName = 'Restaurant',
  address = '',
  phone = '',
  email = '',
  gstNumber = '',
  fssaiNumber = '',
  logo = '',
  receiptFooter = 'Thank You! Visit Again.',

  billNo = '',
  orderNo = '',
  tableNo = '',
  orderType = '',
  customerName = '',
  staffName = '',
  date = new Date(),
  status = '',

  items = [],
  subtotal = 0,
  discount = 0,
  discountType = '',
  discountValue = 0,
  serviceCharge = 0,
  taxAmount = 0,
  roundOff = 0,
  grandTotal = 0,
  paidAmount = 0,
  balanceAmount = 0,
  payments = [],

  currency = '₹',
  paperSize = '80mm' // '58mm' | '80mm' | 'A4'
}) {
  const isThermal = paperSize !== 'A4';
  const is58mm = paperSize === '58mm';
  const pageWidth = is58mm ? '58mm' : isThermal ? '80mm' : '210mm';
  const maxWidth = is58mm ? '50mm' : isThermal ? '72mm' : '170mm';
  const fontSize = is58mm ? '8px' : isThermal ? '9.5px' : '11px';
  const headerSize = is58mm ? '12px' : isThermal ? '14px' : '18px';
  const subHeaderSize = is58mm ? '8px' : isThermal ? '9px' : '11px';
  const padding = is58mm ? '2px 0' : isThermal ? '3px 0' : '4px 0';
  // Ensure restaurant name is never empty — 'Restaurant' is the absolute last fallback
  const effectiveRestaurantName = restaurantName || 'Restaurant';
  const fmt = (val) => `${getCurrencySymbol(currency)}${Number(val || 0).toFixed(2)}`;
  const formattedDate = new Date(date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // ── Cancelled / Refunded stamp ──
  const isCancelled = status === 'CANCELLED';
  const isRefunded = status === 'REFUNDED';
  const stampHtml = isCancelled
    ? '<div class="stamp stamp-cancelled">CANCELLED</div>'
    : isRefunded
      ? '<div class="stamp stamp-refunded">REFUNDED</div>'
      : '';

  // ── Build items table rows ──
  const itemRows = items.map((item, i) => {
    const name = item.menuItem?.name || item.name || 'Item';
    const qty = item.quantity || 1;
    const price = Number(item.price) || 0;
    const total = Number(item.total || (item.price * item.quantity)) || 0;
    const notes = item.notes || '';
    const nameHtml = `${escapeHtml(name)}${notes ? `<br><span class="note">${escapeHtml(notes)}</span>` : ''}`;
    return `
      <tr class="${i % 2 === 1 ? 'alt' : ''}">
        <td class="col-item">${nameHtml}</td>
        <td class="col-qty">${qty}</td>
        <td class="col-rate">${fmt(price)}</td>
        <td class="col-amount">${fmt(total)}</td>
      </tr>`;
  }).join('');

  // ── Totals section ──
  const totalLines = [];
  totalLines.push(`<tr class="row-subtotal"><td class="label">Subtotal</td><td class="val">${fmt(subtotal)}</td></tr>`);
  if (discount > 0) {
    let discountLabel = 'Discount';
    if (discountType === 'PERCENTAGE') {
      discountLabel = `Discount (${Number(discountValue || 0)}%)`;
    } else if (discountType === 'FLAT' && Number(discountValue || 0) > 0) {
      discountLabel = `Discount`; // Value shown in amount column
    }
    totalLines.push(`<tr class="row-discount"><td class="label">${discountLabel}</td><td class="val">-${fmt(discount)}</td></tr>`);
  }
  if (serviceCharge > 0) totalLines.push(`<tr><td class="label">Service Charge</td><td class="val">${fmt(serviceCharge)}</td></tr>`);
  if (taxAmount > 0) {
    totalLines.push(`<tr><td class="label">Tax</td><td class="val">${fmt(taxAmount)}</td></tr>`);
  }
  if (roundOff !== 0) totalLines.push(`<tr><td class="label">Round Off</td><td class="val">${roundOff > 0 ? '+' : ''}${fmt(roundOff)}</td></tr>`);
  totalLines.push(`<tr class="row-grand-total"><td class="label">GRAND TOTAL</td><td class="val">${fmt(grandTotal)}</td></tr>`);

  // ── Payment section ──
  const methodName = (m) => ({ CASH: 'Cash', CARD: 'Card', UPI: 'UPI' }[m] || m || '—');
  const paymentLines = [];
  if (payments && payments.length > 0) {
    payments.forEach((p) => {
      paymentLines.push(`<tr><td class="label">${methodName(p.paymentMethod)}</td><td class="val">${fmt(p.amount)}</td></tr>`);
    });
    if (payments.length > 1) {
      const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      paymentLines.push(`<tr class="row-subtotal"><td class="label">Total Paid</td><td class="val">${fmt(totalPaid)}</td></tr>`);
    }
  } else if (paidAmount > 0) {
    paymentLines.push(`<tr><td class="label">Paid</td><td class="val">${fmt(paidAmount)}</td></tr>`);
  }
  if (balanceAmount > 0) {
    paymentLines.push(`<tr class="row-balance"><td class="label">Balance Due</td><td class="val">${fmt(balanceAmount)}</td></tr>`);
  }

  // ── Logo HTML ──
  const logoHtml = logo
    ? `<img src="${escapeHtml(logo)}" alt="" class="logo" onerror="this.style.display='none'" referrerpolicy="no-referrer">`
    : '';

  // ── Order type display ──
  const typeDisplay = (orderType || '').replace(/_/g, ' ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bill ${billNo}</title>
<style>
  @page { size: ${pageWidth}; margin: ${isThermal ? '2mm' : '10mm'}; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: ${fontSize};
    line-height: 1.45;
    color: #1a1a1a;
    max-width: ${maxWidth};
    margin: 0 auto;
    padding: ${padding};
  }

  /* ── Restaurant Header ── */
  .header { text-align: center; margin-bottom: ${isThermal ? '4px' : '8px'}; }
  .logo { max-width: ${is58mm ? '36px' : isThermal ? '56px' : '90px'}; height: auto; margin: 0 auto ${isThermal ? '3px' : '6px'}; display: block; }
  .restaurant-name {
    font-size: ${headerSize}; font-weight: 800; letter-spacing: 0.5px;
    color: #111; margin-bottom: 2px;
  }
  .restaurant-info {
    font-size: ${subHeaderSize}; color: #555; line-height: 1.4;
    margin-bottom: 1px;
  }

  /* ── Separators ── */
  .sep { border: none; border-top: 1px dashed #aaa; margin: ${isThermal ? '4px 0' : '8px 0'}; }
  .sep-solid { border: none; border-top: 2px solid #333; margin: ${isThermal ? '4px 0' : '8px 0'}; }
  .sep-thin { border: none; border-top: 1px solid #ddd; margin: ${isThermal ? '3px 0' : '6px 0'}; }

  /* ── Bill Info ── */
  .bill-info { margin-bottom: ${isThermal ? '2px' : '4px'}; }
  .info-row {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: ${subHeaderSize}; line-height: 1.6;
  }
  .info-row .lbl { color: #666; }
  .info-row .val { font-weight: 600; color: #111; text-align: right; }
  .title-row {
    text-align: center; font-weight: 800; font-size: ${is58mm ? '9px' : isThermal ? '10px' : '13px'};
    letter-spacing: 1.5px; text-transform: uppercase;
    margin: ${isThermal ? '4px 0' : '8px 0'}; color: #333;
  }

  /* ── Items Table ── */
  .items-table { width: 100%; border-collapse: collapse; font-size: ${fontSize}; }
  .items-table thead th {
    font-weight: 700; font-size: ${is58mm ? '7px' : isThermal ? '8px' : '10px'};
    text-transform: uppercase; letter-spacing: 0.5px; color: #555;
    padding: ${isThermal ? '2px 0' : '4px 0 3px'};
    border-bottom: 1.5px solid #333;
  }
  .items-table thead th.col-item { text-align: left; }
  .items-table thead th.col-qty { text-align: center; width: ${is58mm ? '22px' : isThermal ? '28px' : '40px'}; }
  .items-table thead th.col-rate { text-align: right; width: ${is58mm ? '32px' : isThermal ? '42px' : '60px'}; }
  .items-table thead th.col-amount { text-align: right; width: ${is58mm ? '36px' : isThermal ? '46px' : '65px'}; }
  .items-table tbody td {
    padding: ${isThermal ? '1.5px 0' : '3px 0'};
    vertical-align: top; word-break: break-word;
  }
  .items-table td.col-item { text-align: left; padding-right: ${isThermal ? '2px' : '6px'}; }
  .items-table td.col-qty { text-align: center; font-weight: 600; }
  .items-table td.col-rate { text-align: right; font-family: 'Consolas', 'Courier New', monospace; font-weight: 500; }
  .items-table td.col-amount { text-align: right; font-family: 'Consolas', 'Courier New', monospace; font-weight: 600; }
  .items-table tbody tr.alt td { background-color: #f9fafb; }
  .note { font-style: italic; font-size: ${is58mm ? '6.5px' : isThermal ? '7.5px' : '9px'}; color: #c0392b; }

  /* ── Totals ── */
  .totals-table { width: 100%; border-collapse: collapse; font-size: ${fontSize}; }
  .totals-table td {
    padding: ${isThermal ? '1px 0' : '2px 0'};
  }
  .totals-table td.label { color: #555; }
  .totals-table td.val { text-align: right; font-family: 'Consolas', 'Courier New', monospace; font-weight: 600; }
  .totals-table .row-subtotal td { padding-top: ${isThermal ? '2px' : '4px'}; }
  .totals-table .row-discount td.label { color: #c0392b; }
  .totals-table .row-discount td.val { color: #c0392b; }
  .totals-table .row-grand-total td {
    font-weight: 800; font-size: ${is58mm ? '9px' : isThermal ? '10.5px' : '14px'};
    padding: ${isThermal ? '3px 0' : '6px 0'};
    border-top: 2.5px solid #222; border-bottom: 1px solid #222;
    color: #111; letter-spacing: 0.5px;
  }
  .totals-table .row-grand-total td.val {
    font-size: ${is58mm ? '9.5px' : isThermal ? '11px' : '15px'};
    color: #16A34A;
  }
  .totals-table .row-balance td { color: #e67e22; font-weight: 700; }

  /* ── Payment Section ── */
  .payment-table { width: 100%; border-collapse: collapse; font-size: ${fontSize}; }
  .payment-table td {
    padding: ${isThermal ? '1px 0' : '2px 0'};
  }
  .payment-table td.label { color: #555; }
  .payment-table td.val { text-align: right; font-family: 'Consolas', 'Courier New', monospace; font-weight: 600; }
  .payment-table .row-subtotal td { font-weight: 700; }

  /* ── Cancelled / Refunded Stamp ── */
  .stamp {
    position: relative; text-align: center; margin: ${isThermal ? '6px 0' : '12px 0'};
    padding: ${isThermal ? '4px' : '8px'};
    font-weight: 900; letter-spacing: 3px; text-transform: uppercase;
    border: 3px solid; border-radius: ${isThermal ? '3px' : '6px'};
    font-size: ${is58mm ? '10px' : isThermal ? '12px' : '18px'};
  }
  .stamp-cancelled { color: #e74c3c; border-color: #e74c3c; background: #fdf2f2; }
  .stamp-refunded { color: #e67e22; border-color: #e67e22; background: #fef9f0; }

  /* ── Footer ── */
  .footer {
    text-align: center; margin-top: ${isThermal ? '6px' : '14px'};
    padding-top: ${isThermal ? '4px' : '8px'};
  }
  .footer-msg {
    font-weight: 700; font-size: ${is58mm ? '7.5px' : isThermal ? '9px' : '11px'};
    margin-bottom: ${isThermal ? '2px' : '4px'};
  }
  .footer-info {
    font-size: ${is58mm ? '6px' : isThermal ? '7px' : '8px'}; color: #999;
    margin-bottom: 1px;
  }

  /* ── Print ── */
  @media print {
    body { max-width: 100%; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <!-- Restaurant Identity -->
  <div class="header">
    ${logoHtml}
    <div class="restaurant-name">${escapeHtml(effectiveRestaurantName)}</div>
    ${address ? `<div class="restaurant-info">${escapeHtml(address)}</div>` : ''}
    ${phone ? `<div class="restaurant-info">${escapeHtml(phone)}</div>` : ''}
    ${email ? `<div class="restaurant-info">${escapeHtml(email)}</div>` : ''}
    ${gstNumber ? `<div class="restaurant-info">GSTIN: ${escapeHtml(gstNumber)}</div>` : ''}
    ${fssaiNumber ? `<div class="restaurant-info">FSSAI: ${escapeHtml(fssaiNumber)}</div>` : ''}
  </div>

  <hr class="sep-solid">
  <div class="title-row">Tax Invoice</div>
  <hr class="sep">

  <!-- Bill Info -->
  <div class="bill-info">
    <div class="info-row"><span class="lbl">Bill No</span><span class="val">${escapeHtml(billNo)}</span></div>
    ${orderNo ? `<div class="info-row"><span class="lbl">Order No</span><span class="val">${escapeHtml(orderNo)}</span></div>` : ''}
    <div class="info-row"><span class="lbl">Date</span><span class="val">${formattedDate}</span></div>
    ${typeDisplay ? `<div class="info-row"><span class="lbl">Type</span><span class="val">${escapeHtml(typeDisplay)}</span></div>` : ''}
    ${tableNo ? `<div class="info-row"><span class="lbl">Table</span><span class="val">${escapeHtml(tableNo)}</span></div>` : ''}
    ${customerName ? `<div class="info-row"><span class="lbl">Customer</span><span class="val">${escapeHtml(customerName)}</span></div>` : ''}
    ${staffName ? `<div class="info-row"><span class="lbl">Staff</span><span class="val">${escapeHtml(staffName)}</span></div>` : ''}
  </div>

  <hr class="sep">

  <!-- Items -->
  <table class="items-table">
    <thead>
      <tr>
        <th class="col-item">Item</th>
        <th class="col-qty">Qty</th>
        <th class="col-rate">Rate</th>
        <th class="col-amount">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <hr class="sep">

  <!-- Totals -->
  <table class="totals-table"><tbody>${totalLines.join('')}</tbody></table>

  <!-- Payment -->
  ${paymentLines.length > 0 ? `
    <hr class="sep-thin">
    <table class="payment-table"><tbody>${paymentLines.join('')}</tbody></table>
  ` : ''}

  <!-- Cancelled/Refunded Stamp -->
  ${stampHtml}

  <hr class="sep-solid">

  <!-- Footer -->
  <div class="footer">
    <div class="footer-msg">${escapeHtml(receiptFooter)}</div>
    <div class="footer-info">Powered by Nirka POS</div>
  </div>
</body>
</html>`;
}

/** Return the currency symbol used in bills */
function getCurrencySymbol(currency) { return currency || '₹'; }

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalize bill data from various response shapes into a consistent structure
 * for the bill HTML generator. Ensures no undefined/null crashes.
 */
function normalizeBillPrintData(raw) {
  if (!raw) return {};

  // Unwrap if nested under { bill, payments, ... }
  const bill = raw.billNo ? raw : (raw.bill || raw || {});
  const order = bill.order || raw.order || {};
  const orderItems = order.orderItems || raw.items || bill.items || [];
  const payments = raw.payments || bill.payments || [];
  const customer = order.customer || raw.customer || {};
  const table = order.table || raw.table || {};
  const user = raw.staffName || order.staffName || '';

  // Resolve status (cancelled bills, refunded bills)
  const billStatus = bill.status || '';
  const isCancelled = bill.isCancelled || billStatus === 'CANCELLED';
  const isRefunded = billStatus === 'REFUNDED';
  const status = isCancelled ? 'CANCELLED' : isRefunded ? 'REFUNDED' : '';

  // ── Restaurant identity resolution ──
  // Use explicit null/undefined checks so empty strings from one source
  // don't block a valid value from another source. The caller
  // (openBillPrintPreview) merges these with additional sources.
  const identity = raw.restaurant || {};
  return {
    // Restaurant identity: prefer explicit fields → bill.restaurant → raw fields
    // Empty string '' is preserved (NOT treated as missing) so the caller
    // can distinguish 'explicitly empty' from 'not provided'.
    restaurantName: raw.restaurantName != null ? raw.restaurantName : (identity.restaurantName != null ? identity.restaurantName : ''),
    address: raw.address != null ? raw.address : (identity.address != null ? identity.address : ''),
    phone: raw.phone != null ? raw.phone : (identity.phone != null ? identity.phone : ''),
    email: raw.email != null ? raw.email : (identity.email != null ? identity.email : ''),
    gstNumber: raw.gstNumber != null ? raw.gstNumber : (identity.gstNumber != null ? identity.gstNumber : ''),
    fssaiNumber: raw.fssaiNumber != null ? raw.fssaiNumber : (identity.fssaiNumber != null ? identity.fssaiNumber : ''),
    logo: raw.logo != null ? raw.logo : (identity.logo != null ? identity.logo : ''),
    receiptFooter: raw.receiptFooter != null ? raw.receiptFooter : (identity.receiptFooter != null ? identity.receiptFooter : ''),
    // Bill identifiers
    billNo: bill.billNo || raw.billNo || '',
    orderNo: order.orderNo || raw.orderNo || '',
    tableNo: table.tableNo || raw.tableNo || '',
    orderType: order.orderType || raw.orderType || '',
    customerName: customer.name || raw.customerName || '',
    staffName: user,
    status,
    items: Array.isArray(orderItems) ? orderItems : [],
    subtotal: Number(bill.subtotal ?? raw.subtotal ?? 0),
    discount: Number(bill.discount ?? raw.discount ?? 0),
    discountType: bill.discountType || raw.discountType || '',
    discountValue: bill.discountValue ?? raw.discountValue ?? 0,
    serviceCharge: Number(bill.serviceCharge ?? raw.serviceCharge ?? 0),
    taxAmount: Number(bill.taxAmount ?? raw.taxAmount ?? 0),
    roundOff: Number(bill.roundOff ?? raw.roundOff ?? 0),
    grandTotal: Number(bill.grandTotal ?? raw.grandTotal ?? 0),
    paidAmount: Number(bill.paidAmount ?? raw.paidAmount ?? 0),
    balanceAmount: Number(bill.balanceAmount ?? raw.balanceAmount ?? 0),
    payments,
    date: bill.createdAt || raw.date || new Date(),
  };
}

/**
 * Open a print preview for a bill in a new window.
 * Normalizes the bill data from any response shape so the HTML generator
 * always receives a consistent structure.
 */
export function openBillPrintPreview(billData, paperSizeOrConfig = '80mm') {
  // Support both openBillPrintPreview(data, '80mm') and openBillPrintPreview({...data, paperSize:'80mm'})
  let paperSize = '80mm';
  if (typeof paperSizeOrConfig === 'string') {
    paperSize = paperSizeOrConfig;
  } else if (paperSizeOrConfig && paperSizeOrConfig.paperSize) {
    paperSize = paperSizeOrConfig.paperSize;
  }

  // Extract restaurant identity from the config if provided as second param
  const restaurantConfig = (typeof paperSizeOrConfig === 'object' && paperSizeOrConfig !== null && !paperSizeOrConfig.paperSize) ? paperSizeOrConfig : {};

  // Normalize the bill data
  const normalized = normalizeBillPrintData(billData);

  // ── Resolve restaurant identity with explicit priority chain ──
  // Priority: restaurantConfig (2nd param) > normalized bill data > 'Restaurant' fallback.
  // Use null/undefined checks so empty strings from lower-priority sources
  // don't block a valid value from higher-priority sources.
  const resolve = (field, fallback) => {
    const rcVal = restaurantConfig[field];
    const nrVal = normalized[field];
    if (rcVal != null && rcVal !== '') return rcVal;
    if (nrVal != null && nrVal !== '') return nrVal;
    if (rcVal != null) return rcVal; // explicit empty string from config
    if (nrVal != null) return nrVal; // explicit empty string from bill
    return fallback;
  };

  const html = generateBillHtml({
    // Spread normalized bill data first (items, totals, dates, etc.)
    ...normalized,
    // Restaurant identity: use resolve() to properly handle empty strings
    // Never let an empty string from settings overwrite a valid backend name
    restaurantName: resolve('restaurantName', 'Restaurant'),
    address: resolve('address', ''),
    phone: resolve('phone', ''),
    email: resolve('email', ''),
    gstNumber: resolve('gstNumber', ''),
    fssaiNumber: resolve('fssaiNumber', ''),
    logo: resolve('logo', ''),
    receiptFooter: resolve('receiptFooter', 'Thank You! Visit Again.'),
    paperSize,
  });

  const printWindow = window.open('', '_blank', 'width=600,height=800,scrollbars=yes');
  if (!printWindow) {
    alert('Please allow pop-ups to print the bill.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    try { printWindow.print(); } catch (e) { /* ignore */ }
  }, 300);
}

/**
 * Generate an HTML string for a printable KOT (Kitchen Order Ticket)
 */
export function generateKotHtml({
  restaurantName = 'Restaurant',
  kotNo = '',
  orderNo = '',
  tableNo = '',
  orderType = '',
  waiterName = '',
  customerName = '',
  customerPhone = '',
  guestCount = 1,
  notes = '',
  items = [],
  footer = 'Thank You!',
  date = new Date()
}) {
  const formattedDate = new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
  const formattedTime = new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit'
  });
  const effectiveKotRestaurantName = restaurantName || 'Restaurant';

  const itemRows = items.map((item, i) => {
    const name = item.menuItem?.name || item.name || 'Item';
    const qty = item.quantity || item.qty || 1;
    const notes_text = item.notes || '';
    // Part 18: dietary type flows with the menu item — kitchen staff can spot
    // veg/non-veg at a glance. Resolution order: explicit dietaryType →
    // menuItem.dietaryType → legacy isVeg flag (backward compatible).
    const dietary = item.dietaryType
      || item.menuItem?.dietaryType
      || (item.isVeg === true || item.menuItem?.isVeg === true ? 'VEG'
        : item.isVeg === false || item.menuItem?.isVeg === false ? 'NON_VEG'
        : null);
    const dietaryTag = dietary
      ? `<small class="dietary ${dietary === 'VEG' ? 'dietary-veg' : 'dietary-nonveg'}">● ${dietary === 'VEG' ? 'VEG' : 'NON-VEG'}</small>`
      : '';
    return `
      <tr${i % 2 === 1 ? ' class="alt"' : ''}>
        <td class="qty">${qty}x</td>
        <td class="item">${escapeHtml(name)}${dietaryTag}${notes_text ? `<br><small class="note">📝 ${escapeHtml(notes_text)}</small>` : ''}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KOT ${kotNo || orderNo}</title>
<style>
  @page { size: 80mm; margin: 3mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    width: 74mm;
    margin: 0 auto;
    padding: 4px 6px;
    font-size: 11px;
    color: #1a1a1a;
  }
  .header { text-align: center; margin-bottom: 6px; }
  .restaurant-name { font-size: 15px; font-weight: bold; margin-bottom: 2px; }
  .kot-title { font-size: 14px; font-weight: bold; margin: 4px 0; color: #C85A32; }
  .info-line { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 1px; }
  .separator { border: none; border-top: 1px dashed #333; margin: 5px 0; }
  .separator-solid { border: none; border-top: 1px solid #333; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { text-align: left; font-weight: bold; padding: 2px 0; border-bottom: 1px solid #333; }
  th.qty, td.qty { text-align: center; width: 28px; }
  td { padding: 1.5px 0; vertical-align: top; }
  tr.alt td { background-color: #f5f5f5; }
  .note { font-style: italic; color: #dc2626; font-size: 9px; }
  .dietary { font-weight: bold; font-size: 8px; }
  .dietary-veg { color: #16a34a; }
  .dietary-nonveg { color: #dc2626; }
  .footer { text-align: center; margin-top: 8px; font-size: 10px; color: #555; }
  .label { font-weight: bold; }
  @media print {
    body { width: 100%; padding: 0; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="restaurant-name">${escapeHtml(effectiveKotRestaurantName)}</div>
    <div class="kot-title">⚡ KITCHEN ORDER TICKET</div>
  </div>
  <hr class="separator-solid">
  <div class="info-line"><span class="label">KOT No:</span><span>${escapeHtml(kotNo || '—')}</span></div>
  <div class="info-line"><span class="label">Order No:</span><span>${escapeHtml(orderNo || '—')}</span></div>
  <div class="info-line"><span class="label">Date:</span><span>${formattedDate} ${formattedTime}</span></div>
  ${tableNo ? `<div class="info-line"><span class="label">Table:</span><span>${escapeHtml(tableNo)}</span></div>` : ''}
  <div class="info-line"><span class="label">Type:</span><span>${escapeHtml(orderType.replace(/_/g, ' '))}</span></div>
  ${waiterName ? `<div class="info-line"><span class="label">Service Staff:</span><span>${escapeHtml(waiterName)}</span></div>` : ''}
  ${customerName ? `<div class="info-line"><span class="label">Customer:</span><span>${escapeHtml(customerName)}${customerPhone ? ` (${customerPhone})` : ''}</span></div>` : ''}
  <div class="info-line"><span class="label">Guests:</span><span>${guestCount}</span></div>
  ${notes ? `<div class="info-line"><span class="label">Notes:</span><span>${escapeHtml(notes)}</span></div>` : ''}
  <hr class="separator">
  <table>
    <thead>
      <tr>
        <th class="qty">QTY</th>
        <th>ITEM</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <hr class="separator">
  <div class="footer">${escapeHtml(footer)}</div>
  <div class="footer" style="font-size: 8px; color: #999;">Generated by Nirka POS</div>
</body>
</html>`;
}

/**
 * Open a print preview for a KOT in a new window
 */
export function openKotPrintPreview(kotData) {
  const html = generateKotHtml(kotData);
  const printWindow = window.open('', '_blank', 'width=400,height=600,scrollbars=yes');
  if (!printWindow) {
    alert('Please allow pop-ups to print the KOT.');
    return;
  }
  // document.write on a just-opened window can race the initial about:blank
  // load (the popup stays blank). Writing after load (or immediately when
  // already ready) guarantees the KOT HTML actually renders.
  const writeKot = () => {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try { printWindow.print(); } catch (e) { /* ignore */ }
    }, 300);
  };
  if (printWindow.document.readyState === 'loading') {
    printWindow.addEventListener('load', writeKot, { once: true });
  } else {
    writeKot();
  }
}

/**
 * Generate an HTML string for a printable report
 */
export function generateReportHtml({
  title = 'Report',
  restaurantName = '',
  dateRange = '',
  generatedAt = new Date(),
  sections = []
}) {
  const formattedGenTime = new Date(generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const sectionHtml = sections.map(section => {
    const rowsHtml = (section.rows || []).map((row, i) => {
      const cells = (row.cells || row).map(cell => `<td>${escapeHtml(String(cell))}</td>`).join('');
      return `<tr${i % 2 === 1 ? ' class="alt"' : ''}>${cells}</tr>`;
    }).join('');

    const headersHtml = (section.headers || []).map(h => `<th>${escapeHtml(String(h))}</th>`).join('');

    return `
      <h3 class="section-title">${escapeHtml(section.title || '')}</h3>
      ${section.summary ? `<div class="section-summary">${section.summary}</div>` : ''}
      <table>
        <thead><tr>${headersHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${section.totalRow ? `<div class="total-row">${section.totalRow}</div>` : ''}
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
    font-size: 11px;
    color: #1a1a1a;
    padding: 20px;
  }
  .header { text-align: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #16A34A; }
  .report-title { font-size: 18px; font-weight: bold; color: #16A34A; }
  .restaurant-name { font-size: 14px; font-weight: bold; color: #333; margin-bottom: 4px; }
  .report-info { display: flex; justify-content: space-between; font-size: 10px; color: #666; margin-top: 4px; }
  .section-title { font-size: 13px; font-weight: bold; margin: 15px 0 6px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .section-summary { font-size: 10px; color: #555; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #f0fdf4; text-align: left; font-weight: bold; padding: 5px 6px; border: 1px solid #d0d5dd; font-size: 9px; text-transform: uppercase; }
  td { padding: 3px 6px; border: 1px solid #e0e4ea; font-size: 10px; }
  tr.alt td { background-color: #f9fafb; }
  .total-row { text-align: right; font-weight: bold; font-size: 12px; padding: 6px 0; border-top: 2px solid #16A34A; margin-top: 4px; }
  .footer { text-align: center; margin-top: 20px; font-size: 8px; color: #999; border-top: 1px solid #eee; padding-top: 8px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
  .kpi-card { border: 1px solid #e0e4ea; border-radius: 6px; padding: 8px; text-align: center; }
  .kpi-label { font-size: 8px; text-transform: uppercase; color: #666; font-weight: bold; }
  .kpi-value { font-size: 16px; font-weight: bold; color: #16A34A; margin: 2px 0; }
  .kpi-sub { font-size: 8px; color: #999; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="header">
    ${restaurantName ? `<div class="restaurant-name">${escapeHtml(restaurantName)}</div>` : ''}
    <div class="report-title">${escapeHtml(title)}</div>
    <div class="report-info">
      <span>${dateRange ? `Period: ${dateRange}` : ''}</span>
      <span>Generated: ${formattedGenTime}</span>
    </div>
  </div>
  ${sectionHtml}
  <div class="footer">Generated by Nirka POS &bull; ${formattedGenTime}</div>
</body>
</html>`;
}

/**
 * Open a print preview for a report in a new window
 */
export function openReportPrintPreview(reportData) {
  const html = generateReportHtml(reportData);
  const printWindow = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
  if (!printWindow) {
    alert('Please allow pop-ups to print the report.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    try { printWindow.print(); } catch (e) { /* ignore */ }
  }, 400);
}

export default {
  generateBillHtml,
  openBillPrintPreview,
  generateKotHtml,
  openKotPrintPreview,
  generateReportHtml,
  openReportPrintPreview
};
