/* =========================================================================
   App: configuración de cada formato + navegación entre secciones.
   Para agregar un formato nuevo:
     1) agrega su <section class="form-section" id="..."> en index.html
     2) agrega su pestaña en <nav class="tabs">
     3) agrega su configuración en FORMATOS (abajo)
   ========================================================================= */
(function(){
  'use strict';

  const FORMATOS = {
    bolsa: {
      clave: 'VEN-F-11',
      nombre: 'Reporte de Visita a Clientes Bolsa',
      fechaRevision: '03 de Julio del 2026',
      revision: '00',
      archivoPDF: 'VEN-F-11_Reporte_Visita_Clientes_Bolsa.pdf',
      // Orden de la última página en el PDF
      ordenFinal: ['acciones', 'conclusion', 'aprobacion', 'evidencias']
    },
    funda: {
      clave: 'VEN-F-12',
      nombre: 'Reporte de Visita a Clientes Funda',
      fechaRevision: '03 de Julio del 2026',
      revision: '00',
      archivoPDF: 'VEN-F-12_Reporte_Visita_Clientes_Funda.pdf',
      ordenFinal: ['acciones', 'evidencias', 'conclusion'],
      onInit(root){
        // Tabla "Condiciones del Producto": 10 piezas x 6 columnas
        const body = root.querySelector('[data-role="piezas-body"]');
        for(let i = 1; i <= 10; i++){
          const tr = document.createElement('tr');
          let html = `<td class="rowlabel">Pieza ${i}</td>`;
          for(let c = 0; c < 6; c++) html += '<td><input type="text"></td>';
          tr.innerHTML = html;
          body.appendChild(tr);
        }
      }
    }
  };

  const DEFAULT = 'bolsa';
  const forms = {};

  // Inicializa cada sección con su propia instancia del motor
  document.querySelectorAll('.form-section').forEach(section => {
    const cfg = FORMATOS[section.id];
    if(cfg) forms[section.id] = new window.ReportForm(section, cfg);
  });
  window.ZX_FORMS = forms; // útil para depurar y, más adelante, para Supabase

  // ---------- Navegación por hash (#bolsa, #funda) ----------
  function show(id){
    if(!FORMATOS[id]) id = DEFAULT;
    document.querySelectorAll('.form-section').forEach(s => { s.hidden = s.id !== id; });
    document.querySelectorAll('.tab').forEach(t => {
      if(t.dataset.target === id) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    const cfg = FORMATOS[id];
    document.title = `${cfg.clave} · ${cfg.nombre} — Zubex`;
  }
  window.addEventListener('hashchange', () => { show(location.hash.slice(1)); window.scrollTo(0, 0); });
  show(location.hash.slice(1));

  // La barra de acciones se pega justo debajo del encabezado (su alto varía en celular)
  const header = document.querySelector('.app-header');
  const setHeaderH = () => document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  setHeaderH();
  window.addEventListener('resize', setHeaderH);
})();
