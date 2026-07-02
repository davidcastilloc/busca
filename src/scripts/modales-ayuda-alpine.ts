import Alpine from 'alpinejs';

document.addEventListener('alpine:init', () => {
  Alpine.data('modalAyuda', () => ({
    openCamino: false,
    openAtendida: false,
    
    necesidadId: null as number | null,
    refugioId: null as number | null,
    centroAcopioId: null as number | null,
    hospitalId: null as number | null,
    
    init() {
      // Evento para abrir modal "Voy en camino"
      window.addEventListener('open-camino-modal', (e: any) => {
        const detail = e.detail;
        this.necesidadId = detail.necesidadId;
        this.refugioId = detail.refugioId;
        this.centroAcopioId = detail.centroAcopioId;
        this.hospitalId = detail.hospitalId;
        this.openCamino = true;
      });

      // Evento para abrir modal "Marcar como Atendida"
      window.addEventListener('open-atendida-modal', (e: any) => {
        const detail = e.detail;
        this.necesidadId = detail.necesidadId;
        this.openAtendida = true;
      });
    },

    async confirmarCamino() {
      if (!this.necesidadId) return;
      try {
        const resp = await fetch("/api/ayudas/en-camino", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            necesidad_id: this.necesidadId,
            refugio_id: this.refugioId,
            centro_acopio_id: this.centroAcopioId,
            hospital_id: this.hospitalId
          })
        });
        if (resp.ok) {
          alert("¡Gracias! Tu apoyo en camino ha sido registrado.");
          this.openCamino = false;
          window.dispatchEvent(new CustomEvent('reload-map-data', { detail: { necesidadId: this.necesidadId } }));
        } else {
          alert("Error al registrar el apoyo.");
        }
      } catch (e) {
        alert("Error de red.");
      }
    },

    async confirmarAtendida() {
      if (!this.necesidadId) return;
      try {
        const resp = await fetch(`/api/necesidades/${this.necesidadId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: "atendida" })
        });
        if (resp.ok) {
          alert("✓ Necesidad marcada como atendida con éxito.");
          this.openAtendida = false;
          window.dispatchEvent(new CustomEvent('reload-map-data-atendida', { detail: { necesidadId: this.necesidadId } }));
        } else {
          alert("Error al actualizar la necesidad.");
        }
      } catch (e) {
        alert("Error de red.");
      }
    }
  }));
});
