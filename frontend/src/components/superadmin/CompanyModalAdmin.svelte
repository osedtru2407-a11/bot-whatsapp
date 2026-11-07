<!-- frontend/src/components/superadmin/CompanyModalAdmin.svelte -->
<script>
  import Modal from '../common/Modal.svelte';
  import { createCompany, updateCompany } from '../../stores/superadmin';

  let { isOpen = false, onClose = () => {}, company = null } = $props();

  let name = $state('');
  let isSaving = $state(false);

  $effect(() => {
    if (isOpen) {
      name = company ? (company.name || '') : '';
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;

    isSaving = true;
    try {
      if (company && company.id) {
        await updateCompany(company.id, { name: name.trim() });
      } else {
        await createCompany(name.trim());
      }
      onClose();
    } finally {
      isSaving = false;
    }
  }
</script>

<Modal
  {isOpen}
  title={company ? `✏️ Editar Empresa: ${company.name}` : '🏢 Nueva Empresa en el Sistema'}
  subtitle={company ? 'Modifica los datos globales de la empresa' : 'Crea una nueva empresa con sesión de WhatsApp y flujos aislados'}
  maxWidth="480px"
  {onClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    <div class="form-group">
      <label for="company-admin-name">Nombre de la Empresa</label>
      <input
        type="text"
        id="company-admin-name"
        bind:value={name}
        placeholder="Ej: Inmobiliaria Horizonte S.A.S."
        required
      />
    </div>

    <div class="modal-footer-btns">
      <button type="button" class="btn btn-secondary" onclick={onClose} disabled={isSaving}>
        Cancelar
      </button>
      <button type="submit" class="btn btn-primary" disabled={isSaving || !name.trim()}>
        <span>{isSaving ? 'Guardando...' : (company ? '💾 Guardar Cambios' : '➕ Crear Empresa')}</span>
      </button>
    </div>
  </form>
</Modal>

<style>
  .form-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 8px;
  }
  .modal-footer-btns {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 16px;
  }
</style>

