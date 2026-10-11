CREATE DATABASE IF NOT EXISTS valery_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE valery_portal;

CREATE TABLE IF NOT EXISTS clientes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cedula_rif VARCHAR(20) NOT NULL,
  nombre_razon_social VARCHAR(180) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  direccion TEXT NOT NULL,
  limite_credito DECIMAL(14, 2) NOT NULL DEFAULT 0,
  dias_credito_otorgados INT UNSIGNED NOT NULL DEFAULT 0,
  estado ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_clientes_cedula_rif UNIQUE (cedula_rif),
  CONSTRAINT chk_clientes_limite_credito CHECK (limite_credito >= 0),
  CONSTRAINT chk_clientes_dias_credito CHECK (dias_credito_otorgados <= 3650),
  INDEX idx_clientes_activos_nombre (estado, nombre_razon_social, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categorias_productos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_categorias_productos_nombre UNIQUE (nombre)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS productos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(40) NOT NULL,
  nombre VARCHAR(180) NOT NULL,
  categoria_id BIGINT UNSIGNED NOT NULL,
  precio_usd DECIMAL(14, 2) NOT NULL,
  precio_bs DECIMAL(16, 2) NOT NULL,
  tasa_cambio DECIMAL(14, 6) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_productos_codigo UNIQUE (codigo),
  CONSTRAINT chk_productos_precio_usd CHECK (precio_usd >= 0),
  CONSTRAINT chk_productos_precio_bs CHECK (precio_bs >= 0),
  CONSTRAINT chk_productos_tasa CHECK (tasa_cambio > 0),
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id)
    REFERENCES categorias_productos(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_productos_categoria_activos (categoria_id, activo, nombre)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS facturas_venta (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id BIGINT UNSIGNED NOT NULL,
  numero_factura VARCHAR(50) NOT NULL,
  monto_total DECIMAL(14, 2) NOT NULL,
  saldo_pendiente DECIMAL(14, 2) NOT NULL,
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  estatus_pago ENUM('PENDIENTE', 'PAGADO', 'VENCIDO') NOT NULL DEFAULT 'PENDIENTE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_facturas_numero UNIQUE (numero_factura),
  CONSTRAINT chk_facturas_monto CHECK (monto_total > 0),
  CONSTRAINT chk_facturas_saldo CHECK (saldo_pendiente >= 0 AND saldo_pendiente <= monto_total),
  CONSTRAINT chk_facturas_fechas CHECK (fecha_vencimiento >= fecha_emision),
  CONSTRAINT chk_facturas_estado_saldo CHECK (
    (estatus_pago = 'PAGADO' AND saldo_pendiente = 0)
    OR (estatus_pago IN ('PENDIENTE', 'VENCIDO') AND saldo_pendiente > 0)
  ),
  CONSTRAINT fk_facturas_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_facturas_cliente (cliente_id),
  INDEX idx_facturas_alertas (estatus_pago, saldo_pendiente, fecha_vencimiento)
) ENGINE=InnoDB;

INSERT INTO categorias_productos (nombre)
VALUES ('General'), ('Alimentos'), ('Servicios')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);
