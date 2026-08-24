# AD Motors — Google Sheets + Apps Script

El sitio (index.html) lee el inventario de una hoja de Google Sheets y guarda las
pujas de los visitantes en otra hoja, usando un Web App de Google Apps Script.

## Paso 1 — Crear la hoja de cálculo

En [sheets.new](https://sheets.new) crea una hoja de cálculo.

### Hoja 1: `Autos` (una fila por carro, 9 carros)

| Vendido   | Marca      | Modelo   | Año  | Precio       | Km    | Ubicación | Imagen               | Imagen 2            | Imagen 3            |
| --------- | ---------- | -------- | ---- | ------------ | ----- | --------- | -------------------- | ------------------- | ------------------- |
|           | Renault    | Duster   | 2021 | 86000000     | 32500 | Medellín  | https://.../1.jpg    | https://.../2.jpg   | https://.../3.jpg   |
| Vendido   | Chevrolet  | Onix     | 2020 | 58900000     | 41000 | Medellín  | https://.../1.jpg    |                     |                     |
| ...       | ...        | ...      | ...  | ...          | ...   | ...       | ...                  | ...                 | ...                 |

- `Vendido` (primera columna): escribe cualquier texto (ej. `Vendido`) para
  marcar el carro como vendido; el sitio lo muestra con la etiqueta "Vendido",
  la foto en gris y sin el botón de oferta. Déjala en blanco si está disponible.

- `Imagen`: URL pública de la imagen principal del auto (se usa en la card del
  inventario). Orientación vertical recomendada (9:16) para las cards.
- `Imagen 2`, `Imagen 3`, `Imagen 4`… (opcionales, sin límite): forman la
  galería de la vista "Ver características del carro". La primera imagen se
  muestra en grande en formato 16:9 y las demás aparecen como miniaturas
  cliqueables debajo. Cuantas más columnas de imagen llenes, más miniaturas
  se muestran. Deja vacías las que no uses.
- `Ubicación`: si está vacía, el sitio muestra "Medellín" por defecto.
- Puedes pegar enlaces compartidos de **Google Drive** (`drive.google.com/file/d/…`)
  o **Dropbox** (`dropbox.com/…?dl=0`): `Code.gs` los convierte automáticamente
  en URLs directas de imagen (el archivo debe estar compartido como
  "cualquier persona con el enlace"). También funcionan URLs directas de
  cualquier hosting (Imgur, Pexels, tu servidor, etc.).

### Hoja 2: `Pujas` (se llena sola con las pujas de los visitantes)

| Fecha               | Auto | Marca/Modelo | Puja       | Precio     | % del valor |
| ------------------- | ---- | ------------ | ---------- | ---------- | ----------- |
| 08/04/2026 10:32:11 | 3    | Toyota Corolla | 60000000 | 98000000   | 61          |

### Hoja 3: `Caracteristicas` (detalles de cada carro, una fila por característica)

| Auto | Categoria            | Caracteristica              | Valor |
| ---- | -------------------- | --------------------------- | ----- |
| 1    | Características del producto | Color                  | Rojo  |
| 1    | Características del producto | Tipo de combustible     | Gasolina |
| 1    | Seguridad            | Frenos ABS                  | Sí    |
| 1    | Seguridad            | Airbag conductor            | Sí    |
| 1    | Condiciones de compra | Con precio negociable      | Sí    |
| 1    | Confort y conveniencia | Aire acondicionado        | Sí    |

- `Auto`: número de fila del carro en la hoja `Autos` (1 = primer carro, etc.).
- `Categoria`: agrupa las características; se muestran como secciones en la vista
  de "Ver características del carro". Usa el mismo nombre para agrupar varias filas.
- `Valor`: puede ser `Sí`, `No` o texto libre (ej: `Gasolina`, `330 hp`).
- Si un carro no tiene filas aquí, la vista muestra un mensaje sin características.

## Paso 2 — Crear el Web App

1. En la hoja: **Extensiones → Apps Script**.
2. Reemplaza el contenido de `Code.gs` con el archivo `gs/Code.gs` de este proyecto.
3. **Guardar** (icono de disco).
4. **Implementar → Nueva implementación → Aplicación web**:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier persona**
   - Implementar y copiar la URL que termina en `/exec`.

## Paso 3 — Conectar el sitio

Abre `js/config.js` y pega la URL en:

```js
APPS_SCRIPT_URL: "https://script.google.com/macros/s/TU_ID/exec"
```

Nota: la primera vez que visites la URL puede pedir autorización; ábrela una vez
en tu navegador y acepta para que funcione para el público.

## Estructura del proyecto

```
admotors/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── config.js   ← URL de Apps Script, WhatsApp, etc.
│   └── main.js
├── video/
│   └── hero.mp4    ← video del header (reemplazable)
└── gs/
    ├── Code.gs     ← pegar en Apps Script
    └── README.md
```
