// public/js/client.js (show image + +/-)
const qs = new URLSearchParams(location.search);
oneTimeSetTable(qs.get('table') || 'A');

const state = { menu: { items: [], categories: [] }, cart: [] };

function oneTimeSetTable(t) {
  const label = document.getElementById('tableLabel');
  label.textContent = `โต๊ะ ${t}`;
  label.dataset.table = t;
}

function renderMenu(list) {
  const grid = document.getElementById('menuGrid');
  grid.innerHTML = '';
  list.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      ${item.image ? `<img src="${item.image}" style="width:100%;height:120px;object-fit:cover;border-radius:12px" />` : ''}
      <h4>${item.name}</h4>
      <div style="opacity:.7">${item.category || ''}</div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
        <button class="btn btn-minus" data-name="${item.name}">−</button>
        <span id="qty-${cssSafe(item.name)}">0</span>
        <button class="btn btn-plus" data-name="${item.name}">+</button>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('.btn-plus').forEach(btn => {
    btn.onclick = () => changeQty(btn.dataset.name, +1);
  });
  grid.querySelectorAll('.btn-minus').forEach(btn => {
    btn.onclick = () => changeQty(btn.dataset.name, -1);
  });
}

function cssSafe(s){ return s.replace(/[^a-z0-9_-]/gi,'_'); }

function changeQty(name, delta){
  const item = state.menu.items.find(i => i.name === name);
  if (!item) return;
  const entry = state.cart.find(x => x.name === name && x.category === item.category) || (()=> {
    const e = { name, category: item.category, qty: 0 };
    state.cart.push(e); return e;
  })();
  entry.qty = Math.max(0, (entry.qty || 0) + delta);
  if (entry.qty === 0) {
    const idx = state.cart.indexOf(entry);
    if (idx >= 0) state.cart.splice(idx, 1);
  }
  document.getElementById('qty-'+cssSafe(name)).textContent = entry.qty || 0;
  updateCartInfo();
}

function updateCartInfo() {
  const n = state.cart.reduce((s, x) => s + x.qty, 0);
  document.getElementById('cartInfo').textContent = `ตะกร้า: ${n} รายการ`;
}

async function loadMenu() {
  const res = await fetch('/api/menu');
  state.menu = await res.json();
  renderMenu(state.menu.items);
}

function applySearch() {
  const q = document.getElementById('search').value.trim();
  if (!q) return renderMenu(state.menu.items);
  const list = state.menu.items.filter(i => (i.name||'').includes(q));
  renderMenu(list);
}

async function submitOrder() {
  if (state.cart.length === 0) return alert('ยังไม่ได้เลือกเมนู');
  const table = document.getElementById('tableLabel').dataset.table;
  const note = prompt('หมายเหตุ (ถ้ามี)');
  const res = await fetch('/api/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, items: state.cart, note })
  });
  const data = await res.json();
  if (!data.ok) return alert(data.error || 'ส่งไม่สำเร็จ');
  state.cart = [];
  renderMenu(state.menu.items);
  updateCartInfo();
  alert(`ส่งออเดอร์แล้ว เลขที่ #${data.orderId}`);
}

document.getElementById('search').addEventListener('input', applySearch);
document.getElementById('submitBtn').addEventListener('click', submitOrder);

loadMenu();
