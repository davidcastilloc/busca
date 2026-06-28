// ═══════════════════════════════════════════════════════
// BUSCADOR INTELIGENTE UNIFICADO — dondeestan.org
// ═══════════════════════════════════════════════════════

// Comprimir imagen en el cliente
async function comprimirImagen(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 800;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Error al comprimir blob"));
          },
          "image/jpeg",
          0.75
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// Convertir blob a base64
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // Solo la parte base64 sin el prefijo data:
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ═══ DOM ELEMENTS (definidos con let para re-evaluar con view transitions) ═══
let formSearchExact: HTMLFormElement | null = null;
let queryExact: HTMLInputElement | null = null;
let btnBuscar: HTMLButtonElement | null = null;
let btnBuscarIcon: HTMLElement | null = null;
let btnBuscarSpinner: HTMLElement | null = null;
let loader: HTMLElement | null = null;
let resultsHeader: HTMLElement | null = null;
let resultsContainer: HTMLElement | null = null;
let scrollSentinel: HTMLElement | null = null;
let emptyState: HTMLElement | null = null;
let noResultsCta: HTMLElement | null = null;

// Foto search
let btnFotoSearch: HTMLElement | null = null;
let fotoSearchInput: HTMLInputElement | null = null;
let fotoSearchStatus: HTMLElement | null = null;

// Stats
let statTotal: HTMLElement | null = null;
let statActivos: HTMLElement | null = null;
let statLocalizados: HTMLElement | null = null;

// Historial
let historialContainer: HTMLElement | null = null;
let historialChips: HTMLElement | null = null;

// Filtros
let filterStateBar: HTMLDivElement | null = null;
let btnFilterAll: HTMLElement | null = null;
let btnFilterNoContact: HTMLElement | null = null;
let btnFilterLocated: HTMLElement | null = null;
let btnToggleAdvanced: HTMLElement | null = null;
let advancedFilters: HTMLElement | null = null;
let filterSexo: HTMLSelectElement | null = null;
let filterEdad: HTMLSelectElement | null = null;

// Modal elements
let modalDetalle: HTMLElement | null = null;
let modalClose: HTMLElement | null = null;
let modalBody: HTMLElement | null = null;
let modalActions: HTMLElement | null = null;
let modalTipoBadge: HTMLElement | null = null;

// Refugio
let globalRefugioSelect: HTMLSelectElement | null = null;
let globalRefugioOtroWrap: HTMLElement | null = null;
let globalRefugioOtroInput: HTMLInputElement | null = null;

// Estado global
let currentData: any = null;
let currentTipo: string = "";
let currentSearchResults: any[] = [];
let currentSubTab: "todos" | "sin_contacto" | "localizados" = "todos";
let offset = 0;
const limit = 20;
let hasMore = false;
let currentQuery = "";
let isLoadingMore = false;
let isSearching = false;

// ═══ STATS ANIMADAS ═══
async function cargarStats() {
  try {
    const resp = await fetch("/api/stats");
    if (!resp.ok) return;
    const data = await resp.json();
    animarContador(statTotal, data.total_registrados);
    animarContador(statActivos, data.reportes_activos);
    animarContador(statLocalizados, data.localizados);
  } catch { /* silencioso */ }
}

function animarContador(el: HTMLElement | null, target: number) {
  if (!el) return;
  const duration = 800;
  const start = performance.now();
  const startVal = 0;
  
  function tick(now: number) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Easing: ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startVal + (target - startVal) * eased);
    el!.textContent = current.toLocaleString("es-VE");
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ═══ HISTORIAL (localStorage) ═══
const HISTORIAL_KEY = "dondeestan_historial";
const MAX_HISTORIAL = 5;

function getHistorial(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORIAL_KEY) || "[]");
  } catch { return []; }
}

function guardarEnHistorial(q: string) {
  const historial = getHistorial().filter(h => h !== q);
  historial.unshift(q);
  if (historial.length > MAX_HISTORIAL) historial.pop();
  localStorage.setItem(HISTORIAL_KEY, JSON.stringify(historial));
}

function renderHistorial() {
  const historial = getHistorial();
  if (historial.length === 0 || !historialContainer || !historialChips) return;
  
  historialContainer.classList.remove("hidden");
  historialChips.innerHTML = historial.map(q => 
    `<button type="button" class="historial-chip px-3 py-1.5 rounded-full bg-canvas-soft text-ink text-xs font-uber-text font-medium border border-canvas-soft hover:bg-surface-pressed transition-colors cursor-pointer" data-query="${q.replace(/"/g, '&quot;')}">${q}</button>`
  ).join("");
  
  historialChips.querySelectorAll(".historial-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const q = (chip as HTMLElement).dataset.query || "";
      if (queryExact) queryExact.value = q;
      realizarBusqueda(q);
    });
  });
}



function actualizarFiltroUI() {
  if (!btnFilterAll || !btnFilterNoContact || !btnFilterLocated) return;
  const activeClass = "px-4 py-1.5 rounded-full bg-primary text-white font-uber-text text-xs font-semibold transition-colors cursor-pointer";
  const inactiveClass = "px-4 py-1.5 rounded-full bg-canvas-soft text-ink hover:bg-surface-pressed font-uber-text text-xs font-semibold transition-colors cursor-pointer";
  btnFilterAll.className = currentSubTab === "todos" ? activeClass : inactiveClass;
  btnFilterNoContact.className = currentSubTab === "sin_contacto" ? activeClass : inactiveClass;
  btnFilterLocated.className = currentSubTab === "localizados" ? activeClass : inactiveClass;
}

// ═══ EVENTO EXTERNO (abrir detalle desde mapa) ═══
window.addEventListener("abrir-detalle-caso", async (e: any) => {
  const { id, tipo } = e.detail;
  try {
    mostrarLoader(true);
    const fetchUrl = tipo === "persona" ? `/api/personas/${id}` : `/api/reportes/${id}`;
    const detailResp = await fetch(fetchUrl);
    if (detailResp.ok) {
      const detailData = await detailResp.json();
      abrirModalDetalle(detailData, tipo);
    }
  } catch (err) {
    console.error("Error al abrir detalle desde evento externo:", err);
  } finally {
    mostrarLoader(false);
  }
});

