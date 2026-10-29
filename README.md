# Bolsillo Gastos

Una sola pantalla en español para consultar, registrar, editar, eliminar y filtrar gastos en COP. Next.js 16, TypeScript, Tailwind 4, componentes shadcn/ui sobre Radix y Turso.

## Ejecutar

Configurar `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` y `APP_ORIGIN` en el servidor. `VERCEL_URL` admite el origen de preview de confianza. Para HTTP local, APP_ORIGIN debe ser el origen del servidor de prueba.

```sh
npm ci
npm run migrate
npm run build
npm start
```

La migración explícita es aditiva: conserva tablas y datos existentes. GET no crea ni reconstruye el esquema. Cada sesión nueva recibe una sola vez Mercado, Bus y Cuaderno, marcados como ejemplos ficticios (60.200,00 COP). No se reemplazan registros anteriores ni se reponen ejemplos eliminados.

## Contratos

- POST `/api/session`: establecer sesión anónima con cookie HttpOnly. HTTPS añade Secure, SameSite=None y Partitioned; HTTP local usa SameSite=Lax.
- GET/POST `/api/gastos`: consulta privada consistente y creación.
- GET `/api/gastos/[id]`: lectura privada autorizada.
- POST `/api/gastos/[id]/editar` y `/eliminar`: requieren versión esperada.
- Cada mutación requiere Origin autorizado y clave idempotente. Los endpoints anteriores en inglés permanecen compatibles.

`lib/db.ts` es server-only. `lib/domain.ts` reúne calendario, validación y aritmética BigInt. `lib/http.ts` encapsula las solicitudes. Los importes salen del navegador como cadenas de centavos junto con la entrada decimal original; el servidor comprueba que coinciden. El total se calcula sobre la misma lectura de registros, sin SUM de SQLite ni aritmética flotante.

El editor conserva borrador, última versión confirmada y sobres de operaciones inciertas por separado. Recuperar repite exactamente la clave y el contenido originales. Un borrador posterior no altera el sobre. Un envío nuevo requiere elección explícita. La comparación de conflictos se integra en los cuatro campos editables. Una escritura confirmada sigue confirmada si falla la consulta posterior.

La identidad editable procede de `branding.json`: IBM Plex Sans 400/500/600/700 y SVG maestro suministrado. Se conservan fuentes, licencia e iconos locales. No se usan fotos ni se añaden secciones comerciales.

## Verificación privada

`/tmp/constructor-quality/verify-interactions.cjs` exporta `verify({browser,baseUrl,evidenceDir})`; utiliza el navegador y servidor suministrados, sin iniciar otro servidor ni imponer un puerto. Sus entradas y capturas se conservan fuera de los activos públicos. La ejecución verifica CRUD, validación y foco, recarga, aislamiento, semillas, conflictos, concurrencia y pérdida de respuestas después del commit, además de geometría, movimiento real/reducido y recuperación a diferentes anchuras.

El colector se prueba localmente con sus bytes auténticos y respuestas de eventos interceptadas. Esto no demuestra aceptación en producción. Las comprobaciones reales de entrega de eventos y cookies en el iframe cross-site quedan para HTTPS registrado. Las pruebas de teléfono corto no equivalen a una inspección de teclado virtual en un dispositivo real.

No realizar commit, push ni despliegue durante esta entrega.
