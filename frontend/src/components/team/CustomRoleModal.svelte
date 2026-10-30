<script>
  import { isCustomRoleModalOpen, createCustomRole } from '../../stores/team';
  import { showToast } from '../../stores/toast';
  import Modal from '../common/Modal.svelte';

  let roleName = $state('');
  let roleDesc = $state('');
  let isSubmitting = $state(false);

  let selectedPerms = $state({
    'rules:view': true,
    'rules:create': false,
    'rules:edit': false,
    'rules:delete': false,
    'leads:view': true,
    'leads:pause': false,
    'leads:delete': false,
    'library:view': true,
    'library:upload': false,
    'library:edit': false,
    'library:toggle': false,
    'library:delete': false,
    'schedules:view': true,
    'schedules:create': false,
    'schedules:delete': false,
    'simulator:use': true,
    'quick_send:use': false,
    'whatsapp:connect': false,
    'whatsapp:disconnect': false,
    'whatsapp:toggle': false,
    'settings:view': false,
    'settings:edit': false,
    'team:view': false,
    'team:manage': false,
    'roles:manage': false
  });

  function resetForm() {
    roleName = '';
    roleDesc = '';
    for (const key in selectedPerms) {
      selectedPerms[key] = key.endsWith(':view') || key === 'simulator:use';
    }
  }

  function handleClose() {
    isCustomRoleModalOpen.set(false);
    resetForm();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!roleName.trim()) {
      showToast('Ingresa un nombre para el rol', 'warning');
      return;
    }

    const perms = Object.keys(selectedPerms).filter(k => selectedPerms[k]);
    if (perms.length === 0) {
      showToast('Selecciona al menos un permiso para el rol', 'warning');
      return;
    }

    isSubmitting = true;
    const res = await createCustomRole({
      name: roleName.trim(),
      description: roleDesc.trim(),
      permissions: perms
    });
    isSubmitting = false;

    if (res.success) {
      handleClose();
    }
  }
</script>

<Modal 
  isOpen={$isCustomRoleModalOpen}
  title="🛡️ Crear Rol Personalizado"
  subtitle="Selecciona los módulos y permisos exactos para este rol"
  maxWidth="680px"
  onClose={handleClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    <div class="form-group">
      <label for="c-role-name">Nombre del Rol</label>
      <input 
        type="text" 
        id="c-role-name" 
        placeholder="Ej: Especialista de Envíos Masivos" 
        bind:value={roleName} 
        required 
      />
    </div>

    <div class="form-group">
      <label for="c-role-desc">Descripción</label>
      <input 
        type="text" 
        id="c-role-desc" 
        placeholder="Breve explicación de las responsabilidades..." 
        bind:value={roleDesc} 
      />
    </div>

    <div class="form-group">
      <div style="margin-bottom: 8px; display: block; font-weight: 600; font-size: 0.86rem; color: var(--text-muted);">Permisos Granulares:</div>
      <div class="permissions-checklist">
        <div class="perm-category">
          <h4>💬 Rutas de Respuesta</h4>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['rules:view']}> Ver rutas</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['rules:create']}> Crear rutas</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['rules:edit']}> Editar rutas</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['rules:delete']}> Eliminar rutas</label>
        </div>

        <div class="perm-category">
          <h4>👥 CRM & Prospectos</h4>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['leads:view']}> Ver prospectos y archivos</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['leads:pause']}> Pausar / Reanudar bot</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['leads:delete']}> Eliminar prospectos</label>
        </div>

        <div class="perm-category">
          <h4>📚 Biblioteca (IA)</h4>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['library:view']}> Ver documentos</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['library:upload']}> Subir documentos</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['library:edit']}> Editar contenido</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['library:toggle']}> Activar/Inhabilitar</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['library:delete']}> Eliminar docs</label>
        </div>

        <div class="perm-category">
          <h4>⏰ Programación</h4>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['schedules:view']}> Ver envíos programados</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['schedules:create']}> Programar envíos</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['schedules:delete']}> Eliminar envíos</label>
        </div>

        <div class="perm-category">
          <h4>⚡ Pruebas & Operación</h4>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['simulator:use']}> Usar simulador en vivo</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['quick_send:use']}> Envío directo / prueba</label>
        </div>

        <div class="perm-category">
          <h4>📱 Conexión WhatsApp</h4>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['whatsapp:connect']}> Vincular / Ver QR</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['whatsapp:disconnect']}> Desvincular / Reset</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['whatsapp:toggle']}> Activar/Pausar bot general</label>
        </div>

        <div class="perm-category">
          <h4>⚙️ Configuración & Equipo</h4>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['settings:view']}> Ver configuración</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['settings:edit']}> Modificar configuración</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['team:view']}> Ver equipo</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['team:manage']}> Crear/Invitar usuarios</label>
          <label class="perm-item"><input type="checkbox" bind:checked={selectedPerms['roles:manage']}> Crear roles personalizados</label>
        </div>
      </div>
    </div>

    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Creando Rol...' : 'Crear Rol'}
      </button>
    </div>
  </form>
</Modal>
