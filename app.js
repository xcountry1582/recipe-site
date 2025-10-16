const grid = document.getElementById('grid');
const q = document.getElementById('q');
const tpl = document.getElementById('card-tpl');
let all = [];

async function load() {
  const res = await fetch('./data/recipes.json', { cache: 'no-store' });
  all = await res.json();
  render(all);
}
function render(list) {
  grid.innerHTML = '';
  list.forEach(r => {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.thumb').src = '../' + (r.media?.thumb || 'site/placeholder.jpg');
    node.querySelector('.title').textContent = r.title;
    node.querySelector('.meta').textContent =
      [r.servings && `${r.servings} servings`, r.prep_time && `prep ${r.prep_time}`, r.cook_time && `cook ${r.cook_time}`]
      .filter(Boolean).join(' · ');
    const ing = node.querySelector('.ingredients');
    (r.ingredients || []).slice(0,5).forEach(i => {
      const li = document.createElement('li'); li.textContent = i; ing.appendChild(li);
    });
    const steps = node.querySelector('.steps');
    (r.steps || []).forEach(s => {
      const li = document.createElement('li'); li.textContent = s; steps.appendChild(li);
    });
    grid.appendChild(node);
  });
}
q.addEventListener('input', () => {
  const term = q.value.trim().toLowerCase();
  if (!term) return render(all);
  const parts = term.split(/\s+/);
  render(all.filter(r => {
    const hay = (r.title + ' ' + (r.ingredients||[]).join(' ')).toLowerCase();
    return parts.every(p => hay.includes(p));
  }));
});
load();
