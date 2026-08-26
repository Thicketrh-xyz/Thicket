// Reading a document for a text job. Plain-text formats (txt/md/csv/json/tsv)
// go straight through; binary containers like xlsx/pdf/docx would decode to
// mojibake and quietly waste a paid job, so we detect and refuse them with a
// message that says what to do instead.

const BINARY_HINT = {
  xlsx: "Excel workbook", xls: "Excel workbook", numbers: "Numbers spreadsheet",
  pdf: "PDF", docx: "Word document", doc: "Word document",
  pptx: "PowerPoint", zip: "archive", png: "image", jpg: "image", jpeg: "image",
};

// Models have a limited context window; far past this the tail is ignored or the
// job fails outright, so warn rather than silently sending something unusable.
const WARN_CHARS = 120000;

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const ext = (file.name.split(".").pop() || "").toLowerCase();

    if (BINARY_HINT[ext]) {
      const what = BINARY_HINT[ext];
      const advice = ["xlsx", "xls", "numbers"].includes(ext)
        ? "Open it and use File \u2192 Save As / Export \u2192 CSV, then attach that."
        : "Copy the text you want and paste it into the prompt instead.";
      return reject(new Error(what + " files aren't readable as text. " + advice));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const text = String(reader.result || "");

      // A binary file with an innocent extension still decodes to junk; NUL and
      // replacement characters are the giveaway.
      const sample = text.slice(0, 2000);
      const junk = (sample.match(/[\u0000\uFFFD]/g) || []).length;
      if (junk > 8) {
        return reject(new Error("That file doesn't look like text. Try CSV or a plain .txt."));
      }
      if (!text.trim()) return reject(new Error("That file is empty."));

      resolve({ text, chars: text.length, tooLong: text.length > WARN_CHARS });
    };
    reader.readAsText(file);
  });
}

export const TEXT_ACCEPT =
  ".txt,.md,.markdown,.csv,.tsv,.json,.log,.yaml,.yml,.xml,.html,text/plain,text/csv,text/markdown,application/json";
