// frontend/src/utils/permissions.js
/**
 * Diccionario centralizado de permisos en lenguaje claro, natural y en español.
 * Diseñado para que cualquier usuario no técnico comprenda exactamente
 * qué puede hacer y ver cada rol en la plataforma.
 */

export const PERMISSION_CATEGORIES = [
  {
    key: 'rules',
    name: 'Rutas de Respuesta Automática',
    icon: '💬',
    description: 'Control sobre los mensajes automáticos, palabras clave y respuestas del bot.'
  },
  {
    key: 'leads',
    name: 'CRM, Prospectos y Chats',
    icon: '👥',
    description: 'Acceso a clientes contactados, historial de chats y atención humana.'
  },
  {
    key: 'library',
    name: 'Biblioteca de Conocimiento (IA)',
    icon: '📚',
    description: 'Documentos, manuales y archivos con los que se entrena la inteligencia artificial.'
  },
  {
    key: 'schedules',
    name: 'Programación de Envíos y Campañas',
    icon: '⏰',
    description: 'Difusiones masivas, recordatorios periódicos (mensualidades) y envíos diferidos.'
  },
  {
    key: 'simulator',
    name: 'Pruebas y Simulador',
    icon: '⚡',
    description: 'Herramientas interactivas para probar respuestas antes de enviar a clientes.'
  },
  {
    key: 'whatsapp',
    name: 'Conexión de WhatsApp',
    icon: '📱',
    description: 'Vinculación del teléfono, lectura de código QR y encendido/apagado del bot.'
  },
  {
    key: 'settings',
    name: 'Configuración de la Empresa',
    icon: '⚙️',
    description: 'Ajustes generales, horarios de atención y comportamiento de la IA.'
  },
  {
    key: 'team',
    name: 'Equipo y Roles',
    icon: '🛡️',
    description: 'Gestión de colaboradores, asignación de accesos y roles personalizados.'
  }
];

