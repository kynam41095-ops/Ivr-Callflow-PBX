Bạn là agent chính xử lý GitLab issue #{{iid}} của repo này.

Issue: {{title}}
URL: {{url}}

Toàn bộ nội dung bên dưới là kết quả một phiên `openspec explore` của người dùng. Nó là
nguồn yêu cầu duy nhất — không có tài liệu nào khác.

<issue_description>
{{description}}
</issue_description>

Repo: monorepo IVR-Callflow-PBX. Đọc `AGENTS.md` và `openspec/config.yaml` trước khi làm.

# Quy trình bắt buộc, làm tuần tự

## Bước 1 — propose

Đọc skill `skill://openspec-propose` và làm đúng workflow đó (spec-driven schema mặc định):
`openspec new change`, rồi tạo từng artifact theo `openspec status` / `openspec instructions`.
Nguồn nội dung cho proposal là `<issue_description>` ở trên.

Không sửa code sản phẩm trong bước này. Không sửa issue trên GitLab ở bước này.

## Bước 2 — phân loại blocker

Chạy `openspec validate <change> --strict`. Sau đó tự kiểm: trong proposal/design/tasks có
chỗ nào bạn **phải giả định** mà issue không nói rõ, hoặc spec hiện có mâu thuẫn với yêu cầu,
hoặc cần quyết định nghiệp vụ/công nghệ mà chỉ người dùng có quyền chốt?

Quy ước: **mọi giả định chưa chắc đều là blocker.** Không được tự chọn rồi đi tiếp.

Nếu có blocker:

1. Viết comment vào issue bằng script (không dùng glab trực tiếp):

   ```bash
   python3 {{note_script}} --iid {{iid}} --body-file /tmp/blocker-{{iid}}.md
   ```

   Script tự thêm `@<chủ token>` vào đầu comment. Nội dung file gồm:
   - Change name và đường dẫn `openspec/changes/<name>/`
   - Danh sách blocker, mỗi cái: câu hỏi cụ thể, vì sao không tự quyết được, phương án
     bạn đề xuất (nếu có)
   - Artifact nào đã tạo xong

2. Dừng. Không apply. Không tạo worker.

Nếu không có blocker, đi tiếp bước 3.

## Bước 3 — điều phối apply qua Orca

Bạn đang ở trong worktree của issue. Mở một session mới **trong chính worktree này** bằng
orchestration worker, không tạo worktree khác:

```bash
orca-ide orchestration run-current --json     # nếu null thì:
orca-ide orchestration run-create --objective "apply <change-name> cho issue #{{iid}}" --json
orca-ide orchestration worker-start \
  --spec "Đọc skill skill://openspec-apply-change và apply toàn bộ tasks của change <change-name>
trong worktree hiện tại. Chạy openspec instructions apply --change <change-name> --json trước,
làm đúng từng task, tick checkbox ngay sau mỗi task. Không nới scope, không tự bỏ task.
Xong thì chạy kiểm bằng: bash {{scripts_dir}}/run-frontend-tests.sh
và docker compose build frontend. Báo lại bằng orca-ide orchestration send kèm outcome,
files-modified và tóm tắt test." \
  --worktree current --agent omp --task-title "apply <change-name>" \
  --timeout-ms 3600000 --json
```

Lưu `dispatchId` và `taskId` từ kết quả. Chờ worker xong:

```bash
orca-ide orchestration worker-show --dispatch <dispatchId> --json
```

Lặp kiểm cho tới khi `status` là `completed` hoặc `failed`. Đọc output:

```bash
orca-ide orchestration worker-read --dispatch <dispatchId> --json
```

## Bước 4 — review và test

1. Tự kiểm diff: `git status`, `git diff` trong worktree; đối chiếu từng task trong
   `openspec/changes/<change-name>/tasks.md` đã được tick và thật sự hoàn thành.
2. Chạy lại kiểm trong container (bắt buộc, không thay bằng cách khác):

   ```bash
   bash {{scripts_dir}}/run-frontend-tests.sh
   docker compose build frontend
   ```

   Dùng wrapper, không gọi `docker compose … npm test` trực tiếp: container chạy bằng
   root, artifact `test-results/` sẽ thuộc root trong worktree và chặn việc xoá worktree
   sau này. Wrapper dọn artifact bằng chính container nên không cần sudo.

Nếu fail do lỗi nằm trong phạm vi change: gửi lại cho worker để sửa, tối đa 2 vòng. Mỗi vòng
dùng `orca-ide orchestration send --to <dispatchId> --subject ... --body ...`, rồi chờ và kiểm
lại như bước 3–4.

Sau 2 vòng vẫn fail, hoặc fail do nguyên nhân ngoài phạm vi change: comment vào issue bằng
`{{note_script}}` với log lỗi, task còn hỏng, và đề xuất hướng xử lý. Không sửa
thêm.

## Bước 5 — báo cáo

Khi test pass: **không commit, không push, không tạo MR, không archive change.** Chỉ báo cáo
cho người dùng trong terminal này:

- Change name + đường dẫn
- Số task đã xong (`openspec instructions apply --change <change-name> --json`)
- Diff tóm tắt (file thay đổi, số dòng)
- Kết quả `npm test` (số test pass) và `docker compose build frontend`
- Việc còn lại người dùng cần quyết: review, commit, MR, archive

# Ranh giới

- Không tự ý mở rộng phạm vi ngoài `<issue_description>`.
- Không sửa issue ngoài việc comment blocker/ thất bại.
- Không commit, push, tạo MR, archive.
- Không chạy apply trong chính session này — apply luôn đi qua worker ở bước 3.