// ═══ BÚSQUEDA UNIFICADA ═══
async function realizarBusqueda(q: string, fotoBase64?: string, append = false) {
  if (!q && !fotoBase64) return;
  if (isSearching && !append) return;
  
  isSearching = true;
  
  if (!append) {
    offset = 0;
    currentSearchResults = [];
    if (emptyState) emptyState.classList.add("hidden");
    if (noResultsCta) noResultsCta.classList.add("hidden");
    mostrarLoader(true);
    mostrarBuscarLoading(true);
    if (scrollSentinel) scrollSentinel.classList.add("hidden");
  } else {
    isLoadingMore = true;
  }
  
  currentQuery = q;
  
  try {
    const body: any = { q, limit, offset };
    if (fotoBase64) body.foto_base64 = fotoBase64;
    
    const resp = await fetch("/api/buscar-unificado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    if (!resp.ok) throw new Error("Error en búsqueda");
    
    const data = await resp.json();
    const nuevosResultados = data.results || [];
    hasMore = data.hasMore || false;
    
    if (append) {
      currentSearchResults.push(...nuevosResultados);
    } else {
      currentSearchResults = nuevosResultados;
      // Guardar en historial solo búsquedas de texto
      if (q) guardarEnHistorial(q);
    }
    
    if (currentSearchResults.length === 0 && !append) {
      // Sin resultados
      if (noResultsCta) noResultsCta.classList.remove("hidden");
      if (filterStateBar) filterStateBar.classList.add("hidden");
      if (resultsHeader) resultsHeader.classList.add("hidden");
    } else {
      if (noResultsCta) noResultsCta.classList.add("hidden");
      if (filterStateBar) filterStateBar.classList.remove("hidden");
      if (!append) {
        currentSubTab = "todos";
        actualizarFiltroUI();
      }
      aplicarFiltrosYRenderizar();
    }
    
    if (hasMore && scrollSentinel) {
      scrollSentinel.classList.remove("hidden");
      scrollSentinel.classList.add("flex");
    } else if (scrollSentinel) {
      scrollSentinel.classList.add("hidden");
      scrollSentinel.classList.remove("flex");
    }
  } catch (err) {
    console.error(err);
    if (!append) {
      mostrarMensajeHeader("❌ Error de conexión al buscar.", true);
    }
  } finally {
    mostrarLoader(false);
    mostrarBuscarLoading(false);
    isLoadingMore = false;
    isSearching = false;
  }
}



// ═══ UTILIDADES ═══
function mostrarLoader(show: boolean) {
  if (loader) { show ? loader.classList.remove("hidden") : loader.classList.add("hidden"); }
}

function mostrarBuscarLoading(show: boolean) {
  if (btnBuscarIcon) show ? btnBuscarIcon.classList.add("hidden") : btnBuscarIcon.classList.remove("hidden");
  if (btnBuscarSpinner) show ? btnBuscarSpinner.classList.remove("hidden") : btnBuscarSpinner.classList.add("hidden");
  if (btnBuscar) btnBuscar.disabled = show;
}

function mostrarMensajeHeader(msg: string, isError = false) {
  if (resultsHeader && resultsContainer) {
    resultsHeader.textContent = msg;
    resultsHeader.classList.remove("hidden");
    resultsHeader.className = isError
      ? "font-uber-text uber-body-md-strong text-primary mt-8 mb-4"
      : "font-uber-text uber-body-md-strong text-body mt-8 mb-4";
    if (isError) {
      resultsContainer.innerHTML = "";
      if (filterStateBar) filterStateBar.classList.add("hidden");
    }
  }
}

// ═══ FILTRAR Y RENDERIZAR ═══

function aplicarFiltrosYRenderizar() {
  if (!resultsContainer) return;
  resultsContainer.innerHTML = "";
  
  const filtrados = currentSearchResults.filter(item => {
    // Filtro sub-tab (estado)
    if (currentSubTab !== "todos") {
      const esPersona = item._source === "persona";
      if (currentSubTab === "sin_contacto") {
        if (esPersona) { if (item.estado !== "desconocido") return false; }
        else { if (!(item.tipo === "desaparecido" && item.estado_reporte === "abierto")) return false; }
      }
      if (currentSubTab === "localizados") {
        if (esPersona) { if (item.estado !== "localizado" && item.estado !== "herido") return false; }
        else { if (item.estado_reporte !== "resuelto") return false; }
      }
    }
    
    // Filtro sexo
    const sexoVal = filterSexo?.value;
    if (sexoVal && item.sexo && item.sexo !== sexoVal) return false;
    
    // Filtro edad (rangos)
    const edadVal = filterEdad?.value;
    if (edadVal && item.edad) {
      const edad = parseInt(item.edad);
      if (!isNaN(edad)) {
        if (edadVal === "0-12" && (edad < 0 || edad > 12)) return false;
        if (edadVal === "13-17" && (edad < 13 || edad > 17)) return false;
        if (edadVal === "18-30" && (edad < 18 || edad > 30)) return false;
        if (edadVal === "31-50" && (edad < 31 || edad > 50)) return false;
        if (edadVal === "51-70" && (edad < 51 || edad > 70)) return false;
        if (edadVal === "71+" && edad < 71) return false;
      }
    }
    
    return true;
  });

  if (filtrados.length === 0) {
    mostrarMensajeHeader("Sin resultados para este filtro.");
    return;
  }

  mostrarMensajeHeader(`${filtrados.length} resultados encontrados:`);

  filtrados.forEach(item => {
    let card;
    if (item._source === "persona") {
      card = crearCardPersona(item);
      card.addEventListener("click", () => abrirModalDetalle(item, "persona"));
      
      // Evento botón localizar -> Abrir modal de reporte rápido para verificar
      const btn = card.querySelector(".btn-localizar-persona");
      if (btn) {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          currentData = item;
          currentTipo = "persona";
          abrirReporteRapido();
        });
      }
    } else {
      card = crearCardReporte(item);
      card.addEventListener("click", () => abrirModalDetalle(item, "reporte"));
    }
    resultsContainer.appendChild(card);
  });
}

function crearCardPersona(p: any): HTMLDivElement {
  const card = document.createElement("div");
  const config = getEstadoConfig(p.estado, p.verificacion);
  const imgHtml = p.foto_key 
    ? `<figure class="w-full aspect-[4/3] sm:aspect-auto sm:w-36 sm:self-stretch shrink-0 bg-canvas-soft flex items-center justify-center overflow-hidden"><img src="/api/upload?key=${encodeURIComponent(p.foto_key)}" alt="Foto" class="w-full h-full object-contain" loading="lazy" /></figure>`
    : `<div class="w-full aspect-[4/3] sm:aspect-auto sm:w-36 sm:self-stretch shrink-0 bg-canvas-soft flex items-center justify-center text-4xl text-mute">👤</div>`;

  const btnLocalizado = p.estado === 'desconocido'
    ? `<button class="btn-localizar-persona btn btn-sm bg-canvas-soft hover:bg-surface-pressed border border-ink/15 text-ink font-uber-text text-xs font-semibold mt-2 self-start rounded-full transition-transform active:scale-[0.98] cursor-pointer flex items-center gap-1.5 px-3 py-1">
         <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
         Marcar localizado
       </button>`
    : "";

  card.className = "cv-auto bg-canvas border border-canvas-soft rounded-xl shadow-sm flex flex-col sm:flex-row overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md active:scale-[0.98]";
  card.innerHTML = `
    ${imgHtml}
    <div class="p-4 flex flex-col justify-between flex-grow min-w-0">
      <div>
        <div class="flex items-center justify-between gap-2 mb-1">
          <h2 class="font-uber-display text-lg text-ink truncate">${p.nombre} ${p.apellido || ""}</h2>
          <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-uber-text font-medium shrink-0 ${config.badge}">
            <span class="w-1.5 h-1.5 rounded-full ${config.dot}"></span>
            <span>${config.text}</span>
          </div>
        </div>
        <div class="text-sm text-body font-uber-text space-y-0.5">
          ${p.refugio ? `<div>📍 ${p.refugio}</div>` : ""}
          ${p.ubicacion_nombre ? `<div>📍 ${p.ubicacion_nombre}</div>` : ""}
          ${p.edad ? `<div>${p.edad} años${p.sexo && p.sexo !== "X" ? ` · ${p.sexo === "M" ? "Masculino" : "Femenino"}` : ""}</div>` : ""}
        </div>
        ${btnLocalizado}
      </div>
      <div class="text-[11px] text-mute mt-2 font-uber-text">${formatFechaLocal(p.updated_at)}</div>
    </div>
  `;
  return card;
}

