/**
 * Đọc cổng lắng nghe từ biến môi trường `PORT`.
 *
 * Vì sao phải kiểm chặt thay vì `process.env.PORT ?? 3000`: Node coi giá trị chuỗi
 * không phải số là **đường dẫn Unix socket**, nên `PORT=abc` làm Nest log
 * "Nest application successfully started" trong khi không mở cổng TCP nào. Container
 * vẫn "healthy" nhưng không ai gọi vào được. Xem design.md của change
 * `apps-modular-monolith`, mục "Giá trị mặc định và thứ tự ưu tiên của PORT".
 */

export const DEFAULT_PORT = 3000;
export const MIN_PORT = 1;
export const MAX_PORT = 65535;

export type PortResolution =
  | { ok: true; port: number; source: 'default' | 'env' }
  | { ok: false; reason: string };

/**
 * Hàm thuần: không đọc `process.env` trực tiếp để test được mọi ca biên.
 *
 * - `PORT` không được đặt (undefined) → cổng mặc định 3000.
 * - `PORT` có mặt nhưng không phải số nguyên trong 1–65535 (kể cả chuỗi rỗng, chỉ
 *   khoảng trắng, có ký tự lạ, hay ngoài khoảng) → lỗi, người gọi phải dừng tiến trình.
 */
export function resolvePort(env: { PORT?: string | undefined }): PortResolution {
  const raw = env.PORT;

  if (raw === undefined) {
    return { ok: true, port: DEFAULT_PORT, source: 'default' };
  }

  if (raw === '') {
    return { ok: false, reason: 'biến PORT được đặt nhưng là chuỗi rỗng' };
  }

  if (!/^\d+$/.test(raw)) {
    return {
      ok: false,
      reason: `biến PORT phải là số nguyên, nhận được "${raw}"`,
    };
  }

  const port = Number(raw);

  if (!Number.isSafeInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    return {
      ok: false,
      reason: `biến PORT phải nằm trong khoảng ${MIN_PORT}–${MAX_PORT}, nhận được "${raw}"`,
    };
  }

  return { ok: true, port, source: 'env' };
}
