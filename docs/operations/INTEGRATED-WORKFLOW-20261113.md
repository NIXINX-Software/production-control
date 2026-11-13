# Operations / Compras — candidato integrador (13-Nov-2026)

## Límite de producción
- Cambios confinados a `src/app/operations`, `src/app/api/operations`, `src/lib/ops-*` y documentación.
- No tocar `pc_*`, procedimientos, pantallas, PIN ni reglas de Production Control de Cocina / Conteos.
- Reutilizar `db()` de `pc-server` y el Storage Firebase existente exclusivamente en Production.
- Preview debe permanecer sin acceso a Firebase productivo (`OPS_PREVIEW_DISABLED`); modo demostración local, aislado. No introducir fixtures en Firestore.

## Folios humanos, permanentes
- Patrón `HTL-OC-20261113-000025`: empresa, proceso, fecha de creación America/Toronto, consecutivo anual por empresa y proceso.
- `src/lib/ops-folio.ts` utiliza transacción Firestore sobre `ops_folio_sequences` para unicidad concurrente. Documento técnico UUID sigue como vínculo de referencia.
- Tipos implementados: OC, CMP, REC, CON, ABN, PM, PRV, PRE. No retroasignar ni sobrescribir IDs de legacy sin migración auditada.
- Las correcciones posteriores no modifican folios.

## Recepción y conciliación
- La mercancía puede completarse tras capturar al menos una línea y desaparece del selector de pendientes; el cierre no altera Production.
- El comprobante original físico se puede dar por entregado/recibido desde Recepción y Conciliación, aunque no exista fotografía digital. Correcciones auditadas.
- Conciliación bancaria manual requiere referencia y nombre de verificador; nunca marcar automáticamente por registrar pago. Se mantiene pendiente la importación de statements.
- No confundir fecha de recepción, fecha de pago, fecha de conciliación y fecha de cierre.

## Proveedores
- Un proveedor acumula saldos de varias compras. Crédito comercial/nota NO es un pago: el saldo pendiente incluye crédito aún no liquidado.
- Abono a proveedor aplica FIFO contra facturas pendientes; asignaciones y documento de pago mantienen la trazabilidad. No crea conciliación bancaria automáticamente.
- No usar el botón de abonos por ticket en Conciliación.
- Compras anteriores capturadas con la semántica antigua de nota de crédito **no se reparan automáticamente**: requieren revisión/migración financiera controlada.

## Reporte producto maestro
- Suma cantidades base de Recepción, consolida por producto maestro sin agrupar por proveedor o empaque.
- Referencia de costo = suma de importes documentados de las líneas / cantidad base; si hay líneas sin costo, el promedio de ese producto queda NO DISPONIBLE en lugar de inventarlo.
- Consulta por periodo, empresa y límites explícitos de volumen; no prometer cobertura completa cuando se excede el límite.

## Órdenes de compra
- Propuesta manual: producto maestro, cantidad, unidad, periodo histórico, costo estimado, presupuesto solicitado editable y márgenes mínimo/máximo.
- Cuatro constancias: Compras, Inventarios, Cocina y Finanzas. Se reinician al revisar una orden. Sin login por empleado, el nombre es **declarado y no constituye prueba de identidad**.
- Propietaria: autorizar o devolver con comentarios solo con autenticación Superadmin en servidor.
- Solo `approved` se ve en Compras como vigente. Productos: pendiente, parcial, completo con cantidad real abastecida.
- Cierre manual con motivo, aunque falten productos. Cerrada sale de órdenes abiertas pero conserva faltantes; no arrastre automático.
- Una compra puede vincularse opcionalmente a una orden aprobada, pero su recepción y conciliación son hechos independientes.

## Validación antes de publicar
- ESLint, TypeScript, Next build en GitHub Actions.
- Verificar app en móvil 390x844 y desktop.
- Probar en staging segregado transacciones de saldo proveedor y cuatro aprobaciones; NO producir datos de prueba en Firebase productivo.
- La vista Preview depende del límite diario de API de Vercel, que puede bloquear nuevas publicaciones.
- Cualquier migración de folios históricos de PC debe ser read-only primero, con plan de backfill y rollback aprobado.
