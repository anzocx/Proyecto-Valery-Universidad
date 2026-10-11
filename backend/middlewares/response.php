<?php
declare(strict_types=1);

function sendJson(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function jsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    try {
        $payload = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new ApiException(400, 'El cuerpo de la petición debe ser JSON válido.');
    }
    if (!is_array($payload) || array_is_list($payload)) {
        throw new ApiException(400, 'El cuerpo de la petición debe ser un objeto JSON.');
    }
    return $payload;
}

function requireFields(array $data, array $fields): void
{
    $errors = [];
    foreach ($fields as $field) {
        if (!array_key_exists($field, $data)
            || (is_string($data[$field]) && trim($data[$field]) === '')) {
            $errors[] = ['field' => $field, 'message' => 'Este campo es obligatorio.'];
        }
    }
    if ($errors !== []) {
        throw new ApiException(422, 'Completa los campos requeridos.', $errors);
    }
}

function validateClientPayload(array $data): array
{
    $required = [
        'cedula_rif',
        'nombre_razon_social',
        'telefono',
        'direccion',
        'limite_credito',
        'dias_credito_otorgados',
    ];
    requireFields($data, $required);
    $errors = [];

    $rif = strtoupper(trim((string) $data['cedula_rif']));
    if (!preg_match('/^[VEJPG]-?\d{5,10}$/', $rif)) {
        $errors[] = ['field' => 'cedula_rif', 'message' => 'Ingresa una cédula o RIF válido, por ejemplo V-12345678.'];
    }
    $name = trim((string) $data['nombre_razon_social']);
    if (mb_strlen($name) < 2 || mb_strlen($name) > 180) {
        $errors[] = ['field' => 'nombre_razon_social', 'message' => 'El nombre debe tener entre 2 y 180 caracteres.'];
    }
    $phone = trim((string) $data['telefono']);
    if (!preg_match('/^\+?[\d\s().-]{7,25}$/', $phone)) {
        $errors[] = ['field' => 'telefono', 'message' => 'Ingresa un teléfono válido.'];
    }
    $address = trim((string) $data['direccion']);
    if (mb_strlen($address) < 3 || mb_strlen($address) > 2000) {
        $errors[] = ['field' => 'direccion', 'message' => 'La dirección debe tener entre 3 y 2000 caracteres.'];
    }
    if (!is_numeric($data['limite_credito']) || (float) $data['limite_credito'] < 0) {
        $errors[] = ['field' => 'limite_credito', 'message' => 'El límite de crédito debe ser un número no negativo.'];
    }
    if (filter_var($data['dias_credito_otorgados'], FILTER_VALIDATE_INT) === false
        || (int) $data['dias_credito_otorgados'] < 0
        || (int) $data['dias_credito_otorgados'] > 3650) {
        $errors[] = ['field' => 'dias_credito_otorgados', 'message' => 'Indica un número entero de días entre 0 y 3650.'];
    }
    if ($errors !== []) {
        throw new ApiException(422, 'La información del cliente no es válida.', $errors);
    }

    return [
        'cedula_rif' => $rif,
        'nombre_razon_social' => $name,
        'telefono' => $phone,
        'direccion' => $address,
        'limite_credito' => number_format((float) $data['limite_credito'], 2, '.', ''),
        'dias_credito_otorgados' => (int) $data['dias_credito_otorgados'],
    ];
}

final class ApiException extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly array $details = [],
    ) {
        parent::__construct($message);
    }
}

function errorHandler(Throwable $error): never
{
    if ($error instanceof ApiException) {
        sendJson($error->status, [
            'error' => [
                'message' => $error->getMessage(),
                ...($error->details !== [] ? ['details' => $error->details] : []),
            ],
        ]);
    }

    if ($error instanceof PDOException) {
        $driverCode = (int) ($error->errorInfo[1] ?? 0);
        if ($driverCode === 1062) {
            sendJson(409, ['error' => ['message' => 'Ya existe un registro con esa cédula, código o número de factura.']]);
        }
        if ($driverCode === 1451 || $driverCode === 1452) {
            sendJson(422, ['error' => ['message' => 'La referencia indicada no existe o no puede modificarse.']]);
        }
        if ($driverCode === 1264 || $driverCode === 3819) {
            sendJson(422, ['error' => ['message' => 'El cambio excede los límites permitidos por los datos almacenados.']]);
        }
        error_log((string) $error);
        sendJson(500, ['error' => ['message' => 'No se pudo completar la operación con la base de datos.']]);
    }

    error_log((string) $error);
    sendJson(500, ['error' => ['message' => 'Ocurrió un error interno del servidor.']]);
}
