import { useState } from "react";
import type { Node } from "@xyflow/react";
import type { MediaAsset, QueueRecord } from "../../data/api";
import type { IntRange, ScheduleRule, TimeRange } from "../../flow/types";
import { stepLabel } from "../../canvas/steps";

// Inspector của node đang chọn: chỉ trường có trong $defs của
// flow-document.schema.json. Mọi điều khiển nhập liệu mang data-field trên
// chính nó hoặc trên tổ tiên gần nhất (choices, rules là vùng chứa).
// Không có điều khiển cho trường trỏ (*NodeId, đích của choices) — nối
// nhánh bằng cạnh trên canvas (Tự quyết iter 5). Không có điều khiển, nhãn
// hay chữ nào cho mười trường đã bỏ (Change Request 1 mục 1.2).

type AxisKey = "weekday" | "monthDay" | "month" | "year";
type Bound = "from" | "to";

export type InspectorProps = {
  node: Node;
  media: MediaAsset[];
  queues: QueueRecord[];
  onDataChange: (data: Record<string, unknown>) => void;
  onBranchRemoved: (handle: string) => void;
};

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DEFAULT_TIME: TimeRange = { from: "08:00", to: "17:00" };
const TIMEZONES = ["Asia/Ho_Chi_Minh", "Asia/Bangkok", "UTC"];
const MENU_KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "#"];
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
  { axis: "month", caption: "Tháng", values: range(1, 12) },
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
    <label className="inspector-field">
      <span className="inspector-label">{caption}</span>
      <select data-field={field} value={value} onChange={(event) => onSelect(event.target.value)}>
        <option value="" disabled>
          — Chọn file âm thanh —
        </option>
        {media.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChoicesField({
  data,
  onDataChange,
  onBranchRemoved,
}: {
  data: Record<string, unknown>;
  onDataChange: (data: Record<string, unknown>) => void;
  onBranchRemoved: (handle: string) => void;
}) {
  const [pendingKey, setPendingKey] = useState("");
  const choices = isRecord(data.choices) ? data.choices : {};
  const freeKeys = MENU_KEYS.filter((key) => !Object.hasOwn(choices, key));

  const addKey = () => {
    if (pendingKey === "" || Object.hasOwn(choices, pendingKey)) {
      return;
    }
    // Đích rỗng cho tới khi nối cạnh (Tự quyết iter 5) — lô 4 báo lỗi
    // phím chưa nối khi kiểm hợp lệ.
    onDataChange({ ...data, choices: { ...choices, [pendingKey]: "" } });
    setPendingKey("");
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
    <div className="inspector-field" data-field="choices">
      <span className="inspector-label">Phím bấm</span>
      <ul className="inspector-choices">
        {Object.keys(choices).map((key) => (
          <li key={key}>
            <span>Phím {key}</span>
            <button type="button" onClick={() => removeKey(key)}>
              Xoá
            </button>
          </li>
        ))}
      </ul>
      <div className="inspector-choice-add">
        <select value={pendingKey} onChange={(event) => setPendingKey(event.target.value)}>
          <option value="">— Chọn phím —</option>
          {freeKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        <button type="button" onClick={addKey} disabled={pendingKey === ""}>
          Thêm
        </button>
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
    <div className="inspector-field" data-field="rules">
      <span className="inspector-label">Khung giờ</span>
      {rules.map((rule, index) => (
        <div className="schedule-rule" data-testid="schedule-rule" key={index}>
          <div className="rule-row" data-axis="time">
            <span>Giờ</span>
            <input
              type="time"
              data-bound="from"
              value={timeBound(rule, "from")}
              onChange={(event) => setTimeBound(index, "from", event.target.value)}
            />
            <input
              type="time"
              data-bound="to"
              value={timeBound(rule, "to")}
              onChange={(event) => setTimeBound(index, "to", event.target.value)}
            />
          </div>
          {AXES.map(({ axis, caption, values, label }) => {
            const current = axisRange(rule, axis);
            return (
              <div className="rule-row" data-axis={axis} key={axis}>
                <span>{caption}</span>
                <AxisSelect
                  bound="from"
                  values={values}
                  label={label}
                  current={current?.from}
                  onChange={(raw) => setAxisBound(index, axis, "from", raw)}
                />
                <AxisSelect
                  bound="to"
                  values={values}
                  label={label}
                  current={current?.to}
                  onChange={(raw) => setAxisBound(index, axis, "to", raw)}
                />
              </div>
            );
          })}
          <button
            type="button"
            data-testid="rule-remove"
            disabled={rules.length <= RULES_MIN}
            onClick={() => removeRule(index)}
          >
            Xoá khung
          </button>
        </div>
      ))}
      <button type="button" data-testid="rule-add" disabled={rules.length >= RULES_MAX} onClick={addRule}>
        Thêm khung
      </button>
    </div>
  );
}

export function Inspector({ node, media, queues, onDataChange, onBranchRemoved }: InspectorProps) {
  const data = node.data;
  const type = typeof data.type === "string" ? data.type : "";

  const setField = (field: string, value: unknown) => {
    onDataChange({ ...data, [field]: value });
  };

  const clearField = (field: string) => {
    const next = { ...data };
    delete next[field];
    onDataChange(next);
  };

  return (
    <aside data-testid="inspector" className="builder-inspector">
      <h2>{stepLabel(type)}</h2>
      <label className="inspector-field">
        <span className="inspector-label">Tên bước</span>
        <input
          type="text"
          data-field="label"
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
      </label>

      {type === "play" ? (
        <MediaSelect
          field="mediaId"
          caption="File âm thanh"
          value={typeof data.mediaId === "string" ? data.mediaId : ""}
          media={media}
          onSelect={(mediaId) => setField("mediaId", mediaId)}
        />
      ) : null}

      {type === "menu" ? (
        <>
          <MediaSelect
            field="promptMediaId"
            caption="Lời nhắc"
            value={typeof data.promptMediaId === "string" ? data.promptMediaId : ""}
            media={media}
            onSelect={(promptMediaId) => setField("promptMediaId", promptMediaId)}
          />
          <label className="inspector-field">
            <span className="inspector-label">Thời gian chờ (giây)</span>
            <input
              type="number"
              data-field="timeoutSeconds"
              min={1}
              max={30}
              value={typeof data.timeoutSeconds === "number" ? String(data.timeoutSeconds) : ""}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isInteger(parsed) || parsed < 1 || parsed > 30) {
                  // Trường bắt buộc — rỗng/không hợp lệ thì giữ giá trị cũ;
                  // render lại để khôi phục chữ trên ô nhập.
                  onDataChange({ ...data });
                  return;
                }
                setField("timeoutSeconds", parsed);
              }}
            />
          </label>
          <label className="inspector-field">
            <span className="inspector-label">Số lần lặp lại</span>
            <input
              type="number"
              data-field="maxRetries"
              min={0}
              max={5}
              value={typeof data.maxRetries === "number" ? String(data.maxRetries) : ""}
              onChange={(event) => {
                if (event.target.value === "") {
                  clearField("maxRetries");
                  return;
                }
                const parsed = Number(event.target.value);
                if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5) {
                  onDataChange({ ...data });
                  return;
                }
                setField("maxRetries", parsed);
              }}
            />
          </label>
          <ChoicesField data={data} onDataChange={onDataChange} onBranchRemoved={onBranchRemoved} />
        </>
      ) : null}

      {type === "queue" ? (
        <label className="inspector-field">
          <span className="inspector-label">Hàng đợi</span>
          <select
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
        </label>
      ) : null}

      {type === "schedule" ? (
        <>
          <label className="inspector-field">
            <span className="inspector-label">Múi giờ</span>
            <select
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
          </label>
          <RulesField data={data} onDataChange={onDataChange} />
        </>
      ) : null}
    </aside>
  );
}
