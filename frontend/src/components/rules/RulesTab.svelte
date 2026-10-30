<script>
  import { rules, isRuleModalOpen, editingRule } from '../../stores/rules';
  import { hasPermission } from '../../stores/auth';
  import RuleCard from './RuleCard.svelte';

  function openCreateRule() {
    editingRule.set(null);
    isRuleModalOpen.set(true);
  }
</script>

<section id="tab-rules" class="tab-content active">
  <div class="content-toolbar">
    <div>
      <h2>Rutas de Respuesta Automática</h2>
      <p class="section-desc">Crea y personaliza respuestas con texto, catálogos en PDF, imágenes y detección de comprobantes.</p>
    </div>
    {#if $hasPermission('rules:create')}
      <button type="button" class="btn btn-primary" onclick={openCreateRule}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Nueva Ruta de Venta
      </button>
    {/if}
  </div>

  {#if $rules.length === 0}
    <div class="empty-rules-state">
      <div style="font-size: 40px; margin-bottom: 12px;">💬</div>
      <h3>No tienes rutas de respuesta configuradas</h3>
      <p>Crea tu primer flujo de venta automático para responder a tus clientes cuando escriban palabras clave o envíen archivos.</p>
      {#if $hasPermission('rules:create')}
        <button type="button" class="btn btn-primary" style="margin-top: 16px;" onclick={openCreateRule}>
          Crear Primera Ruta
        </button>
      {/if}
    </div>
  {:else}
    <div class="cards-grid">
      {#each $rules as rule (rule.id)}
        <RuleCard {rule} />
      {/each}
    </div>
  {/if}
</section>

<style>
  .empty-rules-state {
    text-align: center;
    padding: 60px 20px;
    background: rgba(15, 23, 42, 0.4);
    border: 2px dashed var(--border-subtle);
    border-radius: var(--radius-lg);
    color: var(--text-muted);
    max-width: 600px;
    margin: 40px auto;
  }
  .empty-rules-state h3 {
    color: #fff;
    margin-bottom: 6px;
    font-size: 1.15rem;
  }
</style>
