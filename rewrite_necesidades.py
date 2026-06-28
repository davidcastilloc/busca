import re

with open('src/pages/necesidades/index.astro', 'r') as f:
    content = f.read()

# 1. Replace backend data fetching
backend_old = """let refugiosData: any[] = [];

try {
  const { DB } = env;
  if (DB) {
    const res = await DB.prepare("SELECT * FROM refugios ORDER BY nombre ASC").all();
    refugiosData = res.results || [];
  }
} catch (error) {
  console.error("Error al cargar refugios:", error);
}

// Pre-calcular semáforo para cada refugio
const refugiosConSemaforo = refugiosData.map((r: any) => {
  let itemsCriticos: string[] = [];
  let itemsAlerta: string[] = [];
  if (r.inventario) {
    try {
      const inv = typeof r.inventario === 'string' ? JSON.parse(r.inventario) : r.inventario;
      for (const [itemId, estado] of Object.entries(inv)) {
        const itemObj = CATEGORIAS_INVENTARIO.flatMap(c => c.items).find(i => i.id === itemId);
        if (itemObj) {
          if (estado === "Crítico") itemsCriticos.push(itemObj.nombre);
          else if (estado === "Alerta") itemsAlerta.push(itemObj.nombre);
        }
      }
    } catch {}
  }
  const semaforo = itemsCriticos.length > 0 ? "rojo" : itemsAlerta.length > 0 ? "amarillo" : "verde";
  const ocupacion = r.ocupacion_actual || 0;
  const capacidad = r.capacidad_maxima || 100;
  return { ...r, semaforo, itemsCriticos, itemsAlerta, ocupacion, capacidad };
});"""

backend_new = """let necesidadesData: any[] = [];

try {
  const { DB } = env;
  if (DB) {
    const res = await DB.prepare(`
      SELECT n.*, 
             COALESCE(n.latitud, ref.latitud) as latitud_final,
             COALESCE(n.longitud, ref.longitud) as longitud_final,
             ref.nombre as refugio_nombre
      FROM necesidades n
      LEFT JOIN refugios ref ON n.refugio_id = ref.id
      ORDER BY n.id DESC
    `).all();
    necesidadesData = res.results || [];
  }
} catch (error) {
  console.error("Error al cargar necesidades:", error);
}"""

content = content.replace(backend_old, backend_new)

# Title & header
content = content.replace('title="Mapa de Refugios', 'title="Mapa de Necesidades')
content = content.replace('Encuentra refugios, centros de acopio y hospitales', 'Visualiza y gestiona las necesidades reportadas')
content = content.replace('<a href="/refugios"', '<a href="/"')
content = content.replace('placeholder="Buscar refugio, dirección, encargado..."', 'placeholder="Buscar necesidad, categoría, ubicación..."')

# Filters
filters_old = """<button class="filter-pill active" data-filter="todos">Todos</button>
      <button class="filter-pill" data-filter="refugio">🏠 Refugios</button>
      <button class="filter-pill" data-filter="centro_acopio">📦 Acopio</button>
      <button class="filter-pill" data-filter="hospital">🏥 Salud</button>
      <span class="w-px h-5 bg-canvas-soft shrink-0"></span>
      <button class="filter-pill" data-filter="semaforo-rojo">🔴 Crítico</button>
      <button class="filter-pill" data-filter="semaforo-amarillo">🟡 Alerta</button>
      <button class="filter-pill" data-filter="semaforo-verde">🟢 OK</button>"""
      
filters_new = """<button class="filter-pill active" data-filter="todos">Todas</button>
      <button class="filter-pill" data-filter="gravedad-alta">🔴 Alta</button>
      <button class="filter-pill" data-filter="gravedad-media">🟡 Media</button>
      <button class="filter-pill" data-filter="gravedad-baja">🟢 Baja</button>
      <span class="w-px h-5 bg-canvas-soft shrink-0"></span>
      <button class="filter-pill" data-filter="estado-abierta">⚠️ Abierta</button>
      <button class="filter-pill" data-filter="estado-atendida">✅ Atendida</button>"""

content = content.replace(filters_old, filters_new)

# Sheet Title
content = content.replace('{refugiosConSemaforo.length} centros registrados', '{necesidadesData.length} necesidades')
content = content.replace('Cerca', 'Cerca')

