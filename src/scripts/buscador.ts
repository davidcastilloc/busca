// ═══════════════════════════════════════════════════════
// LOGICA DE BUSCADOR RAPIDO (EXTRAIDA DE BUSCADORRAPIDO.ASTRO)
// ═══════════════════════════════════════════════════════

// Función para comprimir imagen en el cliente
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

const btnTabExact = document.getElementById("btn-tab-exact");
const btnTabSemantic = document.getElementById("btn-tab-semantic");
const panelExact = document.getElementById("panel-exact");
const panelSemantic = document.getElementById("panel-semantic");

const formSearchExact = document.getElementById("form-search-exact") as HTMLFormElement;
const formSearchSemantic = document.getElementById("form-search-semantic") as HTMLFormElement;

const queryExact = document.getElementById("query-exact") as HTMLInputElement;
const querySemantic = document.getElementById("query-semantic") as HTMLTextAreaElement;
const btnSubmitSemantic = document.getElementById("btn-submit-semantic");

const loader = document.getElementById("results-loader");
const resultsHeader = document.getElementById("results-header");
const resultsContainer = document.getElementById("results-container");
const scrollSentinel = document.getElementById("scroll-sentinel");

// Modal elements
const modalDetalle = document.getElementById("modal-detalle");
const modalClose = document.getElementById("modal-close");
const modalBody = document.getElementById("modal-body");
const modalActions = document.getElementById("modal-actions");
const modalTipoBadge = document.getElementById("modal-tipo-badge");

// Datos del resultado actualmente abierto en modal
let currentData: any = null;
let currentTipo: string = "";
let currentSearchResults: any[] = [];
let currentSubTab: "todos" | "sin_contacto" | "localizados" = "todos";

// Paginación
let offset = 0;
const limit = 20;
let hasMore = false;
let currentQuery = "";
let isLoadingMore = false;

const filterStateBar = document.getElementById("filter-state-bar") as HTMLDivElement;
const btnFilterAll = document.getElementById("btn-filter-all");
const btnFilterNoContact = document.getElementById("btn-filter-nocontact");
const btnFilterLocated = document.getElementById("btn-filter-located");

// Autocompletado con Debouncing para búsqueda exacta
let debounceTimeout: any = null;
const searchSuggestions = document.getElementById("search-suggestions");

queryExact?.addEventListener("input", () => {
  clearTimeout(debounceTimeout);
  const val = queryExact.value.trim();

  if (val.length < 2) {
    if (searchSuggestions) {
      searchSuggestions.innerHTML = "";
      searchSuggestions.classList.add("hidden");
    }
    return;
  }

  debounceTimeout = setTimeout(async () => {
    try {
      const resp = await fetch(`/api/sugerencias?q=${encodeURIComponent(val)}`);
      if (resp.ok && searchSuggestions) {
        const { sugerencias } = await resp.json();
        if (sugerencias.length === 0) {
          searchSuggestions.innerHTML = "";
          searchSuggestions.classList.add("hidden");
          return;
        }

        searchSuggestions.innerHTML = sugerencias.map((s: any) => {
          const esPersona = s.tipo === "persona";
          let subtext = "";
          if (esPersona) {
            subtext = `Censo · ${s.estado === "vivo" ? "A salvo" : s.estado === "herido" ? "Herido" : "Sin contacto"}`;
          } else {
            subtext = `Reporte · ${s.estado === "desaparecido" ? "Desaparecido" : "Encontrado"}`;
          }
          if (s.cedula) {
            subtext += ` · Doc: ${s.cedula}`;
          }
          return `
            <div class="p-3 hover:bg-surface-pressed cursor-pointer transition-colors" data-id="${s.id}" data-tipo="${s.tipo}">
              <div class="font-uber-text uber-body-md-strong text-ink">${s.nombre}</div>
              <div class="text-xs text-mute font-uber-text">${subtext}</div>
            </div>
          `;
        }).join("");

        searchSuggestions.classList.remove("hidden");

        // Event listeners para las sugerencias
        searchSuggestions.querySelectorAll("[data-id]").forEach(item => {
          item.addEventListener("click", async (e) => {
            e.stopPropagation();
            const id = item.getAttribute("data-id");
            const tipo = item.getAttribute("data-tipo");
            searchSuggestions.classList.add("hidden");
            queryExact.value = "";

            // Cargar detalle completo del caso y abrir modal
            try {
              mostrarLoader(true);
              let fetchUrl = tipo === "persona" ? `/api/personas/${id}` : `/api/reportes/${id}`;
              const detailResp = await fetch(fetchUrl);
              if (detailResp.ok) {
                const detailData = await detailResp.json();
                abrirModalDetalle(detailData, tipo!);
              }
            } catch (err) {
              console.error("Error al obtener detalle de sugerencia:", err);
            } finally {
              mostrarLoader(false);
            }
          });
        });
      }
    } catch (err) {
      console.error("Error al buscar sugerencias:", err);
    }
  }, 300);
});

