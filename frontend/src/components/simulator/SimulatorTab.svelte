<script>
  import { api } from '../../services/api';
  import { activeCompany } from '../../stores/company';
  import { showToast } from '../../stores/toast';

  let messages = $state([
    {
      id: 1,
      isUser: false,
      text: '¡Hola! Escribe un mensaje o envía un audio para probar la respuesta inteligente de la IA.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      media: null,
      isGemini: false
    }
  ]);

  let inputText = $state('');
  let isThinking = $state(false);
  let thinkingMessage = $state('Escribiendo respuesta...');
  let chatBodyEl = $state();
  let audioInputEl = $state();

  function formatWhatsAppText(str) {
    if (!str) return '';
    return str
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~(.*?)~/g, '<del>$1</del>')
      .replace(/\n/g, '<br>');
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (chatBodyEl) {
        chatBodyEl.scrollTop = chatBodyEl.scrollHeight;
      }
    }, 50);
  }

  async function triggerSimulation({ text = '', hasMedia = false, mediaMimetype = '', userIcon = null, audio = null, audioUrl = null }) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Mensaje del usuario
    messages.push({
      id: Date.now(),
      isUser: true,
      text,
      time,
      userIcon,
      audioUrl
    });
    scrollToBottom();

    isThinking = true;
    thinkingMessage = audio ? '🎙️ Escuchando y procesando nota de voz con IA...' : 'Escribiendo...';

    try {
      const data = await api.post('/api/simulate', {
        text,
        hasMedia,
        mediaMimetype,
        audio
      });

      messages.push({
        id: Date.now() + 1,
        isUser: false,
        text: data.response || '',
        media: data.media || null,
        isGemini: Boolean(data.isGemini),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } catch (err) {
      messages.push({
        id: Date.now() + 1,
        isUser: false,
        text: '⚠️ Error conectando con el simulador.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } finally {
      isThinking = false;
      scrollToBottom();
    }
  }

  function handleSend(e) {
    e.preventDefault();
    if (!inputText.trim()) return;
    const val = inputText.trim();
    inputText = '';
    triggerSimulation({ text: val });
  }

  async function handleResetChat() {
    try {
      await api.post('/api/gemini/reset', { sessionId: 'simulator-session' });
      messages = [
        {
          id: Date.now(),
          isUser: false,
          text: '🔄 Conversación reiniciada. ¡Hola! ¿En qué te puedo colaborar hoy?',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ];
      showToast('Conversación de Gemini reiniciada', 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function handleAudioFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const fullDataUrl = reader.result;
      const cleanBase64 = fullDataUrl.includes('base64,') ? fullDataUrl.split('base64,')[1] : fullDataUrl;
      const mimeType = file.type || 'audio/ogg';

      triggerSimulation({
        text: '',
        hasMedia: true,
        mediaMimetype: mimeType,
        userIcon: '🎤',
        audio: {
          data: cleanBase64,
          mimetype: mimeType
        },
        audioUrl: URL.createObjectURL(file)
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }
</script>

<section id="tab-simulator" class="tab-content active">
  <div class="simulator-container">
    <!-- Panel Izquierdo: Información y Atajos de Prueba -->
    <div class="simulator-info">
      <h2>Simulador de Chat en Vivo</h2>
      <p style="color: var(--text-muted); font-size: 0.88rem; margin-top: 6px; line-height: 1.5;">
        Prueba cómo responde tu bot ante mensajes de texto o cuando un cliente envía un archivo o foto de comprobante.
      </p>

      <div class="simulator-tips">
        <h4>⚡ Atajos de Prueba Rápida:</h4>
        <div class="quick-test-chips">
          <button type="button" class="chip-btn" onclick={() => triggerSimulation({ text: 'hola' })}>👋 hola</button>
          <button type="button" class="chip-btn" onclick={() => triggerSimulation({ text: 'catalogo' })}>📖 catálogo</button>
          <button type="button" class="chip-btn" onclick={() => triggerSimulation({ text: 'precios' })}>💰 precios</button>
          <button type="button" class="chip-btn" onclick={() => triggerSimulation({ text: 'pagos' })}>💳 pagos</button>
          <button type="button" class="chip-btn" onclick={() => triggerSimulation({ text: 'asesor' })}>👤 asesor</button>
        </div>

        <div class="sim-media-actions" style="margin-top: 18px; display: flex; flex-direction: column; gap: 8px;">
          <button 
            type="button" 
            class="btn btn-outline-sm btn-sim-action"
            onclick={() => triggerSimulation({
              text: 'Hola, aquí les envío la foto de mi comprobante de pago Nequi',
              hasMedia: true,
              mediaMimetype: 'image/jpeg',
              userIcon: '🧾'
            })}
          >
            🧾 Simular envío de Comprobante / Foto
          </button>

          <button 
            type="button" 
            class="btn btn-outline-sm btn-sim-action"
            onclick={() => triggerSimulation({
              text: 'Adjunto el documento con los detalles del pedido',
              hasMedia: true,
              mediaMimetype: 'application/pdf',
              userIcon: '📄'
            })}
          >
            📄 Simular envío de Documento PDF
          </button>

          <input 
            type="file" 
            bind:this={audioInputEl} 
            accept="audio/*,.oga,.ogg,.mp3,.m4a,.wav" 
            style="display: none;" 
            onchange={handleAudioFile} 
          />

          <button 
            type="button" 
            class="btn btn-outline-sm btn-sim-action" 
            style="border-color: #3b82f6; color: #3b82f6;"
            onclick={() => audioInputEl?.click()}
          >
            🎤 Subir / Probar Audio Propio (Nota de voz)
          </button>

          <button 
            type="button" 
            class="btn btn-outline-sm btn-sim-action"
            onclick={handleResetChat}
          >
            🔄 Reiniciar Conversación
          </button>
        </div>
      </div>
    </div>

    <!-- Mockup de Teléfono Celular WhatsApp -->
    <div class="phone-mockup">
      <div class="phone-top-bar">
        <div class="camera-hole"></div>
      </div>

      <div class="phone-chat-header">
        <div class="avatar-circle">🤖</div>
        <div class="chat-header-info">
          <span class="chat-name">{$activeCompany?.name || 'Mi Tienda Virtual'}</span>
          <span class="chat-status">
            {#if isThinking}
              <span class="typing-text">escribiendo...</span>
            {:else}
              en línea (Bot con IA)
            {/if}
          </span>
        </div>
      </div>

      <!-- Cuerpo del Chat con Fondo de WhatsApp -->
      <div class="phone-chat-body" bind:this={chatBodyEl}>
        {#each messages as msg (msg.id)}
          <div class="msg-bubble {msg.isUser ? 'user-bubble' : 'bot-bubble'}">
            {#if !msg.isUser && msg.isGemini}
              <div class="gemini-tag">
                <span>🤖</span> Gemini Flash Lite
              </div>
            {/if}

            {#if msg.audioUrl}
              <!-- svelte-ignore a11y_media_has_caption -->
              <audio controls src={msg.audioUrl} class="sim-audio-player"></audio>
            {/if}

            {#if msg.userIcon && !msg.audioUrl}
              <div class="sim-bubble-doc">
                <span class="sim-bubble-doc-icon">{msg.userIcon}</span>
                <div class="sim-bubble-doc-info">
                  <span class="sim-bubble-doc-name">[Archivo adjunto simulado]</span>
                </div>
              </div>
            {/if}

            {#if msg.media && msg.media.url}
              {#if (msg.media.mimetype || '').startsWith('image/')}
                <div class="sim-bubble-media">
                  <img src={msg.media.url} alt={msg.media.filename} />
                </div>
              {:else}
                <div class="sim-bubble-doc">
                  <span class="sim-bubble-doc-icon">📎</span>
                  <div class="sim-bubble-doc-info">
                    <span class="sim-bubble-doc-name">{msg.media.filename}</span>
                    <span class="sim-bubble-doc-type">Documento adjunto</span>
                  </div>
                </div>
              {/if}
            {/if}

            {#if msg.text}
              <div class="bubble-text">{@html formatWhatsAppText(msg.text)}</div>
            {/if}

            <span class="msg-time">
              {msg.time}
              {#if msg.isUser}
                <span class="check-marks">✓✓</span>
              {/if}
            </span>
          </div>
        {/each}

        {#if isThinking}
          <div class="msg-bubble bot-bubble typing-bubble">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span style="font-size: 0.72rem; color: #8696a0; margin-left: 6px;">{thinkingMessage}</span>
          </div>
        {/if}
      </div>

      <!-- Footer / Barra de Input de WhatsApp -->
      <form class="phone-chat-footer" onsubmit={handleSend}>
        <input 
          type="text" 
          id="phone-chat-input"
          placeholder="Escribe un mensaje de prueba..." 
          bind:value={inputText} 
          autocomplete="off"
        />

        <button 
          type="button" 
          class="btn-audio-sim" 
          onclick={() => audioInputEl?.click()}
          title="Simular o subir nota de voz"
        >
          🎤
        </button>

        <button type="submit" class="btn-send-sim" title="Enviar mensaje">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </form>
    </div>
  </div>
</section>

<style>
  .simulator-container {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 48px;
    flex-wrap: wrap;
    padding: 10px 0;
  }

  .simulator-info {
    max-width: 380px;
    width: 100%;
  }

  .simulator-tips {
    margin-top: 24px;
    background: var(--bg-card);
    padding: 20px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-subtle);
  }

  .simulator-tips h4 {
    font-size: 0.88rem;
    margin-bottom: 12px;
    color: #fff;
  }

  .quick-test-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip-btn {
    background: rgba(37, 211, 102, 0.1);
    color: var(--wa-primary);
    border: 1px solid rgba(37, 211, 102, 0.25);
    padding: 6px 14px;
    border-radius: var(--radius-full);
    font-size: 0.82rem;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }
  .chip-btn:hover {
    background: var(--wa-primary);
    color: #0b141a;
    transform: translateY(-1px);
  }

  .btn-sim-action {
    text-align: left;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-subtle);
    color: var(--text-main);
    padding: 9px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.82rem;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .btn-sim-action:hover {
    background: rgba(37, 211, 102, 0.15);
    border-color: var(--wa-primary);
    color: #fff;
    transform: translateX(3px);
  }

  /* Phone Mockup */
  .phone-mockup {
    width: 380px;
    height: 640px;
    background: #0b141a;
    border: 12px solid #1e293b;
    border-radius: 44px;
    box-shadow: 0 25px 60px -10px rgba(0, 0, 0, 0.8), var(--shadow-glow);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    box-sizing: border-box;
  }

  .phone-top-bar {
    height: 24px;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #0b141a;
    flex-shrink: 0;
  }

  .camera-hole {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #1e293b;
  }

  .phone-chat-header {
    background: #202c33;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }

  .avatar-circle {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--wa-teal);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .chat-header-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .chat-name {
    font-size: 0.94rem;
    font-weight: 700;
    color: #e9edef;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chat-status {
    font-size: 0.72rem;
    color: #8696a0;
  }

  .typing-text {
    color: var(--wa-primary);
    font-style: italic;
  }

  .phone-chat-body {
    flex: 1;
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background-color: #0b141a;
    background-image: radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 20px 20px;
  }

  .msg-bubble {
    max-width: 82%;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 0.84rem;
    line-height: 1.45;
    position: relative;
    display: flex;
    flex-direction: column;
    word-break: break-word;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .bot-bubble {
    align-self: flex-start;
    background: #202c33;
    color: #e9edef;
    border-top-left-radius: 0;
  }

  .user-bubble {
    align-self: flex-end;
    background: #005c4b;
    color: #e9edef;
    border-top-right-radius: 0;
  }

  .bubble-text {
    white-space: pre-wrap;
  }

  .msg-time {
    align-self: flex-end;
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.55);
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .check-marks {
    color: #53bdeb;
    font-weight: bold;
    font-size: 0.75rem;
  }

  .gemini-tag {
    font-size: 10px;
    color: #38bdf8;
    font-weight: 700;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sim-audio-player {
    width: 100%;
    margin: 6px 0;
    height: 32px;
  }

  .sim-bubble-media {
    margin-bottom: 6px;
    border-radius: 6px;
    overflow: hidden;
    max-width: 220px;
  }
  .sim-bubble-media img {
    width: 100%;
    max-height: 140px;
    object-fit: cover;
    display: block;
  }

  .sim-bubble-doc {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 6px;
    margin-bottom: 6px;
  }

  .sim-bubble-doc-icon {
    font-size: 1.5rem;
  }

  .sim-bubble-doc-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sim-bubble-doc-name {
    font-size: 0.78rem;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sim-bubble-doc-type {
    font-size: 0.68rem;
    color: rgba(255, 255, 255, 0.6);
  }

  /* Indicador de typing con puntos animados */
  .typing-bubble {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 8px 14px;
  }

  .typing-dot {
    width: 6px;
    height: 6px;
    background: #8696a0;
    border-radius: 50%;
    animation: typingPulse 1.4s infinite ease-in-out;
  }
  .typing-dot:nth-child(1) { animation-delay: 0s; }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes typingPulse {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-4px); opacity: 1; }
  }

  /* WhatsApp Footer & Inputs */
  .phone-chat-footer {
    padding: 10px 12px;
    background: #202c33;
    display: flex;
    align-items: center;
    gap: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    flex-shrink: 0;
  }

  .phone-chat-footer input[type="text"] {
    flex: 1;
    background: #2a3942;
    border: none;
    outline: none;
    border-radius: 24px;
    padding: 10px 16px;
    font-size: 0.85rem;
    color: #d1d7db;
    transition: box-shadow 0.2s;
  }

  .phone-chat-footer input[type="text"]:focus {
    box-shadow: 0 0 0 1px rgba(37, 211, 102, 0.5);
  }

  .phone-chat-footer input[type="text"]::placeholder {
    color: #8696a0;
  }

  .btn-audio-sim {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
    border: 1px solid rgba(59, 130, 246, 0.3);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .btn-audio-sim:hover {
    background: rgba(59, 130, 246, 0.3);
    transform: scale(1.08);
  }

  .btn-send-sim {
    background: var(--wa-teal);
    color: #fff;
    border: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s;
    flex-shrink: 0;
  }
  .btn-send-sim:hover {
    background: var(--wa-primary);
    transform: scale(1.08);
  }
</style>