function crearCardReporte(r: any): HTMLDivElement {
  const card = document.createElement("div");
  const config = getTipoConfig(r.tipo, r.verificacion);
  const score = r.score ? Math.round(r.score * 100) : null;
  const imgHtml = r.foto_key 
    ? `<figure class="w-full aspect-[4/3] sm:aspect-auto sm:w-36 sm:self-stretch shrink-0 bg-canvas-soft flex items-center justify-center overflow-hidden"><img src="/api/upload?key=${encodeURIComponent(r.foto_key)}" alt="Foto" class="w-full h-full object-contain" loading="lazy" /></figure>`
    : `<div class="w-full aspect-[4/3] sm:aspect-auto sm:w-36 sm:self-stretch shrink-0 bg-canvas-soft flex items-center justify-center text-4xl text-mute">📢</div>`;

  card.className = "cv-auto bg-canvas border border-canvas-soft rounded-xl shadow-sm flex flex-col sm:flex-row overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md active:scale-[0.98]";
  card.innerHTML = `
    ${imgHtml}
    <div class="p-4 flex flex-col justify-between flex-grow min-w-0">
      <div>
        <div class="flex items-center justify-between gap-2 mb-1">
          <h2 class="font-uber-display text-lg text-ink truncate">${r.nombre_buscado || "Sin identificar"}</h2>
          <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-uber-text font-medium shrink-0 ${config.badge}">
            <span class="w-1.5 h-1.5 rounded-full ${config.dot}"></span>
            <span>${config.text}</span>
          </div>
        </div>
        ${score !== null ? `<div class="text-xs font-uber-text font-medium bg-primary text-white px-2 py-0.5 rounded-full inline-block mb-1">🎯 ${score}% match</div>` : ""}
        <p class="text-sm text-body font-uber-text line-clamp-2">${r.descripcion || ""}</p>
      </div>
      <div class="text-[11px] text-mute mt-2 font-uber-text">${formatFechaLocal(r.updated_at)}</div>
    </div>
  `;
  return card;
}

