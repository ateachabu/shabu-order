// services/escposPrinter.js
import net from "net";
import iconv from "iconv-lite";

// =====================
// Helpers
// =====================
function esc(...bytes) {
  return Buffer.from(bytes);
}
function cutPaper() {
  return Buffer.from([0x1D, 0x56, 0x41, 0x10]); // GS V A n
}

// =====================
// Epson (TIS-620)
// =====================
function epsonSetThai() {
  const ESC = 0x1B;
  return Buffer.concat([
    Buffer.from([ESC, 0x40]),       // ESC @ init
    Buffer.from([ESC, 0x52, 0x0B]), // ESC R 11 (Thai international)
    Buffer.from([ESC, 0x74, 0x15])  // ESC t 21 (TIS-620)
  ]);
}

export async function printEpson({ host, port, title = 'SHABU ORDER', lines = [] }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(10000);
    socket.setKeepAlive(true, 2000);
    socket.setNoDelay(true);

    const chunks = [];
    try {
      chunks.push(epsonSetThai());
      chunks.push(iconv.encode(`\n${title}\n`, 'tis-620'));
      chunks.push(iconv.encode('------------------------------\n', 'tis-620'));
      for (const line of lines) chunks.push(iconv.encode((line ?? '') + '\n', 'tis-620'));
      chunks.push(iconv.encode('------------------------------\n', 'tis-620'));
      chunks.push(iconv.encode('ขอบคุณครับ/ค่ะ\n', 'tis-620'));
      chunks.push(Buffer.from('\n\n\n'));
      chunks.push(cutPaper());

      const payload = Buffer.concat(chunks);

      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('Printer timeout'));
      }, 12000);

      socket.connect(port, host, () => {
        socket.write(payload, () => {
          clearTimeout(timer);
          setTimeout(() => { socket.end(); resolve({ ok: true }); }, 200);
        });
      });

      socket.on('error', (err) => { clearTimeout(timer); reject(err); });
      socket.on('timeout', () => { clearTimeout(timer); reject(new Error('Printer timeout')); });
    } catch (e) { reject(e); }
  });
}

// =====================
// XPrinter (CP874)
// =====================
const XPR_CODEPAGE = Number(process.env.XPR_CODEPAGE || 70);

function xprinterSetThaiCP874() {
  const ESC = 0x1B, GS = 0x1D, FS = 0x1C;
  return Buffer.concat([
    esc(ESC, 0x40),               // ESC @ init
    esc(FS, 0x2E),                // FS . (Cancel Chinese mode)
    esc(ESC, 0x52, 0x00),         // ESC R 0 (International: USA)
    esc(ESC, 0x74, XPR_CODEPAGE), // ESC t n
    esc(GS, 0x74, XPR_CODEPAGE),  // GS t n (บางรุ่นใช้ตัวนี้)
    esc(ESC, 0x4D, 0x00)          // ESC M 0 (Font A)
  ]);
}

export async function printXprinterThaiCP874({ host, port, title = 'SHABU ORDER', lines = [] }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(10000);
    socket.setKeepAlive(true, 2000);
    socket.setNoDelay(true);

    const chunks = [];
    try {
      chunks.push(xprinterSetThaiCP874());
      chunks.push(iconv.encode(`\n${title}\n`, 'cp874'));
      chunks.push(iconv.encode('------------------------------\n', 'cp874'));
      for (const line of lines) chunks.push(iconv.encode((line ?? '') + '\n', 'cp874'));
      chunks.push(iconv.encode('------------------------------\n', 'cp874'));
      chunks.push(iconv.encode('ขอบคุณครับ/ค่ะ\n', 'cp874'));
      chunks.push(Buffer.from('\n\n\n'));
      chunks.push(cutPaper());

      const payload = Buffer.concat(chunks);

      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('Printer timeout'));
      }, 12000);

      socket.connect(port, host, () => {
        socket.write(payload, () => {
          clearTimeout(timer);
          setTimeout(() => { socket.end(); resolve({ ok: true }); }, 200);
        });
      });

      socket.on('error', (err) => { clearTimeout(timer); reject(err); });
      socket.on('timeout', () => { clearTimeout(timer); reject(new Error('Printer timeout')); });
    } catch (e) { reject(e); }
  });
}
