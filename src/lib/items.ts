export interface InventarioItem {
  id: string;
  nombre: string;
}

export interface CategoriaInventario {
  nombre: string;
  items: InventarioItem[];
}

export const CATEGORIAS_INVENTARIO: CategoriaInventario[] = [
  {
    nombre: "Alimentos y Agua",
    items: [
      { id: "agua_potable", nombre: "Agua potable embotellada" },
      { id: "arroz_harina", nombre: "Arroz / Harina de maíz" },
      { id: "pasta_granos", nombre: "Pasta / Granos (caraotas, lentejas)" },
      { id: "alimentos_enlatados", nombre: "Alimentos enlatados (atún, sardina, granos)" },
      { id: "aceite_comestible", nombre: "Aceite comestible" },
      { id: "leche_polvo", nombre: "Leche en polvo" },
      { id: "azucar_sal", nombre: "Azúcar / Sal" },
      { id: "comida_lista", nombre: "Comida no perecedera lista para consumir" }
    ]
  },
  {
    nombre: "Higiene y Aseo",
    items: [
      { id: "jabon_champu", nombre: "Jabón de baño / Champú" },
      { id: "crema_cepillo", nombre: "Crema dental / Cepillo de dientes" },
      { id: "papel_higienico", nombre: "Papel higiénico" },
      { id: "toallas_sanitarias", nombre: "Toallas sanitarias / Tampón" },
      { id: "desodorante", nombre: "Desodorante (unisex)" },
      { id: "toallitas_humedas", nombre: "Toallitas húmedas" },
      { id: "detergente_jabon", nombre: "Detergente para ropa / Jabón de platos" },
      { id: "cloro_desinfectante", nombre: "Cloro / Desinfectante" },
      { id: "bolsas_basura", nombre: "Bolsas para basura de alta resistencia" }
    ]
  },
  {
    nombre: "Salud y Auxilio",
    items: [
      { id: "alcohol_oxigenada", nombre: "Alcohol / Agua oxigenada" },
      { id: "gasas_vendas", nombre: "Gasas / Vendas / Adhesivos médicos" },
      { id: "analgesicos", nombre: "Analgésicos (Paracetamol, Ibuprofeno)" },
      { id: "antialergicos", nombre: "Antialérgicos (Loratadina)" },
      { id: "medicos_cronicos", nombre: "Medicamentos crónicos (Presión, Diabetes)" },
      { id: "antibioticos", nombre: "Antibióticos de amplio espectro" },
      { id: "suero_hidratacion", nombre: "Suero de hidratación oral" },
      { id: "tapabocas_guantes", nombre: "Tapabocas / Guantes desechables" },
      { id: "termometros", nombre: "Termómetros" }
    ]
  },
  {
    nombre: "Infantil y Lactancia",
    items: [
      { id: "panales_bebe", nombre: "Pañales desechables para bebés" },
      { id: "leche_formula", nombre: "Leche de fórmula infantil" },
      { id: "biberones", nombre: "Teteros / Biberones limpios" },
      { id: "papillas_compotas", nombre: "Papillas / Compotas" },
      { id: "ropa_bebe", nombre: "Ropa de bebé" },
      { id: "champu_jabon_bebe", nombre: "Champú y jabón especial para bebé" },
      { id: "pomadas_antipanalitis", nombre: "Pomadas antipañalitis" },
      { id: "corrales_cunas", nombre: "Cunas de viaje / Corrales plegables" }
    ]
  },
  {
    nombre: "Logística y Cobijo",
    items: [
      { id: "colchonetas_esterillas", nombre: "Colchonetas / Esterillas" },
      { id: "mantas_cobijas", nombre: "Mantas / Cobijas / Sábanas" },
      { id: "linternas_velas", nombre: "Linternas con pilas / Velas" },
      { id: "baterias_powerbanks", nombre: "Baterías portátiles (Powerbanks)" },
      { id: "repelente_mosquitos", nombre: "Repelente de mosquitos" },
      { id: "herramientas_basicas", nombre: "Kit de herramientas básicas" },
      { id: "fosforos_encendedores", nombre: "Fósforos / Encendedores" },
      { id: "toldos_carpas", nombre: "Toldos / Carpas / Lonas plásticas" },
      { id: "ropa_abrigo", nombre: "Ropa abrigada / Impermeables" }
    ]
  }
];

// Obtener lista plana de todos los items
export const TODOS_LOS_ITEMS = CATEGORIAS_INVENTARIO.flatMap(c => c.items);
export const TOTAL_ITEMS = TODOS_LOS_ITEMS.length; // Debe ser 43
