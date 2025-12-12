const productListEl = document.getElementById('productList');
const appShell = document.querySelector('.app-shell');
appShell.style.display = 'none';
const searchInput = document.getElementById('searchInput');
const codeInput = document.getElementById('codeInput');
const sortSelect = document.getElementById('sortSelect');
const pageInfo = document.getElementById('pageInfo');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageSizeSelect = document.getElementById('pageSize');
const galleryEl = document.getElementById('gallery');
const mainImageEl = document.getElementById('mainImage');
const addImageBtn = document.getElementById('addImage');
const fileInput = document.getElementById('fileInput');
const productForm = document.getElementById('productForm');
const newProductBtn = document.getElementById('newProduct');
const deleteProductBtn = document.getElementById('deleteProduct');
const authScreen = document.getElementById('authScreen');
const logoutBtn = document.getElementById('logoutBtn');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const toggleFormBtn = document.getElementById('toggleForm');
const activeWarehouseLabel = document.getElementById('activeWarehouse');
const activeAccountLabel = document.getElementById('activeAccount');
const magazineStep = document.getElementById('magazineStep');
const accountStep = document.getElementById('accountStep');
const accountName = document.getElementById('accountName');
const logoutAccountBtn = document.getElementById('logoutAccount');
const magazineListEl = document.getElementById('magazineList');
const createMagazineForm = document.getElementById('createMagazineForm');
const joinMagazineForm = document.getElementById('joinMagazineForm');
const switchMagazineBtn = document.getElementById('switchMagazine');
const accountStatus = document.getElementById('accountStatus');
const magazineStatus = document.getElementById('magazineStatus');
const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const saveApiUrlBtn = document.getElementById('saveApiUrl');
const apiStatusEl = document.getElementById('apiStatus');

const dropdowns = {
  brand: document.getElementById('brandDropdown'),
  size: document.getElementById('sizeDropdown'),
  condition: document.getElementById('conditionDropdown'),
  drop: document.getElementById('dropDropdown'),
};

const datalists = {
  brand: document.getElementById('brandOptions'),
  size: document.getElementById('sizeOptions'),
  condition: document.getElementById('conditionOptions'),
  drop: document.getElementById('dropOptions'),
};

const DEFAULT_API_BASE_URL = 'http://localhost:4000';
const API_CONFIG_KEY = 'magazyn-api-config';

let apiConfig = { baseUrl: DEFAULT_API_BASE_URL };

let products = [];
let selectedProductId = null;
let currentPage = 1;
let magazines = [];
let selectedFilters = {
  brand: new Set(),
  size: new Set(),
  condition: new Set(),
  drop: new Set(),
};
let auth = {
  token: null,
  user: null,
  magazine: null,
};
let productFilters = { brand: [], size: [], condition: [], drop: [] };
let totalProducts = 0;

function unlockProductForm() {
  productForm.querySelectorAll('input, button, select, textarea').forEach((el) => {
    el.disabled = false;
    el.removeAttribute('aria-disabled');
  });
}

function normalizeBaseUrl(url) {
  return url.trim().replace(/\/+$/, '');
}

function persistApiConfig() {
  localStorage.setItem(API_CONFIG_KEY, JSON.stringify(apiConfig));
}

function restoreApiConfig() {
  const stored = localStorage.getItem(API_CONFIG_KEY);
  if (!stored) {
    apiBaseUrlInput.value = apiConfig.baseUrl;
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    if (parsed.baseUrl) {
      apiConfig.baseUrl = normalizeBaseUrl(parsed.baseUrl);
    }
  } catch (error) {
    console.error('Nie udało się odczytać ustawień API', error);
  }

  apiBaseUrlInput.value = apiConfig.baseUrl;
}

function getApiBaseUrl() {
  return normalizeBaseUrl(apiConfig.baseUrl || DEFAULT_API_BASE_URL);
}

function setApiStatus(message) {
  apiStatusEl.textContent = message;
}

async function validateApiConnection(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`${baseUrl}/healthz`, { signal: controller.signal });
    if (!response.ok) throw new Error();
    await response.json();
  } catch (error) {
    throw new Error('Brak połączenia z API pod wskazanym adresem');
  } finally {
    clearTimeout(timeout);
  }
}

