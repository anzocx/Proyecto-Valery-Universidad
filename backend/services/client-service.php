<?php
declare(strict_types=1);

function listClients(PDO $db, int $page, int $pageSize, string $search): array
{
    $conditions = ["estado = 'ACTIVO'"];
    $params = [];
    if ($search !== '') {
        $conditions[] = '(cedula_rif LIKE :rif_search OR nombre_razon_social LIKE :name_search)';
        $params['rif_search'] = '%' . $search . '%';
        $params['name_search'] = '%' . $search . '%';
    }
    $where = implode(' AND ', $conditions);

    $count = $db->prepare("SELECT COUNT(*) FROM clientes WHERE {$where}");
    $count->execute($params);
    $total = (int) $count->fetchColumn();

    $query = $db->prepare(
        "SELECT id, cedula_rif, nombre_razon_social, telefono, direccion,
                limite_credito, dias_credito_otorgados, estado, created_at, updated_at
         FROM clientes WHERE {$where}
         ORDER BY created_at DESC, id DESC
         LIMIT :page_size OFFSET :offset",
    );
    foreach ($params as $name => $value) {
        $query->bindValue(':' . $name, $value, PDO::PARAM_STR);
    }
    $query->bindValue(':page_size', $pageSize, PDO::PARAM_INT);
    $query->bindValue(':offset', ($page - 1) * $pageSize, PDO::PARAM_INT);
    $query->execute();

    return [
        'data' => $query->fetchAll(),
        'pagination' => [
            'page' => $page,
            'page_size' => $pageSize,
            'total' => $total,
            'total_pages' => (int) ceil($total / $pageSize),
        ],
    ];
}

function getClient(PDO $db, int $id): array
{
    $query = $db->prepare(
        "SELECT id, cedula_rif, nombre_razon_social, telefono, direccion,
                limite_credito, dias_credito_otorgados, estado, created_at, updated_at
         FROM clientes WHERE id = :id AND estado = 'ACTIVO'",
    );
    $query->execute(['id' => $id]);
    $client = $query->fetch();
    if ($client === false) {
        throw new ApiException(404, 'No se encontró el cliente activo solicitado.');
    }
    return $client;
}

function createClient(PDO $db, array $data): array
{
    $query = $db->prepare(
        'INSERT INTO clientes (
           cedula_rif, nombre_razon_social, telefono, direccion,
           limite_credito, dias_credito_otorgados
         ) VALUES (
           :cedula_rif, :nombre_razon_social, :telefono, :direccion,
           :limite_credito, :dias_credito_otorgados
         )',
    );
    $query->execute($data);
    return getClient($db, (int) $db->lastInsertId());
}

function updateClient(PDO $db, int $id, array $data): array
{
    getClient($db, $id);
    $data['id'] = $id;
    $query = $db->prepare(
        "UPDATE clientes
         SET cedula_rif = :cedula_rif,
             nombre_razon_social = :nombre_razon_social,
             telefono = :telefono,
             direccion = :direccion,
             limite_credito = :limite_credito,
             dias_credito_otorgados = :dias_credito_otorgados
         WHERE id = :id AND estado = 'ACTIVO'",
    );
    $query->execute($data);
    return getClient($db, $id);
}

function deactivateClient(PDO $db, int $id): void
{
    $query = $db->prepare(
        "UPDATE clientes SET estado = 'INACTIVO'
         WHERE id = :id AND estado = 'ACTIVO'",
    );
    $query->execute(['id' => $id]);
    if ($query->rowCount() !== 1) {
        throw new ApiException(404, 'No se encontró el cliente activo solicitado.');
    }
}
