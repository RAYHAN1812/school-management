/**
 * Turn a tabular report into a downloadable file.
 *
 * Report shape:
 *   { title, subtitle?, columns: [{ key, label, format?, width? }], rows: [...], summary?: [{ label, value }] }
 * format: 'money' | 'date' | 'percent' | 'number' | undefined (text)
 */
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const fmtDate = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
const fmtMoney = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function display(value, format) {
  if (value == null || value === '') return '';
  switch (format) {
    case 'date':
      return fmtDate(value);
    case 'money':
      return fmtMoney(value);
    case 'percent':
      return `${value}%`;
    default:
      return String(value);
  }
}

// Spreadsheet formula injection: neutralise cells that start with = + - @.
const safeText = (s) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export function toCsv(report) {
  const cell = (v) => `"${safeText(String(v ?? '')).replace(/"/g, '""')}"`;
  const lines = [
    [report.title],
    ...(report.subtitle ? [[report.subtitle]] : []),
    [],
    report.columns.map((c) => c.label),
    ...report.rows.map((r) => report.columns.map((c) => display(r[c.key], c.format))),
    ...(report.summary?.length ? [[], ...report.summary.map((s) => [s.label, s.value])] : []),
  ];
  return Buffer.from(`﻿${lines.map((l) => l.map(cell).join(',')).join('\r\n')}\r\n`, 'utf8');
}

export async function toXlsx(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ratonpur Central School';
  wb.created = new Date();
  const ws = wb.addWorksheet(report.title.slice(0, 31).replace(/[\\/*?:[\]]/g, ' '));

  ws.addRow([report.title]).font = { bold: true, size: 14 };
  if (report.subtitle) ws.addRow([report.subtitle]).font = { color: { argb: 'FF64748B' } };
  ws.addRow([]);

  const header = ws.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2149ED' } };
  });
  const headerRow = header.number;

  for (const r of report.rows) {
    const row = ws.addRow(
      report.columns.map((c) => {
        const v = r[c.key];
        if (v == null || v === '') return null;
        if (c.format === 'date') return new Date(v);
        if (['money', 'number', 'percent'].includes(c.format)) return Number(v);
        return safeText(String(v));
      }),
    );
    report.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.format === 'money') cell.numFmt = '#,##0.00';
      if (c.format === 'date') cell.numFmt = 'yyyy-mm-dd';
      if (c.format === 'percent') cell.numFmt = '0.00"%"';
    });
  }

  if (report.summary?.length) {
    ws.addRow([]);
    for (const s of report.summary) ws.addRow([s.label, s.value]).getCell(1).font = { bold: true };
  }

  report.columns.forEach((c, i) => {
    const longest = Math.max(c.label.length, ...report.rows.slice(0, 200).map((r) => display(r[c.key], c.format).length));
    ws.getColumn(i + 1).width = Math.min(45, Math.max(10, longest + 2));
  });
  ws.views = [{ state: 'frozen', ySplit: headerRow }];
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: report.columns.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPdf(report, { schoolName } = {}) {
  return new Promise((resolve, reject) => {
    const landscape = report.columns.length > 6;
    const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const usable = doc.page.width - left - doc.page.margins.right;
    const weights = report.columns.map((c) => c.width ?? (c.format ? 1 : 1.6));
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / total) * usable);
    const rightAligned = (c) => ['money', 'number', 'percent'].includes(c.format);

    // Heading
    if (schoolName) doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(schoolName);
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f172a').text(report.title);
    if (report.subtitle) doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(report.subtitle);
    doc.moveDown(0.6);

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y - 2, usable, 16).fill('#2149ed');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
      let x = left;
      report.columns.forEach((c, i) => {
        doc.text(c.label, x + 3, y + 2, { width: widths[i] - 6, align: rightAligned(c) ? 'right' : 'left', lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + 16;
    };

    drawHeader();
    doc.font('Helvetica').fontSize(8);
    report.rows.forEach((r, idx) => {
      if (doc.y + 14 > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        drawHeader();
        doc.font('Helvetica').fontSize(8);
      }
      const y = doc.y;
      if (idx % 2 === 1) doc.rect(left, y - 1, usable, 13).fill('#f1f5f9');
      doc.fillColor('#0f172a');
      let x = left;
      report.columns.forEach((c, i) => {
        doc.text(display(r[c.key], c.format), x + 3, y + 1, { width: widths[i] - 6, align: rightAligned(c) ? 'right' : 'left', lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + 13;
    });

    if (report.rows.length === 0) doc.moveDown().font('Helvetica-Oblique').fillColor('#64748b').text('No records for this selection.');

    if (report.summary?.length) {
      doc.moveDown();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
      for (const s of report.summary) doc.text(`${s.label}: ${s.value}`, left);
    }

    // Footer on every page
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i += 1) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8');
      doc.text(
        `Generated ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC · Ratonpur Central School · Page ${i + 1} of ${pages.count}`,
        left,
        doc.page.height - doc.page.margins.bottom - 4,
        { width: usable, align: 'center', lineBreak: false },
      );
    }
    doc.end();
  });
}
