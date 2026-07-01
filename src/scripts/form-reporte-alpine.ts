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

    setTipo(t: string) {
      this.tipo = t;
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

      if (s === 3) {
        this.actualizarResumen();
      }

      this.updateStepIndicators();
    },

    updateStepIndicators() {
      for (let i = 1; i <= 3; i++) {
        const ind = document.getElementById(`step-ind-${i}`);
        const txt = document.getElementById(`step-txt-${i}`);
        if (ind && txt) {
          if (i < this.step) {
            ind.className =
              "w-8 h-8 rounded-full flex items-center justify-center bg-green-500 text-white font-uber-display text-sm transition-colors";
            ind.innerHTML = "✓";
            txt.className = "text-xs font-uber-text font-bold text-ink transition-colors";
          } else if (i === this.step) {
            ind.className =
              "w-8 h-8 rounded-full flex items-center justify-center bg-primary text-white font-uber-display text-sm transition-colors";
            ind.innerHTML = String(i);
            txt.className = "text-xs font-uber-text font-bold text-ink transition-colors";
          } else {
            ind.className =
              "w-8 h-8 rounded-full flex items-center justify-center bg-canvas-soft text-mute font-uber-display text-sm transition-colors";
            ind.innerHTML = String(i);
            txt.className = "text-xs font-uber-text text-body transition-colors";
          }
        }
      }
    },

    showToast(msg: string, borderClass: string) {
      this.toast = { visible: true, message: msg, borderClass };
      setTimeout(() => {
        this.toast.visible = false;
      }, 5000);
    },

    mostrarError(inputName: string, msg: string) {
      const form = document.getElementById("form-reporte");
      if (!form) return;
      const input = form.querySelector(`[name="${inputName}"]`);
      if (!input) return;
      input.classList.add("border-red-500", "focus:border-red-500", "ring-1", "ring-red-500");
      let errorSpan = input.parentNode?.querySelector(".input-error-msg");
      if (!errorSpan) {
        errorSpan = document.createElement("span");
        errorSpan.className =
          "input-error-msg text-xs text-red-500 mt-1 block font-uber-text font-semibold";
        input.parentNode?.appendChild(errorSpan);
      }
      errorSpan.textContent = msg;
    },

    limpiarErrores() {
      const form = document.getElementById("form-reporte");
      if (!form) return;
      form.querySelectorAll(".border-red-500").forEach((el) => {
        el.classList.remove("border-red-500", "focus:border-red-500", "ring-1", "ring-red-500");
      });
      form.querySelectorAll(".input-error-msg").forEach((el) => el.remove());
    },

    validarPaso2() {
      this.limpiarErrores();
      const form = document.getElementById("form-reporte") as HTMLFormElement;
      if (!form) return false;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      let esValido = true;

      if (this.tipo === "desaparecido") {
        if (!data.nombre_buscado) {
          this.mostrarError("nombre_buscado", "Requerido");
          esValido = false;
        }
        if (!data.extra_estado) {
          this.mostrarError("extra_estado", "Requerido");
          esValido = false;
        }
        if (!data.extra_ciudad) {
          this.mostrarError("extra_ciudad", "Requerido");
          esValido = false;
        }
        if (!data.extra_sector) {
          this.mostrarError("extra_sector", "Requerido");
          esValido = false;
        }
        if (!data.extra_ultimo_contacto) {
          this.mostrarError("extra_ultimo_contacto", "Requerido");
          esValido = false;
        }
        if (!data.extra_senas) {
          this.mostrarError("extra_senas", "Requerido");
          esValido = false;
        }
        if (!document.getElementById("foto_key")?.getAttribute("value") && !(document.getElementById("foto_key") as HTMLInputElement)?.value) {
          this.showToast("❌ La foto de la persona desaparecida es requerida.", "border-red-500/30");
          esValido = false;
        }
      } else if (this.tipo === "refugio") {
        if (!data.refugio_nombre) {
          this.mostrarError("refugio_nombre", "Requerido");
          esValido = false;
        }
      } else if (this.tipo === "necesidad") {
        if (this.necesidadCategoria === "Otro" && !data.necesidad_categoria_otro) {
          this.mostrarError("necesidad_categoria_otro", "Requerido");
          esValido = false;
        }
      }

      if (String(data.descripcion || "").length < 10) {
        this.mostrarError("descripcion", "Debe tener al menos 10 caracteres");
        esValido = false;
      }

      if (!esValido) {
        this.showToast("❌ Hay campos con errores en el formulario.", "border-red-500/30");
      }
      return esValido;
    },

    actualizarResumen() {
      const form = document.getElementById("form-reporte") as HTMLFormElement;
      if (!form) return;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      const summaryTipo = document.getElementById("summary-tipo");
      const summaryNombre = document.getElementById("summary-nombre");
      const summaryDescripcion = document.getElementById("summary-descripcion");
      const summaryUbicacion = document.getElementById("summary-ubicacion");
      const summaryFoto = document.getElementById("summary-foto");
      const rowNombre = document.getElementById("summary-row-nombre");
      const flyerOptIn = document.getElementById("flyer-opt-in");
      const flyerNoPhotoTip = document.getElementById("flyer-no-photo-tip");

      let tipoText = this.tipo;
      if (this.tipo === "desaparecido") tipoText = "Persona Desaparecida";
      else if (this.tipo === "encontrado") tipoText = "Persona Encontrada";
      else if (this.tipo === "refugio") tipoText = "Refugio / Centro";
      else if (this.tipo === "necesidad") tipoText = "Necesidad Crítica";

      if (summaryTipo) summaryTipo.textContent = tipoText;

      const nombre = this.tipo === "refugio" ? data.refugio_nombre : data.nombre_buscado;
      if (nombre && summaryNombre && rowNombre) {
        rowNombre.classList.remove("hidden");
        summaryNombre.textContent = nombre as string;
      } else if (rowNombre) {
        rowNombre.classList.add("hidden");
      }

      const desc = String(data.descripcion || "");
      if (summaryDescripcion)
        summaryDescripcion.textContent =
          desc.substring(0, 100) + (desc.length > 100 ? "..." : "");
      if (summaryUbicacion)
        summaryUbicacion.textContent = (data.ubicacion_nombre as string) || "Ubicación GPS/Mapa";

      const tieneFoto = !!(document.getElementById("foto_key") as HTMLInputElement)?.value;
      if (summaryFoto) summaryFoto.textContent = tieneFoto ? "✓ Sí, adjunta" : "No";

      if (flyerOptIn && flyerNoPhotoTip) {
        if (this.tipo === "desaparecido") {
          if (tieneFoto) {
            flyerOptIn.classList.remove("hidden");
            flyerNoPhotoTip.classList.add("hidden");
          } else {
            flyerOptIn.classList.add("hidden");
            flyerNoPhotoTip.classList.remove("hidden");
          }
        } else {
          flyerOptIn.classList.remove("hidden");
          flyerNoPhotoTip.classList.add("hidden");
        }
      }
    },

    async submitForm() {
      this.limpiarErrores();
      if (!this.tipo) {
        this.showToast("❌ Selecciona un tipo.", "border-red-500/30");
        this.goToStep(1);
        return;
      }
      if (!this.validarPaso2()) {
        this.goToStep(2);
        return;
      }

      const form = document.getElementById("form-reporte") as HTMLFormElement;
      if (!form) return;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      let descConcatenada = String(data.descripcion).trim();
      let payload: any = {};
      let endpointUrl = "/api/reportes";

      let refugio_id = null;
      let hospital_id = null;
      let centro_acopio_id = null;
      if (data.refugio_id) {
        const [tipo, idStr] = String(data.refugio_id).split(":");
        const id = parseInt(idStr, 10);
        if (tipo === "hospital") hospital_id = id;
        else if (tipo === "centro_acopio") centro_acopio_id = id;
        else if (tipo === "refugio") refugio_id = id;
      }

      if (this.tipo === "desaparecido") {
        const fechaContacto = String(data.extra_ultimo_contacto).replace("T", " ");
        const ubicacion = `${String(data.extra_estado).trim()}, ${String(data.extra_ciudad).trim()}, Sector ${String(data.extra_sector).trim()}`;
        const senas = String(data.extra_senas).trim();
        descConcatenada = `[FECHA ÚLTIMO CONTACTO: ${fechaContacto}]\n[UBICACIÓN: ${ubicacion}]\n[SEÑAS: ${senas}]\n\n${descConcatenada}`;
        payload = {
          tipo: "desaparecido",
          nombre_buscado: data.nombre_buscado || null,
          cedula_buscado: data.cedula_buscado || null,
          descripcion: descConcatenada,
          reportante_nombre: data.reportante_nombre || null,
          reportante_contacto: data.reportante_contacto || null,
          ubicacion_nombre: data.ubicacion_nombre || null,
          latitud: data.latitud ? parseFloat(data.latitud as string) : null,
          longitud: data.longitud ? parseFloat(data.longitud as string) : null,
          foto_key: data.foto_key || null,
          refugio_id,
          hospital_id,
          centro_acopio_id,
        };
      } else if (this.tipo === "encontrado") {
        payload = {
          tipo: "encontrado",
          nombre_buscado: data.nombre_buscado || null,
          cedula_buscado: data.cedula_buscado || null,
          descripcion: descConcatenada,
          reportante_nombre: data.reportante_nombre || null,
          reportante_contacto: data.reportante_contacto || null,
          ubicacion_nombre: data.ubicacion_nombre || null,
          latitud: data.latitud ? parseFloat(data.latitud as string) : null,
          longitud: data.longitud ? parseFloat(data.longitud as string) : null,
          foto_key: data.foto_key || null,
          refugio_id,
          hospital_id,
          centro_acopio_id,
        };
      } else if (this.tipo === "necesidad") {
        endpointUrl = "/api/necesidades";
        let categoriaFinal = String(data.necesidad_categoria);
        if (categoriaFinal === "Otro")
          categoriaFinal = String(data.necesidad_categoria_otro || "").trim() || "Otro";
        payload = {
          tipo: "necesidad",
          categoria: categoriaFinal,
          gravedad: String(data.necesidad_gravedad),
          afectados: data.necesidad_afectados ? parseInt(data.necesidad_afectados as string, 10) : null,
          descripcion: descConcatenada,
          ubicacion_nombre: data.ubicacion_nombre || null,
          latitud: data.latitud ? parseFloat(data.latitud as string) : null,
          longitud: data.longitud ? parseFloat(data.longitud as string) : null,
          telefono: data.necesidad_telefono || null,
          foto_key: data.foto_key || null,
          refugio_id,
          hospital_id,
          centro_acopio_id,
          reportante_nombre: data.reportante_nombre || null,
          reportante_contacto: data.reportante_contacto || null,
        };
      } else if (this.tipo === "refugio") {
        const centroTipo = String(data.refugio_tipo);
        const ocupacion = data.refugio_ocupacion ? `${data.refugio_ocupacion} pers.` : "0 pers.";
        const capacidad = data.refugio_capacidad ? `${data.refugio_capacidad} pers.` : "100 pers.";
        descConcatenada = `[TIPO CENTRO: ${centroTipo}]\n[OCUPACIÓN: ${ocupacion} / ${capacidad}]\n\n${descConcatenada}`;
        payload = {
          tipo: "refugio",
          nombre_buscado: data.refugio_nombre || "Refugio sin nombre",
          cedula_buscado: null,
          descripcion: descConcatenada,
          reportante_nombre: data.reportante_nombre || null,
          reportante_contacto: data.reportante_contacto || null,
          ubicacion_nombre: data.ubicacion_nombre || null,
          latitud: data.latitud ? parseFloat(data.latitud as string) : null,
          longitud: data.longitud ? parseFloat(data.longitud as string) : null,
          foto_key: data.foto_key || null,
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
            const generarFlyerChk = document.getElementById("generar-flyer-chk") as HTMLInputElement;
            const quiereFlyer = generarFlyerChk && generarFlyerChk.checked;

            if (quiereFlyer) {
              this.showToast("Reporte creado. Generando cartel de emergencia...", "border-blue-500/30");
              try {
                let flyerTitle = `Emergencia Activa`;
                if (payload.tipo === "desaparecido")
                  flyerTitle = `SE BUSCA: ${payload.nombre_buscado || "Persona Desaparecida"}`;
                else if (payload.tipo === "encontrado")
                  flyerTitle = `PERSONA ENCONTRADA: ${payload.nombre_buscado || "No identificada"}`;
                else if (payload.tipo === "necesidad") {
                  const catMatch = payload.descripcion.match(/\[TIPO NECESIDAD: (.*?)\]/);
                  const categoria = catMatch ? catMatch[1] : "Necesidad Urgente";
                  flyerTitle = `EMERGENCIA: ${categoria.toUpperCase()}`;
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
                        ? (data.necesidad_telefono || "")
                        : payload.tipo === "refugio"
                          ? (data.refugio_telefono || "")
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
                console.error(e);
              }
            }
            this.showToast("✓ Reporte emitido con éxito.", "border-green-500/30");
            form.reset();
            document.getElementById("btn-quitar-foto")?.click();
            this.tipo = "";
            this.goToStep(1);
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

    async guardarOffline(payload: any) {
      try {
        const queueType = payload.tipo === "necesidad" ? "necesidad" : "reporte";
        await (window as any).encolarRegistro(queueType, payload);
        this.showToast(
          "⚠️ Guardado localmente sin red. Se sincronizará automáticamente.",
          "border-yellow-500/30"
        );
        (document.getElementById("form-reporte") as HTMLFormElement).reset();
        document.getElementById("btn-quitar-foto")?.click();
        this.tipo = "";
        this.goToStep(1);
        window.dispatchEvent(new CustomEvent("offline-record-added"));
      } catch (e: any) {
        this.showToast("❌ Error al guardar localmente: " + e.message, "border-red-500/30");
      }
    },
  };
}
