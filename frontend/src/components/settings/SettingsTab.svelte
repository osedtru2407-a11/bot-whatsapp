<script>
  import { settings, geminiStatus, saveSettings } from '../../stores/settings';
  import { hasPermission } from '../../stores/auth';

  let businessName = $state('');
  let geminiEnabled = $state(true);
  let simulateTyping = $state(true);
  let typingDelaySeconds = $state(2);
  let ignoreGroups = $state(true);
  let fallbackMessage = $state('');
  let isSaving = $state(false);

  $effect(() => {
    if ($settings) {
      businessName = $settings.businessName || '';
      geminiEnabled = $settings.geminiEnabled ?? true;
      simulateTyping = $settings.simulateTyping ?? true;
      typingDelaySeconds = $settings.typingDelaySeconds || 2;
      ignoreGroups = $settings.ignoreGroups ?? true;
      fallbackMessage = $settings.fallbackMessage || '';
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();
    isSaving = true;

    await saveSettings({
      businessName: businessName.trim(),
      geminiEnabled: Boolean(geminiEnabled),
      simulateTyping: Boolean(simulateTyping),
      typingDelaySeconds: parseInt(typingDelaySeconds, 10) || 2,
      ignoreGroups: Boolean(ignoreGroups),
      fallbackMessage: fallbackMessage.trim()
    });

    isSaving = false;
  }
</script>

<section id="tab-settings" class="tab-content active">
  <div class="content-toolbar">
    <div>
      <h2>Configuración General de la Empresa y del Bot</h2>
      <p class="section-desc">Personaliza el comportamiento de atención, delays de digitación humana e inteligencia artificial.</p>
    </div>
  </div>

  <div class="settings-card">
    <form onsubmit={handleSubmit} class="form-body">
      <div class="form-group">
        <label for="biz-name">Nombre Comercial del Negocio</label>
        <input 
          type="text" 
          id="biz-name" 
          placeholder="Ej: Digital Pass Express" 
          bind:value={businessName} 
          required 
        />
      </div>

      <div class="form-row">
        <div class="form-group flex-1">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label for="gemini-toggle" style="margin-bottom: 0;">Inteligencia Artificial Gemini Flash</label>
            <span class="status-badge {$geminiStatus.configured ? 'connected' : 'no-key'}">
              {$geminiStatus.configured ? '● Conectado' : '● Sin clave'}
            </span>
          </div>
          <select id="gemini-toggle" bind:value={geminiEnabled}>
            <option value={true}>Habilitado (Usa IA cuando no coincida una regla manual)</option>
            <option value={false}>Deshabilitado (Solo responde reglas exactas)</option>
          </select>
        </div>

        <div class="form-group flex-1">
          <label for="simulate-typing">Simular "Escribiendo..." en WhatsApp</label>
          <select id="simulate-typing" bind:value={simulateTyping}>
            <option value={true}>Sí (Da apariencia 100% humana)</option>
            <option value={false}>No (Envía respuestas al instante)</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group flex-1">
          <label for="delay-sec">Segundos de Simulación de Digitación</label>
          <input 
            type="number" 
            id="delay-sec" 
            min="1" 
            max="15" 
            bind:value={typingDelaySeconds} 
          />
        </div>

        <div class="form-group flex-1">
          <label for="ignore-groups">Ignorar Mensajes de Grupos de WhatsApp</label>
          <select id="ignore-groups" bind:value={ignoreGroups}>
            <option value={true}>Sí (Recomendado - Solo atiende chats individuales)</option>
            <option value={false}>No (Responder también en grupos)</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="fallback-msg">Mensaje por Defecto (Fallback si no hay coincidencia ni IA)</label>
        <textarea 
          id="fallback-msg" 
          rows="4" 
          placeholder="¡Hola! Gracias por comunicarte con nosotros. Escribe *menu* para ver las opciones disponibles..." 
          bind:value={fallbackMessage}
        ></textarea>
      </div>

      {#if $hasPermission('settings:edit')}
        <div style="margin-top: 24px;">
          <button type="submit" class="btn btn-primary" disabled={isSaving}>
            <span>{isSaving ? 'Guardando...' : '💾 Guardar Cambios de Configuración'}</span>
          </button>
        </div>
      {/if}
    </form>
  </div>
</section>

<style>
  .settings-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 32px;
    max-width: 760px;
    margin-top: 20px;
  }

  .form-row {
    display: flex;
    gap: 16px;
  }
  .flex-1 { flex: 1; }

  .status-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .status-badge.connected {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
  .status-badge.no-key {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
</style>
