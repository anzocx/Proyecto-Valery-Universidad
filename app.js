(() => {
  'use strict';

  const API_BASE = window.VALERY_API_BASE
    || new URLSearchParams(window.location.search).get('api')
    || 'http://localhost:8000/api';
  const pageContent = document.querySelector('#page-content');
  const breadcrumbTitle = document.querySelector('#breadcrumb-title');
  const clientDialog = document.querySelector('#client-dialog');
  const clientForm = document.querySelector('#client-form');
  const toastElement = document.querySelector('#toast');

  const state = {
    view: 'clientes',
    page: 1,
    pageSize: 10,
    search: '',
    products: null,
    receivables: null,
    alerts: null,
    alertDays: 7,
    editingClientId: null,
    saving: false,
    deletingId: null,
    savingPrices: false,
    priceForm: { mode: 'exchange_rate', value: '', category_id: '' },
    loading: false,
    error: '',
  };

  let searchTimer;
  let toastTimer;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]);
  }

  function formatMoney(value, currency = 'VES') {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.valueOf())
      ? '—'
      : new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium' }).format(date);
  }

  function queryString(parameters) {
    const query = new URLSearchParams();
    Object.entries(parameters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) query.set(key, value);
    });
    return query.size ? `?${query.toString()}` : '';
  }

  async function apiRequest(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
      });
    } catch {
      throw new Error(`No se pudo conectar con la API (${API_BASE}). Revisa el backend, el origen CORS y la configuración de conexión.`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(
        response.status >= 500
          ? 'El servidor o la base de datos no están disponibles.'
          : `El servidor devolvió una respuesta no válida (${response.status}).`,
      );
    }
    if (!response.ok) {
      const error = new Error(payload.error?.message || `Error HTTP ${response.status}.`);
      error.status = response.status;
      error.details = payload.error?.details || [];
      throw error;
    }
    return payload;
  }

  function showToast(message) {
    toastElement.textContent = message;
    toastElement.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toastElement.hidden = true; }, 3500);
  }

  function showError(message) {
    return `<div class="alert" role="alert"><span class="alert-symbol">!</span><span>${escapeHtml(message)}</span><button class="alert-close" type="button" data-retry>Reintentar</button></div>`;
  }

  function loadingRow(columns, label) {
    return `<tr><td colspan="${columns}"><div class="loading-state"><span class="spinner"></span>${escapeHtml(label)}</div></td></tr>`;
  }

  function emptyRow(columns, title, detail) {
    return `<tr><td colspan="${columns}"><div class="empty-state"><span>⌕</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></td></tr>`;
  }

  function metric(label, value, icon, color, note) {
    return `<article class="metric-card"><div class="metric-top"><span>${escapeHtml(label)}</span><span class="metric-icon ${color}">${icon}</span></div><strong class="${String(value).length > 13 ? 'metric-balance' : ''}">${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
  }

  function pageHeading(eyebrow, title, subtitle, action = '') {
    return `<section class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${action}</section>`;
  }

  function render() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === state.view);
    });
    breadcrumbTitle.textContent = state.view === 'precios'
      ? 'Ajustes de precios'
      : state.view === 'deudas' ? 'Cuentas por cobrar' : 'Clientes';

    if (state.view === 'clientes') renderClients();
    if (state.view === 'precios') renderProducts();
    if (state.view === 'deudas') renderReceivables();
  }

  function renderClients() {
    const clients = state.clientResult?.data || [];
    const pagination = state.clientResult?.pagination || {
      page: state.page, page_size: state.pageSize, total: 0, total_pages: 0,
    };
    const clientRows = state.loading
      ? loadingRow(7, 'Cargando clientes...')
      : state.error && !state.clientResult
        ? emptyRow(7, 'No se pudieron cargar los clientes', 'Revisa la conexión con el servidor y vuelve a intentarlo.')
        : clients.length === 0
          ? emptyRow(7, 'No hay clientes activos', 'Registra un cliente o cambia el término de búsqueda.')
          : clients.map((client) => `
            <tr>
              <td><div class="client-cell"><span class="client-avatar">${escapeHtml(client.nombre_razon_social.slice(0, 2).toUpperCase())}</span><span><strong>${escapeHtml(client.nombre_razon_social)}</strong><small>${escapeHtml(client.direccion)}</small></span></div></td>
              <td class="rif-cell">${escapeHtml(client.cedula_rif)}</td>
              <td>${escapeHtml(client.telefono)}</td>
              <td class="money-cell">${formatMoney(client.limite_credito)}</td>
              <td>${escapeHtml(client.dias_credito_otorgados)} días</td>
              <td>${formatDate(client.created_at)}</td>
              <td><div class="row-actions">
                <button class="icon-button" type="button" data-edit-client="${escapeHtml(client.id)}" aria-label="Editar ${escapeHtml(client.nombre_razon_social)}" title="Editar">✎</button>
                <button class="icon-button danger" type="button" data-delete-client="${escapeHtml(client.id)}" ${state.deletingId === client.id ? 'disabled' : ''} aria-label="Inactivar ${escapeHtml(client.nombre_razon_social)}" title="Inactivar">⌫</button>
              </div></td>
            </tr>`).join('');
    const visibleCredit = clients.reduce((total, client) => total + Number(client.limite_credito || 0), 0);
    const errorBanner = state.error ? showError(state.error) : '';

    pageContent.innerHTML = `
      ${pageHeading('MÓDULO A · MAESTRO DE DATOS', 'Gestión de clientes', 'Administra clientes y sus condiciones de crédito.',
        '<button class="button button-primary" type="button" data-new-client><span>＋</span> Nuevo cliente</button>')}
      ${errorBanner}
      <section class="metrics compact-metrics" aria-label="Resumen de clientes">
        ${metric('Clientes activos', state.loading || state.error && !state.clientResult ? '—' : pagination.total, '▦', 'purple', 'Registros activos de la API')}
        ${metric('Página actual', `${pagination.page} / ${Math.max(pagination.total_pages, 1)}`, '↕', 'blue', `${pagination.page_size} registros por página`)}
        ${metric('Límite visible', formatMoney(visibleCredit), '$', 'green', 'Suma de la página actual')}
      </section>
      <section class="table-card">
        <div class="table-heading"><div><h2>Directorio de clientes</h2><p>Buscar, editar y cambiar el estado de los registros.</p></div><span class="record-count">${pagination.total} registros</span></div>
        <div class="filters"><label class="search-box"><span>⌕</span><input id="client-search" value="${escapeHtml(state.search)}" placeholder="Buscar por cédula/RIF o razón social..." aria-label="Buscar clientes">${state.search ? '<button type="button" data-clear-search aria-label="Limpiar búsqueda">×</button>' : ''}</label></div>
        <div class="table-wrap"><table>
          <thead><tr><th>CLIENTE</th><th>CÉDULA / RIF</th><th>TELÉFONO</th><th>LÍMITE CRÉDITO</th><th>DÍAS CRÉDITO</th><th>REGISTRO</th><th><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${clientRows}</tbody>
        </table></div>
        <footer class="pagination">
          <span>Mostrando ${clients.length ? (pagination.page - 1) * pagination.page_size + 1 : 0}–${Math.min(pagination.page * pagination.page_size, pagination.total)} de ${pagination.total}</span>
          <div class="pagination-controls">
            <button class="button button-secondary" type="button" data-page="${pagination.page - 1}" ${state.loading || pagination.page <= 1 ? 'disabled' : ''}>Anterior</button>
            <span class="page-indicator">${pagination.page} / ${Math.max(pagination.total_pages, 1)}</span>
            <button class="button button-secondary" type="button" data-page="${pagination.page + 1}" ${state.loading || pagination.page >= pagination.total_pages ? 'disabled' : ''}>Siguiente</button>
          </div>
        </footer>
      </section>`;
  }

  async function loadClients() {
    state.loading = true;
    state.error = '';
    renderClients();
    try {
      state.clientResult = await apiRequest(`/clientes${queryString({
        page: state.page,
        page_size: state.pageSize,
        q: state.search.trim(),
      })}`);
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
      if (state.view === 'clientes') renderClients();
    }
  }

  function clientFieldError(name, rawValue) {
    const value = String(rawValue ?? '').trim();
    if (name === 'cedula_rif' && !/^[VEJPG]-?\d{5,10}$/i.test(value)) {
      return 'Usa un formato válido, por ejemplo V-12345678.';
    }
    if (name === 'nombre_razon_social' && (value.length < 2 || value.length > 180)) {
      return 'El nombre o razón social debe tener entre 2 y 180 caracteres.';
    }
    if (name === 'telefono' && !/^\+?[\d\s().-]{7,25}$/.test(value)) {
      return 'Ingresa un teléfono válido.';
    }
    if (name === 'direccion' && (value.length < 3 || value.length > 2000)) {
      return 'La dirección debe tener entre 3 y 2000 caracteres.';
    }
    if (name === 'limite_credito'
      && (!value || !Number.isFinite(Number(value)) || Number(value) < 0)) {
      return 'El límite debe ser cero o mayor.';
    }
    if (name === 'dias_credito_otorgados'
      && (!value || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 3650)) {
      return 'Indica días entre 0 y 3650.';
    }
    return '';
  }

  function validateClientForm() {
    const data = new FormData(clientForm);
    const fields = [
      'cedula_rif',
      'nombre_razon_social',
      'telefono',
      'direccion',
      'limite_credito',
      'dias_credito_otorgados',
    ];
    const errors = Object.fromEntries(fields
      .map((field) => [field, clientFieldError(field, data.get(field))])
      .filter(([, message]) => message));
    clientForm.querySelectorAll('[data-error-for]').forEach((node) => {
      node.textContent = errors[node.dataset.errorFor] || '';
      node.previousElementSibling?.setAttribute('aria-invalid', String(Boolean(errors[node.dataset.errorFor])));
    });
    return { errors, data };
  }

  async function submitClient(event) {
    event.preventDefault();
    if (state.saving) return;
    const { errors, data } = validateClientForm();
    const errorNode = document.querySelector('#client-form-error');
    errorNode.textContent = '';
    if (Object.keys(errors).length) return;

    const submitButton = document.querySelector('#client-submit');
    state.saving = true;
    submitButton.disabled = true;
    submitButton.textContent = 'Guardando...';
    try {
      const payload = {
        cedula_rif: String(data.get('cedula_rif')).trim().toUpperCase(),
        nombre_razon_social: String(data.get('nombre_razon_social')).trim(),
        telefono: String(data.get('telefono')).trim(),
        direccion: String(data.get('direccion')).trim(),
        limite_credito: Number(data.get('limite_credito')),
        dias_credito_otorgados: Number(data.get('dias_credito_otorgados')),
      };
      const path = state.editingClientId
        ? `/clientes/${state.editingClientId}`
        : '/clientes';
      const response = await apiRequest(path, {
        method: state.editingClientId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      clientDialog.close();
      showToast(response.message || 'Cliente guardado correctamente.');
      if (!state.editingClientId) state.page = 1;
      await loadClients();
    } catch (error) {
      errorNode.textContent = error.details?.length
        ? `${error.message} ${error.details.map((detail) => detail.message).join(' ')}`
        : error.message;
    } finally {
      state.saving = false;
      submitButton.disabled = false;
      submitButton.textContent = state.editingClientId ? 'Guardar cambios' : 'Crear cliente';
    }
  }

  async function editClient(id) {
    try {
      const response = await apiRequest(`/clientes/${encodeURIComponent(id)}`);
      const client = response.data;
      state.editingClientId = client.id;
      clientForm.reset();
      Object.entries(client).forEach(([key, value]) => {
        const input = clientForm.elements.namedItem(key);
        if (input && value !== null && value !== undefined) input.value = value;
      });
      document.querySelector('#client-dialog-eyebrow').textContent = 'ACTUALIZACIÓN';
      document.querySelector('#client-dialog-title').textContent = 'Editar cliente';
      document.querySelector('#client-submit').textContent = 'Guardar cambios';
      clientDialog.showModal();
    } catch (error) {
      state.error = error.message;
      renderClients();
    }
  }

  async function deleteClient(id) {
    const client = state.clientResult?.data.find((record) => String(record.id) === String(id));
    if (!client || !window.confirm(`¿Inactivar al cliente ${client.nombre_razon_social}?`)) return;
    state.deletingId = client.id;
    renderClients();
    try {
      const response = await apiRequest(`/clientes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      showToast(response.message || 'Cliente inactivado correctamente.');
      if (state.clientResult.data.length === 1 && state.page > 1) state.page -= 1;
      await loadClients();
    } catch (error) {
      state.error = error.message;
      renderClients();
    } finally {
      state.deletingId = null;
    }
  }

  function renderProducts() {
    const productData = state.products;
    const errorBanner = state.error ? showError(state.error) : '';
    const rows = state.loading
      ? loadingRow(7, 'Cargando productos...')
      : state.error && !productData
        ? emptyRow(7, 'No se pudo cargar el catálogo', 'Revisa la conexión y vuelve a intentarlo.')
        : !productData?.products.length
          ? emptyRow(7, 'No hay productos activos', 'Los productos se consultan desde la base de datos mediante la API.')
          : productData.products.map((product) => `
            <tr>
              <td class="rif-cell">${escapeHtml(product.codigo)}</td><td class="product-name">${escapeHtml(product.nombre)}</td>
              <td>${escapeHtml(product.categoria)}</td><td class="money-cell">${formatMoney(product.precio_usd, 'USD')}</td>
              <td class="money-cell">${formatMoney(product.precio_bs)}</td>
              <td>${Number(product.tasa_cambio).toLocaleString('es-VE', { maximumFractionDigits: 6 })}</td>
              <td>${formatDate(product.updated_at)}</td>
            </tr>`).join('');
    const categories = productData?.categories || [];
    const categoryOptions = categories.map((category) => (
      `<option value="${escapeHtml(category.id)}" ${String(category.id) === state.priceForm.category_id ? 'selected' : ''}>${escapeHtml(category.nombre)}</option>`
    )).join('');
    const priceLabel = state.priceForm.mode === 'percentage' ? 'Incremento porcentual (%)' : 'Nueva tasa (Bs por USD)';
    const pricePlaceholder = state.priceForm.mode === 'percentage' ? 'Ej. 12.5' : 'Ej. 36.500000';
    const modeHelp = state.priceForm.mode === 'percentage'
      ? 'El porcentaje incrementa simultáneamente los precios en USD y bolívares.'
      : 'Se conserva el precio USD y se recalcula el equivalente en bolívares.';

    pageContent.innerHTML = `
      ${pageHeading('MÓDULO B · AUTOMATIZACIÓN', 'Ajuste masivo de precios', 'Recalcula precios de productos con una actualización transaccional.')}
      ${errorBanner}
      <div class="price-layout">
        <section class="table-card">
          <div class="table-heading"><div><h2>Actualizar precios</h2><p>Los productos se cargan desde la API; no hay precios de demostración.</p></div></div>
          <form class="price-form" id="price-form">
            <label class="form-field">Método de actualización
              <select name="mode">
                <option value="exchange_rate" ${state.priceForm.mode === 'exchange_rate' ? 'selected' : ''}>Nueva tasa de cambio (Bs/USD)</option>
                <option value="percentage" ${state.priceForm.mode === 'percentage' ? 'selected' : ''}>Porcentaje de incremento (%)</option>
              </select>
            </label>
            <label class="form-field">${priceLabel}
              <input name="value" type="number" min="0.000001" step="${state.priceForm.mode === 'percentage' ? '0.01' : '0.000001'}" max="${state.priceForm.mode === 'percentage' ? '1000' : '99999999.999999'}" value="${escapeHtml(state.priceForm.value)}" placeholder="${pricePlaceholder}" required>
            </label>
            <label class="form-field">Categoría
              <select name="category_id"><option value="">Todos los productos activos</option>${categoryOptions}</select>
            </label>
            <div class="price-help">${modeHelp}</div>
            <button class="button button-primary" type="submit" ${state.loading || state.savingPrices || !productData?.products.length ? 'disabled' : ''}>${state.savingPrices ? 'Actualizando...' : 'Aplicar actualización masiva'}</button>
          </form>
        </section>
        <article class="metric-card product-count-card"><div class="metric-top"><span>Productos activos</span><span class="metric-icon purple">▦</span></div><strong>${state.loading || state.error && !productData ? '—' : productData?.products.length || 0}</strong><small>Resultados recibidos de la API</small></article>
      </div>
      <section class="table-card">
        <div class="table-heading"><div><h2>Catálogo de productos</h2><p>Precios registrados en bolívares y dólares.</p></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>CÓDIGO</th><th>PRODUCTO</th><th>CATEGORÍA</th><th>PRECIO USD</th><th>PRECIO BS</th><th>TASA BS/USD</th><th>ACTUALIZADO</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>`;
  }

  async function loadProducts() {
    state.loading = true;
    state.error = '';
    renderProducts();
    try {
      state.products = await apiRequest('/productos').then((response) => response.data);
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
      if (state.view === 'precios') renderProducts();
    }
  }

  async function submitPrices(event) {
    event.preventDefault();
    if (state.savingPrices) return;
    const form = new FormData(event.currentTarget);
    const mode = String(form.get('mode'));
    const value = Number(form.get('value'));
    const categoryId = String(form.get('category_id') || '');
    const max = mode === 'percentage' ? 1000 : 99999999.999999;
    if (!Number.isFinite(value) || value <= 0 || value > max) {
      state.error = mode === 'percentage'
        ? 'Ingresa un incremento mayor a cero y no superior a 1000%.'
        : 'Ingresa una tasa de cambio válida mayor a cero.';
      renderProducts();
      return;
    }
    const category = state.products?.categories.find((item) => String(item.id) === categoryId);
    const scope = category ? `la categoría «${category.nombre}»` : 'todos los productos activos';
    const unit = mode === 'percentage' ? '%' : 'Bs/USD';
    if (!window.confirm(`¿Aplicar ${value} ${unit} a ${scope}? Esta acción actualizará los precios en la base de datos.`)) return;

    state.priceForm = { mode, value: String(form.get('value')), category_id: categoryId };
    state.savingPrices = true;
    state.error = '';
    renderProducts();
    try {
      const response = await apiRequest('/productos/actualizar-precios-masivo', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          value,
          ...(categoryId ? { category_id: Number(categoryId) } : {}),
        }),
      });
      showToast(response.message || 'Los precios se actualizaron correctamente.');
      await loadProducts();
    } catch (error) {
      state.error = error.message;
    } finally {
      state.savingPrices = false;
      if (state.view === 'precios') renderProducts();
    }
  }

  function renderReceivables() {
    const data = state.receivables;
    const invoices = data?.invoices || [];
    const alerts = state.alerts || [];
    const errorBanner = state.error ? showError(state.error) : '';
    const rows = state.loading
      ? loadingRow(7, 'Cargando cuentas por cobrar...')
      : state.error && !data
        ? emptyRow(7, 'No se pudieron cargar las facturas', 'Revisa la conexión y vuelve a intentarlo.')
        : invoices.length === 0
          ? emptyRow(7, 'No hay facturas pendientes', 'Las facturas con saldo se consultan desde la base de datos.')
          : invoices.map((invoice) => invoiceTableRow(invoice)).join('');
    const alertItems = state.loading
      ? '<div class="loading-state"><span class="spinner"></span>Consultando vencimientos...</div>'
      : state.error && !state.alerts
        ? '<div class="inline-error">No se pudieron consultar las alertas. Revisa la conexión y vuelve a intentarlo.</div>'
        : alerts.length
          ? alerts.map((invoice) => invoiceAlertRow(invoice)).join('')
          : '<div class="no-alerts"><span>✓</span><strong>Sin alertas próximas</strong><small>No hay facturas vencidas o próximas a vencer para este período.</small></div>';
    const summary = data?.summary;

    pageContent.innerHTML = `
      ${pageHeading('MÓDULO B · CRÉDITO Y COBRANZA', 'Cuentas por cobrar', 'Facturas pendientes, vencimientos y alertas para cobranza.',
        `<label class="days-filter">Alertar con hasta <select id="alert-days"><option value="3" ${state.alertDays === 3 ? 'selected' : ''}>3 días</option><option value="7" ${state.alertDays === 7 ? 'selected' : ''}>7 días</option><option value="14" ${state.alertDays === 14 ? 'selected' : ''}>14 días</option><option value="30" ${state.alertDays === 30 ? 'selected' : ''}>30 días</option></select> de anticipación</label>`)}
      ${errorBanner}
      <section class="metrics" aria-label="Resumen de cuentas por cobrar">
        ${metric('Facturas pendientes', state.loading || state.error && !data ? '—' : summary?.facturas_pendientes ?? 0, '▤', 'purple', 'Facturas con saldo pendiente')}
        ${metric('Saldo por cobrar', state.loading || state.error && !data ? '—' : formatMoney(summary?.saldo_total), '$', 'blue', 'Saldo acumulado')}
        ${metric('Facturas vencidas', state.loading || state.error && !data ? '—' : summary?.vencidas ?? 0, '!', 'red', 'Fecha de vencimiento superada')}
        ${metric('Por vencer en 7 días', state.loading || state.error && !data ? '—' : summary?.por_vencer ?? 0, '◷', 'amber', 'Próximos siete días')}
      </section>
      <section class="alert-panel">
        <div class="alert-panel-title"><span class="metric-icon amber">!</span><div><strong>Alertas de vencimiento</strong><small>Vencidas o próximas a vencer en ${state.alertDays} días</small></div><span class="record-count">${state.loading || state.error && !state.alerts ? '— alertas' : `${alerts.length} alertas`}</span></div>
        <div class="alert-list">${alertItems}</div>
      </section>
      <section class="table-card">
        <div class="table-heading"><div><h2>Facturas pendientes</h2><p>El indicador de vencimiento se calcula con la fecha del servidor.</p></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>FACTURA</th><th>CLIENTE</th><th>EMISIÓN</th><th>VENCIMIENTO</th><th>TOTAL</th><th>SALDO</th><th>ALERTA</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>`;
  }

  function invoiceStatus(invoice) {
    if (invoice.alerta === 'VENCIDO' || invoice.estatus_pago === 'VENCIDO') return 'vencido';
    if (invoice.alerta === 'POR_VENCER') return 'por_vencer';
    return 'al_dia';
  }

  function invoiceStatusLabel(invoice) {
    const status = invoiceStatus(invoice);
    return status === 'vencido' ? 'VENCIDO' : status === 'por_vencer' ? 'POR VENCER' : 'AL DÍA';
  }

  function invoiceTableRow(invoice) {
    const status = invoiceStatus(invoice);
    return `<tr><td class="rif-cell">${escapeHtml(invoice.numero_factura)}</td><td><div class="invoice-customer"><strong>${escapeHtml(invoice.nombre_razon_social)}</strong><small>${escapeHtml(invoice.cedula_rif)}</small></div></td><td>${formatDate(invoice.fecha_emision)}</td><td>${formatDate(invoice.fecha_vencimiento)}</td><td class="money-cell">${formatMoney(invoice.monto_total)}</td><td class="money-cell">${formatMoney(invoice.saldo_pendiente)}</td><td><span class="status-pill ${status}">${invoiceStatusLabel(invoice)}</span></td></tr>`;
  }

  function invoiceAlertRow(invoice) {
    const status = invoiceStatus(invoice);
    const due = status === 'vencido'
      ? `Vencida hace ${Math.abs(Number(invoice.dias_hasta_vencimiento))} días`
      : `Vence ${formatDate(invoice.fecha_vencimiento)}`;
    return `<div class="invoice-alert ${status}"><span class="alert-status-dot ${status}"></span><span class="invoice-alert-main"><strong>${escapeHtml(invoice.numero_factura)}</strong><small>${escapeHtml(invoice.nombre_razon_social)} · ${escapeHtml(invoice.cedula_rif)}</small></span><span class="invoice-alert-amount">${formatMoney(invoice.saldo_pendiente)}</span><span class="invoice-alert-due">${due}</span></div>`;
  }

  async function loadReceivables() {
    state.loading = true;
    state.error = '';
    renderReceivables();
    try {
      const query = queryString({ dias: state.alertDays });
      const [dashboard, alertResponse] = await Promise.all([
        apiRequest(`/cuentas-por-cobrar${query}`),
        apiRequest(`/cuentas-por-cobrar/alertas${query}`),
      ]);
      state.receivables = dashboard.data;
      state.alerts = alertResponse.data;
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
      if (state.view === 'deudas') renderReceivables();
    }
  }

  function openNewClient() {
    state.editingClientId = null;
    clientForm.reset();
    document.querySelector('#client-dialog-eyebrow').textContent = 'NUEVO REGISTRO';
    document.querySelector('#client-dialog-title').textContent = 'Registrar cliente';
    document.querySelector('#client-submit').textContent = 'Crear cliente';
    document.querySelector('#client-form-error').textContent = '';
    clientForm.querySelectorAll('[data-error-for]').forEach((node) => { node.textContent = ''; });
    clientDialog.showModal();
    clientForm.elements.namedItem('cedula_rif').focus();
  }

  document.addEventListener('click', (event) => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      state.view = viewButton.dataset.view;
      state.loading = false;
      state.error = '';
      render();
      if (state.view === 'clientes' && !state.clientResult) loadClients();
      if (state.view === 'precios' && !state.products) loadProducts();
      if (state.view === 'deudas' && !state.receivables) loadReceivables();
      return;
    }
    if (event.target.closest('[data-new-client]')) {
      openNewClient();
      return;
    }
    if (event.target.closest('[data-close-dialog]')) {
      clientDialog.close();
      return;
    }
    const editButton = event.target.closest('[data-edit-client]');
    if (editButton) {
      editClient(editButton.dataset.editClient);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-client]');
    if (deleteButton) {
      deleteClient(deleteButton.dataset.deleteClient);
      return;
    }
    const pageButton = event.target.closest('[data-page]');
    if (pageButton && !pageButton.disabled) {
      state.page = Number(pageButton.dataset.page);
      loadClients();
      return;
    }
    if (event.target.closest('[data-clear-search]')) {
      state.search = '';
      state.page = 1;
      loadClients();
      return;
    }
    if (event.target.closest('[data-retry]')) {
      if (state.view === 'clientes') loadClients();
      if (state.view === 'precios') loadProducts();
      if (state.view === 'deudas') loadReceivables();
    }
  });

  pageContent.addEventListener('input', (event) => {
    if (event.target.id !== 'client-search') return;
    state.search = event.target.value;
    state.page = 1;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => loadClients(), 300);
  });

  pageContent.addEventListener('change', (event) => {
    if (event.target.id === 'alert-days') {
      state.alertDays = Number(event.target.value);
      loadReceivables();
    }
    if (event.target.name === 'mode' && event.target.closest('#price-form')) {
      state.priceForm.mode = event.target.value;
      const form = document.querySelector('#price-form');
      state.priceForm.value = form.elements.namedItem('value').value;
      state.priceForm.category_id = form.elements.namedItem('category_id').value;
      renderProducts();
    }
    if (event.target.closest('#price-form') && event.target.name === 'category_id') {
      state.priceForm.category_id = event.target.value;
    }
    if (event.target.closest('#price-form') && event.target.name === 'value') {
      state.priceForm.value = event.target.value;
    }
  });

  pageContent.addEventListener('submit', (event) => {
    if (event.target.id === 'price-form') submitPrices(event);
  });
  clientForm.addEventListener('submit', submitClient);
  clientForm.addEventListener('input', (event) => {
    if (!event.target.name) return;
    const fieldError = clientForm.querySelector(`[data-error-for="${event.target.name}"]`);
    const message = clientFieldError(event.target.name, event.target.value);
    if (fieldError) fieldError.textContent = message;
    event.target.setAttribute('aria-invalid', String(Boolean(message)));
  });
  clientDialog.addEventListener('click', (event) => {
    if (event.target === clientDialog) clientDialog.close();
  });

  render();
  loadClients();
})();
