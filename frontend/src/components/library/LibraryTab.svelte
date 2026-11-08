<script>
  import { onMount } from 'svelte';
  import { settings, saveSettings } from '../../stores/settings';
  import { 
    products, 
    catalogStats, 
    isValidating, 
    isSyncing, 
    validationError, 
    parsedPreview, 
    loadProducts, 
    validateCatalogDocx, 
    syncCatalogDocx, 
    toggleProductAvailability,
    batchUpdateAvailability,
    uploadProductPhoto,
    deleteProductPhoto,
    deleteProduct
  } from '../../stores/catalog';
  import {
    promotionsData,
    isLoadingPromotions,
    isSavingPromotion,
    loadPromotions,
    createPromotion,
    togglePromotion,
    updatePromotion,
    deletePromotion
  } from '../../stores/promotions';
  import { showToast } from '../../stores/toast';

  // Navegación interna: 'hub' (grilla de tarjetas) | 'indications' | 'catalog' | 'promotions'
  let currentSubView = $state('hub');

  // =========================================================================
  // SUBVISTA 1: INDICACIONES AL ASISTENTE (Tarea 1)
  // =========================================================================
  let botTone = $state('');
  let businessInfo = $state('');
  let faqText = $state('');
  let neverDo = $state('');
  let isSavingIndications = $state(false);

  $effect(() => {
    if ($settings) {
      botTone = $settings.botTone || '';
      businessInfo = $settings.businessInfo || '';
      faqText = $settings.faqText || '';
      neverDo = $settings.neverDo || '';
    }
  });

  let hasUnsavedIndications = $derived(
    botTone !== ($settings?.botTone || '') ||
    businessInfo !== ($settings?.businessInfo || '') ||
    faqText !== ($settings?.faqText || '') ||
    neverDo !== ($settings?.neverDo || '')
  );

  async function handleSaveIndications() {
    isSavingIndications = true;
    try {
      const res = await saveSettings({
        botTone: botTone.trim(),
        businessInfo: businessInfo.trim(),
        faqText: faqText.trim(),
        neverDo: neverDo.trim()
      });

      if (res?.success) {
        showToast('¡Listo! Tu asistente ya aprendió estas indicaciones', 'success');
      }
    } catch (err) {
      showToast('Error al guardar: ' + (err?.message || err), 'error');
    } finally {
      isSavingIndications = false;
    }
  }

  function handleDiscardIndications() {
    if ($settings) {
      botTone = $settings.botTone || '';
      businessInfo = $settings.businessInfo || '';
      faqText = $settings.faqText || '';
      neverDo = $settings.neverDo || '';
      showToast('Cambios descartados', 'info');
    }
  }

  // =========================================================================
  // SUBVISTA 2: CATÁLOGO DE PRODUCTOS (Tarea 2)
  // =========================================================================
  let selectedFile = $state(null);
  let isCatalogDragging = $state(false);

  onMount(() => {
    loadProducts();
    loadPromotions();
  });

  function handleFileSelect(e) {
    const file = e.target?.files?.[0];
    if (file) {
      processDocxFile(file);
    }
  }

  function handleCatalogDragOver(e) {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      isCatalogDragging = true;
    }
  }

  function handleCatalogDragLeave(e) {
    e.preventDefault();
    isCatalogDragging = false;
  }

  function handleCatalogDrop(e) {
    e.preventDefault();
    isCatalogDragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processDocxFile(file);
    }
  }

  function processDocxFile(file) {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      showToast('El archivo debe ser un documento Word (.docx)', 'error');
      return;
    }

    selectedFile = file;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result;
      await validateCatalogDocx(file.name, base64Data);
    };
    reader.readAsDataURL(file);
  }

  // =========================================================================
  // SUBVISTA 2: SINCRONIZACIÓN INTELIGENTE Y PRODUCTOS AUSENTES (Tarea 4)
  // =========================================================================
  let missingQueue = $state([]);
  let missingIndex = $state(0);
  let isResolvingMissing = $state(false);

  let currentMissingProduct = $derived(
    missingQueue.length > 0 && missingIndex < missingQueue.length
      ? missingQueue[missingIndex]
      : null
  );

  async function handleConfirmSync() {
    if (!selectedFile || !$parsedPreview?.products) return;
    const fileToSync = selectedFile;
    const productsToSync = $parsedPreview.products;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result;
      const res = await syncCatalogDocx(fileToSync.name, base64Data, productsToSync);
      if (res?.success) {
        selectedFile = null;
        // Si hay productos ausentes que estaban en el sistema pero no en el nuevo Word,
        // abrimos la ventana emergente de confirmación interactiva para consultar su estado.
        if (res.data?.missing && res.data.missing.length > 0) {
          missingQueue = res.data.missing;
          missingIndex = 0;
        }
      }
    };
    reader.readAsDataURL(fileToSync);
  }

  async function handleMissingMarkUnavailable() {
    if (!currentMissingProduct) return;
    isResolvingMissing = true;
    try {
      await toggleProductAvailability(currentMissingProduct.id, false, false);
      advanceMissingQueue();
    } finally {
      isResolvingMissing = false;
    }
  }

  async function handleMissingKeepAvailable() {
    if (!currentMissingProduct) return;
    isResolvingMissing = true;
    try {
      await toggleProductAvailability(currentMissingProduct.id, true, false);
      advanceMissingQueue();
    } finally {
      isResolvingMissing = false;
    }
  }

  async function handleMarkAllRemainingUnavailable() {
    isResolvingMissing = true;
    try {
      const remaining = missingQueue.slice(missingIndex);
      const updates = remaining.map((p) => ({ id: p.id, isAvailable: false }));
      await batchUpdateAvailability(updates);
      showToast(`Se marcaron ${remaining.length} productos ausentes como "No disponibles".`, 'info');
      missingQueue = [];
      missingIndex = 0;
    } finally {
      isResolvingMissing = false;
    }
  }

  function advanceMissingQueue() {
    if (missingIndex + 1 < missingQueue.length) {
      missingIndex++;
    } else {
      const totalReviewed = missingQueue.length;
      missingQueue = [];
      missingIndex = 0;
      showToast(`¡Listo! Se completó la sincronización y revisión de los ${totalReviewed} productos ausentes.`, 'success');
    }
  }

  function handleCancelPreview() {
    selectedFile = null;
    parsedPreview.set(null);
    validationError.set(null);
  }

  // =========================================================================
  // SUBVISTA 2: GESTIÓN DE FOTOGRAFÍAS Y BORRADO DISUASORIO (Tarea 3)
  // =========================================================================
  let uploadingPhotoForId = $state(null);
  let productToDelete = $state(null);

  async function handleUploadPhoto(productId, e) {
    const file = e.target?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Por favor selecciona una imagen (JPG, PNG o WEBP).', 'error');
      return;
    }

    uploadingPhotoForId = productId;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result;
      await uploadProductPhoto(productId, file.name, base64Data);
      uploadingPhotoForId = null;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleDeletePhoto(productId, imageUrl) {
    if (confirm('¿Deseas eliminar esta fotografía del producto?')) {
      await deleteProductPhoto(productId, imageUrl);
    }
  }

  function promptDeleteProduct(prod) {
    productToDelete = prod;
  }

  function cancelDeleteModal() {
    productToDelete = null;
  }

  async function handleMarkUnavailableInstead() {
    if (!productToDelete) return;
    await toggleProductAvailability(productToDelete.id, false);
    productToDelete = null;
  }

  async function handleConfirmDeleteProduct() {
    if (!productToDelete) return;
    const prodId = productToDelete.id;
    productToDelete = null;
    await deleteProduct(prodId);
  }

  // =========================================================================
  // SUBVISTA 3: CAMPAÑAS Y PROMOCIONES (Tarea 5)
  // =========================================================================
  let promoFilter = $state('active'); // 'active' | 'expired' | 'all'
  let showPromoModal = $state(false);
  let promoEditingId = $state(null); // null = Crear, string id = Editar
  let promoName = $state('');
  let promoStartDate = $state('');
  let promoEndDate = $state('');
  let promoDescription = $state('');
  let promoTextContent = $state('');
  let promoSelectedFile = $state(null);
  let promoFileDataBase64 = $state(null);
  let promoExistingFilename = $state(null);
  let isPromoDragging = $state(false);
  let promoConflictWarning = $state('');

  function getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  $effect(() => {
    if (promoStartDate && promoEndDate && $promotionsData?.all) {
      if (promoStartDate > promoEndDate) {
        promoConflictWarning = 'La fecha de inicio no puede ser posterior a la fecha de fin.';
        return;
      }
      const today = getTodayString();
      const activeCandidates = ($promotionsData.all || []).filter(
        (p) => p.isActive && p.endDate >= today && (!promoEditingId || p.id !== promoEditingId),
      );
      const start = new Date(`${promoStartDate}T00:00:00`);
      const end = new Date(`${promoEndDate}T00:00:00`);
      let conflictFound = false;
      let conflictDayStr = '';
      let conflictNames = [];

      const cur = new Date(start);
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const dayStr = `${y}-${m}-${d}`;

        const overlapping = activeCandidates.filter(
          (p) => p.startDate <= dayStr && p.endDate >= dayStr,
        );
        if (overlapping.length >= 2) {
          conflictFound = true;
          conflictDayStr = dayStr;
          conflictNames = overlapping.map((p) => `"${p.name}"`);
          break;
        }
        cur.setDate(cur.getDate() + 1);
      }

      if (conflictFound) {
        promoConflictWarning = `⚠️ Límite de 2 activas: El día ${conflictDayStr} ya existen 2 campañas activas (${conflictNames.join(' y ')}). Si programas en estas fechas, deberás ajustar los días o apagar una antes.`;
      } else {
        promoConflictWarning = '';
      }
    } else {
      promoConflictWarning = '';
    }
  });

  function openCreatePromoModal() {
    promoEditingId = null;
    promoName = '';
    promoStartDate = getTodayString();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const y = nextWeek.getFullYear();
    const m = String(nextWeek.getMonth() + 1).padStart(2, '0');
    const d = String(nextWeek.getDate()).padStart(2, '0');
    promoEndDate = `${y}-${m}-${d}`;
    promoDescription = '';
    promoTextContent = '';
    promoSelectedFile = null;
    promoFileDataBase64 = null;
    promoExistingFilename = null;
    promoConflictWarning = '';
    showPromoModal = true;
  }

  function openEditPromoModal(promo) {
    promoEditingId = promo.id;
    promoName = promo.name || '';
    promoStartDate = promo.startDate || '';
    promoEndDate = promo.endDate || '';
    promoDescription = promo.description || '';
    promoTextContent = promo.content || '';
    promoSelectedFile = null;
    promoFileDataBase64 = null;
    promoExistingFilename = promo.originalFilename || null;
    promoConflictWarning = '';
    showPromoModal = true;
  }

  function handlePromoFileSelect(e) {
    const file = e.target?.files?.[0];
    if (file) {
      processPromoFile(file);
    }
  }

  function processPromoFile(file) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['docx', 'txt', 'md'].includes(ext)) {
      showToast('Por favor sube un archivo Word (.docx), texto (.txt) o Markdown (.md)', 'error');
      return;
    }
    promoSelectedFile = file;
    if (!promoName.trim()) {
      promoName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    }

    const reader = new FileReader();
    reader.onload = () => {
      promoFileDataBase64 = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function handlePromoDragOver(e) {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      isPromoDragging = true;
    }
  }

  function handlePromoDragLeave(e) {
    e.preventDefault();
    isPromoDragging = false;
  }

  function handlePromoDrop(e) {
    e.preventDefault();
    isPromoDragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processPromoFile(file);
    }
  }

  async function handleSavePromo() {
    if (!promoName.trim()) {
      showToast('Por favor ingresa el nombre de la campaña', 'error');
      return;
    }
    if (!promoStartDate || !promoEndDate) {
      showToast('Debes seleccionar la fecha de inicio y de fin', 'error');
      return;
    }
    if (!promoSelectedFile && !promoTextContent.trim() && !promoEditingId) {
      showToast('Debes adjuntar un archivo Word/texto o escribir los detalles de la promoción', 'error');
      return;
    }

    try {
      if (promoEditingId) {
        await updatePromotion(promoEditingId, {
          name: promoName.trim(),
          startDate: promoStartDate,
          endDate: promoEndDate,
          description: promoDescription.trim() || undefined,
          filename: promoSelectedFile ? promoSelectedFile.name : undefined,
          data: promoFileDataBase64 || undefined,
          textContent: promoTextContent.trim() || undefined,
          content: promoTextContent.trim() || undefined,
        });
      } else {
        await createPromotion({
          name: promoName.trim(),
          startDate: promoStartDate,
          endDate: promoEndDate,
          description: promoDescription.trim() || undefined,
          filename: promoSelectedFile ? promoSelectedFile.name : undefined,
          data: promoFileDataBase64 || undefined,
          textContent: promoTextContent.trim() || undefined,
        });
      }
      showPromoModal = false;
    } catch (err) {
      // Toast se muestra en el store
    }
  }

  async function handleTogglePromo(promo) {
    try {
      await togglePromotion(promo.id);
    } catch (err) {
      // Toast se muestra en el store
    }
  }

  async function handleDeletePromo(promo) {
    if (confirm(`¿Deseas eliminar definitivamente la campaña "${promo.name}"?`)) {
      await deletePromotion(promo.id);
    }
  }