# Card Generation
cards_old = """{refugiosConSemaforo.map((r: any) => {
        const emoji = r.tipo === "hospital" ? "🏥" : r.tipo === "centro_acopio" ? "📦" : "🏠";
        const semaforoBadge = r.semaforo === "rojo" ? "🔴" : r.semaforo === "amarillo" ? "🟡" : "🟢";
        const pct = Math.min(Math.round((r.ocupacion / r.capacidad) * 100), 100);

        let fotosArray: string[] = [];
        if (r.fotos) {
          try {
            fotosArray = typeof r.fotos === 'string' ? JSON.parse(r.fotos) : r.fotos;
          } catch {}
        }

        return (
          <div
            class="sheet-card flex items-start gap-3 p-3 rounded-xl bg-canvas-soft/50 border border-canvas-soft hover:bg-surface-pressed/50 cursor-pointer transition-all active:scale-[0.98]"
            data-id={r.id}
            data-lat={r.latitud || ""}
            data-lng={r.longitud || ""}
            data-nombre={r.nombre}
            data-direccion={r.direccion || ""}
            data-tipo={r.tipo || "refugio"}
            data-semaforo={r.semaforo}
            data-contacto={r.contacto || ""}
            data-ocupacion={r.ocupacion}
            data-capacidad={r.capacidad}
            data-encargado={r.encargado || ""}
            data-necesidades={r.necesidades || ""}
            data-fotos={typeof r.fotos === 'string' ? r.fotos : JSON.stringify(r.fotos || [])}
          >
            <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-canvas shrink-0 overflow-hidden border border-canvas-soft">
              {fotosArray.length > 0 ? (
                <img src={`/api/upload?key=${fotosArray[0]}`} class="w-full h-full object-cover" />
              ) : (
                <span class="text-lg">{emoji}</span>
              )}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-xs">{semaforoBadge}</span>
                <h3 class="font-uber-text font-bold text-ink text-sm truncate">{r.nombre}</h3>
              </div>
              <p class="text-[11px] text-mute font-uber-text truncate">{r.direccion || "Sin dirección"}</p>
              <div class="flex items-center gap-3 mt-1">
                <span class="text-[10px] text-body font-uber-text">👥 {r.ocupacion}/{r.capacidad}</span>
                <div class="flex-1 h-1 bg-canvas rounded-full overflow-hidden">
                  <div class={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-green-500'}`} style={`width:${pct}%`}></div>
                </div>
                <span class="text-[10px] text-mute font-uber-text distance-label"></span>
              </div>
            </div>
            <div class="flex flex-col gap-1 shrink-0">
              {r.contacto && (
                <a href={`tel:${r.contacto.replace(/\s/g, '')}`} class="flex items-center justify-center w-8 h-8 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors text-sm" title="Llamar" onclick="event.stopPropagation()">📞</a>
              )}
              <button class="btn-share flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-sm" title="Compartir" data-id={r.id} data-nombre={r.nombre} data-direccion={r.direccion || ""} data-contacto={r.contacto || ""} data-lat={r.latitud || ""} data-lng={r.longitud || ""} data-ocupacion={r.ocupacion} data-capacidad={r.capacidad} data-semaforo={r.semaforo} onclick="event.stopPropagation()">📤</button>
            </div>
          </div>
        );
      })}"""

