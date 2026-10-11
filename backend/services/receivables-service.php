<?php
declare(strict_types=1);

function invoiceSelectSql(string $daysParameter = 'days_label'): string
{
    return "SELECT f.id, f.cliente_id, c.cedula_rif, c.nombre_razon_social,
                   f.numero_factura, f.monto_total, f.saldo_pendiente,
                   f.fecha_emision, f.fecha_vencimiento,
                   CASE WHEN f.fecha_vencimiento < CURRENT_DATE
                     THEN 'VENCIDO' ELSE f.estatus_pago END AS estatus_pago,
                   CASE
                     WHEN f.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDO'
                     WHEN f.fecha_vencimiento <= DATE_ADD(CURRENT_DATE, INTERVAL :{$daysParameter} DAY)
                       THEN 'POR_VENCER'
                     ELSE 'AL_DIA'
                   END AS alerta,
                   DATEDIFF(f.fecha_vencimiento, CURRENT_DATE) AS dias_hasta_vencimiento
            FROM facturas_venta f
            JOIN clientes c ON c.id = f.cliente_id
            WHERE f.saldo_pendiente > 0
              AND f.estatus_pago IN ('PENDIENTE', 'VENCIDO')";
}

function getReceivablesDashboard(PDO $db, int $days): array
{
    $summary = $db->query(
        "SELECT
           COUNT(CASE WHEN saldo_pendiente > 0 THEN 1 END) AS facturas_pendientes,
           COALESCE(SUM(CASE WHEN saldo_pendiente > 0 THEN saldo_pendiente ELSE 0 END), 0) AS saldo_total,
           COUNT(CASE WHEN saldo_pendiente > 0 AND fecha_vencimiento < CURRENT_DATE THEN 1 END) AS vencidas,
           COUNT(CASE WHEN saldo_pendiente > 0
             AND fecha_vencimiento BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)
             THEN 1 END) AS por_vencer
         FROM facturas_venta
         WHERE estatus_pago IN ('PENDIENTE', 'VENCIDO')",
    )->fetch();

    $sql = invoiceSelectSql('days_label') . ' ORDER BY f.fecha_vencimiento ASC, f.id ASC';
    $query = $db->prepare($sql);
    $query->bindValue(':days_label', $days, PDO::PARAM_INT);
    $query->execute();

    return ['summary' => $summary, 'invoices' => $query->fetchAll()];
}

function getReceivablesAlerts(PDO $db, int $days): array
{
    $sql = invoiceSelectSql('days_label')
        . ' AND f.fecha_vencimiento <= DATE_ADD(CURRENT_DATE, INTERVAL :days_filter DAY)'
        . ' ORDER BY f.fecha_vencimiento ASC, f.id ASC';
    $query = $db->prepare($sql);
    $query->bindValue(':days_label', $days, PDO::PARAM_INT);
    $query->bindValue(':days_filter', $days, PDO::PARAM_INT);
    $query->execute();
    return $query->fetchAll();
}
