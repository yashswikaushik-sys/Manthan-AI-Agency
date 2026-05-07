'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const WORKSPACE_DIR = path.join(__dirname, '../../workspace');

// Brand colors for Manthan AI Agency
const COLORS = {
  primary: '#6C3CE1',    // Purple
  secondary: '#1A1A2E',  // Dark navy
  accent: '#E91E8C',     // Pink
  text: '#1A1A2E',
  textLight: '#666666',
  border: '#DDDDDD',
  success: '#27AE60',
  white: '#FFFFFF',
  background: '#F8F9FC'
};

function ensureWorkspace() {
  if (!fs.existsSync(WORKSPACE_DIR)) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  }
}

function timestamp() {
  return new Date().toISOString()
    .replace(/[:T]/g, '-')
    .replace(/\..+/, '');
}

function formatCurrency(amount, currency = 'INR') {
  const num = parseFloat(amount) || 0;
  if (currency === 'INR') {
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${currency} ${num.toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return String(dateStr);
  }
}

/**
 * Generate a professional invoice PDF.
 * @param {Object} params
 * @param {Object} params.invoice - Invoice data (invoice_number, amount, due_date, payment_status, etc.)
 * @param {string} params.clientName - Client's display name
 * @param {Array} [params.lineItems] - Array of { description, quantity, rate, amount }
 * @returns {Promise<{path: string, filename: string}>}
 */
async function generateInvoice({ invoice, clientName, lineItems = [] }) {
  if (!invoice) throw new Error('[pdf-generator] invoice data is required');
  if (!clientName) throw new Error('[pdf-generator] clientName is required');

  ensureWorkspace();

  const invoiceNumber = invoice.invoice_number || invoice.invoiceNumber || `INV-${Date.now()}`;
  const safeNumber = String(invoiceNumber).replace(/[/\\?%*:|"<>]/g, '-');
  const filename = `invoice_${safeNumber}_${timestamp()}.pdf`;
  const filePath = path.join(WORKSPACE_DIR, filename);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Invoice ${invoiceNumber}`,
          Author: 'Manthan AI Agency',
          Subject: `Invoice for ${clientName}`
        }
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ─── Header Band ─────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 90).fill(COLORS.secondary);

      // Agency name
      doc.fillColor(COLORS.white)
         .fontSize(22)
         .font('Helvetica-Bold')
         .text('MANTHAN AI AGENCY', 50, 28, { align: 'left' });

      doc.fillColor('#A78BFA')
         .fontSize(10)
         .font('Helvetica')
         .text('AI-Powered Marketing & Growth Solutions', 50, 56, { align: 'left' });

      // INVOICE label on right
      doc.fillColor(COLORS.white)
         .fontSize(32)
         .font('Helvetica-Bold')
         .text('INVOICE', 0, 25, { align: 'right', width: doc.page.width - 50 });

      doc.moveDown(3);

      // ─── Invoice Meta Block ───────────────────────────────────
      const metaTop = 110;
      doc.fillColor(COLORS.text)
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('Invoice Number:', 50, metaTop)
         .font('Helvetica')
         .text(invoiceNumber, 170, metaTop);

      doc.font('Helvetica-Bold')
         .text('Invoice Date:', 50, metaTop + 16)
         .font('Helvetica')
         .text(formatDate(invoice.created_at || new Date().toISOString()), 170, metaTop + 16);

      doc.font('Helvetica-Bold')
         .text('Due Date:', 50, metaTop + 32)
         .font('Helvetica')
         .text(formatDate(invoice.due_date), 170, metaTop + 32);

      doc.font('Helvetica-Bold')
         .text('Status:', 50, metaTop + 48)
         .font('Helvetica')
         .fillColor(invoice.payment_status === 'Paid' ? COLORS.success : COLORS.accent)
         .text(String(invoice.payment_status || 'Pending').toUpperCase(), 170, metaTop + 48)
         .fillColor(COLORS.text);

      // ─── Bill To ─────────────────────────────────────────────
      const billTop = metaTop;
      doc.font('Helvetica-Bold')
         .fontSize(10)
         .text('Bill To:', 320, billTop)
         .font('Helvetica-Bold')
         .fontSize(12)
         .text(clientName, 320, billTop + 16);

      if (invoice.email) {
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor(COLORS.textLight)
           .text(invoice.email, 320, billTop + 34);
      }
      if (invoice.phone) {
        doc.text(invoice.phone, 320, billTop + (invoice.email ? 50 : 34));
      }

      doc.fillColor(COLORS.text);

      // ─── Agency Contact ───────────────────────────────────────
      const agencyInfoTop = metaTop + 80;
      doc.fontSize(9)
         .fillColor(COLORS.textLight)
         .text('Manthan AI Agency', 50, agencyInfoTop)
         .text('yashsingh328@gmail.com', 50, agencyInfoTop + 12)
         .text('India', 50, agencyInfoTop + 24)
         .fillColor(COLORS.text);

      // ─── Divider ──────────────────────────────────────────────
      const tableTop = agencyInfoTop + 55;
      doc.moveTo(50, tableTop - 5)
         .lineTo(doc.page.width - 50, tableTop - 5)
         .strokeColor(COLORS.border)
         .lineWidth(1)
         .stroke();

      // ─── Line Items Table ─────────────────────────────────────
      const colX = { desc: 50, qty: 310, rate: 390, amount: 470 };
      const colW = { desc: 250, qty: 70, rate: 75, amount: 100 };

      // Table header
      doc.rect(50, tableTop, doc.page.width - 100, 22).fill(COLORS.primary);
      doc.fillColor(COLORS.white).fontSize(9).font('Helvetica-Bold');
      doc.text('DESCRIPTION', colX.desc + 4, tableTop + 6, { width: colW.desc });
      doc.text('QTY', colX.qty, tableTop + 6, { width: colW.qty, align: 'center' });
      doc.text('RATE', colX.rate, tableTop + 6, { width: colW.rate, align: 'right' });
      doc.text('AMOUNT', colX.amount, tableTop + 6, { width: colW.amount, align: 'right' });

      // Table rows
      let rowY = tableTop + 28;
      let total = 0;
      const currency = invoice.currency || 'INR';

      const effectiveLineItems = lineItems.length > 0
        ? lineItems
        : [{ description: invoice.notes || 'Marketing & Agency Services', quantity: 1, rate: invoice.amount || 0, amount: invoice.amount || 0 }];

      effectiveLineItems.forEach((item, idx) => {
        const rowAmount = parseFloat(item.amount) || parseFloat(item.rate) * parseFloat(item.quantity) || 0;
        total += rowAmount;

        if (idx % 2 === 1) {
          doc.rect(50, rowY - 3, doc.page.width - 100, 20).fill(COLORS.background);
        }

        doc.fillColor(COLORS.text).fontSize(9).font('Helvetica');
        doc.text(String(item.description || ''), colX.desc + 4, rowY, { width: colW.desc - 8 });
        doc.text(String(item.quantity || 1), colX.qty, rowY, { width: colW.qty, align: 'center' });
        doc.text(formatCurrency(item.rate || rowAmount, currency), colX.rate, rowY, { width: colW.rate, align: 'right' });
        doc.text(formatCurrency(rowAmount, currency), colX.amount, rowY, { width: colW.amount, align: 'right' });

        rowY += 22;
      });

      // ─── Totals ────────────────────────────────────────────────
      rowY += 8;
      doc.moveTo(50, rowY).lineTo(doc.page.width - 50, rowY).strokeColor(COLORS.border).lineWidth(0.5).stroke();
      rowY += 8;

      doc.fillColor(COLORS.textLight).fontSize(9).font('Helvetica')
         .text('Subtotal:', colX.rate - 40, rowY, { width: 120, align: 'right' });
      doc.fillColor(COLORS.text)
         .text(formatCurrency(total, currency), colX.amount, rowY, { width: colW.amount, align: 'right' });

      rowY += 16;
      doc.fillColor(COLORS.textLight)
         .text('GST/Tax (0%):', colX.rate - 40, rowY, { width: 120, align: 'right' });
      doc.fillColor(COLORS.text)
         .text(formatCurrency(0, currency), colX.amount, rowY, { width: colW.amount, align: 'right' });

      rowY += 16;
      doc.rect(colX.rate - 45, rowY - 4, colW.rate + colW.amount + 55, 26).fill(COLORS.secondary);
      doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(11)
         .text('TOTAL DUE:', colX.rate - 40, rowY + 4, { width: 120, align: 'right' });
      doc.text(formatCurrency(parseFloat(invoice.amount) || total, currency), colX.amount, rowY + 4, { width: colW.amount, align: 'right' });

      // ─── Payment Instructions ──────────────────────────────────
      rowY += 50;
      doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(10)
         .text('Payment Instructions', 50, rowY);
      rowY += 14;
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.textLight);
      doc.text('UPI: manthan@upi  |  Bank: HDFC Bank  |  Account: Contact for details', 50, rowY);
      rowY += 12;
      doc.text('Please reference invoice number in payment description.', 50, rowY);

      // ─── Notes ────────────────────────────────────────────────
      if (invoice.notes && !lineItems.length) {
        rowY += 24;
        doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(9).text('Notes:', 50, rowY);
        rowY += 12;
        doc.font('Helvetica').fillColor(COLORS.textLight).fontSize(9)
           .text(String(invoice.notes), 50, rowY, { width: doc.page.width - 100 });
      }

      // ─── Footer ───────────────────────────────────────────────
      const footerY = doc.page.height - 60;
      doc.rect(0, footerY, doc.page.width, 60).fill(COLORS.secondary);
      doc.fillColor('#A78BFA').fontSize(8).font('Helvetica')
         .text('Thank you for partnering with Manthan AI Agency. We are committed to delivering excellence.', 50, footerY + 14, { align: 'center', width: doc.page.width - 100 });
      doc.fillColor(COLORS.white).fontSize(8)
         .text('manthan.ai  |  yashsingh328@gmail.com  |  India', 50, footerY + 30, { align: 'center', width: doc.page.width - 100 });

      doc.end();

      stream.on('finish', () => resolve({ path: filePath, filename }));
      stream.on('error', (err) => reject(new Error(`[pdf-generator] Stream error: ${err.message}`)));

    } catch (err) {
      reject(new Error(`[pdf-generator] generateInvoice failed: ${err.message}`));
    }
  });
}

/**
 * Generate a report PDF.
 * @param {Object} params
 * @param {string} params.title - Report title
 * @param {string} [params.content] - Main content text
 * @param {Array} [params.sections] - Array of { heading, body } sections
 * @returns {Promise<{path: string, filename: string}>}
 */
async function generateReport({ title, content = '', sections = [] }) {
  if (!title) throw new Error('[pdf-generator] title is required');

  ensureWorkspace();

  const safeTitle = String(title).replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_').slice(0, 80);
  const filename = `report_${safeTitle}_${timestamp()}.pdf`;
  const filePath = path.join(WORKSPACE_DIR, filename);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 60,
        info: {
          Title: title,
          Author: 'Manthan AI Agency'
        }
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ─── Header ───────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 80).fill(COLORS.secondary);
      doc.fillColor(COLORS.white).fontSize(20).font('Helvetica-Bold')
         .text('MANTHAN AI AGENCY', 60, 20, { align: 'left' });
      doc.fillColor('#A78BFA').fontSize(9).font('Helvetica')
         .text('AI-Powered Marketing & Growth Solutions', 60, 46);

      doc.fillColor(COLORS.white).fontSize(9).font('Helvetica')
         .text(`Generated: ${formatDate(new Date().toISOString())}`, 0, 46, { align: 'right', width: doc.page.width - 60 });

      doc.moveDown(3.5);

      // ─── Title ────────────────────────────────────────────────
      doc.fillColor(COLORS.primary).fontSize(18).font('Helvetica-Bold')
         .text(title, { align: 'left' });

      doc.moveTo(60, doc.y + 6).lineTo(doc.page.width - 60, doc.y + 6)
         .strokeColor(COLORS.primary).lineWidth(2).stroke();
      doc.moveDown(1.5);

      // ─── Main Content ─────────────────────────────────────────
      if (content && content.trim()) {
        doc.fillColor(COLORS.text).fontSize(10).font('Helvetica')
           .text(content.trim(), { align: 'justify', lineGap: 4 });
        doc.moveDown(1.5);
      }

      // ─── Sections ─────────────────────────────────────────────
      for (const section of sections) {
        if (!section) continue;
        const heading = section.heading || section.title || '';
        const body = section.body || section.content || '';

        if (heading) {
          doc.fillColor(COLORS.primary).fontSize(12).font('Helvetica-Bold')
             .text(heading);
          doc.moveTo(60, doc.y + 2).lineTo(doc.page.width - 60, doc.y + 2)
             .strokeColor(COLORS.border).lineWidth(0.5).stroke();
          doc.moveDown(0.5);
        }

        if (body) {
          doc.fillColor(COLORS.text).fontSize(10).font('Helvetica')
             .text(String(body).trim(), { align: 'justify', lineGap: 4 });
          doc.moveDown(1.2);
        }
      }

      // ─── Footer ───────────────────────────────────────────────
      const footerY = doc.page.height - 50;
      doc.rect(0, footerY, doc.page.width, 50).fill(COLORS.secondary);
      doc.fillColor(COLORS.white).fontSize(8).font('Helvetica')
         .text('Manthan AI Agency  |  Confidential Report', 60, footerY + 18, { align: 'center', width: doc.page.width - 120 });

      doc.end();

      stream.on('finish', () => resolve({ path: filePath, filename }));
      stream.on('error', (err) => reject(new Error(`[pdf-generator] Stream error: ${err.message}`)));

    } catch (err) {
      reject(new Error(`[pdf-generator] generateReport failed: ${err.message}`));
    }
  });
}

module.exports = { generateInvoice, generateReport };
