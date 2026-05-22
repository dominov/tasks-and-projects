CREATE TRIGGER IF NOT EXISTS trg_tasks_default_start_date_from_end
AFTER INSERT ON tasks
FOR EACH ROW
WHEN NEW.start_date IS NULL AND NEW.end_date IS NOT NULL
BEGIN
  UPDATE tasks
  SET start_date = NEW.end_date
  WHERE id = NEW.id;
END;
