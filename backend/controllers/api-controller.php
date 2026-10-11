<?php
declare(strict_types=1);

function dispatchApi(PDO $db, string $method, string $path, array $query): never
{
    if ($method === 'GET' && $path === '/clientes') {
        $page = positiveInteger($query['page'] ?? 1, 'page');
        $pageSize = positiveInteger($query['page_size'] ?? 10, 'page_size');
        if ($pageSize > 100) {
            throw new ApiException(422, 'page_size no puede superar 100.');
        }
        $search = trim((string) ($query['q'] ?? ''));
        if (mb_strlen($search) > 120) {
            throw new ApiException(422, 'La búsqueda no puede superar 120 caracteres.');
        }
        sendJson(200, listClients($db, $page, $pageSize, $search));
    }

    if (preg_match('#^/clientes/(\d+)$#', $path, $matches)) {
        $id = positiveInteger($matches[1], 'id');
        if ($method === 'GET') {
            sendJson(200, ['data' => getClient($db, $id)]);
        }
        if ($method === 'POST' || $method === 'PUT') {
            $payload = validateClientPayload(jsonBody());
            if ($method === 'POST') {
                sendJson(201, [
                    'data' => createClient($db, $payload),
                    'message' => 'Cliente creado correctamente.',
                ]);
            }
            sendJson(200, [
                'data' => updateClient($db, $id, $payload),
                'message' => 'Cliente actualizado correctamente.',
            ]);
        }
        if ($method === 'DELETE') {
            deactivateClient($db, $id);
            sendJson(200, ['message' => 'Cliente inactivado correctamente.']);
        }
        throw new ApiException(405, 'Método HTTP no permitido para este recurso.');
    }

    if ($method === 'POST' && $path === '/clientes') {
        $payload = validateClientPayload(jsonBody());
        sendJson(201, [
            'data' => createClient($db, $payload),
            'message' => 'Cliente creado correctamente.',
        ]);
    }

    if ($method === 'GET' && $path === '/productos') {
        sendJson(200, ['data' => listProducts($db)]);
    }

    if ($method === 'POST' && $path === '/productos/actualizar-precios-masivo') {
        $result = updateProductPrices($db, jsonBody());
        sendJson(200, [
            'data' => $result,
            'message' => $result['updated_count'] === 0
                ? 'No hay productos activos que coincidan con el alcance.'
                : "Se actualizaron {$result['updated_count']} productos correctamente.",
        ]);
    }

    if ($method === 'GET' && ($path === '/cuentas-por-cobrar' || $path === '/cuentas-por-cobrar/alertas')) {
        $days = positiveInteger($query['dias'] ?? 7, 'dias', true);
        if ($days > 365) {
            throw new ApiException(422, 'dias debe estar entre 0 y 365.');
        }
        if ($path === '/cuentas-por-cobrar') {
            sendJson(200, ['data' => getReceivablesDashboard($db, $days)]);
        }
        sendJson(200, [
            'data' => getReceivablesAlerts($db, $days),
            'meta' => ['dias_anticipacion' => $days],
        ]);
    }

    throw new ApiException(404, 'Ruta API no encontrada.');
}

function positiveInteger(mixed $value, string $field, bool $allowZero = false): int
{
    $integer = filter_var($value, FILTER_VALIDATE_INT);
    if ($integer === false || ($allowZero ? $integer < 0 : $integer < 1)) {
        throw new ApiException(422, "El campo {$field} debe ser un entero válido.");
    }
    return $integer;
}
