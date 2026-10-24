const $ = id => document.getElementById(id);
const state = { api: '', recipes: [], cursor: null, request: 0, busy: false };
const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><rect width="640" height="480" fill="#eee7dc"/><circle cx="320" cy="220" r="135" fill="#fffaf1" stroke="#d6c7af" stroke-width="8"/><path d="M310 255 Q255 180 310 145 Q380 175 340 250" fill="#778b56"/><text x="320" y="410" text-anchor="middle" fill="#665f52" font-family="sans-serif" font-size="22">From our family kitchen</text></svg>`)}`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ingredientText = value => typeof value === 'string' ? value : [value.quantity, value.unit, value.name].filter(Boolean).join(' ');
const allergyLabels = {milk:'milk / dairy',egg:'eggs',fish:'fish',shellfish:'shellfish',tree_nuts:'tree nuts',peanut:'peanuts',wheat:'wheat',soy:'soy',sesame:'sesame',chicken:'chicken'};
const selectedAllergies = () => [...document.querySelectorAll('#allergens input:checked')].map(input => input.value);
const filteringAllergies = () => selectedAllergies().length || $('avoid').value.trim();

function safeUrl(value) {
  try { const url = new URL(value, location.href); return url.protocol === 'https:' ? url.href : ''; }
  catch { return ''; }
}

function photo(img, recipe) {
  img.src = recipe.media?.thumb ? safeUrl(recipe.media.thumb) || PLACEHOLDER : PLACEHOLDER;
  img.alt = recipe.title;
  img.addEventListener('error', () => { img.src = PLACEHOLDER; }, { once: true });
}

function render() {
  $('grid').replaceChildren();
  for (const recipe of state.recipes) {
    const tile = $('card-tpl').content.firstElementChild.cloneNode(true);
    photo(tile.querySelector('.thumb'), recipe);
    tile.querySelector('.title').textContent = recipe.title;
    tile.querySelector('.snippet').textContent = recipe.ingredients.map(ingredientText).join(' · ');
    tile.querySelector('.date').textContent = `${recipe.ingredients.length} ingredients${filteringAllergies() && recipe.allergy_screening?.label_checks?.length ? ' · Label check needed' : ''}`;
    const button = tile.querySelector('button');
    button.setAttribute('aria-label', `View recipe: ${recipe.title}`);
    button.addEventListener('click', () => openRecipe(recipe));
    $('grid').append(tile);
  }
  $('empty-state').hidden = state.recipes.length > 0;
  $('empty-state').textContent = filteringAllergies()
    ? 'No recipes match these filters. Selected allergens and ingredients needing label checks may exclude recipes.'
    : $('search').value || $('ingredients').value
    ? 'No matching recipes yet. Try fewer ingredients or another recipe name.'
    : 'Your collection is growing. Published recipes will appear here as they are ready.';
  $('results-meta').textContent = `${state.recipes.length} recipe${state.recipes.length === 1 ? '' : 's'}${state.cursor ? ' loaded · more available' : ''}${filteringAllergies() ? ' · allergy filters applied' : ''}`;
  $('loadMore').hidden = true;
}

async function search(reset = true) {
  if (!state.api) return;
  const request = ++state.request;
  state.busy = true;
  $('loadMore').disabled = true;
  $('results-meta').textContent = 'Finding recipes…';
  const params = new URLSearchParams({q: $('search').value.trim(), ingredients: $('ingredients').value.trim()});
  params.set('allergens', selectedAllergies().join(','));
  params.set('avoid', $('avoid').value.trim());
  params.set('hide_label_checks', String($('hide-label-checks').checked));
  try {
    const collected = new Map((reset ? [] : state.recipes).map(recipe => [recipe.id, recipe]));
    let cursor = reset ? null : state.cursor;
    const seenCursors = new Set();
    do {
      if (cursor) params.set('cursor', cursor); else params.delete('cursor');
      const response = await fetch(`${state.api}/recipes?${params}`, {cache: 'no-store'});
      if (!response.ok) throw new Error(response.status === 400 ? 'Try a shorter search.' : 'Recipes could not be loaded. Please try again.');
      const data = await response.json();
      if (request !== state.request) return;
      for (const recipe of data.recipes) collected.set(recipe.id, recipe);
      cursor = data.next_cursor || null;
      if (cursor && seenCursors.has(cursor)) throw new Error('The recipe list could not finish loading. Please retry.');
      if (cursor) seenCursors.add(cursor);
      state.recipes = [...collected.values()].sort((a,b) => a.title.localeCompare(b.title));
      state.cursor = cursor;
      render();
      if (cursor) $('results-meta').textContent = `Loading the full collection… ${state.recipes.length} recipes loaded`;
    } while (cursor);
  } catch (error) {
    if (request !== state.request) return;
    $('results-meta').textContent = error.message;
    $('retry').hidden = false;
  } finally {
    if (request === state.request) { state.busy = false; $('loadMore').disabled = false; }
  }
}

