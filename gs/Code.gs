/* ============================================================
   AD MOTORS — Google Apps Script (Code.gs)
   ------------------------------------------------------------
   1. Crea una hoja de cálculo en Google Sheets
   2. Hoja "Autos" con encabezados:
        Marca | Modelo | Año | Precio | Km | Ubicación | Imagen
      (Imagen = URL pública del auto, orientación vertical 9:16)
   3. Hoja "Pujas" con encabezados:
        Fecha | Auto | Marca/Modelo | Puja | Precio | % del valor
   4. Extras > Apps Script > pega este código > Guarda
   5. Implementar > Nueva implementación > Aplicación web:
        Ejecutar como: Yo
        Quién tiene acceso: Cualquier persona
      Copia la URL /exec y pégala en js/config.js (APPS_SCRIPT_URL)
   ============================================================ */

var SHEET_AUTOS = 'Autos';
var SHEET_PUJAS = 'Pujas';
var SHEET_CARACTERISTICAS = 'Caracteristicas';

/* GET: devuelve los autos del inventario como JSON */
function doGet() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_AUTOS);
    if (!sheet) throw new Error('No existe la hoja "' + SHEET_AUTOS + '"');

    var values = sheet.getDataRange().getValues();
    var headers = normalizeHeaders(values.shift());
    var cars = [];

    values.forEach(function (row, i) {
      if (!row[0]) return;
      var car = {};
      headers.forEach(function (h, j) {
        car[h] = row[j];
      });
      car.id = i + 1;
      car.features = [];

      /* Todas las columnas "Imagen", "Imagen 2", "Imagen 3", ... como galería.
         Los enlaces compartidos de Drive (file/d/…, open?id=…) se convierten
         automáticamente en URLs directas de imagen. */
      car.images = headers.map(function (h, j) {
        return { h: h, v: row[j] };
      }).filter(function (col) {
        return col.h.toLowerCase().indexOf('imagen') === 0;
      }).map(function (col) {
        return directImageUrl(col.v);
      }).filter(function (v) {
        return v && String(v).trim() !== '';
      });

      if (!car.images.length) car.images = [directImageUrl(car.Imagen)];

      cars.push(car);
    });

    /* Adjunta las características de cada carro (hoja "Caracteristicas") */
    var features = loadFeatures();
    features.forEach(function (f) {
      var car = cars[f.auto - 1];
      if (!car) return;
      var last = car.features[car.features.length - 1];
      if (!last || last.categoria !== f.categoria) {
        last = { categoria: f.categoria, items: [] };
        car.features.push(last);
      }
      last.items.push({ nombre: f.nombre, valor: f.valor });
    });

    return json_({ ok: true, total: cars.length, cars: cars });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* POST: recibe una puja y la guarda en la hoja "Pujas".
   Valida que la puja sea un número entre el 70% y el 100% del precio,
   para evitar spam / datos basura en la hoja. */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PUJAS);
    if (!sheet) throw new Error('No existe la hoja "' + SHEET_PUJAS + '"');

    var auto = Number(body.auto);
    var puja = Number(body.puja);
    var precio = Number(body.precio);

    if (!isFinite(auto) || auto < 1) {
      return json_({ ok: false, error: 'Auto inválido' });
    }
    if (!isFinite(precio) || precio <= 0) {
      return json_({ ok: false, error: 'Precio inválido' });
    }
    if (!isFinite(puja) || puja < precio * 0.7 || puja > precio) {
      return json_({ ok: false, error: 'Puja fuera del rango permitido (70%–100%)' });
    }

    var pct = Math.round((puja / precio) * 100);

    sheet.appendRow([
      new Date(),
      body.auto,
      String(body.marca || '').slice(0, 200),
      puja,
      precio,
      pct
    ]);

    return json_({ ok: true, message: 'Puja registrada' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function normalizeHeaders(row) {
  return row.map(function (h) {
    return String(h).trim().replace(/\s+/g, ' ');
  });
}

/* Convierte enlaces compartidos en URLs directas de imagen:
   - Google Drive: drive.google.com/file/d/XXX/view -> uc?export=view&id=XXX
   - Dropbox: dropbox.com/...?dl=0 -> ?raw=1 (imagen directa)
   Los archivos deben estar compartidos como "cualquier persona con el enlace". */
function directImageUrl(url) {
  if (!url) return url;
  var s = String(url).trim();

  /* Dropbox: dl=0 (página) -> raw=1 (imagen directa) */
  if (s.indexOf('dropbox.com') !== -1 && s.indexOf('dl.dropboxusercontent') === -1) {
    if (/[?&]dl=0/.test(s)) return s.replace(/dl=0/, 'raw=1');
    if (/[?&]raw=1/.test(s)) return s;
    return s + (s.indexOf('?') === -1 ? '?' : '&') + 'raw=1';
  }

  if (s.indexOf('drive.google.com') === -1) return s;
  var m = s.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];
  m = s.match(/drive\.google\.com\/open\?id=([^&#]+)/);
  if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];
  return s;
}

/* Lee la hoja "Caracteristicas": Auto | Categoria | Caracteristica | Valor */
function loadFeatures() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CARACTERISTICAS);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  var headers = normalizeHeaders(values.shift());
  var idx = {
    auto: headers.indexOf('Auto'),
    cat: headers.indexOf('Categoria'),
    nom: headers.indexOf('Caracteristica'),
    val: headers.indexOf('Valor')
  };
  var features = [];

  values.forEach(function (row) {
    if (idx.auto < 0 || row[idx.auto] === '' || row[idx.auto] == null) return;
    features.push({
      auto: Number(row[idx.auto]),
      categoria: idx.cat >= 0 ? String(row[idx.cat]) : '',
      nombre: idx.nom >= 0 ? String(row[idx.nom]) : '',
      valor: idx.val >= 0 ? String(row[idx.val]) : ''
    });
  });

  return features;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
