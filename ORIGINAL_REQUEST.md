# Original User Request

## Initial Request — 2026-07-02T06:13:11Z

Auditar y optimizar todos los flujos de interacción, comandos y detalles técnicos del bot de Telegram en la plataforma Busca, asegurando compatibilidad con chats individuales y de grupo, y el uso correcto de Cloudflare Workers (D1, R2, Queues, CPU limits).

Working directory: /home/davidsd/Documentos/busca
Integrity mode: development

## Requirements

### R1. Auditoría de los 14 Handlers
Revisar de forma sistemática cada manejador de comandos en `src/lib/telegram/handlers/`:
1. `acopio.ts`
2. `alerta.ts`
3. `broadcast.ts`
4. `census.ts`
5. `found.ts`
6. `inventory.ts`
7. `location.ts`
8. `login.ts`
9. `media.ts`
10. `peligro.ts`
11. `report.ts`
12. `search.ts`
13. `shelter.ts`
14. `sos.ts`

### R2. Seguridad y Robustez de Workers
Asegurar que todas las peticiones a la API de Telegram y consultas a D1 estén envueltas en manejo de excepciones robusto para evitar colapsar el webhook, y optimizar las consultas usando `RETURNING *` y `db.batch()` si aplica.

### R3. Validación de Contexto de Chat (Privado vs Grupo)
Garantizar que los comandos interactivos complejos (que requieren sesión de múltiples pasos) estén bloqueados o redirigidos al chat privado en lugar de ejecutarse en chats de grupo. Verificar el comportamiento de comandos base como `/buscar` o `/necesidades` en grupos.

### R4. Generación de Reporte y Mejoras
Crear un archivo `telegram_audit_report.md` en el directorio raíz detallando el análisis, hallazgos, vulnerabilidades/bugs encontrados y aplicados, y recomendaciones de optimización.

## Acceptance Criteria

### Verificación Estructural y de Calidad
- [ ] Existe el archivo `telegram_audit_report.md` que incluye una sección detallada por cada uno de los 14 handlers.
- [ ] El reporte documenta explícitamente cómo se comporta cada comando en chat privado vs grupo.
- [ ] Se identifican y corrigen bugs potenciales de tipo (Typescript) y errores lógicos de DB en el bot.
- [ ] La compilación de TypeScript (`npx tsc --noEmit`) pasa exitosamente sin errores de tipos tras cualquier corrección realizada.
- [ ] Se crea un script de verificación en `scripts/verify-bot-audit.js` que valide que el reporte `telegram_audit_report.md` existe y menciona a cada uno de los 14 handlers, y retorna salida limpia exitosa (código 0).

## Follow-up — 2026-07-02T06:28:54Z

Reanudar auditoría. El orquestador ha sido revivido. Continúa monitoreando y reportando el progreso de la auditoría del bot de Telegram.

## Follow-up — 2026-07-02T06:38:31Z

Reanudar auditoría tras reinicio del servidor. El orquestador ha sido notificado para reanudar el trabajo de los workers. Continúa con el monitoreo regular.


