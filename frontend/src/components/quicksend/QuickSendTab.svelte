<script>
  import { api } from '../../services/api';
  import { quickSendInitialPhone } from '../../stores/ui';
  import { showToast } from '../../stores/toast';
  import { activeCompany } from '../../stores/company';
  import FileDropzone from '../common/FileDropzone.svelte';

  let phone = $state('');
  let message = $state('');
  let attachedMedia = $state(null);
  let isSending = $state(false);
  let lastSentResult = $state(null);
  let messageTextarea = $state();

  const presets = [
    { label: '👋 Hola Mundo', text: '¡Hola! 🚀 Este es un mensaje de prueba enviado directamente desde mi panel de WhatsApp.' },
    { label: '✅ Confirmación de Pedido', text: '¡Hola! 👋 Te contactamos para confirmar que tu pedido ha sido recibido con éxito y está siendo procesado.' },
    { label: '📖 Catálogo y Promos', text: '¡Hola! Te compartimos nuestro catálogo actualizado y la lista de ofertas y promociones especiales del mes. 🎁' },
    { label: '💳 Datos de Pago', text: '¡Hola! Aquí tienes nuestros canales de pago autorizados (Nequi, Daviplata, Bancolombia). Por favor envíanos tu comprobante cuando realices la transferencia.' }
  ];

  $effect(() => {
    if ($quickSendInitialPhone) {
      phone = $quickSendInitialPhone;
      quickSendInitialPhone.set('');
    }
  });

  function applyPreset(text) {
    message = text;
    if (messageTextarea) {
      messageTextarea.focus();
    }
  }

  function insertFormatting(wrapTag) {
    if (!messageTextarea) return;
    const start = messageTextarea.selectionStart;
    const end = messageTextarea.selectionEnd;
    const selected = message.substring(start, end);
    const wrapped = `${wrapTag}${selected || 'texto'}${wrapTag}`;
    message = message.substring(0, start) + wrapped + message.substring(end);
    messageTextarea.focus();
  }

  function insertText(snippet) {
    if (!messageTextarea) return;
    const start = messageTextarea.selectionStart;
    const end = messageTextarea.selectionEnd;
    message = message.substring(0, start) + snippet + message.substring(end);
    messageTextarea.focus();
  }

  function formatWhatsAppPreview(str) {
    if (!str) return '';
    return str
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~(.*?)~/g, '<del>$1</del>')
      .replace(/\n/g, '<br>');
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleSend(e) {
    if (e) e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) {
      showToast('Ingresa un número de WhatsApp de destino', 'warning');
      return;
    }
    if (!message.trim() && !attachedMedia) {
      showToast('Ingresa un mensaje o adjunta un archivo para enviar', 'warning');
      return;
    }

    isSending = true;
    lastSentResult = null;

    try {
      const res = await api.post('/api/send', {
        phone: cleanPhone,
        message: message.trim(),
        media: attachedMedia
      });

      lastSentResult = {
        success: true,
        phone: cleanPhone,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        hasMedia: !!attachedMedia
      };

      showToast(`¡Mensaje entregado con éxito a +${cleanPhone}!`, 'success');
      message = '';
      attachedMedia = null;
    } catch (err) {
      lastSentResult = {
        success: false,
        error: err.message
      };
      showToast(err.message, 'error');
    } finally {
      isSending = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<section id="tab-quick-send" class="tab-content active">
  <div class="content-toolbar">
    <div>
      <h2>Envío Directo / Prueba de WhatsApp</h2>
      <p class="section-desc">Envía mensajes de texto, fotos, audios o catálogos en PDF inmediatamente a cualquier número de WhatsApp.</p>
    </div>
  </div>

  <div class="quick-send-grid">
    <!-- Columna Izquierda: Formulario de Redacción -->
    <div class="composer-card">
      <div class="composer-header">
        <div class="composer-badge">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          <span>Redacción Rápida</span>
        </div>
        <span class="company-badge-name">Bot: {$activeCompany?.name || 'Empresa'}</span>
      </div>

      <form onsubmit={handleSend} class="composer-form">
        <!-- Teléfono de Destino -->
        <div class="form-group">
          <label for="quick-phone-input">Número de WhatsApp Destinatario</label>
          <div class="phone-input-group">
            <span class="phone-prefix">+</span>
            <input 
              type="tel" 
              id="quick-phone-input" 
              class="phone-field"
              placeholder="573001234567" 
              bind:value={phone} 
              required 
            />
          </div>
          <span class="field-hint">Incluye código de país sin espacios ni símbolos (Ej: 57 para Colombia, 52 para México).</span>
        </div>

        <!-- Atajos / Plantillas Rápidas -->
        <div class="form-group">
          <span class="field-label-small">⚡ Plantillas / Presets Rápidos:</span>
          <div class="preset-chips">
            {#each presets as preset}
              <button 
                type="button" 
                class="preset-chip" 
                onclick={() => applyPreset(preset.text)}
              >
                {preset.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Mensaje de Texto con Barra de Formato -->
        <div class="form-group">
          <div class="message-label-row">
            <label for="quick-msg-input">Mensaje o Leyenda (Caption)</label>
            <div class="formatting-toolbar">
              <button type="button" class="format-btn" onclick={() => insertFormatting('*')} title="Negrita (*texto*)">*B*</button>
              <button type="button" class="format-btn" onclick={() => insertFormatting('_')} title="Cursiva (_texto_)">_I_</button>
              <button type="button" class="format-btn" onclick={() => insertFormatting('~')} title="Tachado (~texto~)">~S~</button>
              <button type="button" class="format-btn" onclick={() => insertText('👋 ')} title="Mano">👋</button>
              <button type="button" class="format-btn" onclick={() => insertText('🚀 ')} title="Cohete">🚀</button>
              <button type="button" class="format-btn" onclick={() => insertText('💰 ')} title="Dinero">💰</button>
              <button type="button" class="format-btn" onclick={() => insertText('✅ ')} title="Check">✅</button>
            </div>
          </div>
          <textarea 
            id="quick-msg-input" 
            bind:this={messageTextarea}
            rows="5" 
            placeholder="Escribe el mensaje que deseas enviar directamente por WhatsApp..." 
            bind:value={message}
          ></textarea>
          <div class="textarea-footer">
            <span class="char-counter">{message.length} caracteres</span>
            <span class="shortcut-hint">Tip: Presiona <kbd>Ctrl</kbd> + <kbd>Enter</kbd> para enviar</span>
          </div>
        </div>

        <!-- Archivo Adjunto -->
        <div class="form-group">
          <div class="field-label-small">📎 Archivo Adjunto (Foto, PDF, Audio o Documento)</div>
          <FileDropzone 
            category="quick" 
            media={attachedMedia} 
            onMediaChange={(newMedia) => attachedMedia = newMedia} 
          />
        </div>

        <!-- Botón de Envío Prominente -->
        <div class="submit-action-row">
          <button type="submit" class="btn btn-primary btn-send-prominent" disabled={isSending}>
            {#if isSending}
              <span class="spinner-sm"></span>
              <span>Enviando mensaje a WhatsApp...</span>
            {:else}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
              <span>Enviar Ahora por WhatsApp</span>
            {/if}
          </button>
        </div>
      </form>

      {#if lastSentResult}
        <div class="result-box {lastSentResult.success ? 'success' : 'error'}">
          {#if lastSentResult.success}
            <div class="result-icon">✓</div>
            <div class="result-content">
              <strong>¡Mensaje enviado con éxito!</strong>
              <span>Entregado al destinatario +{lastSentResult.phone} a las {lastSentResult.time}</span>
            </div>
          {:else}
            <div class="result-icon">✕</div>
            <div class="result-content">
              <strong>Error al enviar</strong>
              <span>{lastSentResult.error || 'No se pudo conectar con WhatsApp Web'}</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Columna Derecha: Vista Previa en Vivo & Consejos -->
    <div class="preview-column">
      <!-- Tarjeta de Vista Previa de WhatsApp -->
      <div class="live-preview-card">
        <div class="live-preview-header">
          <div class="preview-contact">
            <div class="preview-avatar">
              <svg class="whatsapp-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.35C9.37 7.35 9.11 7.41 8.89 7.65C8.68 7.89 8.07 8.46 8.07 9.62C8.07 10.78 8.92 11.9 9.04 12.06C9.16 12.22 10.67 14.63 13.06 15.58C15.04 16.37 15.45 16.21 15.87 16.17C16.3 16.13 17.24 15.61 17.43 15.07C17.63 14.53 17.63 14.07 17.57 13.97C17.51 13.87 17.35 13.81 17.11 13.69C16.87 13.57 15.68 12.98 15.46 12.9C15.24 12.82 15.08 12.78 14.92 13.02C14.76 13.26 14.3 13.81 14.16 13.97C14.02 14.13 13.88 14.15 13.64 14.03C13.4 13.91 12.63 13.66 11.71 12.84C10.99 12.2 10.51 11.41 10.37 11.17C10.23 10.93 10.36 10.8 10.48 10.68C10.59 10.57 10.73 10.39 10.85 10.25C10.97 10.11 11.01 10.01 11.09 9.85C11.17 9.69 11.13 9.55 11.07 9.43C11.01 9.31 10.55 8.17 10.35 7.71C10.16 7.25 9.97 7.31 9.83 7.31C9.69 7.3 9.53 7.35 9.53 7.35Z"/>
              </svg>
            </div>
            <div>
              <div class="preview-recipient-title">
                {phone.trim() ? `+${phone.replace(/\D/g, '')}` : 'Destinatario'}
              </div>
              <span class="preview-sub">Vista previa del mensaje de salida</span>
            </div>
          </div>
        </div>

        <div class="live-preview-body">
          <div class="preview-bubble">
            {#if attachedMedia}
              <div class="preview-media-attachment">
                {#if (attachedMedia.mimetype || '').startsWith('image/')}
                  <img src={attachedMedia.url} alt={attachedMedia.filename} class="preview-media-img" />
                {:else}
                  <div class="preview-doc-card">
                    <span class="preview-doc-icon">{(attachedMedia.mimetype || '').includes('pdf') ? '📄' : '📁'}</span>
                    <div class="preview-doc-meta">
                      <span class="preview-doc-name">{attachedMedia.filename || attachedMedia.originalName}</span>
                      <span class="preview-doc-type">Documento adjunto</span>
                    </div>
                  </div>
                {/if}
              </div>
            {/if}

            {#if message.trim()}
              <div class="preview-text">
                {@html formatWhatsAppPreview(message)}
              </div>
            {:else if !attachedMedia}
              <div class="preview-placeholder">
                El texto y archivo que redactes a la izquierda aparecerán aquí tal como los verá tu cliente en su WhatsApp...
              </div>
            {/if}

            <div class="preview-meta-row">
              <span class="preview-time">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span class="preview-checks">✓✓</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Consejos y Buenas Prácticas -->
      <div class="tips-card">
        <h4>💡 Recomendaciones de Envío Directo</h4>
        <ul class="tips-list">
          <li><strong>Formato Internacional:</strong> Ingresa el código del país sin el símbolo `+` (Colombia: `57`, México: `52`, España: `34`).</li>
          <li><strong>Catálogos y Fotos:</strong> Los archivos PDF e imágenes se envían con su compresión nativa para una descarga rápida en celulares.</li>
          <li><strong>Audios y Mensajes de Voz:</strong> Si subes un audio, el destinatario lo reproducirá directamente en su chat.</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<style>
  .quick-send-grid {
    display: grid;
    grid-template-columns: 1fr 420px;
    gap: 28px;
    margin-top: 20px;
    align-items: flex-start;
  }

  @media (max-width: 980px) {
    .quick-send-grid {
      grid-template-columns: 1fr;
    }
  }

  .composer-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 28px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  }

  .composer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 18px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .composer-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--wa-primary);
    font-size: 0.92rem;
    font-weight: 700;
  }

  .company-badge-name {
    font-size: 0.78rem;
    color: var(--text-muted);
    background: rgba(255, 255, 255, 0.05);
    padding: 3px 10px;
    border-radius: var(--radius-full);
  }

  .composer-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .phone-input-group {
    display: flex;
    align-items: center;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: all 0.2s;
  }
  .phone-input-group:focus-within {
    border-color: var(--wa-primary);
    box-shadow: 0 0 0 3px rgba(37, 211, 102, 0.15);
  }

  .phone-prefix {
    padding: 10px 14px;
    color: var(--wa-primary);
    font-weight: 700;
    font-size: 1.05rem;
    background: rgba(37, 211, 102, 0.08);
    border-right: 1px solid var(--border-subtle);
    user-select: none;
  }

  .phone-field {
    flex: 1;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    font-family: var(--font-mono);
    font-size: 1rem !important;
    padding: 12px 14px !important;
    color: #fff !important;
    letter-spacing: 0.5px;
  }

  .field-hint {
    font-size: 0.78rem;
    color: var(--text-dim);
    margin-top: 4px;
    display: block;
  }

  .field-label-small {
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 8px;
    display: block;
  }

  .preset-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .preset-chip {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    padding: 6px 12px;
    border-radius: var(--radius-full);
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .preset-chip:hover {
    background: rgba(37, 211, 102, 0.12);
    border-color: rgba(37, 211, 102, 0.4);
    color: var(--wa-primary);
    transform: translateY(-1px);
  }

  .message-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .formatting-toolbar {
    display: flex;
    gap: 4px;
  }

  .format-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .format-btn:hover {
    background: rgba(37, 211, 102, 0.15);
    color: #fff;
    border-color: rgba(37, 211, 102, 0.4);
  }

  .textarea-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
    font-size: 0.74rem;
    color: var(--text-dim);
  }

  .shortcut-hint kbd {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    padding: 1px 4px;
    font-family: inherit;
  }

  .submit-action-row {
    margin-top: 10px;
  }

  .btn-send-prominent {
    width: 100%;
    padding: 14px 20px;
    font-size: 1rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-shadow: 0 4px 15px rgba(37, 211, 102, 0.3);
    transition: all 0.2s ease;
  }
  .btn-send-prominent:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(37, 211, 102, 0.45);
  }

  .spinner-sm {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Result Box */
  .result-box {
    margin-top: 20px;
    padding: 14px 18px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    gap: 14px;
    animation: fadeIn 0.3s ease;
  }
  .result-box.success {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #10b981;
  }
  .result-box.error {
    background: rgba(244, 63, 94, 0.15);
    border: 1px solid rgba(244, 63, 94, 0.4);
    color: #fb7185;
  }
  .result-icon {
    font-size: 1.3rem;
    font-weight: bold;
  }
  .result-content {
    display: flex;
    flex-direction: column;
    font-size: 0.85rem;
    line-height: 1.4;
    color: var(--text-main);
  }

  /* Columna Derecha: Vista Previa */
  .preview-column {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .live-preview-card {
    background: #0b141a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.5);
  }

  .live-preview-header {
    background: #202c33;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .preview-contact {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .preview-avatar {
    width: 36px;
    height: 36px;
    background: var(--wa-teal);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }

  .preview-recipient-title {
    font-size: 0.9rem;
    font-weight: 700;
    color: #e9edef;
  }

  .preview-sub {
    font-size: 0.72rem;
    color: #8696a0;
  }

  .live-preview-body {
    padding: 20px 16px;
    min-height: 220px;
    background-color: #0b141a;
    background-image: radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 20px 20px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .preview-bubble {
    align-self: flex-end;
    background: #005c4b;
    color: #e9edef;
    padding: 10px 14px;
    border-radius: 10px;
    border-top-right-radius: 0;
    max-width: 90%;
    word-break: break-word;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
  }

  .preview-text {
    font-size: 0.85rem;
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .preview-placeholder {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.5);
    font-style: italic;
    line-height: 1.4;
  }

  .preview-meta-row {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
  }

  .preview-time {
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .preview-checks {
    color: #53bdeb;
    font-size: 0.75rem;
    font-weight: bold;
  }

  .preview-media-attachment {
    margin-bottom: 8px;
    border-radius: 6px;
    overflow: hidden;
  }

  .preview-media-img {
    width: 100%;
    max-height: 160px;
    object-fit: cover;
    border-radius: 6px;
    display: block;
  }

  .preview-doc-card {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(0, 0, 0, 0.25);
    padding: 8px 12px;
    border-radius: 6px;
  }
  .preview-doc-icon {
    font-size: 1.4rem;
  }
  .preview-doc-meta {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .preview-doc-name {
    font-size: 0.8rem;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .preview-doc-type {
    font-size: 0.68rem;
    color: rgba(255, 255, 255, 0.6);
  }

  /* Tips Card */
  .tips-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 20px;
  }

  .tips-card h4 {
    font-size: 0.88rem;
    color: #fff;
    margin-bottom: 10px;
  }

  .tips-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0;
  }

  .tips-list li {
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.45;
  }

  .tips-list strong {
    color: var(--text-main);
  }
</style>
