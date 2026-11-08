import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller()
export class AppController {
  @Get()
  getHome(@Res() res: Response) {
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

    const indexPath = path.resolve(rootDir, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    return res.status(200).send('Panel en ejecución. El archivo index.html se está generando...');
  }
}

