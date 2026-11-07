<!-- frontend/src/components/superadmin/UserModalAdmin.svelte -->
<script>
  import Modal from '../common/Modal.svelte';
  import { createUser, updateUser } from '../../stores/superadmin';

  let { isOpen = false, onClose = () => {}, user = null, companies = [] } = $props();

  let fullName = $state('');
  let email = $state('');
  let phone = $state('');
  let password = $state('');
  let isSuperadmin = $state(false);
  let isActive = $state(true);
  let selectedCompanyId = $state('');
  let selectedRoleId = $state('role_sales_agent');
  let isSaving = $state(false);

  $effect(() => {
    if (isOpen) {
      if (user) {
        fullName = user.full_name || '';
        email = user.email || '';
        phone = user.phone || '';
        password = '';
        isActive = user.is_active ?? true;
        isSuperadmin = Boolean(user.is_superadmin);
        selectedCompanyId = '';
        selectedRoleId = 'role_sales_agent';
      } else {
        fullName = '';
        email = '';
        phone = '';
        password = '';
        isActive = true;
        isSuperadmin = false;
        selectedCompanyId = companies.length > 0 ? companies[0].id : '';
        selectedRoleId = 'role_sales_agent';
      }
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;

    isSaving = true;
    try {
      if (user && user.id) {
        await updateUser(user.id, {
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          isActive: Boolean(isActive)
        });
      } else {
        if (!password || password.length < 6) {
          alert('La contraseña debe tener al menos 6 caracteres');
          return;
        }
        await createUser({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          password: password.trim(),
          isSuperadmin: Boolean(isSuperadmin),
          companyId: selectedCompanyId || null,
          roleId: selectedCompanyId ? selectedRoleId : null
        });
      }
      onClose();
    } finally {
      isSaving = false;
    }
  }
</script>

<Modal
  {isOpen}
  title={user ? `✏️ Modificar Usuario: ${user.full_name}` : '👤 Registrar Nuevo Usuario'}
  subtitle={user ? 'Actualiza los datos personales y estado de la cuenta' : 'Crea una cuenta de usuario global en el sistema'}
  maxWidth="520px"
  {onClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    <div class="form-group">
      <label for="user-admin-name">Nombre Completo</label>
      <input
        type="text"
        id="user-admin-name"
        bind:value={fullName}
        placeholder="Ej: Laura Gómez"
        required
      />
    </div>

    <div class="form-row">
      <div class="form-group flex-1">
        <label for="user-admin-email">Correo Electrónico</label>
        <input
          type="email"
          id="user-admin-email"
          bind:value={email}
          placeholder="laura@empresa.com"
          required
        />
      </div>

      <div class="form-group flex-1">
        <label for="user-admin-phone">Teléfono / Móvil</label>
        <input
          type="tel"
          id="user-admin-phone"
          bind:value={phone}
          placeholder="+573001234567"
        />
      </div>
    </div>

    {#if !user}
      <div class="form-group">
        <label for="user-admin-password">Contraseña Inicial</label>
        <input
          type="password"
          id="user-admin-password"
          bind:value={password}
          placeholder="Mínimo 6 caracteres"
          minlength="6"
          required
        />
      </div>

      <div class="superadmin-checkbox-box">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={isSuperadmin} />
          <span class="checkbox-text">
            <strong>⭐ Otorgar Rol de Superusuario Global</strong>
            <small>Tendrá acceso al panel raíz, todas las empresas, asignación de llaves de Gemini y gestión global.</small>
          </span>
        </label>
      </div>

      {#if companies.length > 0}
        <div class="company-assign-box">
          <span class="assign-box-title">🏢 Asignar a Empresa Inicial (Opcional):</span>
          <div class="form-row">
            <div class="form-group flex-1" style="margin-bottom: 0;">
              <label for="assign-comp">Empresa</label>
              <select id="assign-comp" bind:value={selectedCompanyId}>
                <option value="">-- Ninguna (Solo usuario global) --</option>
                {#each companies as comp}
                  <option value={comp.id}>{comp.name}</option>
                {/each}
              </select>
            </div>

            {#if selectedCompanyId}
              <div class="form-group flex-1" style="margin-bottom: 0;">
                <label for="assign-role">Rol en la Empresa</label>
                <select id="assign-role" bind:value={selectedRoleId}>
                  <option value="role_admin">👑 Administrador</option>
                  <option value="role_sales_agent">💼 Asesor / Agente de Ventas</option>
                  <option value="role_content_manager">✍️ Gestor de Flujos</option>
                  <option value="role_viewer">👀 Supervisor (Solo lectura)</option>
                </select>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {:else}
      <div class="form-group">
        <label for="user-admin-status">Estado de la Cuenta</label>
        <select id="user-admin-status" bind:value={isActive}>
          <option value={true}>✅ Activo (Puede iniciar sesión)</option>
          <option value={false}>🚫 Inactivo / Bloqueado</option>
        </select>
      </div>
    {/if}

    <div class="modal-footer-btns">
      <button type="button" class="btn btn-secondary" onclick={onClose} disabled={isSaving}>
        Cancelar
      </button>
      <button type="submit" class="btn btn-primary" disabled={isSaving || !fullName.trim() || !email.trim()}>
        <span>{isSaving ? 'Guardando...' : (user ? '💾 Guardar Cambios' : '➕ Crear Usuario')}</span>
      </button>
    </div>
  </form>
</Modal>

<style>
  .form-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 8px;
  }
  .form-row {
    display: flex;
    gap: 12px;
  }
  .flex-1 {
    flex: 1;
  }

  .superadmin-checkbox-box {
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.25);
    border-radius: var(--radius-sm);
    padding: 12px;
  }
  .checkbox-label {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    cursor: pointer;
  }
  .checkbox-label input {
    margin-top: 3px;
    accent-color: #f59e0b;
    width: 16px;
    height: 16px;
  }
  .checkbox-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .checkbox-text strong {
    font-size: 0.85rem;
    color: #fbbf24;
  }
  .checkbox-text small {
    font-size: 0.74rem;
    color: var(--text-secondary);
    line-height: 1.3;
  }

  .company-assign-box {
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 12px;
  }
  .assign-box-title {
    display: block;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
  }

  .modal-footer-btns {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 10px;
  }
</style>

