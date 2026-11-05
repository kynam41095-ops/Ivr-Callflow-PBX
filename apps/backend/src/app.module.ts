import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';

/**
 * Module gốc của modular monolith. Mỗi miền nghiệp vụ là một module riêng dưới
 * `src/modules/<domain>/`; file này chỉ `imports` chúng, không chứa controller.
 * Change `apps-modular-monolith` mới dựng khung nên chỉ có `HealthModule`.
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
