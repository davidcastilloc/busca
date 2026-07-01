export interface InventarioItem {
  id: string;
  nombre: string;
  unidad_medida?: string;
  es_critico?: boolean;
}

export interface CategoriaInventario {
  nombre: string;
  items: InventarioItem[];
}

export const CATEGORIAS_INVENTARIO: CategoriaInventario[] = [
  {
    nombre: "Agua",
    items: [
      { id: "agua_potable", nombre: "Agua potable embotellada", unidad_medida: "Litros", es_critico: true },
      { id: "botellones_agua", nombre: "Botellones (Para cocina o hidratación masiva)", unidad_medida: "20 Litros", es_critico: true },
      { id: "pastillas_potabilizadoras", nombre: "Pastillas Potabilizadoras", unidad_medida: "Unidades", es_critico: true },
      { id: "cloro_potabilizacion", nombre: "Cloro Líquido / Pastillas de Cloro (Para desinfección)", unidad_medida: "Litros / Unidades", es_critico: true },
      { id: "tanques_envases", nombre: "Tanques / Envases Vacíos", unidad_medida: "Unidades", es_critico: false }
    ]
  },
  {
    nombre: "Alimentos",
    items: [
      { id: "alimentos_enlatados", nombre: "Alimentos enlatados (atún, sardina, granos)", unidad_medida: "Unidades", es_critico: false },
      { id: "arroz_harina", nombre: "Carbohidratos Secos (arroz, pasta, harina de maíz)", unidad_medida: "Kg", es_critico: false },
      { id: "pasta_granos", nombre: "Granos y Legumbres (caraotas, lentejas, arvejas)", unidad_medida: "Kg", es_critico: false },
      { id: "leche_polvo", nombre: "Proteína en Polvo / Larga Duración (Leche en polvo, embutidos)", unidad_medida: "Kg", es_critico: false },
      { id: "comida_lista", nombre: "Comida Lista para Consumo (Galletas, barras, frutos secos)", unidad_medida: "Unidades", es_critico: false },
      { id: "aceite_comestible", nombre: "Aceite comestible", unidad_medida: "Litros", es_critico: false },
      { id: "azucar_sal", nombre: "Azúcar / Sal", unidad_medida: "Kg", es_critico: false },
      { id: "papillas_adultos_mayores", nombre: "Papillas y comida líquida para adultos mayores", unidad_medida: "Unidades", es_critico: false }
    ]
  },
  {
    nombre: "Higiene y Aseo",
    items: [
      { id: "jabon_champu", nombre: "Jabón de baño / Champú", unidad_medida: "Unidades" },
      { id: "crema_cepillo", nombre: "Crema dental / Cepillo de dientes", unidad_medida: "Unidades" },
      { id: "papel_higienico", nombre: "Papel higiénico", unidad_medida: "Rollos" },
      { id: "toallas_sanitarias", nombre: "Toallas sanitarias / Tampón", unidad_medida: "Paquetes" },
      { id: "desodorante", nombre: "Desodorante (unisex)", unidad_medida: "Unidades" },
      { id: "toallitas_humedas", nombre: "Toallitas húmedas", unidad_medida: "Paquetes" },
      { id: "detergente_jabon", nombre: "Detergente para ropa / Jabón de platos", unidad_medida: "Kg / Litros" },
      { id: "cloro_desinfectante", nombre: "Desinfectante / Limpiador de pisos", unidad_medida: "Litros" },
      { id: "bolsas_basura", nombre: "Bolsas para basura de alta resistencia", unidad_medida: "Paquetes" }
    ]
  },
  {
    nombre: "Salud y Auxilio",
    items: [
      { id: "alcohol_oxigenada", nombre: "Alcohol / Agua oxigenada", unidad_medida: "Litros" },
      { id: "gasas_vendas", nombre: "Gasas / Vendas / Adhesivos médicos", unidad_medida: "Unidades" },
      { id: "analgesicos", nombre: "Analgésicos (Paracetamol, Ibuprofeno)", unidad_medida: "Cajas", es_critico: true },
      { id: "antialergicos", nombre: "Antialérgicos (Loratadina)", unidad_medida: "Cajas" },
      { id: "medicos_cronicos", nombre: "Medicamentos crónicos (Presión, Diabetes)", unidad_medida: "Cajas", es_critico: true },
      { id: "antibioticos", nombre: "Antibióticos de amplio espectro", unidad_medida: "Cajas", es_critico: true },
      { id: "suero_hidratacion", nombre: "Suero de hidratación oral", unidad_medida: "Litros / Sobres", es_critico: true },
      { id: "tapabocas_guantes", nombre: "Tapabocas / Guantes desechables", unidad_medida: "Cajas" },
      { id: "termometros", nombre: "Termómetros", unidad_medida: "Unidades" },
      { id: "agujas_inyectadoras", nombre: "Agujas / Inyectadoras", unidad_medida: "Unidades", es_critico: true }
    ]
  },
  {
    nombre: "Infantil y Lactancia",
    items: [
      { id: "panales_bebe", nombre: "Pañales desechables para bebés", unidad_medida: "Paquetes" },
      { id: "leche_formula", nombre: "Leche de fórmula infantil", unidad_medida: "Latas", es_critico: true },
      { id: "biberones", nombre: "Teteros / Biberones limpios", unidad_medida: "Unidades" },
      { id: "papillas_compotas", nombre: "Papillas / Compotas", unidad_medida: "Unidades" },
      { id: "ropa_bebe", nombre: "Ropa de bebé", unidad_medida: "Piezas" },
      { id: "champu_jabon_bebe", nombre: "Champú y jabón especial para bebé", unidad_medida: "Unidades" },
      { id: "pomadas_antipanalitis", nombre: "Pomadas antipañalitis", unidad_medida: "Unidades" },
      { id: "corrales_cunas", nombre: "Cunas de viaje / Corrales plegables", unidad_medida: "Unidades" }
    ]
  },
  {
    nombre: "Logística y Cobijo",
    items: [
      { id: "colchonetas_esterillas", nombre: "Colchonetas / Esterillas", unidad_medida: "Unidades" },
      { id: "mantas_cobijas", nombre: "Mantas / Cobijas / Sábanas", unidad_medida: "Unidades" },
      { id: "linternas_velas", nombre: "Linternas con pilas / Velas", unidad_medida: "Unidades" },
      { id: "baterias_powerbanks", nombre: "Baterías portátiles (Powerbanks)", unidad_medida: "Unidades" },
      { id: "repelente_mosquitos", nombre: "Repelente de mosquitos", unidad_medida: "Unidades" },
      { id: "herramientas_basicas", nombre: "Kit de herramientas básicas", unidad_medida: "Unidades" },
      { id: "fosforos_encendedores", nombre: "Fósforos / Encendedores", unidad_medida: "Unidades" },
      { id: "toldos_carpas", nombre: "Toldos / Carpas / Lonas plásticas", unidad_medida: "Unidades" },
      { id: "ropa_abrigo", nombre: "Ropa abrigada / Impermeables", unidad_medida: "Piezas" },
      { id: "brazaletes_identificadores", nombre: "Brazaletes identificadores", unidad_medida: "Unidades" },
      { id: "pulseras_gps", nombre: "Pulseras GPS", unidad_medida: "Unidades" },
      { id: "papeleria", nombre: "Papelería (bolígrafos, cuadernos, marcadores)", unidad_medida: "Unidades" },
      { id: "silbatos_pitos", nombre: "Silbatos y pitos", unidad_medida: "Unidades" }
    ]
  },
  {
    nombre: "Mascotas",
    items: [
      { id: "comida_mascotas", nombre: "Comida para mascotas (Perros/Gatos)", unidad_medida: "Kg" },
      { id: "medicinas_mascotas", nombre: "Medicinas / Insumos veterinarios básicos", unidad_medida: "Unidades", es_critico: true }
    ]
  },
  {
    nombre: "Servicio Voluntario",
    items: [
      { id: "entretenimiento_infantil", nombre: "Entretenimiento infantil", unidad_medida: "Horas/Personas" },
      { id: "actividades_culturales", nombre: "Actividades culturales", unidad_medida: "Horas/Personas" },
      { id: "baile_musica", nombre: "Baile y música", unidad_medida: "Horas/Personas" },
      { id: "veterinario", nombre: "Atención Veterinaria", unidad_medida: "Horas/Personas" }
    ]
  }
];

// Obtener lista plana de todos los items
export const TODOS_LOS_ITEMS = CATEGORIAS_INVENTARIO.flatMap(c => c.items);
export const TOTAL_ITEMS = TODOS_LOS_ITEMS.length;