cards_new = """{necesidadesData.map((n: any) => {
        const cat = n.categoria || "Otros";
        let emoji = "🆘";
        if (cat.toLowerCase().includes("agua")) emoji = "💧";
        else if (cat.toLowerCase().includes("comida") || cat.toLowerCase().includes("alimento")) emoji = "🥫";
        else if (cat.toLowerCase().includes("medicina") || cat.toLowerCase().includes("salud")) emoji = "💊";
        else if (cat.toLowerCase().includes("ropa")) emoji = "👕";
        else if (cat.toLowerCase().includes("refugio")) emoji = "⛺";
        else if (cat.toLowerCase().includes("rescate")) emoji = "🚁";

        const gravedadBadge = n.gravedad === "Alta" ? "🔴" : n.gravedad === "Media" ? "🟡" : "🟢";
        const ubicacionTexto = n.refugio_nombre ? `Refugio: ${n.refugio_nombre}` : n.ubicacion_nombre || "Ubicación desconocida";

        return (
          <div
            class="sheet-card flex items-start gap-3 p-3 rounded-xl bg-canvas-soft/50 border border-canvas-soft hover:bg-surface-pressed/50 cursor-pointer transition-all active:scale-[0.98]"
            data-id={n.id}
            data-lat={n.latitud_final || ""}
            data-lng={n.longitud_final || ""}
            data-categoria={n.categoria}
            data-descripcion={n.descripcion}
            data-gravedad={n.gravedad}
            data-estado={n.estado}
            data-ubicacion={ubicacionTexto}
            data-contacto={n.telefono || n.reportante_contacto || ""}
            data-afectados={n.afectados || 0}
            data-emoji={emoji}
            data-foto={n.foto_key || ""}
          >
            <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-canvas shrink-0 overflow-hidden border border-canvas-soft">
              {n.foto_key ? (
                <img src={`/api/upload?key=${n.foto_key}`} class="w-full h-full object-cover" />
              ) : (
                <span class="text-lg">{emoji}</span>
              )}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-xs">{gravedadBadge}</span>
                <h3 class="font-uber-text font-bold text-ink text-sm truncate">{n.categoria}</h3>
              </div>
              <p class="text-[11px] text-mute font-uber-text truncate">{ubicacionTexto}</p>
              <p class="text-[11px] text-body font-uber-text line-clamp-1 mt-0.5">{n.descripcion}</p>
              <div class="flex items-center gap-3 mt-1">
                {n.afectados > 0 && <span class="text-[10px] text-body font-uber-text font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">👥 ${n.afectados} afectados</span>}
                <span class="text-[10px] text-mute font-uber-text distance-label"></span>
              </div>
            </div>
            <div class="flex flex-col gap-1 shrink-0">
              {(n.telefono || n.reportante_contacto) && (
                <a href={`tel:${(n.telefono || n.reportante_contacto).replace(/\s/g, '')}`} class="flex items-center justify-center w-8 h-8 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors text-sm" title="Llamar" onclick="event.stopPropagation()">📞</a>
              )}
              <button class="btn-share-need flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-sm" title="Compartir" data-id={n.id} data-cat={n.categoria} data-ubicacion={ubicacionTexto} onclick="event.stopPropagation()">📤</button>
            </div>
          </div>
        );
      })}"""
      
content = content.replace(cards_old, cards_new)


# Now JS Side
# 1. Parsing DOM elements to global list `refugios` -> `necesidadesList`
content = content.replace('let refugios: any[] = [];', 'let necesidadesList: any[] = [];')
content = content.replace('refugios = [];', 'necesidadesList = [];')

dom_parse_old = """refugios.push({
          id: card.dataset.id || "",
          lat, lng,
          nombre: card.dataset.nombre || "",
          direccion: card.dataset.direccion || "",
          tipo: card.dataset.tipo || "refugio",
          semaforo: card.dataset.semaforo || "verde",
          contacto: card.dataset.contacto || "",
          ocupacion: parseInt(card.dataset.ocupacion || "0"),
          capacidad: parseInt(card.dataset.capacidad || "100"),
          encargado: card.dataset.encargado || "",
          necesidades: card.dataset.necesidades || "",
          fotos
        });"""
        
dom_parse_new = """necesidadesList.push({
          id: card.dataset.id || "",
          lat, lng,
          categoria: card.dataset.categoria || "",
          descripcion: card.dataset.descripcion || "",
          gravedad: card.dataset.gravedad || "Baja",
          estado: card.dataset.estado || "abierta",
          ubicacion: card.dataset.ubicacion || "",
          contacto: card.dataset.contacto || "",
          afectados: parseInt(card.dataset.afectados || "0"),
          emoji: card.dataset.emoji || "🆘",
          foto: card.dataset.foto || ""
        });"""
        
content = content.replace(dom_parse_old, dom_parse_new)

# 2. Filtering state
content = content.replace('let activeFilters = { tipo: "todos", semaforo: "todos" };', 'let activeFilters = { gravedad: "todos", estado: "todos" };')

