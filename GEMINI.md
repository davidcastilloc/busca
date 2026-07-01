# Contexto y Buenas Prácticas del Proyecto (Busca)

## 📌 Contexto del Proyecto
Este proyecto es una plataforma para el registro y búsqueda de personas desaparecidas, localizadas, albergues, centros de acopio y necesidades en situaciones de emergencia.

### Tech Stack
- **Framework principal**: [Astro](https://astro.build/) (v7.0.3) con renderizado híbrido/SSR.
- **Entorno de ejecución**: [Cloudflare Workers & Pages](https://workers.cloudflare.com/) (usando el adaptador `@astrojs/cloudflare`).
- **Base de datos**: Cloudflare D1 (SQLite administrado) bound a `DB`.
- **Almacenamiento de archivos**: Cloudflare R2 bound a `FOTOS_BUCKET`.
- **Cola y procesamiento asíncrono**: Cloudflare Queues bound a `CENSO_QUEUE` y `PUSH_QUEUE`.
- **Inteligencia Artificial y Vectorización**: Workers AI bound a `AI`, y Vectorize bound a `VECTOR_INDEX`.
- **Interactividad del Cliente**: [Alpine.js](https://alpinejs.dev/) (`@astrojs/alpinejs`) para reactividad de UI fluida y ligera.
- **Estilos**: Tailwind CSS (v4) + DaisyUI (v5).

---

## 🛠️ Reglas Críticas del Proyecto

1. **Migraciones D1 en Producción**
   - Siempre que ejecutes migraciones locales (`npx wrangler d1 migrations apply busca-db --local`), debes aplicarlas inmediatamente en producción:
     ```sh
     npx wrangler d1 migrations apply busca-db --remote
     ```

2. **Tipado Estricto de Bindings**
   - No usar `env as any`. Todos los bindings de Cloudflare (D1, KV, R2, Queues, Vectorize, AI) deben estar tipados correctamente en `src/env.d.ts` bajo la interfaz `Env` y utilizados mediante `Astro.locals.runtime.env` o según corresponda.

3. **Interactividad del Frontend (Alpine.js)**
   - No escribir scripts JS imperativos de manipulación del DOM ad-hoc. Toda interactividad reactiva (búsquedas locales, filtros, modales, formularios reactivos) debe hacerse declarativamente mediante Alpine.js (`x-data`, `x-model`, `x-show`, `x-on`).
   - **Transición de Páginas (Astro View Transitions)**: Para evitar condiciones de carrera ("not defined" en el swap del DOM), NO usar scripts inline (`is:inline`) ni locales del componente para registrar controladores complejos de Alpine.
     - **Componentes Complejos**: Extraerlos a archivos dedicados en `src/scripts/` (ej: `src/scripts/form-reporte-alpine.ts`) e importarlos globalmente en el script principal de `src/layouts/Layout.astro` para registrarlos en `Alpine.data` durante el inicio.
     - **Reactividad Simple**: Definirla directamente de forma declarativa inline en el atributo del HTML (ej: `x-data="{ query: '', filtro: 'todos' }"`).


4. **Operaciones de Base de Datos Eficientes**
   - Minimizar los roundtrips de red a D1. Para procesamiento masivo de datos (como el escáner de IA de censos/listas), utilizar **`db.batch()`** para agrupar consultas e inserciones en el menor número posible de llamadas.

5. **Filosofía "Lazy Engineer" & Ponytail Style**
   - **Escribir menos**: Solo código estrictamente necesario (YAGNI).
   - **Reutilizar**: Usar utilidades y helper functions definidos en `src/lib/` (ej. `db.ts`, `ai.ts`, `validators.ts`).
   - **Simplicidad**: Soluciones simples, desacopladas y directas (KISS). Eliminar código y variables redundantes.

---

## 📚 Skills Disponibles (.agents/skills)
Cuando trabajes en tareas específicas, consulta las guías de cada skill instalada:
- **accessibility**: Auditoría y mejoras de accesibilidad web siguiendo WCAG 2.2. [accessibility](file:///home/davidsd/Documentos/busca/.agents/skills/accessibility/SKILL.md)
- **agents-sdk**: Agentes de IA en Cloudflare Workers con Agents SDK. [agents-sdk](file:///home/davidsd/Documentos/busca/.agents/skills/agents-sdk/SKILL.md)
- **cloudflare**: Skill completo de la plataforma Cloudflare (D1, KV, R2, AI). [cloudflare](file:///home/davidsd/Documentos/busca/.agents/skills/cloudflare/SKILL.md)
- **cloudflare-deploy**: Despliegue en Cloudflare (Workers, Pages). [cloudflare-deploy](file:///home/davidsd/Documentos/busca/.agents/skills/cloudflare-deploy/SKILL.md)
- **frontend-design**: Diseño UI y maquetación interactiva premium sin Tailwind innecesario o genérico. [frontend-design](file:///home/davidsd/Documentos/busca/.agents/skills/frontend-design/SKILL.md)
- **nodejs-backend-patterns**: Patrones estructurados de Express y APIs en Node. [nodejs-backend-patterns](file:///home/davidsd/Documentos/busca/.agents/skills/nodejs-backend-patterns/SKILL.md)
- **nodejs-best-practices**: Principios de desarrollo de Node, async y seguridad. [nodejs-best-practices](file:///home/davidsd/Documentos/busca/.agents/skills/nodejs-best-practices/SKILL.md)
- **seo**: Optimización de visibilidad y metadatos estructurados. [seo](file:///home/davidsd/Documentos/busca/.agents/skills/seo/SKILL.md)
- **typescript-advanced-types**: Tipado avanzado y tipos genéricos reutilizables. [typescript-advanced-types](file:///home/davidsd/Documentos/busca/.agents/skills/typescript-advanced-types/SKILL.md)
- **web-perf**: Auditoría y optimización de Core Web Vitals y LCP. [web-perf](file:///home/davidsd/Documentos/busca/.agents/skills/web-perf/SKILL.md)
- **workers-best-practices**: Patrones eficientes y anti-patrones en Cloudflare Workers. [workers-best-practices](file:///home/davidsd/Documentos/busca/.agents/skills/workers-best-practices/SKILL.md)
- **wrangler**: CLI wrangler y comandos de Cloudflare. [wrangler](file:///home/davidsd/Documentos/busca/.agents/skills/wrangler/SKILL.md)
