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
const MAX_HIEN = 12;

// Chủ đề video, đoán từ tiêu đề (theo thứ tự, khớp cái nào trước lấy cái đó).
// Kênh có chủ đề mới thì thêm một dòng vào đây.
const CHU_DE = [
  { id: 'so-sanh', ten: 'So sánh', re: /\bvs\b|so sánh|đấu với|hay .*\?/i },
  { id: 'top', ten: 'Top & tư vấn', re: /\btop ?\d|đáng mua|nên mua|dưới \d+ ?triệu|tầm \d+ ?triệu/i },
  { id: 'gear', ten: 'Gear & phụ kiện', re: /bàn phím|keyboard|keycap|dasai|chuột|tai nghe|loa|củ sạc|ốp lưng|gear|phụ kiện|setup/i },
];
const TEN_CHU_DE = { ...Object.fromEntries(CHU_DE.map(c => [c.id, c.ten])), review: 'Review' };
const chuDe = t => (CHU_DE.find(c => c.re.test(t)) || { id: 'review' }).id;

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
    const tieuDe = pick(e, /<title>([\s\S]*?)<\/title>/);
    const laShort = link.includes('/shorts/');
    return {
      id, tieuDe, link, laShort,
      chuDe: chuDe(tieuDe),
      ngayDang: pick(e, /<published>([^<]+)</),
      // Video dài: mqdefault (16:9, không viền đen). Shorts: hqdefault, CSS phóng to để cắt viền.
      anh: `https://i.ytimg.com/vi/${id}/${laShort ? 'hqdefault' : 'mqdefault'}.jpg`,
    };
  }).filter(v => v.id);
}

const ngayVN = iso => { const d = new Date(new Date(iso).getTime() + 7 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }; // giờ Việt Nam

function bong(v) {
  const ten = v.tieuDe.replace(/\s*#\S+/g, '').trim() || v.tieuDe; // bỏ hashtag cho gọn (giữ nguyên nếu tiêu đề chỉ toàn hashtag)
  return `
    <a class="vb${v.laShort ? ' is-short' : ''}" data-loai="${v.chuDe}${v.laShort ? ' shorts' : ''}" href="${esc(v.link)}" target="_blank" rel="noopener" title="${esc(ten)}">
      <span class="vb-o"><span class="vb-i"><img src="${esc(v.anh)}" alt="" loading="lazy" width="320" height="180"></span><span class="vb-tag">${v.laShort ? 'Shorts' : 'Video'}</span></span>
      <span class="vb-t">${esc(ten)}</span>
      <span class="vb-m">${TEN_CHU_DE[v.chuDe]} · ${ngayVN(v.ngayDang)}</span>
    </a>`;
}

function htmlMuc(ds) {
  ds = ds.slice(0, MAX_HIEN);
  if (!ds.length) return '';
  const dem = id => ds.filter(v => (id === 'shorts' ? v.laShort : v.chuDe === id)).length;
  const tabs = [
    ['tat-ca', 'Tất cả', ds.length],
    ...[...CHU_DE.map(c => c.id), 'review'].map(id => [id, TEN_CHU_DE[id], dem(id)]),
    ['shorts', 'Shorts', dem('shorts')],
  ].filter(([, , n]) => n > 0)
    .map(([id, ten, n], i) => `<button type="button" class="vtab" data-loc="${id}" aria-pressed="${i === 0}">${ten} <small>${n}</small></button>`)
    .join('');
  return `
<section id="video"><div class="wrap">
  <div class="vhead">
    <div><h2>Video mới trên kênh</h2><p class="sub">Tự cập nhật từ YouTube. Chọn chủ đề để lọc.</p></div>
    <a class="btn ghost" href="https://www.youtube.com/@8tek-net/videos" target="_blank" rel="noopener">Xem tất cả trên YouTube →</a>
  </div>
  <div class="vtabs" role="group" aria-label="Lọc video theo chủ đề">${tabs}</div>
  <div class="vrow">${ds.map(bong).join('')}
  </div>
</div></section>
<script>
document.querySelectorAll('.vtab').forEach(b => b.addEventListener('click', () => {
  const loc = b.dataset.loc;
  document.querySelectorAll('.vtab').forEach(x => x.setAttribute('aria-pressed', x === b));
  document.querySelectorAll('.vb').forEach(v => { v.hidden = loc !== 'tat-ca' && !v.dataset.loai.split(' ').includes(loc); });
}));
</script>
`;
}

const xml = await layFeed();
const ds = phanTich(xml);
if (!ds.length && !/<feed/.test(xml)) throw new Error('RSS không hợp lệ, giữ nguyên trang');

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data', 'videos.json'), JSON.stringify(ds, null, 2) + '\n'); // không lưu lượt xem: số view đổi liên tục sẽ tạo commit mỗi giờ

const fIndex = join(ROOT, 'index.html');
const index = readFileSync(fIndex, 'utf8');
const re = /(<!-- VIDEO:BAT-DAU -->)[\s\S]*?(<!-- VIDEO:KET-THUC -->)/;
if (!re.test(index)) throw new Error('Không thấy dấu VIDEO:BAT-DAU / VIDEO:KET-THUC trong index.html');
const moi = index.replace(re, `$1${htmlMuc(ds)}$2`);
if (moi !== index) writeFileSync(fIndex, moi);
console.log(`OK: ${ds.length} video (${ds.filter(v => v.laShort).length} shorts) · ${Object.entries(Object.groupBy(ds, v => v.chuDe)).map(([k, a]) => `${k}:${a.length}`).join(' ')}${moi !== index ? ' (trang đã đổi)' : ' (không đổi)'}`);
