// Tiny helper: safe fetch + JSON
async function loadRecipes() {
  const res = await fetch('./data/recipes.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load recipes.json (${res.status})`);
  return res.json();
}

const state = {
  all: [],
  filtered: [],
  page: 0,
  pageSize: 24,
  query: '',
  sort: 'new'
};

const el = {
  grid: document.getElementById('grid'),
  search: document.getElementById('search'),
  sort: document.getElementById('sort'),
  meta: document.getElementById('results-meta'),
  loadMore: document.getElementById('loadMore'),
  tpl: document.getElementById('card-tpl'),
  modal: document.getElementById('modal'),
  modalContent: document.getElementById('modalContent'),
  modalClose: document.getElementById('closeModal')
};

// graceful fallback image (SVG data URI)
const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'>
     <defs><linearGradient id='g' x1='0' x2='1'><stop stop-color='#0b1220'/><stop offset='1' stop-color='#101827'/></linearGradient></defs>
     <rect fill='url(#g)' width='100%' height='100%'/>
     <g fill='#334155'><rect x='60' y='210' width='520' height='140' rx='8'/></g>
     <g fill='#1f2937'><rect x='110' y='70' width='420' height='120' rx='12'/></g>
   </svg>`
)}`;

// Normalize records from data/items -> recipes.json
function normalize(r) {
  const title = (r.title || 'Untitled').trim();
  const thumb = r.media?.thumb ? prefixSlash(r.media.thumb) : '';
  const created = r.created_at ? Date.parse(r.created_at) : 0;
  const text = Array.isArray(r.steps) && r.steps.length ? String(r.steps[0]) : '';
  return { id: r.id, title, thumb, created, text, raw: r };
}

function prefixSlash(p) {
  // Keep relative paths working on Pages (already rooted at repo)
  if (!p) return '';
  if (p.startsWith('./') || p.startsWith('../')) return p.replace(/^\.\//, '');
  return p;
}

function filterAndSort() {
  const q = state.query.toLowerCase().trim();
  let list = state.all;

  if (q) {
    list = list.filter(({ title, text }) =>
      title.toLowerCase().includes(q) || text.toLowerCase().includes(q)
    );
  }

  switch (state.sort) {
    case 'new': list.sort((a,b)=> b.created - a.created); break;
    case 'old': list.sort((a,b)=> a.created - b.created); break;
    case 'az':  list.sort((a,b)=> a.title.localeCompare(b.title)); break;
    case 'za':  list.sort((a,b)=> b.title.localeCompare(a.title)); break;
  }

  state.filtered = list;
  state.page = 0;
  renderPage(true);
  updateMeta();
}

function updateMeta() {
  const total = state.all.length;
  const shown = Math.min(state.filtered.length, (state.page+1)*state.pageSize);
  const q = state.query.trim();
  el.meta.textContent = q
    ? `Showing ${shown} of ${state.filtered.length} results for “${q}” (catalog: ${total})`
    : `Showing ${shown} of ${state.filtered.length || total} recipes`;
}

function renderPage(reset=false) {
  const start = state.page * state.pageSize;
  const end = Math.min(start + state.pageSize, state.filtered.length);
  if (reset) el.grid.innerHTML = '';

  for (let i=start; i<end; i++) {
    const r = state.filtered[i];
    const node = el.tpl.content.firstElementChild.cloneNode(true);

    const link = node.querySelector('.thumb-link');
    const img = node.querySelector('.thumb');
    const title = node.querySelector('.title');
    const snip = node.querySelector('.snippet');
    const date = node.querySelector('.date');

    img.src = r.thumb || PLACEHOLDER;
    img.alt = r.title;
    title.textContent = r.title;
    snip.textContent = truncate(r.text || '', 160);
    date.textContent = r.created ? new Date(r.created).toLocaleDateString() : '';

    link.href = '#';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(r);
    });

    el.grid.appendChild(node);
  }

  const more = end < state.filtered.length;
  el.loadMore.hidden = !more;
  if (!more) el.loadMore.setAttribute('disabled', 'true');
  else el.loadMore.removeAttribute('disabled');
}

function truncate(s, n){
  if (!s) return '';
  return s.length > n ? s.slice(0, n-1) + '…' : s;
}

function openModal(r) {
  const raw = r.raw;
  const pretty = `
    <div class="detail">
      <img src="${r.thumb || PLACEHOLDER}" alt="${escapeHtml(r.title)} thumbnail" />
      <div>
        <h3>${escapeHtml(r.title)}</h3>
        ${raw.ingredients?.length ? `<h4>Ingredients</h4><ul>${raw.ingredients.map(i=>`<li>${escapeHtml(String(i))}</li>`).join('')}</ul>` : ''}
        ${raw.steps?.length ? `<h4>Notes</h4><p>${escapeHtml(String(raw.steps[0]))}</p>` : ''}
        ${raw.servings || raw.prep_time || raw.cook_time ? `
          <p class="meta-row">
            ${raw.servings ? `<strong>Servings:</strong> ${escapeHtml(String(raw.servings))}` : ''}
            ${raw.prep_time ? `&nbsp;&nbsp;<strong>Prep:</strong> ${escapeHtml(String(raw.prep_time))}` : ''}
            ${raw.cook_time ? `&nbsp;&nbsp;<strong>Cook:</strong> ${escapeHtml(String(raw.cook_time))}` : ''}
          </p>` : ''}
      </div>
    </div>`;
  el.modalContent.innerHTML = pretty;
  el.modal.showModal();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function bindEvents(){
  el.search.addEventListener('input', (e)=> {
    state.query = e.target.value || '';
    filterAndSort();
  });
  el.sort.addEventListener('change', (e)=> {
    state.sort = e.target.value;
    filterAndSort();
  });
  el.loadMore.addEventListener('click', () => {
    state.page++;
    renderPage(false);
    updateMeta();
  });
  el.modalClose.addEventListener('click', ()=> el.modal.close());
  el.modal.addEventListener('click', (e)=> {
    if (e.target === el.modal) el.modal.close();
  });
}

(async function init(){
  bindEvents();
  try {
    const data = await loadRecipes();
    state.all = Array.isArray(data) ? data.map(normalize) : [];
    // Ensure we have thumbnails relative to site root
    state.all.forEach(r=>{
      if (r.thumb && !r.thumb.startsWith('./') && !r.thumb.startsWith('http'))
        r.thumb = './' + r.thumb.replace(/^\/+/,'');
    });
    state.filtered = [...state.all];
    filterAndSort();
  } catch (err) {
    el.meta.textContent = `Failed to load recipes: ${err.message}`;
  }
})();