function openRecipe(recipe) {
  const source = safeUrl(recipe.source?.recipe_url || recipe.source?.video_url || '');
  const screening = recipe.allergy_screening || {detected:[],label_checks:[]};
  $('modalContent').innerHTML = `<div class="detail"><img alt=""/><div>
    <p class="eyebrow">FROM OUR RECIPE BOOK</p><h3 id="recipe-title">${escapeHtml(recipe.title)}</h3>
    <p class="recipe-times">${[
      recipe.servings && `Serves ${recipe.servings}`,
      recipe.prep_time && `Prep: ${recipe.prep_time}`,
      recipe.cook_time && `Cook: ${recipe.cook_time}`
    ].filter(Boolean).map(escapeHtml).join(' · ')}</p>
    <div class="allergy-note"><strong>Allergy ingredient check</strong>
    <p>${screening.detected.length ? `Ingredient names flag: ${screening.detected.map(x => escapeHtml(allergyLabels[x] || x)).join(', ')}.` : 'No common allergen keywords flagged. This does not establish that the recipe is allergen-free.'}</p>
    ${screening.label_checks.length ? `<p>Check product labels for: ${screening.label_checks.map(escapeHtml).join('; ')}.</p>` : ''}
    <p>Verify all ingredients and cross-contact before cooking.</p></div>
    <h4>Ingredients</h4><ul>${recipe.ingredients.map(i => `<li>${escapeHtml(ingredientText(i))}</li>`).join('')}</ul>
    <h4>Cooking instructions</h4><ol>${recipe.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    <section class="recipe-notes"><h4>Notes</h4><p>${recipe.notes ? escapeHtml(recipe.notes) : 'No notes added yet.'}</p></section>
    ${source && (recipe.source?.recipe_url || recipe.source?.video_url) ? `<p class="source">From <a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(recipe.source?.creator || 'the original recipe')}</a></p>` : ''}
    <button class="btn" id="printRecipe" type="button">Print recipe</button>
  </div></div>`;
  photo($('modalContent').querySelector('img'), recipe);
  $('printRecipe').addEventListener('click', () => window.print());
  history.replaceState(null, '', `?recipe=${encodeURIComponent(recipe.id)}`);
  $('modal').showModal();
}

$('closeModal').addEventListener('click', () => $('modal').close());
$('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').close(); });
$('modal').addEventListener('close', () => history.replaceState(null, '', location.pathname));
$('searchForm').addEventListener('submit', e => { e.preventDefault(); $('retry').hidden = true; search(); });
$('loadMore').addEventListener('click', () => { if (!state.busy) search(false); });
$('retry').addEventListener('click', () => { $('retry').hidden = true; search(); });
let timer;
function allergyChanged() {
  ++state.request; // Ignore a response for the previous allergy selection.
  state.recipes = []; state.cursor = null; render();
  const count = selectedAllergies().length + $('avoid').value.split(',').filter(x => x.trim()).length;
  $('allergy-count').textContent = count ? `(${count} selected)` : '';
  if ($('modal').open) $('modal').close();
  $('empty-state').hidden = true;
  $('results-meta').textContent = 'Applying allergy filters…';
  clearTimeout(timer); timer = setTimeout(() => search(), 350);
}
for (const id of ['search', 'ingredients']) $(id).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(), 350); });
$('allergens').addEventListener('change', allergyChanged);
$('avoid').addEventListener('input', allergyChanged);
$('hide-label-checks').addEventListener('change', allergyChanged);
$('clear-allergies').addEventListener('click', () => {
  document.querySelectorAll('#allergens input').forEach(input => { input.checked = false; });
  $('avoid').value = ''; $('hide-label-checks').checked = false; allergyChanged();
});

try {
  const config = await fetch('./config.json', {cache: 'no-store'}).then(r => r.json());
  state.api = safeUrl(config.apiBase).replace(/\/$/, '');
  if (!config.apiBase || !state.api) throw new Error('The recipe catalog is being connected. Please check back shortly.');
  await search();
  const id = new URLSearchParams(location.search).get('recipe');
  if (id) {
    const response = await fetch(`${state.api}/recipes/${encodeURIComponent(id)}`);
    if (response.ok) openRecipe(await response.json());
    else $('results-meta').textContent = 'That recipe is not available. Browse the collection below.';
  }
} catch (error) { $('results-meta').textContent = error.message; }
