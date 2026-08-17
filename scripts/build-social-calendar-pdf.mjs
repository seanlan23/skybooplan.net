import { jsPDF } from "jspdf";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(process.env.HOME ?? ROOT, "Desktop", "Skybooplan-objave-14-dni");
const IMG_DIR = join(OUT_DIR, "slike");

const SKY = [14, 165, 233];
const INK = [15, 23, 42];
const MUTED = [71, 85, 105];
const CARD = [241, 245, 249];
const ROSE = [254, 242, 242];
const DAYS = JSON.parse(readFileSync(join(ROOT, "scripts/social-14-days.json"), "utf8")).days.map((day) => ({
  ...day,
  image: { kind: "local", file: `dan-${String(day.n).padStart(2, "0")}.png` },
  credit: "Skybooplan · gradient",
  post: day.caption,
}));



function uint8ToBinaryString(bytes) {
  const chunk = 0x2000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    let part = "";
    for (let j = 0; j < slice.length; j++) part += String.fromCharCode(slice[j]);
    binary += part;
  }
  return binary;
}

function loadFont(doc, file, vfsName, style) {
  const bytes = new Uint8Array(readFileSync(join(ROOT, "public/fonts", file)));
  doc.addFileToVFS(vfsName, uint8ToBinaryString(bytes));
  doc.addFont(vfsName, "DejaVu", style);
}

function detectFormat(buf, name) {
  if (name.endsWith(".png") || buf[0] === 0x89) return "PNG";
  return "JPEG";
}

