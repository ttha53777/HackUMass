// Writes the FICTIONAL demo papers into public/demo-papers/: plain-text PDFs and
// one SVG ID card for a made-up person ("Maya Rivera"). No real people, accounts
// or addresses. Run: node scripts/make-demo-papers.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../public/demo-papers");
mkdirSync(out, { recursive: true });

const SAMPLE = "SAMPLE DOCUMENT - FICTIONAL - FOR A DEMO ONLY";

/** A one-page PDF of text lines (Helvetica), readable by any PDF text extractor. */
function pdf(title, lines) {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const body = [
    "BT /F2 9 Tf 72 760 Td (" + esc(SAMPLE) + ") Tj ET",
    "BT /F1 18 Tf 72 726 Td (" + esc(title) + ") Tj ET",
    ...lines.map((line, i) => `BT /F2 11 Tf 72 ${690 - i * 18} Td (${esc(line)}) Tj ET`),
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`,
  ];
  let doc = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(doc));
    doc += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(doc);
  doc += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  doc += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  doc += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return doc;
}

const papers = {
  "pay-stub.pdf": pdf("Pay stub - Valley Grocers (fictional)", [
    "Employee: Maya Rivera",
    "Pay period: October 1 - October 31, 2026",
    "Gross monthly pay: $1,240",
    "Household size: 2",
    "Hours worked: 96",
    "Employer address: 1 Sample Way, Amherst, MA 01002",
  ]),
  "lease.pdf": pdf("Residential lease (fictional)", [
    "Tenant: Maya Rivera",
    "Unit: 12 Example Street, Apt 3, Amherst, MA 01002",
    "Monthly rent: $900, due on the 1st",
    "Lease term: September 1, 2026 - August 31, 2027",
    "Landlord: Sample Property Management",
  ]),
  "utility-bill.pdf": pdf("Electric bill - Sample Electric Co. (fictional)", [
    "Account holder: Maya Rivera",
    "Service address: 12 Example Street, Apt 3, Amherst, MA 01002",
    "Billing period: October 2026",
    "Amount due: $78.40",
    "Status: past due",
  ]),
  "proof-of-address.pdf": pdf("Letter confirming address (fictional)", [
    "To whom it may concern,",
    "Maya Rivera lives at 12 Example Street, Apt 3, Amherst, MA 01002.",
    "Issued by: Sample Community Center",
    "Date: November 1, 2026",
  ]),
  "household-birth-dates.pdf": pdf("Household members and birth dates (fictional)", [
    "Maya Rivera - adult - born 1994",
    "Leo Rivera - child - born 2023",
  ]),
};

for (const [name, content] of Object.entries(papers)) writeFileSync(resolve(out, name), content);

writeFileSync(
  resolve(out, "photo-id.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <rect width="640" height="400" rx="28" fill="#eef3fa"/>
  <rect x="0" y="0" width="640" height="70" rx="28" fill="#3f5f89"/>
  <rect x="0" y="40" width="640" height="30" fill="#3f5f89"/>
  <text x="32" y="46" font-family="Helvetica, Arial" font-size="24" font-weight="700" fill="#fff">SAMPLE ID CARD</text>
  <text x="608" y="46" text-anchor="end" font-family="Helvetica, Arial" font-size="14" fill="#fff">FICTIONAL - DEMO ONLY</text>
  <rect x="32" y="100" width="170" height="210" rx="16" fill="#d6e1f0"/>
  <circle cx="117" cy="175" r="42" fill="#9fb3cf"/>
  <rect x="62" y="230" width="110" height="60" rx="30" fill="#9fb3cf"/>
  <g font-family="Helvetica, Arial" fill="#2d4342">
    <text x="232" y="130" font-size="14" fill="#5f6e68">NAME</text>
    <text x="232" y="158" font-size="26" font-weight="700">Maya Rivera</text>
    <text x="232" y="200" font-size="14" fill="#5f6e68">ADDRESS</text>
    <text x="232" y="224" font-size="18">12 Example St, Apt 3, Amherst, MA</text>
    <text x="232" y="266" font-size="14" fill="#5f6e68">ID NO.</text>
    <text x="232" y="290" font-size="18">SAMPLE-0000</text>
  </g>
  <text x="32" y="370" font-family="Helvetica, Arial" font-size="13" fill="#5f6e68">Not a real document. Created for the OpenDoor demo.</text>
</svg>
`,
);
console.log(`Wrote ${Object.keys(papers).length + 1} fictional demo papers to ${out}`);
