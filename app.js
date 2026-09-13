const DB_NAME = 'outfit-selector';
const STORE_NAME = 'clothes';
let db;
let clothes = [];
let activeFilter = 'all';
let searchQuery = '';

const $ = (selector) => document.querySelector(selector);

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function getAllClothes() {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function saveClothing(item) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).add(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function removeClothing(id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}
function toPng(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      // Remove the edge-connected background using the four corners as its color reference.
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = pixels.data;
      const width = canvas.width;
      const height = canvas.height;
      const corners = [0, (width - 1) * 4, (height - 1) * width * 4, ((height * width) - 1) * 4];
      const background = corners.reduce((sum, index) => {
        sum[0] += data[index]; sum[1] += data[index + 1]; sum[2] += data[index + 2];
        return sum;
      }, [0, 0, 0]).map((value) => value / corners.length);
      const tolerance = 52;
      const visited = new Uint8Array(width * height);
      const queue = [];
      const add = (x, y) => {
        const index = y * width + x;
        if (visited[index]) return;
        visited[index] = 1;
        queue.push(index);
      };
      for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
      for (let y = 1; y < height - 1; y++) { add(0, y); add(width - 1, y); }
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor];
        const pixel = index * 4;
        const distance = Math.hypot(data[pixel] - background[0], data[pixel + 1] - background[1], data[pixel + 2] - background[2]);
        if (distance > tolerance) continue;
        data[pixel + 3] = 0;
        const x = index % width;
        const y = Math.floor(index / width);
        if (x > 0) add(x - 1, y); if (x < width - 1) add(x + 1, y);
        if (y > 0) add(x, y - 1); if (y < height - 1) add(x, y + 1);
      }
      context.putImageData(pixels, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG conversion failed')), 'image/png');
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image could not be read')); };
    image.src = url;
  });
}
function updateCount() { $('#item-count').textContent = `${clothes.length} ${clothes.length === 1 ? 'piece' : 'pieces'} in your closet`; }
function renderClothes() {
  const grid = $('#clothing-grid');
  const categoryItems = activeFilter === 'all' ? clothes : clothes.filter((item) => item.category === activeFilter);
  const visible = categoryItems.filter((item) => item.name.toLowerCase().includes(searchQuery));
  grid.innerHTML = visible.length ? visible.map((item) => `<article class="clothing-card"><button class="delete-button" data-delete="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button><img src="${URL.createObjectURL(item.image)}" alt="${escapeHtml(item.name)}"><div class="clothing-info"><strong>${escapeHtml(item.name)}</strong><small>${item.category}</small></div></article>`).join('') : '<p class="empty-collection">No matching clothes. Try another search or add a new piece.</p>';
  grid.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => { await removeClothing(Number(button.dataset.delete)); await refresh(); }));
  updateCount();
}
function escapeHtml(value) { return value.replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char])); }
function suggest() {
  const tops = clothes.filter((item) => item.category === 'top');
  const bottoms = clothes.filter((item) => item.category === 'bottom');
  $('#outfit-empty').classList.toggle('hidden', tops.length > 0 && bottoms.length > 0);
  $('#outfit-grid').classList.toggle('hidden', !(tops.length > 0 && bottoms.length > 0));
  if (!tops.length || !bottoms.length) return;
  const top = tops[Math.floor(Math.random() * tops.length)];
  const bottom = bottoms[Math.floor(Math.random() * bottoms.length)];
  $('#suggested-top').src = URL.createObjectURL(top.image); $('#suggested-top-name').textContent = top.name;
  $('#suggested-bottom').src = URL.createObjectURL(bottom.image); $('#suggested-bottom-name').textContent = bottom.name;
}
async function refresh() { clothes = await getAllClothes(); renderClothes(); }
function showPage(name) {
  const pageName = ['today', 'closet', 'add'].includes(name) ? name : 'today';
  document.querySelectorAll('.page').forEach((page) => page.classList.toggle('hidden', page.dataset.page !== pageName));
  document.querySelectorAll('[data-page-link]').forEach((link) => {
    const active = link.dataset.pageLink === pageName;
    link.classList.toggle('active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (pageName === 'closet') renderClothes();
}

$('#suggest-button').addEventListener('click', suggest);
$('#clothing-form').addEventListener('submit', async (event) => { event.preventDefault(); const file = $('#image-input').files[0]; if (!file) { $('#form-message').textContent = 'Choose a photo before saving.'; return; } const button = event.target.querySelector('button[type=submit]'); button.disabled = true; $('#form-message').textContent = 'Saving photo...'; try { const image = await toPng(file); await saveClothing({ name: $('#name-input').value.trim() || (document.querySelector('input[name=category]:checked').value === 'top' ? 'Unnamed top' : 'Unnamed bottom'), category: document.querySelector('input[name=category]:checked').value, image, createdAt: new Date().toISOString() }); event.target.reset(); $('#image-preview').classList.add('hidden'); $('.upload-box').classList.remove('has-image'); $('#upload-title').textContent = 'Choose a photo'; $('#form-message').textContent = 'Clothing saved.'; await refresh(); window.location.hash = '#closet'; showPage('closet'); } catch (error) { $('#form-message').textContent = 'Could not save this photo. Please try again.'; } finally { button.disabled = false; } });
document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => { activeFilter = button.dataset.filter; document.querySelectorAll('.filter').forEach((item) => item.classList.toggle('active', item === button)); renderClothes(); }));
$('.site-search input').addEventListener('input', (event) => { searchQuery = event.target.value.trim().toLowerCase(); renderClothes(); });
window.addEventListener('hashchange', () => showPage(location.hash.slice(1) || 'today'));
$('#image-input').addEventListener('change', () => { const file = $('#image-input').files[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { $('#form-message').textContent = 'Photo is too large. Please choose one under 10 MB.'; return; } $('#image-preview').src = URL.createObjectURL(file); $('#image-preview').classList.remove('hidden'); $('.upload-box').classList.add('has-image'); $('#upload-title').textContent = file.name; $('#form-message').textContent = ''; });
$('#clothing-form').addEventListener('submit', async (event) => { event.preventDefault(); const file = $('#image-input').files[0]; if (!file) return; const button = event.target.querySelector('button[type=submit]'); button.disabled = true; try { const image = await toPng(file); await saveClothing({ name: $('#name-input').value.trim() || (document.querySelector('input[name=category]:checked').value === 'top' ? 'Unnamed top' : 'Unnamed bottom'), category: document.querySelector('input[name=category]:checked').value, image, createdAt: new Date().toISOString() }); event.target.reset(); $('#image-preview').classList.add('hidden'); $('.upload-box').classList.remove('has-image'); $('#upload-title').textContent = 'Choose a photo'; $('#form-message').textContent = ''; await refresh(); showPage('closet'); } catch (error) { $('#form-message').textContent = 'Could not save this photo. Please try again.'; } finally { button.disabled = false; } });
(async () => { try { db = await openDatabase(); await refresh(); showPage(location.hash.slice(1) || 'today'); } catch { $('#form-message').textContent = 'Local storage is unavailable in this browser.'; } })();