async function loadImage(day) {
  if (!day.image) return null;
  const dest = join(IMG_DIR, day.image.file);
  if (day.image.kind === "local") {
    const buf = readFileSync(dest);
    return { buf, format: detectFormat(buf, day.image.file), dest };
  }
  if (day.image.kind === "file") {
    const buf = readFileSync(join(ROOT, day.image.path));
    writeFileSync(dest, buf);
    return { buf, format: detectFormat(buf, day.image.file), dest };
  }
  const res = await fetch(day.image.url, { headers: { Accept: "image/*" } });
  if (!res.ok) throw new Error(`Image ${day.n}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return { buf, format: detectFormat(buf, day.image.file), dest };
}

function addFooter(doc, pageW, pageH, page, total) {
  doc.setDrawColor(...SKY);
  doc.setLineWidth(2);
  doc.line(36, pageH - 36, pageW - 36, pageH - 36);
  doc.setFont("DejaVu", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("skybooplan.com  ·  naloži sliko iz mape slike/  ·  caption je kratek", 36, pageH - 22);
  doc.text(`${page} / ${total}`, pageW - 36, pageH - 22, { align: "right" });
}

function cover(doc, pageW, pageH) {
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setFillColor(...SKY);
  doc.rect(0, 0, 18, pageH, "F");
  doc.setFont("DejaVu", "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text("SKYBOOPLAN", 48, 80);
  doc.setFontSize(32);
  doc.text("14 dni objav", 48, 130);
  doc.setFont("DejaVu", "normal");
  doc.setFontSize(16);
  doc.text("17. – 30. avgust 2026", 48, 160);
  doc.setFontSize(12);
  const lines = doc.splitTextToSize(
    "14 grafik na Facebookovi vijolični barvi. To so SLIKE — zato je tekst lahko daljši.",
    pageW - 96,
  );
  doc.text(lines, 48, 210);
  doc.setFontSize(11);
  doc.text("Vsak dan: naloži dan-01.png … dan-14.png iz mape slike/.", 48, 280);
  doc.text("Caption = kratek stavek iz PDF-ja. Link je že na sliki.", 48, 300);
  doc.text("Ne lepi v Facebookovo barvo. Naloži sliko.", 48, 320);
}

function howTo(doc, pageW) {
  doc.setFont("DejaVu", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text("Kako uporabljaš ta zvezek", 36, 56);
  const steps = [
    "1. Odpri mapo slike/ in vzemi dan-XX.png — to je objava.",
    "2. Facebook: Ustvari objavo → slika (ne barva). Naloži PNG.",
    "3. Caption: prilepi kratek stavek s strani. Link je že na grafiki.",
    "4. Story: 3 vrstice. Zadnji slajd = skybooplan.com.",
    "5. Ton pusti. Ne mehčaj. Ne dodajaj “Fact dneva”.",
  ];
  doc.setFont("DejaVu", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  let y = 90;
  for (const s of steps) {
    const wrap = doc.splitTextToSize(s, pageW - 72);
    doc.text(wrap, 36, y);
    y += wrap.length * 16 + 10;
  }
  doc.setFillColor(...CARD);
  doc.roundedRect(36, y + 10, pageW - 72, 70, 8, 8, "F");
  doc.setFont("DejaVu", "bold");
  doc.setFontSize(11);
  doc.text("Mapa na namizju", 52, y + 36);
  doc.setFont("DejaVu", "normal");
  doc.text("Desktop / Skybooplan-objave-14-dni /", 52, y + 56);
}

function dayPage(doc, day, img, pageW) {
  const margin = 36;
  const contentW = pageW - margin * 2;

  doc.setFillColor(...SKY);
  doc.roundedRect(margin, 28, 54, 28, 6, 6, "F");
  doc.setFont("DejaVu", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(String(day.n).padStart(2, "0"), margin + 27, 47, { align: "center" });

  doc.setTextColor(...INK);
  doc.setFontSize(16);
  doc.text(day.theme, margin + 66, 40);
  doc.setFont("DejaVu", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(day.date, margin + 66, 56);

  const imgH = 250;
  const imgW = imgH * (1080 / 1350);
  const imgX = margin + (contentW - imgW) / 2;
  const imgY = 72;
  const hasImage = Boolean(day.image && img?.buf?.length);

  if (hasImage) {
    try {
      const data = `data:image/${img.format === "PNG" ? "png" : "jpeg"};base64,${img.buf.toString("base64")}`;
      doc.addImage(data, img.format, imgX, imgY, imgW, imgH, undefined, "FAST");
    } catch {
      doc.setFillColor(...CARD);
      doc.rect(imgX, imgY, imgW, imgH, "F");
    }
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${img.dest.split("/").pop()}  ·  naloži to sliko na FB`, margin, imgY + imgH + 12);
  } else {
    const chars = [...day.post].length;
    doc.setFillColor(...PURPLE);
    doc.roundedRect(margin, imgY, imgW, imgH, 10, 10, "F");
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 16, imgY + 16, 150, 22, 6, 6, "F");
    doc.setFont("DejaVu", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PURPLE);
    doc.text(`BARVA FB  ·  ${chars} / ${FB_COLOR_MAX}`, margin + 91, imgY + 31, { align: "center" });
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    const preview = doc.splitTextToSize(day.post, imgW - 48);
    doc.text(preview, margin + imgW / 2, imgY + 90, { align: "center" });
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(8);
    doc.setTextColor(196, 181, 253);
    doc.text("Prilepi to. Brez slike. Brez linka. Sicer barva izgine.", margin, imgY + imgH + 12);
  }

  let y = imgY + imgH + 32;
  doc.setFont("DejaVu", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...SKY);
  doc.text("STORY  ·  3 slajdi", margin, y);
  y += 10;
  doc.setFillColor(...CARD);
  doc.roundedRect(margin, y, contentW, 78, 8, 8, "F");
  doc.setFont("DejaVu", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  day.story.forEach((line, i) => {
    doc.text(`${i + 1}.  ${line}`, margin + 12, y + 20 + i * 20);
  });

  y += 98;
  doc.setFont("DejaVu", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...SKY);
  const postLabel = day.image
    ? "OBJAVA  ·  prilepi caption + sliko"
    : "OBJAVA  ·  prilepi v barvo (brez linka)";
  doc.text(postLabel, margin, y);
  y += 10;
  const postLines = doc.splitTextToSize(day.post, contentW - 24);
  const boxH = Math.min(90, postLines.length * 14 + 20);
  doc.setFillColor(...ROSE);
  doc.roundedRect(margin, y, contentW, boxH, 8, 8, "F");
  doc.setFont("DejaVu", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(postLines, margin + 12, y + 16);

  if (day.comment) {
    y += boxH + 22;
    doc.setFont("DejaVu", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...SKY);
    doc.text("1. KOMENTAR  ·  takoj po objavi", margin, y);
    y += 10;
    const cLines = doc.splitTextToSize(day.comment, contentW - 24);
    doc.setFillColor(...CARD);
    doc.roundedRect(margin, y, contentW, cLines.length * 14 + 20, 8, 8, "F");
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(cLines, margin + 12, y + 16);
  }
}

async function main() {
  mkdirSync(IMG_DIR, { recursive: true });
  const images = [];
  for (const day of DAYS) {
    if (!day.image) {
      images.push(null);
      console.log(`dan ${day.n}: samo tekst`);
      continue;
    }
    process.stdout.write(`slika dan ${day.n}… `);
    try {
      images.push(await loadImage(day));
      console.log("ok");
    } catch (err) {
      console.log("FAIL", err instanceof Error ? err.message : err);
      images.push(null);
    }
  }

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  loadFont(doc, "DejaVuSans.ttf", "DejaVuSans.ttf", "normal");
  loadFont(doc, "DejaVuSans-Bold.ttf", "DejaVuSans-Bold.ttf", "bold");
  doc.setFont("DejaVu", "normal");

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const total = 2 + DAYS.length;

  cover(doc, pageW, pageH);
  addFooter(doc, pageW, pageH, 1, total);

  doc.addPage();
  howTo(doc, pageW);
  addFooter(doc, pageW, pageH, 2, total);

  DAYS.forEach((day, i) => {
    doc.addPage();
    dayPage(doc, day, images[i] ?? { buf: Buffer.alloc(0), format: "JPEG", dest: "" }, pageW);
    addFooter(doc, pageW, pageH, i + 3, total);
  });

  const pdfPath = join(OUT_DIR, "Skybooplan-objave-14-dni.pdf");
  writeFileSync(pdfPath, Buffer.from(doc.output("arraybuffer")));
  console.log(`\nPDF: ${pdfPath}`);
  console.log(`Slike: ${IMG_DIR}`);
}

await main();