async function saveApiBaseUrl(e) {
  e.preventDefault();
  const baseUrl = normalizeBaseUrl(apiBaseUrlInput.value || '');
  if (!baseUrl) {
    setApiStatus('Podaj adres API');
    return;
  }

  saveApiUrlBtn.disabled = true;
  setApiStatus('Sprawdzanie połączenia...');
  try {
    await validateApiConnection(baseUrl);
    apiConfig.baseUrl = baseUrl;
    persistApiConfig();
    setApiStatus('Połączono z API i zapisano ustawienie.');
  } catch (error) {
    setApiStatus(error.message || 'Nie udało się zapisać adresu API');
  } finally {
    saveApiUrlBtn.disabled = false;
  }
}

function persistAuth(data) {
  localStorage.setItem('magazyn-auth', JSON.stringify(data));
}

function restoreAuth() {
  const stored = localStorage.getItem('magazyn-auth');
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    auth = { token: parsed.token || null, user: parsed.user || null, magazine: null };
  } catch (error) {
    console.error('Nie udało się odczytać danych logowania', error);
  }
}

function setFormBusy(form, statusEl, busy, message = '') {
  const controls = Array.from(form.querySelectorAll('button[type="submit"], button.primary'));
  controls.forEach((el) => {
    el.disabled = busy;
    if (busy) el.setAttribute('aria-disabled', 'true');
    else el.removeAttribute('aria-disabled');
  });

  if (statusEl) {
    statusEl.textContent = message;
  }
}

function enableAuthInputs() {
  authScreen.querySelectorAll('input, button, select, textarea').forEach((el) => {
    el.disabled = false;
    el.removeAttribute('aria-disabled');
  });
}

function unlockAllAuthControls() {
  authScreen.querySelectorAll('input, button, select, textarea').forEach((el) => {
    el.disabled = false;
    el.removeAttribute('aria-disabled');
  });
}

function forceEnableAuthForms() {
  [loginForm, registerForm, createMagazineForm, joinMagazineForm].forEach((form) => {
    if (!form) return;
    form.querySelectorAll('input, button, select, textarea').forEach((el) => {
      el.disabled = false;
      el.removeAttribute('aria-disabled');
    });
  });
}

function resetAuthStatus() {
  accountStatus.textContent = '';
  magazineStatus.textContent = '';
  [loginForm, registerForm, createMagazineForm, joinMagazineForm].forEach((form) => {
    const buttons = form.querySelectorAll('input, button');
    buttons.forEach((el) => {
      el.disabled = false;
    });
  });
  enableAuthInputs();
  forceEnableAuthForms();
  const defaultForm = loginForm.classList.contains('hidden') ? registerForm : loginForm;
  forceUnlockAuthUi(defaultForm);
}

function resetAppToInitialState() {
  auth = { token: null, user: null, magazine: null };
  products = [];
  selectedProductId = null;
  productFilters = { brand: [], size: [], condition: [], drop: [] };
  totalProducts = 0;
  persistAuth(auth);
  loginForm.reset();
  registerForm.reset();
  createMagazineForm.reset();
  joinMagazineForm.reset();
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  accountStep.classList.remove('hidden');
  magazineStep.classList.add('hidden');
  accountStatus.textContent = '';
  magazineStatus.textContent = '';
  authScreen.classList.remove('hidden');
  appShell.style.display = 'none';
  unlockAllAuthControls();
  forceUnlockAuthUi(loginForm);
}

function forceUnlockAuthUi(formToFocus) {
  unlockAllAuthControls();

  if (formToFocus) {
    const firstInput = formToFocus.querySelector('input:not([type="hidden"]):not([disabled])');
    if (firstInput) firstInput.focus();
  }
}

