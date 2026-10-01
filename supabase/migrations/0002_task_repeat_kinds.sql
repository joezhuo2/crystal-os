-- Smarter task repeats.
--
-- repeat_days used to be the whole story: "every N days". A repeat now has a
-- kind, and repeat_days is the N for the kinds that need one:
--
--   days     every repeat_days days after the start date
--   weekly   on the weekdays in repeat_weekdays (0 = Sunday … 6 = Saturday)
--   monthly  on the start date's day of the month (clamped to short months)
--   after    repeat_days days after the task is completed
--
-- A null repeat_kind with a repeat_days value is a row saved before this
-- migration and is read as "days", so existing repeats keep working without a
-- backfill.

alter table public.tasks
  add column repeat_kind text
    check (repeat_kind in ('days', 'weekly', 'monthly', 'after')),
  add column repeat_weekdays smallint[];
