<script>
  import { 
    selectedChatLead, 
    isChatModalOpen, 
    chatMessages, 
    isChatLoading, 
    isLiveChat, 
    loadChatHistory, 
    sendChatMessage, 
    togglePauseLead,
    closeLeadChat
  } from '../../stores/leads';
  import { hasPermission } from '../../stores/auth';
  import Modal from '../common/Modal.svelte';
  import { tick } from 'svelte';

  let replyText = $state('');
  let isSending = $state(false);
  let messagesContainer = $state(null);

  function handleClose() {
    closeLeadChat();
    replyText = '';
  }

  async function scrollToBottom() {
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  // Auto-scroll when messages change or modal opens
  $effect(() => {
    if ($isChatModalOpen && $chatMessages.length) {
      scrollToBottom();
    }
  });

  async function handleRefresh() {
    if (!$selectedChatLead?.phone) return;
    await loadChatHistory($selectedChatLead.phone);
    scrollToBottom();
  }

  async function handleSend(e) {
    e?.preventDefault();
    const text = replyText.trim();
    if (!text || isSending || !$selectedChatLead?.phone) return;

    isSending = true;
    replyText = '';
    const res = await sendChatMessage($selectedChatLead.phone, text);
    isSending = false;

    if (res.success) {
      scrollToBottom();
    } else {
      replyText = text; // restore text if failed
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateSeparator(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Hoy';
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-CO', { dateStyle: 'medium' });
  }
</script>

<Modal
    isOpen={$isChatModalOpen}
    title={`💬 Conversación con ${$selectedChatLead?.name || 'Cliente'}`}
    subtitle={`+${$selectedChatLead?.phone || ''} • Etiqueta: ${$selectedChatLead?.tag || 'Nuevo'}`}
    maxWidth="760px"
    onClose={handleClose}
>
    <!-- Barra de contexto y controles rápidos -->
    <div class="chat-context-bar">
        <div class="chat-status-info">
            {#if $selectedChatLead?.humanPaused}
                <span class="status-pill paused"
                    >🛑 Bot Pausado (Atención Humana)</span
                >
            {:else}
                <span class="status-pill active"
                    >🤖 Bot Activo (Respuesta Automática)</span
                >
            {/if}

            {#if $isLiveChat}
                <span
                    class="status-pill live"
                    title="Mensajes sincronizados en tiempo real"
                >
                    <span class="live-dot"></span> Tiempo Real Activo
                </span>
            {:else}
                <span
                    class="status-pill history"
                    title="Mostrando historial registrado en la base de datos"
                    >📦 Historial Local</span
                >
            {/if}
        </div>

        <div class="chat-header-actions">
            {#if $hasPermission('leads:pause') && $selectedChatLead?.phone}
                <button
                    type="button"
                    class="btn-mini-toggle"
                    onclick={() => togglePauseLead($selectedChatLead.phone)}
                    title="Alternar entre atención automática del bot y atención humana"
                >
                    {$selectedChatLead.humanPaused
                        ? 'Reactivar Bot'
                        : 'Pausar Bot'}
                </button>
            {/if}

            <button
                type="button"
                class="btn-mini-refresh"
                onclick={handleRefresh}
                disabled={$isChatLoading}
                title="Actualizar mensajes desde WhatsApp"
            >
                <span class={$isChatLoading ? 'spin' : ''}>🔄</span>
                <span>Actualizar</span>
            </button>
        </div>
    </div>

    <!-- Contenedor estilo WhatsApp Web -->
    <div class="chat-viewport" bind:this={messagesContainer}>
        {#if $isChatLoading && $chatMessages.length === 0}
            <div class="chat-loading-state">
                <div class="chat-spinner"></div>
                <p>Cargando mensajes de WhatsApp...</p>
            </div>
        {:else if $chatMessages.length === 0}
            <div class="chat-empty-state">
                <div style="font-size: 40px; margin-bottom: 12px;">💬</div>
                <h4>No hay mensajes en este chat aún</h4>
                <p>
                    Escribe una respuesta en la barra inferior para iniciar la
                    conversación con este cliente.
                </p>
            </div>
        {:else}
            <div class="messages-stream">
                {#each $chatMessages as msg, idx (msg.id || idx)}
                    {@const prevMsg = idx > 0 ? $chatMessages[idx - 1] : null}
                    {@const showDate =
                        !prevMsg ||
                        formatDateSeparator(msg.timestamp) !==
                            formatDateSeparator(prevMsg.timestamp)}
                    {@const isAudio =
                        msg.type === 'ptt' || msg.type === 'audio'}
                    {@const isImage =
                        msg.type === 'image' ||
                        (msg.mediaMimetype || '').startsWith('image/')}

                    {#if showDate}
                        <div class="date-separator">
                            <span>{formatDateSeparator(msg.timestamp)}</span>
                        </div>
                    {/if}

                    <div
                        class="message-bubble-row {msg.fromMe
                            ? 'outgoing'
                            : 'incoming'}"
                    >
                        <div
                            class="bubble {msg.fromMe
                                ? 'outgoing'
                                : 'incoming'}"
                        >
                            {#if isAudio}
                                <div class="media-audio-box">
                                    <div class="audio-label">
                                        🎤 Nota de voz / Audio
                                    </div>
                                    {#if msg.mediaUrl}
                                        <!-- svelte-ignore a11y_media_has_caption -->
                                        <audio
                                            controls
                                            src={msg.mediaUrl}
                                            class="bubble-audio-player"
                                        ></audio>
                                    {/if}
                                </div>
                            {:else if isImage && msg.mediaUrl}
                                <div class="media-image-box">
                                    <a
                                        href={msg.mediaUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <img
                                            src={msg.mediaUrl}
                                            alt="Adjunto recibido"
                                            class="bubble-image"
                                            loading="lazy"
                                        />
                                    </a>
                                </div>
                            {/if}

                            {#if msg.body && msg.body !== '🎤 [Nota de voz]' && msg.body !== '📎 [Archivo adjunto]'}
                                <div class="bubble-text">{msg.body}</div>
                            {:else if !isAudio && !isImage && msg.hasMedia}
                                <div class="bubble-media-placeholder">
                                    📎 [Archivo adjunto]
                                </div>
                            {/if}

                            <div class="bubble-meta">
                                <span class="bubble-time"
                                    >{formatTime(msg.timestamp)}</span
                                >
                                {#if msg.fromMe}
                                    <span class="bubble-ticks" title="Entregado"
                                        >✓✓</span
                                    >
                                {/if}
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Barra inferior para responder -->
    <form onsubmit={handleSend} class="chat-reply-bar">
        <textarea
            class="chat-input"
            placeholder="Escribe un mensaje para responder al cliente... (Enter para enviar)"
            bind:value={replyText}
            onkeydown={handleKeyDown}
            rows="1"
            disabled={isSending}></textarea>
        <button
            type="submit"
            class="btn-send-chat"
            disabled={!replyText.trim() || isSending}
        >
            {#if isSending}
                <span class="send-spinner"></span>
            {:else}
                <span>Enviar</span>
                <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                >
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
            {/if}
        </button>
    </form>
</Modal>

<style>
    .chat-context-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 14px;
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        margin-bottom: 12px;
        flex-wrap: wrap;
        gap: 10px;
    }

    .chat-status-info {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .status-pill {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 9999px;
    }
    .status-pill.active {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
        border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .status-pill.paused {
        background: rgba(244, 63, 94, 0.15);
        color: #fb7185;
        border: 1px solid rgba(244, 63, 94, 0.3);
    }
    .status-pill.live {
        background: rgba(56, 189, 248, 0.15);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.3);
        display: inline-flex;
        align-items: center;
    }
    .live-dot {
        width: 7px;
        height: 7px;
        background-color: #38bdf8;
        border-radius: 50%;
        display: inline-block;
        margin-right: 6px;
        animation: livePulse 1.8s infinite;
    }
    @keyframes livePulse {
        0% {
            transform: scale(0.9);
            opacity: 0.6;
        }
        50% {
            transform: scale(1.3);
            opacity: 1;
        }
        100% {
            transform: scale(0.9);
            opacity: 0.6;
        }
    }
    .status-pill.history {
        background: rgba(148, 163, 184, 0.15);
        color: #cbd5e1;
        border: 1px solid rgba(148, 163, 184, 0.3);
    }

    .chat-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .btn-mini-toggle {
        background: rgba(30, 41, 59, 0.8);
        border: 1px solid var(--border-subtle);
        color: var(--text-main);
        font-size: 0.76rem;
        padding: 5px 10px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.2s;
    }
    .btn-mini-toggle:hover {
        background: var(--bg-hover);
        border-color: #38bdf8;
    }

    .btn-mini-refresh {
        display: flex;
        align-items: center;
        gap: 5px;
        background: rgba(30, 41, 59, 0.8);
        border: 1px solid var(--border-subtle);
        color: var(--text-main);
        font-size: 0.76rem;
        padding: 5px 10px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.2s;
    }
    .btn-mini-refresh:hover:not(:disabled) {
        background: var(--bg-hover);
        border-color: var(--whatsapp-green);
    }

    /* Viewport estilo WhatsApp */
    .chat-viewport {
        background-color: #0b141a;
        background-image: radial-gradient(
            rgba(255, 255, 255, 0.03) 1px,
            transparent 1px
        );
        background-size: 20px 20px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: var(--radius-md);
        height: 440px;
        overflow-y: auto;
        padding: 18px 16px;
        display: flex;
        flex-direction: column;
    }

    .messages-stream {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: auto;
    }

    .date-separator {
        text-align: center;
        margin: 14px 0 8px;
    }
    .date-separator span {
        background: rgba(17, 27, 33, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #8696a0;
        font-size: 0.73rem;
        padding: 4px 12px;
        border-radius: 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .message-bubble-row {
        display: flex;
        width: 100%;
    }
    .message-bubble-row.outgoing {
        justify-content: flex-end;
    }
    .message-bubble-row.incoming {
        justify-content: flex-start;
    }

    .bubble {
        max-width: 78%;
        padding: 8px 12px;
        border-radius: 8px;
        position: relative;
        word-break: break-word;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }
    .bubble.incoming {
        background-color: #202c33;
        color: #e9edef;
        border-bottom-left-radius: 2px;
    }
    .bubble.outgoing {
        background-color: #005c4b;
        color: #e9edef;
        border-bottom-right-radius: 2px;
    }

    .bubble-text {
        font-size: 0.9rem;
        line-height: 1.42;
        white-space: pre-wrap;
    }

    .media-audio-box {
        margin-bottom: 6px;
    }
    .audio-label {
        font-size: 0.78rem;
        color: #8696a0;
        margin-bottom: 4px;
    }
    .bubble-audio-player {
        width: 250px;
        height: 34px;
        border-radius: 18px;
    }

    .media-image-box {
        margin-bottom: 6px;
    }
    .bubble-image {
        max-width: 240px;
        max-height: 240px;
        border-radius: 6px;
        object-fit: cover;
        display: block;
    }

    .bubble-media-placeholder {
        font-size: 0.85rem;
        font-style: italic;
        color: #aebac1;
    }

    .bubble-meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
        margin-top: 4px;
        font-size: 0.68rem;
        color: #8696a0;
    }
    .bubble.outgoing .bubble-meta {
        color: rgba(255, 255, 255, 0.65);
    }

    .bubble-ticks {
        color: #53bdeb;
        font-weight: 700;
    }

    /* Chat reply bar */
    .chat-reply-bar {
        display: flex;
        gap: 10px;
        margin-top: 14px;
        align-items: flex-end;
    }

    .chat-input {
        flex: 1;
        background: #202c33;
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #e9edef;
        border-radius: var(--radius-md);
        padding: 10px 14px;
        font-size: 0.92rem;
        resize: none;
        outline: none;
        min-height: 44px;
        max-height: 100px;
        font-family: inherit;
        transition: border-color 0.2s;
    }
    .chat-input:focus {
        border-color: var(--whatsapp-green);
    }

    .btn-send-chat {
        background: var(--whatsapp-green);
        color: #0b141a;
        border: none;
        border-radius: var(--radius-md);
        padding: 10px 18px;
        font-weight: 700;
        font-size: 0.9rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        height: 44px;
        transition: all 0.2s;
    }
    .btn-send-chat:hover:not(:disabled) {
        background: var(--whatsapp-green-hover);
        transform: translateY(-1px);
    }
    .btn-send-chat:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .chat-loading-state,
    .chat-empty-state {
        text-align: center;
        padding: 60px 20px;
        color: #8696a0;
        margin: auto;
    }
    .chat-empty-state h4 {
        color: #e9edef;
        margin-bottom: 6px;
    }

    .chat-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(255, 255, 255, 0.1);
        border-top-color: var(--whatsapp-green);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto 12px;
    }

    .send-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(0, 0, 0, 0.3);
        border-top-color: #0b141a;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    .spin {
        display: inline-block;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
