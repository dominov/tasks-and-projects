INSERT OR IGNORE INTO projects (id, name, color, created_at) VALUES
  (1, 'Personal Planning', '#0f766e', '2026-05-01T08:00:00.000Z'),
  (2, 'Workspace Upgrade', '#b45309', '2026-05-01T08:00:00.000Z');

INSERT OR IGNORE INTO categories (id, name, created_at) VALUES
  (1, 'Operations', '2026-05-01T08:00:00.000Z'),
  (2, 'Deep Work', '2026-05-01T08:00:00.000Z');

INSERT OR IGNORE INTO tags (id, name, color) VALUES
  (1, 'urgent', '#dc2626'),
  (2, 'focus', '#2563eb'),
  (3, 'report', '#059669');

INSERT OR IGNORE INTO tasks (
  id,
  title,
  description,
  start_date,
  end_date,
  priority,
  story_points,
  project_id,
  category_id,
  parent_task_id,
  recurrence,
  status,
  start_time,
  end_time
) VALUES
  (
    1,
    'Collect requirements for weekly plan',
    'Gather pending items and blockers for the week.',
    '2026-05-12',
    '2026-05-14',
    2,
    3,
    1,
    1,
    NULL,
    'none',
    'in_progress',
    '2026-05-12T13:00:00.000Z',
    NULL
  ),
  (
    2,
    'Draft task prioritization matrix',
    'Prioritize incoming work by impact and effort.',
    '2026-05-15',
    '2026-05-16',
    3,
    5,
    1,
    2,
    NULL,
    'none',
    'todo',
    NULL,
    NULL
  ),
  (
    3,
    'Publish final weekly execution plan',
    'Finalize and publish the weekly plan to personal dashboard.',
    '2026-05-16',
    '2026-05-18',
    2,
    2,
    1,
    1,
    NULL,
    'weekly',
    'todo',
    NULL,
    NULL
  ),
  (
    4,
    'Audit workstation tools',
    'Review local tools before making upgrades.',
    '2026-05-10',
    '2026-05-11',
    1,
    2,
    2,
    1,
    NULL,
    'none',
    'done',
    '2026-05-10T14:00:00.000Z',
    '2026-05-10T16:30:00.000Z'
  ),
  (
    5,
    'Apply system updates',
    'Install critical local updates and verify restart.',
    '2026-05-17',
    '2026-05-19',
    3,
    4,
    2,
    1,
    NULL,
    'none',
    'todo',
    NULL,
    NULL
  ),
  (
    6,
    'Submit overdue invoice follow-up',
    'This task intentionally remains overdue for TODAY filters.',
    '2025-12-01',
    '2025-12-02',
    3,
    1,
    1,
    1,
    NULL,
    'none',
    'todo',
    NULL,
    NULL
  );

INSERT OR IGNORE INTO dependencies (task_id, depends_on_task_id) VALUES
  (2, 1),
  (3, 2),
  (5, 4);
