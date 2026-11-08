import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Cargar .env de la raíz antes de inicializar la aplicación y módulos
const candidateEnvs = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
  path.resolve(__dirname, '..', '..', '..', '.env'),
];
for (const envPath of candidateEnvs) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { json, urlencoded, static as expressStatic } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Aumentar límites para permitir subida de archivos (mismo comportamiento de server.js)
  app.use(json({ limit: '100mb' }));
  app.use(urlencoded({ extended: true, limit: '100mb' }));

  // Habilitar CORS para integración con Svelte
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Resolver directorios estáticos de forma resiliente apuntando a la raíz del proyecto
  const candidateRoots = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..', '..', '..'),
  ];
  const rootDir =
    candidateRoots.find(
      (dir) =>
        fs.existsSync(path.join(dir, 'server.js')) ||
        fs.existsSync(path.join(dir, 'pendientes.txt')) ||
        fs.existsSync(path.join(dir, 'public', 'index.html')),
    ) || process.cwd();

  const publicDir = path.resolve(rootDir, 'public');
  const uploadsDir = path.resolve(publicDir, 'uploads');

  logger.log(`📁 Directorio raíz resuelto: ${rootDir}`);
  logger.log(`📁 Directorio público resuelto: ${publicDir} (index.html: ${fs.existsSync(path.join(publicDir, 'index.html'))})`);
  logger.log(`📁 Directorio uploads resuelto: ${uploadsDir}`);

  app.use('/uploads', expressStatic(uploadsDir));
  app.use(expressStatic(publicDir));

  // Fallback SPA (Single Page Application): para que refrescar rutas o entrar a '/' sirva siempre index.html
  app.use((req: any, res: any, next: any) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      const indexPath = path.join(publicDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
    }
    next();
  });

  // Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Panel visual y Backend NestJS corriendo en: http://localhost:${port}`);
}

bootstrap();
