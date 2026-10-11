-- Remove the obsolete target_jahit.salary column after all monetary calculations
-- moved to target_cost_posisi. This migration is intentionally explicit and
-- does not use CASCADE.

DO $salary_cleanup_verify$
DECLARE
  has_salary_column boolean;
  has_nonzero_salary boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'target_jahit'
      AND column_name = 'salary'
  ) INTO has_salary_column;

  IF has_salary_column THEN
    EXECUTE 'SELECT EXISTS (
      SELECT 1
      FROM public.target_jahit
      WHERE salary IS NOT NULL AND salary <> 0
    )' INTO has_nonzero_salary;

    IF has_nonzero_salary THEN
      RAISE EXCEPTION 'Target Jahit salary cleanup blocked: non-zero salary data still exists';
    END IF;
  END IF;
END
$salary_cleanup_verify$;

ALTER TABLE public.target_jahit
  DROP COLUMN IF EXISTS salary;
