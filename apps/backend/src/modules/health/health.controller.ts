import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
}

/**
 * Điểm kiểm tra sức khoẻ tối thiểu của khung backend.
 *
 * Chỉ báo tiến trình còn sống và phục vụ được HTTP; chưa kiểm phụ thuộc nào vì
 * change `apps-modular-monolith` không thêm database/Redis/hàng đợi. Khi có phụ
 * thuộc thật, thêm phép kiểm ở đây thay vì đổi đường dẫn.
 */
@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
