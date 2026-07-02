import Alpine from "alpinejs";

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
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function registerBuscadorAlpine() {
  if (typeof window !== "undefined" && window.Alpine) {
    if (!window.Alpine.data("buscadorComponent")) {
      window.Alpine.data("buscadorComponent", buscadorComponent);
    }
  }
}

// Registro automático al importar
registerBuscadorAlpine();

if (typeof document !== "undefined") {
  document.addEventListener("alpine:init", registerBuscadorAlpine);
  document.addEventListener("astro:page-load", registerBuscadorAlpine);
}

function buscadorComponent() {
  return {
    // Variables de Estado
    query: "",
    fotoBase64: "",
    isSearching: false,
    isLoadingMore: false,
    hasMore: false,
    offset: 0,
    limit: 20,
    searchResults: [] as any[],
    
    // Stats en vivo
    statsTotal: "—",
    statsActivos: "—",
    statsLocalizados: "—",
    
    // Historial
    historial: [] as string[],
    
    // Filtros
    subTab: "todos", // todos, sin_contacto, localizados
    showAdvanced: false,
    filterSexo: "",
    filterEdad: "",
    
    // Modal de Detalle
    modalDetalleOpen: false,
    modalDetailData: null as any,
    modalDetailTipo: "",
    
    // Modal de Reporte Rápido
    modalReporteOpen: false,
    refugios: [] as any[],
    refugioSelectVal: "",
    refugioOtroVal: "",
    reporteDesc: "",
    reporteNombre: "",
    reporteContacto: "",
    reporteConfirm: false,
    reporteFotoKey: "",
    reporteFotoStatus: "",
    reporteGpsStatus: "Iniciando búsqueda...",
    reporteLat: null as number | null,
    reporteLon: null as number | null,
    reporteErrorMsg: "",
    reporteEnviando: false,
    
    // Modal de Compartir
    modalCompartirOpen: false,
    shareTexto: "",
    shareUrl: "",
    
    // Mapas
    reporteRapidoMap: null as any,
    reporteRapidoMarker: null as any,

    init() {
      this.cargarStats();
      this.cargarHistorial();
      
      // Escuchar evento externo (ej. desde el mapa interactivo)
      window.addEventListener("abrir-detalle-caso", async (e: any) => {
        const { id, tipo } = e.detail;
        this.abrirDetalle(id, tipo);
      });
      
      // Sentinel de scroll infinito
      const sentinel = document.getElementById("scroll-sentinel");
      if (sentinel) {
        const observer = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting && this.hasMore && !this.isLoadingMore && !this.isSearching) {
            this.cargarMasResultados();
          }
        }, { rootMargin: "150px" });
        observer.observe(sentinel);
      }
      
      // Cargar búsqueda o caso desde URL
      const urlParams = new URLSearchParams(window.location.search);
      const qParam = urlParams.get("q");
      const personaParam = urlParams.get("persona");
      const reporteParam = urlParams.get("reporte");
      
      if (qParam) {
        this.query = qParam;
        this.realizarBusqueda();
      } else if (personaParam) {
        this.abrirDetalle(personaParam, "persona");
      } else if (reporteParam) {
        this.abrirDetalle(reporteParam, "reporte");
      }
    },
    
    async cargarStats() {
      try {
        const resp = await fetch("/api/stats");
        if (resp.ok) {
          const data = await resp.json();
          this.animarContador("statsTotal", data.total_registrados);
          this.animarContador("statsActivos", data.reportes_activos);
          this.animarContador("statsLocalizados", data.localizados);
        }
      } catch {}
    },
    
    animarContador(prop: string, target: number) {
      const duration = 800;
      const start = performance.now();
      const startVal = 0;
      const self = this as any;
      
      function tick(now: number) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(startVal + (target - startVal) * eased);
        self[prop] = current.toLocaleString("es-VE");
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    },
    
    cargarHistorial() {
      try {
        this.historial = JSON.parse(localStorage.getItem("dondeestan_historial") || "[]");
      } catch {
        this.historial = [];
      }
    },
    
    guardarEnHistorial(q: string) {
      if (!q) return;
      const hist = this.historial.filter((h: string) => h !== q);
      hist.unshift(q);
      if (hist.length > 5) hist.pop();
      this.historial = hist;
      localStorage.setItem("dondeestan_historial", JSON.stringify(this.historial));
    },
    
    clickHistorial(q: string) {
      this.query = q;
      this.realizarBusqueda();
    },
    
    async realizarBusqueda(append = false) {
      if (!this.query && !this.fotoBase64) return;
      if (this.isSearching && !append) return;
      
      this.isSearching = true;
      if (!append) {
        this.offset = 0;
        this.searchResults = [];
        this.hasMore = false;
      } else {
        this.isLoadingMore = true;
      }
      
      try {
        const body: any = { q: this.query, limit: this.limit, offset: this.offset };
        if (this.fotoBase64) body.foto_base64 = this.fotoBase64;
        
        const resp = await fetch("/api/buscar-unificado", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        
        if (!resp.ok) throw new Error();
        
        const data = await resp.json();
        const nuevos = data.results || [];
        this.hasMore = data.hasMore || false;
        
        if (append) {
          this.searchResults.push(...nuevos);
        } else {
          this.searchResults = nuevos;
          if (this.query) this.guardarEnHistorial(this.query);
        }
      } catch (err) {
        console.error(err);
      } finally {
        this.isSearching = false;
        this.isLoadingMore = false;
        this.fotoBase64 = "";
      }
    },
    
    cargarMasResultados() {
      this.offset += this.limit;
      this.realizarBusqueda(true);
    },
    
    async buscarConFoto(event: any) {
      const input = event.target;
      if (!input.files || input.files.length === 0) return;
      try {
        this.isSearching = true;
        const compressed = await comprimirImagen(input.files[0]);
        this.fotoBase64 = await blobToBase64(compressed);
        this.query = "";
        await this.realizarBusqueda();
      } catch (err) {
        console.error("Error en búsqueda por foto:", err);
      } finally {
        this.isSearching = false;
        input.value = "";
      }
    },
    
    get resultadosFiltrados() {
      return this.searchResults.filter((item: any) => {
        // Filtro subTab
        if (this.subTab !== "todos") {
          const esPersona = item._source === "persona";
          if (this.subTab === "sin_contacto") {
            if (esPersona) {
              if (item.estado !== "desconocido") return false;
            } else {
              if (!(item.tipo === "desaparecido" && item.estado_reporte === "abierto")) return false;
            }
          }
          if (this.subTab === "localizados") {
            if (esPersona) {
              if (item.estado !== "localizado" && item.estado !== "herido") return false;
            } else {
              if (item.estado_reporte !== "resuelto") return false;
            }
          }
        }
        
        // Filtro sexo
        if (this.filterSexo && item.sexo && item.sexo !== this.filterSexo) return false;
        
        // Filtro edad
        if (this.filterEdad && item.edad) {
          const edad = parseInt(item.edad);
          if (!isNaN(edad)) {
            const val = this.filterEdad;
            if (val === "0-12" && (edad < 0 || edad > 12)) return false;
            if (val === "13-17" && (edad < 13 || edad > 17)) return false;
            if (val === "18-30" && (edad < 18 || edad > 30)) return false;
            if (val === "31-50" && (edad < 31 || edad > 50)) return false;
            if (val === "51-70" && (edad < 51 || edad > 70)) return false;
            if (val === "71+" && edad < 71) return false;
          }
        }
        return true;
      });
    },
    
    async abrirDetalle(id: number | string, tipo: string) {
      try {
        const fetchUrl = tipo === "persona" ? `/api/personas/${id}` : `/api/reportes/${id}`;
        const detailResp = await fetch(fetchUrl);
        if (detailResp.ok) {
          const detailData = await detailResp.json();
          this.modalDetailData = detailData;
          this.modalDetailTipo = tipo;
          this.modalDetalleOpen = true;
          document.body.style.overflow = "hidden";
        }
      } catch (err) {
        console.error("Error al abrir detalle:", err);
      }
    },
    
    cerrarModalDetalle() {
      this.modalDetalleOpen = false;
      this.modalDetailData = null;
      this.modalDetailTipo = "";
      document.body.style.overflow = "";
    },
    
    getEstadoConfig(estado: string, verificacion = "ninguna") {
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
    },
    
    getTipoConfig(tipo: string, verificacion = "ninguna") {
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
    },
    
    formatFechaLocal(fechaStr: string) {
      if (!fechaStr) return "Reciente";
      try {
        let d = new Date(fechaStr.includes("Z") || fechaStr.includes("+") ? fechaStr : fechaStr + " UTC");
        if (isNaN(d.getTime())) {
          d = new Date(fechaStr);
        }
        if (isNaN(d.getTime())) return "Reciente";
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
    },
    
    async descargarCartel() {
      if (!this.modalDetailData) return;
      const data = this.modalDetailData;
      const tipo = this.modalDetailTipo;
      
      const btn = document.getElementById("btn-descargar-cartel");
      if (btn) {
        btn.textContent = "Generando...";
        btn.classList.add("opacity-50");
      }
      
      try {
        const cartelNombre = document.getElementById("cartel-nombre");
        const cartelDatos = document.getElementById("cartel-datos");
        const cartelDescripcion = document.getElementById("cartel-descripcion");
        const cartelUbicacion = document.getElementById("cartel-ubicacion");
        const cartelContacto = document.getElementById("cartel-contacto");
        const cartelFotoWrap = document.getElementById("cartel-foto-wrap");
        
        const esReporte = tipo === "reporte";
        const nombre = esReporte ? (data.nombre_buscado || "PERSONA DESAPARECIDA") : `${data.nombre} ${data.apellido || ""}`;
        
        if (cartelNombre) cartelNombre.textContent = nombre;
        
        if (cartelDatos) {
          const parts = [];
          const cedula = esReporte ? data.cedula_buscado : data.cedula;
          if (cedula) parts.push(`Doc: ${cedula}`);
          if (esReporte) {
            parts.push(`Reportado: ${this.formatFechaLocal(data.created_at)}`);
          } else {
            if (data.refugio) parts.push(`Refugio: ${data.refugio}`);
          }
          cartelDatos.textContent = parts.join(" | ");
        }
        
        if (cartelDescripcion) {
          cartelDescripcion.textContent = esReporte ? (data.descripcion || "") : (data.notas || "");
        }
        
        if (cartelUbicacion) {
          const ubicacion = data.ubicacion_nombre;
          cartelUbicacion.textContent = ubicacion ? `📍 Última ubicación: ${ubicacion}` : "";
        }
        
        const contactoVal = esReporte ? data.reportante_contacto : data.contacto;
        if (cartelContacto) {
          cartelContacto.textContent = contactoVal ? `CONTACTO: ${contactoVal}` : "CONTACTE AUTORIDADES";
        }
        
        const fotoKey = data.foto_key;
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
                const containerAspect = containerW / containerH;
                const imgAspect = imgW / imgH;
                
                if (cartelFoto) {
                  cartelFoto.src = blobUrl;
                  if (imgAspect > containerAspect) {
                    const newHeight = containerW / imgAspect;
                    cartelFoto.style.width = `${containerW}px`;
                    cartelFoto.style.height = `${newHeight}px`;
                    cartelFoto.style.left = "0px";
                    cartelFoto.style.top = `${(containerH - newHeight) / 2}px`;
                  } else {
                    const newWidth = containerH * imgAspect;
                    cartelFoto.style.height = `${containerH}px`;
                    cartelFoto.style.width = `${newWidth}px`;
                    cartelFoto.style.top = "0px";
                    cartelFoto.style.left = `${(containerW - newWidth) / 2}px`;
                  }
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
        
        const canvas = await html2canvas(cartelEl, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          onclone: (clonedDoc) => {
            const styles = clonedDoc.querySelectorAll("style, link[rel='stylesheet']");
            styles.forEach(s => s.remove());
          }
        });
        
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), "image/png");
        });
        
        const nombreArchivo = `SE_BUSCA_${nombre.replace(/\s+/g, "_")}.png`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombreArchivo;
        a.click();
        URL.revokeObjectURL(url);
        
        if (btn) {
          btn.textContent = "✓ Descargado";
          setTimeout(() => {
            btn.textContent = "📥 Descargar";
            btn.classList.remove("opacity-50");
          }, 2500);
        }
      } catch (err) {
        console.error("Error generando cartel:", err);
        if (btn) {
          btn.textContent = "Error";
          setTimeout(() => {
            btn.textContent = "📥 Descargar";
            btn.classList.remove("opacity-50");
          }, 2000);
        }
      }
    },
    
    compartirCaso() {
      if (!this.modalDetailData) return;
      const esReporte = this.modalDetailTipo === "reporte";
      const nombre = esReporte 
        ? (this.modalDetailData.nombre_buscado || "Persona no identificada")
        : `${this.modalDetailData.nombre} ${this.modalDetailData.apellido || ""}`;
      const shareUrl = esReporte 
        ? `${window.location.origin}/?reporte=${this.modalDetailData.id}`
        : `${window.location.origin}/?persona=${this.modalDetailData.id}`;
      const texto = `SE BUSCA: ${nombre}. Ayúdanos a localizarlo. Ver reporte completo aquí:`;
      
      if (navigator.share) {
        navigator.share({
          title: "SE BUSCA",
          text: `${texto} ${shareUrl}`,
          url: shareUrl
        }).catch(() => {
          this.mostrarModalCompartirRedes(texto, shareUrl);
        });
      } else {
        this.mostrarModalCompartirRedes(texto, shareUrl);
      }
    },
    
    mostrarModalCompartirRedes(texto: string, url: string) {
      this.shareTexto = texto;
      this.shareUrl = url;
      this.modalCompartirOpen = true;
    },
    
    copiarLink() {
      navigator.clipboard.writeText(this.shareUrl);
      const btn = document.getElementById("share-copy");
      if (btn) {
        const original = btn.textContent;
        btn.textContent = "✓ Copiado";
        setTimeout(() => { btn.textContent = original; }, 2000);
      }
    },
    
    abrirReporteRapido() {
      this.modalReporteOpen = true;
      this.reporteDesc = "";
      this.reporteNombre = "";
      this.reporteContacto = "";
      this.reporteConfirm = false;
      this.reporteFotoKey = "";
      this.reporteFotoStatus = "";
      this.reporteGpsStatus = "Iniciando búsqueda...";
      this.reporteLat = null;
      this.reporteLon = null;
      this.reporteErrorMsg = "";
      this.reporteEnviando = false;
      
      // Cargar select de refugios
      fetch("/api/refugios")
        .then(r => r.json())
        .then(data => {
          if (data.refugios) {
            this.refugios = data.refugios;
          }
        })
        .catch(err => console.error("Error al cargar refugios:", err));
        
      this.obtenerGpsReporte();
    },
    
    cerrarModalReporte() {
      this.modalReporteOpen = false;
    },
    
    async uploadFotoReporte(event: any) {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      this.reporteFotoStatus = "Comprimiendo foto...";
      try {
        const compressedBlob = await comprimirImagen(files[0]);
        const formData = new FormData();
        formData.append("file", compressedBlob, "evidencia.jpg");
        this.reporteFotoStatus = "Cargando foto de verificación...";
        
        const resp = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });
        
        if (resp.ok) {
          const res = await resp.json();
          this.reporteFotoKey = res.key;
          this.reporteFotoStatus = "✓ Foto cargada correctamente";
        } else {
          throw new Error();
        }
      } catch (err) {
        this.reporteFotoStatus = "❌ Error al comprimir o cargar foto";
      } finally {
        event.target.value = "";
      }
    },
    
    obtenerGpsReporte() {
      this.reporteGpsStatus = "Buscando ubicación GPS...";
      if (!navigator.geolocation) {
        this.reporteGpsStatus = "GPS no compatible";
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.reporteLat = position.coords.latitude;
          this.reporteLon = position.coords.longitude;
          this.reporteGpsStatus = `Ubicación GPS obtenida: ${this.reporteLat.toFixed(5)}, ${this.reporteLon.toFixed(5)}`;
          this.initReporteRapidoMap();
        },
        (error) => {
          let msg = "No se pudo obtener ubicación GPS";
          if (error.code === error.PERMISSION_DENIED) {
            msg = "Permiso de GPS denegado";
          }
          this.reporteGpsStatus = msg;
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    },
    
    initReporteRapidoMap() {
      setTimeout(() => {
        const mapDiv = document.getElementById("reporte-rapido-gps-map");
        if (!mapDiv || typeof (window as any).L === "undefined" || !this.reporteLat || !this.reporteLon) return;
        
        const L = (window as any).L;
        if (!this.reporteRapidoMap) {
          this.reporteRapidoMap = L.map("reporte-rapido-gps-map", {
            zoomControl: false,
            attributionControl: false,
            dragging: true,
            scrollWheelZoom: false,
          }).setView([this.reporteLat, this.reporteLon], 15);
          
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
          }).addTo(this.reporteRapidoMap);
          
          this.reporteRapidoMap.on("click", (e: any) => {
            this.reporteLat = parseFloat(e.latlng.lat.toFixed(6));
            this.reporteLon = parseFloat(e.latlng.lng.toFixed(6));
            if (this.reporteRapidoMarker) {
              this.reporteRapidoMarker.setLatLng(e.latlng);
            } else {
              this.reporteRapidoMarker = L.marker(e.latlng).addTo(this.reporteRapidoMap);
            }
            this.reporteGpsStatus = "Ubicación ajustada en mapa.";
          });
        }
        
        if (this.reporteRapidoMarker) {
          this.reporteRapidoMarker.setLatLng([this.reporteLat, this.reporteLon]);
        } else {
          this.reporteRapidoMarker = L.marker([this.reporteLat, this.reporteLon]).addTo(this.reporteRapidoMap);
        }
        this.reporteRapidoMap.setView([this.reporteLat, this.reporteLon], 15);
        this.reporteRapidoMap.invalidateSize();
      }, 150);
    },
    
    async enviarReporteRapido() {
      if (!this.reporteDesc || this.reporteDesc.length < 10) {
        this.reporteErrorMsg = "La descripción es requerida (mínimo 10 caracteres).";
        return;
      }
      if (!this.reporteContacto) {
        this.reporteErrorMsg = "Tu teléfono o contacto es obligatorio.";
        return;
      }
      
      const refugioSelectVal = this.refugioSelectVal;
      const refugioOtroVal = this.refugioOtroVal;
      const refugioFinal = refugioSelectVal === "otro" ? refugioOtroVal : (refugioSelectVal.includes("|") ? refugioSelectVal.split("|")[1] : refugioSelectVal);
      
      if (!refugioFinal) {
        this.reporteErrorMsg = "La ubicación o refugio es obligatorio.";
        return;
      }
      if (!this.reporteFotoKey) {
        this.reporteErrorMsg = "La foto de evidencia es obligatoria.";
        return;
      }
      if (!this.reporteConfirm) {
        this.reporteErrorMsg = "Debes confirmar que la información ingresada es verídica.";
        return;
      }
      
      this.reporteErrorMsg = "";
      this.reporteEnviando = true;
      
      let refugioId: number | null = null;
      let centroAcopioId: number | null = null;
      let hospitalId: number | null = null;
      
      if (refugioSelectVal !== "otro" && refugioSelectVal.includes("|")) {
        const [tipoId, _] = refugioSelectVal.split("|");
        const [tipo, idStr] = tipoId.split(":");
        const parsedId = parseInt(idStr, 10);
        if (tipo === "refugio") refugioId = parsedId;
        else if (tipo === "centro_acopio") centroAcopioId = parsedId;
        else if (tipo === "hospital") hospitalId = parsedId;
      }
      
      try {
        let resp;
        if (this.modalDetailTipo === "persona") {
          resp = await fetch(`/api/personas/${this.modalDetailData.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accion: "reportar_localizado",
              estado: "localizado",
              contacto: this.reporteContacto,
              refugio: refugioFinal,
              refugio_id: refugioId,
              centro_acopio_id: centroAcopioId,
              hospital_id: hospitalId,
              notas: this.reporteDesc,
              foto_key: this.reporteFotoKey,
              latitud: this.reporteLat,
              longitud: this.reporteLon
            })
          });
        } else if (this.modalDetailTipo === "reporte") {
          resp = await fetch(`/api/reportes/${this.modalDetailData.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accion: "reportar_localizado",
              estado_reporte: "resuelto",
              contacto: this.reporteContacto,
              refugio: refugioFinal,
              refugio_id: refugioId,
              centro_acopio_id: centroAcopioId,
              hospital_id: hospitalId,
              notas: this.reporteDesc,
              foto_key: this.reporteFotoKey,
              latitud: this.reporteLat,
              longitud: this.reporteLon
            })
          });
        } else {
          const nombreBuscado = this.modalDetailData ? (this.modalDetailData.nombre_buscado || `${this.modalDetailData.nombre} ${this.modalDetailData.apellido || ""}`) : "Persona";
          resp = await fetch("/api/reportes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tipo: "encontrado",
              nombre_buscado: nombreBuscado,
              descripcion: this.reporteDesc,
              ubicacion_nombre: refugioFinal,
              latitud: this.reporteLat,
              longitud: this.reporteLon,
              reportante_nombre: this.reporteNombre || null,
              reportante_contacto: this.reporteContacto,
              cedula_buscado: this.modalDetailData ? (this.modalDetailData.cedula || this.modalDetailData.cedula_buscado || null) : null,
              foto_key: this.reporteFotoKey
            })
          });
        }
        
        if (resp.ok) {
          this.reporteFotoStatus = "✓ Enviado";
          setTimeout(() => {
            this.cerrarModalReporte();
            this.cerrarModalDetalle();
          }, 1000);
        } else {
          const err = await resp.json();
          this.reporteErrorMsg = `Error: ${err.error || "no se pudo enviar"}`;
        }
      } catch {
        this.reporteErrorMsg = "Sin conexión a internet.";
      } finally {
        this.reporteEnviando = false;
      }
    }
  };
}