export const PERMISSIONS_DICTIONARY = {
  // 1. Rutas de Respuesta
  'rules:view': {
    key: 'rules:view',
    categoryKey: 'rules',
    categoryName: 'Rutas de Respuesta',
    icon: '👁️',
    action: 'Ver',
    label: 'Ver respuestas automáticas',
    shortLabel: 'Ver respuestas',
    description: 'Puede consultar las rutas de respuesta automática, palabras clave y mensajes configurados.'
  },
  'rules:create': {
    key: 'rules:create',
    categoryKey: 'rules',
    categoryName: 'Rutas de Respuesta',
    icon: '➕',
    action: 'Crear',
    label: 'Crear nuevas respuestas',
    shortLabel: 'Crear respuestas',
    description: 'Puede crear nuevas respuestas automáticas con textos, archivos o botones.'
  },
  'rules:edit': {
    key: 'rules:edit',
    categoryKey: 'rules',
    categoryName: 'Rutas de Respuesta',
    icon: '✏️',
    action: 'Editar',
    label: 'Modificar respuestas automáticas',
    shortLabel: 'Editar respuestas',
    description: 'Puede modificar disparadores, mensajes y condiciones de flujos existentes.'
  },
  'rules:delete': {
    key: 'rules:delete',
    categoryKey: 'rules',
    categoryName: 'Rutas de Respuesta',
    icon: '🗑️',
    action: 'Eliminar',
    label: 'Eliminar respuestas automáticas',
    shortLabel: 'Eliminar respuestas',
    description: 'Puede borrar permanentemente flujos y reglas del contestador.'
  },

  // 2. CRM y Prospectos
  'leads:view': {
    key: 'leads:view',
    categoryKey: 'leads',
    categoryName: 'CRM y Prospectos',
    icon: '👥',
    action: 'Ver',
    label: 'Ver prospectos y conversaciones',
    shortLabel: 'Ver prospectos y chats',
    description: 'Puede acceder a la lista de prospectos, agenda de contactos, chats y archivos recibidos.'
  },
  'leads:pause': {
    key: 'leads:pause',
    categoryKey: 'leads',
    categoryName: 'CRM y Prospectos',
    icon: '⏸️',
    action: 'Operar',
    label: 'Pausar bot para atención humana',
    shortLabel: 'Pausar bot para humano',
    description: 'Puede suspender temporalmente el bot en un chat para que un asesor humano atienda al cliente.'
  },
  'leads:delete': {
    key: 'leads:delete',
    categoryKey: 'leads',
    categoryName: 'CRM y Prospectos',
    icon: '🗑️',
    action: 'Eliminar',
    label: 'Eliminar prospectos y contactos',
    shortLabel: 'Eliminar prospectos',
    description: 'Puede borrar clientes o contactos del embudo de ventas y agenda.'
  },

  // 3. Biblioteca IA
  'library:view': {
    key: 'library:view',
    categoryKey: 'library',
    categoryName: 'Biblioteca IA',
    icon: '📚',
    action: 'Ver',
    label: 'Consultar biblioteca de conocimiento',
    shortLabel: 'Ver biblioteca IA',
    description: 'Puede leer los manuales y documentos que la inteligencia artificial usa para responder.'
  },
  'library:upload': {
    key: 'library:upload',
    categoryKey: 'library',
    categoryName: 'Biblioteca IA',
    icon: '📤',
    action: 'Crear',
    label: 'Subir documentos a la IA',
    shortLabel: 'Subir documentos',
    description: 'Puede subir archivos PDF, Word o texto para entrenar al asistente de IA.'
  },
  'library:edit': {
    key: 'library:edit',
    categoryKey: 'library',
    categoryName: 'Biblioteca IA',
    icon: '✏️',
    action: 'Editar',
    label: 'Editar contenido de documentos',
    shortLabel: 'Editar documentos',
    description: 'Puede modificar el texto de los documentos cargados en la base de conocimiento.'
  },
  'library:toggle': {
    key: 'library:toggle',
    categoryKey: 'library',
    categoryName: 'Biblioteca IA',
    icon: '🔄',
    action: 'Operar',
    label: 'Activar o pausar documentos',
    shortLabel: 'Activar/Pausar docs',
    description: 'Puede activar o deshabilitar qué documentos puede usar la IA en sus respuestas.'
  },
  'library:delete': {
    key: 'library:delete',
    categoryKey: 'library',
    categoryName: 'Biblioteca IA',
    icon: '🗑️',
    action: 'Eliminar',
    label: 'Eliminar documentos de la biblioteca',
    shortLabel: 'Eliminar documentos',
    description: 'Puede borrar definitivamente archivos de la base de conocimiento de la IA.'
  },

  // 4. Programación de Envíos
  'schedules:view': {
    key: 'schedules:view',
    categoryKey: 'schedules',
    categoryName: 'Envíos y Campañas',
    icon: '⏰',
    action: 'Ver',
    label: 'Ver campañas y envíos programados',
    shortLabel: 'Ver campañas programadas',
    description: 'Puede ver los mensajes programados, difusiones y recordatorios periódicos.'
  },
  'schedules:create': {
    key: 'schedules:create',
    categoryKey: 'schedules',
    categoryName: 'Envíos y Campañas',
    icon: '📅',
    action: 'Crear',
    label: 'Programar envíos y difusiones masivas',
    shortLabel: 'Programar campañas masivas',
    description: 'Puede programar envíos individuales o masivos (por grupo o etiqueta), únicos o periódicos.'
  },
  'schedules:delete': {
    key: 'schedules:delete',
    categoryKey: 'schedules',
    categoryName: 'Envíos y Campañas',
    icon: '🛑',
    action: 'Eliminar',
    label: 'Cancelar o eliminar envíos programados',
    shortLabel: 'Cancelar/Eliminar envíos',
    description: 'Puede cancelar difusiones en curso o borrar mensajes programados.'
  },

  // 5. Pruebas y Simulador
  'simulator:use': {
    key: 'simulator:use',
    categoryKey: 'simulator',
    categoryName: 'Pruebas y Simulador',
    icon: '⚡',
    action: 'Operar',
    label: 'Probar en simulador interactivo en vivo',
    shortLabel: 'Usar simulador en vivo',
    description: 'Puede interactuar con el simulador en pantalla para verificar respuestas de la IA.'
  },
  'quick_send:use': {
    key: 'quick_send:use',
    categoryKey: 'simulator',
    categoryName: 'Pruebas y Simulador',
    icon: '🚀',
    action: 'Operar',
    label: 'Realizar envíos rápidos de prueba',
    shortLabel: 'Envíos de prueba',
    description: 'Puede enviar mensajes de prueba directos a números específicos.'
  },

  // 6. Conexión WhatsApp
  'whatsapp:connect': {
    key: 'whatsapp:connect',
    categoryKey: 'whatsapp',
    categoryName: 'Conexión WhatsApp',
    icon: '📱',
    action: 'Operar',
    label: 'Vincular WhatsApp (Escanear código QR)',
    shortLabel: 'Conectar / Ver QR',
    description: 'Puede ver el código QR y conectar el número de WhatsApp de la empresa.'
  },
  'whatsapp:disconnect': {
    key: 'whatsapp:disconnect',
    categoryKey: 'whatsapp',
    categoryName: 'Conexión WhatsApp',
    icon: '🔌',
    action: 'Operar',
    label: 'Desconectar sesión de WhatsApp',
    shortLabel: 'Desconectar WhatsApp',
    description: 'Puede cerrar la sesión de WhatsApp activa o reiniciar el enlace.'
  },
  'whatsapp:toggle': {
    key: 'whatsapp:toggle',
    categoryKey: 'whatsapp',
    categoryName: 'Conexión WhatsApp',
    icon: '🟢',
    action: 'Operar',
    label: 'Encender o apagar el contestador automático',
    shortLabel: 'Encender/Apagar bot',
    description: 'Puede encender o pausar el bot automático para todos los clientes de la empresa.'
  },

  // 7. Configuración
  'settings:view': {
    key: 'settings:view',
    categoryKey: 'settings',
    categoryName: 'Configuración',
    icon: '⚙️',
    action: 'Ver',
    label: 'Ver configuración de la empresa',
    shortLabel: 'Ver configuración',
    description: 'Puede consultar los parámetros generales, horarios y opciones del bot.'
  },
  'settings:edit': {
    key: 'settings:edit',
    categoryKey: 'settings',
    categoryName: 'Configuración',
    icon: '🛠️',
    action: 'Editar',
    label: 'Modificar configuración y personalidad IA',
    shortLabel: 'Modificar ajustes',
    description: 'Puede cambiar las instrucciones del sistema, modelo de IA y horarios de atención.'
  },

  // 8. Equipo y Roles
  'team:view': {
    key: 'team:view',
    categoryKey: 'team',
    categoryName: 'Equipo y Roles',
    icon: '👥',
    action: 'Ver',
    label: 'Ver miembros del equipo',
    shortLabel: 'Ver colaboradores',
    description: 'Puede ver quiénes son los colaboradores con acceso a esta empresa.'
  },
  'team:manage': {
    key: 'team:manage',
    categoryKey: 'team',
    categoryName: 'Equipo y Roles',
    icon: '👤',
    action: 'Administrar',
    label: 'Invitar y administrar colaboradores',
    shortLabel: 'Gestionar colaboradores',
    description: 'Puede invitar nuevos miembros, asignarles rol o removerlos de la empresa.'
  },
  'roles:manage': {
    key: 'roles:manage',
    categoryKey: 'team',
    categoryName: 'Equipo y Roles',
    icon: '🛡️',
    action: 'Administrar',
    label: 'Crear y administrar roles personalizados',
    shortLabel: 'Crear roles a medida',
    description: 'Puede definir nuevos roles personalizados con combinaciones específicas de permisos.'
  }
};

