import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

/**
 * Một miền = một module dưới `src/modules/<domain>/` (xem AGENTS.md).
 * `AppModule` chỉ `imports` module con, không khai controller trực tiếp.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
