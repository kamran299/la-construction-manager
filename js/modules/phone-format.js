// Keep international numbers and extensions intact; format US phone numbers.
export function formatPhone(value) {
  const text=String(value??'').trim();
  if (!/^[\d\s()+.-]*$/.test(text)) return text;
  let digits=text.replace(/\D/g,'');
  if (digits.length===11 && digits.startsWith('1')) digits=digits.slice(1);
  else if (text.startsWith('+') || digits.length>10) return text;
  if (!digits) return '';
  if (digits.length<=3) return '('+digits;
  if (digits.length<=6) return '('+digits.slice(0,3)+') '+digits.slice(3);
  return '('+digits.slice(0,3)+') '+digits.slice(3,6)+'-'+digits.slice(6);
}
export function bindPhoneInput(input) {
  if (!input || input.dataset.phoneFormatted) return;
  input.dataset.phoneFormatted='true';
  input.placeholder='(408) 387-0999';
  input.value=formatPhone(input.value);
  input.addEventListener('input',event=>{
    if (event.isComposing) return;
    const original=input.value, position=input.selectionStart??original.length;
    const digitsBefore=original.slice(0,position).replace(/\D/g,'').length;
    const formatted=formatPhone(original);
    if(formatted===original) return;
    input.value=formatted;
    if(position===original.length){input.setSelectionRange(formatted.length,formatted.length);return;}
    let caret=0,count=0;
    while(caret<formatted.length && count<digitsBefore){if(/\d/.test(formatted[caret]))count++;caret++;}
    input.setSelectionRange(caret,caret);
  });
  input.addEventListener('blur',()=>{input.value=formatPhone(input.value);});
}
