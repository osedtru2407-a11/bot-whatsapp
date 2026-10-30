<script>
  import { botStatus, isQrModalOpen, autoCloseNotice, restartBot, disconnectBot } from '../../stores/botStatus';
  import { activeCompany } from '../../stores/company';
  import Modal from '../common/Modal.svelte';

  function handleClose() {
    isQrModalOpen.set(false);
  }

  async function handleDisconnect() {
    if (!confirm('¿Estás seguro de desvincular el WhatsApp de esta empresa? Dejará de responder mensajes hasta que vuelvas a escanear un QR.')) {
      return;
    }
    await disconnectBot();
  }
</script>

<Modal 
  isOpen={$isQrModalOpen}
  title="Vincular WhatsApp"
  subtitle="Conecta el número de teléfono exclusivo para {$activeCompany?.name || 'esta empresa'}"
  maxWidth="540px"
  onClose={handleClose}
>
  <div class="qr-modal-body">
    {#if $botStatus.status === 'ready'}
      <!-- Vista Conectado -->
      <div class="qr-view-box">
        <div class="qr-connected-card">
          <div class="qr-connected-icon">✅</div>
          <h4>¡WhatsApp Vinculado con Éxito!</h4>
          <p>
            El bot de "{$activeCompany?.name || 'esta empresa'}" ya está conectado y listo para atender mensajes y notas de voz.
          </p>

          <div class="qr-phone-box">
            <span>Número vinculado:</span>
            <strong>+{$botStatus.phone || $activeCompany?.phone || 'Conectado'}</strong>
          </div>

          {#if $autoCloseNotice}
            <div class="qr-auto-close-notice">
              {$autoCloseNotice}
            </div>
          {/if}

          <div style="margin-top: 18px;">
            <button 
              type="button" 
              class="btn btn-outline-sm btn-disconnect" 
              onclick={handleDisconnect}
            >
              Desvincular y cambiar de número
            </button>
          </div>
        </div>
      </div>

    {:else if $botStatus.status === 'qr_ready' && $botStatus.qrCode}
      <!-- Vista Escaneo de QR -->
      <div class="qr-view-box">
        <div class="qr-body">
          <div class="qr-image-wrapper">
            <img src={$botStatus.qrCode} alt="Código QR de WhatsApp" class="qr-image-img" />
          </div>
          <div class="qr-steps">
            <div class="step-item">
              <span class="step-num">1</span>
              <span>Abre <strong>WhatsApp</strong> en el celular de esta empresa.</span>
            </div>
            <div class="step-item">
              <span class="step-num">2</span>
              <span>Toca <strong>Menú (⋮)</strong> y selecciona <strong>Dispositivos vinculados</strong>.</span>
            </div>
            <div class="step-item">
              <span class="step-num">3</span>
              <span>Presiona <strong>Vincular un dispositivo</strong> y apunta tu cámara aquí.</span>
            </div>
          </div>
        </div>
      </div>

    {:else}
      <!-- Vista Cargando / Generando -->
      <div class="qr-view-box">
        <div class="qr-loading-box">
          <div class="spinner"></div>
          <h4>Generando Código QR...</h4>
          <p style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">
            Iniciando sesión aislada de WhatsApp Web para "{$activeCompany?.name || 'esta empresa'}". Por favor espera unos segundos.
          </p>
        </div>
      </div>
    {/if}
  </div>

  {#snippet actions()}
    <div style="display: flex; justify-content: space-between; width: 100%;">
      <button type="button" class="btn btn-secondary" onclick={restartBot}>
        🔄 Regenerar Código QR
      </button>
      <button type="button" class="btn btn-primary" onclick={handleClose}>
        Cerrar
      </button>
    </div>
  {/snippet}
</Modal>

<style>
  .qr-modal-body {
    padding: 8px 0;
  }

  .qr-image-img {
    width: 220px;
    height: 220px;
    border-radius: 8px;
    background: #fff;
    padding: 8px;
    display: block;
    margin: 0 auto;
  }

  .btn-disconnect {
    color: var(--accent-rose);
    border-color: rgba(244, 63, 94, 0.4);
  }
  .btn-disconnect:hover {
    background: rgba(244, 63, 94, 0.15);
  }

  .qr-auto-close-notice {
    font-size: 13px;
    color: #10b981;
    margin-top: 12px;
    font-weight: 600;
  }
</style>
