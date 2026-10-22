import type { Node } from "@xyflow/react";
import type { MediaAsset, QueueRecord } from "../../data/api";
import type { IntRange, ScheduleRule, TimeRange } from "../../flow/types";
import { stepCode, stepLabel, tokenSuffix } from "../../canvas/steps";
import "./inspector.css";

// Inspector của node đang chọn — lô 11, bám bản dựng thử IVR Builder v3.dc.html
// dòng 397–620 (khung, đầu khung, ô tên, hàng mã/loại/id, trường, thanh trượt,
// bản đồ phím), 1325–1367 (fieldsFor — nhãn và đơn vị), 1818–1845 (thẻ khung
// giờ). Phần tử CR 5.2 xếp Bỏ không dựng: ba nút đầu khung (nhân bản/căn/
// xoá node), tay kéo bề rộng, nút ⓘ, khối "Nhánh đi ra", ô "Nhãn nhánh",
// "Nhánh đã nối", "Điều này dẫn tới".
// Chỉ trường có trong $defs của flow-document.schema.json. Mọi điều khiển nhập
// liệu mang data-field trên chính nó hoặc trên tổ tiên gần nhất (AC-17). Không
// có điều khiển cho trường trỏ (*NodeId, đích của choices) — nối nhánh bằng
// cạnh trên canvas (Tự quyết iter 5). Không có điều khiển, nhãn hay chữ nào
// cho mười trường đã bỏ (Change Request 1 mục 1.2).
// Nhãn trường là <label htmlFor> ĐỨNG RIÊNG, không bọc điều khiển — <label> bọc
// <select> thì inventory so ảnh đọc cả chữ của option, mất nhãn (Quy ước lô 11).

type AxisKey = "weekday" | "monthDay" | "month" | "year";
type Bound = "from" | "to";

export type InspectorProps = {
  node: Node;
  media: MediaAsset[];
  queues: QueueRecord[];
  // Phím → tên node đích, tính từ cạnh thật (BuilderScreen) — phím vắng
  // trong map nghĩa là chưa nối (lô 12, AC-48).
  choiceTargets: Record<string, string>;
  onDataChange: (data: Record<string, unknown>) => void;
  onBranchRemoved: (handle: string) => void;
  // Đổi phím của Menu: BuilderScreen đổi sourceHandle và id cạnh cùng lượt với
  // onDataChange (Quy ước lô 11 "Đổi phím").
  onBranchRenamed: (oldHandle: string, newHandle: string) => void;
  // Nút › ở đầu khung — BuilderScreen bỏ selected mọi node.
  onClose: () => void;
};

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DEFAULT_TIME: TimeRange = { from: "08:00", to: "17:00" };
const TIMEZONES = ["Asia/Ho_Chi_Minh", "Asia/Bangkok", "UTC"];
// Thứ tự phím trống khi bấm "+ Phím": 1–9, 0, *, # (Quy ước lô 11).
const MENU_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", "#"];
const CHOICES_MAX = 12;
const WEEKDAY_LABELS: Record<number, string> = {
  1: "T2",
  2: "T3",
  3: "T4",
  4: "T5",
  5: "T6",
  6: "T7",
  7: "CN",
};
// Cửa sổ năm cố định 2026–2036 (Tự quyết iter 5); giá trị có sẵn ngoài cửa
// sổ được thêm vào đầu danh sách để không mất dữ liệu.
const YEAR_MIN = 2026;
const YEAR_MAX = 2036;
const RULES_MIN = 1;
const RULES_MAX = 64;
const CLOSE_TITLE = "Thu gọn để xem flow rộng hơn";