# 3. Cluster icon function
cluster_old = """let hasRojo = false, hasAmarillo = false;
          children.forEach((m: any) => {
            if (m.options._semaforo === "rojo") hasRojo = true;
            if (m.options._semaforo === "amarillo") hasAmarillo = true;
          });
          const clusterClass = hasRojo ? "cluster-rojo" : hasAmarillo ? "cluster-amarillo" : "cluster-verde";"""
cluster_new = """let hasAlta = false, hasMedia = false;
          children.forEach((m: any) => {
            if (m.options._gravedad === "Alta") hasAlta = true;
            if (m.options._gravedad === "Media") hasMedia = true;
          });
          const clusterClass = hasAlta ? "cluster-rojo" : hasMedia ? "cluster-amarillo" : "cluster-verde";"""
content = content.replace(cluster_old, cluster_new)

# 4. Markers creation loop
marker_loop_old = """refugios.forEach(r => {
        const emoji = r.tipo === "hospital" ? "🏥" : r.tipo === "centro_acopio" ? "📦" : "🏠";
        const markerClass = r.tipo === "hospital" ? "marker-hospital" : r.tipo === "centro_acopio" ? "marker-acopio" : "marker-refugio";

        let badgeHtml = "";
        if (r.semaforo === "rojo") {
          badgeHtml = `<div class="custom-marker-pulse"></div>`;
        } else if (r.semaforo === "amarillo") {
          badgeHtml = `<div class="custom-marker-badge badge-amarillo"></div>`;
        } else {
          badgeHtml = `<div class="custom-marker-badge badge-verde"></div>`;
        }

        const icon = L.divIcon({
          html: `<div class="custom-marker ${markerClass}" data-id="${r.id}">${emoji}${badgeHtml}</div>`,
          className: "",
          iconSize: [36, 36],
          iconAnchor: [18, 36],
          popupAnchor: [0, -38],
        });

        const pct = Math.min(Math.round((r.ocupacion / r.capacidad) * 100), 100);
        const barColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#22c55e";
        const semaforoLabel = r.semaforo === "rojo" ? "🔴 Crítico" : r.semaforo === "amarillo" ? "🟡 Alerta" : "🟢 Abastecido";
        const semaforoColor = r.semaforo === "rojo" ? "color:#dc2626" : r.semaforo === "amarillo" ? "color:#d97706" : "color:#16a34a";

        const popupHtml = `
          <div style="padding:12px 14px;max-width:260px;font-family:var(--font-uber-text,'Inter',sans-serif);">
            ${r.fotos && r.fotos.length > 0 ? `
              <div style="width:100%;height:100px;border-radius:10px;overflow:hidden;border:1px solid var(--canvas-soft);background:var(--surface-pressed);margin-bottom:8px;">
                <img src="/api/upload?key=${r.fotos[0]}" style="width:100%;height:100%;object-fit:cover;" />
              </div>
            ` : ''}
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <span style="font-size:18px;">${emoji}</span>
              <h4 style="font-weight:700;font-size:14px;color:var(--ink);text-transform:capitalize;margin:0;">${r.nombre}</h4>
            </div>
            <div style="font-size:11px;${semaforoColor};font-weight:600;margin-bottom:6px;">${semaforoLabel}</div>
            <div style="font-size:11px;color:var(--body);margin-bottom:4px;">📍 ${r.direccion || "Sin dirección"}</div>
            <div style="margin:6px 0;background:var(--canvas-soft);padding:8px;border-radius:8px;">
              <div style="font-size:11px;color:var(--body);margin-bottom:4px;">👥 Ocupación: <strong>${r.ocupacion} / ${r.capacidad}</strong></div>
              <div style="height:4px;background:#e5e5e5;border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;"></div>
              </div>
            </div>
            ${r.contacto ? `<div style="font-size:11px;margin-bottom:8px;">📞 <a href="tel:${r.contacto.replace(/\s/g, '')}" style="color:#2563eb;font-weight:600;">${r.contacto}</a></div>` : ""}
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button onclick="window._rutaA('${r.id}')" style="flex:1;padding:6px 10px;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;font-size:11px;font-weight:700;border:none;cursor:pointer;">🚗 Ir</button>
              <button onclick="window._compartir('${r.id}')" style="flex:1;padding:6px 10px;border-radius:8px;background:var(--canvas-soft);color:var(--ink);font-size:11px;font-weight:700;border:1px solid var(--canvas-soft);cursor:pointer;">📤 Compartir</button>
              ${r.contacto ? `<a href="tel:${r.contacto.replace(/\s/g, '')}" style="padding:6px 10px;border-radius:8px;background:#dcfce7;color:#16a34a;font-size:11px;font-weight:700;text-decoration:none;">📞</a>` : ""}
            </div>
          </div>
        `;

        const marker = L.marker([r.lat, r.lng], {
          icon,
          _tipo: r.tipo,
          _semaforo: r.semaforo,
          _id: r.id,
        }).bindPopup(popupHtml, { maxWidth: 280, closeButton: true });

        marker.on("click", () => {
          highlightCard(r.id);
        });

        markers.set(r.id, marker);
        clusterGroup.addLayer(marker);
      });"""

