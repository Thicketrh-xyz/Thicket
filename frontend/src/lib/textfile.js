// Turning an uploaded file into text a model can read.
//
// Plain text goes straight through. PDF and DOCX are binary containers, so we
// extract their text with parsers loaded on demand — importing them lazily keeps
// them out of the main bundle for people who never upload a document.

// Models have a limited context window; past this the tail is ignored, so we
// warn rather than silently sending something the model can only half read.
const WARN_CHARS = 120000;

const STILL_BINARY = {
  xlsx: "Excel workbook", xls: "Excel workbook", numbers: "Numbers spreadsheet",
  pptx: "PowerPoint", key: "Keynote", zip: "archive",
};

async function readPdf(file) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(" "));
  }
  return pages.join("\n\n");
}

async function readDocx(file) {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

function readPlain(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const text = String(reader.result || "");
      // A binary file with an innocent extension decodes to junk; NUL and
      // replacement characters are the giveaway.
      const junk = (text.slice(0, 2000).match(/[\u0000\uFFFD]/g) || []).length;
      if (junk > 8) return reject(new Error("That file doesn't look like text. Try CSV, PDF, DOCX or .txt."));
      resolve(text);
    };
    reader.readAsText(file);
  });
}

export async function readDocument(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  if (STILL_BINARY[ext]) {
    const advice = ["xlsx", "xls", "numbers"].includes(ext)
      ? "Export it to CSV and attach that instead."
      : "Copy the text you need into the prompt instead.";
    return Promise.reject(new Error(STILL_BINARY[ext] + " files can't be read directly. " + advice));
  }

  let text;
  if (ext === "pdf") text = await readPdf(file);
  else if (ext === "docx") text = await readDocx(file);
  else text = await readPlain(file);

  text = (text || "").trim();
  if (!text) {
    throw new Error(ext === "pdf"
      ? "No text found — this PDF looks scanned, so it would need OCR."
      : "That file is empty.");
  }
  return { text, chars: text.length, tooLong: text.length > WARN_CHARS };
}

export const DOC_ACCEPT =
  ".txt,.md,.markdown,.csv,.tsv,.json,.log,.yaml,.yml,.xml,.html,.pdf,.docx," +
  "text/plain,text/csv,text/markdown,application/json,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
