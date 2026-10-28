# Reportes de Visita a Clientes — Zubex

Aplicación web para capturar los formatos de visita a clientes y descargarlos en PDF con el membrete oficial.

| Sección | Clave | Formato |
|---|---|---|
| Bolsa | VEN-F-11 | Reporte de Visita a Clientes Bolsa |
| Funda | VEN-F-12 | Reporte de Visita a Clientes Funda |

Es un sitio estático (HTML + CSS + JS, sin compilación ni dependencias de npm), listo para GitHub Pages.

## Estructura

```
.
├── index.html              # App: encabezado, pestañas y las dos secciones (formatos)
├── css/
│   ├── app.css             # Estructura de la app (encabezado, pestañas, barra de acciones)
│   └── forms.css           # Estilos de los formatos (hoja carta), compartidos
├── js/
│   ├── app.js              # Configuración de cada formato + navegación (#bolsa / #funda)
│   ├── form-engine.js      # Motor compartido: fotos, limpiar, conteo y generación del PDF
│   └── membrete.js         # Membrete embebido (data URI) para el fondo del PDF
├── vendor/
│   ├── html2canvas.min.js  # 1.4.1 (con parche para Safari/iOS)
│   └── jspdf.umd.min.js    # 4.2.1
└── assets/
    ├── fonts/              # Lab Grotesque Light / Bold
    └── img/                # logo-zubex.png, logo-zubex-blanco.png, membrete.jpg
```

## Probar en local

Abrir `index.html` con doble clic funciona. Para un entorno igual al publicado:

```bash
python -m http.server 8000
# http://localhost:8000
```

## Publicar en GitHub Pages

1. Subir el contenido de esta carpeta a la raíz del repositorio.
2. GitHub → **Settings → Pages** → *Deploy from a branch* → rama `main`, carpeta `/ (root)`.
3. La app queda en `https://<usuario>.github.io/<repo>/` (`#bolsa` y `#funda` abren cada sección).

## Agregar un formato nuevo

1. En `index.html`: copiar una `<section class="form-section" id="...">` y su pestaña en `<nav class="tabs">`.
2. En `js/app.js`: agregar su entrada en `FORMATOS` (clave, nombre, revisión, nombre del PDF y orden de bloques de la última página).

Marcado que espera el motor dentro de cada sección: `.page[data-page]`, `[data-block="..."]` en la última página, `[data-role="evidencias-title|photo-input|photo-thumbs|photo-count|status"]` y `[data-action="clear|pdf"]`.

## Siguiente paso: Supabase (pendiente)

- Agregar `name` / `data-field` a cada campo para poder serializar el formulario a JSON.
- Tabla `reportes_visita` (tipo, clave, fecha, cliente, datos `jsonb`, creado_por, creado_en) + Storage para fotos y PDF.
- Login con Supabase Auth y vista de **Historial** como tercera sección.
- La *anon key* de Supabase puede ir en el front; la seguridad se controla con RLS.
