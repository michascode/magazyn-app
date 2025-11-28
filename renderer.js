const productListEl = document.getElementById('productList');
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

let products = generateSeedData();
let selectedProductId = products[0]?.id ?? null;
let currentPage = 1;
let selectedFilters = {
  brand: new Set(),
  size: new Set(),
  condition: new Set(),
  drop: new Set(),
};

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
      render();
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
      render();
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
  render();
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

function handleFormSubmit(event) {
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

  render();
}

function handleNewProduct() {
  const newProduct = {
    id: crypto.randomUUID(),
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

  products = [newProduct, ...products];
  selectedProductId = newProduct.id;
  currentPage = 1;
  render();
}

function handleDeleteProduct() {
  if (!selectedProductId) return;
  products = products.filter((p) => p.id !== selectedProductId);
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
    render();
  });
}

function render() {
  renderFilters();
  renderProductList();
  const product = products.find((p) => p.id === selectedProductId);
  if (product) {
    renderGallery(product);
    fillForm(product);
  } else {
    galleryEl.innerHTML = '';
    mainImageEl.innerHTML = '<div class="placeholder">Brak wybranego produktu</div>';
    productForm.reset();
  }
}

function toggleDropdown(target) {
  document.querySelectorAll('.filter.multi').forEach((el) => {
    if (el === target) return;
    el.classList.remove('open');
  });
  target.classList.toggle('open');
}

function closeDropdowns(event) {
  if (!event.target.closest('.filter.multi')) {
    document.querySelectorAll('.filter.multi').forEach((el) => el.classList.remove('open'));
  }
}

document.addEventListener('click', closeDropdowns);

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

render();