</script>

<section id="tab-library" class="tab-content active business-hub-section">

  <!-- ======================================================================= -->
  <!-- VISTA 0: HUB DE "MI NEGOCIO" (GRILLA DE TARJETAS)                       -->
  <!-- ======================================================================= -->
  {#if currentSubView === 'hub'}
    <div class="content-toolbar">
      <div>
        <h2>Mi Negocio</h2>
        <p class="section-desc">
          Panel central de información para tu asistente virtual de WhatsApp. Selecciona el módulo que deseas administrar:
        </p>
      </div>
    </div>

    <!-- Grilla de Tarjetas -->
    <div class="cards-grid">
      
      <!-- Tarjeta 1: Indicaciones al Asistente -->
      <div 
        class="hub-card primary-card"
        role="button"
        tabindex="0"
        onclick={() => currentSubView = 'indications'}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') currentSubView = 'indications'; }}
      >
        <div class="hub-card-header">
          <div class="card-icon tone-bg">🗣️</div>
          <span class="hub-card-badge active-badge">Identidad & Reglas</span>
        </div>
        <div class="hub-card-content">
          <h3>Indicaciones al Asistente</h3>
          <p>
            Define cómo debe hablarle a tus clientes (trato, tono, emojis), tus datos clave (horarios, envíos, pagos), preguntas frecuentes y reglas estrictas de lo que nunca debe hacer.
          </p>
        </div>
        <div class="hub-card-footer">
          <span class="btn-text-link">
            Configurar indicaciones <span>→</span>
          </span>
        </div>
      </div>

      <!-- Tarjeta 2: Catálogo de Productos (Tarea 2) -->
      <div 
        class="hub-card"
        role="button"
        tabindex="0"
        onclick={() => currentSubView = 'catalog'}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') currentSubView = 'catalog'; }}
      >
        <div class="hub-card-header">
          <div class="card-icon catalog-bg">📦</div>
          <span class="hub-card-badge catalog-badge">
            {$catalogStats.total > 0 ? `${$catalogStats.total} productos` : 'Cargar Word'}
          </span>
        </div>
        <div class="hub-card-content">
          <h3>Catálogo de Productos</h3>
          <p>
            Carga tu archivo Word (.docx) con la tabla obligatoria [Código, Nombre, Descripción, Precio, Observaciones]. El sistema valida códigos únicos y prepara el inventario.
          </p>
        </div>
        <div class="hub-card-footer">
          <span class="btn-text-link">
            {$catalogStats.total > 0 ? 'Ver y actualizar catálogo' : 'Subir catálogo en Word'} <span>→</span>
          </span>
        </div>
      </div>

      <!-- Tarjeta 3: Campañas y Promociones (Tarea 5) -->
      <div 
        class="hub-card"
        role="button"
        tabindex="0"
        onclick={() => currentSubView = 'promotions'}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') currentSubView = 'promotions'; }}
      >
        <div class="hub-card-header">
          <div class="card-icon promo-bg">🏷️</div>
          {#if $promotionsData.activeCount > 0}
            <span class="hub-card-badge active-badge">{$promotionsData.activeCount} Activa{$promotionsData.activeCount > 1 ? 's' : ''} hoy</span>
          {:else if $promotionsData.scheduledCount > 0}
            <span class="hub-card-badge scheduled-badge">{$promotionsData.scheduledCount} Programada{$promotionsData.scheduledCount > 1 ? 's' : ''}</span>
          {:else}
            <span class="hub-card-badge pending-badge">Vigencia Automática</span>
          {/if}
        </div>
        <div class="hub-card-content">
          <h3>Campañas y Promociones</h3>
          <p>
            Programa descuentos y campañas temporales exigiendo fecha de inicio y fin (máximo 2 activas simultáneamente). Se desactivan solas al vencer.
          </p>
        </div>
        <div class="hub-card-footer">
          <span class="btn-text-link">
            Ver promociones <span>→</span>
          </span>
        </div>
      </div>

    </div>

  <!-- ======================================================================= -->
  <!-- VISTA 1: INDICACIONES AL ASISTENTE                                      -->
  <!-- ======================================================================= -->
  {:else if currentSubView === 'indications'}
    <div class="subview-header">
      <button type="button" class="btn-back" onclick={() => currentSubView = 'hub'}>
        ← Volver a Mi Negocio
      </button>

      <div class="content-toolbar indications-toolbar">
        <div>
          <div class="title-with-badge">
            <h2>Indicaciones al Asistente</h2>
            {#if hasUnsavedIndications}
              <span class="status-pill warning">⚠️ Cambios sin guardar</span>
            {:else}
              <span class="status-pill success">✓ Actualizado</span>
            {/if}
          </div>
          <p class="section-desc">
            Enseña a tu asistente cómo atender a tus clientes por WhatsApp con tus propias palabras.
          </p>
        </div>

        <div class="toolbar-actions">
          {#if hasUnsavedIndications}
            <button 
              type="button" 
              class="btn btn-secondary" 
              onclick={handleDiscardIndications}
              disabled={isSavingIndications}
            >
              Descartar
            </button>
          {/if}

          <button 
            type="button" 
            class="btn btn-primary btn-save-main" 
            onclick={handleSaveIndications}
            disabled={isSavingIndications}
          >
            {#if isSavingIndications}
              <span class="spinner-small"></span> Guardando...
            {:else}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              Guardar indicaciones
            {/if}
          </button>
        </div>
      </div>
    </div>

    <!-- Las 4 Áreas de Texto Libre (Sin Documento Adicional) -->
    <div class="indications-container">

      <!-- Campo 1: ¿Cómo debe hablarle el bot a tus clientes? -->
      <div class="indication-card">
        <div class="card-header">
          <div class="header-icon tone-icon">🗣️</div>
          <div class="header-text">
            <h3>1. ¿Cómo debe hablarle a tus clientes?</h3>
            <p>Define su tono y forma de expresarse (formal, cercano, uso de emojis, si tus clientes reciben un apodo especial, etc.).</p>
          </div>
        </div>
        <div class="card-body">
          <textarea
            class="indication-textarea"
            rows="5"
            bind:value={botTone}
            placeholder="Ejemplos:
- Trato cercano y muy respetuoso. Háblales siempre de 'tú'.
- Usa 1 o 2 emojis por mensaje para que la conversación sea agradable y dinámica.
- A nuestros clientes nos encanta llamarlos 'moteros' o 'amigos'.
- Sé siempre breve, directo y amable al responder."
          ></textarea>
          <div class="card-footer-info">
            <span>💡 Consejo: Dale una personalidad que combine con la energía de tu marca.</span>
            {#if botTone.length > 0}
              <span class="char-count">{botTone.length} caracteres</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Campo 2: Datos clave de tu negocio -->
      <div class="indication-card">
        <div class="card-header">
          <div class="header-icon business-icon">🏪</div>
          <div class="header-text">
            <h3>2. Datos clave de tu negocio</h3>
            <p>Información básica esencial: horarios de atención, cobertura de envíos, formas de pago que aceptas y tiempos de entrega.</p>
          </div>
        </div>
        <div class="card-body">
          <textarea
            class="indication-textarea"
            rows="6"
            bind:value={businessInfo}
            placeholder="Ejemplos:
- Horario de atención: Lunes a Sábado de 8:00 AM a 6:00 PM (hora de Colombia). Domingos y festivos no abrimos.
- Cobertura de envíos: Despachamos a toda Colombia por Servientrega e Interrapidísimo.
- Tiempos de entrega: 1 a 2 días hábiles en ciudades principales y 3 a 5 días en otros municipios.
- Formas de pago: Bancolombia, Nequi, Daviplata y pago contraentrega en Bogotá.
- Ubicación: Carrera 15 # 85-32, Bogotá (atención presencial con cita previa)."
          ></textarea>
          <div class="card-footer-info">
            <span>💡 Consejo: Incluye las ciudades donde entregas y los números o medios oficiales de pago.</span>
            {#if businessInfo.length > 0}
              <span class="char-count">{businessInfo.length} caracteres</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Campo 3: Preguntas que siempre te hacen tus clientes -->
      <div class="indication-card">
        <div class="card-header">
          <div class="header-icon faq-icon">💬</div>
          <div class="header-text">
            <h3>3. Preguntas que siempre te hacen tus clientes</h3>
            <p>Escribe las dudas más repetitivas junto a su respuesta directa para que el asistente las responda de inmediato.</p>
          </div>
        </div>
        <div class="card-body">
          <textarea
            class="indication-textarea"
            rows="6"
            bind:value={faqText}
            placeholder="Ejemplos:
- ¿Tienen tienda física donde pueda ir a ver los productos?
  Sí, estamos en el C.C. Unicentro local 105 en Cali.

- ¿Cuánto cuesta el envío a domicilio?
  Cuesta $10.000 en el casco urbano. Es gratis si tu compra supera los $150.000.

- ¿Puedo pagar cuando reciba el producto?
  Sí, ofrecemos pago contraentrega en Bogotá, Medellín y Cali.

- ¿Cómo realizo un cambio de prenda?
  Tienes 15 días calendario presentando tu factura y la prenda sin uso."
          ></textarea>
          <div class="card-footer-info">
            <span>💡 Consejo: Cada pregunta con su respuesta clara evita que pierdas ventas por demoras en responder.</span>
            {#if faqText.length > 0}
              <span class="char-count">{faqText.length} caracteres</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Campo 4: Lo que el bot NUNCA debe hacer -->
      <div class="indication-card danger-card">
        <div class="card-header">
          <div class="header-icon never-icon">🚫</div>
          <div class="header-text">
            <h3>4. Lo que el bot NUNCA debe hacer</h3>
            <p>Reglas estrictas y prohibiciones para proteger tu negocio y evitar malos entendidos con tus clientes.</p>
          </div>
        </div>
        <div class="card-body">
          <textarea
            class="indication-textarea danger-textarea"
            rows="5"
            bind:value={neverDo}
            placeholder="Ejemplos:
- NUNCA des descuentos, rebajas ni precios diferentes a los indicados sin autorización.
- NUNCA compartas números de cuenta personal que no sean las oficiales del negocio.
- NUNCA discutas con un cliente. Si alguien muestra molestia o reclamos, ofrece disculpas e indica que un asesor humano lo contactará de inmediato.
- NUNCA prometas tiempos de entrega menores a 24 horas."
          ></textarea>
          <div class="card-footer-info">
            <span>🛡️ Seguridad: El asistente respetará estas prohibiciones en cada mensaje que responda.</span>
            {#if neverDo.length > 0}
              <span class="char-count">{neverDo.length} caracteres</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Barra Inferior de Guardado -->
      <div class="bottom-save-bar">
        <div class="bottom-save-text">
          {#if hasUnsavedIndications}
            <span class="text-warning">⚠️ Hay modificaciones pendientes por guardar en tu asistente.</span>
          {:else}
            <span class="text-success">✓ Todas las indicaciones están guardadas y activas.</span>
          {/if}
        </div>

        <div class="bottom-save-actions">
          {#if hasUnsavedIndications}
            <button 
              type="button" 
              class="btn btn-secondary" 
              onclick={handleDiscardIndications}
              disabled={isSavingIndications}
            >
              Descartar cambios
            </button>
          {/if}

          <button 
            type="button" 
            class="btn btn-primary btn-lg" 
            onclick={handleSaveIndications}
            disabled={isSavingIndications}
          >
            {#if isSavingIndications}
              <span class="spinner-small"></span> Guardando indicaciones...
            {:else}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              Guardar indicaciones
            {/if}
          </button>
        </div>
      </div>

    </div>

  <!-- ======================================================================= -->
  <!-- VISTA 2: CATÁLOGO DE PRODUCTOS (Tarea 2)                                 -->
  <!-- ======================================================================= -->
  {:else if currentSubView === 'catalog'}
    <div class="subview-header">
      <button type="button" class="btn-back" onclick={() => { currentSubView = 'hub'; handleCancelPreview(); }}>
        ← Volver a Mi Negocio
      </button>

      <div class="content-toolbar">
        <div>
          <h2>Catálogo de Productos</h2>
          <p class="section-desc">
            Sube tu catálogo en Word (.docx). El sistema validará automáticamente la tabla obligatoria y que los códigos no se repitan.
          </p>
        </div>
        <div>
          <button type="button" class="btn btn-secondary" onclick={loadProducts}>
            🔄 Refrescar productos
          </button>
        </div>
      </div>
    </div>

    <!-- Banner de Descarga de Plantilla Oficial -->
    <div class="template-download-banner">
      <div class="template-info">
        <div class="template-icon">📥</div>
        <div>
          <strong>¿Aún no tienes tu catálogo armado?</strong>
          <p>Descarga la plantilla oficial en Word (.docx) con la tabla y columnas ya configuradas. Solo debes abrirla, escribir tus productos y guardarla.</p>
        </div>
      </div>
      <a 
        href="/Plantilla_Catalogo_Productos.docx" 
        download="Plantilla_Catalogo_Productos.docx" 
        class="btn btn-download-template"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Descargar Plantilla en Word (.docx)
      </a>
    </div>

    <!-- Zona de Carga de Archivo Word -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="catalog-upload-card {isCatalogDragging ? 'dragging' : ''}"
      ondragover={handleCatalogDragOver}
      ondragleave={handleCatalogDragLeave}
      ondrop={handleCatalogDrop}
    >
      <div class="upload-icon">📄</div>
      <h3>Sube tu Catálogo en Word (.docx)</h3>
      <p>Arrastra tu archivo aquí o haz clic para seleccionarlo desde tu equipo.</p>
      
      <div class="upload-actions-row">
        <label class="btn btn-primary btn-upload-label">
          <input 
            type="file" 
            accept=".docx" 
            onchange={handleFileSelect} 
            style="display: none;" 
          />
          Seleccionar archivo Word (.docx)
        </label>
        <a 
          href="/Plantilla_Catalogo_Productos.docx" 
          download="Plantilla_Catalogo_Productos.docx" 
          class="btn btn-secondary btn-download-secondary"
        >
          📥 Descargar plantilla
        </a>
      </div>

      <div class="format-requirements-box">
        <strong>📋 Requisitos de la tabla en el Word:</strong>
        <ul>
          <li>Debe incluir una tabla con las 5 columnas: <code>Código</code>, <code>Nombre / Producto</code>, <code>Descripción</code>, <code>Precio</code> y <code>Observaciones</code>.</li>
          <li>Cada fila debe tener su <code>Código</code> obligatorio y estrictamente único (sin duplicados).</li>
        </ul>

        <div class="table-example-preview">
          <span class="example-title">💡 Estructura exacta requerida (ejemplo con encabezado y primera fila):</span>
          <div class="mini-table-scroll">
            <table class="mini-example-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre / Producto</th>
                  <th>Descripción</th>
                  <th>Precio</th>
                  <th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>PROD-001</code></td>
                  <td>Camiseta Polo Clásica</td>
                  <td>100% algodón suave peinado</td>
                  <td><span class="price-pill">$45.000</span></td>
                  <td>Tallas S, M, L en color negro</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="template-tip">
          💡 <em>Tip: Si usas la plantilla descargable de arriba, ya viene con las columnas exactas listas para llenar.</em>
        </div>
      </div>
    </div>

    <!-- Spinner de validación -->
    {#if $isValidating}
      <div class="validation-banner processing">
        <span class="spinner-small"></span>
        <span>Validando estructura de la tabla y códigos únicos en el archivo Word...</span>
      </div>
    {/if}

    <!-- Alerta de Error de Validación (ej. código duplicado o falta de columnas) -->
    {#if $validationError}
      <div class="validation-banner error">
        <div class="error-icon">⚠️</div>
        <div class="error-content">
          <strong>Archivo no admitido:</strong>
          <p>{$validationError}</p>
        </div>
        <button type="button" class="btn-close-error" onclick={() => validationError.set(null)}>✕</button>
      </div>
    {/if}

    <!-- Previsualización tras Validación Exitosa -->
    {#if $parsedPreview && $parsedPreview.valid}
      {@const comparison = $parsedPreview.comparison}
      {@const existingCodesSet = new Set((comparison?.existingCodes || []).map(c => c.toUpperCase()))}

      <div class="preview-box">
        <div class="preview-header">
          <div>
            <span class="success-tag">✓ Archivo validado exitosamente</span>
            <h3>{$parsedPreview.total} productos detectados en el documento</h3>
            <p class="preview-file-name">Archivo: <strong>{$parsedPreview.filename}</strong></p>

            {#if comparison}
              <div class="comparison-summary-bar">
                <span class="comp-badge add">
                  ✨ <strong>+{comparison.toAdd}</strong> nuevos
                </span>
                <span class="comp-badge update">
                  ↻ <strong>{comparison.toUpdate}</strong> existentes (mantienen fotos)
                </span>
                {#if comparison.missing && comparison.missing.length > 0}
                  <span class="comp-badge missing">
                    ⚠️ <strong>{comparison.missing.length}</strong> ausentes en el Word
                  </span>
                {/if}
              </div>
            {/if}
          </div>
          <div class="preview-actions">
            <button type="button" class="btn btn-secondary" onclick={handleCancelPreview} disabled={$isSyncing}>
              Cancelar
            </button>
            <button type="button" class="btn btn-primary btn-sync" onclick={handleConfirmSync} disabled={$isSyncing}>
              {#if $isSyncing}
                <span class="spinner-small"></span> Sincronizando...
              {:else}
                Sincronizar con el Inventario
              {/if}
            </button>
          </div>
        </div>

        <div class="preview-table-wrapper">
          <table class="preview-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Código</th>
                <th>Nombre / Producto</th>
                <th>Descripción</th>
                <th>Precio</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {#each $parsedPreview.products as p}
                {@const isExisting = existingCodesSet.has(p.code.toUpperCase())}
                <tr>
                  <td>
                    {#if isExisting}
                      <span class="badge-row-type update" title="Ya existe en el sistema. Se actualizará manteniendo sus fotos intactas.">↻ Actualiza</span>
                    {:else}
                      <span class="badge-row-type new" title="Nuevo producto">+ Nuevo</span>
                    {/if}
                  </td>
                  <td><span class="code-badge">{p.code}</span></td>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.description || '-'}</td>
                  <td><span class="price-text">{p.price || '-'}</span></td>
                  <td><span class="text-muted">{p.observations || '-'}</span></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- Lista Actual de Productos en el Sistema -->
    <div class="inventory-section">
      <div class="inventory-header">
        <h3>Productos en el Sistema ({$products.length})</h3>
        <div class="inventory-stats">
          <span class="stat-pill active">{$catalogStats.available} disponibles</span>
          <span class="stat-pill paused">{$catalogStats.unavailable} agotados</span>
        </div>
      </div>

      {#if $products.length === 0}
        <div class="empty-inventory">
          <span style="font-size: 32px;">📦</span>
          <p>Aún no has cargado ningún producto. Sube tu archivo Word arriba para comenzar.</p>
        </div>
      {:else}
        <div class="products-grid">
          {#each $products as prod (prod.id)}
            {@const photoList = Array.isArray(prod.images) ? prod.images : []}
            {@const isUploadingThis = uploadingPhotoForId === prod.id}

            <div class="product-card {prod.isAvailable ? '' : 'unavailable'}">
              <div class="prod-card-top">
                <div class="code-and-status">
                  <span class="prod-code">{prod.code}</span>
                  <span class="availability-badge {prod.isAvailable ? 'available' : 'unavailable'}">
                    {prod.isAvailable ? 'Disponible' : 'Agotado'}
                  </span>
                </div>

                <div class="card-top-actions">
                  <label class="switch switch-sm" title={prod.isAvailable ? 'Marcar como No disponible' : 'Marcar como Disponible'}>
                    <input 
                      type="checkbox" 
                      checked={prod.isAvailable} 
                      onchange={() => toggleProductAvailability(prod.id, !prod.isAvailable)} 
                    />
                    <span class="slider round"></span>
                  </label>
                </div>
              </div>

              <div class="prod-card-body">
                <strong class="prod-name">{prod.name}</strong>
                {#if prod.price}
                  <div class="prod-price">{prod.price}</div>
                {/if}
                {#if prod.description}
                  <p class="prod-desc">{prod.description}</p>
                {/if}
                {#if prod.observations}
                  <div class="prod-obs">ℹ️ {prod.observations}</div>
                {/if}
              </div>

              <!-- Sección de Fotografías de Producto (Hasta 4 fotos) -->
              <div class="prod-photos-section">
                <div class="photos-header">
                  <span class="photos-title">Fotografías</span>
                  <span class="photos-counter {photoList.length >= 4 ? 'full' : ''}">
                    📷 {photoList.length}/4
                  </span>
                </div>

                <div class="photos-thumbnails-row">
                  {#each photoList as imgUrl, idx}
                    <div class="photo-thumb-box">
                      <img src={imgUrl} alt="{prod.name} {idx + 1}" loading="lazy" />
                      <button 
                        type="button" 
                        class="btn-remove-thumb" 
                        onclick={() => handleDeletePhoto(prod.id, imgUrl)}
                        title="Eliminar esta foto"
                      >
                        ✕
                      </button>
                    </div>
                  {/each}

                  {#if photoList.length < 4}
                    <label class="photo-add-slot {isUploadingThis ? 'loading' : ''}">
                      <input 
                        type="file" 
                        accept="image/png, image/jpeg, image/webp" 
                        onchange={(e) => handleUploadPhoto(prod.id, e)} 
                        style="display: none;" 
                        disabled={isUploadingThis}
                      />
                      {#if isUploadingThis}
                        <span class="spinner-small"></span>
                      {:else}
                        <span class="add-plus">+</span>
                        <span class="add-text">Foto</span>
                      {/if}
                    </label>
                  {/if}
                </div>
              </div>

              <div class="prod-card-footer">
                <span class="status-indicator {prod.isAvailable ? 'available' : 'unavailable'}">
                  {prod.isAvailable ? '● Activo para WhatsApp' : '○ Agotado (No ofrecido)'}
                </span>

                <button 
                  type="button" 
                  class="btn-delete-card" 
                  onclick={() => promptDeleteProduct(prod)}
                  title="Eliminar producto"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  Eliminar
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Modal de Advertencia Disuasoria al Eliminar Producto (Tarea 3) -->
    {#if productToDelete}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="modal-backdrop" onclick={cancelDeleteModal}>
        <div class="modal-card deterrent-modal" onclick={(e) => e.stopPropagation()}>
          <div class="deterrent-icon">⚠️</div>
          <h3>¿Seguro que deseas eliminar este producto?</h3>
          <p class="deterrent-prod-name">
            <strong>{productToDelete.code}</strong> — {productToDelete.name}
          </p>

          <div class="deterrent-advice-box">
            <div class="advice-header">
              <span class="advice-star">💡</span>
              <strong>Te sugerimos marcarlo como "No disponible":</strong>
            </div>
            <ul>
              <li>
                <strong>Si lo marcas como No disponible:</strong> El bot de WhatsApp sabrá que sueles manejar este producto pero que actualmente está agotado, y <strong>conservarás tus fotos y descripción</strong> para cuando vuelvas a tener inventario.
              </li>
              <li>
                <strong>Si lo eliminas definitivamente:</strong> Se borrará por completo de tu sistema, perdiendo sus fotografías y configuración asociada.
              </li>
            </ul>
          </div>

          <div class="deterrent-buttons">
            <button 
              type="button" 
              class="btn btn-primary btn-deterrent-recommend"
              onclick={handleMarkUnavailableInstead}
            >
              ⏸️ Marcar como "No disponible" (Recomendado)
            </button>

            <div class="deterrent-secondary-row">
              <button 
                type="button" 
                class="btn btn-secondary" 
                onclick={cancelDeleteModal}
              >
                Cancelar
              </button>

              <button 
                type="button" 
                class="btn btn-danger-action" 
                onclick={handleConfirmDeleteProduct}
              >
                🗑️ Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Modal de Confirmación de Productos Ausentes (Tarea 4) -->
    {#if currentMissingProduct}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="modal-backdrop">
        <div class="modal-card sync-missing-modal" onclick={(e) => e.stopPropagation()}>
          <div class="missing-badge-top">
            <span class="missing-chip-icon">📦</span>
            <span>Producto {missingIndex + 1} de {missingQueue.length} ausente en el archivo</span>
          </div>

          <h3 class="missing-title">Revisión de Inventario</h3>

          <div class="missing-product-spotlight">
            <div class="spotlight-header">
              <span class="code-badge">{currentMissingProduct.code}</span>
              <span class="spotlight-name">{currentMissingProduct.name}</span>
            </div>

            <div class="spotlight-details">
              {#if currentMissingProduct.price}
                <div class="spotlight-detail-item">
                  <span class="detail-label">Precio:</span>
                  <strong>{currentMissingProduct.price}</strong>
                </div>
              {/if}
              {#if currentMissingProduct.description}
                <div class="spotlight-detail-item">
                  <span class="detail-label">Descripción:</span>
                  <span>{currentMissingProduct.description}</span>
                </div>
              {/if}
              <div class="spotlight-detail-item photos-safe">
                <span class="detail-label">Fotografías:</span>
                <span>📷 {currentMissingProduct.images?.length || 0} fotos asociadas (se conservan en el sistema)</span>
              </div>
            </div>
          </div>

          <div class="missing-question-box">
            <p>
              El producto con código <strong>{currentMissingProduct.code} - {currentMissingProduct.name}</strong> no figura en este catálogo nuevo. ¿Ya no está disponible?
            </p>
          </div>

          <div class="missing-actions-buttons">
            <button 
              type="button" 
              class="btn btn-warning-action" 
              onclick={handleMissingMarkUnavailable}
              disabled={isResolvingMissing}
            >
              {#if isResolvingMissing}
                <span class="spinner-small"></span> Actualizando...
              {:else}
                Ya no está disponible
              {/if}
            </button>

            <button 
              type="button" 
              class="btn btn-success-action" 
              onclick={handleMissingKeepAvailable}
              disabled={isResolvingMissing}
            >
              {#if isResolvingMissing}
                <span class="spinner-small"></span> Actualizando...
              {:else}
                Sigue disponible
              {/if}
            </button>
          </div>

          {#if missingQueue.length - missingIndex > 1}
            <div class="missing-footer-bulk">
              <button 
                type="button" 
                class="btn-text-link" 
                onclick={handleMarkAllRemainingUnavailable}
                disabled={isResolvingMissing}
              >
                Marcar los {missingQueue.length - missingIndex} productos restantes como "Ya no está disponible"
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}

  <!-- ======================================================================= -->
  <!-- VISTA 3: CAMPAÑAS Y PROMOCIONES (Tarea 5)                              -->
  <!-- ======================================================================= -->
  {:else if currentSubView === 'promotions'}
    <div class="subview-header">
      <button type="button" class="btn-back" onclick={() => currentSubView = 'hub'}>
        ← Volver a Mi Negocio
      </button>

      <div class="content-toolbar">
        <div>
          <h2>Campañas y Promociones Temporales</h2>
          <p class="section-desc">
            Sube promociones con fecha de inicio y vencimiento automático (máximo 2 campañas simultáneas activas). Se desactivan solas al vencer.
          </p>
        </div>
        <div class="toolbar-actions">
          <button
            type="button"
            class="btn btn-primary"
            onclick={openCreatePromoModal}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Nueva Campaña
          </button>
        </div>
      </div>
    </div>

    <!-- Barra de Métricas Rápidas -->
    <div class="promos-metrics-bar">
      <div class="promo-metric-card {$promotionsData.activeCount >= 2 ? 'metric-limit' : ''}">
        <div class="metric-icon">🔥</div>
        <div class="metric-info">
          <span class="metric-label">Vigentes Hoy (WhatsApp)</span>
          <span class="metric-value">{$promotionsData.activeCount} <span class="metric-max">/ 2 permitidas</span></span>
        </div>
        {#if $promotionsData.activeCount >= 2}
          <span class="metric-pill limit-pill">Cupo lleno</span>
        {:else}
          <span class="metric-pill available-pill">{2 - $promotionsData.activeCount} disponible{2 - $promotionsData.activeCount > 1 ? 's' : ''}</span>
        {/if}
      </div>

      <div class="promo-metric-card">
        <div class="metric-icon">📅</div>
        <div class="metric-info">
          <span class="metric-label">Programadas a Futuro</span>
          <span class="metric-value">{$promotionsData.scheduledCount}</span>
        </div>
      </div>

      <div class="promo-metric-card">
        <div class="metric-icon">⏰</div>
        <div class="metric-info">
          <span class="metric-label">Historial Expiradas</span>
          <span class="metric-value">{$promotionsData.expiredCount}</span>
        </div>
      </div>
    </div>

    <!-- Pestañas de Filtros -->
    <div class="promos-filter-bar">
      <button
        type="button"
        class="filter-tab {promoFilter === 'active' ? 'active' : ''}"
        onclick={() => promoFilter = 'active'}
      >
        <span>🔥</span> Activas y Programadas ({$promotionsData.activeCount + $promotionsData.scheduledCount})
      </button>
      <button
        type="button"
        class="filter-tab {promoFilter === 'expired' ? 'active' : ''}"
        onclick={() => promoFilter = 'expired'}
      >
        <span>⏰</span> Historial Expiradas ({$promotionsData.expiredCount})
      </button>
      <button
        type="button"
        class="filter-tab {promoFilter === 'all' ? 'active' : ''}"
        onclick={() => promoFilter = 'all'}
      >
        <span>🏷️</span> Todas ({$promotionsData.total})
      </button>
    </div>

    <!-- Lista de Promociones -->
    {#if $isLoadingPromotions}
      <div class="promos-loading-box">
        <div class="spinner"></div>
        <p>Cargando campañas y promociones...</p>
      </div>
    {:else}
      {@const displayedPromos = promoFilter === 'active' 
        ? [...$promotionsData.activeList, ...$promotionsData.scheduledList, ...$promotionsData.pausedList]
        : promoFilter === 'expired' 
          ? $promotionsData.expiredList 
          : $promotionsData.all}

      {#if displayedPromos.length === 0}
        <div class="promos-empty-state">
          <span class="empty-icon">🏷️</span>
          <h3>{promoFilter === 'expired' ? 'No hay campañas en el historial de expiradas' : 'No tienes campañas registradas'}</h3>
          <p>
            {promoFilter === 'expired'
              ? 'Cuando las promociones superen su fecha de fin, se desactivarán solas y pasarán aquí sin que tengas que acordarte de borrarlas.'
              : 'Sube un archivo Word (.docx) o texto con las ofertas especiales de tu negocio y fija sus fechas de vigencia para que el bot las informe automáticamente.'}
          </p>
          {#if promoFilter !== 'expired'}
            <button type="button" class="btn btn-primary" onclick={openCreatePromoModal}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Crear Primera Campaña
            </button>
          {/if}
        </div>
      {:else}
        <div class="promos-grid">
          {#each displayedPromos as promo (promo.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div 
              class="promo-card {promo.status}"
              role="button"
              tabindex="0"
              onclick={() => openEditPromoModal(promo)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openEditPromoModal(promo); }}
            >
              <div class="promo-card-top">
                <div class="promo-status-badge {promo.badgeClass}">
                  {#if promo.status === 'active'}
                    🔥 Vigente Hoy {#if promo.daysRemaining !== undefined}· {promo.daysRemaining === 0 ? 'Vence hoy' : `Vence en ${promo.daysRemaining} d`}{/if}
                  {:else if promo.status === 'scheduled'}
                    📅 Programada {#if promo.daysToStart !== undefined}· Inicia en {promo.daysToStart} d{/if}
                  {:else if promo.status === 'expired'}
                    ⏰ Finalizada · Expiró el {promo.endDate}
                  {:else}
                    ⏸️ Pausada
                  {/if}
                </div>

                <div class="promo-top-actions">
                  {#if promo.status !== 'expired'}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <label 
                      class="switch switch-sm" 
                      title={promo.isActive ? 'Pausar campaña' : 'Activar campaña'}
                      onclick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={promo.isActive}
                        onchange={(e) => { e.stopPropagation(); handleTogglePromo(promo); }}
                      />
                      <span class="slider round"></span>
                    </label>
                  {/if}
                  <button
                    type="button"
                    class="btn-delete-card"
                    title="Eliminar campaña"
                    onclick={(e) => { e.stopPropagation(); handleDeletePromo(promo); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Eliminar
                  </button>
                </div>
              </div>

              <div class="promo-card-body">
                <h3 class="promo-title">{promo.name}</h3>
                {#if promo.originalFilename}
                  <div class="promo-file-badge">
                    📄 {promo.originalFilename}
                  </div>
                {/if}

                <!-- Contenido de la oferta (estilo descriptivo y legible) -->
                <p class="promo-desc-note">
                  {promo.content.slice(0, 160)}{promo.content.length > 160 ? '...' : ''}
                </p>

                <div class="promo-dates-box">
                  <div class="date-item">
                    <span class="date-label">Inicio</span>
                    <span class="date-val">{promo.startDate}</span>
                  </div>
                  <span class="date-arrow">➔</span>
                  <div class="date-item">
                    <span class="date-label">Fin</span>
                    <span class="date-val">{promo.endDate}</span>
                  </div>
                </div>

                <!-- Nota interna / Instrucciones IA (estilo snippet destacado) -->
                {#if promo.description}
                  <div class="promo-preview-snippet">
                    <span class="snippet-tag">Nota interna para asesor e IA:</span>
                    <span>"{promo.description}"</span>
                  </div>
                {/if}
              </div>

              <div class="promo-card-footer">
                <span class="promo-footer-status">
                  {#if promo.status === 'active'}
                    <span class="status-dot-mini dot-active"></span> Activa en WhatsApp
                  {:else if promo.status === 'scheduled'}
                    <span class="status-dot-mini dot-scheduled"></span> Programada
                  {:else if promo.status === 'expired'}
                    <span class="status-dot-mini dot-expired"></span> Finalizada
                  {:else}
                    <span class="status-dot-mini dot-paused"></span> Pausada
                  {/if}
                </span>

                <button
                  type="button"
                  class="btn-view-content"
                  onclick={(e) => { e.stopPropagation(); openEditPromoModal(promo); }}
                >
                  ✏️ Editar oferta
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    <!-- Modal para Crear / Editar Campaña -->
    {#if showPromoModal}
      <div class="modal-backdrop" onclick={() => showPromoModal = false} role="presentation">
        <div
          class="modal-card promo-modal-card"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => { if (e.key === 'Escape') showPromoModal = false; }}
        >
          <div class="modal-header">
            <div>
              <h3>{promoEditingId ? '✏️ Editar Campaña o Promoción' : '🏷️ Programar Campaña o Promoción'}</h3>
              <p class="modal-subtitle">
                {promoEditingId 
                  ? 'Modifica las condiciones, fechas o instrucciones para el asistente IA' 
                  : 'Configura el período de vigencia y las ofertas para WhatsApp'}
              </p>
            </div>
            <button type="button" class="btn-close" onclick={() => showPromoModal = false} aria-label="Cerrar">&times;</button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label for="promo-name-input">Nombre de la Campaña / Promoción *</label>
              <input
                id="promo-name-input"
                type="text"
                placeholder="Ej: Semana Black Friday - 20% en toda la tienda"
                bind:value={promoName}
                required
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="promo-start-input">Fecha de Inicio *</label>
                <input
                  id="promo-start-input"
                  type="date"
                  min={promoEditingId ? undefined : getTodayString()}
                  bind:value={promoStartDate}
                  required
                />
              </div>

              <div class="form-group">
                <label for="promo-end-input">Fecha de Fin (Vigencia Automática) *</label>
                <input
                  id="promo-end-input"
                  type="date"
                  min={promoStartDate || getTodayString()}
                  bind:value={promoEndDate}
                  required
                />
              </div>
            </div>

            {#if promoConflictWarning}
              <div class="promo-conflict-alert">
                <span style="font-size: 1.1rem; line-height: 1;">⚠️</span>
                <span>{promoConflictWarning}</span>
              </div>
            {/if}

            <div class="form-group">
              <label for="promo-dropzone-file">
                Documento de la Promoción (Word .docx, .txt o .md)
                {#if promoEditingId && promoExistingFilename && !promoSelectedFile}
                  <span class="dropzone-current-note">— Archivo cargado: <strong>{promoExistingFilename}</strong></span>
                {/if}
              </label>
              <div
                class="promo-dropzone {isPromoDragging ? 'dragging' : ''} {(promoSelectedFile || (promoEditingId && promoExistingFilename)) ? 'has-file' : ''}"
                ondragover={handlePromoDragOver}
                ondragleave={handlePromoDragLeave}
                ondrop={handlePromoDrop}
                role="region"
              >
                {#if promoSelectedFile}
                  <div class="file-ready-box">
                    <span style="font-size: 28px;">📄</span>
                    <div>
                      <strong>{promoSelectedFile.name}</strong>
                      <span class="file-size">({Math.round(promoSelectedFile.size / 1024)} KB)</span>
                    </div>
                    <button
                      type="button"
                      class="btn-remove-file"
                      onclick={() => { promoSelectedFile = null; promoFileDataBase64 = null; }}
                    >
                      ✕ Cambiar
                    </button>
                  </div>
                {:else if promoEditingId && promoExistingFilename}
                  <div class="file-ready-box">
                    <span style="font-size: 28px;">📄</span>
                    <div>
                      <strong>{promoExistingFilename}</strong>
                      <span class="file-size">(Archivo adjunto actual)</span>
                    </div>
                    <label class="btn-replace-file">
                      🔄 Reemplazar por otro archivo
                      <input
                        type="file"
                        accept=".docx,.txt,.md"
                        style="display: none;"
                        onchange={handlePromoFileSelect}
                      />
                    </label>
                  </div>
                {:else}
                  <div class="dropzone-hint">
                    <span style="font-size: 28px; display: block; margin-bottom: 6px;">📎</span>
                    <p>Arrastra tu archivo aquí o <strong style="color: var(--accent-cyan);">haz clic para buscar</strong></p>
                    <span class="dropzone-subtext">Word (.docx), Markdown (.md) o texto (.txt)</span>
                    <input
                      id="promo-dropzone-file"
                      type="file"
                      accept=".docx,.txt,.md"
                      class="dropzone-file-input"
                      onchange={handlePromoFileSelect}
                    />
                  </div>
                {/if}
              </div>
            </div>

            <div class="form-group">
              <label for="promo-text-input">Contenido y términos de la promoción (lo que leerá el cliente) *</label>
              <textarea
                id="promo-text-input"
                rows="4"
                placeholder="Ej: 20% de descuento en referencias seleccionadas de calzado deportivo. Válido pagando por transferencia bancaria o en efectivo. No acumulable con otras ofertas."
                bind:value={promoTextContent}
              ></textarea>
            </div>

            <div class="form-group">
              <label for="promo-desc-input">
                Instrucciones e indicaciones para el asesor y asistente IA  (Opcional)
              </label>
              <p class="field-help">
                El bot de WhatsApp leerá estas instrucciones cuando hable de esta promoción con los clientes (ej: "Ofrecer solo si compran 2 o más", "Preguntar si tienen cupón antes de aplicar", etc.).
              </p>
              <input
                id="promo-desc-input"
                type="text"
                placeholder="Ej: Ofrecer este descuento sólo si el cliente pregunta por combos o compras al por mayor"
                bind:value={promoDescription}
              />
            </div>
          </div>

          <div class="modal-actions">
            <button
              type="button"
              class="btn btn-secondary"
              onclick={() => showPromoModal = false}
              disabled={$isSavingPromotion}
            >
              Cancelar
            </button>
            <button
              type="button"
              class="btn btn-primary"
              onclick={handleSavePromo}
              disabled={$isSavingPromotion || Boolean(promoConflictWarning)}
            >
              {#if $isSavingPromotion}
                <span class="spinner-small"></span> Guardando...
              {:else}
                {promoEditingId ? 'Guardar Cambios' : 'Guardar y Programar Campaña'}
              {/if}
            </button>
          </div>
        </div>
      </div>
    {/if}

  {/if}

</section>

<style>
  .business-hub-section {
    padding-bottom: 60px;
  }

  .btn-back {
    background: none;
    border: none;
    color: var(--accent-cyan);
    font-size: 0.92rem;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 14px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: opacity 0.2s;
  }

  .btn-back:hover {
    opacity: 0.8;
  }

  /* Grilla de Tarjetas de "Mi Negocio" */
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    margin-top: 24px;
  }

  .hub-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 24px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 18px;
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .hub-card:hover {
    transform: translateY(-3px);
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: var(--shadow-md);
  }

  .hub-card.primary-card {
    border-color: rgba(37, 211, 102, 0.3);
    background: linear-gradient(180deg, rgba(37, 211, 102, 0.04) 0%, var(--bg-card) 100%);
  }

  .hub-card.primary-card:hover {
    border-color: var(--wa-primary);
  }

  .hub-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .card-icon {
    font-size: 2rem;
    width: 52px;
    height: 52px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tone-bg { background: rgba(56, 189, 248, 0.14); }
  .catalog-bg { background: rgba(37, 211, 102, 0.14); }
  .promo-bg { background: rgba(168, 85, 247, 0.14); }

  .hub-card-badge {
    font-size: 0.76rem;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: var(--radius-full);
  }

  .active-badge {
    background: rgba(37, 211, 102, 0.15);
    color: var(--wa-primary);
    border: 1px solid rgba(37, 211, 102, 0.3);
  }

  .catalog-badge {
    background: rgba(56, 189, 248, 0.15);
    color: var(--accent-cyan);
    border: 1px solid rgba(56, 189, 248, 0.3);
  }

  .pending-badge {
    background: rgba(245, 158, 11, 0.15);
    color: var(--accent-amber);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .scheduled-badge {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .hub-card-content h3 {
    font-size: 1.25rem;
    color: #fff;
    margin-bottom: 8px;
    font-weight: 600;
  }

  .hub-card-content p {
    font-size: 0.88rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .hub-card-footer {
    border-top: 1px solid var(--border-subtle);
    padding-top: 14px;
  }

  .btn-text-link {
    color: var(--wa-primary);
    font-size: 0.9rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  /* Subvista: Indicaciones */
  .title-with-badge {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status-pill {
    font-size: 0.78rem;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: var(--radius-full);
  }

  .status-pill.success {
    background: rgba(37, 211, 102, 0.15);
    color: var(--wa-primary);
    border: 1px solid rgba(37, 211, 102, 0.3);
  }

  .status-pill.warning {
    background: rgba(245, 158, 11, 0.15);
    color: var(--accent-amber);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-save-main {
    box-shadow: 0 4px 14px rgba(37, 211, 102, 0.25);
    padding: 9px 20px;
    font-weight: 600;
  }

  .indications-container {
    display: flex;
    flex-direction: column;
    gap: 22px;
    margin-top: 18px;
    max-width: 1020px;
  }

  .indication-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 22px;
  }

  .indication-card.danger-card {
    border-left: 4px solid var(--accent-rose);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 16px;
  }

  .header-icon {
    font-size: 1.8rem;
    background: rgba(255, 255, 255, 0.05);
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .tone-icon { background: rgba(56, 189, 248, 0.12); }
  .business-icon { background: rgba(37, 211, 102, 0.12); }
  .faq-icon { background: rgba(168, 85, 247, 0.12); }
  .never-icon { background: rgba(244, 63, 94, 0.12); }

  .header-text h3 {
    font-size: 1.12rem;
    color: var(--text-main);
    margin-bottom: 4px;
    font-weight: 600;
  }

  .header-text p {
    font-size: 0.88rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .indication-textarea {
    width: 100%;
    background: rgba(9, 13, 22, 0.65);
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-sm);
    color: var(--text-main);
    font-family: var(--font-sans);
    font-size: 0.94rem;
    line-height: 1.55;
    padding: 14px 16px;
    resize: vertical;
    outline: none;
    transition: border-color 0.2s, background-color 0.2s;
  }

  .indication-textarea:focus {
    border-color: var(--wa-primary);
    background: rgba(9, 13, 22, 0.95);
  }

  .indication-textarea.danger-textarea:focus {
    border-color: var(--accent-rose);
  }

  .indication-textarea::placeholder {
    color: #475569;
    font-style: normal;
    white-space: pre-line;
    line-height: 1.5;
  }

  .card-footer-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    color: var(--text-dim);
    padding: 2px 4px 0 4px;
  }

  .char-count {
    font-family: var(--font-mono);
    color: var(--text-muted);
    font-size: 0.76rem;
  }

  .bottom-save-bar {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 18px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    box-shadow: var(--shadow-md);
  }

  .bottom-save-text {
    font-size: 0.92rem;
    font-weight: 500;
  }

  .text-warning { color: var(--accent-amber); }
  .text-success { color: var(--wa-primary); }

  .bottom-save-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .btn-lg {
    padding: 12px 26px;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .spinner-small {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: #fff;
    animation: spin 0.8s linear infinite;
    vertical-align: middle;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Subvista: Catálogo */
  .template-download-banner {
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(37, 211, 102, 0.08) 100%);
    border: 1px solid rgba(56, 189, 248, 0.28);
    border-radius: var(--radius-md);
    padding: 18px 24px;
    margin-top: 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .template-info {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1;
    min-width: 280px;
  }

  .template-icon {
    font-size: 2rem;
    background: rgba(56, 189, 248, 0.15);
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .template-info strong {
    font-size: 1rem;
    color: #fff;
    display: block;
    margin-bottom: 3px;
  }

  .template-info p {
    font-size: 0.86rem;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.4;
  }

  .btn-download-template {
    background: rgba(56, 189, 248, 0.18);
    color: var(--accent-cyan);
    border: 1px solid rgba(56, 189, 248, 0.4);
    font-weight: 600;
    padding: 10px 18px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    border-radius: var(--radius-sm);
    white-space: nowrap;
    transition: background 0.2s, border-color 0.2s, transform 0.15s;
  }

  .btn-download-template:hover {
    background: rgba(56, 189, 248, 0.3);
    border-color: var(--accent-cyan);
    transform: translateY(-1px);
    color: #fff;
  }

  .upload-actions-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .btn-download-secondary {
    text-decoration: none;
    font-weight: 500;
  }

  .template-tip {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed rgba(255, 255, 255, 0.1);
    font-size: 0.82rem;
    color: var(--accent-cyan);
  }

  .catalog-upload-card {
    background: rgba(15, 23, 42, 0.5);
    border: 2px dashed rgba(255, 255, 255, 0.16);
    border-radius: var(--radius-lg);
    padding: 40px 24px;
    text-align: center;
    margin-top: 18px;
    transition: border-color 0.2s, background-color 0.2s;
  }

  .catalog-upload-card.dragging {
    border-color: var(--wa-primary);
    background: rgba(37, 211, 102, 0.08);
  }

  .upload-icon {
    font-size: 42px;
    margin-bottom: 12px;
  }

  .catalog-upload-card h3 {
    font-size: 1.25rem;
    color: #fff;
    margin-bottom: 6px;
  }

  .catalog-upload-card p {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-bottom: 18px;
  }

  .btn-upload-label {
    cursor: pointer;
    display: inline-block;
    font-weight: 600;
  }

  .format-requirements-box {
    background: rgba(9, 13, 22, 0.7);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 14px 20px;
    margin-top: 24px;
    max-width: 650px;
    margin-left: auto;
    margin-right: auto;
    text-align: left;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .format-requirements-box strong {
    color: #fff;
    display: block;
    margin-bottom: 6px;
  }

  .format-requirements-box ul {
    margin-left: 20px;
  }

  .format-requirements-box code {
    background: rgba(255, 255, 255, 0.08);
    color: var(--wa-primary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--font-mono);
  }

  .table-example-preview {
    margin: 14px 0 10px 0;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
  }

  .example-title {
    font-size: 0.8rem;
    color: var(--accent-cyan);
    font-weight: 600;
    display: block;
    margin-bottom: 8px;
  }

  .mini-table-scroll {
    overflow-x: auto;
  }

  .mini-example-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    text-align: left;
  }

  .mini-example-table th {
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-weight: 600;
    white-space: nowrap;
  }

  .mini-example-table td {
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: var(--text-muted);
    white-space: nowrap;
    background: rgba(9, 13, 22, 0.5);
  }

  .mini-example-table td code {
    background: rgba(56, 189, 248, 0.15);
    color: var(--accent-cyan);
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 0.78rem;
  }

  .price-pill {
    color: var(--wa-primary);
    font-family: var(--font-mono);
    font-weight: 600;
  }

  .validation-banner {
    padding: 16px 20px;
    border-radius: var(--radius-sm);
    margin-top: 18px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }

  .validation-banner.processing {
    background: rgba(56, 189, 248, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.3);
    color: var(--accent-cyan);
    align-items: center;
  }

  .validation-banner.error {
    background: rgba(244, 63, 94, 0.12);
    border: 1px solid rgba(244, 63, 94, 0.4);
    color: #fecdd3;
    justify-content: space-between;
  }

  .error-icon {
    font-size: 1.6rem;
    flex-shrink: 0;
  }

  .error-content {
    flex: 1;
  }

  .error-content strong {
    color: #fff;
    display: block;
    margin-bottom: 4px;
  }

  .error-content p {
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .btn-close-error {
    background: none;
    border: none;
    color: #fecdd3;
    cursor: pointer;
    font-size: 1.1rem;
    padding: 0 4px;
  }

  /* Previsualización del Word */
  .preview-box {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 24px;
    margin-top: 22px;
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 18px;
    margin-bottom: 18px;
  }

  .success-tag {
    background: rgba(37, 211, 102, 0.15);
    color: var(--wa-primary);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: var(--radius-full);
    display: inline-block;
    margin-bottom: 6px;
  }

  .preview-header h3 {
    font-size: 1.2rem;
    color: #fff;
  }

  .preview-file-name {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .preview-actions {
    display: flex;
    gap: 12px;
  }

  .btn-sync {
    background: var(--wa-primary);
    color: #000;
    font-weight: 600;
  }

  .preview-table-wrapper {
    overflow-x: auto;
    max-height: 380px;
  }

  .preview-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }

  .preview-table th {
    text-align: left;
    padding: 10px 14px;
    background: rgba(9, 13, 22, 0.8);
    color: var(--text-muted);
    font-weight: 600;
    position: sticky;
    top: 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .preview-table td {
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .code-badge {
    background: rgba(56, 189, 248, 0.15);
    color: var(--accent-cyan);
    padding: 3px 8px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 0.8rem;
  }

  .price-text {
    font-family: var(--font-mono);
    color: var(--wa-primary);
    font-weight: 600;
  }

  /* Inventario */
  .inventory-section {
    margin-top: 36px;
  }

  .inventory-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 18px;
  }

  .inventory-header h3 {
    font-size: 1.15rem;
    color: #fff;
  }

  .inventory-stats {
    display: flex;
    gap: 10px;
  }

  .stat-pill {
    font-size: 0.8rem;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    font-weight: 500;
  }

  .stat-pill.active {
    background: rgba(37, 211, 102, 0.15);
    color: var(--wa-primary);
  }

  .stat-pill.paused {
    background: rgba(245, 158, 11, 0.15);
    color: var(--accent-amber);
  }

  .empty-inventory {
    text-align: center;
    padding: 50px 20px;
    background: rgba(15, 23, 42, 0.4);
    border-radius: var(--radius-md);
    color: var(--text-muted);
  }

  .empty-inventory p {
    margin-top: 10px;
  }

  .products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .product-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 18px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 14px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .product-card:hover {
    border-color: rgba(255, 255, 255, 0.16);
    box-shadow: var(--shadow-sm);
  }

  .product-card.unavailable {
    opacity: 0.72;
    border-color: rgba(244, 63, 94, 0.25);
    background: rgba(15, 23, 42, 0.5);
  }

  .prod-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .code-and-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .prod-code {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--accent-cyan);
    font-weight: 600;
    background: rgba(56, 189, 248, 0.12);
    padding: 3px 8px;
    border-radius: 4px;
  }

  .availability-badge {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: var(--radius-full);
  }

  .availability-badge.available {
    background: rgba(37, 211, 102, 0.15);
    color: var(--wa-primary);
  }

  .availability-badge.unavailable {
    background: rgba(244, 63, 94, 0.15);
    color: var(--accent-rose);
  }

  .prod-name {
    font-size: 1.05rem;
    color: #fff;
    display: block;
    margin-bottom: 4px;
    line-height: 1.35;
  }

  .prod-price {
    font-family: var(--font-mono);
    color: var(--wa-primary);
    font-weight: 600;
    font-size: 0.98rem;
    margin-bottom: 6px;
  }

  .prod-desc {
    font-size: 0.84rem;
    color: var(--text-muted);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .prod-obs {
    font-size: 0.78rem;
    color: var(--text-dim);
    margin-top: 6px;
  }

  /* Sección de Fotos (Hasta 4 fotos) */
  .prod-photos-section {
    background: rgba(9, 13, 22, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
  }

  .photos-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .photos-title {
    font-size: 0.78rem;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .photos-counter {
    font-size: 0.78rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }

  .photos-counter.full {
    color: var(--accent-cyan);
    font-weight: 600;
  }

  .photos-thumbnails-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .photo-thumb-box {
    position: relative;
    width: 60px;
    height: 60px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #000;
  }

  .photo-thumb-box img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .btn-remove-thumb {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    border: none;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .btn-remove-thumb:hover {
    background: var(--accent-rose);
  }

  .photo-add-slot {
    width: 60px;
    height: 60px;
    border: 1.5px dashed rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-dim);
    transition: border-color 0.2s, color 0.2s, background 0.2s;
  }

  .photo-add-slot:hover {
    border-color: var(--wa-primary);
    color: var(--wa-primary);
    background: rgba(37, 211, 102, 0.05);
  }

  .photo-add-slot.loading {
    cursor: wait;
    border-color: var(--accent-cyan);
  }

  .add-plus {
    font-size: 1.2rem;
    line-height: 1;
    font-weight: 600;
  }

  .add-text {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .prod-card-footer {
    border-top: 1px solid var(--border-subtle);
    padding-top: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
  }

  .status-indicator.available {
    color: var(--wa-primary);
  }

  .status-indicator.unavailable {
    color: var(--accent-rose);
  }

  .btn-delete-card {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 0.78rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }

  .btn-delete-card:hover {
    color: var(--accent-rose);
    background: rgba(244, 63, 94, 0.1);
  }

  /* Modal de Advertencia Disuasoria al Eliminar */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(5px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .deterrent-modal {
    background: var(--bg-card);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: var(--radius-lg);
    max-width: 520px;
    width: 100%;
    padding: 28px;
    text-align: center;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  }

  .deterrent-icon {
    font-size: 2.8rem;
    margin-bottom: 12px;
  }

  .deterrent-modal h3 {
    font-size: 1.3rem;
    color: #fff;
    margin-bottom: 6px;
  }

  .deterrent-prod-name {
    color: var(--accent-cyan);
    font-size: 0.95rem;
    margin-bottom: 18px;
  }

  .deterrent-advice-box {
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-left: 4px solid var(--accent-amber);
    border-radius: var(--radius-sm);
    padding: 16px;
    text-align: left;
    margin-bottom: 22px;
  }

  .advice-header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fff;
    font-size: 0.92rem;
    margin-bottom: 8px;
  }

  .deterrent-advice-box ul {
    margin-left: 20px;
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .deterrent-advice-box strong {
    color: #fff;
  }

  .deterrent-buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .btn-deterrent-recommend {
    width: 100%;
    padding: 12px;
    font-size: 0.95rem;
    font-weight: 600;
    box-shadow: 0 4px 14px rgba(37, 211, 102, 0.25);
  }

  .deterrent-secondary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .btn-danger-action {
    background: none;
    border: 1px solid rgba(244, 63, 94, 0.3);
    color: var(--accent-rose);
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-danger-action:hover {
    background: rgba(244, 63, 94, 0.15);
  }

  .placeholder-module-box {
    text-align: center;
    padding: 60px 20px;
    background: rgba(15, 23, 42, 0.4);
    border: 1px dashed var(--border-subtle);
    border-radius: var(--radius-lg);
    color: var(--text-muted);
    max-width: 600px;
    margin: 40px auto;
  }

  .placeholder-module-box h3 {
    color: #fff;
    margin-bottom: 8px;
  }

  /* Comparación y Sincronización Inteligente (Tarea 4) */
  .comparison-summary-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .comp-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 500;
  }

  .comp-badge.add {
    background: rgba(37, 211, 102, 0.12);
    color: #4ade80;
    border: 1px solid rgba(37, 211, 102, 0.3);
  }

  .comp-badge.update {
    background: rgba(59, 130, 246, 0.12);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .comp-badge.missing {
    background: rgba(245, 158, 11, 0.12);
    color: var(--accent-amber);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .badge-row-type {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .badge-row-type.new {
    background: rgba(37, 211, 102, 0.15);
    color: #4ade80;
    border: 1px solid rgba(37, 211, 102, 0.25);
  }

  .badge-row-type.update {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.25);
  }

  /* Modal de Confirmación de Productos Ausentes (Tarea 4) */
  .sync-missing-modal {
    background: var(--bg-card);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: var(--radius-lg);
    max-width: 520px;
    width: 100%;
    padding: 26px;
    text-align: left;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
  }

  .missing-badge-top {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.25);
    color: var(--accent-amber);
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 500;
    margin-bottom: 12px;
  }

  .missing-title {
    font-size: 1.25rem;
    color: #fff;
    margin-bottom: 14px;
  }

  .missing-product-spotlight {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    margin-bottom: 16px;
  }

  .spotlight-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .spotlight-name {
    font-weight: 600;
    color: #fff;
    font-size: 1.05rem;
  }

  .spotlight-details {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.85rem;
  }

  .spotlight-detail-item {
    display: flex;
    gap: 8px;
    color: var(--text-muted);
  }

  .spotlight-detail-item strong {
    color: #fff;
  }

  .photos-safe {
    color: #38bdf8;
    font-weight: 500;
  }

  .missing-question-box {
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.25);
    border-radius: var(--radius-sm);
    padding: 14px;
    margin-bottom: 18px;
    font-size: 0.95rem;
    line-height: 1.5;
    color: #fef3c7;
  }

  .missing-question-box strong {
    color: #fff;
  }

  .missing-actions-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
  }

  .btn-warning-action {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid var(--accent-amber);
    color: var(--accent-amber);
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }

  .btn-warning-action:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.28);
    color: #fff;
  }

  .btn-success-action {
    background: var(--primary);
    border: 1px solid var(--primary);
    color: #0b141a;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }

  .btn-success-action:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .missing-footer-bulk {
    text-align: center;
    padding-top: 10px;
    border-top: 1px solid var(--border-subtle);
  }

  .missing-footer-bulk .btn-text-link {
    font-size: 0.8rem;
    color: var(--text-muted);
    cursor: pointer;
    text-decoration: underline;
    background: none;
    border: none;
    padding: 4px;
  }

  .missing-footer-bulk .btn-text-link:hover {
    color: var(--accent-amber);
  }

  /* =========================================================================
     ESTILOS PARA CAMPAÑAS Y PROMOCIONES (Tarea 5)
     ========================================================================= */
  .hub-card-badge.scheduled-badge {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  /* Barra de Métricas */
  .promos-metrics-bar {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin: 20px 0;
  }

  .promo-metric-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    position: relative;
    overflow: hidden;
  }

  .promo-metric-card.metric-limit {
    border-color: rgba(245, 158, 11, 0.4);
    background: linear-gradient(180deg, rgba(245, 158, 11, 0.05) 0%, var(--bg-card) 100%);
  }

  .metric-icon {
    font-size: 28px;
  }

  .metric-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .metric-label {
    font-size: 0.78rem;
    color: var(--text-muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .metric-value {
    font-size: 1.45rem;
    font-weight: 700;
    color: #fff;
  }

  .metric-max {
    font-size: 0.85rem;
    color: var(--text-muted);
    font-weight: normal;
  }

  .metric-pill {
    margin-left: auto;
    font-size: 0.72rem;
    padding: 3px 8px;
    border-radius: 999px;
    font-weight: 600;
  }

  .metric-pill.available-pill {
    background: rgba(37, 211, 102, 0.15);
    color: #4ade80;
    border: 1px solid rgba(37, 211, 102, 0.3);
  }

  .metric-pill.limit-pill {
    background: rgba(245, 158, 11, 0.15);
    color: var(--accent-amber);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  /* Pestañas de Filtros */
  .promos-filter-bar {
    display: flex;
    gap: 10px;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 12px;
    margin-bottom: 22px;
  }

  .filter-tab {
    background: none;
    border: 1px solid transparent;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .filter-tab:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.04);
  }

  .filter-tab.active {
    background: rgba(37, 211, 102, 0.12);
    color: #4ade80;
    border-color: rgba(37, 211, 102, 0.3);
  }

  /* Empty / Loading States */
  .promos-empty-state, .promos-loading-box {
    background: var(--bg-card);
    border: 1px dashed var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 48px 24px;
    text-align: center;
    max-width: 600px;
    margin: 30px auto;
  }

  .promos-empty-state h3 {
    font-size: 1.2rem;
    color: #fff;
    margin-bottom: 8px;
  }

  .promos-empty-state p {
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  /* ========================================================================= */
  /* VISTA 3: ESTILOS DE CAMPAÑAS Y PROMOCIONES (Tarea 5)                     */
  /* ========================================================================= */

  /* Barra de Métricas */
  .promos-metrics-bar {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin: 18px 0 24px 0;
  }

  .promo-metric-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    position: relative;
    overflow: hidden;
    transition: transform 0.2s ease, border-color 0.2s ease;
  }

  .promo-metric-card:hover {
    border-color: rgba(255, 255, 255, 0.16);
  }

  .promo-metric-card.metric-limit {
    border-color: rgba(245, 158, 11, 0.4);
    background: linear-gradient(180deg, rgba(245, 158, 11, 0.06) 0%, var(--bg-card) 100%);
  }

  .metric-icon {
    font-size: 28px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-subtle);
  }

  .metric-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .metric-label {
    font-size: 0.76rem;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .metric-value {
    font-size: 1.45rem;
    font-weight: 700;
    color: #fff;
    line-height: 1.2;
  }

  .metric-max {
    font-size: 0.82rem;
    color: var(--text-muted);
    font-weight: 400;
  }

  .metric-pill {
    margin-left: auto;
    font-size: 0.74rem;
    padding: 4px 10px;
    border-radius: 999px;
    font-weight: 600;
    white-space: nowrap;
  }

  .metric-pill.available-pill {
    background: rgba(37, 211, 102, 0.15);
    color: #4ade80;
    border: 1px solid rgba(37, 211, 102, 0.3);
  }

  .metric-pill.limit-pill {
    background: rgba(245, 158, 11, 0.15);
    color: var(--accent-amber);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  /* Pestañas de Filtros */
  .promos-filter-bar {
    display: flex;
    gap: 10px;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 14px;
    margin-bottom: 22px;
    flex-wrap: wrap;
  }

  .filter-tab {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-subtle);
    padding: 8px 16px;
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: 0.86rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .filter-tab:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .filter-tab.active {
    background: rgba(37, 211, 102, 0.12);
    color: #4ade80;
    border-color: rgba(37, 211, 102, 0.35);
  }

  /* Loading & Empty States */
  .promos-loading-box,
  .promos-empty-state {
    background: var(--bg-card);
    border: 1px dashed var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 48px 24px;
    text-align: center;
    max-width: 580px;
    margin: 30px auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .promos-empty-state .empty-icon {
    font-size: 42px;
    margin-bottom: 4px;
  }

  .promos-empty-state h3 {
    font-size: 1.25rem;
    color: #fff;
    font-weight: 700;
  }

  .promos-empty-state p {
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.55;
    max-width: 460px;
  }

  /* Grilla de Promociones */
  .promos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
  }

  .promo-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 20px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 14px;
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .promo-card:hover {
    border-color: rgba(37, 211, 102, 0.4);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  .promo-card.active {
    border-color: rgba(37, 211, 102, 0.35);
    background: linear-gradient(180deg, rgba(37, 211, 102, 0.04) 0%, var(--bg-card) 100%);
  }

  .promo-card.expired {
    opacity: 0.7;
    border-color: rgba(255, 255, 255, 0.05);
  }

  .promo-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .promo-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 600;
  }

  .promo-status-badge.badge-active {
    background: rgba(37, 211, 102, 0.15);
    color: #4ade80;
    border: 1px solid rgba(37, 211, 102, 0.3);
  }

  .promo-status-badge.badge-scheduled {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .promo-status-badge.badge-expired {
    background: rgba(148, 163, 184, 0.12);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.25);
  }

  .promo-status-badge.badge-paused {
    background: rgba(245, 158, 11, 0.15);
    color: var(--accent-amber);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .promo-top-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .promo-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 6px;
    line-height: 1.35;
  }

  .promo-file-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-subtle);
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    color: var(--accent-cyan);
    margin-bottom: 8px;
    font-family: var(--font-mono);
  }

  .promo-desc-note {
    font-size: 0.88rem;
    color: #cbd5e1;
    margin-bottom: 12px;
    line-height: 1.5;
  }

  .promo-dates-box {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 12px;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    margin: 12px 0;
  }

  .date-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .date-label {
    font-size: 0.68rem;
    text-transform: uppercase;
    color: var(--text-muted);
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .date-val {
    font-size: 0.88rem;
    font-weight: 600;
    color: #fff;
    font-family: var(--font-mono);
  }

  .date-arrow {
    color: var(--accent-cyan);
    font-size: 0.95rem;
  }

  .promo-preview-snippet {
    font-size: 0.82rem;
    color: #e2e8f0;
    line-height: 1.45;
    background: rgba(56, 189, 248, 0.06);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    border-left: 3px solid var(--accent-cyan);
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 10px;
  }

  .snippet-tag {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--accent-cyan);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .promo-card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 12px;
    border-top: 1px solid var(--border-subtle);
    font-size: 0.82rem;
  }

  .promo-footer-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-dim);
    font-size: 0.8rem;
  }

  .status-dot-mini {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
  }

  .status-dot-mini.dot-active {
    background: #22c55e;
    box-shadow: 0 0 6px #22c55e;
  }

  .status-dot-mini.dot-scheduled {
    background: #60a5fa;
  }

  .status-dot-mini.dot-expired {
    background: #64748b;
  }

  .status-dot-mini.dot-paused {
    background: var(--accent-amber);
  }

  .btn-view-content {
    background: none;
    border: none;
    color: var(--accent-cyan);
    font-size: 0.84rem;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .btn-view-content:hover {
    color: #fff;
    background: rgba(56, 189, 248, 0.12);
  }

  /* Modals de Promoción */
  .promo-modal-card {
    max-width: 580px;
    width: 100%;
  }

  .promo-view-modal {
    max-width: 660px;
    width: 100%;
  }

  .modal-subtitle {
    font-size: 0.82rem;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 16px 0;
  }

  .promo-conflict-alert {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    color: #fca5a5;
    font-size: 0.86rem;
    line-height: 1.45;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .promo-dropzone {
    border: 2px dashed rgba(255, 255, 255, 0.15);
    border-radius: var(--radius-md);
    padding: 22px 16px;
    text-align: center;
    background: rgba(15, 23, 42, 0.6);
    cursor: pointer;
    position: relative;
    transition: all 0.2s ease;
  }

  .promo-dropzone:hover,
  .promo-dropzone.dragging {
    border-color: var(--accent-cyan);
    background: rgba(56, 189, 248, 0.05);
  }

  .promo-dropzone.has-file {
    border-style: solid;
    border-color: rgba(37, 211, 102, 0.4);
    background: rgba(37, 211, 102, 0.05);
  }

  .dropzone-file-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .dropzone-subtext {
    font-size: 0.78rem;
    color: var(--text-muted);
    display: block;
    margin-top: 4px;
  }

  .file-ready-box {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .btn-remove-file {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    font-size: 0.78rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-remove-file:hover {
    background: rgba(239, 68, 68, 0.25);
  }

  .btn-replace-file {
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.3);
    color: #38bdf8;
    padding: 5px 12px;
    border-radius: var(--radius-sm);
    font-size: 0.78rem;
    cursor: pointer;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }

  .btn-replace-file:hover {
    background: rgba(56, 189, 248, 0.25);
    color: #fff;
  }

  .dropzone-current-note {
    font-size: 0.8rem;
    color: var(--accent-cyan);
    font-weight: 500;
    margin-left: 6px;
  }
</style>
