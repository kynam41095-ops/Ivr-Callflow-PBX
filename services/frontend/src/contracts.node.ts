import { fileURLToPath } from "node:url";
import { SCHEMA_RELATIVE_PATH } from "./contracts";

// Đường dẫn tuyệt đối tới contract ở gốc repo, chỉ dùng trong test chạy Node (vitest).
// Không import file này từ mã chạy trong trình duyệt: nó kéo theo `node:url`, thứ Vite
// externalize và trình duyệt không gọi được.
export const schemaFilePath = fileURLToPath(
  new URL(SCHEMA_RELATIVE_PATH, import.meta.url),
);