function range(from: number, to: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += 1) {
    values.push(value);
  }
  return values;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const AXES: ReadonlyArray<{
  axis: AxisKey;
  caption: string;
  values: number[];
  label?: (value: number) => string;
}> = [
  { axis: "weekday", caption: "Thứ", values: range(1, 7), label: (v) => WEEKDAY_LABELS[v] ?? String(v) },
  { axis: "monthDay", caption: "Ngày", values: range(1, 31) },
  // Nhãn tháng "Th<n>" theo bản dựng thử dòng 1815 (MO).
  { axis: "month", caption: "Tháng", values: range(1, 12), label: (v) => `Th${v}` },
  { axis: "year", caption: "Năm", values: range(YEAR_MIN, YEAR_MAX) },
];

function MediaSelect({
  field,
  caption,
  value,
  media,
  onSelect,
}: {
  field: string;
  caption: string;
  value: string;
  media: MediaAsset[];
  onSelect: (mediaId: string) => void;
}) {
  return (
    <div className="inspector-field inspector-field-first">
      <label className="inspector-label" data-testid="inspector-label" htmlFor={`inspector-${field}`}>
        {caption}
      </label>
      <select
        className="inspector-select"
        id={`inspector-${field}`}
        data-field={field}
        value={value}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="" disabled>
          — Chọn file âm thanh —
        </option>
        {media.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// Thanh trượt (bản dựng thử dòng 537–545, fieldsFor kind 'r'): nhãn 14px trái,
// giá trị --mono phải, input[type=range] bước 1 dưới cùng.
function RangeField({
  field,
  caption,
  min,
  max,
  value,
  unit,
  onChange,
}: {
  field: string;
  caption: string;
  min: number;
  max: number;
  value: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="inspector-field inspector-field-range">
      <div className="inspector-range-row">
        <span
          className="inspector-range-label"
          data-testid="inspector-range-label"
          id={`inspector-${field}-label`}
        >
          {caption}
        </span>
        <span className="inspector-range-value num" data-testid="inspector-range-value">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        data-field={field}
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-labelledby={`inspector-${field}-label`}
      />
    </div>
  );
}

function ChoicesField({
  data,
  choiceTargets,
  onDataChange,
  onBranchRemoved,
  onBranchRenamed,
}: {
  data: Record<string, unknown>;
  choiceTargets: Record<string, string>;
  onDataChange: (data: Record<string, unknown>) => void;
  onBranchRemoved: (handle: string) => void;
  onBranchRenamed: (oldHandle: string, newHandle: string) => void;
}) {
  const choices = isRecord(data.choices) ? data.choices : {};
  const keys = Object.keys(choices);

  const addKey = () => {
    const key = MENU_KEYS.find((each) => !Object.hasOwn(choices, each));
    if (key === undefined) {
      return;
    }
    // Đích rỗng cho tới khi nối cạnh (Tự quyết iter 5) — lô 4 báo lỗi
    // phím chưa nối khi kiểm hợp lệ.
    onDataChange({ ...data, choices: { ...choices, [key]: "" } });
  };

  // Đổi phím: choices giữ đích, cạnh đổi sourceHandle và id CÙNG LƯỢT với
  // data (hai setState trong một handler được React gộp chung một lần render).
  const renameKey = (oldKey: string, newKey: string) => {
    if (newKey === oldKey || Object.hasOwn(choices, newKey)) {
      return;
    }
    const nextChoices = { ...choices };
    const target = nextChoices[oldKey];
    delete nextChoices[oldKey];
    nextChoices[newKey] = target;
    onDataChange({ ...data, choices: nextChoices });
    onBranchRenamed(`choice-${oldKey}`, `choice-${newKey}`);
  };

  const removeKey = (key: string) => {
    const nextChoices = { ...choices };
    delete nextChoices[key];
    onDataChange({ ...data, choices: nextChoices });
    // Điểm nối choice-<key> sắp biến mất — xoá luôn cạnh bám vào nó, để lại
    // là React Flow cảnh báo error008.
    onBranchRemoved(`choice-${key}`);
  };

  return (
    <div className="inspector-field inspector-block" data-field="choices">
      <div className="inspector-block-head">
        <label className="inspector-label" data-testid="inspector-label">
          Bản đồ phím
        </label>
        <span className="inspector-block-spacer" />
        <button
          type="button"
          className="choice-add"
          data-testid="choice-add"
          onClick={addKey}
          disabled={keys.length >= CHOICES_MAX}
        >
          + Phím
        </button>
      </div>
      <div className="inspector-choice-rows">
        {keys.map((key) => {
          // option = phím hiện tại + phím trống (Quy ước lô 11).
          const options = MENU_KEYS.filter((each) => each === key || !Object.hasOwn(choices, each));
          if (!options.includes(key)) {
            options.unshift(key);
          }
          const targetName = choiceTargets[key];
          const linked = targetName !== undefined;
          return (
            <div className="choice-row" data-testid="choice-row" data-key={key} key={key}>
              <select
                className="choice-key num"
                data-testid="choice-key"
                aria-label={"Phím " + key}
                value={key}
                onChange={(event) => renameKey(key, event.target.value)}
              >
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span
                className="choice-target"
                data-testid="choice-target"
                data-state={linked ? "linked" : "unlinked"}
              >
                {linked ? `→ ${targetName}` : "Chưa nối"}
              </span>
              <button
                type="button"
                className="choice-remove"
                data-testid="choice-remove"
                title="Xóa phím"
                aria-label="Xóa phím"
                disabled={keys.length <= 1}
                onClick={() => removeKey(key)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AxisSelect({
  bound,
  values,
  label,
  current,
  onChange,
}: {
  bound: Bound;
  values: number[];
  label?: (value: number) => string;
  current: number | undefined;
  onChange: (raw: string) => void;
}) {
  const options = [...values];
  if (current !== undefined && !options.includes(current)) {
    options.unshift(current);
  }
  return (
    <select
      className="num"
      data-bound={bound}
      value={current === undefined ? "" : String(current)}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">—</option>
      {options.map((value) => (
        <option key={value} value={String(value)}>
          {label ? label(value) : String(value)}
        </option>
      ))}
    </select>
  );
}

function RulesField({
  data,
  onDataChange,
}: {
  data: Record<string, unknown>;
  onDataChange: (data: Record<string, unknown>) => void;
}) {
  const rules: ScheduleRule[] = Array.isArray(data.rules) ? (data.rules as ScheduleRule[]) : [];

  const writeRules = (nextRules: ScheduleRule[]) => {
    onDataChange({ ...data, rules: nextRules });
  };

  const timeBound = (rule: ScheduleRule, bound: Bound): string => {
    const time = rule.time;
    return isRecord(time) && typeof time[bound] === "string" ? time[bound] : "";
  };

  const axisRange = (rule: ScheduleRule, axis: AxisKey): IntRange | undefined => {
    const value = rule[axis];
    return isRecord(value) && typeof value.from === "number" && typeof value.to === "number"
      ? (value as IntRange)
      : undefined;
  };

  const addRule = () => {
    // Khung mới lên ĐẦU danh sách — thêm/xoá ngay trước mắt người dùng.
    writeRules([{ time: { ...DEFAULT_TIME } }, ...rules]);
  };

  const removeRule = (index: number) => {
    writeRules(rules.filter((_, i) => i !== index));
  };

  const setTimeBound = (index: number, bound: Bound, value: string) => {
    if (!TIME_PATTERN.test(value)) {
      // Trục time bắt buộc (schema required) — không hợp lệ thì giữ giá trị
      // cũ; tạo bản sao để render lại, khôi phục chữ trên ô nhập.
      onDataChange({ ...data });
      return;
    }
    const rule: ScheduleRule = { ...rules[index] };
    const time = isRecord(rule.time) ? ({ ...rule.time } as TimeRange) : { ...DEFAULT_TIME };
    rule.time = { ...time, [bound]: value };
    writeRules(rules.map((each, i) => (i === index ? rule : each)));
  };

  const setAxisBound = (index: number, axis: AxisKey, bound: Bound, raw: string) => {
    const rule: ScheduleRule = { ...rules[index] };
    if (raw === "") {
      // Chọn rỗng ở MỘT mốc → xoá hẳn trục khỏi khung (không giới hạn), cả
      // hai mốc về "". Trục có mặt thì luôn đủ from và to (schema required).
      delete rule[axis];
    } else {
      const value = Number.parseInt(raw, 10);
      const existing = axisRange(rule, axis);
      const other = existing ? (bound === "from" ? existing.to : existing.from) : value;
      rule[axis] = bound === "from" ? { from: value, to: other } : { from: other, to: value };
    }
    writeRules(rules.map((each, i) => (i === index ? rule : each)));
  };

  return (
    <div className="inspector-field inspector-block" data-field="rules">
      <div className="inspector-block-head">
        <label className="inspector-label" data-testid="inspector-label">
          Khung giờ áp dụng
        </label>
        <span className="inspector-block-spacer" />
        <button
          type="button"
          className="rule-add"
          data-testid="rule-add"
          onClick={addRule}
          disabled={rules.length >= RULES_MAX}
        >
          + Khung giờ
        </button>
      </div>
      <div className="inspector-rule-cards">
        {rules.map((rule, index) => (
          <div className="schedule-rule" data-testid="schedule-rule" key={index}>
            <div className="rule-head-row">
              <span className="rule-head" data-testid="rule-head">
                {rules.length > 1 ? `Khung ${index + 1}` : "Khung giờ"}
              </span>
              {rules.length > RULES_MIN ? (
                <button
                  type="button"
                  className="rule-remove"
                  data-testid="rule-remove"
                  title="Xóa khung giờ này"
                  aria-label="Xóa khung giờ này"
                  onClick={() => removeRule(index)}
                >
                  ×
                </button>
              ) : null}
            </div>
            <div className="rule-body">
              <div className="rule-row" data-axis="time">
                <div className="rule-row-label">Giờ</div>
                <div className="rule-row-controls">
                  <input
                    type="time"
                    className="num"
                    data-bound="from"
                    value={timeBound(rule, "from")}
                    onChange={(event) => setTimeBound(index, "from", event.target.value)}
                  />
                  <span className="rule-arrow">→</span>
                  <input
                    type="time"
                    className="num"
                    data-bound="to"
                    value={timeBound(rule, "to")}
                    onChange={(event) => setTimeBound(index, "to", event.target.value)}
                  />
                </div>
              </div>
              {AXES.map(({ axis, caption, values, label }) => {
                const current = axisRange(rule, axis);
                return (
                  <div className="rule-row" data-axis={axis} key={axis}>
                    <div className="rule-row-label">{caption}</div>
                    <div className="rule-row-controls">
                      <AxisSelect
                        bound="from"
                        values={values}
                        label={label}
                        current={current?.from}
                        onChange={(raw) => setAxisBound(index, axis, "from", raw)}
                      />
                      <span className="rule-arrow">→</span>
                      <AxisSelect
                        bound="to"
                        values={values}
                        label={label}
                        current={current?.to}
                        onChange={(raw) => setAxisBound(index, axis, "to", raw)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Inspector({
  node,
  media,
  queues,
  choiceTargets,
  onDataChange,
  onBranchRemoved,
  onBranchRenamed,
  onClose,
}: InspectorProps) {
  const data = node.data;
  const type = typeof data.type === "string" ? data.type : "";
  const suffix = tokenSuffix(type);

  const setField = (field: string, value: unknown) => {
    onDataChange({ ...data, [field]: value });
  };

  const clearField = (field: string) => {
    const next = { ...data };
    delete next[field];
    onDataChange(next);
  };

  // maxRetries vắng → hiện 1, chỉ ghi khi kéo (Quy ước lô 11).
  const timeoutSeconds = typeof data.timeoutSeconds === "number" ? data.timeoutSeconds : 5;
  const maxRetries = typeof data.maxRetries === "number" ? data.maxRetries : 1;

  return (
    <aside data-testid="inspector" className="builder-inspector">
      <div className="inspector-head">
        <div className="inspector-title" data-testid="inspector-title">
          Cấu hình node
        </div>
        <button
          type="button"
          className="inspector-close"
          data-testid="inspector-close"
          title={CLOSE_TITLE}
          aria-label={CLOSE_TITLE}
          onClick={onClose}
        >
          ›
        </button>
      </div>
      <div className="inspector-body">
        <input
          type="text"
          className="inspector-name"
          data-field="label"
          aria-label="Tên bước"
          placeholder="Tên node"
          maxLength={200}
          value={typeof data.label === "string" ? data.label : ""}
          onChange={(event) => {
            if (event.target.value === "") {
              clearField("label");
            } else {
              setField("label", event.target.value);
            }
          }}
        />
        <div className="inspector-meta">
          <span
            className="inspector-code"
            data-testid="inspector-code"
            style={{
              background: `var(--n-${suffix}-s)`,
              color: `var(--n-${suffix}-t)`,
              borderColor: `var(--n-${suffix}-b)`,
            }}
          >
            {stepCode(type)}
          </span>
          <span className="inspector-type" data-testid="inspector-type">
            {stepLabel(type)}
          </span>
          <span className="inspector-meta-spacer" />
          <span className="inspector-node-id num" data-testid="inspector-node-id">
            {node.id}
          </span>
        </div>

        {type === "play" ? (
          <MediaSelect
            field="mediaId"
            caption="File ghi âm"
            value={typeof data.mediaId === "string" ? data.mediaId : ""}
            media={media}
            onSelect={(mediaId) => setField("mediaId", mediaId)}
          />
        ) : null}

        {type === "menu" ? (
          <>
            <MediaSelect
              field="promptMediaId"
              caption="Ghi âm menu"
              value={typeof data.promptMediaId === "string" ? data.promptMediaId : ""}
              media={media}
              onSelect={(promptMediaId) => setField("promptMediaId", promptMediaId)}
            />
            <RangeField
              field="timeoutSeconds"
              caption="Thời gian chờ"
              min={1}
              max={30}
              value={timeoutSeconds}
              unit="s"
              onChange={(value) => setField("timeoutSeconds", value)}
            />
            <RangeField
              field="maxRetries"
              caption="Số lần lặp lại"
              min={0}
              max={5}
              value={maxRetries}
              unit=" lần"
              onChange={(value) => setField("maxRetries", value)}
            />
            <ChoicesField
              data={data}
              choiceTargets={choiceTargets}
              onDataChange={onDataChange}
              onBranchRemoved={onBranchRemoved}
              onBranchRenamed={onBranchRenamed}
            />
          </>
        ) : null}

        {type === "queue" ? (
          <div className="inspector-field inspector-field-first">
            <label
              className="inspector-label"
              data-testid="inspector-label"
              htmlFor="inspector-queueRef"
            >
              Hàng đợi
            </label>
            <select
              className="inspector-select"
              id="inspector-queueRef"
              data-field="queueRef"
              value={typeof data.queueRef === "string" ? data.queueRef : ""}
              onChange={(event) => setField("queueRef", event.target.value)}
            >
              <option value="" disabled>
                — Chọn hàng đợi —
              </option>
              {queues.map((queue) => (
                <option key={queue.queueRef} value={queue.queueRef}>
                  {queue.displayName}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {type === "schedule" ? (
          <>
            <RulesField data={data} onDataChange={onDataChange} />
            <div className="inspector-field inspector-field-first">
              <label
                className="inspector-label"
                data-testid="inspector-label"
                htmlFor="inspector-timezone"
              >
                Múi giờ
              </label>
              <select
                className="inspector-select"
                id="inspector-timezone"
                data-field="timezone"
                value={typeof data.timezone === "string" ? data.timezone : ""}
                onChange={(event) => setField("timezone", event.target.value)}
              >
                {TIMEZONES.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
