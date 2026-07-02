import Alpine from 'alpinejs';

document.addEventListener('alpine:init', () => {
  Alpine.data('modalAyuda', () => ({
    openCamino: false,
    openAtendida: false,
    
    // Estado del Toast Premium
    toast: {
      show: false,
      type: 'success',
      icon: '🚗',
      title: '¡En camino!',
      message: 'Tu apoyo para esta necesidad ha sido registrado.'
    },
    
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

    showToast(type: 'success' | 'error', icon: string, title: string, message: string) {
      this.toast.type = type;
      this.toast.icon = icon;
      this.toast.title = title;
      this.toast.message = message;
      this.toast.show = true;
      
      // Ocultar automáticamente en 4 segundos
      setTimeout(() => {
        this.toast.show = false;
      }, 4000);
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
          this.showToast('success', '🚗', '¡En camino!', 'Tu apoyo para esta necesidad ha sido registrado.');
          this.openCamino = false;
          window.dispatchEvent(new CustomEvent('reload-map-data', { detail: { necesidadId: this.necesidadId } }));
        } else {
          this.showToast('error', '❌', 'Error', 'No se pudo registrar tu apoyo en camino.');
        }
      } catch (e) {
        this.showToast('error', '📡', 'Error de red', 'No se pudo conectar con el servidor.');
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
          this.showToast('success', '✅', '¡Necesidad atendida!', 'La necesidad ha sido resuelta y archivada.');
          this.openAtendida = false;
          window.dispatchEvent(new CustomEvent('reload-map-data-atendida', { detail: { necesidadId: this.necesidadId } }));
        } else {
          this.showToast('error', '❌', 'Error', 'No se pudo actualizar el estado de la necesidad.');
        }
      } catch (e) {
        this.showToast('error', '📡', 'Error de red', 'No se pudo conectar con el servidor.');
      }
    }
  }));
});
