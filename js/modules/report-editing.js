export async function saveReportEdit({supabase,report,text,translated,userId,companyId,canEditAll=false}) {
  if ((report.reporter_id !== userId && !canEditAll) || report.company_id !== companyId) throw new Error('You can only edit your own reports.');
  if (!text.trim() || typeof translated.english_text !== 'string' || !translated.english_text.trim()) throw new Error('A complete report translation is required.');
  const structured = {...(translated.structured_report || translated),ai_usage:translated.ai_usage || null};
  if (report.reporter_id !== userId) {
    const {data,error} = await supabase.rpc('edit_team_report',{
      p_id:report.id,p_company:companyId,p_original:text.trim(),p_english:translated.english_text,p_summary:JSON.stringify(structured),
      p_expected_original:report.original_text,p_expected_english:report.english_text,p_expected_summary:report.english_summary
    });
    if (error) {
      if (['PGRST202','42883'].includes(error.code)) throw new Error('Owner editing needs database activation (021). Your correction is still here; it has not been saved.');
      throw error;
    }
    if (!data) throw new Error('The report could not be updated. Your correction is still here.');
    return data;
  }
  const {data,error} = await supabase.from('daily_reports').update({original_text:text.trim(),english_text:translated.english_text,english_summary:JSON.stringify(structured)})
    .eq('id',report.id).eq('company_id',companyId).eq('reporter_id',userId)
    .eq('original_text',report.original_text).eq('english_text',report.english_text).eq('english_summary',report.english_summary)
    .select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This report changed or is no longer editable. Copy your correction, refresh, and reopen the latest report.');
  return data;
}