marker_loop_new = """necesidadesList.forEach(n => {
        const markerClass = n.gravedad === "Alta" ? "marker-hospital" : n.gravedad === "Media" ? "marker-acopio" : "marker-refugio";

        let badgeHtml = "";
        if (n.gravedad === "Alta") {
          badgeHtml = `<div class="custom-marker-pulse"></div>`;
        } else if (n.gravedad === "Media") {
          badgeHtml = `<div class="custom-marker-badge badge-amarillo"></div>`;
        } else {
          badgeHtml = `<div class="custom-marker-badge badge-verde"></div>`;
        }

        const icon = L.divIcon({
          html: `<div class="custom-marker ${markerClass}" data-id="${n.id}">${n.emoji}${badgeHtml}</div>`,
          className: "",
          iconSize: [36, 36],
          iconAnchor: [18, 36],
          popupAnchor: [0, -38],
        });

        const semaforoLabel = n.gravedad === "Alta" ? "🔴 Alta Gravedad" : n.gravedad === "Media" ? "🟡 Media" : "🟢 Baja";
        const semaforoColor = n.gravedad === "Alta" ? "color:#dc2626" : n.gravedad === "Media" ? "color:#d97706" : "color:#16a34a";
        const estadoBadge = n.estado === "atendida" ? `<span style="background:#dcfce7;color:#16a34a;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;text-transform:uppercase;">Atendida</span>` : `<span style="background:#fef3c7;color:#d97706;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;text-transform:uppercase;">Abierta</span>`;

        const popupHtml = `
          <div style="padding:12px 14px;max-width:260px;font-family:var(--font-uber-text,'Inter',sans-serif);">
            ${n.foto ? `
              <div style="width:100%;height:100px;border-radius:10px;overflow:hidden;border:1px solid var(--canvas-soft);background:var(--surface-pressed);margin-bottom:8px;">
                <img src="/api/upload?key=${n.foto}" style="width:100%;height:100%;object-fit:cover;" />
              </div>
            ` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:18px;">${n.emoji}</span>
                <h4 style="font-weight:700;font-size:14px;color:var(--ink);text-transform:capitalize;margin:0;">${n.categoria}</h4>
              </div>
              ${estadoBadge}
            </div>
            <div style="font-size:11px;${semaforoColor};font-weight:600;margin-bottom:6px;">${semaforoLabel}</div>
            <div style="font-size:11px;color:var(--body);margin-bottom:6px;">📍 ${n.ubicacion || "Sin ubicación"}</div>
            <div style="margin:6px 0;background:var(--canvas-soft);padding:8px;border-radius:8px;font-size:12px;color:var(--ink);">
              ${n.descripcion}
            </div>
            ${n.afectados > 0 ? `<div style="font-size:11px;color:var(--body);margin-bottom:6px;font-weight:600;">👥 ${n.afectados} afectados</div>` : ""}
            ${n.contacto ? `<div style="font-size:11px;margin-bottom:8px;">📞 <a href="tel:${n.contacto.replace(/\s/g, '')}" style="color:#2563eb;font-weight:600;">${n.contacto}</a></div>` : ""}
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button onclick="window._rutaA('${n.id}')" style="flex:1;padding:6px 10px;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;font-size:11px;font-weight:700;border:none;cursor:pointer;">🚗 Ir</button>
              <button onclick="window._compartir('${n.id}')" style="flex:1;padding:6px 10px;border-radius:8px;background:var(--canvas-soft);color:var(--ink);font-size:11px;font-weight:700;border:1px solid var(--canvas-soft);cursor:pointer;">📤 Compartir</button>
              ${n.contacto ? `<a href="tel:${n.contacto.replace(/\s/g, '')}" style="padding:6px 10px;border-radius:8px;background:#dcfce7;color:#16a34a;font-size:11px;font-weight:700;text-decoration:none;">📞</a>` : ""}
            </div>
          </div>
        `;

        const marker = L.marker([n.lat, n.lng], {
          icon,
          _gravedad: n.gravedad,
          _estado: n.estado,
          _id: n.id,
        }).bindPopup(popupHtml, { maxWidth: 280, closeButton: true });

        marker.on("click", () => {
          highlightCard(n.id);
        });

        markers.set(n.id, marker);
        clusterGroup.addLayer(marker);
      });"""

