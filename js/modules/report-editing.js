export async function saveReportEdit({supabase,report,text,translated,userId,companyId}) {
  if (report.reporter_id !== userId || report.company_id !== companyId) throw new Error('You can only edit your own reports.');
  if (!text.trim() || typeof translated.english_text !== 'string' || !translated.english_text.trim()) throw new Error('A complete report translation is required.');
  const structured = {...(translated.structured_report || translated),ai_usage:translated.ai_usage || null};
  const {data,error} = await supabase.from('daily_reports').update({original_text:text.trim(),english_text:translated.english_text,english_summary:JSON.stringify(structured)})
    .eq('id',report.id).eq('company_id',companyId).eq('reporter_id',userId)
    .eq('original_text',report.original_text).eq('english_text',report.english_text).eq('english_summary',report.english_summary)
    .select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This report changed or is no longer editable. Copy your correction, refresh, and reopen the latest report.');
  return data;
}