// ═══ MODAL DE DETALLE ═══
function abrirModalDetalle(data: any, tipo: string) {
  if (!modalDetalle || !modalBody || !modalActions || !modalTipoBadge) return;
  currentData = data;
  currentTipo = tipo;

  // Badge tipo
  if (tipo === "persona") {
    const cfg = getEstadoConfig(data.estado, data.verificacion);
    modalTipoBadge.className = `text-xs font-uber-text font-medium px-3 py-1 rounded-full ${cfg.badge}`;
    modalTipoBadge.innerHTML = `<span class="inline-block w-1.5 h-1.5 rounded-full ${cfg.dot} mr-1"></span>${cfg.text}`;
  } else {
    const cfg = getTipoConfig(data.tipo, data.verificacion);
    modalTipoBadge.className = `text-xs font-uber-text font-medium px-3 py-1 rounded-full ${cfg.badge}`;
    modalTipoBadge.innerHTML = `<span class="inline-block w-1.5 h-1.5 rounded-full ${cfg.dot} mr-1"></span>${cfg.text}`;
  }

  // Body
  const nombre = tipo === "persona" 
    ? `${data.nombre} ${data.apellido || ""}` 
    : (data.nombre_buscado || "Persona no identificada");

  const fotoHtml = data.foto_key 
    ? `<img src="/api/upload?key=${encodeURIComponent(data.foto_key)}" alt="Foto" class="w-full max-h-[50vh] object-contain rounded-xl bg-canvas-soft" />`
    : `<div class="w-full h-48 bg-canvas-soft rounded-xl flex items-center justify-center text-6xl text-mute">${tipo === "persona" ? "👤" : "📢"}</div>`;

  let datosHtml = "";
  if (tipo === "persona") {
    datosHtml = `
      ${campo("Documento", data.cedula)}
      ${campo("Edad", data.edad ? `${data.edad} años` : null)}
      ${campo("Sexo", data.sexo === "M" ? "Masculino" : data.sexo === "F" ? "Femenino" : data.sexo === "X" ? "No especifica" : null)}
      ${campo("Refugio", data.refugio)}
      ${campo("Zona / Sector", data.ubicacion_nombre)}
      ${campo("Contacto", data.contacto)}
      ${campo("Fuente", data.fuente)}
      ${campo("Registrado", formatFechaLocal(data.created_at))}
      ${campo("Actualizado", formatFechaLocal(data.updated_at))}
    `;
  } else {
    datosHtml = `
      ${campo("Tipo", getTipoConfig(data.tipo).text)}
      ${campo("Documento", data.cedula_buscado)}
      ${campo("Ubicación", data.ubicacion_nombre)}
      ${campo("Reportado por", data.reportante_nombre)}
      ${campo("Contacto", data.reportante_contacto)}
      ${campo("Estado", (data.estado_reporte || "abierto").toUpperCase())}
      ${campo("Fecha", formatFechaLocal(data.created_at))}
    `;
  }

  const notasHtml = (tipo === "persona" && (data.notas || data.notes))
    ? `<div class="bg-canvas-soft p-4 rounded-xl border-l-3 border-primary">
         <div class="text-xs text-mute font-uber-text font-medium mb-1 uppercase tracking-wider">Notas</div>
         <p class="text-sm text-ink font-uber-text italic">"${data.notas || data.notes || ""}"</p>
       </div>` 
    : "";

  const descripcionHtml = (tipo === "reporte" && data.descripcion)
    ? `<div class="bg-canvas-soft p-4 rounded-xl border-l-3 border-primary">
         <div class="text-xs text-mute font-uber-text font-medium mb-1 uppercase tracking-wider">Descripción</div>
         <p class="text-sm text-ink font-uber-text italic">"${data.descripcion}"</p>
       </div>`
    : "";

  const lat = data.latitud;
  const lon = data.longitud;
  let mapaHtml = "";
  if (lat && lon) {
    const z = 15;
    const tileX = Math.floor((lon + 180) / 360 * Math.pow(2, z));
    const tileY = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
    mapaHtml = `
      <div class="space-y-2">
        <div class="text-xs text-mute font-uber-text font-medium uppercase tracking-wider">📍 Ubicación GPS</div>
        <div class="rounded-xl overflow-hidden border border-canvas-soft">
          <img src="https://tile.openstreetmap.org/${z}/${tileX}/${tileY}.png" 
               alt="Mapa" class="w-full h-48 object-cover" loading="lazy" />
        </div>
        <div class="flex gap-2">
          <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener" 
             class="btn bg-canvas-soft text-ink flex-1 text-sm font-uber-text">
            🗺️ Abrir en Google Maps
          </a>
        </div>
        <div class="text-xs text-mute font-uber-text text-center">${lat.toFixed(6)}, ${lon.toFixed(6)}</div>
      </div>`;
  }

  modalBody.innerHTML = `
    <div class="space-y-5 max-w-lg mx-auto">
      ${fotoHtml}
      <div>
        <h1 class="font-uber-display text-2xl text-ink mb-1">${nombre}</h1>
        ${data.score ? `<div class="text-xs font-uber-text font-medium bg-primary text-white px-2.5 py-1 rounded-full inline-block">🎯 Coincidencia: ${Math.round(data.score * 100)}%</div>` : ""}
      </div>
      <div class="grid grid-cols-1 gap-0 divide-y divide-canvas-soft bg-canvas-soft rounded-xl overflow-hidden">
        ${datosHtml}
      </div>
      ${notasHtml}
      ${descripcionHtml}
      ${mapaHtml}
    </div>
  `;

  // Acciones
  let actionsHtml = "";
  const contacto = data.contacto || data.reportante_contacto;
  let telValido = false;
  let tel = "";
  if (contacto) {
    tel = contacto.replace(/[^0-9+]/g, "");
    if (tel.length >= 7) {
      telValido = true;
    }
  }

  if (telValido) {
    actionsHtml += `<a href="tel:${tel}" class="btn bg-canvas-soft text-ink flex-1 min-w-[120px] font-uber-text uber-body-md-strong text-center justify-center items-center flex rounded-full hover:bg-surface-pressed transition-colors cursor-pointer">Llamar</a>`;
  } else {
    actionsHtml += `<button class="btn bg-canvas-soft text-mute flex-1 min-w-[120px] font-uber-text uber-body-md-strong opacity-50 cursor-not-allowed flex items-center justify-center rounded-full" disabled>Llamar</button>`;
  }

  actionsHtml += `<button id="btn-descargar-cartel" class="btn bg-canvas-soft text-ink flex-1 min-w-[120px] font-uber-text uber-body-md-strong rounded-full hover:bg-surface-pressed transition-colors cursor-pointer">Descargar</button>`;

  actionsHtml += `<button id="btn-compartir-link" class="btn bg-canvas-soft text-ink flex-1 min-w-[120px] font-uber-text uber-body-md-strong rounded-full hover:bg-surface-pressed transition-colors cursor-pointer">Compartir</button>`;

  if (tipo === "reporte" && data.estado_reporte !== "resuelto") {
    actionsHtml += `<button id="btn-marcar-encontrado" class="btn bg-primary text-white flex-1 min-w-[120px] font-uber-text uber-body-md-strong rounded-full hover:bg-black-elevated transition-colors cursor-pointer">Marcar encontrado</button>`;
  }

  if (tipo === "persona" && data.estado === "desconocido") {
    actionsHtml += `<button id="modal-btn-marcar-vivo" class="btn bg-primary text-white flex-1 min-w-[120px] font-uber-text uber-body-md-strong rounded-full hover:bg-black-elevated transition-colors cursor-pointer">Marcar localizado</button>`;
  }

  modalActions!.innerHTML = actionsHtml;

  // Event listeners de acciones
  document.getElementById("btn-reportar-vi")?.addEventListener("click", (e) => {
    e.stopPropagation();
    abrirReporteRapido();
  });

  document.getElementById("btn-descargar-cartel")?.addEventListener("click", (e) => {
    e.stopPropagation();
    generarYDescargarCartel();
  });

  document.getElementById("btn-compartir-link")?.addEventListener("click", (e) => {
    e.stopPropagation();
    compartirCaso();
  });

  document.getElementById("btn-marcar-encontrado")?.addEventListener("click", (e) => {
    e.stopPropagation();
    cerrarModal();
    abrirReporteRapido();
  });

  document.getElementById("modal-btn-marcar-vivo")?.addEventListener("click", (e) => {
    e.stopPropagation();
    cerrarModal();
    abrirReporteRapido();
  });

  // Mostrar modal
  modalDetalle!.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function cerrarModal() {
  if (!modalDetalle) return;
  modalDetalle.classList.add("hidden");
  document.body.style.overflow = "";
  currentData = null;
  currentTipo = "";
}

// Close handlers se registran dentro de initBuscador()

// ═══ CAMPO HELPER ═══
function campo(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<div class="px-4 py-3 flex justify-between items-center">
    <span class="text-xs text-mute font-uber-text font-medium uppercase tracking-wider">${label}</span>
    <span class="text-sm text-ink font-uber-text font-medium text-right">${value}</span>
  </div>`;
}

// ═══ REPORTE RÁPIDO "LO VI" ═══
let reporteRapidoMap: any = null;
let reporteRapidoMarker: any = null;

function initReporteRapidoMap(lat: number, lon: number, latInput: HTMLInputElement, lonInput: HTMLInputElement, gpsStatus: HTMLElement | null) {
  const mapDiv = document.getElementById("reporte-rapido-gps-map");
  if (!mapDiv || typeof (window as any).L === "undefined") return;

  mapDiv.classList.remove("hidden");
  const L = (window as any).L;

  if (!reporteRapidoMap) {
    reporteRapidoMap = L.map("reporte-rapido-gps-map", {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
    }).setView([lat, lon], 15);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(reporteRapidoMap);

    reporteRapidoMap.on("click", (e: any) => {
      latInput.value = e.latlng.lat.toFixed(6);
      lonInput.value = e.latlng.lng.toFixed(6);
      if (reporteRapidoMarker) reporteRapidoMarker.setLatLng(e.latlng);
      else reporteRapidoMarker = L.marker(e.latlng).addTo(reporteRapidoMap);
      if (gpsStatus) {
        gpsStatus.textContent = "Ubicación ajustada en mapa.";
        gpsStatus.className = "text-xs text-blue-600 font-uber-text italic font-medium";
      }
    });
  }

  if (reporteRapidoMarker) reporteRapidoMarker.setLatLng([lat, lon]);
  else reporteRapidoMarker = L.marker([lat, lon]).addTo(reporteRapidoMap);
  reporteRapidoMap.setView([lat, lon], 15);
  setTimeout(() => { if (reporteRapidoMap) reporteRapidoMap.invalidateSize(); }, 150);
}

async function obtenerGpsReporte(gpsStatus: HTMLElement | null, latInput: HTMLInputElement | null, lonInput: HTMLInputElement | null) {
  if (!gpsStatus || !latInput || !lonInput) return;
  gpsStatus.textContent = "Buscando ubicación GPS...";
  gpsStatus.className = "text-xs text-yellow-600 font-uber-text italic font-medium";

  if (!navigator.geolocation) {
    gpsStatus.textContent = "GPS no compatible";
    gpsStatus.className = "text-xs text-red-500 font-uber-text italic";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      latInput.value = lat.toString();
      lonInput.value = lon.toString();
      gpsStatus.textContent = `Ubicación GPS obtenida: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      gpsStatus.className = "text-xs text-success font-uber-text italic font-semibold";
      initReporteRapidoMap(lat, lon, latInput, lonInput, gpsStatus);
    },
    (error) => {
      let msg = "No se pudo obtener ubicación GPS";
      if (error.code === error.PERMISSION_DENIED) {
        msg = "Permiso de GPS denegado";
      }
      gpsStatus.textContent = msg;
      gpsStatus.className = "text-xs text-red-500 font-uber-text italic";
    },
    { timeout: 8000, enableHighAccuracy: true }
  );
}



