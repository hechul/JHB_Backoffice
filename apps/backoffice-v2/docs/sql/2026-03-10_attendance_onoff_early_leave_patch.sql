begin;

alter table public.attendance_settings
  add column if not exists early_leave_grace_minutes integer not null default 20;

update public.attendance_settings
set early_leave_grace_minutes = coalesce(early_leave_grace_minutes, 20);

commit;
