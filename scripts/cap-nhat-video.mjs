// Cập nhật danh sách video YouTube mới nhất lên trang chủ 8tek.net.
// Đọc RSS công khai của kênh (không cần API key), ghi data/videos.json
// và thay phần HTML giữa hai dấu <!-- VIDEO:BAT-DAU --> ... <!-- VIDEO:KET-THUC --> trong index.html.
// Chạy: node scripts/cap-nhat-video.mjs   (GitHub Actions chạy mỗi giờ, máy tính cũng chạy được)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHANNEL_ID = 'UCGaSEazkuMsTNtIGf1bTpLA';
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_VIDEO = 6, MAX_SHORT = 6;

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pick = (xml, re) => { const m = xml.match(re); return m ? decode(m[1].trim()) : ''; };

async function layFeed() {
  let loi;
  for (let lan = 1; lan <= 3; lan++) {
    try {
      const r = await fetch(FEED, { headers: { 'user-agent': 'Mozilla/5.0 (8tek.net site updater)' } });
      if (r.ok) return await r.text();
      loi = new Error(`HTTP ${r.status}`);
    } catch (e) { loi = e; }
    await new Promise(r => setTimeout(r, 3000 * lan));
  }
  throw loi;
}

function phanTich(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const id = pick(e, /<yt:videoId>([^<]+)</);
    const link = pick(e, /<link rel="alternate" href="([^"]+)"/);
    return {
      id,
      tieuDe: pick(e, /<title>([\s\S]*?)<\/title>/),
      link,
      laShort: link.includes('/shorts/'),
      ngayDang: pick(e, /<published>([^<]+)</),
      anh: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }).filter(v => v.id);
}

const ngayVN = iso => new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' });

function the(v) {
  return `
      <a class="vcard${v.laShort ? ' short' : ''}" href="${esc(v.link)}" target="_blank" rel="noopener">
        <span class="vthumb"><img src="${esc(v.anh)}" alt="" loading="lazy" width="480" height="360"><span class="vplay">▶</span></span>
        <span class="vtitle">${esc(v.tieuDe)}</span>
        <span class="vmeta">${v.laShort ? 'Shorts · ' : ''}${ngayVN(v.ngayDang)}</span>
      </a>`;
}

function htmlMuc(ds) {
  const video = ds.filter(v => !v.laShort).slice(0, MAX_VIDEO);
  const shorts = ds.filter(v => v.laShort).slice(0, MAX_SHORT);
  if (!video.length && !shorts.length) return '';
  return `
<section id="video"><div class="wrap">
  <h2>Video mới trên kênh</h2>
  <p class="sub">Tự cập nhật từ kênh YouTube 8TEK.</p>
  ${video.length ? `<div class="vgrid">${video.map(the).join('')}
  </div>` : ''}
  ${shorts.length ? `<h3 class="vhead">Shorts</h3>
  <div class="vgrid shorts">${shorts.map(the).join('')}
  </div>` : ''}
</div></section>
`;
}

const xml = await layFeed();
const ds = phanTich(xml);
if (!ds.length && !/<feed/.test(xml)) throw new Error('RSS không hợp lệ, giữ nguyên trang');

mkdirSync(join(ROOT, 'data'), { recursive: true });
const jsonMoi = JSON.stringify(ds, null, 2) + '\n'; // không lưu lượt xem: số view đổi liên tục sẽ tạo commit mỗi giờ
writeFileSync(join(ROOT, 'data', 'videos.json'), jsonMoi);

const fIndex = join(ROOT, 'index.html');
const index = readFileSync(fIndex, 'utf8');
const re = /(<!-- VIDEO:BAT-DAU -->)[\s\S]*?(<!-- VIDEO:KET-THUC -->)/;
if (!re.test(index)) throw new Error('Không thấy dấu VIDEO:BAT-DAU / VIDEO:KET-THUC trong index.html');
const moi = index.replace(re, `$1${htmlMuc(ds)}$2`);
if (moi !== index) writeFileSync(fIndex, moi);
console.log(`OK: ${ds.filter(v => !v.laShort).length} video, ${ds.filter(v => v.laShort).length} shorts${moi !== index ? ' (trang đã đổi)' : ' (không đổi)'}`);
