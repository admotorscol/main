/* ============================================================
   AD MOTORS — Lógica de "Vende tu carro"
   - Acuerdo de comisión arriba: si acepta, se desbloquea el
     formulario; si no acepta, queda bloqueado.
   - Anti-bots: honeypot, trampa de tiempo y rate limit diario.
   - Sube fotos (hasta 20) y envía el formulario por WhatsApp.
   ============================================================ */

(function () {
  'use strict';

  const CFG = ADMOTORS_CONFIG;

  const MAX_PHOTOS = 20;
  const MIN_FILL_MS = 3000;   // tiempo mínimo antes de poder enviar (anti-bot)
  const DAILY_LIMIT = 15;     // envíos máximos por día (rate limit)

  const form = document.getElementById('sellForm');
  const sellFields = document.getElementById('sellFields');
  const quizReject = document.getElementById('quizReject');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('photoInput');
  const previews = document.getElementById('photoPreviews');
  const photoCount = document.getElementById('photoCount');
  const status = document.getElementById('sellStatus');

  const pageLoadedAt = Date.now();
  let photos = [];

  /* ---------- Gate: acuerdo de comisión ---------- */

  form.querySelectorAll('[name="comision"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.value === 'Sí') {
        sellFields.disabled = false;
        quizReject.hidden = true;
      } else {
        sellFields.disabled = true;
        quizReject.hidden = false;
      }
    });
  });

  /* ---------- Honeypot (campo trampa invisible) ---------- */

  const hp = document.createElement('input');
  hp.type = 'text';
  hp.name = 'website';
  hp.tabIndex = -1;
  hp.autocomplete = 'off';
  hp.className = 'hp-field';
  hp.setAttribute('aria-hidden', 'true');
  form.appendChild(hp);

  /* ---------- Rate limit diario (localStorage) ---------- */

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function readDailyCount() {
    try {
      const raw = localStorage.getItem('admotors-sell-count');
      if (!raw) return 0;
      const obj = JSON.parse(raw);
      return obj.date === todayKey() ? (Number(obj.count) || 0) : 0;
    } catch (e) {
      return 0;
    }
  }

  function writeDailyCount(count) {
    try {
      localStorage.setItem('admotors-sell-count', JSON.stringify({ date: todayKey(), count: count }));
    } catch (e) { /* sin almacenamiento disponible */ }
  }

  /* ---------- Fotos: arrastrar / seleccionar / quitar ---------- */

  function renderPreviews() {
    previews.innerHTML = '';
    photos.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'photo-item';

      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = 'Foto ' + (index + 1);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'photo-remove';
      btn.textContent = '\u00d7';
      btn.setAttribute('aria-label', 'Quitar foto ' + (index + 1));
      btn.addEventListener('click', () => {
        photos.splice(index, 1);
        renderPreviews();
      });

      item.appendChild(img);
      item.appendChild(btn);
      previews.appendChild(item);
    });
    photoCount.textContent = photos.length + ' / ' + MAX_PHOTOS + ' fotos';
  }

  function addFiles(fileList) {
    if (sellFields.disabled) return;
    const remaining = MAX_PHOTOS - photos.length;
    const images = Array.from(fileList)
      .filter((f) => f.type && f.type.startsWith('image/'))
      .slice(0, remaining);

    photos = photos.concat(images);
    renderPreviews();

    if (photos.length >= MAX_PHOTOS) {
      status.textContent = 'Llegaste al máximo de ' + MAX_PHOTOS + ' fotos.';
      status.className = 'sell-status show';
    }
  }

  dropzone.addEventListener('click', () => {
    if (sellFields.disabled) return;
    fileInput.click();
  });

  dropzone.addEventListener('keydown', (e) => {
    if (sellFields.disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      if (sellFields.disabled) return;
      e.preventDefault();
      dropzone.classList.add('dragover');
    })
  );

  ['dragleave', 'drop'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    })
  );

  dropzone.addEventListener('drop', (e) => {
    if (sellFields.disabled) return;
    if (e.dataTransfer && e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  });

  /* ---------- Envío por WhatsApp ---------- */

  function collectSection(title) {
    const section = Array.from(form.querySelectorAll('.form-section')).find((s) => {
      const h = s.querySelector('.form-section-title');
      return h && h.textContent.trim() === title;
    });
    if (!section) return [];

    const rows = [];
    section.querySelectorAll('.field').forEach((field) => {
      const labelEl = field.querySelector('.field-label');
      const input = field.querySelector('input, select, textarea');
      if (!labelEl || !input) return;

      const label = labelEl.textContent.trim().replace(/\s*\*$/, '');
      const value = String(input.value || '').trim();
      if (value) rows.push(label + ': ' + value);
    });
    return rows;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    /* El formulario solo se puede enviar si se aceptó la comisión. */
    if (sellFields.disabled) return;

    /* Honeypot */
    if (hp.value.trim() !== '') {
      status.textContent = 'Gracias, te contactaremos.';
      status.className = 'sell-status show ok';
      return;
    }

    /* Trampa de tiempo */
    if (Date.now() - pageLoadedAt < MIN_FILL_MS) {
      status.textContent = 'Espera un momento antes de enviar.';
      status.className = 'sell-status show';
      return;
    }

    /* Rate limit diario */
    const count = readDailyCount();
    if (count >= DAILY_LIMIT) {
      status.textContent = 'Alcanzaste el límite de envíos de hoy. Escríbenos por WhatsApp.';
      status.className = 'sell-status show';
      return;
    }

    const blocks = [];

    const contacto = collectSection('Tus datos');
    if (contacto.length) blocks.push('DATOS DE CONTACTO\n' + contacto.join('\n'));

    const vehiculo = collectSection('Datos del auto');
    if (vehiculo.length) blocks.push('DATOS DEL VEHÍCULO\n' + vehiculo.join('\n'));

    blocks.push('COMISIÓN\nAcepta negociar con comisión: Sí');

    const skip = ['Acuerdo de comisión', 'Tus datos', 'Datos del auto', 'Fotos del vehículo'];
    form.querySelectorAll('.form-section').forEach((section) => {
      const titleEl = section.querySelector('.form-section-title');
      if (!titleEl) return;
      const t = titleEl.textContent.trim();
      if (skip.includes(t)) return;

      const rows = [];
      section.querySelectorAll('.field').forEach((field) => {
        const labelEl = field.querySelector('.field-label');
        const input = field.querySelector('input, select, textarea');
        if (!labelEl || !input) return;

        const label = labelEl.textContent.trim().replace(/\s*\*$/, '');
        const value = String(input.value || '').trim();
        if (value) rows.push(label + ': ' + value);
      });

      if (rows.length) blocks.push(t.toUpperCase() + '\n' + rows.join('\n'));
    });

    if (photos.length) blocks.push('FOTOS\nAdjuntas: ' + photos.length);

    const msg = 'Hola AD Motors! Quiero vender mi carro.\n\n' + blocks.join('\n\n');
    const url = 'https://wa.me/' + CFG.WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg);
    window.open(url, '_blank');

    writeDailyCount(count + 1);

    status.textContent = '¡Listo! Confirma el envío en WhatsApp.';
    status.className = 'sell-status show ok';
  });

  /* ---------- Footer ---------- */

  document.getElementById('footerYear').textContent = '© ' + new Date().getFullYear() + ' AD Motors';
})();