content = content.replace(marker_loop_old, marker_loop_new)

# 5. FlyTo center logic
flyto_old = """if (refugios.length > 0) {
        let sumLat = 0, sumLng = 0, totalW = 0;
        refugios.forEach((r: any) => {
          let w = r.semaforo === "rojo" ? 3 : r.semaforo === "amarillo" ? 2 : 1;
          sumLat += r.lat * w;
          sumLng += r.lng * w;
          totalW += w;
        });"""
        
flyto_new = """if (necesidadesList.length > 0) {
        let sumLat = 0, sumLng = 0, totalW = 0;
        necesidadesList.forEach((n: any) => {
          let w = n.gravedad === "Alta" ? 3 : n.gravedad === "Media" ? 2 : 1;
          sumLat += n.lat * w;
          sumLng += n.lng * w;
          totalW += w;
        });"""
content = content.replace(flyto_old, flyto_new)

# 6. Search
search_old = """const matches = refugios.filter(r =>
          r.nombre.toLowerCase().includes(q) ||
          r.direccion.toLowerCase().includes(q) ||
          r.encargado.toLowerCase().includes(q) ||
          r.necesidades.toLowerCase().includes(q)
        ).slice(0, 5);"""
search_new = """const matches = necesidadesList.filter(n =>
          n.categoria.toLowerCase().includes(q) ||
          n.descripcion.toLowerCase().includes(q) ||
          n.ubicacion.toLowerCase().includes(q)
        ).slice(0, 5);"""
content = content.replace(search_old, search_new)

search_map_old = """searchResults!.innerHTML = matches.map(r => {
          const emoji = r.tipo === "hospital" ? "🏥" : r.tipo === "centro_acopio" ? "📦" : "🏠";
          const sem = r.semaforo === "rojo" ? "🔴" : r.semaforo === "amarillo" ? "🟡" : "🟢";
          return `
            <button class="search-result w-full text-left flex items-center gap-2.5 px-3 py-2.5 hover:bg-canvas-soft transition-colors border-b border-canvas-soft last:border-0" data-id="${r.id}" data-lat="${r.lat}" data-lng="${r.lng}">
              <span class="text-base">${emoji}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-uber-text font-bold text-ink truncate">${sem} ${r.nombre}</div>
                <div class="text-[10px] text-mute font-uber-text truncate">${r.direccion || "Sin dirección"}</div>
              </div>
            </button>
          `;
        }).join("");"""
search_map_new = """searchResults!.innerHTML = matches.map(n => {
          const sem = n.gravedad === "Alta" ? "🔴" : n.gravedad === "Media" ? "🟡" : "🟢";
          return `
            <button class="search-result w-full text-left flex items-center gap-2.5 px-3 py-2.5 hover:bg-canvas-soft transition-colors border-b border-canvas-soft last:border-0" data-id="${n.id}" data-lat="${n.lat}" data-lng="${n.lng}">
              <span class="text-base">${n.emoji}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-uber-text font-bold text-ink truncate">${sem} ${n.categoria}</div>
                <div class="text-[10px] text-mute font-uber-text truncate">${n.ubicacion || "Sin ubicación"}</div>
              </div>
            </button>
          `;
        }).join("");"""
content = content.replace(search_map_old, search_map_new)

