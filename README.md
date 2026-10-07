# Mi Caja

App personal para seguir finanzas personales y caja, pedidos, clientes, productos y proveedores de la fábrica. Stack: Next.js, TypeScript, Tailwind, Drizzle ORM y Neon PostgreSQL.

## Configuración local

1. Crear una base PostgreSQL en Neon (o compatible) y copiar `.env.example` a `.env.local`.
2. Completar `DATABASE_URL` en `.env.local`. No compartir ese archivo ni subirlo al repositorio.
3. Instalar dependencias: `npm install`.
4. Crear la migración si cambió el esquema y aplicarla: `npm run db:generate` y `npm run db:migrate`.
5. Cargar categorías y productos de ejemplo opcionales: `npm run db:seed`.
6. Iniciar: `npm run dev` y abrir `http://localhost:3000`.

Sin `DATABASE_URL`, la interfaz muestra el estado de configuración pendiente y no presenta importes inventados. Las migraciones y el seed requieren una base configurada.

## Acceso y datos

La app no tiene login, usuarios ni correo. Si se publica, cualquiera que encuentre la URL puede acceder a las pantallas y ejecutar las operaciones disponibles, incluyendo registrar y modificar información. No cargar información sensible ni datos reales si la app está expuesta públicamente. Esta versión no se ha desplegado.

Los importes se guardan en `NUMERIC` y los cálculos monetarios usan Decimal. Cobros y pagos generan movimientos de caja enlazados; las deudas y los saldos se calculan desde pagos registrados para evitar duplicar importes. El PDF se guarda desde el diálogo de impresión del navegador.

## Alcance implementado

- Resumen general con separación entre ventas, cobros, cuentas por cobrar y efectivo disponible.
- Registro personal de ingresos, gastos, deudas y pagos parciales; gastos recurrentes y fondo de emergencia.
- Catálogo de productos, clientes y proveedores; gastos, ingresos de caja, deudas a proveedores y retiros personales enlazados.
- Pedidos con líneas, historial de etapas, pagos parciales y documento compartible/descargable.
- Configuración de datos del negocio, moneda, objetivos y categorías/medios de pago.

Las funciones que escriben datos necesitan conectividad a PostgreSQL para operar; las pantallas muestran estado vacío/error de configuración hasta entonces.
