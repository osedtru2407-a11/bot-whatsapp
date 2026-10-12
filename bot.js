const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('./index');

// Crear la instancia del cliente
const client = new Client({
    // LocalAuth guarda los datos de la sesión en una carpeta local (.wwebjs_auth)
    // para que no tengas que escanear el QR cada vez que inicies el bot.
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // Ponlo en 'false' si deseas ver el navegador Chromium en pantalla
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Evento: Se genera el código QR para vincular WhatsApp
client.on('qr', (qr) => {
    console.log('\n======================================================');
    console.log('Escanea este código QR desde WhatsApp en tu teléfono:');
    console.log('WhatsApp > Dispositivos vinculados > Vincular dispositivo');
    console.log('======================================================\n');
    qrcode.generate(qr, { small: true });
});

// Evento: Autenticación exitosa
client.on('authenticated', () => {
    console.log('Autenticación correcta. Cargando sesión...');
});

// Evento: El bot está listo para enviar y recibir mensajes
client.on('ready', async () => {
    console.log('\n======================================================');
    console.log('¡El bot está conectado y listo!');
    console.log('======================================================\n');

    // CONFIGURACIÓN DEL CONTACTO:
    // Ingresa el número con el código de país sin el signo '+' ni espacios.
    // Ejemplo para Colombia: '573001234567'
    // Ejemplo para México: '521XXXXXXXXXX' o '52XXXXXXXXXX'
    // Ejemplo para España: '34XXXXXXXXX'
    const numeroDestino = '573118017673';

    const chatId = `${numeroDestino}@c.us`;
    const mensaje = '¡Hola Mundo! Este es mi primer mensaje enviado desde mi bot de WhatsApp 🚀';

    console.log(`Intentando enviar mensaje a: ${chatId}...`);
    try {
        await client.sendMessage(chatId, mensaje);
        console.log(`✅ ¡Mensaje enviado con éxito a ${numeroDestino}!`);
    } catch (error) {
        console.error('❌ Error al enviar el mensaje:', error);
    }
});

// Inicializar el cliente
client.initialize();
