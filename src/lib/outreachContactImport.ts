export type ImportedContact = { full_name: string | null; phone: string };

function cleanCell(value: string) {
  return value.replace(/\u0000/g, "").trim();
}

function pickColumns(headers: string[]) {
  const normalized = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const phoneIndex = normalized.findIndex(h => /^(phone|phonenumber|mobile|mobilenumber|whatsapp|whatsappnumber|tel|telephone)$/.test(h) || h.includes("phone") || h.includes("mobile") || h.includes("whatsapp"));
  const nameIndex = normalized.findIndex(h => /^(name|fullname|contactname|patientname|customername)$/.test(h) || h.includes("name"));
  return { phoneIndex, nameIndex };
}

function parseCsv(text: string): ImportedContact[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === "\t" || ch === ";") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  if (rows.length < 1) return [];

  const { phoneIndex: headerPhone, nameIndex: headerName } = pickColumns(rows[0]);
  const hasHeader = headerPhone >= 0 || headerName >= 0;
  const start = hasHeader ? 1 : 0;
  const phoneIndex = hasHeader ? headerPhone : (rows[0].length > 1 ? rows[1].length - 1 : 0);
  const nameIndex = hasHeader ? headerName : (rows[0].length > 1 ? 0 : -1);

  return rows.slice(start).map(r => ({
    full_name: nameIndex >= 0 ? cleanCell(r[nameIndex] || "") || null : null,
    phone: cleanCell(r[phoneIndex] || ""),
  })).filter(x => x.phone);
}

function u16(view: DataView, offset: number) { return view.getUint16(offset, true); }
function u32(view: DataView, offset: number) { return view.getUint32(offset, true); }

async function unzipEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  const start = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= start; i--) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Invalid Excel workbook");
  const count = u16(view, eocd + 10);
  const cdOffset = u32(view, eocd + 16);
  let p = cdOffset;
  const entries = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (u32(view, p) !== 0x02014b50) throw new Error("Invalid Excel directory");
    const method = u16(view, p + 10);
    const compressedSize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const localOffset = u32(view, p + 42);
    const name = new TextDecoder().decode(bytes.slice(p + 46, p + 46 + nameLen));
    const localNameLen = u16(view, localOffset + 26);
    const localExtraLen = u16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let data: Uint8Array;
    if (method === 0) data = compressed;
    else if (method === 8) {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error("Unsupported Excel compression");
    entries.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function xmlText(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

export async function parseExcelContacts(file: File): Promise<ImportedContact[]> {
  const entries = await unzipEntries(await file.arrayBuffer());
  const sharedStrings: string[] = [];
  const shared = entries.get("xl/sharedStrings.xml");
  if (shared) {
    const doc = new DOMParser().parseFromString(xmlText(shared), "application/xml");
    doc.querySelectorAll("si").forEach(si => {
      sharedStrings.push(Array.from(si.querySelectorAll("t")).map(t => t.textContent || "").join(""));
    });
  }

  const sheet = entries.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("Could not find the first worksheet in this Excel file");
  const doc = new DOMParser().parseFromString(xmlText(sheet), "application/xml");
  const rows = Array.from(doc.querySelectorAll("sheetData > row")).map(row => {
    const cells: string[] = [];
    row.querySelectorAll(":scope > c").forEach(cell => {
      const ref = cell.getAttribute("r") || "";
      const match = ref.match(/[A-Z]+/);
      if (!match) return;
      let col = 0;
      for (const ch of match[0]) col = col * 26 + ch.charCodeAt(0) - 64;
      const type = cell.getAttribute("t");
      const value = type === "inlineStr"
        ? Array.from(cell.querySelectorAll("is t")).map(t => t.textContent || "").join("")
        : cell.querySelector("v")?.textContent || "";
      while (cells.length < col) cells.push("");
      cells[col - 1] = type === "s" ? (sharedStrings[Number(value)] || "") : value;
    });
    return cells;
  });

  if (!rows.length) return [];
  const headers = rows[0];
  const { phoneIndex: headerPhone, nameIndex: headerName } = pickColumns(headers);
  const hasHeader = headerPhone >= 0 || headerName >= 0;
  const start = hasHeader ? 1 : 0;
  const phoneIndex = hasHeader ? headerPhone : (rows[0].length > 1 ? rows[0].length - 1 : 0);
  const nameIndex = hasHeader ? headerName : (rows[0].length > 1 ? 0 : -1);

  return rows.slice(start).map(r => ({
    full_name: nameIndex >= 0 ? cleanCell(r[nameIndex] || "") || null : null,
    phone: cleanCell(r[phoneIndex] || ""),
  })).filter(x => x.phone);
}

export async function parseContactFile(file: File): Promise<ImportedContact[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv")) {
    return parseCsv(await file.text());
  }
  if (lower.endsWith(".xlsx")) return parseExcelContacts(file);
  throw new Error("Please choose a CSV, TSV, or Excel (.xlsx) file.");
}
