# Reglas para Gemini

1. SIEMPRE ASEGURARSE DE CORRER LAS MIGRACIONES EN PRODUCCIÓN DESPUÉS DE CORRERLAS EN LOCAL.
   - Usar: `npx wrangler d1 migrations apply busca-db --remote`

## Filosofía "Lazy Engineer"
- Escribir menos: Solo código estrictamente necesario.
- Reutilizar: Usar herramientas y librerías existentes. No reinventar la rueda.
- Simple: Soluciones simples y directas (KISS).
- Ahora: Construir solo lo que se necesita hoy (YAGNI).
- Automatizar tareas repetitivas.

## Buenas Prácticas
- Funciones pequeñas. Una sola responsabilidad.
- Nombres claros que expliquen intención.
- Comentar el "por qué", no el "qué".
- Manejo robusto de errores.