// Cerrar sugerencias al hacer click fuera
document.addEventListener("click", (e) => {
  if (searchSuggestions && !searchSuggestions.contains(e.target as Node) && e.target !== queryExact) {
    searchSuggestions.classList.add("hidden");
  }
});

// Escuchar evento para abrir detalle de caso externamente (ej: desde el mapa)
window.addEventListener("abrir-detalle-caso", async (e: any) => {
  const { id, tipo } = e.detail;
  try {
    mostrarLoader(true);
    let fetchUrl = tipo === "persona" ? `/api/personas/${id}` : `/api/reportes/${id}`;
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

// Inicializar eventos de sub-tabs
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

function actualizarFiltroUI() {
  if (!btnFilterAll || !btnFilterNoContact || !btnFilterLocated) return;
  
  const activeClass = "px-4 py-1.5 rounded-full bg-primary text-white font-uber-text text-xs font-semibold transition-colors cursor-pointer";
  const inactiveClass = "px-4 py-1.5 rounded-full bg-canvas-soft text-ink hover:bg-surface-pressed font-uber-text text-xs font-semibold transition-colors cursor-pointer";
  
  btnFilterAll.className = currentSubTab === "todos" ? activeClass : inactiveClass;
  btnFilterNoContact.className = currentSubTab === "sin_contacto" ? activeClass : inactiveClass;
  btnFilterLocated.className = currentSubTab === "localizados" ? activeClass : inactiveClass;
}

// ═══ TABS ═══
if (btnTabExact && btnTabSemantic && panelExact && panelSemantic) {
  btnTabExact.addEventListener("click", () => {
    btnTabExact.className = "flex-1 sm:flex-none px-4 sm:px-5 py-3 rounded-[36px] bg-primary text-white font-uber-text uber-body-md-strong transition-colors cursor-pointer text-center";
    btnTabSemantic.className = "flex-1 sm:flex-none px-4 sm:px-5 py-3 rounded-[36px] bg-canvas-soft text-ink hover:bg-surface-pressed font-uber-text uber-body-md-strong transition-colors cursor-pointer text-center";
    panelExact.classList.remove("hidden");
    panelSemantic.classList.add("hidden");
  });
  btnTabSemantic.addEventListener("click", () => {
    btnTabExact.className = "flex-1 sm:flex-none px-4 sm:px-5 py-3 rounded-[36px] bg-canvas-soft text-ink hover:bg-surface-pressed font-uber-text uber-body-md-strong transition-colors cursor-pointer text-center";
    btnTabSemantic.className = "flex-1 sm:flex-none px-4 sm:px-5 py-3 rounded-[36px] bg-primary text-white font-uber-text uber-body-md-strong transition-colors cursor-pointer text-center";
    panelExact.classList.add("hidden");
    panelSemantic.classList.remove("hidden");
  });
}

// ═══ CHIPS DE ESCENARIO ═══
document.querySelectorAll(".chip-scenario").forEach(chip => {
  chip.addEventListener("click", () => {
    const tab = (chip as HTMLElement).dataset.tab;
    const placeholder = (chip as HTMLElement).dataset.placeholder;
    
    if (tab === "semantic") {
      // Cambiar a pestaña IA
      btnTabSemantic?.click();
      querySemantic?.focus();
    } else {
      // Actualizar placeholder del input exacto
      if (placeholder && queryExact) {
        queryExact.placeholder = placeholder;
        queryExact.value = "";
        queryExact.focus();
      }
    }
  });
});

// Chips de plantilla IA (pre-llenan el textarea)
document.querySelectorAll(".chip-fill").forEach(chip => {
  chip.addEventListener("click", () => {
    const fill = (chip as HTMLElement).dataset.fill || "";
    if (querySemantic) {
      querySemantic.value = fill;
      querySemantic.focus();
      // Posicionar cursor en el primer "_" para que el usuario lo reemplace
      const pos = fill.indexOf("_");
      if (pos !== -1) {
        querySemantic.setSelectionRange(pos, pos + 1);
      }
    }
  });
});

async function realizarBusquedaExacta(q: string, append = false) {
  if (!q) return;
  if (!append) {
    offset = 0;
    currentSearchResults = [];
    mostrarLoader(true);
    if (scrollSentinel) scrollSentinel.classList.add("hidden");
  } else {
    isLoadingMore = true;
  }
  currentQuery = q;
  try {
    const resp = await fetch(`/api/buscar?q=${encodeURIComponent(q)}&tipo=todos&limit=${limit}&offset=${offset}`);
    if (resp.ok) {
      const data = await resp.json();
      const resultados = data.results || [];
      hasMore = data.hasMore || false;
      
      if (append) {
        currentSearchResults.push(...resultados);
      } else {
        currentSearchResults = resultados;
      }

      if (filterStateBar) filterStateBar.classList.remove("hidden");
      if (!append) {
        currentSubTab = "todos";
        actualizarFiltroUI();
      }
      aplicarFiltrosYRenderizar();

      if (hasMore && scrollSentinel) {
        scrollSentinel.classList.remove("hidden");
        scrollSentinel.classList.add("flex");
      } else if (scrollSentinel) {
        scrollSentinel.classList.add("hidden");
        scrollSentinel.classList.remove("flex");
      }
    } else { throw new Error("Error en respuesta"); }
  } catch (err) {
    console.error(err);
    if (!append) {
      mostrarMensajeHeader("❌ Error de conexión al buscar.", true);
    }
  } finally { 
    mostrarLoader(false); 
    isLoadingMore = false;
  }
}

// Observer para scroll infinito
if (scrollSentinel) {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
      offset += limit;
      realizarBusquedaExacta(currentQuery, true);
    }
  }, { rootMargin: "150px" });
  observer.observe(scrollSentinel);
}

