import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from '../../../extension/node_modules/jsdom/lib/api.js';

const extractor = readFileSync(new URL('../../Sources/HelperCore/Resources/extract-questions.js', import.meta.url), 'utf8');
const sapURL = 'https://learning.sap.com/courses/discovering-sap-s-generative-ai-hub/describing-the-generative-ai-hub';
function page(html, setup = () => {}) {
  const dom = new JSDOM(html, { url: sapURL + '?tracking=omit#fragment', runScripts: 'outside-only' });
  Object.defineProperty(dom.window.document, 'readyState', { value: 'complete', configurable: true });
  setup(dom.window);
  return dom;
}
function extract(html, setup) {
  const dom = page(html, setup);
  try { return JSON.parse(dom.window.eval(extractor)); }
  finally { dom.window.close(); }
}
function question(title = 'Which answer?', type = 'radio', name = 'one') {
  return '<fieldset><legend>' + title + '</legend><label><input type="' + type + '" name="' + name + '">First</label><label><input type="' + type + '" name="' + name + '">Second</label></fieldset>';
}

test('SAP page: all three questions, original option order, selection counts, unchanged DOM', () => {
  const html = readFileSync(new URL('./fixtures/sap-three-questions.html', import.meta.url), 'utf8');
  const dom = page(html);
  try {
    const before = dom.window.document.documentElement.outerHTML;
    const result = JSON.parse(dom.window.eval(extractor));
    assert.equal(result.error, null);
    assert.equal(result.url, sapURL);
    assert.deepEqual(result.questions.map(q => q.kind), ['single_choice', 'single_choice', 'multiple_choice']);
    assert.deepEqual(result.questions.map(q => q.requiredSelectionCount), [1, 1, 3]);
    assert.deepEqual(result.questions.map(q => q.order), [1, 2, 3]);
    const labels = [...dom.window.document.querySelectorAll('.Question_controlLabel__l7fTR')].map(e => e.textContent.trim());
    assert.deepEqual(result.questions.flatMap(q => q.options.map(o => o.text)), labels);
    for (const q of result.questions) assert.deepEqual(q.options.map(o => o.position), [1, 2, 3, 4]);
    assert.equal(dom.window.document.documentElement.outerHTML, before);
  } finally { dom.window.close(); }
});

test('no question, hidden questions and script-only quiz metadata fail without answers', () => {
  for (const html of ['<p>No quiz here</p>', '<div hidden>' + question() + '</div>', '<style>.hidden{display:none}</style><div class="hidden">' + question() + '</div>', '<script type="application/json">{"question":"Which?","answer":2}</script>']) {
    const result = extract(html);
    assert.ok(result.error);
    assert.deepEqual(result.questions, []);
  }
});

test('CSS-hidden answers and scripts are not included in option text', () => {
  const result = extract('<style>.feedback{display:none}</style>' + question().replace('First', 'First<span class="feedback">SECRET_ANSWER</span><script>SECRET_SCRIPT</script>'));
  assert.equal(result.error, null);
  assert.equal(result.questions[0].options[0].text, 'First');
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});

test('incomplete additional question is an error instead of silently returning only the first', () => {
  for (const incomplete of ['<fieldset><legend>Second question?</legend></fieldset>', '<fieldset><legend>Second question?</legend><label><input type="radio">Only one</label></fieldset>']) {
    const result = extract(question() + incomplete);
    assert.ok(result.error);
    assert.deepEqual(result.questions, []);
  }
});

test('empty option text and mixed choice types fail', () => {
  for (const html of [question().replace('>Second', '>'), question().replace('type="radio" name="one">Second', 'type="checkbox" name="one">Second')]) {
    assert.ok(extract(html).error);
  }
});

test('checkbox options may have distinct names and preserve explicit selection counts', () => {
  const result = extract(question('Wählen Sie zwei Antworten', 'checkbox').replace('name="one">Second', 'name="two">Second'));
  assert.equal(result.error, null);
  assert.equal(result.questions[0].requiredSelectionCount, 2);
  assert.equal(result.questions[0].kind, 'multiple_choice');
  assert.equal(extract(question('Which answers?', 'checkbox')).questions[0].requiredSelectionCount, null);
});

test('ARIA controls and nested native controls are read once', () => {
  const html = '<div role="radiogroup" aria-labelledby="q"><h3 id="q">Which answer?</h3><div role="radio" aria-checked="false"><input type="radio" hidden>First</div><div role="radio" aria-checked="true">Second</div></div>';
  const result = extract(html);
  assert.equal(result.error, null);
  assert.deepEqual(result.questions[0].options.map(o => o.text), ['First', 'Second']);
  assert.deepEqual(result.questions[0].options.map(o => o.isSelected), [false, true]);
});

test('associated labels, external question headings, selected values and document order', () => {
  const result = extract('<h3 id="q">Which choice?</h3><div role="group" aria-labelledby="q"><input type="radio" id="b" name="choice" checked><label for="b">B first</label><input type="radio" id="a" name="choice"><label for="a">A second</label></div>');
  assert.equal(result.error, null);
  assert.deepEqual(result.questions[0].options.map(o => o.text), ['B first', 'A second']);
  assert.equal(result.questions[0].options[0].position, 1);
  assert.equal(result.questions[0].options[0].isSelected, true);
});

test('unrelated cookie controls are ignored', () => {
  const result = extract('<div id="cookie-settings">' + question('Select your cookies') + '</div>' + question('Which quiz answer?'));
  assert.equal(result.error, null);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].questionText, 'Which quiz answer?');
});

test('inaccessible visible iframe fails instead of returning a partial answer', () => {
  const result = extract(question() + '<iframe></iframe>', win => Object.defineProperty(win.document.querySelector('iframe'), 'contentDocument', {get: () => null}));
  assert.ok(result.error);
  assert.deepEqual(result.questions, []);
});

test('same-origin iframe questions retain their position between parent questions', () => {
  const result = extract(question('First?') + '<iframe></iframe>' + question('Third?', 'radio', 'third'), win => {
    win.document.querySelector('iframe').contentDocument.body.innerHTML = question('Second?');
  });
  assert.equal(result.error, null);
  assert.deepEqual(result.questions.map(q => q.questionText), ['First?', 'Second?', 'Third?']);
});

test('loading page and busy questions fail before analysis', () => {
  assert.ok(extract(question(), win => Object.defineProperty(win.document, 'readyState', {value: 'loading'})).error);
  assert.ok(extract('<div aria-busy="true">' + question() + '</div>').error);
});

test('oversized pages and too many questions fail', () => {
  assert.ok(extract(question('Which ' + 'x'.repeat(81000) + '?')).error);
  assert.ok(extract(Array.from({length:31}, (_, i) => question('Which ' + i + '?', 'radio', 'q' + i)).join('')).error);
});
