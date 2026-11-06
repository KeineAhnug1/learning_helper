(() => {
  'use strict';
  const result = { url: location.origin + location.pathname, title: document.title, questions: [], error: null };
  const fail = message => JSON.stringify({ ...result, questions: [], error: message });
  const clean = text => (text || '').replace(/\s+/g, ' ').trim();
  const controlSelector = 'input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"]';
  const questionHeadingSelector = 'legend,[data-question-text],[data-testid="question-text"],[class*="questionText"]';
  const headingSelector = questionHeadingSelector + ',h1,h2,h3,h4,h5,h6,[role="heading"]';
  const cookieSelector = '[id*="cookie" i],[class*="cookie" i]';
  function hidden(element) {
    for (let p = element; p; p = p.parentElement) {
      if (p.hidden || p.getAttribute('aria-hidden') === 'true') return true;
      const style = p.ownerDocument.defaultView.getComputedStyle(p);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    }
    return false;
  }
  function text(element) {
    if (!element) return '';
    function read(node) {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1 || node.matches('script,style,noscript,template,input,textarea,select') || hidden(node)) return '';
      return Array.from(node.childNodes).map(read).join(' ');
    }
    return clean(read(element));
  }
  function labelled(element) {
    const ids = clean(element.getAttribute('aria-labelledby')).split(' ').filter(Boolean);
    return ids.map(id => element.ownerDocument.getElementById(id)).filter(Boolean);
  }
  function label(element) {
    const doc = element.ownerDocument;
    return element.closest('label') || (element.id ? Array.from(doc.querySelectorAll('label[for]')).find(l => l.htmlFor === element.id) : null);
  }
  function controls(root) {
    return Array.from(root.querySelectorAll(controlSelector)).filter(e =>
      !hidden(label(e) || e) && !(e.matches('input') && e.parentElement?.closest('[role="radio"],[role="checkbox"]')));
  }
  function heading(root) {
    const associated = labelled(root);
    if (associated.length) return { content: associated.map(text).join(' '), semantic: true };
    const node = root.querySelector(headingSelector);
    if (!node || hidden(node)) return null;
    return { content: text(node), semantic: node.matches(questionHeadingSelector) };
  }
  function questionRoot(element) {
    for (let root = (label(element) || element).parentElement, depth = 0; root && depth < 12; root = root.parentElement, depth++) {
      if (['BODY', 'HTML'].includes(root.tagName)) break;
      const title = heading(root);
      if (!title?.content || controls(root).length < 2) continue;
      if (!title.semantic && !/[?？]|\b(choose|select|which|what|why|how|wer|wie|was|welche|wähle|wählen|markiere)\b/i.test(title.content)) continue;
      // Never merge separate questions under a course heading.
      if (Array.from(root.querySelectorAll(questionHeadingSelector)).filter(e => !hidden(e)).length > 1) return null;
      const names = new Set(controls(root).filter(e => e.matches('input[type="radio"]')).map(e => e.getAttribute('name')).filter(Boolean));
      if (names.size > 1) return null;
      return root;
    }
    return null;
  }
  function countFromHint(root) {
    const node = root.querySelector('[class*="questionHint"],[data-question-hint]');
    const hint = text(node) || text(root);
    const match = hint.match(/(?:there (?:are|is)|choose|select|wähle|wählen sie|es gibt)\s+(\d+|one|two|three|four|five|six|eine|einen|zwei|drei|vier|fünf|sechs)\b/i);
    if (!match) return null;
    const number = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, sechs: 6 }[match[1].toLowerCase()] ?? Number(match[1]);
    return Number.isInteger(number) && number > 0 ? number : null;
  }
  const roots = [];
  let inaccessibleFrame = false;
  let incompleteQuestion = false;
  function scan(doc, depth = 0) {
    if (depth > 3) { inaccessibleFrame = true; return; }
    const seen = new Set();
    for (const input of controls(doc)) {
      if (input.closest(cookieSelector)) continue;
      const root = questionRoot(input);
      if (root) seen.add(root);
    }
    for (const title of doc.querySelectorAll(questionHeadingSelector)) {
      if (!hidden(title) && !title.closest(cookieSelector) && !Array.from(seen).some(root => root.contains(title))) incompleteQuestion = true;
    }
    const entries = [...seen, ...Array.from(doc.querySelectorAll('iframe')).filter(frame => !hidden(frame))];
    entries.sort((a, b) => a.compareDocumentPosition(b) & 4 ? -1 : 1);
    for (const entry of entries) {
      if (entry.tagName !== 'IFRAME') { roots.push(entry); continue; }
      try {
        if (!entry.contentDocument) { inaccessibleFrame = true; continue; }
        scan(entry.contentDocument, depth + 1);
      } catch { inaccessibleFrame = true; }
    }
  }
  if (!/^https?:$/.test(location.protocol)) return fail('Dieser Tab ist keine unterstützte Webseite.');
  if (document.readyState === 'loading') return fail('Die Seite lädt noch. Bitte kurz warten und erneut klicken.');
  scan(document);
  if (inaccessibleFrame) return fail('Ein eingebetteter Seitenbereich ist im Quelltext nicht zugänglich. Bitte Foto verwenden.');
  if (incompleteQuestion) return fail('Mindestens eine Frage ist im Quelltext nicht vollständig auslesbar. Bitte die Fragen fertig laden oder Foto verwenden.');
  if (!roots.length) return fail('Im Quelltext wurde keine vollständig auslesbare Frage gefunden. Öffne die Fragen im Browser oder wähle Foto.');
  if (roots.length > 30) return fail('Die Seite enthält zu viele Fragen. Bitte eine einzelne Quizseite öffnen.');
  for (const [index, root] of roots.entries()) {
    if (root.closest('[aria-busy="true"]') || root.querySelector('[aria-busy="true"]')) return fail('Die Fragen werden noch geladen. Bitte erneut versuchen.');
    const items = controls(root);
    const types = new Set(items.map(e => e.getAttribute('role') || e.getAttribute('type')));
    if (types.size !== 1 || items.length > 100) return fail('Die Antwortoptionen sind im Quelltext nicht eindeutig. Bitte Foto verwenden.');
    const id = 'q' + (index + 1);
    const options = items.map((e, position) => ({
      id: id + '-option' + (position + 1), visibleLabel: null, position: position + 1,
      text: text(label(e)) || labelled(e).map(text).join(' ') || clean(e.getAttribute('aria-label')) || text(e),
      isSelected: e.matches('input') ? e.checked : e.getAttribute('aria-checked') === 'true'
    }));
    if (options.some(o => !o.text)) return fail('Mindestens eine Antwortoption fehlt im Quelltext. Bitte Foto verwenden.');
    const single = types.has('radio');
    result.questions.push({ id, order: index + 1, questionText: heading(root).content,
      kind: single ? 'single_choice' : 'multiple_choice', requiredSelectionCount: single ? 1 : countFromHint(root), options });
  }
  const encoded = JSON.stringify(result);
  if (encoded.length > 80000) return fail('Der Fragenbereich ist zu groß. Bitte eine einzelne Quizseite öffnen.');
  return encoded;
})()
