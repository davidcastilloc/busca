import { z } from "zod";

export const PersonaSchema = z.object({
  cedula: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  nombre: z.string().min(1, "El nombre es obligatorio").trim(),
  apellido: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  edad: z.coerce.number().int().min(0).max(120).nullable().optional(),
  sexo: z.enum(["M", "F", "X"]).default("X"),
  estado: z.enum(["localizado", "herido", "fallecido", "desconocido"]).default("desconocido"),
  ubicacion_nombre: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  latitud: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitud: z.coerce.number().min(-180).max(180).nullable().optional(),
  refugio: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  contacto: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  notas: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  foto_key: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  fuente: z.string().default("web"),
  refugio_id: z.coerce.number().int().nullable().optional(),
  hospital_id: z.coerce.number().int().nullable().optional(),
  centro_acopio_id: z.coerce.number().int().nullable().optional(),
  created_by: z.number().nullable().optional()
});

export const ReporteSchema = z.object({
  tipo: z.enum(["desaparecido", "encontrado", "refugio", "necesidad"]),
  nombre_buscado: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  cedula_buscado: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  descripcion: z.string().min(10, "La descripción debe tener al menos 10 caracteres").trim(),
  reportante_nombre: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  reportante_contacto: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  ubicacion_nombre: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  latitud: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitud: z.coerce.number().min(-180).max(180).nullable().optional(),
  foto_key: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  refugio_id: z.coerce.number().int().nullable().optional(),
  hospital_id: z.coerce.number().int().nullable().optional(),
  centro_acopio_id: z.coerce.number().int().nullable().optional(),
  created_by: z.number().nullable().optional()
});

export type PersonaInput = z.infer<typeof PersonaSchema>;
export type ReporteInput = z.infer<typeof ReporteSchema>;

export const NecesidadSchema = z.object({
  categoria: z.string().min(1, "La categoría es obligatoria").trim(),
  gravedad: z.string().min(1, "La gravedad es obligatoria").trim(),
  afectados: z.coerce.number().int().nullable().optional(),
  descripcion: z.string().min(10, "La descripción debe tener al menos 10 caracteres").trim(),
  ubicacion_nombre: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  latitud: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitud: z.coerce.number().min(-180).max(180).nullable().optional(),
  telefono: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  foto_key: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  refugio_id: z.coerce.number().int().nullable().optional(),
  centro_acopio_id: z.coerce.number().int().nullable().optional(),
  hospital_id: z.coerce.number().int().nullable().optional(),
  reportante_nombre: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  reportante_contacto: z.string().trim().nullable().optional().transform(v => v === "" ? null : v),
  estado: z.enum(["abierta", "atendida", "cancelada"]).default("abierta")
});

export type NecesidadInput = z.infer<typeof NecesidadSchema>;