function abrirReporteRapido() {
  const modal = document.getElementById("modal-reporte-rapido");
  if (!modal) return;
  modal.classList.remove("hidden");

  const enviar = document.getElementById("reporte-rapido-enviar") as HTMLButtonElement;
  const cancelar = document.getElementById("reporte-rapido-cancelar");
  const desc = document.getElementById("reporte-rapido-desc") as HTMLTextAreaElement;
  const nombreInput = document.getElementById("reporte-rapido-nombre") as HTMLInputElement;
  const contactoInput = document.getElementById("reporte-rapido-contacto") as HTMLInputElement;
  const gpsStatus = document.getElementById("reporte-rapido-gps-status");
  const latInput = document.getElementById("reporte-rapido-latitud") as HTMLInputElement;
  const lonInput = document.getElementById("reporte-rapido-longitud") as HTMLInputElement;
  const chkConfirm = document.getElementById("chk-reporte-rapido-confirmacion") as HTMLInputElement;
  const errorDiv = document.getElementById("reporte-rapido-error");
  const btnGps = document.getElementById("btn-reporte-rapido-gps");

  const fotoFile = document.getElementById("reporte-rapido-foto-file") as HTMLInputElement;
  const fotoKey = document.getElementById("reporte-rapido-foto-key") as HTMLInputElement;
  const fotoStatus = document.getElementById("reporte-rapido-foto-status");

  // Limpiar campos
  if (desc) desc.value = "";
  if (nombreInput) nombreInput.value = "";
  if (contactoInput) contactoInput.value = "";
  if (latInput) latInput.value = "";
  if (lonInput) lonInput.value = "";
  if (chkConfirm) chkConfirm.checked = false;
  if (fotoFile) fotoFile.value = "";
  if (fotoKey) fotoKey.value = "";
  
  if (globalRefugioSelect) {
    globalRefugioSelect.innerHTML = `<option value="">-- Seleccionar Refugio --</option><option value="otro">Otro albergue o dirección...</option>`;
  }
  if (globalRefugioOtroWrap) globalRefugioOtroWrap.classList.add("hidden");
  if (globalRefugioOtroInput) globalRefugioOtroInput.value = "";

  // Cargar refugios registrados
  fetch("/api/refugios")
    .then(r => r.json())
    .then(data => {
      if (data.refugios && globalRefugioSelect) {
        const options = data.refugios.map((ref: any) => `<option value="${ref.nombre.replace(/"/g, '&quot;')}">${ref.nombre}</option>`).join("");
        globalRefugioSelect.innerHTML = `<option value="">-- Seleccionar Refugio --</option>${options}<option value="otro">Otro albergue o dirección...</option>`;
      }
    })
    .catch(err => console.error("Error al cargar refugios:", err));

  if (fotoStatus) {
    fotoStatus.textContent = "";
    fotoStatus.classList.add("hidden");
  }
  if (errorDiv) {
    errorDiv.textContent = "";
    errorDiv.classList.add("hidden");
  }
  if (enviar) {
    enviar.disabled = false;
    enviar.textContent = "Enviar Reporte";
    enviar.classList.remove("opacity-50");
  }

  // Manejo de carga de foto con compresión en modal rápido
  const handleFotoChange = async (ev: Event) => {
    const input = ev.currentTarget as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (fotoStatus) {
      fotoStatus.textContent = "Comprimiendo foto...";
      fotoStatus.className = "text-[10px] text-yellow-600 font-uber-text mt-1 italic font-medium";
      fotoStatus.classList.remove("hidden");
    }

    try {
      const compressedBlob = await comprimirImagen(file);
      const formData = new FormData();
      formData.append("file", compressedBlob, "evidencia.jpg");

      if (fotoStatus) {
        fotoStatus.textContent = "Cargando foto de verificación...";
      }

      const resp = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      if (resp.ok) {
        const res = await resp.json();
        if (fotoKey) fotoKey.value = res.key;
        if (fotoStatus) {
          fotoStatus.textContent = "✓ Foto cargada correctamente";
          fotoStatus.className = "text-[10px] text-success font-uber-text mt-1 italic font-semibold";
        }
      } else {
        throw new Error();
      }
    } catch (err) {
      console.error(err);
      if (fotoStatus) {
        fotoStatus.textContent = "❌ Error al comprimir o cargar foto";
        fotoStatus.className = "text-[10px] text-red-500 font-uber-text mt-1 italic";
      }
    }
  };
  fotoFile?.addEventListener("change", handleFotoChange);

  // Buscar GPS de inmediato
  obtenerGpsReporte(gpsStatus, latInput, lonInput);

  // Listener para recargar GPS
  const handleGpsClick = () => obtenerGpsReporte(gpsStatus, latInput, lonInput);
  btnGps?.addEventListener("click", handleGpsClick);

  // Cancelar
  const handleCancel = () => {
    modal.classList.add("hidden");
    btnGps?.removeEventListener("click", handleGpsClick);
    fotoFile?.removeEventListener("change", handleFotoChange);
  };
  cancelar?.addEventListener("click", handleCancel, { once: true });

  // Clonar para evitar acumulamiento de event listeners
  const nuevoEnviar = enviar.cloneNode(true) as HTMLButtonElement;
  enviar.parentNode?.replaceChild(nuevoEnviar, enviar);

  nuevoEnviar.addEventListener("click", async () => {
    const descripcion = desc.value.trim();
    const reportante_nombre = nombreInput.value.trim() || null;
    const reportante_contacto = contactoInput.value.trim();
    const lat = latInput.value ? parseFloat(latInput.value) : null;
    const lon = lonInput.value ? parseFloat(lonInput.value) : null;
    const confirmado = chkConfirm.checked;
    const keyFoto = fotoKey.value;

    const refugioSelectVal = globalRefugioSelect?.value || "";
    const refugioOtroVal = globalRefugioOtroInput?.value.trim() || "";
    const refugioFinal = refugioSelectVal === "otro" ? refugioOtroVal : refugioSelectVal;

    // Validar descripcion
    if (!descripcion || descripcion.length < 10) {
      if (errorDiv) {
        errorDiv.textContent = "La descripción es requerida (mínimo 10 caracteres).";
        errorDiv.classList.remove("hidden");
      }
      desc.focus();
      return;
    }

    // Validar contacto
    if (!reportante_contacto) {
      if (errorDiv) {
        errorDiv.textContent = "Tu teléfono o contacto es obligatorio para notificar a los familiares.";
        errorDiv.classList.remove("hidden");
      }
      contactoInput.focus();
      return;
    }

    // Validar refugio
    if (!refugioFinal) {
      if (errorDiv) {
        errorDiv.textContent = "La ubicación o refugio es obligatorio.";
        errorDiv.classList.remove("hidden");
      }
      globalRefugioSelect?.focus();
      return;
    }

    // Validar foto obligatoria
    if (!keyFoto) {
      if (errorDiv) {
        errorDiv.textContent = "La foto de evidencia es obligatoria.";
        errorDiv.classList.remove("hidden");
      }
      return;
    }

    // Validar checkbox
    if (!confirmado) {
      if (errorDiv) {
        errorDiv.textContent = "Debes confirmar que la información ingresada es verídica.";
        errorDiv.classList.remove("hidden");
      }
      return;
    }

    if (errorDiv) errorDiv.classList.add("hidden");

    nuevoEnviar.textContent = "Enviando...";
    nuevoEnviar.disabled = true;
    nuevoEnviar.classList.add("opacity-50");

    try {
      let resp;
      if (currentTipo === "persona") {
        resp = await fetch(`/api/personas/${currentData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accion: "reportar_localizado",
            estado: "localizado",
            contacto: reportante_contacto,
            refugio: refugioFinal,
            notas: descripcion,
            foto_key: keyFoto,
            latitud: lat,
            longitud: lon
          })
        });
      } else if (currentTipo === "reporte") {
        resp = await fetch(`/api/reportes/${currentData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accion: "reportar_localizado",
            estado_reporte: "resuelto",
            contacto: reportante_contacto,
            refugio: refugioFinal,
            notas: descripcion,
            foto_key: keyFoto,
            latitud: lat,
            longitud: lon
          })
        });
      } else {
        // Fallback a POST reporte suelto (si no hay caso asignado)
        const nombreBuscado = currentData ? (currentData.nombre_buscado || `${currentData.nombre} ${currentData.apellido || ""}`) : "Persona";
        resp = await fetch("/api/reportes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "encontrado",
            nombre_buscado: nombreBuscado,
            descripcion,
            ubicacion_nombre: refugioFinal,
            latitud: lat,
            longitud: lon,
            reportante_nombre,
            reportante_contacto,
            cedula_buscado: currentData ? (currentData.cedula || currentData.cedula_buscado || null) : null,
            foto_key: keyFoto
          })
        });
      }

      if (resp.ok) {
        nuevoEnviar.textContent = "✓ Enviado";
        setTimeout(() => {
          modal.classList.add("hidden");
          btnGps?.removeEventListener("click", handleGpsClick);
        }, 1000);
      } else {
        const err = await resp.json();
        if (errorDiv) {
          errorDiv.textContent = `Error: ${err.error || "no se pudo enviar"}`;
          errorDiv.classList.remove("hidden");
        }
        nuevoEnviar.textContent = "Reintentar";
        nuevoEnviar.disabled = false;
        nuevoEnviar.classList.remove("opacity-50");
      }
    } catch {
      if (errorDiv) {
        errorDiv.textContent = "Sin conexión a internet.";
        errorDiv.classList.remove("hidden");
      }
      nuevoEnviar.textContent = "Reintentar";
      nuevoEnviar.disabled = false;
      nuevoEnviar.classList.remove("opacity-50");
    }
  });
}

