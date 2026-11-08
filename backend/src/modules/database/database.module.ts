import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as entities from '../../entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.PG_HOST || process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || process.env.POSTGRES_PORT || '5432', 10),
        username: process.env.PG_USER || process.env.POSTGRES_USER || 'postgres',
        password: process.env.PG_PASSWORD || process.env.POSTGRES_PASSWORD || '',
        database: process.env.PG_DATABASE || process.env.POSTGRES_DB || 'whatsapp_sales_bot',
        entities: Object.values(entities),
        synchronize: false, // Protege la base de datos existente contra alteraciones automáticas
        logging: process.env.NODE_ENV === 'development',
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

