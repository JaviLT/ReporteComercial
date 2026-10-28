/* =========================================================================
   Motor compartido de formatos: fotos, limpiar, conteo y generación de PDF.
   Cada sección (Bolsa, Funda) crea su propia instancia con `new ReportForm(root, cfg)`,
   así ninguna variable ni id choca entre formatos.

   Marcado esperado dentro de `root` (ver index.html):
     .page[data-page]                 páginas del formato (1..n)
     [data-block="<nombre>"]          bloques de la última página que se reordenan en el PDF
     [data-role="evidencias-title"]   título "Evidencias Fotográficas"
     [data-role="photo-input|photo-thumbs|photo-count|piezas-body"]
     [data-action="clear|pdf"]        botones
     [data-ui]                        envoltorios solo de interfaz (tarjetas, tablas);
                                      se eliminan al armar el PDF
   ========================================================================= */
(function(){
  'use strict';

  const PHOTOS_PER_PAGE = 6;
  const PHOTO_COLS = 2;
  const PHOTO_GAP = 12;
  const PHOTO_MAX_W = 500, PHOTO_MAX_H = 400;
  const FOOTER_BOTTOM_OFFSET = 14; // igual a .page-footer{bottom:14px}
  const SAFETY_MARGIN = 8;

  const FOOTER_HTML = `<div class="page-footer">NOTA: Los documentos del Sistema de Gestión de Inocuidad y Calidad de ZUBEX INDUSTRIAL,<br>se controlan en RED INTERNA, cualquier copia impresa es SOLO REFERENCIA</div>`;

  const TEXTAREA_DIV_STYLE = 'width:100%; border:1.5px solid #0D18A8; border-radius:2px; background:#fff; font-family:inherit; font-size:12px; padding:8px; color:#1A1A1A; white-space:pre-wrap; word-wrap:break-word; overflow-wrap:break-word; box-sizing:border-box;';

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Clona un elemento copiando el estado actual de inputs/textarea/checkbox
  // (cloneNode por sí solo lo pierde). Se quita `name` a los radios del clon para que
  // nunca formen grupo con los del formulario vivo.
  function cloneWithState(srcEl){
    const clone = srcEl.cloneNode(true);
    const srcFields = srcEl.querySelectorAll('input, textarea');
    const cloneFields = clone.querySelectorAll('input, textarea');
    srcFields.forEach((s, i) => {
      const c = cloneFields[i];
      if(!c) return;
      if(s.type === 'checkbox' || s.type === 'radio'){
        c.removeAttribute('name');
        c.checked = s.checked;
      } else {
        c.value = s.value;
      }
    });
    return clone;
  }

  // Convierte cada input de texto libre en un bloque que se ajusta a varias líneas,
  // para que respuestas largas nunca se corten en el PDF.
  function expandTextFields(container){
    container.querySelectorAll('input[type=text]').forEach(inp => {
      const cs = getComputedStyle(inp);
      const div = document.createElement('div');
      div.style.cssText = `flex:${cs.flex}; width:${cs.width}; min-width:${cs.minWidth};
        border:none; border-bottom:${cs.borderBottomWidth} solid ${cs.borderBottomColor};
        background:transparent; font-family:${cs.fontFamily}; font-size:${cs.fontSize};
        color:${cs.color}; padding:${cs.padding}; text-align:${cs.textAlign};
        white-space:pre-wrap; word-wrap:break-word; overflow-wrap:break-word;
        line-height:1.4; box-sizing:${cs.boxSizing};`;
      const hasValue = inp.value && inp.value.trim() !== '';
      div.textContent = hasValue ? inp.value : (inp.placeholder || '');
      if(!hasValue && inp.placeholder) div.style.color = '#b9bec9';
      inp.replaceWith(div);
    });
  }

  // Agrupa elementos hermanos en "unidades" empaquetables: un título de sección (o una
  // etiqueta sola sobre un textarea) siempre va pegado al elemento siguiente.
  function pushRunElements(list, units){
    let i = 0;
    while(i < list.length){
      const el = list[i];
      const next = list[i + 1];
      const isLead = el.classList && (el.classList.contains('section-title') || el.classList.contains('options-line'));
      const isLoneLabel = el.matches && el.matches('.field.full') && el.children.length === 1 &&
        el.children[0].tagName === 'LABEL' && !el.querySelector('input');
      if((isLead || isLoneLabel) && next){
        if(next.tagName === 'TEXTAREA'){
          units.push({ kind:'split', label: el, rawText: next.value || '', minHeight: next.getBoundingClientRect().height || 60 });
          i += 2; continue;
        }
        units.push({ kind:'normal', els:[el, next] });
        i += 2; continue;
      }
      if(el.tagName === 'TEXTAREA'){
        units.push({ kind:'split', label: null, rawText: el.value || '', minHeight: el.getBoundingClientRect().height || 60 });
        i += 1; continue;
      }
      units.push({ kind:'normal', els:[el] });
      i += 1;
    }
  }

  function isIOS(){
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  class ReportForm {
    /**
     * @param {HTMLElement} root  la <section> del formato
     * @param {object} cfg
     *   clave, nombre, fechaRevision, revision, archivoPDF
     *   ordenFinal: orden de bloques de la última página en el PDF, p.ej.
     *               ['acciones','conclusion','aprobacion','evidencias']
     *   onInit(root): hook opcional (p.ej. construir filas de tabla)
     */
    constructor(root, cfg){
      this.root = root;
      this.cfg = cfg;
      this.photos = [];
      this.photoSeq = 0;
      this.busy = false;
      this.pages = Array.from(root.querySelectorAll('.page[data-page]'));
      this._bind();
      if(typeof cfg.onInit === 'function') cfg.onInit(root);
    }

    $(sel){ return this.root.querySelector(sel); }
    $$(sel){ return Array.from(this.root.querySelectorAll(sel)); }

    metaBoxHTML(num, total){
      const c = this.cfg;
      return `<div class="meta-box">
        <div class="meta-title">Sistema de Gestión de Inocuidad y Calidad</div>
        <div class="meta-row"><span>Formato:</span><b>${c.nombre}</b></div>
        <div class="meta-row"><span>Fecha de Revisión:</span><b>${c.fechaRevision}</b></div>
        <div class="meta-row"><span>Clave:</span><b>${c.clave}</b></div>
        <div class="meta-row"><span>Revisión:</span><b>${c.revision}</b></div>
        <div class="page-num">Página ${num} de ${total}</div>
      </div>`;
    }

    _bind(){
      const form = this.$('form');
      if(form) form.addEventListener('submit', e => e.preventDefault());

      const clearBtn = this.$('[data-action="clear"]');
      const pdfBtn = this.$('[data-action="pdf"]');
      if(clearBtn) clearBtn.addEventListener('click', () => this.clear());
      if(pdfBtn) pdfBtn.addEventListener('click', () => this.downloadPDF());

      const input = this.$('[data-role="photo-input"]');
      if(input) input.addEventListener('change', e => { this._addFiles(e.target.files); e.target.value = ''; });

      // Arrastrar y soltar fotos sobre la zona de evidencias
      const drop = this.$('.photo-attach-box');
      if(drop){
        ['dragenter','dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-drag'); }));
        ['dragleave','drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('is-drag'); }));
        drop.addEventListener('drop', e => this._addFiles(e.dataTransfer && e.dataTransfer.files));
      }

      const thumbs = this.$('[data-role="photo-thumbs"]');
      if(thumbs) thumbs.addEventListener('click', e => {
        const btn = e.target.closest('[data-photo-id]');
        if(btn) this.removePhoto(Number(btn.dataset.photoId));
      });

      // Conteo: cada cantidad solo se habilita cuando su casilla está marcada
      this.$$('.conteo-item').forEach(item => {
        const check = item.querySelector('.conteo-check');
        const qty = item.querySelector('.conteo-qty');
        if(!check || !qty) return;
        check.addEventListener('change', () => {
          qty.disabled = !check.checked;
          if(!check.checked) qty.value = '0';
          else qty.focus();
        });
        qty.addEventListener('blur', () => {
          let n = parseInt(qty.value, 10);
          if(isNaN(n) || n < 0) n = 0;
          qty.value = String(n);
        });
      });
    }

    // Mensajes al usuario: usa el toast de la app si existe
    setStatus(text, clearAfterMs){
      if(window.ZXUI && window.ZXUI.toast) window.ZXUI.toast(text, clearAfterMs);
      else if(text) console.log('[' + this.cfg.clave + '] ' + text);
    }

    _changed(){ this.root.dispatchEvent(new CustomEvent('zx:change', { bubbles:true })); }

    // ---------- Fotos ----------
    _addFiles(fileList){
      const files = Array.from(fileList || []).filter(f => f.type && f.type.startsWith('image/'));
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = e => {
          this.photos.push({ id: this.photoSeq++, dataUrl: e.target.result });
          this.renderThumbs();
        };
        reader.readAsDataURL(file);
      });
    }

    removePhoto(id){
      this.photos = this.photos.filter(p => p.id !== id);
      this.renderThumbs();
    }

    renderThumbs(){
      const wrap = this.$('[data-role="photo-thumbs"]');
      wrap.innerHTML = this.photos.map(p => `
        <div class="photo-thumb">
          <img src="${p.dataUrl}" alt="">
          <button type="button" class="remove-btn" data-photo-id="${p.id}" aria-label="Quitar foto">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>`).join('');
      const countEl = this.$('[data-role="photo-count"]');
      countEl.textContent = this.photos.length
        ? `${this.photos.length} foto(s) adjunta(s) · en el PDF se acomodan hasta ${PHOTOS_PER_PAGE} por página`
        : '';
      this._changed();
    }

    // ---------- Limpiar ----------
    async clear(){
      const msg = `Se borrarán todos los datos capturados y las fotos del formato ${this.cfg.clave}.`;
      const ok = (window.ZXUI && window.ZXUI.confirm)
        ? await window.ZXUI.confirm({ title:'¿Limpiar formulario?', message: msg, confirmText:'Sí, limpiar' })
        : confirm(msg);
      if(!ok) return;
      this.$$('input[type=text], input[type=date]').forEach(i => i.value = '');
      this.$$('input[type=radio], input[type=checkbox]').forEach(i => i.checked = false);
      this.$$('textarea').forEach(t => t.value = '');
      this.$$('.conteo-qty').forEach(i => { i.value = '0'; i.disabled = true; });
      this.photos = [];
      this.renderThumbs();
      this.setStatus('Formulario limpio', 2500);
      this._changed();
    }

    // ---------- PDF ----------
    // El PDF no se arma con páginas fijas: todo el formato se aplana en una lista
    // ordenada de "unidades" (título + contenido, fila de campos, tabla, bloque de fotos,
    // texto largo...) y se acomodan en páginas midiendo la altura REAL acumulada dentro
    // de una página oculta con el mismo estilo que la final.
    async downloadPDF(){
      if(this.busy) return;
      this.busy = true;
      // Asegura que las fuentes del formato estén cargadas antes de medir
      try{ if(document.fonts && document.fonts.load){ await Promise.all([document.fonts.load("300 12px 'Lab Grotesque'"), document.fonts.load("700 12px 'Lab Grotesque'")]); } }catch(e){}
      const pdfBtn = this.$('[data-action="pdf"]');
      if(pdfBtn){ pdfBtn.disabled = true; pdfBtn.classList.add('is-loading'); }
      this.setStatus('Generando PDF...');
      document.body.classList.add('capturing');
      await sleep(60);

      const prevScrollX = window.scrollX, prevScrollY = window.scrollY;
      window.scrollTo(0, 0);

      const host = document.createElement('div');
      host.style.cssText = 'position:fixed; left:-9999px; top:0;';
      document.body.appendChild(host);

      const measurePage = document.createElement('div');
      measurePage.className = 'page pdf-render';
      measurePage.style.cssText = 'position:absolute; left:-9999px; top:0; margin:0; box-shadow:none; border:none;';
      host.appendChild(measurePage);
      const measureFlow = document.createElement('div');
      measureFlow.style.cssText = 'display:flow-root;';
      measurePage.appendChild(measureFlow);

      const pageCS = getComputedStyle(measurePage);
      const pageInnerHeight = 1056 - parseFloat(pageCS.paddingTop) - parseFloat(pageCS.paddingBottom);
      const footerProbe = document.createElement('div');
      footerProbe.style.cssText = 'position:absolute; visibility:hidden; width:736px;';
      footerProbe.innerHTML = FOOTER_HTML;
      host.appendChild(footerProbe);
      const footerH = footerProbe.firstElementChild.getBoundingClientRect().height;
      footerProbe.remove();
      const footerClearance = Math.max(0, (footerH + FOOTER_BOTTOM_OFFSET) - parseFloat(pageCS.paddingBottom));
      const CONTENT_BUDGET = pageInnerHeight - footerClearance - SAFETY_MARGIN;

      const makeTextDiv = (text, minHeight) => {
        const div = document.createElement('div');
        div.style.cssText = TEXTAREA_DIV_STYLE + 'min-height:' + minHeight + 'px;';
        div.textContent = text;
        return div;
      };

      const fits = els => {
        els.forEach(e => measureFlow.appendChild(e));
        const h = measureFlow.getBoundingClientRect().height;
        els.forEach(e => measureFlow.removeChild(e));
        return h <= CONTENT_BUDGET;
      };

      const packUnits = units => {
        const pages = [];
        let current = [];
        measureFlow.innerHTML = '';
        const startNewPage = () => {
          if(current.length) pages.push(current);
          current = [];
          measureFlow.innerHTML = '';
        };
        const commit = els => {
          els.forEach(e => measureFlow.appendChild(e));
          current.push(...els);
        };

        for(const u of units){
          if(u.kind === 'normal'){
            if(current.length > 0 && !fits(u.els)) startNewPage();
            commit(u.els);
            continue;
          }
          let label = u.label;
          let text = u.rawText;
          const minH = u.minHeight;
          const build = t => label ? [label, makeTextDiv(t, minH)] : [makeTextDiv(t, minH)];

          if(text === ''){
            const els = build('');
            if(current.length > 0 && !fits(els)) startNewPage();
            commit(els);
            continue;
          }

          while(text !== ''){
            const wholeEls = build(text);
            if(fits(wholeEls)){ commit(wholeEls); label = null; text = ''; break; }
            // No cabe completo: búsqueda binaria del prefijo más largo (por palabras) que sí cabe
            const tokens = text.split(/(\s+)/);
            let lo = 0, hi = tokens.length, best = 0;
            while(lo <= hi){
              const mid = (lo + hi) >> 1;
              const candidateText = tokens.slice(0, mid).join('');
              if(candidateText !== '' && fits(build(candidateText))){ best = mid; lo = mid + 1; } else { hi = mid - 1; }
            }
            if(best === 0){
              if(current.length === 0){ commit(wholeEls); label = null; text = ''; break; }
              startNewPage();
              continue;
            }
            commit(build(tokens.slice(0, best).join('')));
            label = null;
            text = tokens.slice(best).join('');
            if(text !== '') startNewPage();
          }
        }
        if(current.length) pages.push(current);
        return pages;
      };

      try{
        const clones = this.pages.map(p => {
          const c = cloneWithState(p);
          c.classList.add('pdf-render');
          // Las tarjetas y contenedores de la interfaz (data-ui) no existen en el formato
          // impreso: se reemplazan por su contenido para conservar la estructura original.
          c.querySelectorAll('[data-ui]').forEach(w => w.replaceWith(...Array.from(w.childNodes)));
          c.removeAttribute('id');
          c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
          c.querySelectorAll('.meta-box, .page-bg, .page-footer').forEach(n => n.remove());
          host.appendChild(c);
          expandTextFields(c);
          return c;
        });
        const lastClone = clones[clones.length - 1];

        const units = [];
        // Todas las páginas excepto la última fluyen en orden natural
        clones.slice(0, -1).forEach(c => pushRunElements(Array.from(c.children), units));

        // Última página: bloques en el orden configurado
        const evTitle = lastClone.querySelector('[data-role="evidencias-title"]');
        evTitle.remove();
        lastClone.querySelectorAll('.print-hide').forEach(n => n.remove());

        for(const blockName of this.cfg.ordenFinal){
          if(blockName === 'evidencias'){
            this._pushPhotoUnits(units, evTitle, measureFlow, CONTENT_BUDGET);
            continue;
          }
          const block = lastClone.querySelector(`[data-block="${blockName}"]`);
          if(!block) continue;
          pushRunElements(Array.from(block.children), units);
          block.remove();
        }
        // Cualquier remanente directo en la última página (normalmente nada)
        pushRunElements(Array.from(lastClone.children), units);

        const pages = packUnits(units);
        const totalPages = pages.length;

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit:'pt', format:'letter' });
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        let pageIndex = 0;

        const captureAndAdd = async el => {
          const canvas = await html2canvas(el, {
            scale:2, useCORS:true, backgroundColor:'#ffffff',
            scrollX:0, scrollY:0,
            windowWidth: document.documentElement.scrollWidth,
            windowHeight: document.documentElement.scrollHeight,
            onclone: clonedDoc => {
              // Evita el error de html2canvas en Safari/iOS con -webkit-text-stroke vacío
              const fix = clonedDoc.createElement('style');
              fix.textContent = '*{-webkit-text-stroke-width:0px !important;-webkit-text-stroke-color:transparent !important;}';
              clonedDoc.head.appendChild(fix);
            }
          });
          // Normalmente es exactamente una página; si un bloque indivisible se pasó,
          // continúa en página(s) extra en vez de recortar.
          const pxPerPt = canvas.width / pdfW;
          const onePageHeightPx = pdfH * pxPerPt;
          let renderedPx = 0;
          while(renderedPx < canvas.height){
            const sliceH = Math.min(onePageHeightPx, canvas.height - renderedPx);
            const slice = document.createElement('canvas');
            slice.width = canvas.width;
            slice.height = sliceH;
            slice.getContext('2d').drawImage(canvas, 0, renderedPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
            if(pageIndex > 0) pdf.addPage('letter');
            pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfW, sliceH / pxPerPt);
            pageIndex++;
            renderedPx += sliceH;
          }
        };

        for(let p = 0; p < pages.length; p++){
          const pageDiv = document.createElement('div');
          pageDiv.className = 'page pdf-render';
          pageDiv.style.margin = '0';
          pageDiv.innerHTML = this.metaBoxHTML(p + 1, totalPages);
          const bgImg = document.createElement('img');
          bgImg.className = 'page-bg';
          bgImg.alt = '';
          bgImg.src = window.ZX_MEMBRETE;
          pageDiv.appendChild(bgImg);
          host.appendChild(pageDiv);
          pages[p].forEach(el => pageDiv.appendChild(el));
          pageDiv.insertAdjacentHTML('beforeend', FOOTER_HTML);
          this.setStatus(`Generando PDF... (${p + 1}/${totalPages})`);
          await sleep(20);
          await captureAndAdd(pageDiv);
          pageDiv.remove();
        }

        if(isIOS()){
          window.open(pdf.output('bloburl'), '_blank');
          this.setStatus('PDF listo — usa el botón de compartir para guardarlo', 4000);
        } else {
          pdf.save(this.cfg.archivoPDF);
          this.setStatus('PDF descargado ✓', 3000);
        }
      }catch(err){
        console.error('Error generando el PDF:', err);
        this.setStatus('Error al generar el PDF' + (err && err.message ? (': ' + err.message) : ''), 6000);
      }finally{
        host.remove();
        document.body.classList.remove('capturing');
        window.scrollTo(prevScrollX, prevScrollY);
        if(pdfBtn){ pdfBtn.disabled = false; pdfBtn.classList.remove('is-loading'); }
        this.busy = false;
      }
    }

    // Evidencias: grupos de hasta 6 fotos (2 x 3). Cada grupo es indivisible.
    _pushPhotoUnits(units, evTitle, measureFlow, budget){
      const total = this.photos.length;
      if(total === 0){
        const msg = document.createElement('div');
        msg.style.cssText = 'padding:26px; text-align:center; color:#9aa0ae; font-size:11.5px; border:1px dashed #ccc;';
        msg.textContent = 'No se adjuntaron evidencias fotográficas.';
        units.push({ kind:'normal', els:[evTitle, msg] });
        return;
      }
      measureFlow.innerHTML = '';
      measureFlow.appendChild(evTitle);
      const titleH = measureFlow.getBoundingClientRect().height;
      measureFlow.innerHTML = '';
      const rowsPerPage = Math.ceil(PHOTOS_PER_PAGE / PHOTO_COLS);
      const gridRoom = budget - titleH - 6;
      let cellH = Math.floor((gridRoom - (rowsPerPage - 1) * PHOTO_GAP) / rowsPerPage);
      cellH = Math.max(120, Math.min(PHOTO_MAX_H, cellH));

      for(let g = 0; g < total; g += PHOTOS_PER_PAGE){
        const grid = document.createElement('div');
        grid.className = 'photo-grid';
        grid.style.display = 'grid';
        grid.style.gridAutoRows = cellH + 'px';
        grid.style.gap = PHOTO_GAP + 'px';
        this.photos.slice(g, g + PHOTOS_PER_PAGE).forEach(p => {
          const cell = document.createElement('div');
          cell.className = 'photo-cell';
          const img = document.createElement('img');
          img.src = p.dataUrl;
          img.style.maxWidth = PHOTO_MAX_W + 'px';
          img.style.maxHeight = Math.max(20, Math.min(PHOTO_MAX_H, cellH - 2)) + 'px';
          cell.appendChild(img);
          grid.appendChild(cell);
        });
        let els = [grid];
        if(g === 0) els = [evTitle, grid];
        else {
          const cont = evTitle.cloneNode(true);
          cont.textContent = 'Evidencias Fotográficas (continuación)';
          els = [cont, grid];
        }
        units.push({ kind:'normal', els });
      }
    }
  }

  window.ReportForm = ReportForm;
})();
