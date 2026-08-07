drop policy if exists "Reporters and managers can delete reports" on public.daily_reports;
create policy "Reporters and managers can delete reports"
  on public.daily_reports for delete to authenticated
  using (
    reporter_id = auth.uid()
    or public.is_company_manager(company_id)
  );

grant delete on public.daily_reports to authenticated;