// ═══ GENERAR Y DESCARGAR CARTEL "SE BUSCA" ═══
async function generarYDescargarCartel() {
  if (!currentData) return;
  
  const btn = document.getElementById("btn-descargar-cartel");
  if (!btn) return;
  btn.textContent = "Generando...";
  btn.classList.add("opacity-50");

  try {
    // Llenar datos del cartel
    const cartelNombre = document.getElementById("cartel-nombre");
    const cartelDatos = document.getElementById("cartel-datos");
    const cartelDescripcion = document.getElementById("cartel-descripcion");
    const cartelUbicacion = document.getElementById("cartel-ubicacion");
    const cartelContacto = document.getElementById("cartel-contacto");
    const cartelFotoWrap = document.getElementById("cartel-foto-wrap");

    const esReporte = currentTipo === "reporte";
    const nombre = esReporte 
      ? (currentData.nombre_buscado || "PERSONA DESAPARECIDA")
      : `${currentData.nombre} ${currentData.apellido || ""}`;

    if (cartelNombre) cartelNombre.textContent = nombre;

    if (cartelDatos) {
      const parts = [];
      const cedula = esReporte ? currentData.cedula_buscado : currentData.cedula;
      if (cedula) parts.push(`Doc: ${cedula}`);
      
      if (esReporte) {
        parts.push(`Reportado: ${formatFechaLocal(currentData.created_at)}`);
      } else {
        if (currentData.refugio) parts.push(`Refugio: ${currentData.refugio}`);
      }
      cartelDatos.textContent = parts.join(" | ");
    }

    if (cartelDescripcion) {
      cartelDescripcion.textContent = esReporte 
        ? (currentData.descripcion || "") 
        : (currentData.notas || "");
    }

    if (cartelUbicacion) {
      const ubicacion = currentData.ubicacion_nombre;
      cartelUbicacion.textContent = ubicacion ? `📍 Última ubicación: ${ubicacion}` : "";
    }

    const contactoVal = esReporte ? currentData.reportante_contacto : currentData.contacto;
    if (cartelContacto) {
      cartelContacto.textContent = contactoVal ? `CONTACTO: ${contactoVal}` : "CONTACTE AUTORIDADES";
    }

    // Cargar foto
    const fotoKey = currentData.foto_key;
    if (fotoKey && cartelFotoWrap) {
      cartelFotoWrap.innerHTML = `<img id="cartel-foto" style="position:absolute;" src="" alt="" crossorigin="anonymous" />`;
      const cartelFoto = document.getElementById("cartel-foto") as HTMLImageElement;
      try {
        const fotoResp = await fetch(`/api/upload?key=${encodeURIComponent(fotoKey)}`);
        if (!fotoResp.ok) throw new Error();
        const fotoBlob = await fotoResp.blob();
        const blobUrl = URL.createObjectURL(fotoBlob);

        await new Promise((resolve, reject) => {
          const img = new Image();
          img.src = blobUrl;
          img.onload = () => {
            const containerW = 600;
            const containerH = 400;
            const imgW = img.naturalWidth;
            const imgH = img.naturalHeight;

            const containerAspect = containerW / containerH; // 1.5
            const imgAspect = imgW / imgH;

            cartelFoto.src = blobUrl;
            if (imgAspect > containerAspect) {
              // Imagen muy ancha
              const newHeight = containerW / imgAspect;
              cartelFoto.style.width = `${containerW}px`;
              cartelFoto.style.height = `${newHeight}px`;
              cartelFoto.style.left = "0px";
              cartelFoto.style.top = `${(containerH - newHeight) / 2}px`;
            } else {
              // Imagen muy alta
              const newWidth = containerH * imgAspect;
              cartelFoto.style.height = `${containerH}px`;
              cartelFoto.style.width = `${newWidth}px`;
              cartelFoto.style.top = "0px";
              cartelFoto.style.left = `${(containerW - newWidth) / 2}px`;
            }
            resolve(null);
          };
          img.onerror = () => reject();
        });
      } catch {
        cartelFotoWrap.style.flexDirection = "column";
        cartelFotoWrap.innerHTML = `<div style="font-size:72px;color:#afafaf;">👤</div><div style="font-size:16px;color:#5e5e5e;font-weight:bold;margin-top:8px;">SIN FOTO</div>`;
      }
    } else if (cartelFotoWrap) {
      cartelFotoWrap.style.flexDirection = "column";
      cartelFotoWrap.innerHTML = `<div style="font-size:72px;color:#afafaf;">👤</div><div style="font-size:16px;color:#5e5e5e;font-weight:bold;margin-top:8px;">SIN FOTO DISPONIBLE</div>`;
    }

    // Cargar html2canvas desde CDN para evitar error 404 de Vite en dev
    let html2canvas = (window as any).html2canvas;
    if (!html2canvas) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      html2canvas = (window as any).html2canvas;
    }
    
    const cartelEl = document.getElementById("cartel-se-busca");
    if (!cartelEl) throw new Error("Cartel element not found");

    let canvas;
    try {
      canvas = await html2canvas(cartelEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        onclone: (clonedDoc) => {
          const styles = clonedDoc.querySelectorAll("style, link[rel='stylesheet']");
          styles.forEach(s => s.remove());
        }
      });
    } catch (err) {
      throw err;
    }

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), "image/png");
    });

    const nombreArchivo = `SE_BUSCA_${nombre.replace(/\s+/g, "_")}.png`;

    // Descarga directa
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
    
    btn.textContent = "✓ Descargado";
    setTimeout(() => {
      btn.textContent = "📥 Descargar";
      btn.classList.remove("opacity-50");
    }, 2500);

  } catch (err) {
    console.error("Error generando cartel:", err);
    btn.textContent = "Error";
    setTimeout(() => {
      btn.textContent = "📥 Descargar";
      btn.classList.remove("opacity-50");
    }, 2000);
  }
}

