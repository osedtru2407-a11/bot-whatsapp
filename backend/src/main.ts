import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { json, urlencoded, static as expressStatic } from 'express';
import * as path from 'path';
import * as fs from 'fs';
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

  // Resolver directorios estáticos de forma resiliente
  const rootDir = fs.existsSync(path.resolve(process.cwd(), 'public'))
    ? process.cwd()
    : path.resolve(__dirname, '..', '..');
  const publicDir = path.resolve(rootDir, 'public');
  const uploadsDir = path.resolve(publicDir, 'uploads');

  app.use('/uploads', expressStatic(uploadsDir));
  app.use(expressStatic(publicDir));

  // Fallback SPA (Single Page Application): para que refrescar rutas del frontend no dé 404
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
