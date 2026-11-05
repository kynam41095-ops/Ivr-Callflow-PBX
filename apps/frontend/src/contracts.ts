import schema from "../../../contracts/flow-document.schema.json";

// Contract dùng chung nằm ở gốc monorepo: <repo>/contracts/flow-document.schema.json.
// Từ apps/frontend/src lên gốc repo là ba cấp. Đây là chỗ DUY NHẤT biết vị trí
// schema: mã chạy trong trình duyệt import { schema }, test chạy Node dùng
// `contracts.node.ts` (nơi đổi đường dẫn tương đối này thành đường dẫn tuyệt đối).
export const SCHEMA_RELATIVE_PATH = "../../../contracts/flow-document.schema.json";

export { schema };
