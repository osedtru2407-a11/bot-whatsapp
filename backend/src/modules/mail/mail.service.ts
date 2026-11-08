import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private transporter: nodemailer.Transporter | null = null;

    constructor() {
        this.initTransporter();
    }

    private initTransporter() {
        const host = process.env.SMTP_HOST;
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
        const port = parseInt(process.env.SMTP_PORT || '587', 10);
        const secure = process.env.SMTP_SECURE === 'true' || port === 465;

        if (host && user && pass) {
            this.transporter = nodemailer.createTransport({
                host,
                port,
                secure,
                auth: {
                    user,
                    pass,
                },
                tls: {
                    rejectUnauthorized: process.env.SMTP_IGNORE_TLS !== 'true',
                },
            });
            this.logger.log(
                `Servicio SMTP configurado para host: ${host}:${port} (${secure ? 'SSL/TLS' : 'STARTTLS'})`,
            );
        } else {
            this.logger.warn(
                'Servidor SMTP no configurado en .env (SMTP_HOST, SMTP_USER, SMTP_PASS). Los correos se mostrarán en la consola en modo desarrollo.',
            );
        }
    }

    async sendPasswordResetEmail(
        to: string,
        fullName: string,
        token: string,
        code: string,
    ): Promise<{ success: boolean; simulated?: boolean }> {
        const appUrl = (
            process.env.APP_URL ||
            process.env.FRONTEND_URL ||
            'http://localhost:3000'
        ).replace(/\/$/, '');
        const resetUrl = `${appUrl}/?resetToken=${encodeURIComponent(token)}&email=${encodeURIComponent(to)}`;

        // Si no hay transporter configurado, operar en modo simulación para desarrollo local
        if (!this.transporter) {
            this.logger.warn(
                `[MODO SIMULACIÓN] Correo de recuperación generado para: ${to}`,
            );
            this.logger.log(
                `--------------------------------------------------`,
            );
            this.logger.log(`📧 Destinatario: ${to} (${fullName})`);
            this.logger.log(`🔢 Código de 6 dígitos: ${code}`);
            this.logger.log(`🔗 Enlace directo de recuperación: ${resetUrl}`);
            this.logger.log(`⏳ Expira en: 15 minutos`);
            this.logger.log(
                `--------------------------------------------------`,
            );
            return { success: true, simulated: true };
        }

        const fromAddress =
            process.env.SMTP_FROM ||
            `"WhatsApp Sales Bot" <${process.env.SMTP_USER}>`;

        const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Recuperación de Contraseña</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #0b1120;
          color: #f1f5f9;
          margin: 0;
          padding: 24px;
        }
        .container {
          max-width: 560px;
          margin: 0 auto;
          background-color: #1e293b;
          border-radius: 12px;
          border: 1px solid #334155;
          overflow: hidden;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
        }
        .header {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          padding: 28px 32px;
          text-align: center;
          border-bottom: 1px solid #334155;
        }
        .header h1 {
          color: #22c55e;
          font-size: 20px;
          margin: 0;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .content {
          padding: 32px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 16px;
          color: #e2e8f0;
        }
        .text {
          font-size: 14px;
          line-height: 1.6;
          color: #94a3b8;
          margin-bottom: 24px;
        }
        .code-box {
          background-color: #0f172a;
          border: 1px dashed #22c55e;
          border-radius: 8px;
          padding: 16px;
          text-align: center;
          margin-bottom: 24px;
        }
        .code-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #94a3b8;
          margin-bottom: 8px;
        }
        .code-value {
          font-family: 'Courier New', Courier, monospace;
          font-size: 32px;
          font-weight: 800;
          letter-spacing: 8px;
          color: #4ade80;
          margin: 0;
        }
        .btn-wrapper {
          text-align: center;
          margin-bottom: 28px;
        }
        .btn {
          display: inline-block;
          background-color: #22c55e;
          color: #0f172a !important;
          text-decoration: none;
          font-weight: 700;
          font-size: 15px;
          padding: 14px 28px;
          border-radius: 8px;
        }
        .expiry-note {
          font-size: 12px;
          color: #64748b;
          text-align: center;
          margin-top: 16px;
        }
        .footer {
          background-color: #0f172a;
          padding: 20px 32px;
          border-top: 1px solid #334155;
          text-align: center;
          font-size: 12px;
          color: #64748b;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>WhatsApp Sales Bot Studio</h1>
        </div>
        <div class="content">
          <div class="greeting">Hola, <strong>${fullName || 'Usuario'}</strong></div>
          <div class="text">
            Hemos recibido una solicitud para restablecer la contraseña de acceso a tu cuenta.
            Puedes usar el siguiente código de verificación en el panel o hacer clic directo en el botón:
          </div>

          <div class="code-box">
            <div class="code-label">Código de verificación</div>
            <div class="code-value">${code}</div>
          </div>

          <div class="btn-wrapper">
            <a href="${resetUrl}" class="btn">Restablecer mi Contraseña</a>
          </div>

          <div class="expiry-note">
            ⏳ Este código y enlace expirarán en <strong>15 minutos</strong>.<br>
            Si tú no realizaste esta solicitud, puedes ignorar este correo de forma segura.
          </div>
        </div>
        <div class="footer">
          WhatsApp Sales Bot Studio &bull; Notificación de Seguridad
        </div>
      </div>
    </body>
    </html>
    `;

        try {
            await this.transporter.sendMail({
                from: fromAddress,
                to,
                subject: 'Recuperación de contraseña - WhatsApp Sales Bot',
                text: `Hola ${fullName},\n\nTu código de verificación para restablecer tu contraseña es: ${code}\n\nO ingresa directamente a: ${resetUrl}\n\nEste código expira en 15 minutos.\nSi no solicitaste este cambio, ignora este mensaje.`,
                html: htmlContent,
            });

            this.logger.log(
                `Correo de recuperación enviado exitosamente a: ${to}`,
            );
            return { success: true };
        } catch (error) {
            this.logger.error(
                `Error al enviar correo SMTP a ${to}: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }
}