async function runAuthAction(form, statusEl, workingMessage, action) {
  setFormBusy(form, statusEl, true, workingMessage);
  try {
    const result = await action();
    if (statusEl) statusEl.textContent = 'Gotowe';
    return result;
  } catch (error) {
    const message = error.message || 'Operacja nie powiodła się';
    if (statusEl) statusEl.textContent = message;
    return null;
  } finally {
    setFormBusy(form, statusEl, false, statusEl?.textContent || '');
    unlockAllAuthControls();
    forceUnlockAuthUi(form);
  }
}

async function apiRequest(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (auth.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }

  const response = await fetch(`${getApiBaseUrl()}/api${path}`, { ...options, headers }).catch(() => {
    throw new Error('Brak połączenia z serwerem');
  });

  if (response.status === 401) {
    auth = { token: null, user: null, magazine: null };
    persistAuth(auth);
    throw new Error('Sesja wygasła. Zaloguj się ponownie.');
  }

  if (!response.ok) {
    const message = await response.json().catch(() => ({ message: 'Błąd serwera' }));
    throw new Error(message.message || 'Nie udało się wykonać żądania');
  }
  if (response.status === 204) return null;
  return response.json();
}

async function fetchMagazines() {
  if (!auth.token) return [];
  const list = await apiRequest('/magazines');
  magazines = list;
  return list;
}

async function loadProducts() {
  if (!auth.token || !auth.magazine) return;
  const params = new URLSearchParams();
  params.set('page', currentPage);
  params.set('pageSize', pageSizeSelect.value);

  const searchText = searchInput.value.trim();
  if (searchText) params.set('search', searchText);
  const codeText = codeInput.value.trim();
  if (codeText) params.set('code', codeText);
  ['brand', 'size', 'condition', 'drop'].forEach((key) => {
    const active = selectedFilters[key];
    if (active.size > 0) params.set(key, Array.from(active).join(','));
  });
  if (sortSelect.value) params.set('sort', sortSelect.value);

  const data = await apiRequest(`/magazines/${auth.magazine.id}/products?${params.toString()}`);
  products = data.items || [];
  totalProducts = data.total || 0;
  productFilters = data.filters || productFilters;
  if (!selectedProductId || !products.some((p) => p.id === selectedProductId)) {
    selectedProductId = products[0]?.id ?? null;
  }
}

