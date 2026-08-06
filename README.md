# AD Motors — Selecciona tu próximo carro

Sitio web de inventario de autos con pujas en vivo, alimentado por Google Sheets vía Google Apps Script.

## Cómo funciona

- `js/config.js` — única configuración: URL del Web App de Apps Script, número de WhatsApp, imagen de respaldo.
- `js/main.js` — carga el inventario desde Google Sheets, detecta la orientación real de las fotos (vertical/cuadrada/horizontal), gestiona las pujas y la galería de características.
- `gs/Code.gs` — Apps Script que expone los autos como JSON y guarda las pujas en la hoja. Convierte automáticamente enlaces compartidos de **Google Drive** y **Dropbox** en URLs directas de imagen.
- `plantilla-google-sheets.ods` — plantilla con las 3 hojas: `Autos`, `Caracteristicas` y `Pujas`.

## Configuración

1. Crea una hoja en Google Sheets usando la plantilla (`plantilla-google-sheets.ods`).
2. En Apps Script pega `gs/Code.gs` e implementa como Web App (acceso: *Cualquier persona*).
3. Pega la URL `/exec` en `js/config.js` (`APPS_SCRIPT_URL`).
4. La primera vez, abre la URL en el navegador para autorizar.

Detalles completos en `gs/README.md`.
