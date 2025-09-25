import net from 'net';
import iconv from 'iconv-lite';

function esc(...bytes) { return Buffer.from(bytes); }

// =====================
// EPSON (TIS-620)
// =====================
function epsonSetThai() {
  const ESC = 0x1B;
  return Buffer.concat([
    esc(ESC, 0x52, 0x0B), // International: Thai
    esc(ESC, 0x74, 0x15)  // Codepage 21 (TIS-620)
  ]);
}

// =====================
// XPRINTER (CP874 / codePageByte=70)
// Init sequence based on your working project
// =====================
function xprinterSetThaiCP874() {
  const ESC = 0x1B, GS = 0x1D, FS = 0x1C;
  return Buffer.concat([
    esc(ESC, 0x40),        // ESC @ (Initialize)
    esc(FS, 0x2E),         // FS . (cancel Chinese mode if any)
    esc(ESC, 0x52, 0x00),  // ESC R 0 (International: USA to avoid conflicts)
    esc(ESC, 0x74, 70),    // ESC t 70 (select code page 70 -> CP874 on XP series)
    esc(GS, 0x74, 70),     // GS t 70 (some firmware honors GS t)
    esc(ESC, 0x4D, 0x00)   // ESC M 0 (Font A)
  ]);
}

function cutPaper() {
  const GS = 0x1D;
  return esc(GS, 0x56, 0x42, 0x00); // Partial cut
}

export async function printEpson({ host, port, title = 'SHABU ORDER', lines = [] }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const chunks = [];
    try {
      chunks.push(epsonSetThai());
      chunks.push(iconv.encode(`\n${title}\n`, 'TIS-620'));
      chunks.push(iconv.encode('------------------------------\n', 'TIS-620'));
      for (const line of lines) chunks.push(iconv.encode((line ?? '') + '\n', 'TIS-620'));
      chunks.push(iconv.encode('------------------------------\n', 'TIS-620'));
      chunks.push(iconv.encode('ขอบคุณครับ/ค่ะ\n', 'TIS-620'));
      chunks.push(Buffer.from('\n\n\n'));
      chunks.push(cutPaper());
      const payload = Buffer.concat(chunks);
      const timer = setTimeout(() => { socket.destroy(); reject(new Error('Printer timeout')); }, 4000);
      socket.connect(port, host, () => {
        socket.write(payload, () => { clearTimeout(timer); socket.end(); resolve({ ok: true }); });
      });
      socket.on('error', (err) => { clearTimeout(timer); reject(err); });
    } catch (e) { reject(e); }
  });
}

// New: Thai-capable Xprinter print using CP874
export async function printXprinterThaiCP874({ host, port, title = 'SHABU ORDER', lines = [] }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const chunks = [];
    try {
      chunks.push(xprinterSetThaiCP874());
      chunks.push(iconv.encode(`\n${title}\n`, 'CP874'));
      chunks.push(iconv.encode('------------------------------\n', 'CP874'));
      for (const line of lines) chunks.push(iconv.encode((line ?? '') + '\n', 'CP874'));
      chunks.push(iconv.encode('------------------------------\n', 'CP874'));
      chunks.push(iconv.encode('ขอบคุณครับ/ค่ะ\n', 'CP874'));
      chunks.push(Buffer.from('\n\n\n'));
      chunks.push(cutPaper());
      const payload = Buffer.concat(chunks);
      const timer = setTimeout(() => { socket.destroy(); reject(new Error('Printer timeout')); }, 4000);
      socket.connect(port, host, () => {
        socket.write(payload, () => { clearTimeout(timer); socket.end(); resolve({ ok: true }); });
      });
      socket.on('error', (err) => { clearTimeout(timer); reject(err); });
    } catch (e) { reject(e); }
  });
}

// Kept for fallback ASCII test (if needed)
export async function printXprinterAscii({ host, port, title = 'SHABU ORDER', lines = [] }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const parts = [];
    parts.push(Buffer.from(`\n${title}\n`, 'ascii'));
    parts.push(Buffer.from('------------------------------\n', 'ascii'));
    for (const line of lines) parts.push(Buffer.from((line ?? '') + '\n', 'ascii'));
    parts.push(Buffer.from('------------------------------\n\n\n', 'ascii'));
    parts.push(cutPaper());
    const payload = Buffer.concat(parts);
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('Printer timeout')); }, 4000);
    socket.connect(port, host, () => {
      socket.write(payload, () => { clearTimeout(timer); socket.end(); resolve({ ok: true }); });
    });
    socket.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}
