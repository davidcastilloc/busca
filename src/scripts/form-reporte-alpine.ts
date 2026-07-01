import Alpine from "alpinejs";

export function registerFormReporteAlpine() {
  if (typeof window !== "undefined" && window.Alpine) {
    if (!window.Alpine.data("formReporteAlpine")) {
      window.Alpine.data("formReporteAlpine", formReporteAlpine);
    }
  }
}

// Register immediately on import
registerFormReporteAlpine();

// Also register on events
if (typeof document !== "undefined") {
  document.addEventListener("alpine:init", registerFormReporteAlpine);
  document.addEventListener("astro:page-load", registerFormReporteAlpine);
}

function formReporteAlpine() {
  return {
    step: 1,
    tipo: "",
    necesidadCategoria: "Agua potable",
    toast: { visible: false, message: "", borderClass: "border-blue-500/30" },
    errors: {} as Record<string, string>,
    formData: {
      nombre_buscado: "",
      cedula_buscado: "",
      extra_estado: "",
      extra_ciudad: "",
      extra_sector: "",
      extra_ultimo_contacto: "",
      extra_senas: "",
      necesidad_categoria: "Agua potable",
      necesidad_categoria_otro: "",
      necesidad_gravedad: "Alta (Riesgo de vida)",
      necesidad_afectados: "",
      necesidad_telefono: "",
      refugio_id: "",
      refugio_nombre: "",
      refugio_tipo: "Refugio temporal",
      refugio_ocupacion: "",
      refugio_capacidad: "",
      refugio_telefono: "",
      descripcion: "",
      ubicacion_nombre: "",
      latitud: "",
      longitud: "",
      foto_key: "",
      reportante_nombre: "",
      reportante_contacto: "",
      generar_flyer: true
    },

    init() {
      // Inyección de estado SSR limpia usando dataset
      if (this.$el.dataset.estado) {
        try {
          const initData = JSON.parse(this.$el.dataset.estado);
          if (initData.reportante_nombre) this.formData.reportante_nombre = initData.reportante_nombre;
          if (initData.reportante_contacto) this.formData.reportante_contacto = initData.reportante_contacto;
        } catch (e) {
          console.error("Error al parsear estado inicial:", e);
        }
      }
    },

    get labelDescripcion() {
      if (this.tipo === "desaparecido") return "Detalles adicionales y contexto *";
      if (this.tipo === "encontrado") return "Descripción del Hallazgo *";
      if (this.tipo === "necesidad") return "Descripción de la Necesidad *";
      if (this.tipo === "refugio") return "Descripción del Refugio / Necesidades *";
      return "Descripción Detallada *";
    },

    get helpDescripcion() {
      if (this.tipo === "desaparecido" || this.tipo === "encontrado")
        return "La IA utilizará esta descripción para cruzar reportes.";
      if (this.tipo === "necesidad")
        return "La información será visible para voluntarios y coordinadores de ayuda.";
      if (this.tipo === "refugio")
        return "Detalle el estado del refugio, insumos requeridos y contactos.";
      return "";
    },

    get tipoLabel() {
      if (this.tipo === "desaparecido") return "Persona Desaparecida";
      if (this.tipo === "encontrado") return "Persona Encontrada";
      if (this.tipo === "refugio") return "Refugio / Centro";
      if (this.tipo === "necesidad") return "Necesidad Crítica";
      return "";
    },

    setTipo(t: string) {
      this.tipo = t;
      this.errors = {};
      setTimeout(() => this.goToStep(2), 350);
    },

    goToStep(s: number) {
      if (s > this.step) {
        if (this.step === 1 && !this.tipo) {
          this.showToast("❌ Selecciona un tipo de reporte.", "border-red-500/30");
          return;
        }
        if (this.step === 2 && !this.validarPaso2()) return;
      }

      this.step = s;
      window.scrollTo({ top: 0, behavior: "smooth" });

      if (s === 2 && (window as any).mapaReporteInstance) {
        setTimeout(() => {
          try {
            (window as any).mapaReporteInstance.invalidateSize();
          } catch (e) {}
        }, 150);
      }
    },

    showToast(msg: string, borderClass: string) {
      this.toast = { visible: true, message: msg, borderClass };
      setTimeout(() => {
        this.toast.visible = false;
      }, 5000);
    },

    validarPaso2() {
      this.errors = {};
      let esValido = true;

      if (this.tipo === "desaparecido") {
        if (!this.formData.nombre_buscado.trim()) { this.errors.nombre_buscado = "Requerido"; esValido = false; }
        if (!this.formData.extra_estado.trim()) { this.errors.extra_estado = "Requerido"; esValido = false; }
        if (!this.formData.extra_ciudad.trim()) { this.errors.extra_ciudad = "Requerido"; esValido = false; }
        if (!this.formData.extra_sector.trim()) { this.errors.extra_sector = "Requerido"; esValido = false; }
        if (!this.formData.extra_ultimo_contacto.trim()) { this.errors.extra_ultimo_contacto = "Requerido"; esValido = false; }
        if (!this.formData.extra_senas.trim()) { this.errors.extra_senas = "Requerido"; esValido = false; }
        if (!this.formData.foto_key) {
          this.showToast("❌ La foto de la persona desaparecida es requerida.", "border-red-500/30");
          esValido = false;
        }
      } else if (this.tipo === "refugio") {
        if (!this.formData.refugio_nombre.trim()) { this.errors.refugio_nombre = "Requerido"; esValido = false; }
      } else if (this.tipo === "necesidad") {
        if (this.necesidadCategoria === "Otro" && !this.formData.necesidad_categoria_otro.trim()) {
          this.errors.necesidad_categoria_otro = "Requerido";
          esValido = false;
        }
        if (!this.formData.necesidad_telefono.trim()) {
          this.errors.necesidad_telefono = "Requerido";
          esValido = false;
        }
      }

      if (String(this.formData.descripcion || "").trim().length < 10) {
        this.errors.descripcion = "Debe tener al menos 10 caracteres";
        esValido = false;
      }

      if (!esValido) {
        this.showToast("❌ Hay campos con errores en el formulario.", "border-red-500/30");
      }
      return esValido;
    },

    async submitForm() {
      if (!this.tipo) {
        this.showToast("❌ Selecciona un tipo.", "border-red-500/30");
        this.goToStep(1);
        return;
      }
      if (!this.validarPaso2()) {
        this.goToStep(2);
        return;
      }

      let descConcatenada = String(this.formData.descripcion).trim();
      let payload: any = {};
      let endpointUrl = "/api/reportes";

      let refugio_id = null;
      let hospital_id = null;
      let centro_acopio_id = null;
      if (this.formData.refugio_id) {
        const [tipo, idStr] = String(this.formData.refugio_id).split(":");
        const id = parseInt(idStr, 10);
        if (tipo === "hospital") hospital_id = id;
        else if (tipo === "centro_acopio") centro_acopio_id = id;
        else if (tipo === "refugio") refugio_id = id;
      }

      if (this.tipo === "desaparecido") {
        const fechaContacto = String(this.formData.extra_ultimo_contacto).replace("T", " ");
        const ubicacion = `${String(this.formData.extra_estado).trim()}, ${String(this.formData.extra_ciudad).trim()}, Sector ${String(this.formData.extra_sector).trim()}`;
        const senas = String(this.formData.extra_senas).trim();
        descConcatenada = `[FECHA ÚLTIMO CONTACTO: ${fechaContacto}]\n[UBICACIÓN: ${ubicacion}]\n[SEÑAS: ${senas}]\n\n${descConcatenada}`;
        payload = {
          tipo: "desaparecido",
          nombre_buscado: this.formData.nombre_buscado || null,
          cedula_buscado: this.formData.cedula_buscado || null,
          descripcion: descConcatenada,
          reportante_nombre: this.formData.reportante_nombre || null,
          reportante_contacto: this.formData.reportante_contacto || null,
          ubicacion_nombre: this.formData.ubicacion_nombre || null,
          latitud: this.formData.latitud ? parseFloat(this.formData.latitud as string) : null,
          longitud: this.formData.longitud ? parseFloat(this.formData.longitud as string) : null,
          foto_key: this.formData.foto_key || null,
          refugio_id,
          hospital_id,
          centro_acopio_id,
        };
      } else if (this.tipo === "encontrado") {
        payload = {
          tipo: "encontrado",
          nombre_buscado: this.formData.nombre_buscado || null,
          cedula_buscado: this.formData.cedula_buscado || null,
          descripcion: descConcatenada,
          reportante_nombre: this.formData.reportante_nombre || null,
          reportante_contacto: this.formData.reportante_contacto || null,
          ubicacion_nombre: this.formData.ubicacion_nombre || null,
          latitud: this.formData.latitud ? parseFloat(this.formData.latitud as string) : null,
          longitud: this.formData.longitud ? parseFloat(this.formData.longitud as string) : null,
          foto_key: this.formData.foto_key || null,
          refugio_id,
          hospital_id,
          centro_acopio_id,
        };
      } else if (this.tipo === "necesidad") {
        endpointUrl = "/api/necesidades";
        let categoriaFinal = this.necesidadCategoria;
        if (categoriaFinal === "Otro")
          categoriaFinal = String(this.formData.necesidad_categoria_otro || "").trim() || "Otro";
        payload = {
          tipo: "necesidad",
          categoria: categoriaFinal,
          gravedad: String(this.formData.necesidad_gravedad),
          afectados: this.formData.necesidad_afectados ? parseInt(this.formData.necesidad_afectados as string, 10) : null,
          descripcion: descConcatenada,
          ubicacion_nombre: this.formData.ubicacion_nombre || null,
          latitud: this.formData.latitud ? parseFloat(this.formData.latitud as string) : null,
          longitud: this.formData.longitud ? parseFloat(this.formData.longitud as string) : null,
          telefono: this.formData.necesidad_telefono || null,
          foto_key: this.formData.foto_key || null,
          refugio_id,
          hospital_id,
          centro_acopio_id,
          reportante_nombre: this.formData.reportante_nombre || null,
          reportante_contacto: this.formData.reportante_contacto || null,
        };
      } else if (this.tipo === "refugio") {
        const centroTipo = String(this.formData.refugio_tipo);
        const ocupacion = this.formData.refugio_ocupacion ? `${this.formData.refugio_ocupacion} pers.` : "0 pers.";
        const capacidad = this.formData.refugio_capacidad ? `${this.formData.refugio_capacidad} pers.` : "100 pers.";
        descConcatenada = `[TIPO CENTRO: ${centroTipo}]\n[OCUPACIÓN: ${ocupacion} / ${capacidad}]\n\n${descConcatenada}`;
        payload = {
          tipo: "refugio",
          nombre_buscado: this.formData.refugio_nombre || "Refugio sin nombre",
          cedula_buscado: null,
          descripcion: descConcatenada,
          reportante_nombre: this.formData.reportante_nombre || null,
          reportante_contacto: this.formData.reportante_contacto || null,
          ubicacion_nombre: this.formData.ubicacion_nombre || null,
          latitud: this.formData.latitud ? parseFloat(this.formData.latitud as string) : null,
          longitud: this.formData.longitud ? parseFloat(this.formData.longitud as string) : null,
          foto_key: this.formData.foto_key || null,
          refugio_id,
          hospital_id,
          centro_acopio_id,
        };
      }

      this.showToast("Procesando reporte...", "border-blue-500/30");

      if (navigator.onLine) {
        try {
          const response = await fetch(endpointUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            const resData = await response.json();
            const quiereFlyer = this.formData.generar_flyer;

            if (quiereFlyer) {
              this.showToast("Reporte creado. Generando cartel de emergencia...", "border-blue-500/30");
              try {
                let flyerTitle = `Emergencia Activa`;
                if (payload.tipo === "desaparecido")
                  flyerTitle = `SE BUSCA: ${payload.nombre_buscado || "Persona Desaparecida"}`;
                else if (payload.tipo === "encontrado")
                  flyerTitle = `PERSONA ENCONTRADA: ${payload.nombre_buscado || "No identificada"}`;
                else if (payload.tipo === "necesidad") {
                  flyerTitle = `EMERGENCIA: ${payload.categoria.toUpperCase()}`;
                } else if (payload.tipo === "refugio")
                  flyerTitle = `REFUGIO ACTIVO: ${payload.nombre_buscado}`;

                let flyerDescription = payload.descripcion;
                if (payload.ubicacion_nombre)
                  flyerDescription = `[UBICACIÓN: ${payload.ubicacion_nombre}]\n${flyerDescription}`;

                const flyerPayload = {
                  title: flyerTitle,
                  description: flyerDescription,
                  foto_key: payload.foto_key || "",
                  tipo: payload.tipo,
                  phones: (() => {
                    const phones = [];
                    const tipoTel =
                      payload.tipo === "necesidad"
                        ? (this.formData.necesidad_telefono || "")
                        : payload.tipo === "refugio"
                          ? (this.formData.refugio_telefono || "")
                          : "";
                    if (tipoTel) phones.push(tipoTel);
                    const repTel = payload.reportante_contacto || "";
                    if (repTel && repTel !== tipoTel) phones.push(repTel);
                    return phones;
                  })(),
                  socials: [],
                  registrarEnBusca: false,
                  necesidad_id:
                    payload.tipo === "necesidad" && resData.id ? resData.id : undefined,
                };

                const flyerResponse = await fetch("/api/flyers", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(flyerPayload),
                });
                if (flyerResponse.ok) {
                  const flyerData = await flyerResponse.json();
                  this.showToast("✓ Cartel generado. Redirigiendo...", "border-green-500/30");
                  setTimeout(() => {
                    window.location.href = `/f/${flyerData.id}?creado=true`;
                  }, 1200);
                  return;
                }
              } catch (e) {
                console.error("Error generating flyer:", e);
              }
            }
            this.showToast("✓ Reporte emitido con éxito.", "border-green-500/30");
            this.resetForm();
          } else {
            const errData = await response.json();
            this.showToast("❌ " + (errData.error || "Error"), "border-red-500/30");
          }
        } catch (e) {
          this.guardarOffline(payload);
        }
      } else {
        this.guardarOffline(payload);
      }
    },

    resetForm() {
      this.formData = {
        nombre_buscado: "",
        cedula_buscado: "",
        extra_estado: "",
        extra_ciudad: "",
        extra_sector: "",
        extra_ultimo_contacto: "",
        extra_senas: "",
        necesidad_categoria: "Agua potable",
        necesidad_categoria_otro: "",
        necesidad_gravedad: "Alta (Riesgo de vida)",
        necesidad_afectados: "",
        necesidad_telefono: "",
        refugio_id: "",
        refugio_nombre: "",
        refugio_tipo: "Refugio temporal",
        refugio_ocupacion: "",
        refugio_capacidad: "",
        refugio_telefono: "",
        descripcion: "",
        ubicacion_nombre: "",
        latitud: "",
        longitud: "",
        foto_key: "",
        reportante_nombre: "",
        reportante_contacto: "",
        generar_flyer: true
      };

      document.getElementById("btn-quitar-foto")?.click();
      this.tipo = "";
      this.goToStep(1);
    },

    async guardarOffline(payload: any) {
      try {
        const queueType = payload.tipo === "necesidad" ? "necesidad" : "reporte";
        await (window as any).encolarRegistro(queueType, payload);
        this.showToast(
          "⚠️ Guardado localmente sin red. Se sincronizará automáticamente.",
          "border-yellow-500/30"
        );
        this.resetForm();
        window.dispatchEvent(new CustomEvent("offline-record-added"));
      } catch (e: any) {
        this.showToast("❌ Error al guardar localmente: " + e.message, "border-red-500/30");
      }
    },
  };
}
