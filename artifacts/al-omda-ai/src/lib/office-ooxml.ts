export type XlsxSheetData = { name: string; columns: string[]; rows: Array<Array<string | number | boolean>>; formulas?: Record<string, string> };
export type XlsxData = { title: string; columns: string[]; rows: Array<Array<string | number | boolean>>; formulas?: Record<string, string>; sheets?: XlsxSheetData[] };
export type DocxData = { title: string; paragraphs: string[]; columns: string[]; rows: string[][] };

const encoder = new TextEncoder();
const xmlEscape = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipBlob(entries: Array<{ name: string; content: string }>, mime: string): Blob {
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name), data = encoder.encode(entry.content), crc = crc32(data);
    const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0, true); view.setUint16(8, 0, true);
    view.setUint16(10, 0, true); view.setUint16(12, 0, true); view.setUint32(14, crc, true); view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true); view.setUint16(26, name.length, true); view.setUint16(28, 0, true); header.set(name, 30);
    local.push(header, data);
    const directory = new Uint8Array(46 + name.length), dir = new DataView(directory.buffer);
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(8, 0, true);
    dir.setUint16(10, 0, true); dir.setUint16(12, 0, true); dir.setUint16(14, 0, true); dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true); dir.setUint32(24, data.length, true); dir.setUint16(28, name.length, true);
    dir.setUint16(30, 0, true); dir.setUint16(32, 0, true); dir.setUint16(34, 0, true); dir.setUint16(36, 0, true);
    dir.setUint32(38, 0, true); dir.setUint32(42, offset, true); directory.set(name, 46); central.push(directory);
    offset += header.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true); ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
  const archive = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...local, ...central, end]) { archive.set(part, cursor); cursor += part.length; }
  return new Blob([archive.buffer], { type: mime });
}
function excelColumn(index: number): string {
  let n = index + 1, result = "";
  while (n > 0) { const remainder = (n - 1) % 26; result = String.fromCharCode(65 + remainder) + result; n = Math.floor((n - 1) / 26); }
  return result;
}
export function createXlsxBlob(data: XlsxData): Blob {
  const sheets = data.sheets?.length ? data.sheets : [{ name: "Sheet1", columns: data.columns, rows: data.rows, formulas: data.formulas }];
  const overrides = sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("");
  const workbookSheets = sheets.map((sheet, i) => '<sheet name="' + xmlEscape(sheet.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("");
  const workbookRels = sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("") + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
  const entries: Array<{ name: string; content: string }> = [
    { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + overrides + '</Types>' },
    { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: "xl/workbook.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + workbookSheets + '</sheets><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + workbookRels + '</Relationships>' },
    { name: "xl/styles.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF334155"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
  ];
  sheets.forEach((sheet, sheetIndex) => {
    for (const [address, rawFormula] of Object.entries(sheet.formulas ?? {})) {
      const formula = String(rawFormula).trim().replace(/^=/, "");
      if (!formula || /\\b(?:WEBSERVICE|HYPERLINK|DDE|CALL|EXEC|REGISTER|RTD|INDIRECT)\\s*\\(/i.test(formula) || /[\\[\\]]/.test(formula)) {
        throw new Error("Unsafe Excel formula rejected at " + address + ".");
      }
    }
    const rows = [sheet.columns, ...sheet.rows];
    const rowXml = rows.map((row, rowIndex) => '<row r="' + (rowIndex + 1) + '">' + sheet.columns.map((_, colIndex) => {
      const address = excelColumn(colIndex) + (rowIndex + 1), formula = sheet.formulas?.[address] ?? sheet.formulas?.[address.toLowerCase()], value = row[colIndex] ?? "";
      const style = rowIndex === 0 ? ' s="1"' : "";
      if (formula) return '<c r="' + address + '"' + style + '><f>' + xmlEscape(String(formula).replace(/^=/, "")) + '</f><v></v></c>';
      if (typeof value === "number" && Number.isFinite(value)) return '<c r="' + address + '"' + style + '><v>' + value + '</v></c>';
      if (typeof value === "boolean") return '<c r="' + address + '" t="b"' + style + '><v>' + (value ? "1" : "0") + '</v></c>';
      return '<c r="' + address + '" t="inlineStr"' + style + '><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>';
    }).join("") + '</row>').join("");
    const endCell = excelColumn(Math.max(0, sheet.columns.length - 1)) + rows.length;
    entries.push({ name: "xl/worksheets/sheet" + (sheetIndex + 1) + ".xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:' + endCell + '"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>' + sheet.columns.map((_, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="20" customWidth="1"/>').join("") + '</cols><sheetData>' + rowXml + '</sheetData><autoFilter ref="A1:' + endCell + '"/></worksheet>' });
  });
  return zipBlob(entries, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
export function createDocxBlob(data: DocxData, rtl = true): Blob {
  const paragraph = (value: string) => {
    const heading = value.match(/^(#{1,3})\\s+(.+)$/), bullet = value.match(/^[-*]\\s+(.+)$/), body = heading?.[2] ?? bullet?.[1] ?? value;
    const properties = heading ? '<w:pPr><w:pStyle w:val="Heading' + heading[1].length + '"/><w:bidi/></w:pPr>' : '<w:pPr><w:bidi/><w:jc w:val="' + (rtl ? "right" : "left") + '"/></w:pPr>';
    return '<w:p>' + properties + '<w:r><w:rPr>' + (heading ? '<w:b/>' : '') + '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="' + (heading ? "30" : "22") + '"/></w:rPr><w:t xml:space="preserve">' + xmlEscape((bullet ? "• " : "") + body) + '</w:t></w:r></w:p>';
  };
  const paragraphs = data.paragraphs.map(paragraph).join("");
  const table = data.columns.length ? '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:bidiVisual/></w:tblPr><w:tblGrid>' + data.columns.map(() => '<w:gridCol w:w="' + Math.floor(9000 / data.columns.length) + '"/>').join("") + '</w:tblGrid>' + [data.columns, ...data.rows].map((row, rowIndex) => '<w:tr>' + row.map((cell) => '<w:tc><w:tcPr><w:tcW w:w="' + Math.floor(9000 / data.columns.length) + '" w:type="dxa"/>' + (rowIndex === 0 ? '<w:shd w:fill="E8EDF5"/>' : '') + '</w:tcPr><w:p><w:pPr><w:bidi/><w:jc w:val="' + (rtl ? "right" : "left") + '"/></w:pPr><w:r><w:rPr>' + (rowIndex === 0 ? '<w:b/>' : '') + '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">' + xmlEscape(cell) + '</w:t></w:r></w:p></w:tc>').join("") + '</w:tr>').join("") + '</w:tbl>' : "";
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paragraph(data.title) + paragraphs + table + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="850" w:bottom="900" w:left="850"/><w:bidi/></w:sectPr></w:body></w:document>';
  const entries = [
    { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
    { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: "word/document.xml", content: documentXml },
    { name: "word/_rels/document.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: "word/styles.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' + [1,2,3].map(n => '<w:style w:type="paragraph" w:styleId="Heading' + n + '"><w:name w:val="heading ' + n + '"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="' + (32 - n * 2) + '"/></w:rPr></w:style>').join("") + '</w:styles>' },
  ];
  return zipBlob(entries, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

export type PptxSlideData = { title: string; bullets: string[]; notes?: string };
export type PptxData = { title: string; slides: PptxSlideData[] };

/** Builds a self-contained, editable OOXML PowerPoint without a network dependency. */
export function createPptxBlob(data: PptxData): Blob {
  if (!data.title.trim() || data.slides.length < 3 || data.slides.length > 30) throw new Error("PowerPoint requires a title and 3 to 30 slides.");
  if (data.slides.some((slide) => !slide.title.trim() || slide.bullets.length < 1 || slide.bullets.length > 8 || slide.bullets.some((bullet) => !bullet.trim()))) {
    throw new Error("Every PowerPoint slide requires a title and 1 to 8 non-empty bullet points.");
  }
  const relNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const pNs = "http://schemas.openxmlformats.org/presentationml/2006/main";
  const aNs = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const pkgNs = "http://schemas.openxmlformats.org/package/2006/relationships";
  const rtlFor = (value: string) => /[\u0590-\u08ff]/.test(value);
  const shape = (id: number, name: string, x: number, y: number, cx: number, cy: number, paragraphs: string) =>
    '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + name + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="1" anchor="ctr"><a:spAutoFit/></a:bodyPr><a:lstStyle/>' + paragraphs + '</p:txBody></p:sp>';
  const run = (value: string, size: number, color: string, bold: boolean, rtl: boolean) =>
    '<a:r><a:rPr lang="' + (rtl ? "ar-SA" : "en-US") + '" sz="' + size + '" b="' + (bold ? "1" : "0") + '" dirty="0"><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:rPr><a:t xml:space="preserve">' + xmlEscape(value) + '</a:t></a:r>';
  const slideEntries: Array<{name:string;content:string}> = [];
  data.slides.forEach((slide, index) => {
    const rtl = rtlFor(slide.title + slide.bullets.join(" "));
    const align = rtl ? "r" : "l";
    const title = '<a:p><a:pPr algn="' + align + '" rtl="' + (rtl ? "1" : "0") + '"/>' + run(slide.title, 3000, "D8B978", true, rtl) + '<a:endParaRPr lang="' + (rtl ? "ar-SA" : "en-US") + '"/></a:p>';
    const bullets = slide.bullets.map((bullet) => '<a:p><a:pPr lvl="0" algn="' + align + '" rtl="' + (rtl ? "1" : "0") + '" marL="342900" indent="-228600"><a:buChar char="•"/></a:pPr>' + run(bullet, 2000, "F1F5F9", false, rtl) + '<a:endParaRPr lang="' + (rtl ? "ar-SA" : "en-US") + '"/></a:p>').join("");
    const footer = '<a:p><a:pPr algn="ctr"/>' + run("AL OMDA AI  •  " + (index + 1), 900, "8290A3", false, false) + '</a:p>';
    const tree = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      shape(2, "Slide title", 500000, 350000, 11200000, 1050000, title) +
      shape(3, "Slide content", 800000, 1550000, 10600000, 4500000, bullets) +
      shape(4, "Footer", 500000, 6200000, 11200000, 300000, footer) + '</p:spTree>';
    slideEntries.push({
      name: "ppt/slides/slide" + (index + 1) + ".xml",
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="' + aNs + '" xmlns:r="' + relNs + '" xmlns:p="' + pNs + '"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="101722"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' + tree + '</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>',
    });
    slideEntries.push({
      name: "ppt/slides/_rels/slide" + (index + 1) + ".xml.rels",
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + pkgNs + '"><Relationship Id="rId1" Type="' + relNs + '/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>',
    });
  });
  const slideOverrides = data.slides.map((_, i) => '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>').join("");
  const slideIds = data.slides.map((_, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>').join("");
  const presentationRels = '<Relationship Id="rId1" Type="' + relNs + '/slideMaster" Target="slideMasters/slideMaster1.xml"/>' + data.slides.map((_, i) => '<Relationship Id="rId' + (i + 2) + '" Type="' + relNs + '/slide" Target="slides/slide' + (i + 1) + '.xml"/>').join("");
  const groupTree = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
  const theme = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="' + aNs + '" name="AL OMDA"><a:themeElements><a:clrScheme name="AL OMDA"><a:dk1><a:srgbClr val="101722"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="273244"/></a:dk2><a:lt2><a:srgbClr val="F1F5F9"/></a:lt2>' +
    ['D8B978','64748B','0F766E','2563EB','7C3AED','C2410C'].map((color,i)=>'<a:accent'+(i+1)+'><a:srgbClr val="'+color+'"/></a:accent'+(i+1)+'>').join("") +
    '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="AL OMDA"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
  const entries = [
    { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' + slideOverrides + '</Types>' },
    { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + pkgNs + '"><Relationship Id="rId1" Type="' + relNs + '/officeDocument" Target="ppt/presentation.xml"/></Relationships>' },
    { name: "ppt/presentation.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="' + aNs + '" xmlns:r="' + relNs + '" xmlns:p="' + pNs + '"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' + slideIds + '</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>' },
    { name: "ppt/_rels/presentation.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + pkgNs + '">' + presentationRels + '</Relationships>' },
    { name: "ppt/slideMasters/slideMaster1.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="' + aNs + '" xmlns:r="' + relNs + '" xmlns:p="' + pNs + '"><p:cSld name="AL OMDA Master">' + groupTree + '</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3000" b="1"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr sz="1800"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>' },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + pkgNs + '"><Relationship Id="rId1" Type="' + relNs + '/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="' + relNs + '/theme" Target="../theme/theme1.xml"/></Relationships>' },
    { name: "ppt/slideLayouts/slideLayout1.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="' + aNs + '" xmlns:r="' + relNs + '" xmlns:p="' + pNs + '" type="blank" preserve="1"><p:cSld name="Blank">' + groupTree + '</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>' },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + pkgNs + '"><Relationship Id="rId1" Type="' + relNs + '/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>' },
    { name: "ppt/theme/theme1.xml", content: theme },
    ...slideEntries,
  ];
  return zipBlob(entries, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
}
