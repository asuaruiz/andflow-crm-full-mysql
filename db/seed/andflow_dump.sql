-- MySQL dump 10.13  Distrib 9.4.0, for macos15.4 (arm64)
--
-- Host: 127.0.0.1    Database: andflow
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `accounts`
--

DROP TABLE IF EXISTS `accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(20) DEFAULT NULL,
  `name` varchar(120) NOT NULL,
  `type` enum('asset','liability','equity','income','expense') NOT NULL,
  `active` tinyint DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts`
--

LOCK TABLES `accounts` WRITE;
/*!40000 ALTER TABLE `accounts` DISABLE KEYS */;
INSERT INTO `accounts` VALUES (1,'1101','Caja y Bancos','asset',1),(2,'1102','Cuentas por cobrar (Clientes)','asset',1),(3,'1201','Inventario','asset',1),(4,'1202','IVA Crédito Fiscal','asset',1),(5,'2101','Cuentas por pagar (Proveedores)','liability',1),(6,'2401','IVA Débito Fiscal','liability',1),(7,'4101','Ventas','income',1),(8,'5101','Costo de ventas','expense',1);
/*!40000 ALTER TABLE `accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `accounts_tenants`
--

DROP TABLE IF EXISTS `accounts_tenants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts_tenants` (
  `account_id` int NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`account_id`,`tenant_id`),
  KEY `ix_at_tenant` (`tenant_id`),
  CONSTRAINT `fk_at_acc` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_at_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts_tenants`
--

LOCK TABLES `accounts_tenants` WRITE;
/*!40000 ALTER TABLE `accounts_tenants` DISABLE KEYS */;
/*!40000 ALTER TABLE `accounts_tenants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customer_addresses`
--

DROP TABLE IF EXISTS `customer_addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_addresses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `external_id` bigint unsigned DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `name` varchar(191) DEFAULT NULL,
  `company` varchar(191) DEFAULT NULL,
  `address1` varchar(191) DEFAULT NULL,
  `address2` varchar(191) DEFAULT NULL,
  `city` varchar(120) DEFAULT NULL,
  `province` varchar(120) DEFAULT NULL,
  `province_code` varchar(10) DEFAULT NULL,
  `country` varchar(120) DEFAULT NULL,
  `country_code` varchar(10) DEFAULT NULL,
  `zip` varchar(20) DEFAULT NULL,
  `phone` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_customer` (`customer_id`),
  KEY `fk_addr_tenant` (`tenant_id`),
  CONSTRAINT `fk_addr_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_addr_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=74 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_addresses`
--

LOCK TABLES `customer_addresses` WRITE;
/*!40000 ALTER TABLE `customer_addresses` DISABLE KEYS */;
/*!40000 ALTER TABLE `customer_addresses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customers`
--

DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `source` varchar(32) NOT NULL DEFAULT 'shopify',
  `external_id` bigint unsigned DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `first_name` varchar(120) DEFAULT NULL,
  `last_name` varchar(120) DEFAULT NULL,
  `phone` varchar(64) DEFAULT NULL,
  `state` varchar(50) DEFAULT NULL,
  `accepts_marketing` tinyint(1) NOT NULL DEFAULT '0',
  `tags` text,
  `orders_count` int DEFAULT NULL,
  `total_spent` decimal(14,2) DEFAULT NULL,
  `created_at_shopify` datetime DEFAULT NULL,
  `updated_at_shopify` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `rut` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_tenant_ext` (`tenant_id`,`external_id`),
  KEY `ix_tenant_email` (`tenant_id`,`email`),
  KEY `ix_customers_tenant_rut` (`tenant_id`,`rut`),
  CONSTRAINT `fk_customers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=87 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customers`
--

LOCK TABLES `customers` WRITE;
/*!40000 ALTER TABLE `customers` DISABLE KEYS */;
/*!40000 ALTER TABLE `customers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_moves`
--

DROP TABLE IF EXISTS `inventory_moves`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_moves` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `sku` varchar(80) NOT NULL,
  `move_date` datetime NOT NULL,
  `type` enum('IN','OUT','ADJ_IN','ADJ_OUT','OPENING','RETURN_IN','RETURN_OUT') NOT NULL,
  `qty` decimal(14,3) NOT NULL,
  `unit_cost` decimal(14,4) DEFAULT NULL,
  `value` decimal(14,2) DEFAULT NULL,
  `warehouse_id` bigint DEFAULT NULL,
  `ref_type` varchar(32) DEFAULT NULL,
  `ref_id` varchar(64) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_tenant_date` (`tenant_id`,`move_date`),
  KEY `ix_tenant_sku` (`tenant_id`),
  KEY `ix_moves_tenant_sku_date` (`tenant_id`,`sku`,`move_date`),
  CONSTRAINT `fk_invmoves_product` FOREIGN KEY (`tenant_id`, `sku`) REFERENCES `products_master` (`tenant_id`, `sku`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_moves`
--

LOCK TABLES `inventory_moves` WRITE;
/*!40000 ALTER TABLE `inventory_moves` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventory_moves` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_session_lines`
--

DROP TABLE IF EXISTS `inventory_session_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_session_lines` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `session_id` bigint unsigned NOT NULL,
  `sku` varchar(80) NOT NULL,
  `ean` varchar(32) DEFAULT NULL,
  `counted_qty` decimal(18,3) NOT NULL DEFAULT '0.000',
  `unit_cost` decimal(18,6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sku_session` (`session_id`,`sku`),
  UNIQUE KEY `ux_session_sku` (`session_id`,`sku`),
  CONSTRAINT `fk_line_session` FOREIGN KEY (`session_id`) REFERENCES `inventory_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_session_lines`
--

LOCK TABLES `inventory_session_lines` WRITE;
/*!40000 ALTER TABLE `inventory_session_lines` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventory_session_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_sessions`
--

DROP TABLE IF EXISTS `inventory_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_sessions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `type` enum('count','in','out') NOT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `reference` varchar(128) DEFAULT NULL,
  `location_code` varchar(64) DEFAULT NULL,
  `created_by` bigint unsigned NOT NULL,
  `started_at` datetime NOT NULL,
  `closed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_sess_tenant` (`tenant_id`),
  KEY `ix_sess_type` (`type`),
  KEY `ix_sess_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_sessions`
--

LOCK TABLES `inventory_sessions` WRITE;
/*!40000 ALTER TABLE `inventory_sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventory_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_stock`
--

DROP TABLE IF EXISTS `inventory_stock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_stock` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `sku` varchar(80) NOT NULL,
  `onhand_qty` decimal(14,3) NOT NULL DEFAULT '0.000',
  `avg_cost` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `last_in_cost` decimal(14,4) DEFAULT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_tenant_sku` (`tenant_id`,`sku`),
  CONSTRAINT `fk_invstock_product` FOREIGN KEY (`tenant_id`, `sku`) REFERENCES `products_master` (`tenant_id`, `sku`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_stock`
--

LOCK TABLES `inventory_stock` WRITE;
/*!40000 ALTER TABLE `inventory_stock` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventory_stock` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `journal_entries`
--

DROP TABLE IF EXISTS `journal_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `journal_entries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `entry_date` date NOT NULL,
  `memo` varchar(255) DEFAULT NULL,
  `source` varchar(32) DEFAULT NULL,
  `source_id` varchar(64) DEFAULT NULL,
  `locked` tinyint DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `journal_entries`
--

LOCK TABLES `journal_entries` WRITE;
/*!40000 ALTER TABLE `journal_entries` DISABLE KEYS */;
INSERT INTO `journal_entries` VALUES (1,'2025-08-31','Asiento de prueba tenant 1 (no debe aparecer en otros)',NULL,NULL,0,'2025-08-31 18:30:28'),(2,'2025-08-31','pago proveedor',NULL,NULL,0,'2025-08-31 21:21:54');
/*!40000 ALTER TABLE `journal_entries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `journal_entries_tenants`
--

DROP TABLE IF EXISTS `journal_entries_tenants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `journal_entries_tenants` (
  `entry_id` bigint NOT NULL,
  `tenant_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`entry_id`,`tenant_id`),
  KEY `ix_jet_tenant` (`tenant_id`),
  CONSTRAINT `fk_jet_entry` FOREIGN KEY (`entry_id`) REFERENCES `journal_entries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_jet_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `journal_entries_tenants`
--

LOCK TABLES `journal_entries_tenants` WRITE;
/*!40000 ALTER TABLE `journal_entries_tenants` DISABLE KEYS */;
/*!40000 ALTER TABLE `journal_entries_tenants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `journal_lines`
--

DROP TABLE IF EXISTS `journal_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `journal_lines` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `entry_id` bigint NOT NULL,
  `account_id` int NOT NULL,
  `debit` decimal(14,2) NOT NULL DEFAULT '0.00',
  `credit` decimal(14,2) NOT NULL DEFAULT '0.00',
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_lines_entry` (`entry_id`),
  KEY `ix_lines_account` (`account_id`),
  CONSTRAINT `journal_lines_ibfk_1` FOREIGN KEY (`entry_id`) REFERENCES `journal_entries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `journal_lines_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `journal_lines`
--

LOCK TABLES `journal_lines` WRITE;
/*!40000 ALTER TABLE `journal_lines` DISABLE KEYS */;
INSERT INTO `journal_lines` VALUES (1,1,1,10000.00,0.00,'Prueba Debe'),(2,1,7,0.00,10000.00,'Prueba Haber'),(3,2,1,100000.00,0.00,'pago proveedor'),(4,2,5,0.00,100000.00,'pago proveedor');
/*!40000 ALTER TABLE `journal_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `modules`
--

DROP TABLE IF EXISTS `modules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `modules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(100) NOT NULL,
  `label` varchar(150) NOT NULL,
  `path` varchar(191) NOT NULL,
  `icon` varchar(80) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '100',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `key` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=946 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `modules`
--

LOCK TABLES `modules` WRITE;
/*!40000 ALTER TABLE `modules` DISABLE KEYS */;
INSERT INTO `modules` VALUES (1,'kpis','KPIs','/kpis','BarChart3',10,1,'2025-08-30 01:56:58','2025-09-01 01:28:39'),(2,'inventario','Inventario','/inventario/maestra','Boxes',20,1,'2025-08-30 01:56:58','2025-09-01 01:28:39'),(3,'ventas','Ventas (CRM)','/ventas','ShoppingCart',30,1,'2025-08-30 01:56:58','2025-09-01 01:28:39'),(4,'clientes','Clientes','/clientes','Users',40,1,'2025-08-30 01:56:58','2025-09-01 01:28:39'),(5,'config','Configuración','/config','Settings',90,1,'2025-08-30 01:56:58','2025-09-01 01:28:39');
/*!40000 ALTER TABLE `modules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `permissions`
--

DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(150) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  UNIQUE KEY `ux_permissions_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=2703 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permissions`
--

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
INSERT INTO `permissions` VALUES (1,'platform.tenants.manage','Crear/editar tenants','2025-08-30 01:56:58','2025-09-01 01:28:39'),(2,'platform.users.manage','Gestionar usuarios plataforma','2025-08-30 01:56:58','2025-09-01 01:28:39'),(3,'platform.modules.manage','Gestionar módulos globales','2025-08-30 01:56:58','2025-09-01 01:28:39'),(4,'tenant.settings.manage','Configurar ajustes del tenant','2025-08-30 01:56:58','2025-09-01 01:28:39'),(5,'tenant.users.manage','Gestionar usuarios del tenant','2025-08-30 01:56:58','2025-09-01 01:28:39'),(6,'module.kpis.view','Ver KPIs','2025-08-30 01:56:58','2025-09-01 01:28:39'),(7,'module.inventario.view','Ver inventario','2025-08-30 01:56:58','2025-09-01 01:28:39'),(8,'module.inventario.edit','Editar inventario','2025-08-30 01:56:58','2025-09-01 01:28:39'),(9,'module.ventas.view','Ver ventas','2025-08-30 01:56:58','2025-09-01 01:28:39'),(10,'module.ventas.create','Crear ventas','2025-08-30 01:56:58','2025-09-01 01:28:39'),(11,'module.clientes.view','Ver clientes','2025-08-30 01:56:58','2025-09-01 01:28:39'),(12,'module.clientes.edit','Editar clientes','2025-08-30 01:56:58','2025-09-01 01:28:39'),(13,'module.config.view','Ver configuración','2025-08-30 01:56:58','2025-09-01 01:28:39'),(183,'platform.tenants.view','Ver tenants','2025-08-30 06:55:09','2025-09-01 01:28:39'),(184,'platform.support.read','Acceso de soporte sólo lectura a tenants','2025-08-30 06:55:09','2025-08-30 06:59:22'),(185,'platform.billing.view','Ver info de facturación del SaaS','2025-08-30 06:55:09','2025-08-30 06:59:22'),(186,'module.dashboard.view','Ver dashboard','2025-08-30 06:55:09','2025-08-30 06:59:22'),(187,'inventory.products.create','Crear productos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(188,'inventory.products.update','Editar productos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(189,'inventory.products.delete','Eliminar productos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(190,'inventory.products.export','Exportar productos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(191,'inventory.movements.create','Crear movimientos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(192,'inventory.movements.approve','Aprobar movimientos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(193,'inventory.movements.delete','Eliminar movimientos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(194,'inventory.alerts.view','Ver alertas','2025-08-30 06:55:09','2025-08-30 06:59:22'),(195,'inventory.alerts.manage','Configurar alertas','2025-08-30 06:55:09','2025-08-30 06:59:22'),(196,'sales.orders.create','Crear pedidos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(197,'sales.orders.update','Editar pedidos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(198,'sales.orders.delete','Eliminar pedidos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(199,'sales.orders.export','Exportar pedidos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(200,'clients.create','Crear clientes','2025-08-30 06:55:09','2025-08-30 06:59:22'),(201,'clients.update','Editar clientes','2025-08-30 06:55:09','2025-08-30 06:59:22'),(202,'clients.delete','Eliminar clientes','2025-08-30 06:55:09','2025-08-30 06:59:22'),(203,'clients.export','Exportar clientes','2025-08-30 06:55:09','2025-08-30 06:59:22'),(204,'shopify.orders.view','Ver órdenes Shopify','2025-08-30 06:55:09','2025-08-30 06:59:22'),(205,'shopify.sync','Sincronizar Shopify','2025-08-30 06:55:09','2025-08-30 06:59:22'),(206,'shopify.config.manage','Configurar Shopify','2025-08-30 06:55:09','2025-08-30 06:59:22'),(207,'accounting.journal.view','Ver libro diario','2025-08-30 06:55:09','2025-08-30 06:59:22'),(208,'accounting.journal.post','Registrar asientos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(209,'accounting.journal.delete','Eliminar asientos','2025-08-30 06:55:09','2025-08-30 06:59:22'),(210,'accounting.lock','Bloquear periodo contable','2025-08-30 06:55:09','2025-08-30 06:59:22'),(211,'accounting.chart.manage','Gestionar plan de cuentas','2025-08-30 06:55:09','2025-08-30 06:59:22'),(212,'tenant.roles.manage','Gestionar roles del tenant','2025-08-30 06:55:09','2025-08-30 06:59:22'),(2574,'inventory.sessions.view',NULL,'2025-09-01 03:24:52','2025-09-01 03:24:52'),(2575,'inventory.sessions.manage',NULL,'2025-09-01 03:24:52','2025-09-01 03:24:52'),(2576,'inventory.sessions.commit',NULL,'2025-09-01 03:24:52','2025-09-01 03:24:52');
/*!40000 ALTER TABLE `permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products_master`
--

DROP TABLE IF EXISTS `products_master`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products_master` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `sku` varchar(80) NOT NULL,
  `sku_proveedor` varchar(120) DEFAULT NULL,
  `ean` varchar(64) DEFAULT NULL,
  `nombre` varchar(255) NOT NULL,
  `marca` varchar(120) DEFAULT NULL,
  `especie` varchar(120) DEFAULT NULL,
  `categoria` varchar(120) DEFAULT NULL,
  `subcategoria` varchar(120) DEFAULT NULL,
  `desc_breve` varchar(512) DEFAULT NULL,
  `desc_larga` text,
  `imagenes` json DEFAULT NULL,
  `proveedor` varchar(150) DEFAULT NULL,
  `disponible` tinyint(1) NOT NULL DEFAULT '1',
  `uc` int DEFAULT NULL,
  `dif` int DEFAULT NULL,
  `costo_neto` decimal(14,2) DEFAULT NULL,
  `costo_con_iva` decimal(14,2) DEFAULT NULL,
  `psp` decimal(14,2) DEFAULT NULL,
  `precio_referencia` decimal(14,2) DEFAULT NULL,
  `pvp` decimal(14,2) DEFAULT NULL,
  `pvp_sin_iva` decimal(14,2) DEFAULT NULL,
  `margen_bruto_pct` decimal(9,4) DEFAULT NULL,
  `margen_con_iva_pct` decimal(9,4) DEFAULT NULL,
  `margen_bruto_clp` decimal(14,2) DEFAULT NULL,
  `precio_min_estr_sin_iva` decimal(14,2) DEFAULT NULL,
  `precio_min_estr_con_iva` decimal(14,2) DEFAULT NULL,
  `tipo_venta` varchar(64) DEFAULT NULL,
  `precio_descuento` decimal(14,2) DEFAULT NULL,
  `margen_total` decimal(14,2) DEFAULT NULL,
  `venta_total` decimal(14,2) DEFAULT NULL,
  `margen_general` decimal(9,4) DEFAULT NULL,
  `peso_kg` decimal(10,3) DEFAULT NULL,
  `unidad_peso` varchar(16) DEFAULT NULL,
  `dimensiones` varchar(64) DEFAULT NULL,
  `fragil` tinyint(1) NOT NULL DEFAULT '0',
  `estacionalidad` varchar(64) DEFAULT NULL,
  `recurrente` tinyint(1) NOT NULL DEFAULT '0',
  `etiquetas_shopify` text,
  `activo_en_tienda` tinyint(1) NOT NULL DEFAULT '1',
  `segmentacion_ticket` varchar(64) DEFAULT NULL,
  `nivel_rotacion` varchar(64) DEFAULT NULL,
  `tipo_producto_consumo` varchar(64) DEFAULT NULL,
  `observacion` text,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `is_placeholder` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_tenant_sku` (`tenant_id`,`sku`),
  KEY `ix_tenant` (`tenant_id`),
  KEY `ix_ean` (`ean`),
  KEY `ix_tenant_sku_name` (`tenant_id`,`sku`,`nombre`(100)),
  CONSTRAINT `fk_products_master_t` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products_master`
--

LOCK TABLES `products_master` WRITE;
/*!40000 ALTER TABLE `products_master` DISABLE KEYS */;
/*!40000 ALTER TABLE `products_master` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `role_permissions`
--

DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_permissions` (
  `role_id` bigint unsigned NOT NULL,
  `permission_id` bigint unsigned NOT NULL,
  `granted_at` datetime NOT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  UNIQUE KEY `ux_role_perm` (`role_id`,`permission_id`),
  KEY `fk_rp_perm` (`permission_id`),
  CONSTRAINT `fk_rp_perm` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role_permissions`
--

LOCK TABLES `role_permissions` WRITE;
/*!40000 ALTER TABLE `role_permissions` DISABLE KEYS */;
INSERT INTO `role_permissions` VALUES (15,1,'2025-08-30 07:19:02'),(15,2,'2025-08-30 07:19:02'),(15,3,'2025-08-30 07:19:02'),(15,4,'2025-08-30 07:19:02'),(15,5,'2025-08-30 07:19:02'),(15,6,'2025-08-30 07:19:02'),(15,7,'2025-08-30 07:19:02'),(15,8,'2025-08-30 07:19:02'),(15,9,'2025-08-30 07:19:02'),(15,10,'2025-08-30 07:19:02'),(15,11,'2025-08-30 07:19:02'),(15,12,'2025-08-30 07:19:02'),(15,13,'2025-08-30 07:19:02'),(15,183,'2025-08-30 07:19:02'),(15,184,'2025-08-30 07:19:02'),(15,185,'2025-08-30 07:19:02'),(15,186,'2025-08-30 07:19:02'),(15,187,'2025-08-30 07:19:02'),(15,188,'2025-08-30 07:19:02'),(15,189,'2025-08-30 07:19:02'),(15,190,'2025-08-30 07:19:02'),(15,191,'2025-08-30 07:19:02'),(15,192,'2025-08-30 07:19:02'),(15,193,'2025-08-30 07:19:02'),(15,194,'2025-08-30 07:19:02'),(15,195,'2025-08-30 07:19:02'),(15,196,'2025-08-30 07:19:02'),(15,197,'2025-08-30 07:19:02'),(15,198,'2025-08-30 07:19:02'),(15,199,'2025-08-30 07:19:02'),(15,200,'2025-08-30 07:19:02'),(15,201,'2025-08-30 07:19:02'),(15,202,'2025-08-30 07:19:02'),(15,203,'2025-08-30 07:19:02'),(15,204,'2025-08-30 07:19:02'),(15,205,'2025-08-30 07:19:02'),(15,206,'2025-08-30 07:19:02'),(15,207,'2025-08-30 07:19:02'),(15,208,'2025-08-30 07:19:02'),(15,209,'2025-08-30 07:19:02'),(15,210,'2025-08-30 07:19:02'),(15,211,'2025-08-30 07:19:02'),(15,212,'2025-08-30 07:19:02'),(15,2574,'2025-08-31 23:25:44'),(15,2575,'2025-08-31 23:25:44'),(15,2576,'2025-08-31 23:25:44'),(16,183,'2025-08-30 07:19:02'),(16,184,'2025-08-30 07:19:02'),(17,183,'2025-08-30 07:19:02'),(17,185,'2025-08-30 07:19:02'),(18,4,'2025-08-30 07:19:02'),(18,5,'2025-08-30 07:19:02'),(18,6,'2025-08-30 07:19:02'),(18,7,'2025-08-30 07:19:02'),(18,8,'2025-08-30 07:19:02'),(18,9,'2025-08-30 07:19:02'),(18,10,'2025-08-30 07:19:02'),(18,11,'2025-08-30 07:19:02'),(18,12,'2025-08-30 07:19:02'),(18,13,'2025-08-30 07:19:02'),(18,186,'2025-08-30 07:19:02'),(18,187,'2025-08-30 07:19:02'),(18,188,'2025-08-30 07:19:02'),(18,189,'2025-08-30 07:19:02'),(18,190,'2025-08-30 07:19:02'),(18,191,'2025-08-30 07:19:02'),(18,192,'2025-08-30 07:19:02'),(18,193,'2025-08-30 07:19:02'),(18,194,'2025-08-30 07:19:02'),(18,195,'2025-08-30 07:19:02'),(18,196,'2025-08-30 07:19:02'),(18,197,'2025-08-30 07:19:02'),(18,198,'2025-08-30 07:19:02'),(18,199,'2025-08-30 07:19:02'),(18,200,'2025-08-30 07:19:02'),(18,201,'2025-08-30 07:19:02'),(18,202,'2025-08-30 07:19:02'),(18,203,'2025-08-30 07:19:02'),(18,204,'2025-08-30 07:19:02'),(18,205,'2025-08-30 07:19:02'),(18,206,'2025-08-30 07:19:02'),(18,207,'2025-08-30 07:19:02'),(18,208,'2025-08-30 07:19:02'),(18,209,'2025-08-30 07:19:02'),(18,210,'2025-08-30 07:19:02'),(18,211,'2025-08-30 07:19:02'),(18,212,'2025-08-30 07:19:02'),(18,2574,'0000-00-00 00:00:00'),(18,2575,'0000-00-00 00:00:00'),(18,2576,'0000-00-00 00:00:00'),(19,4,'2025-08-30 07:19:02'),(19,5,'2025-08-30 07:19:02'),(19,6,'2025-08-30 07:19:02'),(19,7,'2025-08-30 07:19:02'),(19,8,'2025-08-30 07:19:02'),(19,9,'2025-08-30 07:19:02'),(19,10,'2025-08-30 07:19:02'),(19,11,'2025-08-30 07:19:02'),(19,12,'2025-08-30 07:19:02'),(19,13,'2025-08-30 07:19:02'),(19,186,'2025-08-30 07:19:02'),(19,187,'2025-08-30 07:19:02'),(19,188,'2025-08-30 07:19:02'),(19,189,'2025-08-30 07:19:02'),(19,190,'2025-08-30 07:19:02'),(19,191,'2025-08-30 07:19:02'),(19,192,'2025-08-30 07:19:02'),(19,193,'2025-08-30 07:19:02'),(19,194,'2025-08-30 07:19:02'),(19,195,'2025-08-30 07:19:02'),(19,196,'2025-08-30 07:19:02'),(19,197,'2025-08-30 07:19:02'),(19,198,'2025-08-30 07:19:02'),(19,199,'2025-08-30 07:19:02'),(19,200,'2025-08-30 07:19:02'),(19,201,'2025-08-30 07:19:02'),(19,202,'2025-08-30 07:19:02'),(19,203,'2025-08-30 07:19:02'),(19,204,'2025-08-30 07:19:02'),(19,205,'2025-08-30 07:19:02'),(19,206,'2025-08-30 07:19:02'),(19,207,'2025-08-30 07:19:02'),(19,208,'2025-08-30 07:19:02'),(19,209,'2025-08-30 07:19:02'),(19,211,'2025-08-30 07:19:02'),(19,212,'2025-08-30 07:19:02'),(20,6,'2025-08-30 07:19:02'),(20,7,'2025-08-30 07:19:02'),(20,9,'2025-08-30 07:19:02'),(20,186,'2025-08-30 07:19:02'),(20,187,'2025-08-30 07:19:02'),(20,188,'2025-08-30 07:19:02'),(20,191,'2025-08-30 07:19:02'),(20,192,'2025-08-30 07:19:02'),(20,194,'2025-08-30 07:19:02'),(20,196,'2025-08-30 07:19:02'),(20,197,'2025-08-30 07:19:02'),(20,199,'2025-08-30 07:19:02'),(20,204,'2025-08-30 07:19:02'),(20,205,'2025-08-30 07:19:02'),(20,2574,'0000-00-00 00:00:00'),(20,2575,'0000-00-00 00:00:00'),(20,2576,'0000-00-00 00:00:00'),(21,6,'2025-08-30 07:19:02'),(21,9,'2025-08-30 07:19:02'),(21,11,'2025-08-30 07:19:02'),(21,186,'2025-08-30 07:19:02'),(21,196,'2025-08-30 07:19:02'),(21,197,'2025-08-30 07:19:02'),(21,200,'2025-08-30 07:19:02'),(21,201,'2025-08-30 07:19:02'),(22,7,'2025-08-30 07:19:02'),(22,186,'2025-08-30 07:19:02'),(22,187,'2025-08-30 07:19:02'),(22,188,'2025-08-30 07:19:02'),(22,191,'2025-08-30 07:19:02'),(22,194,'2025-08-30 07:19:02'),(23,6,'2025-08-30 07:19:02'),(23,186,'2025-08-30 07:19:02'),(23,207,'2025-08-30 07:19:02'),(23,208,'2025-08-30 07:19:02'),(23,209,'2025-08-30 07:19:02'),(23,211,'2025-08-30 07:19:02'),(24,2574,'0000-00-00 00:00:00');
/*!40000 ALTER TABLE `role_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `tenant_id` bigint unsigned DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `scope` enum('platform','tenant') NOT NULL DEFAULT 'tenant',
  `description` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_roles_code_scope_tnorm` (`code`,`scope`,(ifnull(`tenant_id`,0))),
  UNIQUE KEY `ux_roles_tenant_name` (`tenant_id`,`name`),
  CONSTRAINT `fk_roles_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1727 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (15,'PLATFORM_SUPERADMIN',NULL,'Platform SuperAdmin','platform','Acceso total plataforma','2025-08-30 06:55:15','2025-09-01 01:28:39'),(16,'PLATFORM_SUPPORT',NULL,'Platform Support','platform','Soporte solo lectura','2025-08-30 06:55:15','2025-09-01 01:28:39'),(17,'PLATFORM_BILLING',NULL,'Platform Billing','platform','Facturación del SaaS','2025-08-30 06:55:15','2025-09-01 01:28:39'),(18,'TENANT_OWNER',NULL,'Owner','tenant','Dueño del tenant','2025-08-30 06:55:15','2025-09-01 01:28:39'),(19,'TENANT_ADMIN',NULL,'Admin','tenant','Admin del tenant','2025-08-30 06:55:15','2025-09-01 01:28:39'),(20,'TENANT_MANAGER',NULL,'Manager','tenant','Operaciones','2025-08-30 06:55:15','2025-09-01 01:28:39'),(21,'TENANT_SALES',NULL,'Sales Rep','tenant','Ventas','2025-08-30 06:55:15','2025-09-01 01:28:39'),(22,'TENANT_INVENTORY',NULL,'Inventory Clerk','tenant','Inventario','2025-08-30 06:55:15','2025-09-01 01:28:39'),(23,'TENANT_ACCOUNTANT',NULL,'Accountant','tenant','Contabilidad','2025-08-30 06:55:15','2025-09-01 01:28:39'),(24,'TENANT_VIEWER',NULL,'Viewer','tenant','Solo lectura','2025-08-30 06:55:15','2025-09-01 01:28:39');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_order_lines`
--

DROP TABLE IF EXISTS `sales_order_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales_order_lines` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `order_id` bigint unsigned NOT NULL,
  `origin` enum('shopify','crm') NOT NULL,
  `external_id` bigint unsigned DEFAULT NULL,
  `product_id` bigint unsigned DEFAULT NULL,
  `sku` varchar(120) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `quantity` int NOT NULL,
  `price` decimal(14,2) NOT NULL,
  `taxable` tinyint(1) NOT NULL DEFAULT '1',
  `tax_rate` decimal(7,4) DEFAULT NULL,
  `line_total` decimal(14,2) NOT NULL,
  `raw_json` json DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_order` (`order_id`),
  KEY `ix_tenant` (`tenant_id`),
  CONSTRAINT `fk_sol_order` FOREIGN KEY (`order_id`) REFERENCES `sales_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sol_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_order_lines`
--

LOCK TABLES `sales_order_lines` WRITE;
/*!40000 ALTER TABLE `sales_order_lines` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_order_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_orders`
--

DROP TABLE IF EXISTS `sales_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `origin` enum('shopify','crm') NOT NULL,
  `external_id` bigint unsigned DEFAULT NULL,
  `number` varchar(64) NOT NULL,
  `currency` char(3) DEFAULT 'CLP',
  `financial_status` varchar(40) DEFAULT NULL,
  `fulfillment_status` varchar(40) DEFAULT NULL,
  `subtotal_price` decimal(14,2) DEFAULT NULL,
  `total_tax` decimal(14,2) DEFAULT NULL,
  `total_price` decimal(14,2) DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `contact_email` varchar(191) DEFAULT NULL,
  `customer_id` bigint unsigned DEFAULT NULL,
  `customer_first_name` varchar(120) DEFAULT NULL,
  `customer_last_name` varchar(120) DEFAULT NULL,
  `created_at_shop` datetime DEFAULT NULL,
  `updated_at_shop` datetime DEFAULT NULL,
  `raw_json` json DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `sii_status` varchar(30) DEFAULT NULL,
  `sii_trackid` varchar(40) DEFAULT NULL,
  `ship_to_name` varchar(160) DEFAULT NULL,
  `ship_to_company` varchar(160) DEFAULT NULL,
  `ship_to_address1` varchar(255) DEFAULT NULL,
  `ship_to_address2` varchar(255) DEFAULT NULL,
  `ship_to_city` varchar(120) DEFAULT NULL,
  `ship_to_province` varchar(120) DEFAULT NULL,
  `ship_to_zip` varchar(40) DEFAULT NULL,
  `ship_to_country` varchar(80) DEFAULT NULL,
  `ship_to_phone` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_tenant_number` (`tenant_id`,`number`),
  UNIQUE KEY `ux_tenant_origin_ext` (`tenant_id`,`origin`,`external_id`),
  KEY `ix_tenant_created` (`tenant_id`,`created_at_shop`),
  KEY `fk_so_customer` (`customer_id`),
  CONSTRAINT `fk_so_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_so_t` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_orders`
--

LOCK TABLES `sales_orders` WRITE;
/*!40000 ALTER TABLE `sales_orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `token` char(64) NOT NULL,
  `selected_tenant_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  `last_seen_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_agent` varchar(255) DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `fk_sessions_user` (`user_id`),
  KEY `fk_sessions_tenant` (`selected_tenant_id`),
  CONSTRAINT `fk_sessions_tenant` FOREIGN KEY (`selected_tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
INSERT INTO `sessions` VALUES (1,1,'423d1390f65c4f01be1018b61c81063ffa24ceae5418910067e98e8635d7b4d4',NULL,'2025-08-30 02:31:27','2025-09-06 02:31:27','2025-08-30 06:31:26',NULL,NULL),(2,1,'e5fff0d1379598ae76e241811af9c4e44f06182d104322d41c74366076ba51f9',NULL,'2025-08-30 02:35:31','2025-09-06 02:35:31','2025-08-30 03:39:21',NULL,NULL),(6,7,'06c6f26e7e227a38ba8f20a0f788ef82af2126cd9d56581f8572423c00335c66',NULL,'2025-08-31 02:27:57','2025-09-07 03:27:57','2025-08-31 02:28:56',NULL,NULL),(15,1,'bdfeec8f3124f2a0cc0f627f5803ad443fb44bcafbe7fcbec93379a46e078105',NULL,'2025-08-31 03:42:12','2025-09-07 04:42:12','2025-08-31 04:14:23',NULL,NULL),(16,1,'ef005b94b4daae0ddda09b05276f17c0acf6071981087fb8f8bb932eb0608ae7',NULL,'2025-08-31 04:14:44','2025-09-07 05:14:44','2025-08-31 13:58:52',NULL,NULL),(18,7,'618ea702d7b595924b00bbbc525bbbd5e8bff310b52fbd0a59059abcdfae932a',NULL,'2025-08-31 14:30:47','2025-09-07 15:30:47','2025-08-31 14:31:48',NULL,NULL),(21,7,'173d17fc63032ba8cd7ee1a4de8c5767af7223e108cabc6ffaad13dbfcadeb0f',NULL,'2025-08-31 14:34:57','2025-09-07 15:34:57','2025-08-31 14:34:57',NULL,NULL),(23,9,'6c8ba6efd201d3f277f7870c16d526e3c5ebac62838d4d2bf964a6c1482a914d',NULL,'2025-08-31 14:45:44','2025-09-07 15:45:44','2025-08-31 14:58:03',NULL,NULL),(31,7,'cd3fe2980f5956fc8fef08a2827b2bb8d5d2a505ebd6f908d1ca18d0164ffa4b',NULL,'2025-08-31 17:29:42','2025-09-07 18:29:42','2025-08-31 19:36:14',NULL,NULL),(43,7,'f68481eac2c4b46591031d52a6007e5edf7b1ab9a17d77037b4a5cb0e0b68179',NULL,'2025-08-31 22:16:26','2025-09-07 23:16:26','2025-08-31 23:16:03',NULL,NULL),(44,7,'d17ed16940ed964533310f69c22fd5e5879b3ed97d5f1afc45ba612a2723c03e',NULL,'2025-08-31 23:16:18','2025-09-08 00:16:18','2025-09-01 01:21:45',NULL,NULL),(46,7,'c0e7007a655fddeb5acf7d702598a850ea3370ba78f569a6188cbf3be96aef66',NULL,'2025-09-01 01:37:01','2025-09-08 02:37:01','2025-09-01 01:44:02',NULL,NULL),(47,7,'6984c0d0abb9c3fefc57c075531e50483b47d7384a869f87efcfb296a7f23795',NULL,'2025-09-01 01:42:34','2025-09-08 02:42:34','2025-09-01 01:42:34',NULL,NULL),(51,10,'caecd53f7c9a644a57481c8f1f65b3a824258eb1e19b077e87670af5ef499670',13,'2025-09-01 01:47:46','2025-09-08 02:47:46','2025-09-01 01:48:34',NULL,NULL),(52,1,'6970883b0da8da7c61b58bae683b0830da7116aea7057915f46eb00e659c22c6',NULL,'2025-09-01 01:48:40','2025-09-08 02:48:40','2025-09-01 04:09:43',NULL,NULL);
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shopify_config`
--

DROP TABLE IF EXISTS `shopify_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shopify_config` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `domain` varchar(191) NOT NULL,
  `token_json` json NOT NULL,
  `saved_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `tenant_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shopify_config_tenant` (`tenant_id`),
  CONSTRAINT `fk_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shopify_config`
--

LOCK TABLES `shopify_config` WRITE;
/*!40000 ALTER TABLE `shopify_config` DISABLE KEYS */;
/*!40000 ALTER TABLE `shopify_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shopify_order_lines`
--

DROP TABLE IF EXISTS `shopify_order_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shopify_order_lines` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `order_id` bigint NOT NULL,
  `line_id` bigint DEFAULT NULL,
  `sku` varchar(64) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `quantity` int DEFAULT NULL,
  `price` decimal(14,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_order` (`order_id`),
  KEY `ix_sku` (`sku`),
  CONSTRAINT `shopify_order_lines_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `shopify_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shopify_order_lines`
--

LOCK TABLES `shopify_order_lines` WRITE;
/*!40000 ALTER TABLE `shopify_order_lines` DISABLE KEYS */;
/*!40000 ALTER TABLE `shopify_order_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shopify_orders`
--

DROP TABLE IF EXISTS `shopify_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shopify_orders` (
  `id` bigint NOT NULL,
  `name` varchar(32) DEFAULT NULL,
  `email` varchar(120) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `currency` varchar(8) DEFAULT NULL,
  `total_price` decimal(14,2) DEFAULT NULL,
  `financial_status` varchar(32) DEFAULT NULL,
  `fulfillment_status` varchar(32) DEFAULT NULL,
  `raw_json` longtext,
  `imported_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shopify_orders`
--

LOCK TABLES `shopify_orders` WRITE;
/*!40000 ALTER TABLE `shopify_orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `shopify_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tenant_settings`
--

DROP TABLE IF EXISTS `tenant_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_settings` (
  `tenant_id` bigint unsigned NOT NULL,
  `settings_json` json NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`tenant_id`),
  CONSTRAINT `fk_tenant_settings_t` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tenant_settings`
--

LOCK TABLES `tenant_settings` WRITE;
/*!40000 ALTER TABLE `tenant_settings` DISABLE KEYS */;
/*!40000 ALTER TABLE `tenant_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tenants`
--

DROP TABLE IF EXISTS `tenants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `rut` varchar(32) NOT NULL,
  `name` varchar(191) NOT NULL,
  `subdomain` varchar(191) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_tenants_rut` (`rut`),
  UNIQUE KEY `ux_tenants_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tenants`
--

LOCK TABLES `tenants` WRITE;
/*!40000 ALTER TABLE `tenants` DISABLE KEYS */;
INSERT INTO `tenants` VALUES (13,'16282161-k','PEYPA','pelitosypatas.cl',1,'2025-09-01 01:45:22','2025-09-01 01:45:22');
/*!40000 ALTER TABLE `tenants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_roles`
--

DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_roles` (
  `user_id` bigint unsigned NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  `tenant_id` bigint unsigned DEFAULT NULL,
  `assigned_at` datetime NOT NULL,
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `ix_user_roles_tenant` (`tenant_id`),
  KEY `fk_ur_role` (`role_id`),
  CONSTRAINT `fk_ur_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ur_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ur_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_roles`
--

LOCK TABLES `user_roles` WRITE;
/*!40000 ALTER TABLE `user_roles` DISABLE KEYS */;
INSERT INTO `user_roles` VALUES (7,18,13,'2025-09-01 01:45:22'),(10,18,13,'2025-09-01 05:47:41');
/*!40000 ALTER TABLE `user_roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(191) NOT NULL,
  `password_hash` varchar(191) NOT NULL,
  `name` varchar(191) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_super_admin` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `last_login_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin@andflow.local','$2b$10$W35VkCDSvVXZcFqejmTo.u3G/KtEw1Ng7gHiNIsfaHEtaySnycMKi','Andrea (Super Admin)',1,1,'2025-08-30 06:24:18','2025-08-30 06:24:18','2025-09-01 01:48:40'),(2,'andrea@andrea.cl','$2b$10$MoGbUOVwC2zBFpYu410Vs.WDELli8n3FNcvgZRXiLxo8EHRKXLmQC','andrea',1,0,'2025-08-30 03:22:05','2025-08-30 03:22:05',NULL),(3,'a@a.cl','$2b$10$1bXunrS.GuqgF6NBEyykDeRD/UzrUWMzc/xtwYvrsiMW2KBoe3iAS','aaaaa',1,0,'2025-08-30 03:25:20','2025-08-30 03:25:20',NULL),(4,'fefaf','$2b$10$xYPhWpFTD8hSloOvsdPXRuqN5yHEw79bKdJTk1ddkuHc1IxayOOwi','admin@andflow.cl',1,0,'2025-08-30 03:27:25','2025-08-30 03:27:25',NULL),(5,'g','$2b$10$.NGvzwoC2PYK45k9Ye2hzuxM9ZGB2GvzAJ9AnUYBbzhVu0tCwowqq','admin@andflow.cl',1,0,'2025-08-30 03:36:19','2025-08-30 03:36:19',NULL),(6,'afafs','$2b$10$VayzZeIyNT3/kR7aO/FWz.JKbKLOkqS5wlQBSSTNdGoivxQ1pvdBu','admin@andflow.cl',1,0,'2025-08-30 03:48:59','2025-08-30 03:48:59',NULL),(7,'jmatam.go@gmail.com','$2b$10$p7Hyp/lU/MDclwbYGyZAletWwqGuDqeF/2rURWVSOPaz22KjHqAbq','Jenny',1,0,'2025-08-31 06:00:31','2025-08-31 06:00:31','2025-09-01 01:42:34'),(8,'contadora@pelitosypatas.cl','$2b$10$4o8WP7h40VJuYOg0piSrjOQztJZ3aN6vDCK66WEInyD2rsx0R3BKS','contadora',1,0,'2025-08-31 18:34:25','2025-08-31 18:34:25','2025-08-31 17:21:21'),(9,'andreita@andflow.cl','$2b$10$NVk/CmvKA4gC/6fprIzUFO4L89OE..Hx8q6Z1.SMCy891nONSZVhq','Andrea',1,0,'2025-08-31 14:45:37','2025-08-31 14:45:37','2025-08-31 20:56:13'),(10,'admin@peypa.cl','$2b$10$9FUuTcxTc6sbtvhns8pNKOZrxTTFo6jYsOIudNwMQJNBq0DkwCoxa',NULL,1,0,'2025-09-01 05:47:41','2025-09-01 05:47:41','2025-09-01 01:47:46');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'andflow'
--

--
-- Dumping routines for database 'andflow'
--
--
-- WARNING: can't read the INFORMATION_SCHEMA.libraries table. It's most probably an old server 8.0.43.
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-09-01  4:15:29
