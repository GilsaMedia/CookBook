import { makeZip } from "./zip-test-helper";

// A small document shaped like Efrat's cookbook: Title, a table of contents,
// category headings (Heading 1), recipe headings (Heading 2), a navigation
// line under every recipe, an optional "מקור המתכון" link, bullets, steps.
const para = (text: string, opts: { style?: string; list?: boolean; link?: string } = {}) => {
  const pPr =
    opts.style || opts.list
      ? `<w:pPr>${opts.style ? `<w:pStyle w:val="${opts.style}"/>` : ""}${opts.list ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ""}</w:pPr>`
      : "";
  const run = `<w:r><w:t xml:space="preserve">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r>`;
  return `<w:p>${pPr}${opts.link ? `<w:hyperlink r:id="${opts.link}">${run}</w:hyperlink>` : run}</w:p>`;
};
const nav = para("↑ לתוכן העניינים · הוספה לארוחה בוואטסאפ", { link: "rIdToc" });

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
${para("ספר המתכונים של אפרת", { style: "Title" })}
${para("מרקים", { style: "TOC1" })}
${para("מרק עדשים", { style: "TOC2" })}
${para("מרקים", { style: "Heading1" })}
${para("מרק עדשים", { style: "Heading2" })}
${nav}
${para("מקור המתכון", { link: "rIdSrc" })}
${para("2 כוסות עדשים כתומות", { list: true })}
${para("1 בצל", { list: true })}
${para("מבשלים 30 דקות & טוחנים.")}
${para("מוסקה של קורין", { style: "Heading2" })}
${nav}
${para("3 חצילים", { list: true })}
${para("אופים בתנור על 160 מעלות שעה.")}
${para("מנות עיקריות – בשר ועוף", { style: "Heading1" })}
${para("מוסקה – קורין", { style: "Heading2" })}
${nav}
${para("3 חצילים", { list: true })}
${para("אופים בתנור על 160 מעלות שעה.")}
${para("עוף בלימון", { style: "Heading2" })}
${nav}
${para("מקור המתכון", { link: "rIdSrc2" })}
${para("פולנטה של מחניודה", { style: "Heading2" })}
${nav}
</w:body></w:document>`;

const stylesXml = `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>
<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/></w:style>
</w:styles>`;

const relsXml = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdSrc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.example.co.il/lentil-soup?a=1&amp;b=2" TargetMode="External"/>
<Relationship Id="rIdSrc2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://chef.example.com/lemon-chicken" TargetMode="External"/>
<Relationship Id="rIdToc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="#toc" TargetMode="External"/>
</Relationships>`;

/** The sample document as .docx bytes. */
export const sampleDocx = () =>
  makeZip({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": documentXml,
    "word/styles.xml": stylesXml,
    "word/_rels/document.xml.rels": relsXml,
  });
