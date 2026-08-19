const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');

const BRAND = {
  red: 'FFE31E2B',
  redDark: 'FFB8121E',
  ink: 'FF1A1A1A',
  paper: 'FFF4F5F7',
  white: 'FFFFFFFF',
  amber: 'FFF0940C',
  green: 'FF1E8A4C',
  blue: 'FF2A5FD9',
  faint: 'FF8A8B92',
  border: 'FFECECEF',
};

const PDF = {
  red: '#E31E2B',
  ink: '#1A1A1A',
  paper: '#F4F5F7',
  faint: '#8A8B92',
  white: '#FFFFFF',
  green: '#1E8A4C',
};

function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function thinBorder() {
  const edge = { style: 'thin', color: { argb: BRAND.border } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function brandWorkbook(title) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SUPERAMCO';
  wb.company = 'SUPERAMCO';
  wb.created = new Date();
  wb.title = title;
  return wb;
}

function paintHeader(sheet, { title, subtitle, lastCol, note }) {
  const col = lastCol || 'I';
  sheet.views = [{ state: 'frozen', ySplit: 5, showGridLines: false }];
  sheet.getRow(1).height = 32;
  sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 18;
  sheet.getRow(4).height = 18;

  sheet.mergeCells(`A1:${col}1`);
  const brand = sheet.getCell('A1');
  brand.value = {
    richText: [
      { font: { bold: true, size: 18, color: { argb: BRAND.white }, name: 'Calibri' }, text: 'SUPER' },
      { font: { bold: true, size: 18, color: { argb: BRAND.red }, name: 'Calibri' }, text: 'AMCO' },
      { font: { size: 11, color: { argb: 'FFB8B8BC' }, name: 'Calibri' }, text: '   RH & Présences' },
    ],
  };
  brand.fill = fill(BRAND.ink);
  brand.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  for (let i = 1; i <= 16; i++) sheet.getRow(1).getCell(i).fill = fill(BRAND.ink);

  sheet.mergeCells(`A2:${col}2`);
  const t = sheet.getCell('A2');
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: BRAND.ink }, name: 'Calibri' };
  t.alignment = { vertical: 'middle', indent: 1 };

  sheet.mergeCells(`A3:${col}3`);
  const s = sheet.getCell('A3');
  s.value = subtitle || '';
  s.font = { size: 10, color: { argb: BRAND.faint }, name: 'Calibri', italic: true };
  s.alignment = { vertical: 'middle', indent: 1 };
  s.fill = fill(BRAND.paper);

  sheet.mergeCells(`A4:${col}4`);
  const n = sheet.getCell('A4');
  n.value = note || '';
  n.font = { size: 9, color: { argb: BRAND.faint }, name: 'Calibri' };
  n.fill = fill(BRAND.paper);
  n.alignment = { vertical: 'middle', indent: 1 };

  return 5;
}

function styleHeaderRow(sheet, rowNumber, colCount) {
  const row = sheet.getRow(rowNumber);
  row.height = 22;
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true, color: { argb: BRAND.white }, name: 'Calibri', size: 10 };
    cell.fill = fill(BRAND.red);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  }
}

function styleDataRow(sheet, rowNumber, colCount, { example = false } = {}) {
  const row = sheet.getRow(rowNumber);
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.font = { name: 'Calibri', size: 10, color: { argb: example ? BRAND.faint : BRAND.ink }, italic: example };
    cell.fill = fill(example || rowNumber % 2 === 0 ? BRAND.paper : BRAND.white);
    cell.border = thinBorder();
    cell.alignment = { vertical: 'middle' };
  }
}

function sendWorkbook(res, workbook, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return workbook.xlsx.write(res).then(() => res.end());
}

// meta : lignes optionnelles affichées en haut à droite, alignées avec le
// logo (ex: numéro de dossier, date d'émission) — utile pour les documents
// qui ont besoin d'une référence, facultatif pour les autres.
function drawPdfHeader(doc, { title, subtitle, meta }) {
  const marginX = 48;
  const innerW = doc.page.width - marginX * 2;

  // Logo en haut à gauche, sur fond blanc (pas de bandeau de couleur derrière).
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, marginX, 38, { width: 130 });
  } else {
    // Repli si le fichier logo n'est pas présent sur le disque (ex: après un
    // clone du dépôt sans backend/assets/logo.png) : on garde un wordmark
    // texte pour que le document reste présentable.
    doc.fillColor(PDF.ink).font('Helvetica-Bold').fontSize(16);
    doc.text('SUPER', marginX, 46, { continued: true });
    doc.fillColor(PDF.red).text('AMCO');
  }

  if (meta && meta.length) {
    doc.font('Helvetica').fontSize(9).fillColor(PDF.faint);
    meta.forEach((line, i) => {
      doc.text(line, marginX, 45 + i * 13, { width: innerW, align: 'right' });
    });
  }

  // Liseré rouge, signature visuelle de la marque sous le logo.
  doc.rect(marginX, 95, innerW, 3).fill(PDF.red);

  doc.fillColor(PDF.ink).font('Helvetica-Bold').fontSize(20);
  doc.text(title, marginX, 115, { width: innerW, align: 'center' });

  let y = 145;
  if (subtitle) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(PDF.faint);
    doc.text(subtitle, marginX, 140, { width: innerW, align: 'center' });
    y = 162;
  }

  doc.fillColor(PDF.ink);
  return y;
}

function drawPdfFooter(doc) {
  const y = doc.page.height - 36;
  doc.rect(0, y, doc.page.width, 36).fill(PDF.ink);

  // pdfkit insère automatiquement une nouvelle page si un texte "dépasse"
  // la marge basse du document — même quand on lui donne une position Y
  // explicite proche du vrai bord de la page. Ça provoquait une page 2
  // quasi vide contenant juste ce texte en double. On désactive
  // temporairement la marge basse pour ce seul appel (les formes comme
  // doc.rect ci-dessus ne sont pas concernées, seul le texte qui "coule"
  // déclenche ce comportement).
  const bottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.fillColor('#B8B8BC').font('Helvetica').fontSize(8);
  doc.text(
    `Document généré automatiquement le ${new Date().toLocaleString('fr-FR')}  ·  SUPERAMCO`,
    48,
    y + 12,
    { width: doc.page.width - 96, align: 'center' }
  );
  doc.page.margins.bottom = bottomMargin;
}

module.exports = {
  BRAND,
  PDF,
  fill,
  thinBorder,
  brandWorkbook,
  paintHeader,
  styleHeaderRow,
  styleDataRow,
  sendWorkbook,
  drawPdfHeader,
  drawPdfFooter,
};
