<?php
declare(strict_types=1);

function listProducts(PDO $db): array
{
    $products = $db->query(
        'SELECT p.id, p.codigo, p.nombre, p.categoria_id,
                c.nombre AS categoria, p.precio_usd, p.precio_bs,
                p.tasa_cambio, p.updated_at
         FROM productos p
         JOIN categorias_productos c ON c.id = p.categoria_id
         WHERE p.activo = 1
         ORDER BY c.nombre, p.nombre',
    )->fetchAll();
    $categories = $db->query(
        'SELECT id, nombre FROM categorias_productos
         WHERE activa = 1 ORDER BY nombre',
    )->fetchAll();
    return ['products' => $products, 'categories' => $categories];
}

function updateProductPrices(PDO $db, array $payload): array
{
    $mode = $payload['mode'] ?? null;
    $value = $payload['value'] ?? null;
    $categoryId = $payload['category_id'] ?? null;
    if (!in_array($mode, ['exchange_rate', 'percentage'], true)
        || !is_numeric($value)
        || !is_finite((float) $value)
        || (float) $value <= 0
        || (float) $value > ($mode === 'percentage' ? 1000 : 99999999.999999)) {
        throw new ApiException(422, 'El método y el valor de actualización no son válidos.', [
            ['field' => 'value', 'message' => 'Usa una tasa positiva o un incremento entre 0 y 1000%.'],
        ]);
    }
    if ($categoryId !== null && filter_var($categoryId, FILTER_VALIDATE_INT) === false) {
        throw new ApiException(422, 'La categoría debe ser un identificador entero positivo.');
    }

    $db->beginTransaction();
    try {
        if ($categoryId !== null) {
            $category = $db->prepare(
                'SELECT id FROM categorias_productos WHERE id = :id AND activa = 1',
            );
            $category->execute(['id' => (int) $categoryId]);
            if ($category->fetchColumn() === false) {
                throw new ApiException(422, 'La categoría seleccionada no existe o está inactiva.');
            }
        }

        $where = 'activo = 1';
        $parameters = ['value' => (string) $value];
        if ($categoryId !== null) {
            $where .= ' AND categoria_id = :category_id';
            $parameters['category_id'] = (int) $categoryId;
        }
        if ($mode === 'exchange_rate') {
            $sql = "UPDATE productos
                    SET tasa_cambio = :value,
                        precio_bs = ROUND(precio_usd * :value_for_price, 2)
                    WHERE {$where}";
            $parameters['value_for_price'] = (string) $value;
        } else {
            $sql = "UPDATE productos
                    SET precio_usd = ROUND(precio_usd * (1 + :percentage_usd / 100), 2),
                        precio_bs = ROUND(precio_bs * (1 + :percentage_bs / 100), 2)
                    WHERE {$where}";
            $parameters['percentage_usd'] = (string) $value;
            $parameters['percentage_bs'] = (string) $value;
        }
        $statement = $db->prepare($sql);
        $statement->execute($parameters);
        $updated = $statement->rowCount();
        $db->commit();

        return [
            'updated_count' => $updated,
            'mode' => $mode,
            'value' => (float) $value,
            'category_id' => $categoryId === null ? null : (int) $categoryId,
        ];
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }
}