async function reloadProductsAndRender() {
  try {
    await loadProducts();
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function upsertProduct(product) {
  if (!auth.magazine) throw new Error('Brak wybranego magazynu');
  const basePath = `/magazines/${auth.magazine.id}/products`;
  if (product.id) {
    const updated = await apiRequest(`${basePath}/${product.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    const index = products.findIndex((p) => p.id === updated.id);
    if (index === -1) {
      products.unshift(updated);
    } else {
      products[index] = updated;
    }
    return updated;
  }

  const created = await apiRequest(basePath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  });
  products.unshift(created);
  return created;
}

async function removeProduct(id) {
  if (!auth.magazine) return;
  const basePath = `/magazines/${auth.magazine.id}/products`;
  await apiRequest(`${basePath}/${id}`, { method: 'DELETE' });
}

async function syncProductAndRender(product) {
  try {
    const saved = await upsertProduct(product);
    selectedProductId = saved.id;
    await loadProducts();
    render();
  } catch (error) {
    alert(error.message);
  }
}

function generateSeedData() {
  const sampleImages = [
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=60',
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=60',
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=60',
    'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=600&q=60',
  ];

  const base = [
    {
      name: 'Bluza Nike Tech Fleece',
      brand: 'Nike',
      size: 'M',
      condition: 'Jak nowa',
      drop: 'Wiosna',
      price: 329,
      code: 'NK-TF-001',
      a: 70,
      b: 55,
      c: 65,
    },
    {
      name: 'Kurtka Adidas Originals',
      brand: 'Adidas',
      size: 'L',
      condition: 'Używana',
      drop: 'Jesień',
      price: 279,
      code: 'AD-OR-214',
      a: 74,
      b: 58,
      c: 68,
    },
    {
      name: 'T-shirt Carhartt Pocket',
      brand: 'Carhartt',
      size: 'S',
      condition: 'Nowa z metką',
      drop: 'Lato',
      price: 149,
      code: 'CH-PK-032',
      a: 65,
      b: 50,
      c: 62,
    },
    {
      name: 'Spodnie Levi’s 501',
      brand: 'Levi’s',
      size: '32/32',
      condition: 'Jak nowa',
      drop: 'Całoroczne',
      price: 199,
      code: 'LV-501-500',
      a: 102,
      b: 40,
      c: 52,
    },
    {
      name: 'Bluza The North Face Drew Peak',
      brand: 'The North Face',
      size: 'XL',
      condition: 'Używana',
      drop: 'Zima',
      price: 309,
      code: 'TNF-DP-092',
      a: 74,
      b: 60,
      c: 72,
    },
    {
      name: 'Sneakers New Balance 550',
      brand: 'New Balance',
      size: '43',
      condition: 'Nowe',
      drop: 'Limitowany',
      price: 599,
      code: 'NB-550-777',
      a: 29,
      b: 10,
      c: 11,
    },
    {
      name: 'Bluza Champion Reverse Weave',
      brand: 'Champion',
      size: 'M',
      condition: 'Jak nowa',
      drop: 'Basic',
      price: 239,
      code: 'CH-RW-131',
      a: 71,
      b: 56,
      c: 67,
    },
    {
      name: 'Koszula Ralph Lauren Oxford',
      brand: 'Ralph Lauren',
      size: 'M',
      condition: 'Jak nowa',
      drop: 'Elegancki',
      price: 319,
      code: 'RL-OX-910',
      a: 76,
      b: 57,
      c: 70,
    },
    {
      name: 'Bluza Supreme Box Logo',
      brand: 'Supreme',
      size: 'L',
      condition: 'Limitowany',
      drop: 'Street',
      price: 1299,
      code: 'SP-BL-001',
      a: 73,
      b: 58,
      c: 69,
    },
    {
      name: 'Kurtka Patagonia Retro-X',
      brand: 'Patagonia',
      size: 'M',
      condition: 'Jak nowa',
      drop: 'Outdoor',
      price: 749,
      code: 'PT-RX-043',
      a: 68,
      b: 55,
      c: 64,
    },
    {
      name: 'Bluza Nike Club',
      brand: 'Nike',
      size: 'S',
      condition: 'Nowa',
      drop: 'Basic',
      price: 189,
      code: 'NK-CL-003',
      a: 66,
      b: 52,
      c: 61,
    },
    {
      name: 'Koszulka Stussy Stock Logo',
      brand: 'Stussy',
      size: 'M',
      condition: 'Używana',
      drop: 'Street',
      price: 189,
      code: 'ST-TS-821',
      a: 68,
      b: 51,
      c: 63,
    },
  ];

  return base.map((item, index) => ({
    id: crypto.randomUUID(),
    ...item,
    createdAt: Date.now() - index * 1000000,
    images: sampleImages.map((url, i) => ({
      id: crypto.randomUUID(),
      url: `${url}&sig=${index}-${i}`,
    })),
    mainImageId: null,
  }));
}

function getFilteredProducts() {
  return [...products];
}

function renderFilters() {
  const uniqueValues = {
    brand: new Set((productFilters.brand || []).filter(Boolean)),
    size: new Set((productFilters.size || []).filter(Boolean)),
    condition: new Set((productFilters.condition || []).filter(Boolean)),
    drop: new Set((productFilters.drop || []).filter(Boolean)),
  };

  Object.entries(dropdowns).forEach(([key, element]) => {
    element.innerHTML = '';
    uniqueValues[key].forEach((value) => {
      const id = `${key}-${value}`.replace(/\s+/g, '-').toLowerCase();
      const wrapper = document.createElement('label');
      wrapper.htmlFor = id;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = id;
      checkbox.checked = selectedFilters[key].has(value);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedFilters[key].add(value);
        else selectedFilters[key].delete(value);
        currentPage = 1;
        reloadProductsAndRender();
      });
      const span = document.createElement('span');
      span.textContent = value;
      wrapper.append(checkbox, span);
      element.appendChild(wrapper);
    });
  });

  Object.entries(datalists).forEach(([key, listEl]) => {
    listEl.innerHTML = '';
    uniqueValues[key].forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      listEl.appendChild(option);
    });
  });
}

function renderProductList() {
  const pageItems = getFilteredProducts();
  const pageSize = Number(pageSizeSelect.value);
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
  currentPage = Math.min(currentPage, totalPages);

  productListEl.innerHTML = '';
  pageItems.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'product-card';
    if (product.id === selectedProductId) card.classList.add('active');
    card.addEventListener('click', () => selectProduct(product.id));

    const thumb = document.createElement('div');
    thumb.className = 'product-thumb';
    const mainImage = product.images.find((img) => img.id === product.mainImageId) || product.images[0];
    if (mainImage) {
      const img = document.createElement('img');
      img.src = mainImage.url;
      img.alt = product.name;
      thumb.appendChild(img);
    } else {
      thumb.textContent = 'Brak zdjęcia';
    }

    const meta = document.createElement('div');
    meta.className = 'product-meta';

    const name = document.createElement('div');
    name.className = 'product-name';
    name.textContent = product.name;

    const sub = document.createElement('div');
    sub.className = 'product-subtext';
    sub.textContent = `${product.brand || 'Brak marki'} • ${product.size || '-'} • ${product.price.toFixed(2)} zł`;

    meta.append(name, sub);
    card.append(thumb, meta);
    productListEl.appendChild(card);
  });

  pageInfo.textContent = `Strona ${currentPage} z ${Math.max(1, Math.ceil(totalProducts / pageSize))}`;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

function selectProduct(id) {
  selectedProductId = id;
  render();
}

function renderGallery(product) {
  galleryEl.innerHTML = '';

  product.images.forEach((image, index) => {
    const tile = document.createElement('div');
    tile.className = 'gallery-tile';

    const img = document.createElement('img');
    img.src = image.url;
    img.alt = `${product.name} ${index + 1}`;
    tile.appendChild(img);

    if (product.mainImageId === image.id) {
      const star = document.createElement('div');
      star.className = 'star';
      star.textContent = 'Główne';
      tile.appendChild(star);
    }

    const actions = document.createElement('div');
    actions.className = 'gallery-actions';

    const mainBtn = document.createElement('button');
    mainBtn.className = 'icon-btn primary';
    mainBtn.title = 'Ustaw jako główne';
    mainBtn.textContent = '★';
    mainBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      product.mainImageId = image.id;
      syncProductAndRender(product);
    });

    const upBtn = document.createElement('button');
    upBtn.className = 'icon-btn';
    upBtn.title = 'Przesuń w górę';
    upBtn.textContent = '↑';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveImage(product, index, -1);
    });

    const downBtn = document.createElement('button');
    downBtn.className = 'icon-btn';
    downBtn.title = 'Przesuń w dół';
    downBtn.textContent = '↓';
    downBtn.disabled = index === product.images.length - 1;
    downBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveImage(product, index, 1);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'icon-btn danger';
    removeBtn.title = 'Usuń';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      product.images = product.images.filter((img) => img.id !== image.id);
      if (product.mainImageId === image.id) product.mainImageId = product.images[0]?.id ?? null;
      syncProductAndRender(product);
    });

    actions.append(mainBtn, upBtn, downBtn, removeBtn);
    tile.append(actions);
    galleryEl.appendChild(tile);
  });

  const mainImage = product.images.find((img) => img.id === product.mainImageId) || product.images[0];
  mainImageEl.innerHTML = '';
  if (mainImage) {
    const img = document.createElement('img');
    img.src = mainImage.url;
    img.alt = product.name;
    mainImageEl.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.textContent = 'Dodaj zdjęcie, aby ustawić główne.';
    mainImageEl.appendChild(placeholder);
  }
}

function moveImage(product, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= product.images.length) return;
  const [img] = product.images.splice(index, 1);
  product.images.splice(target, 0, img);
  syncProductAndRender(product);
}

function fillForm(product) {
  productForm.productName.value = product.name || '';
  productForm.condition.value = product.condition || '';
  productForm.price.value = product.price ?? '';
  productForm.size.value = product.size || '';
  productForm.drop.value = product.drop || '';
  productForm.brand.value = product.brand || '';
  productForm.code.value = product.code || '';
  productForm.metricA.value = product.a ?? '';
  productForm.metricB.value = product.b ?? '';
  productForm.metricC.value = product.c ?? '';
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const product = products.find((p) => p.id === selectedProductId);
  if (!product) return;

  product.name = productForm.productName.value;
  product.condition = productForm.condition.value;
  product.price = Number(productForm.price.value) || 0;
  product.size = productForm.size.value;
  product.drop = productForm.drop.value;
  product.brand = productForm.brand.value;
  product.code = productForm.code.value;
  product.a = Number(productForm.metricA.value) || 0;
  product.b = Number(productForm.metricB.value) || 0;
  product.c = Number(productForm.metricC.value) || 0;

  await syncProductAndRender(product);
}

async function handleNewProduct() {
  const newProduct = {
    name: 'Nowy produkt',
    brand: '',
    size: '',
    condition: '',
    drop: '',
    price: 0,
    code: '',
    a: 0,
    b: 0,
    c: 0,
    createdAt: Date.now(),
    images: [],
    mainImageId: null,
  };

  const created = await upsertProduct(newProduct);
  selectedProductId = created.id;
  currentPage = 1;
  await loadProducts();
  render();
}

async function handleDeleteProduct() {
  if (!selectedProductId) return;
  await removeProduct(selectedProductId);
  currentPage = 1;
  await loadProducts();
  render();
}

function handleAddImages(files) {
  const product = products.find((p) => p.id === selectedProductId);
  if (!product) return;

  const MAX_FILES = 12;
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // ~10MB na pojedynczy plik
  const MAX_TOTAL = 12;
  const MAX_SELECTED_SIZE = 20 * 1024 * 1024; // ~20MB naraz

  const incoming = Array.from(files);

  const tooBig = incoming.find((file) => file.size > MAX_IMAGE_SIZE);
  if (tooBig) {
    alert(`Plik "${tooBig.name}" jest za duży (limit 10MB na zdjęcie).`);
    return;
  }

  const selectedSize = incoming.reduce((sum, file) => sum + file.size, 0);
  if (selectedSize > MAX_SELECTED_SIZE) {
    alert('Wybierz mniejszy zestaw zdjęć (limit ~20MB naraz).');
    return;
  }

  const validFiles = incoming;

  const remainingSlots = Math.max(0, MAX_TOTAL - (product.images?.length || 0));
  const filesToRead = validFiles.slice(0, Math.min(remainingSlots, MAX_FILES));
  if (filesToRead.length === 0) return;

  const readers = filesToRead.map(
    (file) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      })
  );

  Promise.all(readers).then(async (images) => {
    const updated = { ...product, images: [...(product.images || [])] };
    images.forEach((dataUrl) => {
      const image = { id: crypto.randomUUID(), url: dataUrl };
      updated.images.push(image);
      if (!updated.mainImageId) updated.mainImageId = image.id;
    });

    try {
      await syncProductAndRender(updated);
    } catch (error) {
      alert(error.message);
    }
  });
}

function renderDropdowns() {
  Array.from(document.querySelectorAll('.filter.multi')).forEach((filterEl) => {
    filterEl.classList.remove('open');
  });
}

function toggleDropdown(element) {
  const isOpen = element.classList.contains('open');
  renderDropdowns();
  if (!isOpen) element.classList.add('open');
}

function renderMagazines() {
  magazineListEl.innerHTML = '';
  if (magazines.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Brak magazynów. Utwórz nowy lub dołącz do istniejącego.';
    magazineListEl.appendChild(empty);
    return;
  }

  magazines.forEach((mag) => {
    const item = document.createElement('div');
    item.className = 'magazine-item';
    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = mag.name;
    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = mag.ownerId === auth.user?.id ? 'Twój magazyn' : 'Udostępniony';
    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'mag-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'primary';
    openBtn.textContent = auth.magazine?.id === mag.id ? 'Aktywny' : 'Otwórz';
    openBtn.disabled = auth.magazine?.id === mag.id;
    openBtn.addEventListener('click', async () => {
      auth.magazine = mag;
      persistAuth(auth);
      await loadProducts();
      if (products.length === 0) {
        const seed = generateSeedData();
        for (const product of seed) {
          await upsertProduct(product);
        }
        await loadProducts();
      }
      render();
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'ghost small danger';
    const isOwner = mag.ownerId === auth.user?.id;
    removeBtn.textContent = isOwner ? 'Usuń' : 'Usuń z listy';
    removeBtn.addEventListener('click', () => handleRemoveMagazine(mag, isOwner));

    actions.append(openBtn, removeBtn);
    item.append(info, actions);
    magazineListEl.appendChild(item);
  });
}

async function handleRemoveMagazine(mag, isOwner) {
  const question = isOwner
    ? `Czy na pewno chcesz bezpowrotnie usunąć magazyn "${mag.name}"?`
    : `Usunąć magazyn "${mag.name}" z Twojej listy?`;
  if (!confirm(question)) return;

  try {
    await apiRequest(`/magazines/${mag.id}`, { method: 'DELETE' });
    magazines = magazines.filter((m) => m.id !== mag.id);
    if (auth.magazine?.id === mag.id) {
      auth.magazine = null;
      products = [];
      selectedProductId = null;
    }
    persistAuth(auth);
    render();
  } catch (error) {
    alert(error.message);
  }
}

function updateShellVisibility() {
  const ready = Boolean(auth.token && auth.magazine);
  authScreen.classList.toggle('hidden', ready);
  appShell.style.display = ready ? 'flex' : 'none';
}

async function handleLogin(event) {
  event.preventDefault();
  const username = loginForm.username.value;
  const password = loginForm.password.value;
  accountStatus.textContent = '';
  await runAuthAction(loginForm, accountStatus, 'Logowanie...', async () => {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    auth = { token: result.token, user: result.user, magazine: null };
    persistAuth(auth);
    await fetchMagazines();
    render();
  });
}

async function handleRegister(event) {
  event.preventDefault();
  const username = registerForm.username.value;
  const password = registerForm.password.value;
  accountStatus.textContent = '';
  await runAuthAction(registerForm, accountStatus, 'Zakładanie konta...', async () => {
    const result = await apiRequest('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    auth = { token: result.token, user: result.user, magazine: null };
    persistAuth(auth);
    await fetchMagazines();
    render();
  });
}

async function handleCreateMagazine(event) {
  event.preventDefault();
  const name = createMagazineForm.name.value;
  const password = createMagazineForm.password.value;
  magazineStatus.textContent = '';
  await runAuthAction(createMagazineForm, magazineStatus, 'Tworzenie magazynu...', async () => {
    const mag = await apiRequest('/magazines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    magazines.push(mag);
    auth.magazine = mag;
    persistAuth(auth);
    await loadProducts();
    if (products.length === 0) {
      const seed = generateSeedData();
      for (const product of seed) {
        await upsertProduct(product);
      }
      await loadProducts();
    }
    render();
  });
}

async function handleJoinMagazine(event) {
  event.preventDefault();
  const name = joinMagazineForm.name.value;
  const password = joinMagazineForm.password.value;
  magazineStatus.textContent = '';
  await runAuthAction(joinMagazineForm, magazineStatus, 'Łączenie z magazynem...', async () => {
    const mag = await apiRequest('/magazines/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    if (!magazines.some((m) => m.id === mag.id)) magazines.push(mag);
    auth.magazine = mag;
    persistAuth(auth);
    await loadProducts();
    if (products.length === 0) {
      const seed = generateSeedData();
      for (const product of seed) {
        await upsertProduct(product);
      }
      await loadProducts();
    }
    render();
  });
}

function toggleAuthForm() {
  resetAuthStatus();
  const isLoginVisible = !loginForm.classList.contains('hidden');
  loginForm.classList.toggle('hidden', isLoginVisible);
  registerForm.classList.toggle('hidden', !isLoginVisible);
  toggleFormBtn.textContent = isLoginVisible ? 'Masz już konto? Zaloguj się' : 'Nie masz konta? Załóż je';
}

function handleLogout() {
  auth = { token: null, user: null, magazine: null };
  products = [];
  selectedProductId = null;
  productFilters = { brand: [], size: [], condition: [], drop: [] };
  totalProducts = 0;
  currentPage = 1;
  persistAuth(auth);
  resetAuthStatus();
  render();
}

async function handleSwitchMagazine() {
  auth.magazine = null;
  products = [];
  selectedProductId = null;
  productFilters = { brand: [], size: [], condition: [], drop: [] };
  totalProducts = 0;
  currentPage = 1;
  persistAuth(auth);
  resetAuthStatus();
  await fetchMagazines();
  render();
}

function render() {
  const ready = Boolean(auth.token && auth.magazine);
  updateShellVisibility();
  if (!auth.token) {
    enableAuthInputs();
    resetAuthStatus();
    accountStep.classList.remove('hidden');
    magazineStep.classList.add('hidden');
    return;
  }

  accountName.textContent = auth.user?.username || '-';
  activeAccountLabel.textContent = auth.user ? `konto: ${auth.user.username}` : '';

  if (!auth.magazine) {
    accountStep.classList.add('hidden');
    magazineStep.classList.remove('hidden');
    renderMagazines();
    return;
  }

  accountStep.classList.add('hidden');
  magazineStep.classList.add('hidden');
  activeWarehouseLabel.textContent = auth.magazine.name;
  authScreen.classList.add('hidden');
  appShell.style.display = 'flex';
  unlockProductForm();

  if (products.length === 0 && totalProducts === 0 && auth.magazine) {
    const placeholder = document.createElement('p');
    placeholder.className = 'muted';
    placeholder.textContent = 'Brak produktów w magazynie.';
    productListEl.innerHTML = '';
    productListEl.appendChild(placeholder);
  } else {
    renderFilters();
    renderProductList();
    const product = products.find((p) => p.id === selectedProductId) || products[0];
    if (product) {
      selectedProductId = product.id;
      fillForm(product);
      renderGallery(product);
    } else {
      galleryEl.innerHTML = '<p class="muted">Brak produktu do wyświetlenia.</p>';
    }
  }
}

searchInput.addEventListener('input', () => {
  currentPage = 1;
  reloadProductsAndRender();
});

codeInput.addEventListener('input', () => {
  currentPage = 1;
  reloadProductsAndRender();
});

sortSelect.addEventListener('change', () => {
  currentPage = 1;
  reloadProductsAndRender();
});

pageSizeSelect.addEventListener('change', () => {
  currentPage = 1;
  reloadProductsAndRender();
});

prevPageBtn.addEventListener('click', () => {
  currentPage = Math.max(1, currentPage - 1);
  reloadProductsAndRender();
});

nextPageBtn.addEventListener('click', () => {
  currentPage += 1;
  reloadProductsAndRender();
});

Array.from(document.querySelectorAll('.filter.multi')).forEach((filterEl) => {
  const toggle = filterEl.querySelector('.dropdown-toggle');
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(filterEl);
  });
});

document.addEventListener('click', () => renderDropdowns());

addImageBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) {
    handleAddImages(e.target.files);
    fileInput.value = '';
  }
});

productForm.addEventListener('submit', handleFormSubmit);
newProductBtn.addEventListener('click', handleNewProduct);
deleteProductBtn.addEventListener('click', handleDeleteProduct);

loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);
createMagazineForm.addEventListener('submit', handleCreateMagazine);
joinMagazineForm.addEventListener('submit', handleJoinMagazine);
logoutBtn.addEventListener('click', handleLogout);
logoutAccountBtn.addEventListener('click', handleLogout);
switchMagazineBtn.addEventListener('click', handleSwitchMagazine);
saveApiUrlBtn.addEventListener('click', saveApiBaseUrl);

toggleFormBtn.addEventListener('click', (e) => {
  e.preventDefault();
  toggleAuthForm();
});

restoreApiConfig();
restoreAuth();
fetchMagazines()
  .then(() => loadProducts())
  .catch((error) => {
    if (auth.token) alert(error.message);
  })
  .finally(() => render());
