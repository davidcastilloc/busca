import Alpine from 'alpinejs';

document.addEventListener('alpine:init', () => {
  Alpine.data('refugioCard', function () {
    return {
      init() {
        if (this.$el.dataset.refugioInicial) {
          const data = JSON.parse(this.$el.dataset.refugioInicial);
          Object.assign(this, data);
        }

        this.$el.addEventListener('update-refugio', (e: CustomEvent) => {
          const d = e.detail;
          this.ocupacion = d.ocupacion_actual;
          this.capacidad = d.capacidad_maxima;
          this.encargado = d.encargado;
          this.direccion = d.direccion;
          this.contacto = d.contacto;
          this.necesidades = d.necesidades;
          this.ninos = d.ninos;
          this.bebes = d.bebes_lactantes;
          this.mayores = d.adultos_mayores;
          this.prof = d.personal_profesional;
          this.vols = d.voluntarios;
          this.itemsCriticos = d.itemsCriticos || [];
          this.itemsAlerta = d.itemsAlerta || [];
          this.fechaActualizada = d.fechaActualizada;
          this.fotos = d.fotos || [];

          // Actualizar dataset para búsquedas
          this.$el.dataset.ocupacion = this.ocupacion;
          this.$el.dataset.capacidad = this.capacidad;
          this.$el.dataset.encargado = this.encargado;
          this.$el.dataset.direccion = this.direccion?.toLowerCase() || '';
          this.$el.dataset.contacto = this.contacto;
          this.$el.dataset.necesidades = this.necesidades?.toLowerCase() || '';
          this.$el.dataset.fotos = JSON.stringify(this.fotos);

          const btn = this.$el.querySelector('.btn-edit-refugio') as HTMLElement;
          if (btn) {
            btn.dataset.ocupacion = this.ocupacion;
            btn.dataset.capacidad = this.capacidad;
            btn.dataset.encargado = this.encargado;
            btn.dataset.direccion = this.direccion;
            btn.dataset.contacto = this.contacto;
            btn.dataset.necesidades = this.necesidades;
            btn.dataset.ninos = this.ninos;
            btn.dataset.bebes = this.bebes;
            btn.dataset.mayores = this.mayores;
            btn.dataset.prof = this.prof;
            btn.dataset.vols = this.vols;
            btn.dataset.inventario = JSON.stringify(d.inventario || {});
            btn.dataset.fotos = JSON.stringify(this.fotos);
          }
        });
      },
      ocupacion: 0,
      capacidad: 0,
      encargado: '',
      direccion: '',
      contacto: '',
      necesidades: '',
      ninos: 0,
      bebes: 0,
      mayores: 0,
      prof: 0,
      vols: 0,
      itemsCriticos: [],
      itemsAlerta: [],
      fechaActualizada: '',
      fotos: [],
      get fotoUrl() {
        return (this.fotos && this.fotos.length > 0) ? '/api/upload?key=' + this.fotos[0] : '';
      }
    };
  });
});
