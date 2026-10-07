# Mi Caja

App personal para seguir finanzas personales y caja, pedidos, clientes, productos y proveedores de la fábrica. Stack: Next.js, TypeScript, Tailwind, Drizzle ORM y Neon PostgreSQL.

## Configuración local

1. Crear una base PostgreSQL en Neon (o compatible) y copiar `.env.example` a `.env.local`.
2. Completar `DATABASE_URL`, `AUTH_EMAIL`, `AUTH_PASSWORD_HASH` y `AUTH_SESSION_SECRET` en `.env.local`. El hash de la contraseña usa scrypt con 16 bytes de sal y 64 bytes de salida (`scrypt:SALT_HEX:HASH_HEX`). La clave de sesión debe ser aleatoria y tener al menos 32 caracteres. No compartir ese archivo ni subirlo al repositorio.
3. Instalar dependencias: `npm install`.
4. Crear la migración si cambió el esquema y aplicarla: `npm run db:generate` y `npm run db:migrate`.
5. Cargar categorías y productos de ejemplo opcionales: `npm run db:seed`.
6. Iniciar: `npm run dev` y abrir `http://localhost:3000`.

Sin `DATABASE_URL`, la interfaz muestra el estado de configuración pendiente y no presenta importes inventados. Las migraciones y el seed requieren una base configurada. Sin las tres variables de acceso, la app queda cerrada y la pantalla de login indica que falta configuración.

## Acceso y datos

La app tiene acceso para una sola persona. La contraseña nunca se guarda en el código ni en GitHub. La sesión normal dura 12 horas; la opción «Recordarme» guarda una cookie segura durante 30 días. El navegador puede recordar el correo y la contraseña con su gestor habitual. Cerrar sesión elimina la cookie. No hay recuperación por correo: para cambiar la contraseña se actualiza el hash y las sesiones anteriores dejan de ser válidas.

Los importes se guardan en `NUMERIC` y los cálculos monetarios usan Decimal. Cobros y pagos generan movimientos de caja enlazados; las deudas y los saldos se calculan desde pagos registrados para evitar duplicar importes. El PDF se guarda desde el diálogo de impresión del navegador.

## Alcance implementado

- Resumen general con separación entre ventas, cobros, cuentas por cobrar y efectivo disponible.
- Registro personal de ingresos, gastos, deudas y pagos parciales; gastos recurrentes y fondo de emergencia.
- Catálogo de productos, clientes y proveedores; gastos, ingresos de caja, deudas a proveedores y retiros personales enlazados.
- Pedidos con líneas, historial de etapas, pagos parciales y documento compartible/descargable.
- Configuración de datos del negocio, moneda, objetivos y categorías/medios de pago.

Las funciones que escriben datos necesitan conectividad a PostgreSQL para operar; las pantallas muestran estado vacío/error de configuración hasta entonces.

En Vercel, el build de producción aplica las migraciones pendientes usando `DATABASE_URL_UNPOOLED` si está disponible. El build se detiene si la base no está configurada o si una migración falla; así no se publica una versión que espere tablas inexistentes.
