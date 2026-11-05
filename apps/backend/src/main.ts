import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { resolvePort } from './config/port.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const resolution = resolvePort(process.env);

  // Không hợp lệ thì dừng NGAY, không gọi listen: `PORT=abc` sẽ tạo Unix socket
  // tên `abc` và báo khởi động thành công trong khi không có cổng TCP nào.
  if (!resolution.ok) {
    logger.error(
      `Không khởi động được: ${resolution.reason}. Đặt PORT là số nguyên trong khoảng 1–65535, hoặc bỏ trống để dùng 3000.`,
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);
  await app.listen(resolution.port);

  logger.log(
    resolution.source === 'default'
      ? `Biến PORT không được đặt, dùng cổng mặc định ${resolution.port}`
      : `Lắng nghe trên cổng ${resolution.port} theo biến PORT`,
  );
}

await bootstrap();
