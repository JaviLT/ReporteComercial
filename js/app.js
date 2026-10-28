/* =========================================================================
   App: configuración de cada formato, navegación, tema claro/oscuro,
   índice de secciones, avisos (toast) y diálogo de confirmación.

   Para agregar un formato nuevo:
     1) agrega su <section class="form-section" id="..."> en index.html
     2) agrega su enlace en .form-nav y en .mobile-tabs
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

  /* ---------------- Toast y confirmación (los usa form-engine.js) ---------------- */
  const toastEl = document.getElementById('toast');
  let toastTimer;
  function toast(text, ms){
    clearTimeout(toastTimer);
    if(!text){ toastEl.classList.remove('show'); return; }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    if(ms) toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  const dlg = document.getElementById('confirmDialog');
  function confirmDialog({ title, message, confirmText }){
    if(!dlg || typeof dlg.showModal !== 'function') return Promise.resolve(window.confirm(message));
    dlg.querySelector('[data-role="title"]').textContent = title || '¿Confirmar?';
    dlg.querySelector('[data-role="message"]').textContent = message || '';
    dlg.querySelector('[data-role="ok"]').textContent = confirmText || 'Confirmar';
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise(resolve => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once:true });
    });
  }
  window.ZXUI = { toast, confirm: confirmDialog };

  /* ---------------- Tema claro / oscuro ---------------- */
  const root = document.documentElement;
  const themeBtn = document.getElementById('themeToggle');
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : !!(mq && mq.matches);
  function syncThemeUI(){
    const dark = isDark();
    themeBtn.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content', dark ? '#0c111c' : '#0D18A8');
  }
  themeBtn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try{ localStorage.setItem('zx-theme', next); }catch(e){}
    syncThemeUI();
  });
  if(mq && mq.addEventListener) mq.addEventListener('change', syncThemeUI);
  syncThemeUI();

  /* ---------------- Formatos ---------------- */
  const forms = {};
  document.querySelectorAll('.form-section').forEach(section => {
    const cfg = FORMATOS[section.id];
    if(cfg) forms[section.id] = new window.ReportForm(section, cfg);
  });
  window.ZX_FORMS = forms; // útil para depurar y, más adelante, para Supabase

  /* ---------------- Índice de secciones + avance ---------------- */
  const tocEl = document.getElementById('toc');
  const progressEl = document.getElementById('tocProgress');
  let current = null;
  let observer = null;

  function cardHasData(card){
    for(const el of card.querySelectorAll('input, textarea')){
      if(el.type === 'file') continue;
      if(el.type === 'checkbox' || el.type === 'radio'){ if(el.checked) return true; }
      else if(el.type === 'number'){ if(!el.disabled && el.value && el.value !== '0') return true; }
      else if(el.value && el.value.trim() !== '') return true;
    }
    if(card.querySelector('.photo-thumb')) return true;
    return false;
  }

  function updateProgress(){
    if(!current) return;
    const cards = Array.from(document.querySelectorAll(`#${current} .card`));
    let done = 0;
    cards.forEach(card => {
      const filled = cardHasData(card);
      if(filled) done++;
      const li = tocEl.querySelector(`li[data-card="${card.id}"]`);
      if(li) li.classList.toggle('done', filled);
    });
    progressEl.textContent = done ? `${done}/${cards.length}` : '';
  }

  function buildToc(id){
    const cards = Array.from(document.querySelectorAll(`#${id} .card`));
    tocEl.innerHTML = cards.map(card => {
      const title = card.querySelector('.section-title').textContent.trim();
      return `<li data-card="${card.id}"><a href="#${card.id}" data-card-link="${card.id}"><span class="dot"></span><span>${title}</span></a></li>`;
    }).join('');

    if(observer) observer.disconnect();
    if('IntersectionObserver' in window){
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if(!entry.isIntersecting) return;
          tocEl.querySelectorAll('a.active').forEach(a => a.classList.remove('active'));
          const a = tocEl.querySelector(`a[data-card-link="${entry.target.id}"]`);
          if(a) a.classList.add('active');
        });
      }, { rootMargin:'-30% 0px -60% 0px' });
      cards.forEach(c => observer.observe(c));
    }
    updateProgress();
  }

  // Los enlaces del índice desplazan sin cambiar el hash (el hash elige el formato)
  tocEl.addEventListener('click', e => {
    const a = e.target.closest('a[data-card-link]');
    if(!a) return;
    e.preventDefault();
    const card = document.getElementById(a.dataset.cardLink);
    if(card){
      card.scrollIntoView({ behavior:'smooth', block:'start' });
      const first = card.querySelector('input:not([type=file]), textarea');
      if(first) setTimeout(() => first.focus({ preventScroll:true }), 400);
    }
  });

  document.addEventListener('input', updateProgress);
  document.addEventListener('change', updateProgress);
  document.addEventListener('zx:change', updateProgress);

  /* ---------------- Navegación por hash (#bolsa, #funda) ---------------- */
  function show(id){
    if(!FORMATOS[id]) id = DEFAULT;
    current = id;
    document.querySelectorAll('.form-section').forEach(s => { s.hidden = s.id !== id; });
    document.querySelectorAll('[data-target]').forEach(t => {
      if(t.dataset.target === id) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    const cfg = FORMATOS[id];
    document.title = `${cfg.clave} · ${cfg.nombre} — Zubex`;
    buildToc(id);
  }
  window.addEventListener('hashchange', () => { show(location.hash.slice(1)); window.scrollTo(0, 0); });
  show(location.hash.slice(1));
})();