// ═══ COMPARTIR CASO POR REDES SOCIALES ═══
function compartirCaso() {
  if (!currentData) return;
  const esReporte = currentTipo === "reporte";
  const nombre = esReporte 
    ? (currentData.nombre_buscado || "Persona no identificada")
    : `${currentData.nombre} ${currentData.apellido || ""}`;
  const shareUrl = esReporte 
    ? `${window.location.origin}/?reporte=${currentData.id}`
    : `${window.location.origin}/?persona=${currentData.id}`;
  const texto = `SE BUSCA: ${nombre}. Ayúdanos a localizarlo. Ver reporte completo aquí:`;

  if (navigator.share) {
    navigator.share({
      title: "SE BUSCA",
      text: `${texto} ${shareUrl}`,
      url: shareUrl
    }).catch(err => {
      console.log("Error al compartir nativo, usando fallback", err);
      mostrarModalCompartirRedes(texto, shareUrl);
    });
  } else {
    mostrarModalCompartirRedes(texto, shareUrl);
  }
}

function mostrarModalCompartirRedes(texto: string, url: string) {
  const modal = document.getElementById("modal-compartir-redes");
  if (!modal) return;

  const linkWa = document.getElementById("share-wa") as HTMLAnchorElement;
  const linkFb = document.getElementById("share-fb") as HTMLAnchorElement;
  const linkX = document.getElementById("share-x") as HTMLAnchorElement;
  const btnCopy = document.getElementById("share-copy") as HTMLButtonElement;

  const textEncoded = encodeURIComponent(`${texto} ${url}`);
  const urlEncoded = encodeURIComponent(url);

  if (linkWa) linkWa.href = `https://api.whatsapp.com/send?text=${textEncoded}`;
  if (linkFb) linkFb.href = `https://www.facebook.com/sharer/sharer.php?u=${urlEncoded}`;
  if (linkX) linkX.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(texto)}&url=${urlEncoded}`;

  // Copiar link
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      const originalText = btnCopy.textContent;
      btnCopy.textContent = "✓ Copiado";
      setTimeout(() => { btnCopy.textContent = originalText; }, 2000);
    } catch (err) {
      console.error(err);
    }
  };
  
  btnCopy?.addEventListener("click", handleCopy, { once: true });

  modal.classList.remove("hidden");

  const closeBtn = document.getElementById("modal-compartir-close");
  const handleClose = () => {
    modal.classList.add("hidden");
  };
  closeBtn?.addEventListener("click", handleClose, { once: true });
  
  const handleOutsideClick = (e: MouseEvent) => {
    if (e.target === modal) handleClose();
  };
  modal.addEventListener("click", handleOutsideClick, { once: true });
}

// ═══ CONFIGS DE ESTADO/TIPO ═══
function getEstadoConfig(estado: string, verificacion = "ninguna") {
  if (verificacion === "pendiente") {
    return { badge: "border border-yellow-500/30 text-ink bg-canvas", dot: "bg-yellow-500", text: "Localizado (Sin confirmar)" };
  }
  const configs: Record<string, { badge: string, dot: string, text: string }> = {
    localizado: { badge: "border border-green-500/30 text-ink bg-canvas", dot: "bg-green-500", text: "Localizado" },
    herido: { badge: "border border-yellow-500/30 text-ink bg-canvas", dot: "bg-yellow-500", text: "Herido" },
    fallecido: { badge: "border border-red-500/30 text-ink bg-canvas", dot: "bg-red-500", text: "Fallecido" },
    desconocido: { badge: "border border-canvas-soft text-ink bg-canvas", dot: "bg-mute", text: "Desconocido" }
  };
  return configs[estado] || configs.desconocido;
}

function getTipoConfig(tipo: string, verificacion = "ninguna") {
  if (verificacion === "pendiente") {
    return { badge: "border border-yellow-500/30 text-ink bg-canvas", dot: "bg-yellow-500", text: "Encontrado (Sin confirmar)" };
  }
  const configs: Record<string, { badge: string, dot: string, text: string }> = {
    desaparecido: { badge: "border border-red-500/30 text-ink bg-canvas", dot: "bg-red-500", text: "Desaparecido" },
    encontrado: { badge: "border border-green-500/30 text-ink bg-canvas", dot: "bg-green-500", text: "Encontrado" },
    refugio: { badge: "border border-blue-500/30 text-ink bg-canvas", dot: "bg-blue-500", text: "Refugio" },
    necesidad: { badge: "border border-yellow-500/30 text-ink bg-canvas", dot: "bg-yellow-500", text: "Necesidad" }
  };
  return configs[tipo] || { badge: "border border-canvas-soft text-ink bg-canvas", dot: "bg-mute", text: "Reporte" };
}

function formatFechaLocal(fechaStr: string) {
  if (!fechaStr) return "Reciente";
  try {
    let d = new Date(fechaStr.includes("Z") || fechaStr.includes("+") ? fechaStr : fechaStr + " UTC");
    if (isNaN(d.getTime())) {
      d = new Date(fechaStr);
    }
    if (isNaN(d.getTime())) {
      return "Reciente";
    }
    return d.toLocaleString("es-VE", { 
      timeZone: "America/Caracas",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  } catch { 
    return "Reciente"; 
  }
}

// ═══════════════════════════════════════════════════════
// INICIALIZACIÓN (SOPORTE PARA ASTRO VIEW TRANSITIONS)
// ═══════════════════════════════════════════════════════

function initBuscador() {
  // 1. Asignar DOM elements
  formSearchExact = document.getElementById("form-search-exact") as HTMLFormElement;
  queryExact = document.getElementById("query-exact") as HTMLInputElement;
  btnBuscar = document.getElementById("btn-buscar") as HTMLButtonElement;
  btnBuscarIcon = document.getElementById("btn-buscar-icon");
  btnBuscarSpinner = document.getElementById("btn-buscar-spinner");
  loader = document.getElementById("results-loader");
  resultsHeader = document.getElementById("results-header");
  resultsContainer = document.getElementById("results-container");
  scrollSentinel = document.getElementById("scroll-sentinel");
  emptyState = document.getElementById("empty-state");
  noResultsCta = document.getElementById("no-results-cta");

  btnFotoSearch = document.getElementById("btn-foto-search");
  fotoSearchInput = document.getElementById("foto-search-input") as HTMLInputElement;
  fotoSearchStatus = document.getElementById("foto-search-status");

  statTotal = document.getElementById("stat-total");
  statActivos = document.getElementById("stat-activos");
  statLocalizados = document.getElementById("stat-localizados");

  historialContainer = document.getElementById("historial-container");
  historialChips = document.getElementById("historial-chips");

  filterStateBar = document.getElementById("filter-state-bar") as HTMLDivElement;
  btnFilterAll = document.getElementById("btn-filter-all");
  btnFilterNoContact = document.getElementById("btn-filter-nocontact");
  btnFilterLocated = document.getElementById("btn-filter-located");
  btnToggleAdvanced = document.getElementById("btn-toggle-advanced-filters");
  advancedFilters = document.getElementById("advanced-filters");
  filterSexo = document.getElementById("filter-sexo") as HTMLSelectElement;
  filterEdad = document.getElementById("filter-edad") as HTMLSelectElement;

  modalDetalle = document.getElementById("modal-detalle");
  modalClose = document.getElementById("modal-close");
  modalBody = document.getElementById("modal-body");
  modalActions = document.getElementById("modal-actions");
  modalTipoBadge = document.getElementById("modal-tipo-badge");

  globalRefugioSelect = document.getElementById("reporte-rapido-refugio") as HTMLSelectElement;
  globalRefugioOtroWrap = document.getElementById("reporte-rapido-refugio-otro-wrap");
  globalRefugioOtroInput = document.getElementById("reporte-rapido-refugio-otro") as HTMLInputElement;

  // Si no estamos en la página del buscador, salir
  if (!formSearchExact) return;

  // 2a. Registrar Close handlers del modal (deben vivir aquí para re-registrarse con ClientRouter)
  modalClose?.addEventListener("click", cerrarModal);
  modalDetalle?.addEventListener("click", (e) => {
    if (e.target === modalDetalle) cerrarModal();
  });
  // Cleanup del listener global de Escape para evitar acumulación entre navegaciones
  if ((window as any).__buscadorEscapeCleanup) {
    (window as any).__buscadorEscapeCleanup();
  }
  const escapeHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") cerrarModal();
  };
  document.addEventListener("keydown", escapeHandler);
  (window as any).__buscadorEscapeCleanup = () => {
    document.removeEventListener("keydown", escapeHandler);
  };

  // 2b. Registrar Event Listeners
  globalRefugioSelect?.addEventListener("change", () => {
    if (globalRefugioSelect && globalRefugioSelect.value === "otro") {
      globalRefugioOtroWrap?.classList.remove("hidden");
      globalRefugioOtroInput?.setAttribute("required", "true");
      globalRefugioOtroInput?.focus();
    } else {
      globalRefugioOtroWrap?.classList.add("hidden");
      globalRefugioOtroInput?.removeAttribute("required");
    }
  });

  btnFotoSearch?.addEventListener("click", () => fotoSearchInput?.click());

  fotoSearchInput?.addEventListener("change", async (e) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    
    try {
      if (fotoSearchStatus) {
        fotoSearchStatus.textContent = "Procesando imagen...";
        fotoSearchStatus.classList.remove("hidden");
      }
      
      const compressed = await comprimirImagen(target.files[0]);
      const base64 = await blobToBase64(compressed);
      
      if (fotoSearchStatus) fotoSearchStatus.textContent = "Buscando con IA...";
      
      await realizarBusqueda("", base64);
      
      if (fotoSearchStatus) fotoSearchStatus.classList.add("hidden");
    } catch (err) {
      console.error("Error en búsqueda por foto:", err);
      if (fotoSearchStatus) {
        fotoSearchStatus.textContent = "❌ Error al procesar foto";
        fotoSearchStatus.classList.remove("hidden");
      }
    } finally {
      if (fotoSearchInput) fotoSearchInput.value = "";
    }
  });

  btnFilterAll?.addEventListener("click", () => {
    currentSubTab = "todos";
    actualizarFiltroUI();
    aplicarFiltrosYRenderizar();
  });
  btnFilterNoContact?.addEventListener("click", () => {
    currentSubTab = "sin_contacto";
    actualizarFiltroUI();
    aplicarFiltrosYRenderizar();
  });
  btnFilterLocated?.addEventListener("click", () => {
    currentSubTab = "localizados";
    actualizarFiltroUI();
    aplicarFiltrosYRenderizar();
  });

  btnToggleAdvanced?.addEventListener("click", () => {
    if (advancedFilters) {
      const hidden = advancedFilters.classList.toggle("hidden");
      if (btnToggleAdvanced) btnToggleAdvanced.textContent = hidden ? "↓ Más filtros" : "↑ Menos filtros";
    }
  });

  filterSexo?.addEventListener("change", () => aplicarFiltrosYRenderizar());
  filterEdad?.addEventListener("change", () => aplicarFiltrosYRenderizar());

  formSearchExact.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = queryExact?.value.trim();
    if (!q) {
      queryExact?.focus();
      return;
    }
    realizarBusqueda(q);
  });

  if (scrollSentinel) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
        offset += limit;
        realizarBusqueda(currentQuery, undefined, true);
      }
    }, { rootMargin: "150px" });
    observer.observe(scrollSentinel);
  }

  // Cargar stats e historial
  cargarStats();
  renderHistorial();
  
  // Cargar búsqueda o anuncio desde URL si existe
  const urlParams = new URLSearchParams(window.location.search);
  const qParam = urlParams.get("q");
  const personaParam = urlParams.get("persona");
  const reporteParam = urlParams.get("reporte");

  if (qParam && queryExact) {
    queryExact.value = qParam;
    realizarBusqueda(qParam);
  } else if (personaParam) {
    fetch(`/api/personas/${personaParam}`)
      .then(r => r.json())
      .then(data => {
        if (!data.error) {
          abrirModalDetalle(data, "persona");
        }
      })
      .catch(err => console.error(err));
  } else if (reporteParam) {
    fetch(`/api/reportes/${reporteParam}`)
      .then(r => r.json())
      .then(data => {
        if (!data.error) {
          abrirModalDetalle(data, "reporte");
        }
      })
      .catch(err => console.error(err));
  }
}

// Registrar con Astro Page Load
if (typeof document !== "undefined") {
  document.addEventListener("astro:page-load", initBuscador);
}
