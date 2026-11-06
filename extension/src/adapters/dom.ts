import type { Completion, Course, CourseRef, Video } from '../shared/types';
import { lessonUrl, videoId, pluralsightPlayer } from '../shared/urls';
export const clean = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();
export function duration(text: string): number | null {
  const colon = text.match(/\b(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\b/);
  if (colon) return Number(colon[1] ?? 0) * 3600 + Number(colon[2]) * 60 + Number(colon[3]);
  const units = [
    ...text.matchAll(
      /(\d+)\s*(h(?:ours?|r)?|m(?:in(?:utes?|uten)?)?|s(?:ec(?:onds?)?|ek(?:unden?)?)?)\b/gi,
    ),
  ];
  if (!units.length) return null;
  const sum = units.reduce(
    (n, m) => n + Number(m[1]) * ({ h: 3600, m: 60, s: 1 }[m[2][0].toLowerCase()] ?? 0),
    0,
  );
  return sum > 0 ? sum : null;
}
export function completion(element: Element): Completion {
  if (
    element.matches('[data-completed="true"]') ||
    element.querySelector('[data-completed="true"]')
  )
    return 'complete';
  const labels = [
    element.getAttribute('aria-label'),
    ...Array.from(element.querySelectorAll('[aria-label], [title]')).flatMap((e) => [
      e.getAttribute('aria-label'),
      e.getAttribute('title'),
    ]),
  ]
    .filter(Boolean)
    .join(' ');
  if (/\b(not completed|incomplete|nicht abgeschlossen|unwatched)\b/i.test(labels)) return 'open';
  if (/\b(completed|abgeschlossen|watched|angesehen)\b/i.test(labels)) return 'complete';
  return 'unknown';
}
const courseNavSelector =
  '[class*="table-of-contents"], [class*="TableOfContents"], [data-testid*="table-of-contents"], [data-testid*="course-content"], [class*="toc-"], [class*="TOC"], [class*="module-list"], [class*="ModuleList"]';
export const navSelector = 'aside, nav, ' + courseNavSelector;
const moduleSelector =
  '[data-module-id], [data-testid*="module"], [class*="toc-section"], [class*="module"], [class*="Module"]';
const rowSelector =
  'li, [role="listitem"], [data-clip-id], [data-testid*="clip"], [class*="clip-item"], [class*="ClipItem"]';
const durationSelector =
  '[class*="duration"], [class*="Duration"], time, [data-duration], [data-testid*="duration"]';
function itemDuration(row: Element, element: Element): number | null {
  return duration(
    clean(row.querySelector(durationSelector)?.textContent) || clean(element.textContent),
  );
}
function textWithoutDuration(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const metadata of copy.querySelectorAll(durationSelector + ', svg, [aria-hidden="true"]'))
    metadata.remove();
  // textContent joins adjacent title/duration spans without a separating space.
  const walker = copy.ownerDocument.createTreeWalker(copy, 4);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    parts.push(node.textContent ?? '');
  return clean(parts.join(' '));
}
export function currentItem(element: Element): boolean {
  return (
    element.matches(
      '[aria-current="true"], [aria-current="page"], [aria-selected="true"], [data-active="true"]',
    ) ||
    Boolean(
      element.querySelector(
        '[aria-current="true"], [aria-current="page"], [aria-selected="true"], [data-active="true"]',
      ),
    )
  );
}
function rowTitle(row: Element, link: Element): string {
  const title = row.querySelector(
    '[class*="item-title"], [class*="clip-title"], [data-testid="clip-title"], [class*="ClipTitle"]',
  );
  if (title) return textWithoutDuration(title);
  return textWithoutDuration(link)
    .replace(/\((?:Locked|Gesperrt)\)/gi, '')
    .replace(/[|•]+/g, '')
    .replace(/\s+\d{1,3}:\d{2}(?::\d{2})?\s*$/, '')
    .replace(
      /(?:\s+\d+\s*(?:h(?:ours?|r)?|m(?:in(?:utes?|uten)?)?|s(?:ec(?:onds?)?|ek(?:unden?)?)?))+\s*$/i,
      '',
    )
    .trim();
}
function moduleName(row: Element): string {
  const section = row.closest(
    '[class*="toc-section"], [data-module-id], section, [class*="module"]',
  );
  return clean(
    section?.querySelector('h2,h3,h4,[data-testid="module-title"],button[aria-expanded]')
      ?.textContent,
  );
}
export interface DomEntry {
  video: Video;
  element: HTMLElement;
  row: Element;
}
function visibleElement(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  }
  return true;
}
function visibleLoadingFlag(element: Element): boolean {
  return element.getAttribute('aria-busy') === 'true' && visibleElement(element);
}
function navigationCourseIds(doc: Document): Set<string> {
  const ids = new Set<string>();
  for (const root of doc.querySelectorAll(navSelector)) {
    for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const route = pluralsightPlayer(link.getAttribute('href')!);
      const row = link.closest(rowSelector) ?? link;
      if (route && itemDuration(row, link) !== null) ids.add(route.courseId);
    }
  }
  return ids;
}
function courseRefFromNavigation(doc: Document, ref: CourseRef): CourseRef {
  if (ref.platform !== 'pluralsight' || ref.pluralsightCourseId) return ref;
  const ids = navigationCourseIds(doc);
  return ids.size === 1 ? { ...ref, pluralsightCourseId: [...ids][0] } : ref;
}
export function courseIsLoading(doc: Document, ref: CourseRef, found = entries(doc, ref)): boolean {
  const lists = new Set(
    found.map(
      ({ element, row }) =>
        element.closest('ul, ol, [role="list"]') ?? element.closest(navSelector) ?? row,
    ),
  );
  for (const list of lists) {
    if ([list, ...list.querySelectorAll('[aria-busy="true"]')].some(visibleLoadingFlag))
      return true;
    // Respect a loading course container, but not the application/body or sibling widgets.
    for (let parent = list.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches(navSelector) && visibleLoadingFlag(parent)) return true;
    }
  }
  return false;
}
function collapsedCourseSections(
  doc: Document,
  ref: CourseRef,
  found = entries(doc, ref),
): HTMLElement[] {
  const roots = new Set<Element>(doc.querySelectorAll(courseNavSelector));
  for (const { element } of found) {
    const root = element.closest(navSelector);
    if (root) roots.add(root);
  }
  // A completely collapsed module may not contain any lesson nodes yet.
  for (const module of doc.querySelectorAll(moduleSelector)) {
    const root = module.closest(navSelector);
    if (root) roots.add(root);
  }
  const containsVideos = (element: Element) =>
    found.some((entry) => element.contains(entry.element));
  const group = (element: Element) =>
    !element.matches('[role="menu"],[role="listbox"],[role="tooltip"]') &&
    (containsVideos(element) ||
      element.matches(courseNavSelector + ',' + moduleSelector) ||
      (element.matches('ul,ol,[role="list"]') && element.children.length === 0));
  const candidates = new Set<HTMLElement>();
  for (const root of roots) {
    for (const button of root.querySelectorAll<HTMLElement>(
      'button[aria-expanded="false"],[role="button"][aria-expanded="false"]',
    )) {
      if (!visibleElement(button) || button.matches('[aria-haspopup]:not([aria-haspopup="false"])'))
        continue;
      const module = button.closest(moduleSelector);
      const ids = clean(button.getAttribute('aria-controls')).split(' ').filter(Boolean);
      const targets = ids.map((id) => doc.getElementById(id));
      // Some platforms put the module heading and clips in the same list item.
      // Explicitly controlling those clips takes precedence over a shared row.
      if (
        !targets.some((target) => target && containsVideos(target)) &&
        found.some(
          (entry) =>
            entry.row !== module && entry.row.contains(button) && !button.contains(entry.element),
        )
      )
        continue;
      if (ids.length) {
        if (
          targets.some(
            (target) =>
              target && group(target) && (root.contains(target) || containsVideos(target)),
          ) ||
          (targets.every((target) => !target) && module && root.contains(module))
        )
          candidates.add(button);
        continue;
      }
      if (module && root.contains(module)) {
        candidates.add(button);
        continue;
      }
      // Common markup: a module heading/button directly before its lesson list.
      const heading = button.closest('h2,h3,h4,h5,h6,[role="heading"]') ?? button;
      const siblings = [
        heading.nextElementSibling,
        heading.parentElement !== root ? heading.parentElement?.nextElementSibling : null,
      ];
      if (siblings.some((next) => next && root.contains(next) && group(next)))
        candidates.add(button);
    }
  }
  return [...candidates];
}
export function entries(doc: Document, ref: CourseRef): DomEntry[] {
  ref = courseRefFromNavigation(doc, ref);
  const result: DomEntry[] = [];
  const seen = new Set<string>();
  const candidates =
    ref.platform === 'linkedin'
      ? Array.from(
          doc.querySelectorAll<HTMLAnchorElement>(
            'a[href*="/learning/' + CSS.escape(ref.slug) + '/"]',
          ),
        )
      : Array.from(doc.querySelectorAll<HTMLElement>(navSelector)).flatMap((root) =>
          Array.from(root.querySelectorAll<HTMLElement>('a[href],button,[role="button"]')),
        );
  for (const element of candidates) {
    const row = element.closest(rowSelector) ?? element;
    const rawHref = element.getAttribute('href');
    const url = rawHref ? lessonUrl(rawHref, ref) : null;
    const title = rowTitle(row, element);
    const d = itemDuration(row, element);
    if (!title || /\b(quiz|knowledge check|exercise|übung|prüfung)\b/i.test(title)) continue;
    if (!url && (d === null || element.hasAttribute('aria-expanded'))) continue;
    const module = moduleName(row);
    const key = module + '::' + title;
    const id = url ? videoId(url, ref)! : ref.slug + '/item/' + key;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({
      video: {
        id,
        title,
        module,
        duration: d,
        target: url ? { kind: 'url', url } : { kind: 'item', key },
        completion: completion(row),
      },
      element,
      row,
    });
  }
  return result;
}
export function readCourse(doc: Document, ref: CourseRef): Course {
  ref = courseRefFromNavigation(doc, ref);
  const found = entries(doc, ref);
  const issues: string[] = [];
  if (ref.platform === 'pluralsight' && navigationCourseIds(doc).size > 1)
    issues.push(
      'Die Navigation enthält Clip-Links mehrerer Kurse. Die Zuordnung ist nicht eindeutig.',
    );
  const text = clean(doc.body?.textContent);
  if (
    /sign in to unlock this course|sign in with linkedin learning|log in to continue|anmelden, um.*kurs/i.test(
      text,
    ) ||
    doc.querySelector('input[type="password"]')
  )
    issues.push('Bitte im geöffneten Kursfenster anmelden und anschließend erneut erfassen.');
  if (!found.length)
    issues.push('Keine steuerbare Videoliste erkannt. Kursinhalte öffnen und erneut erfassen.');
  const expected = Array.from(doc.querySelectorAll(navSelector))
    .flatMap((root) => [root, ...root.querySelectorAll('[aria-setsize],[data-total-clips]')])
    .map((e) => Number(e.getAttribute('aria-setsize') ?? e.getAttribute('data-total-clips') ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (expected.some((n) => n > found.length))
    issues.push(
      'Die Navigation meldet mehr Einträge als sichtbar sind. Alle Kursinhalte laden und erneut erfassen.',
    );
  if (courseIsLoading(doc, ref, found))
    issues.push(
      'Die Videoliste meldet noch einen aktiven Ladevorgang. Bitte anschließend erneut erfassen.',
    );
  const collapsed = collapsedCourseSections(doc, ref, found);
  if (collapsed.length)
    issues.push(
      'Die Kursnavigation enthält noch eingeklappte Bereiche. Alle Module öffnen und erneut erfassen.',
    );
  const identityCounts = new Map<string, number>();
  for (const root of Array.from(doc.querySelectorAll(navSelector))) {
    // Duplicate button titles without a stable URL cannot safely identify a clip.
    const buttons = Array.from(root.querySelectorAll<HTMLElement>('button,[role="button"]')).filter(
      (e) =>
        !e.hasAttribute('aria-expanded') && itemDuration(e.closest(rowSelector) ?? e, e) !== null,
    );
    for (const b of buttons) {
      const key =
        moduleName(b.closest(rowSelector) ?? b) + '::' + rowTitle(b.closest(rowSelector) ?? b, b);
      identityCounts.set(key, (identityCounts.get(key) ?? 0) + 1);
    }
    if (buttons.length) break;
  }
  if (
    found.some(
      (e) => e.video.target.kind === 'item' && (identityCounts.get(e.video.target.key) ?? 0) > 1,
    )
  )
    issues.push(
      'Mehrdeutige Videotitel ohne eindeutige Clip-Links. Der Kurs kann so nicht sicher gesteuert werden.',
    );
  const h1 = clean(doc.querySelector('h1')?.textContent);
  const title =
    clean(
      doc.querySelector('[data-testid="course-title"], [class*="course-title"]')?.textContent,
    ) ||
    h1 ||
    ref.slug.replaceAll('-', ' ');
  return {
    ref,
    title,
    videos: found.map((e) => e.video),
    complete: issues.length === 0,
    issues,
    scannedAt: Date.now(),
  };
}
export function expandNavigation(doc: Document, ref: CourseRef): void {
  for (const button of collapsedCourseSections(doc, ref)) button.click();
}
export function selectedVideo(doc: Document, ref: CourseRef, location: string): string | null {
  ref = courseRefFromNavigation(doc, ref);
  const selected = entries(doc, ref).find((e) => currentItem(e.row) || currentItem(e.element));
  const fromUrl = videoId(location, ref);
  // A URL/selection disagreement usually means SPA navigation has not settled yet.
  if (selected?.video.target.kind === 'url' && fromUrl && selected.video.id !== fromUrl)
    return null;
  return fromUrl ?? selected?.video.id ?? null;
}
export function assignedVideoMatches(
  doc: Document,
  ref: CourseRef,
  video: Video,
  location: string,
): boolean {
  // ILX can mark a button as selected before the player has navigated. Resolve its
  // physical clip URL after our own click before accepting that selection.
  if (
    ref.platform === 'pluralsight' &&
    video.target.kind === 'item' &&
    new URL(location).pathname.startsWith('/ilx/video-courses/')
  )
    return false;
  const actual = selectedVideo(doc, ref, location);
  if (actual === video.id) return true;
  return (
    video.target.kind === 'url' && actual !== null && actual === videoId(video.target.url, ref)
  );
}
export function playerLoadError(doc: Document): string | null {
  if (!doc.body) return null;
  const walker = doc.createTreeWalker(doc.body, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      /there has been an issue loading your video/i.test(node.textContent ?? '') &&
      node.parentElement &&
      visibleElement(node.parentElement)
    )
      return 'Pluralsight konnte dieses Video nicht laden. „Try again“ im Player oder „Neu starten“ in der Steuerseite verwenden.';
  }
  return null;
}
export function navigateItem(
  doc: Document,
  ref: CourseRef,
  video: Video,
  beforeClick?: () => void,
): boolean {
  const found = entries(doc, ref).find((e) => e.video.id === video.id);
  if (!found) return false;
  beforeClick?.();
  found.element.click();
  return true;
}
