/* ============================================================
   AD MOTORS — Lógica del sitio
   Fuente de datos: Google Sheets vía Apps Script (config.js)
   ============================================================ */

(function () {
  'use strict';

  const CFG = ADMOTORS_CONFIG;
  const grid = document.getElementById('cardsGrid');
  const select = document.getElementById('carSelect');
  const countEl = document.getElementById('inventoryCount');
  const toast = document.getElementById('toast');
  const sortSelect = document.getElementById('sortSelect');
  const filterMarca = document.getElementById('filterMarca');
  const filterAnio = document.getElementById('filterAnio');
  const filterPrecio = document.getElementById('filterPrecio');
  const filterKm = document.getElementById('filterKm');
  const filterUbicacion = document.getElementById('filterUbicacion');

  /* Caché local del inventario (30 min): las visitas se sirven al instante
     mientras Apps Script arranca en frío (cold start de Google). */
  const CACHE_KEY = 'admotors-cars-v1';
  const CACHE_TTL = 30 * 60 * 1000;

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || !Array.isArray(obj.cars)) return null;
      if (Date.now() - obj.ts > CACHE_TTL) return null;
      return obj.cars;
    } catch (e) {
      return null;
    }
  }

  function writeCache(cars) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), cars }));
    } catch (e) { /* sin almacenamiento disponible */ }
  }

  const money = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  });

  const number = new Intl.NumberFormat('es-CO');

  const formatter = {
    money: (v) => money.format(Number(v) || 0),
    number: (v) => number.format(Number(v) || 0)
  };

  /* Colecciona las imágenes del carro: columna "Imagen", "Imagen 2", "Imagen 3"…
     o el arreglo "images" ya agrupado por Apps Script */
  function getImages(car) {
    if (Array.isArray(car.images) && car.images.length) {
      return car.images.filter((v) => v && String(v).trim() !== '');
    }
    const out = [];
    Object.keys(car).forEach((k) => {
      if (/^imagen(\s*\d*)?$/i.test(k) && car[k] && String(car[k]).trim() !== '') {
        out.push(car[k]);
      }
    });
    return out.length ? out : [CFG.DEFAULT_IMAGE];
  }

  /* Detecta la orientación real de una imagen (vertical, cuadrada u horizontal)
     y aplica el ratio a su contenedor vía --img-ratio + clase de orientación.
     Los ratios se acotan para que la grilla no se descontrole con fotos extremas. */
  function applyImageRatio(img, container, onApplied) {
    const apply = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return;
      const raw = w / h;
      const ratio = Math.min(1.3, Math.max(0.55, raw));
      container.style.setProperty('--img-ratio', ratio.toFixed(4));
      container.classList.remove('is-tall', 'is-square', 'is-wide');
      container.classList.add(raw < 0.95 ? 'is-tall' : raw > 1.25 ? 'is-wide' : 'is-square');
      if (onApplied) onApplied();
    };
    if (img.complete && img.naturalWidth) {
      apply();
    } else {
      img.addEventListener('load', apply, { once: true });
      img.addEventListener('error', apply, { once: true });
    }
  }

  let cars = [];
  let sortMode = 'recientes';

  /* ---------- Carga de datos ---------- */

  /* Apps Script a veces falla en el primer arranque (404 transitorio);
     se reintenta hasta 3 veces antes de mostrar el inventario vacío. */
  async function fetchCars() {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(CFG.APPS_SCRIPT_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (!data || !Array.isArray(data.cars)) {
          throw new Error('Respuesta inválida del servidor');
        }
        return data.cars;
      } catch (err) {
        lastErr = err;
        console.warn('Intento ' + attempt + ' fallido al cargar Google Sheets:', err);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    console.error('No se pudo cargar el inventario desde Google Sheets:', lastErr);
    return [];
  }

  function renderSkeleton() {
    grid.innerHTML = Array.from({ length: 6 }, () => `
      <article class="card card--skeleton" aria-hidden="true">
        <div class="card-img skeleton-block"></div>
        <div class="card-specs">
          <div class="skeleton-line" style="width: 45%"></div>
          <div class="skeleton-line" style="width: 70%"></div>
          <div class="skeleton-line" style="width: 55%"></div>
          <div class="skeleton-line" style="width: 65%"></div>
        </div>
        <div class="skeleton-line" style="width: 60%; margin: 0 16px 10px"></div>
        <div class="card-bid">
          <div class="skeleton-line" style="width: 50%"></div>
          <div class="skeleton-line" style="width: 100%; height: 34px"></div>
        </div>
      </article>`).join('');
  }

  async function init() {
    const cached = readCache();

    if (cached) {
      /* Visitante recurrente: muestra al instante y refresca en segundo plano */
      renderCars(cached);
      fetchCars().then((fresh) => {
        if (!fresh || !fresh.length) return;
        if (JSON.stringify(fresh) !== JSON.stringify(cached)) renderCars(fresh);
        writeCache(fresh);
      });
      return;
    }

    /* Primera visita: cards esqueleto mientras Google arranca */
    renderSkeleton();
    const fresh = await fetchCars();
    writeCache(fresh);
    renderCars(fresh);
  }

  /* ---------- Orden y filtros ---------- */

  /* Comparadores por modo de orden. La antigüedad se infiere del orden de filas
     en Google Sheets (car.id = nº de fila); el precio se lee de la columna Precio. */
  const sortComparators = {
    recientes: (a, b) => (b.id || 0) - (a.id || 0),
    antiguos: (a, b) => (a.id || 0) - (b.id || 0),
    'precio-asc': (a, b) => (Number(a.Precio) || 0) - (Number(b.Precio) || 0),
    'precio-desc': (a, b) => (Number(b.Precio) || 0) - (Number(a.Precio) || 0)
  };

  /* Convierte "46.999.000", "32.500 km", etc. en número (46999000). */
  function parseNumber(v) {
    const n = Number(String(v).replace(/[^\d]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* "bogotá" o "BOGOTÁ" -> "Bogotá" (para mostrar y comparar ubicaciones). */
  function titleCase(s) {
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
      .replace(/(^|[\s-])\S/g, (m) => m.toUpperCase());
  }

  /* Lee los valores actuales de los filtros. */
  function readFilters() {
    return {
      marca: filterMarca.value,
      anio: filterAnio.value,
      precio: filterPrecio.value,
      km: filterKm.value,
      ubicacion: filterUbicacion.value
    };
  }

  /* Devuelve los autos que pasan los filtros (no muta la lista maestra). */
  function filteredCars() {
    const f = readFilters();
    return cars.filter((car) => {
      if (f.marca && String(car.Marca || '').trim().toLowerCase() !== f.marca.toLowerCase()) return false;

      if (f.anio && String(car.Año || car.Anio || '').trim() !== f.anio) return false;

      if (f.precio) {
        const max = Number(f.precio);
        if (max > 0 && parseNumber(car.Precio) > max) return false;
      }

      if (f.km) {
        if (f.km === 'over100000') {
          if (parseNumber(car.Km) <= 100000) return false;
        } else if (parseNumber(car.Km) > Number(f.km)) {
          return false;
        }
      }

      if (f.ubicacion && titleCase(car.Ubicación || car.Ubicacion) !== f.ubicacion) return false;

      return true;
    });
  }

  function restoreOption(sel, value) {
    if (!value) return;
    if (Array.from(sel.options).some((o) => o.value === value)) sel.value = value;
  }

  /* Puebla los desplegables de filtro a partir de los autos activos (no vendidos). */
  function buildFilters() {
    const active = cars.filter((c) => !c.vendido);

    const prev = {
      marca: filterMarca.value,
      anio: filterAnio.value,
      precio: filterPrecio.value,
      km: filterKm.value,
      ubicacion: filterUbicacion.value
    };

    /* Marca: solo las disponibles */
    const marcas = Array.from(new Set(active.map((c) => String(c.Marca || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es'));
    filterMarca.innerHTML = '<option value="">Todas</option>' +
      marcas.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');

    /* Ubicación */
    const ubis = Array.from(new Set(active.map((c) => titleCase(c.Ubicación || c.Ubicacion)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es'));
    filterUbicacion.innerHTML = '<option value="">Todas</option>' +
      ubis.map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');

    /* Año: solo los años de los autos activos */
    const anios = Array.from(new Set(active.map((c) => parseInt(String(c.Año || c.Anio || '').trim(), 10))
      .filter((n) => isFinite(n) && n > 0))).sort((a, b) => a - b);
    filterAnio.innerHTML = '<option value="">Todos</option>' +
      anios.map((y) => `<option value="${y}">${y}</option>`).join('');

    /* Precio: redondear cada precio activo al siguiente múltiplo de 10 millones */
    const escalones = Array.from(new Set(
      active.map((c) => Math.ceil(parseNumber(c.Precio) / 10000000) * 10000000).filter((n) => n > 0)
    )).sort((a, b) => a - b);
    filterPrecio.innerHTML = '<option value="">Sin límite</option>' +
      escalones.map((p) => `<option value="${p}">Hasta ${formatter.money(p)}</option>`).join('');

    /* Km: redondear cada km activo al siguiente múltiplo de 10.000 */
    const kms = Array.from(new Set(
      active.map((c) => Math.max(10000, Math.ceil(parseNumber(c.Km) / 10000) * 10000)).filter((n) => n > 0)
    )).sort((a, b) => a - b);
    filterKm.innerHTML = '<option value="">Sin límite</option>' +
      kms.map((k) => `<option value="${k}">Hasta ${formatter.number(k)} km</option>`).join('') +
      '<option value="over100000">Más de 100.000 km</option>';

    /* Restaurar selección previa si sigue existiendo */
    restoreOption(filterMarca, prev.marca);
    restoreOption(filterAnio, prev.anio);
    restoreOption(filterPrecio, prev.precio);
    restoreOption(filterKm, prev.km);
    restoreOption(filterUbicacion, prev.ubicacion);
  }

  /* Devuelve los autos filtrados y ordenados (copia, no muta `cars`). */
  function sortedCars() {
    const cmp = sortComparators[sortMode];
    const list = filteredCars();
    return cmp ? list.sort(cmp) : list;
  }

  /* ---------- Render ---------- */

  function renderCars(list) {
    cars = list;
    buildFilters();
    renderGrid();
    buildSelect();
  }

  function renderGrid() {
    grid.innerHTML = '';
    bidSync.uis.clear();

    if (!cars.length) {
      countEl.textContent = 'Sin autos disponibles por ahora';
      grid.innerHTML = '<p class="cards-empty">No hay carros publicados en el inventario. Vuelve pronto.</p>';
      return;
    }

    const visible = sortedCars();

    if (!visible.length) {
      countEl.textContent = 'Sin coincidencias';
      grid.innerHTML = '<p class="cards-empty">Ningún auto coincide con los filtros. Prueba con otros valores.</p>';
      return;
    }

    visible.forEach((car) => {
      grid.appendChild(buildCard(car));
    });

    countEl.textContent = visible.length + ' autos disponibles';
  }

  function buildCard(car) {
    const sold = !!car.vendido;
    const card = document.createElement('article');
    card.className = 'card' + (sold ? ' is-sold' : '');
    card.dataset.id = car.id;

    const images = getImages(car);
    const img = images[0];
    const marca = car.Marca || 'Sin marca';
    const modelo = car.Modelo || '';
    const anio = car.Año || car.Anio || '—';
    const precio = Number(car.Precio) || 0;
    const km = car.Km || 0;
    const ubicacion = car.Ubicación || car.Ubicacion || 'Medellín';

    card.innerHTML = `
      <div class="card-img">
        <span class="card-badge">Auto ${car.id}</span>
        ${sold ? '<span class="sold-stamp" aria-hidden="true">Vendido</span>' : ''}
        <img src="${img}" alt="${marca} ${modelo} ${anio}" loading="eager" decoding="async" fetchpriority="high" onerror="this.src='${CFG.DEFAULT_IMAGE}'">
      </div>
      <div class="card-specs">
        <div class="card-spec">
          <span class="spec-label">Marca</span>
          <span class="spec-value">${marca}</span>
        </div>
        <div class="card-spec">
          <span class="spec-label">Precio</span>
          <span class="spec-value price">${formatter.money(precio)}</span>
        </div>
        <div class="card-spec">
          <span class="spec-label">Año</span>
          <span class="spec-value">${anio}</span>
        </div>
        <div class="card-spec">
          <span class="spec-label">Km</span>
          <span class="spec-value">${formatter.number(km)} km</span>
        </div>
      </div>
      <div class="card-location">Ubicación: ${ubicacion}</div>
      <div class="card-bid">
        ${sold ? '' : bidBlockHtml(car)}
        <button class="card-features-btn" type="button">Ver características del carro</button>
        ${sold ? '' : '<button class="bid-btn" type="button">Enviar oferta por WhatsApp</button>'}
        <p class="bid-status" aria-live="polite"></p>
      </div>
    `;

    const featuresBtn = card.querySelector('.card-features-btn');
    const cardImg = card.querySelector('.card-img');

    /* Detecta la orientación real de la foto (clases is-tall/square/wide) */
    applyImageRatio(card.querySelector('.card-img img'), cardImg);

    if (!sold) {
      wireBid(card, car, car.id);
    }

    featuresBtn.addEventListener('click', () => openOverlay(car));
    cardImg.addEventListener('click', () => openOverlay(car));

    return card;
  }

  /* ---------- Bloque de puja compartido (card + overlay) ---------- */

  /* Estado y UIs de los sliders por auto (índice): sincronizan card ↔ overlay */
  const bidSync = {
    state: new Map(), // id -> valor efectivo de la oferta
    uis: new Map()    // id -> [{ slider, valueEl, paint }]
  };

  /* HTML del bloque: mismo slider 70% → 100% con los mismos valores.
     El valor por defecto es el 90% del precio. */
  function bidBlockHtml(car) {
    const precio = Number(car.Precio) || 0;
    const minBid = Math.round(precio * (CFG.BID_MIN_PERCENT / 100));
    const maxBid = precio;
    const start = Math.round(precio * (CFG.BID_DEFAULT_PERCENT / 100));
    const marca = (car.Marca || '') + ' ' + (car.Modelo || '');
    return `
      <div class="bid-head">
        <span>Mi oferta es:</span>
        <strong class="bid-value">${formatter.money(start)}</strong>
      </div>
      <input class="bid-slider" type="range" min="${minBid}" max="${maxBid}" step="${CFG.BID_STEP}" value="${start}" aria-label="Valor de tu oferta para ${marca}">
      <div class="bid-labels">
        <span>Mín. ${formatter.money(minBid)}</span>
        <span>${CFG.BID_MIN_PERCENT}% → 100%</span>
      </div>`;
  }

  /* Aplica el estado compartido a todas las UIs del auto id (card + overlay) */
  function syncBidCar(id) {
    const v = bidSync.state.get(id);
    if (v === undefined) return;
    (bidSync.uis.get(id) || []).forEach((ui) => ui.paint(v));
  }

  /* Conecta slider + botón + estado dentro de root (card u overlay).
     Ambos sliders del mismo auto comparten el mismo valor y se sincronizan. */
  function wireBid(root, car, id) {
    const slider = root.querySelector('.bid-slider');
    const valueEl = root.querySelector('.bid-value');
    const btn = root.querySelector('.bid-btn');
    const status = root.querySelector('.bid-status');
    const minBid = Number(slider.min);
    const maxBid = Number(slider.max);

    if (!bidSync.state.has(id)) {
      bidSync.state.set(id, Math.round(maxBid * (CFG.BID_DEFAULT_PERCENT / 100)));
    }

    const ui = {
      slider,
      valueEl,
      paint: (v) => {
        slider.value = String(v);
        const pct = maxBid > minBid ? ((v - minBid) / (maxBid - minBid)) * 100 : 100;
        slider.style.setProperty('--fill', pct + '%');
        valueEl.textContent = formatter.money(v);
      }
    };
    const uis = bidSync.uis.get(id) || [];
    uis.push(ui);
    bidSync.uis.set(id, uis);

    slider.addEventListener('input', () => {
      let v = Number(slider.value);
      /* Con paso fijo el último escalón puede quedar debajo del precio:
         al llegar ahí, se fija el valor exacto del 100% */
      if (v >= maxBid - CFG.BID_STEP) v = maxBid;
      bidSync.state.set(id, v);
      syncBidCar(id);
    });

    btn.addEventListener('click', () => submitBid(car, bidSync.state.get(id), btn, status));

    syncBidCar(id);
  }

  function buildSelect() {
    select.innerHTML = '<option value="">— Elige un auto del inventario —</option>';
    cars.filter((car) => !car.vendido).forEach((car) => {
      const opt = document.createElement('option');
      opt.value = car.id;
      opt.textContent = `Auto ${car.id} · ${car.Marca || ''} ${car.Modelo || ''} (${car.Año || car.Anio || ''})`;
      select.appendChild(opt);
    });
  }

  /* ---------- Puja funcional (envía a la hoja vía Apps Script) ---------- */

  async function submitBid(car, bid, btn, status) {
    const puja = Number(bid);
    const precio = Number(car.Precio) || 0;
    const pct = Math.round((puja / (precio || 1)) * 100);
    const marca = (car.Marca || '') + ' ' + (car.Modelo || '');
    const anio = car.Año || car.Anio || '—';
    const km = car.Km || 0;
    const ubicacion = car.Ubicación || car.Ubicacion || 'Medellín';

    /* Abre WhatsApp del vendedor con el resumen de la puja en el mismo clic
       (así el navegador no bloquea la ventana), para contactar al cliente. */
    const waMsg =
      'Hola AD Motors! Quiero hacer una oferta por el ' + marca + ' ' + anio + ' (Auto ' + car.id + ').\n\n' +
      'Oferta: ' + formatter.money(puja) + ' (' + pct + '% del precio)\n' +
      'Precio: ' + formatter.money(precio) + '\n' +
      'Kilómetros: ' + formatter.number(km) + ' km\n' +
      'Ubicación: ' + ubicacion;
    window.open('https://wa.me/' + CFG.WHATSAPP_NUMBER + '?text=' + encodeURIComponent(waMsg), '_blank');

    btn.disabled = true;
    status.className = 'bid-status loading';
    status.textContent = 'Enviando oferta…';

    const payload = {
      auto: car.id,
      marca: marca,
      puja: puja,
      precio: precio,
      pct: pct
    };

    try {
      const res = await fetch(CFG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data || data.ok !== true) throw new Error('Respuesta inválida');

      status.className = 'bid-status ok';
      status.textContent = `Oferta de ${formatter.money(puja)} recibida. Confírmala en WhatsApp para que te contactemos.`;
      showToast('Oferta recibida por ' + formatter.money(puja), 'ok');
    } catch (err) {
      console.warn('Fallo al enviar la oferta:', err);
      status.className = 'bid-status err';
      status.textContent = 'No se pudo enviar. Intenta de nuevo.';
      showToast('No se pudo enviar la oferta', 'err');
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Overlay: características a pantalla completa ---------- */

  let lastClose = null;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'carOverlay';
  document.body.appendChild(overlay);

  /* Refleja en la URL los datos del auto abierto (marca, precio, año, km, ubicación). */
  function setCarUrlParams(car) {
    const url = new URL(window.location.href);
    url.searchParams.set('marca', String(car.Marca || ''));
    url.searchParams.set('precio', String(car.Precio || ''));
    url.searchParams.set('anio', String(car.Año || car.Anio || ''));
    url.searchParams.set('km', String(car.Km || ''));
    url.searchParams.set('ubicacion', String(car.Ubicación || car.Ubicacion || ''));
    history.replaceState(null, '', url);
  }

  /* Quita los parámetros del auto al cerrar la vista. */
  function clearCarUrlParams() {
    const url = new URL(window.location.href);
    ['marca', 'precio', 'anio', 'km', 'ubicacion'].forEach((k) => url.searchParams.delete(k));
    history.replaceState(null, '', url);
  }

  function openOverlay(car) {
    const sold = !!car.vendido;
    const images = getImages(car);
    const marca = car.Marca || 'Sin marca';
    const modelo = car.Modelo || '';
    const anio = car.Año || car.Anio || '—';
    const precio = Number(car.Precio) || 0;
    const km = car.Km || 0;
    const ubicacion = car.Ubicación || car.Ubicacion || 'Medellín';
    const fallback = 'onerror="this.src=\'' + CFG.DEFAULT_IMAGE + '\'"';

    const bidHtml = sold
      ? '<div class="card-bid overlay-bid"><span class="overlay-sold-label">Vendido</span></div>'
      : `<div class="card-bid overlay-bid">
           ${bidBlockHtml(car)}
           <button class="bid-btn" type="button">Enviar oferta por WhatsApp</button>
           <p class="bid-status" aria-live="polite"></p>
         </div>`;

    const thumbsHtml = images.length > 1
      ? `<div class="gallery-thumbs" role="tablist" aria-label="Galería de imágenes">
          ${images.map((src, idx) => `
            <button type="button" class="gallery-thumb${idx === 0 ? ' active' : ''}" data-index="${idx}" aria-label="Ver imagen ${idx + 1}" ${idx === 0 ? 'aria-selected="true"' : ''}>
              <img src="${src}" alt="${marca} ${modelo} — imagen ${idx + 1}" loading="lazy" decoding="async" ${fallback}>
            </button>`).join('')}
        </div>`
      : '';

    overlay.innerHTML = `
      <div class="overlay-card${sold ? ' is-sold' : ''}" role="dialog" aria-modal="true" aria-label="Características de ${marca} ${modelo} ${anio}">
        <div class="overlay-head">
          <p class="overlay-badge">Auto ${car.id} · ${marca} ${modelo} ${anio}</p>
          <button class="overlay-close" type="button">
            Cerrar
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="overlay-body">
          <div class="gallery">
            <div class="gallery-main">
              <img src="${images[0]}" alt="${marca} ${modelo} ${anio}" ${fallback}>
              <span class="gallery-counter">1 / ${images.length}</span>
              <div class="overlay-price">${formatter.money(precio)}</div>
            </div>
            ${thumbsHtml}
          </div>
          <div class="overlay-info">
            <div class="overlay-specs">
              ${overlaySpec('Marca', marca)}
              ${overlaySpec('Modelo', modelo)}
              ${overlaySpec('Año', anio)}
              ${overlaySpec('Precio', formatter.money(precio))}
              ${overlaySpec('Kilómetros', formatter.number(km) + ' km')}
              ${overlaySpec('Ubicación', ubicacion)}
            </div>
            <h3 class="features-title">Características del vehículo</h3>
            <div class="features">${renderFeatures(car.features)}</div>
            ${bidHtml}
          </div>
        </div>
      </div>`;

    /* Galería: clic en miniatura → imagen grande */
    const mainWrap = overlay.querySelector('.gallery-main');
    const mainImg = overlay.querySelector('.gallery-main img');
    const counter = overlay.querySelector('.gallery-counter');
    applyImageRatio(mainImg, mainWrap);
    overlay.querySelectorAll('.gallery-thumb').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        overlay.querySelectorAll('.gallery-thumb').forEach((t) => {
          t.classList.remove('active');
          t.removeAttribute('aria-selected');
        });
        thumb.classList.add('active');
        thumb.setAttribute('aria-selected', 'true');
        mainImg.src = images[Number(thumb.dataset.index)];
        applyImageRatio(mainImg, mainWrap);
        counter.textContent = (Number(thumb.dataset.index) + 1) + ' / ' + images.length;
      });
    });

    /* Slider de puja del overlay: mismos valores 70% → 100% y mismo envío */
    if (!sold) {
      wireBid(overlay.querySelector('.overlay-bid'), car, car.id);
    }

    overlay.classList.add('open');
    setCarUrlParams(car);
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.overlay-close').focus();

    lastClose = () => {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      clearCarUrlParams();
      lastClose = null;
    };

    overlay.querySelector('.overlay-close').addEventListener('click', () => lastClose && lastClose());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && lastClose) lastClose();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modal.classList.contains('open')) {
      closeModal();
      return;
    }
    if (lastClose) lastClose();
  });

  function overlaySpec(label, value) {
    return `<div class="overlay-spec"><span>${label}</span><strong>${value}</strong></div>`;
  }

  function renderFeatures(features) {
    if (!features || !features.length) {
      return '<p class="features-empty">Este auto aún no tiene características publicadas.</p>';
    }
    return features.map((group) => `
      <section class="feature-group">
        <h4 class="feature-title">${group.categoria}</h4>
        ${group.items.map((it) => `
          <div class="feature-item">
            <span class="feature-name">${it.nombre}</span>
            <span class="feature-value${featureValueClass(it.valor)}">${it.valor}</span>
          </div>`).join('')}
      </section>`).join('');
  }

  function featureValueClass(v) {
    const s = String(v).toLowerCase();
    if (s === 'sí' || s === 'si') return ' is-yes';
    if (s === 'no') return ' is-no';
    return '';
  }

  /* ---------- Modal de video (Cómo funciona) ---------- */

  const modal = document.getElementById('videoModal');
  const modalIframe = modal.querySelector('iframe');

  /* Extrae el ID del video de la URL completa (watch?v=, youtu.be, embed, shorts) */
  function youtubeIdFromUrl(url) {
    const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  function openModal() {
    const id = youtubeIdFromUrl(CFG.YOUTUBE_URL);
    if (!id) return;
    modalIframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modalIframe.src = '';
    document.body.style.overflow = '';
  }

  document.getElementById('comoFuncionaLink').addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
  });

  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  /* ---------- Select: desplaza a la card ---------- */

  select.addEventListener('change', () => {
    if (select.value === '') return;
    const card = grid.querySelector('.card[data-id="' + select.value + '"]');
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('is-highlight');
    setTimeout(() => card.classList.remove('is-highlight'), 2000);
  });

  /* ---------- Orden y filtros del inventario ---------- */

  sortSelect.addEventListener('change', () => {
    sortMode = sortSelect.value;
    renderGrid();
  });

  [filterMarca, filterAnio, filterPrecio, filterKm, filterUbicacion].forEach((el) => {
    el.addEventListener('change', renderGrid);
  });

  /* ---------- Utilidades ---------- */

  function showToast(msg, kind) {
    toast.textContent = msg;
    toast.className = 'toast show ' + kind;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.className = 'toast'), 3200);
  }

  document.getElementById('whatsappCta').href =
    'https://wa.me/' + CFG.WHATSAPP_NUMBER +
    '?text=' + encodeURIComponent(CFG.WHATSAPP_MESSAGE);

  document.getElementById('footerYear').textContent = '© ' + new Date().getFullYear() + ' AD Motors';

  document.getElementById('inventoryGo').addEventListener('click', () => {
    document.getElementById('inventario').scrollIntoView({ behavior: 'smooth' });
  });

  /* ---------- Init ---------- */

  init();
})();
