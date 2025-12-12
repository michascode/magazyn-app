const productListEl = document.getElementById('productList');
const appShell = document.querySelector('.app-shell');
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

const API_URL = 'http://localhost:4000/api';

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

function persistAuth(data) {
  localStorage.setItem('magazyn-auth', JSON.stringify(data));
}

function restoreAuth() {
  const stored = localStorage.getItem('magazyn-auth');
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    auth = { token: parsed.token || null, user: parsed.user || null, magazine: parsed.magazine || null };
  } catch (error) {
    console.error('Nie udało się odczytać danych logowania', error);
  }
}

function setFormBusy(form, statusEl, busy, message = '') {
  const controls = form.querySelectorAll('input, button');
  controls.forEach((el) => {
    el.disabled = busy;
  });

  if (statusEl) {
    statusEl.textContent = message;
  }
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
    alert(message);
    throw error;
  } finally {
    setFormBusy(form, statusEl, false, statusEl?.textContent || '');
  }
}

async function apiRequest(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (auth.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
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
  const data = await apiRequest(`/magazines/${auth.magazine.id}/products`);
  products = data;
  selectedProductId = products[0]?.id ?? null;
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
    products[index] = updated;
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
  products = products.filter((p) => p.id !== id);
}

async function syncProductAndRender(product) {
  try {
    await upsertProduct(product);
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
  let list = [...products];

  const searchText = searchInput.value.trim().toLowerCase();
  if (searchText) {
    list = list.filter((p) => p.name.toLowerCase().includes(searchText));
  }

  const codeText = codeInput.value.trim().toLowerCase();
  if (codeText) {
    list = list.filter((p) => p.code.toLowerCase().includes(codeText));
  }

  ['brand', 'size', 'condition', 'drop'].forEach((key) => {
    const active = selectedFilters[key];
    if (active.size > 0) {
      list = list.filter((p) => active.has(String(p[key])));
    }
  });

  switch (sortSelect.value) {
    case 'cena-rosnaco':
      list.sort((a, b) => a.price - b.price);
      break;
    case 'cena-malejaco':
      list.sort((a, b) => b.price - a.price);
      break;
    case 'az':
      list.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'za':
      list.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'najstarsze':
      list.sort((a, b) => a.createdAt - b.createdAt);
      break;
    case 'najnowsze':
    default:
      list.sort((a, b) => b.createdAt - a.createdAt);
  }

  return list;
}

function renderFilters() {
  const uniqueValues = {
    brand: new Set(products.map((p) => p.brand).filter(Boolean)),
    size: new Set(products.map((p) => p.size).filter(Boolean)),
    condition: new Set(products.map((p) => p.condition).filter(Boolean)),
    drop: new Set(products.map((p) => p.drop).filter(Boolean)),
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
        render();
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
  const filtered = getFilteredProducts();
  const pageSize = Number(pageSizeSelect.value);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

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

  pageInfo.textContent = `Strona ${currentPage} z ${Math.max(1, Math.ceil(filtered.length / pageSize))}`;
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
  products = [created, ...products];
  selectedProductId = created.id;
  currentPage = 1;
  render();
}

async function handleDeleteProduct() {
  if (!selectedProductId) return;
  await removeProduct(selectedProductId);
  selectedProductId = products[0]?.id ?? null;
  currentPage = 1;
  render();
}

function handleAddImages(files) {
  const product = products.find((p) => p.id === selectedProductId);
  if (!product) return;

  const readers = Array.from(files).map(
    (file) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      })
  );

  Promise.all(readers).then((images) => {
    images.forEach((dataUrl) => {
      const image = { id: crypto.randomUUID(), url: dataUrl };
      product.images.push(image);
      if (!product.mainImageId) product.mainImageId = image.id;
    });
    syncProductAndRender(product);
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

    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.textContent = auth.magazine?.id === mag.id ? 'Aktywny' : 'Otwórz';
    btn.disabled = auth.magazine?.id === mag.id;
    btn.addEventListener('click', async () => {
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

    item.append(info, btn);
    magazineListEl.appendChild(item);
  });
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
  persistAuth(auth);
  resetAuthStatus();
  render();
}

async function handleSwitchMagazine() {
  auth.magazine = null;
  products = [];
  selectedProductId = null;
  persistAuth(auth);
  resetAuthStatus();
  await fetchMagazines();
  render();
}

function render() {
  const ready = Boolean(auth.token && auth.magazine);
  updateShellVisibility();
  if (!auth.token) {
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

  if (products.length === 0 && auth.magazine) {
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
  renderProductList();
});

codeInput.addEventListener('input', () => {
  currentPage = 1;
  renderProductList();
});

sortSelect.addEventListener('change', () => {
  currentPage = 1;
  renderProductList();
});

pageSizeSelect.addEventListener('change', () => {
  currentPage = 1;
  renderProductList();
});

prevPageBtn.addEventListener('click', () => {
  currentPage = Math.max(1, currentPage - 1);
  renderProductList();
});

nextPageBtn.addEventListener('click', () => {
  currentPage += 1;
  renderProductList();
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

toggleFormBtn.addEventListener('click', (e) => {
  e.preventDefault();
  toggleAuthForm();
});

restoreAuth();
fetchMagazines()
  .then(() => loadProducts())
  .catch((error) => {
    if (auth.token) alert(error.message);
  })
  .finally(() => render());
