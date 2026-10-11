<?php
declare(strict_types=1);

require_once __DIR__ . '/middlewares/response.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/services/client-service.php';
require_once __DIR__ . '/services/product-service.php';
require_once __DIR__ . '/services/receivables-service.php';
require_once __DIR__ . '/controllers/api-controller.php';

set_exception_handler('errorHandler');

$allowedOrigin = getenv('CORS_ORIGIN') ?: 'http://localhost:5173';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && $origin === $allowedOrigin) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if (!str_starts_with($requestPath, '/api/')) {
    throw new ApiException(404, 'Ruta no encontrada.');
}

$apiPath = substr($requestPath, 4);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method === 'GET' && $apiPath === '/health') {
    database()->query('SELECT 1');
    sendJson(200, ['status' => 'ok']);
}

dispatchApi(database(), $method, $apiPath, $_GET);
