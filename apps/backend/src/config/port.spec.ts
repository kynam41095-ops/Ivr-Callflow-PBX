import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, resolvePort } from './port.js';

describe('resolvePort', () => {
  describe('PORT không được đặt', () => {
    it('dùng cổng mặc định 3000', () => {
      expect(resolvePort({})).toEqual({
        ok: true,
        port: DEFAULT_PORT,
        source: 'default',
      });
      expect(DEFAULT_PORT).toBe(3000);
    });
  });

  describe('PORT là số hợp lệ', () => {
    it.each([
      ['4010', 4010],
      ['3000', 3000],
      ['1', 1],
      ['65535', 65535],
    ])('PORT=%s → cổng %i', (raw, expected) => {
      expect(resolvePort({ PORT: raw })).toEqual({
        ok: true,
        port: expected,
        source: 'env',
      });
    });
  });

  describe('PORT không hợp lệ → lỗi, người gọi phải dừng', () => {
    it.each([
      ['', 'chuỗi rỗng'],
      ['   ', 'chỉ khoảng trắng'],
      ['abc', 'không phải số'],
      ['70000', 'ngoài khoảng trên'],
      ['0', 'ngoài khoảng dưới'],
      ['65536', 'ngoài khoảng trên (biên + 1)'],
      ['-1', 'số âm'],
      ['80.5', 'không phải số nguyên'],
      [' 4010', 'có khoảng trắng đầu'],
      ['4010 ', 'có khoảng trắng cuối'],
      ['12abc', 'lẫn chữ và số'],
    ])('PORT=%j (%s) bị từ chối', (raw) => {
      const result = resolvePort({ PORT: raw });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBeTruthy();
      }
    });
  });
});
