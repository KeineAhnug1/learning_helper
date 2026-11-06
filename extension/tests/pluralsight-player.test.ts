import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { parseCourse, pluralsightPlayer, lessonUrl, videoId } from '../src/shared/urls';
import { readCourse, assignedVideoMatches, playerLoadError } from '../src/adapters/dom';
import { playerAfterAssignedClick } from '../src/controller/navigation';
import type { Assignment } from '../src/shared/types';
import {
  courseId,
  moduleId,
  clipId,
  playerUrl,
  otherPlayerUrl,
  overviewUrl,
} from './fixtures/pluralsight';
vi.stubGlobal('CSS', { escape: (s: string) => s });
const ref = () => ({ ...parseCourse(overviewUrl), pluralsightCourseId: courseId });
describe('Tatsächlicher ILX-Playerpfad', () => {
  it('erkennt die drei UUIDs im vom Nutzer gelieferten Link', () => {
    expect(pluralsightPlayer(playerUrl)).toEqual({ courseId, moduleId, clipId, url: playerUrl });
    expect(parseCourse(playerUrl)).toMatchObject({
      slug: courseId,
      pluralsightCourseId: courseId,
      url: 'https://app.pluralsight.com/ilx/video-courses/' + courseId + '/course-overview',
    });
    expect(videoId(playerUrl, ref())).toBe('big-data-explained/' + clipId);
    expect(lessonUrl(overviewUrl, ref())).toBeNull();
  });
  it('akzeptiert keine fremde Kurs-ID oder Herkunft', () => {
    expect(
      lessonUrl(playerUrl.replace(courseId, 'aaaaaaaa-18f9-48b2-97b4-50d49855321b'), ref()),
    ).toBeNull();
    expect(pluralsightPlayer(playerUrl.replace('app.pluralsight.com', 'evil.test'))).toBeNull();
  });
  it('ordnet die Kurs-UUID aus der Videoliste dem lesbaren Kursnamen zu', () => {
    const d = new JSDOM(
      '<h1>Big Data Explained</h1><aside><ul><li><a href="' +
        playerUrl +
        '"><span class="clip-title">Clip</span><time>2:23</time></a></li></ul></aside>',
    ).window.document;
    const course = readCourse(d, parseCourse(overviewUrl));
    expect(course.complete).toBe(true);
    expect(course.ref.pluralsightCourseId).toBe(courseId);
    expect(course.videos[0].target).toEqual({ kind: 'url', url: playerUrl });
    expect(course.videos[0].id).toBe('big-data-explained/' + clipId);
    const player = new JSDOM('<h1>Big Data Explained</h1><video></video>').window.document;
    expect(assignedVideoMatches(player, course.ref, course.videos[0], playerUrl)).toBe(true);
    expect(assignedVideoMatches(player, course.ref, course.videos[0], otherPlayerUrl)).toBe(false);
  });
  it('behält eine vorhandene interne Video-ID nach der Button-Zuordnung bei', () => {
    const video = {
      id: 'big-data-explained/item/Module::Clip',
      title: 'Clip',
      module: 'Module',
      duration: 143,
      completion: 'unknown' as const,
      target: { kind: 'url' as const, url: playerUrl },
    };
    const d = new JSDOM('<video></video>').window.document;
    expect(assignedVideoMatches(d, ref(), video, playerUrl)).toBe(true);
    expect(assignedVideoMatches(d, ref(), video, otherPlayerUrl)).toBe(false);
  });
  it('erkennt den sichtbaren Ladefehler aus dem Screenshot', () => {
    const html =
      "<p>We're sorry, there has been an issue loading your video.</p><button>Try again</button>";
    expect(playerLoadError(new JSDOM(html).window.document)).toContain(
      'Pluralsight konnte dieses Video nicht laden',
    );
    expect(playerLoadError(new JSDOM('<div hidden>' + html + '</div>').window.document)).toBeNull();
  });
});
describe('Kontrollierter Wechsel über einen Kurseintrag', () => {
  const a: Assignment = {
    runId: 'r',
    epoch: 2,
    slot: 0,
    video: {
      id: 'item-id',
      title: 'Clip',
      module: '',
      duration: 143,
      completion: 'unknown',
      target: { kind: 'item', key: 'Clip' },
    },
    ref: ref(),
    paused: true,
    blocked: false,
    muted: true,
  };
  const intent = {
    runId: 'r',
    epoch: 2,
    slot: 0,
    videoId: 'item-id',
    sourcePage: overviewUrl,
    createdAt: 100,
  };
  it('bindet nur das Ergebnis des passenden aktuellen Klickauftrags', () => {
    expect(playerAfterAssignedClick(intent, a, playerUrl, 200)).toBe(playerUrl);
    expect(playerAfterAssignedClick(undefined, a, playerUrl, 200)).toBeNull();
    expect(playerAfterAssignedClick({ ...intent, epoch: 1 }, a, playerUrl, 200)).toBeNull();
    expect(playerAfterAssignedClick({ ...intent, slot: 1 }, a, playerUrl, 200)).toBeNull();
    expect(playerAfterAssignedClick(intent, a, playerUrl, 70000)).toBeNull();
    expect(
      playerAfterAssignedClick({ ...intent, sourcePage: otherPlayerUrl }, a, playerUrl, 200),
    ).toBeNull();
    expect(
      playerAfterAssignedClick(
        intent,
        a,
        playerUrl.replace(courseId, 'aaaaaaaa-18f9-48b2-97b4-50d49855321b'),
        200,
      ),
    ).toBeNull();
  });
});
