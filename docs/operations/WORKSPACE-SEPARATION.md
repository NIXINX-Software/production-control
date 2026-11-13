# Workspace separation — Production Control

## Alcance y principio de separación

Este PR introduce **tres accesos funcionales** que comparten despliegue y autenticación Firebase, pero no comparten navegación ni capacidad de escritura:

| URL | Usuario | Funciones | Rol `portal_users.role` |
|---|---|---|---|
| `/` | Cocina | Conteos, producción y catálogo de cocina | `kitchen` |
| `/compras` | Comprador | Alta de proveedores, compra, pagos iniciales, comprobante y acuse de entrega | `ops_buyer` |
| `/control-operativo` | Responsable de recepción y administración | Recepción de mercancía, acuse del recibo, catálogos, conciliación por periodo, KPIs y abonos | `ops_backoffice` |
| `/operations` | Superadmin | Todas las pestañas operativas, Showroom y datos/DWH; navegación transversal a las otras tres URLs | `admin` |

El sistema concede acceso únicamente después de verificar Firebase ID token revocable, `portal_users.active === true`, rol autorizado y sucursal permitida. El rol de Superadmin además exige correo en `SUPER_ADMIN_EMAILS`.

Se requiere **una sola función por cuenta operativa**. No asignar comprador y receptor a un mismo perfil. El Superadmin es la única excepción deliberada.

## Ejemplo de perfil de usuario (Firestore)

Documento `portal_users/{firebaseAuthUid}`, provisionado por un Superadmin a través de un proceso administrativo seguro:

```json
{
  "active": true,
  "role": "ops_buyer",
  "opsSiteIds": ["htl"]
}
```

Para cocina usar `"role": "kitchen"` y `"pcSiteIds": ["htl"]`.
Para recepción/conciliación usar `"role": "ops_backoffice"` y `"opsSiteIds": ["htl"]`.
Para Superadmin usar `"role": "admin"`, `"active": true` y correo autorizado; el rol administrador concede todas las sucursales. **No codificar cuentas o credenciales en el repositorio.**

## Acciones y controles del servidor

- `ops_buyer`: `supplier.add`, `purchase.add`, `document.status=delivered` y subida de fotografía del recibo. No puede agregar recepciones, verificar mercancía, registrar pagos posteriores, conciliar ni exportar DWH.
- `ops_backoffice`: `supplier.add`, `product.add`, `presentation.add`, `receipt.add`, `goods.verify`, `payment.add`, `document.status=received|rejected`. No puede crear compras ni subir comprobantes en nombre del comprador.
- `kitchen`: acceso únicamente a las API `/api/pc/*` con función operativa y `pcSiteIds` válidos. Sin acceso a `/api/operations*`.
- `admin`: las funciones anteriores más exportaciones DWH, Showroom y navegación cruzada.
- `viewer`: mantiene sus rutas de consulta histórica de PC como usuario **sin permisos de escritura**. Nunca accede al módulo de compras o a operaciones de cocina.
- Las API validan el token y el rol por petición. Ocultar botones **no** constituye autorización.

## Checklist de puesta en marcha (bloqueante)

- [ ] Crear usuarios Firebase Authentication de cocina, comprador y backoffice para cada sucursal.
- [ ] Registrar `portal_users/{uid}` activos con **un rol**, y `pcSiteIds` o `opsSiteIds` según corresponda.
- [ ] Verificar los permisos mediante cuentas de prueba reales (cada cuenta debe recibir HTTP 403 ante llamadas de la otra área, incluyendo `POST` manual).
- [ ] Cocina: iniciar sesión, realizar conteo, producción, consulta y corrección autorizada; probar logout/login y sucursal no asignada.
- [ ] Compras: crear compra y entregar comprobante; comprobar que `receipt.add` y `goods.verify` responden 403.
- [ ] Backoffice: registrar recepción y verificar acuse; comprobar que `purchase.add` y carga de evidencia responden 403.
- [ ] Superadmin: navegación a las tres URLs, todas las sucursales, DWH y Showroom; rechazar usuario con correo de allowlist pero rol no administrativo.
- [ ] Revalidar sesión revocada, rol desactivado, cuenta sin sucursal, usuario sin login, usuario `viewer` y acceso por URL directa.
- [ ] Verificar que la configuración Firestore/Storage y `OPS_PRODUCTION_ENABLED` se habiliten **solo** tras validar entorno y reglas.
- [ ] Ejecutar ESLint, `next build`, pruebas funcionales en Preview y smoke tests de los módulos existentes.
- [ ] Programar corte operacional y dar credenciales al personal de cocina **antes** de fusionar. El sistema anterior permitía producción sin login; el nuevo no.

**Estado**: PR de implementación en borrador. El despliegue productivo aún no está autorizado ni ejecutado. Las cuentas, la matriz de pruebas funcionales y el entorno productivo requieren validación antes de fusionar.
