API PHP para el portal Valery
=============================

Requisitos
----------
- PHP 8.1 o superior.
- Extensiones PHP PDO, pdo_mysql y mbstring habilitadas.
- MySQL 8.0.16 o superior.

Instalación
-----------
1. Ejecuta database/schema.sql en MySQL Workbench o en la consola de MySQL.
   El script crea valery_portal y sus tablas; no inserta clientes, productos ni facturas.
2. Copia .env.example como .env en esta carpeta y configura DB_HOST, DB_PORT,
   DB_NAME, DB_USER y DB_PASSWORD.
3. En PowerShell, desde esta carpeta, inicia la API:

   php -S localhost:8000 router.php

4. Sirve la carpeta "valery pagina web" con un servidor estático como
   VS Code Live Server. Ajusta CORS_ORIGIN en .env para que coincida exactamente
   con el origen servido, por ejemplo http://127.0.0.1:5500. Reinicia PHP.
   La página usa http://localhost:8000/api por defecto. Para otra dirección,
   abre index.html?api=http://localhost:8000/api.

La ruta GET /api/health verifica la conexión a MySQL.

Rutas disponibles
-----------------
GET    /api/clientes?page=1&page_size=10&q=
GET    /api/clientes/{id}
POST   /api/clientes
PUT    /api/clientes/{id}
DELETE /api/clientes/{id}  (inactiva lógicamente el cliente)
GET    /api/productos
POST   /api/productos/actualizar-precios-masivo
GET    /api/cuentas-por-cobrar?dias=7
GET    /api/cuentas-por-cobrar/alertas?dias=7

DTO y errores se devuelven como JSON. El CORS de desarrollo permite un solo
origen configurado; no abras el archivo con file://, porque ese origen no
coincide con el servidor local autorizado.
