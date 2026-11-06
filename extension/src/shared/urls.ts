import type { CourseRef, Video } from './types';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function pluralsightPlayer(
  raw: string,
): { courseId: string; moduleId: string; clipId: string; url: string } | null {
  let url: URL;
  try {
    url = new URL(raw, 'https://app.pluralsight.com');
  } catch {
    return null;
  }
  if (url.origin !== 'https://app.pluralsight.com' || url.username || url.password) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts.length !== 5 ||
    parts[0] !== 'ilx' ||
    parts[1] !== 'video-courses' ||
    !parts.slice(2).every((id) => uuid.test(id))
  )
    return null;
  return {
    courseId: parts[2].toLowerCase(),
    moduleId: parts[3].toLowerCase(),
    clipId: parts[4].toLowerCase(),
    url: url.origin + '/' + parts.join('/'),
  };
}
export function parseCourse(input: string): CourseRef {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new Error('Bitte einen vollständigen Kurslink eingeben.');
  }
  if (u.protocol !== 'https:' || u.username || u.password)
    throw new Error('Bitte einen HTTPS-Kurslink ohne Zugangsdaten verwenden.');
  const parts = u.pathname.split('/').filter(Boolean);
  if (
    u.hostname === 'www.linkedin.com' &&
    parts[0] === 'learning' &&
    parts[1] &&
    !['login', 'subscription', 'search', 'me'].includes(parts[1])
  ) {
    const url = new URL(`https://www.linkedin.com/learning/${parts[1]}`);
    const account = u.searchParams.get('u');
    if (account && /^[0-9]+$/.test(account)) url.searchParams.set('u', account);
    url.searchParams.set('autoplay', 'false');
    url.searchParams.set('autoSkip', 'false');
    url.searchParams.set('resume', 'false');
    return { platform: 'linkedin', slug: parts[1], url: url.href, sourceUrl: u.href };
  }
  if (u.hostname === 'app.pluralsight.com') {
    const player = pluralsightPlayer(u.href);
    if (player)
      return {
        platform: 'pluralsight',
        slug: player.courseId,
        pluralsightCourseId: player.courseId,
        url:
          'https://app.pluralsight.com/ilx/video-courses/' + player.courseId + '/course-overview',
        sourceUrl: u.href,
      };
    const ilx = parts[0] === 'ilx' && parts[1] === 'video-courses';
    const slug = ilx
      ? parts[2]
      : parts[0] === 'library' && parts[1] === 'courses'
        ? parts[2]
        : u.searchParams.get('course');
    if (slug && /^[a-zA-Z0-9_-]+$/.test(slug))
      return {
        platform: 'pluralsight',
        slug,
        url: ilx
          ? `https://app.pluralsight.com/ilx/video-courses/${slug}/course-overview`
          : `https://app.pluralsight.com/library/courses/${slug}`,
        sourceUrl: u.href,
      };
  }
  throw new Error('Unterstützt werden Kurslinks von LinkedIn Learning und Pluralsight.');
}
export function lessonUrl(raw: string, ref: CourseRef): string | null {
  let u: URL;
  try {
    u = new URL(raw, ref.url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (ref.platform === 'linkedin') {
    if (u.origin !== 'https://www.linkedin.com' || !u.pathname.startsWith(`/learning/${ref.slug}/`))
      return null;
    const path = u.pathname.split('/').filter(Boolean);
    if (path.length !== 3) return null;
    u.search = '';
    u.hash = '';
    const account = new URL(ref.url).searchParams.get('u');
    if (account) u.searchParams.set('u', account);
    u.searchParams.set('autoplay', 'false');
    u.searchParams.set('autoSkip', 'false');
    u.searchParams.set('resume', 'false');
    return u.href;
  }
  if (u.origin !== 'https://app.pluralsight.com') return null;
  const player = pluralsightPlayer(u.href);
  if (player)
    return player.courseId === (ref.pluralsightCourseId ?? ref.slug).toLowerCase()
      ? player.url
      : null;
  if (
    !u.searchParams.has('clipId') &&
    !u.searchParams.has('clip') &&
    !u.pathname.includes('/clips/') &&
    !u.pathname.includes('/clip/')
  )
    return null;
  const course = u.searchParams.get('course');
  if (course && course !== ref.slug) return null;
  return u.href;
}
export function videoId(url: string, ref: CourseRef): string | null {
  const normalized = lessonUrl(url, ref);
  if (!normalized) return null;
  const u = new URL(normalized);
  const player = ref.platform === 'pluralsight' ? pluralsightPlayer(normalized) : null;
  if (player) return ref.slug + '/' + player.clipId;
  if (ref.platform === 'linkedin') return `${ref.slug}/${u.pathname.split('/').filter(Boolean)[2]}`;
  return `${ref.slug}/${u.searchParams.get('clipId') ?? u.searchParams.get('clip') ?? u.pathname}`;
}
export function targetUrl(video: Video, ref: CourseRef): string {
  if (video.target.kind === 'item') return ref.url;
  const url = lessonUrl(video.target.url, ref);
  if (!url)
    throw new Error('Das Videoziel gehört nicht zum unterstützten Kurs. Bitte neu erfassen.');
  return url;
}