# 7. Filters events logic
filters_logic_old = """const filter = (pill as HTMLElement).dataset.filter || "todos";

        if (filter.startsWith("semaforo-")) {
          const sem = filter.replace("semaforo-", "");
          if (activeFilters.semaforo === sem) {
            activeFilters.semaforo = "todos";
            pill.classList.remove("active");
          } else {
            document.querySelectorAll('.filter-pill[data-filter^="semaforo-"]').forEach(p => p.classList.remove("active"));
            activeFilters.semaforo = sem;
            pill.classList.add("active");
          }
        } else {
          document.querySelectorAll('.filter-pill:not([data-filter^="semaforo-"])').forEach(p => p.classList.remove("active"));
          activeFilters.tipo = filter;
          pill.classList.add("active");
        }"""
filters_logic_new = """const filter = (pill as HTMLElement).dataset.filter || "todos";

        if (filter.startsWith("gravedad-")) {
          const grav = filter.replace("gravedad-", "");
          const mapGrav = grav === "alta" ? "Alta" : grav === "media" ? "Media" : "Baja";
          if (activeFilters.gravedad === mapGrav) {
            activeFilters.gravedad = "todos";
            pill.classList.remove("active");
          } else {
            document.querySelectorAll('.filter-pill[data-filter^="gravedad-"]').forEach(p => p.classList.remove("active"));
            activeFilters.gravedad = mapGrav;
            pill.classList.add("active");
          }
        } else if (filter.startsWith("estado-")) {
          const est = filter.replace("estado-", "");
          if (activeFilters.estado === est) {
            activeFilters.estado = "todos";
            pill.classList.remove("active");
          } else {
            document.querySelectorAll('.filter-pill[data-filter^="estado-"]').forEach(p => p.classList.remove("active"));
            activeFilters.estado = est;
            pill.classList.add("active");
          }
        } else {
          // todos
          document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove("active"));
          activeFilters.gravedad = "todos";
          activeFilters.estado = "todos";
          pill.classList.add("active");
        }"""
content = content.replace(filters_logic_old, filters_logic_new)

# 8. applyFilters function
apply_filters_old = """function applyFilters() {
      if (!clusterGroup || !map) return;
      clusterGroup.clearLayers();

      markers.forEach((marker, id) => {
        const r = refugios.find(x => x.id === id);
        if (!r) return;

        let passTipo = activeFilters.tipo === "todos" || r.tipo === activeFilters.tipo;
        let passSemaforo = activeFilters.semaforo === "todos" || r.semaforo === activeFilters.semaforo;

        if (passTipo && passSemaforo) {
          clusterGroup.addLayer(marker);
          document.querySelector(`.sheet-card[data-id="${id}"]`)?.classList.remove("hidden");
        } else {
          document.querySelector(`.sheet-card[data-id="${id}"]`)?.classList.add("hidden");
        }
      });
      
      const visible = document.querySelectorAll(".sheet-card:not(.hidden)").length;
      const title = document.getElementById("sheet-title");
      if (title) title.textContent = `${visible} centros registrados`;
    }"""
apply_filters_new = """function applyFilters() {
      if (!clusterGroup || !map) return;
      clusterGroup.clearLayers();

      markers.forEach((marker, id) => {
        const n = necesidadesList.find(x => x.id === id);
        if (!n) return;

        let passGravedad = activeFilters.gravedad === "todos" || n.gravedad === activeFilters.gravedad;
        let passEstado = activeFilters.estado === "todos" || n.estado === activeFilters.estado;

        if (passGravedad && passEstado) {
          clusterGroup.addLayer(marker);
          document.querySelector(`.sheet-card[data-id="${id}"]`)?.classList.remove("hidden");
        } else {
          document.querySelector(`.sheet-card[data-id="${id}"]`)?.classList.add("hidden");
        }
      });
      
      const visible = document.querySelectorAll(".sheet-card:not(.hidden)").length;
      const title = document.getElementById("sheet-title");
      if (title) title.textContent = `${visible} necesidades`;
    }"""
content = content.replace(apply_filters_old, apply_filters_new)

# 9. Refugios global reference cleanup
content = content.replace('refugios.find(r =>', 'necesidadesList.find(n =>')
content = content.replace('refugios.find((r: any) =>', 'necesidadesList.find((n: any) =>')

with open('src/pages/necesidades/index.astro', 'w') as f:
    f.write(content)