// ═══ BÚSQUEDA EXACTA ═══
if (formSearchExact) {
  formSearchExact.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = queryExact.value.trim();
    realizarBusquedaExacta(q);
  });
}

// ═══ BÚSQUEDA SEMÁNTICA ═══
if (formSearchSemantic && btnSubmitSemantic) {
  formSearchSemantic.addEventListener("submit", async (e) => {
    e.preventDefault();
    const desc = querySemantic.value.trim();
    if (desc.length < 5) return;
    if (!navigator.onLine) {
      mostrarMensajeHeader("❌ Búsqueda semántica requiere conexión.", true);
      return;
    }
    mostrarLoader(true);
    btnSubmitSemantic.classList.add("opacity-50");
    try {
      const resp = await fetch("/api/buscar-similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descripcion: desc })
      });
      if (resp.ok) {
        const resultados = await resp.json();
        currentSearchResults = resultados.map((r: any) => ({ ...r, _source: "reporte" }));
        if (filterStateBar) filterStateBar.classList.remove("hidden");
        currentSubTab = "todos";
        actualizarFiltroUI();
        aplicarFiltrosYRenderizar();
      } else { throw new Error("Error en búsqueda"); }
    } catch (err) {
      console.error(err);
      mostrarMensajeHeader("❌ Error al procesar búsqueda.", true);
    } finally {
      mostrarLoader(false);
      btnSubmitSemantic.classList.remove("opacity-50");
    }
  });
}

// ═══ UTILIDADES ═══
function mostrarLoader(show: boolean) {
  if (loader) { show ? loader.classList.remove("hidden") : loader.classList.add("hidden"); }
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

// ═══ FILTRAR Y RENDERIZAR UNIFICADO ═══
function aplicarFiltrosYRenderizar() {
  if (!resultsContainer) return;
  resultsContainer.innerHTML = "";
  
  const filtrados = currentSearchResults.filter(item => {
    if (currentSubTab === "todos") return true;
    
    const esPersona = item._source === "persona";
    
    if (currentSubTab === "sin_contacto") {
      if (esPersona) {
        return item.estado === "desconocido";
      } else {
        return item.tipo === "desaparecido" && item.estado_reporte === "abierto";
      }
    }
    
    if (currentSubTab === "localizados") {
      if (esPersona) {
        return item.estado === "vivo" || item.estado === "herido";
      } else {
        return item.estado_reporte === "resuelto";
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
    ? `<button class="btn-localizar-persona btn btn-sm bg-canvas border border-canvas-soft text-ink hover:bg-canvas-soft font-uber-text uber-body-sm-strong mt-2 self-start rounded-full transition-transform active:scale-[0.98] cursor-pointer">
         Marcar a salvo
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
      ${notesHtml}
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
    actionsHtml += `<button id="modal-btn-marcar-vivo" class="btn bg-primary text-white flex-1 min-w-[120px] font-uber-text uber-body-md-strong rounded-full hover:bg-black-elevated transition-colors cursor-pointer">Marcar a salvo</button>`;
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

// Close handlers
modalClose?.addEventListener("click", cerrarModal);
modalDetalle?.addEventListener("click", (e) => {
  if (e.target === modalDetalle) cerrarModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cerrarModal();
});

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
            accion: "reportar_a_salvo",
            estado: "vivo",
            contacto: reportante_contacto,
            refugio: null,
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
            accion: "reportar_a_salvo",
            estado_reporte: "resuelto",
            contacto: reportante_contacto,
            refugio: null,
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
            ubicacion_nombre: null,
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
    return { badge: "border border-yellow-500/30 text-ink bg-canvas", dot: "bg-yellow-500", text: "A salvo (Sin confirmar)" };
  }
  const configs: Record<string, { badge: string, dot: string, text: string }> = {
    vivo: { badge: "border border-green-500/30 text-ink bg-canvas", dot: "bg-green-500", text: "A salvo" },
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
  try {
    const d = new Date(fechaStr + " UTC");
    return d.toLocaleString("es-ES", { timeZone: "America/Caracas" });
  } catch { return fechaStr; }
}

// Cargar búsqueda o anuncio desde URL si existe
const urlParams = new URLSearchParams(window.location.search);
const qParam = urlParams.get("q");
const personaParam = urlParams.get("persona");
const reporteParam = urlParams.get("reporte");

if (qParam && queryExact) {
  queryExact.value = qParam;
  realizarBusquedaExacta(qParam);
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