/**
 * Obtiene la información legible en español de un permiso técnico.
 * Si recibe un permiso no registrado, genera un texto legible en español.
 */
export function getPermissionMeta(permKey) {
  if (PERMISSIONS_DICTIONARY[permKey]) {
    return PERMISSIONS_DICTIONARY[permKey];
  }

  // Fallback si llega una clave desconocida
  const parts = String(permKey || '').split(':');
  const mod = parts[0] || 'módulo';
  const act = parts[1] || 'acceso';
  
  const actionTranslations = {
    view: 'Ver',
    create: 'Crear',
    edit: 'Modificar',
    delete: 'Eliminar',
    use: 'Usar',
    manage: 'Administrar',
    toggle: 'Activar/Pausar',
    connect: 'Conectar',
    disconnect: 'Desconectar',
    upload: 'Subir'
  };

  const moduleTranslations = {
    rules: 'respuestas automáticas',
    leads: 'prospectos',
    library: 'biblioteca de conocimiento',
    schedules: 'envíos programados',
    settings: 'configuración',
    team: 'equipo de trabajo',
    roles: 'roles',
    whatsapp: 'conexión WhatsApp',
    simulator: 'simulador',
    quick_send: 'envíos directos'
  };

  const friendlyAction = actionTranslations[act] || act;
  const friendlyModule = moduleTranslations[mod] || mod;

  return {
    key: permKey,
    categoryKey: mod,
    categoryName: friendlyModule,
    icon: '🔹',
    action: friendlyAction,
    label: `${friendlyAction} ${friendlyModule}`,
    shortLabel: `${friendlyAction} ${friendlyModule}`,
    description: `Permiso para ${friendlyAction.toLowerCase()} ${friendlyModule}.`
  };
}

/**
 * Agrupa una lista de permisos técnicos por categorías comprensibles
 */
export function groupPermissionsByCategory(permKeys = []) {
  const result = [];
  const keysSet = new Set(permKeys || []);

  for (const cat of PERMISSION_CATEGORIES) {
    const categoryPerms = [];
    for (const [key, meta] of Object.entries(PERMISSIONS_DICTIONARY)) {
      if (meta.categoryKey === cat.key && keysSet.has(key)) {
        categoryPerms.push(meta);
      }
    }

    if (categoryPerms.length > 0) {
      result.push({
        ...cat,
        permissions: categoryPerms
      });
    }
  }

  // Permisos huérfanos o no agrupados
  const knownKeys = new Set(Object.keys(PERMISSIONS_DICTIONARY));
  const orphans = (permKeys || []).filter(k => !knownKeys.has(k)).map(k => getPermissionMeta(k));
  if (orphans.length > 0) {
    result.push({
      key: 'other',
      name: 'Otros Permisos Especiales',
      icon: '⚙️',
      description: 'Permisos adicionales configurados en este rol.',
      permissions: orphans
    });
  }

  return result;
}

/**
 * Verifica si un rol tiene acceso total de administrador
 */
export function isFullAdmin(roleOrPerms) {
  const perms = Array.isArray(roleOrPerms) ? roleOrPerms : (roleOrPerms?.permissions || []);
  if (perms.includes('*')) return true;
  const allKnown = Object.keys(PERMISSIONS_DICTIONARY);
  return perms.length >= allKnown.length && allKnown.every(k => perms.includes(k));
}

