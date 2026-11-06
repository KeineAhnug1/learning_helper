import { describe, expect, it } from 'vitest';
import { parseCourse, lessonUrl, videoId, targetUrl } from '../src/shared/urls';
describe('Kurslinks', () => {
  it('akzeptiert den gemeldeten ILX-Link und behält dessen Kursübersicht als Einstieg', () => {
    const url = 'https://app.pluralsight.com/ilx/video-courses/big-data-explained/course-overview';
    const ref = parseCourse(url);
    expect(ref).toEqual({ platform:'pluralsight', slug:'big-data-explained', url, sourceUrl:url });
    expect(parseCourse(ref.url)).toEqual(ref);
    expect(targetUrl({id:'first',title:'First clip',module:'',duration:120,completion:'unknown',target:{kind:'item',key:'First clip'}},ref)).toBe(url);
  });
  it('normalisiert auch einen ILX-Kurslink ohne course-overview', () => {
    const ref = parseCourse('https://app.pluralsight.com/ilx/video-courses/big-data-explained/');
    expect(ref.url).toBe('https://app.pluralsight.com/ilx/video-courses/big-data-explained/course-overview');
    expect(() => parseCourse('https://app.pluralsight.com/ilx/video-courses/')).toThrow();
  });
  it('erfasst aus Next steps den ganzen LinkedIn-Kurs und behält den Organisationskontext', () => {
    const ref = parseCourse(
      'https://www.linkedin.com/learning/introduction-to-agentic-ai-governance/next-steps?autoSkip=true&leis=OCN&resume=false&u=57692769',
    );
    expect(ref.slug).toBe('introduction-to-agentic-ai-governance');
    const url = new URL(ref.url);
    expect(url.pathname).toBe('/learning/introduction-to-agentic-ai-governance');
    expect(url.searchParams.get('u')).toBe('57692769');
    expect(url.searchParams.get('autoSkip')).toBe('false');
    expect(videoId('https://www.linkedin.com/learning/' + ref.slug + '/next-steps', ref)).toBe(
      ref.slug + '/next-steps',
    );
  });
  it('erkennt den Pluralsight-Kurs und prüft explizite Clip-Links', () => {
    const ref = parseCourse('https://app.pluralsight.com/library/courses/big-data-explained');
    expect(ref.slug).toBe('big-data-explained');
    expect(
      videoId('https://app.pluralsight.com/player?course=big-data-explained&clipId=abc', ref),
    ).toBe('big-data-explained/abc');
    expect(
      lessonUrl('https://app.pluralsight.com/player?course=another-course&clipId=abc', ref),
    ).toBeNull();
  });
  it('akzeptiert keine fremden Origins, Zugangsdaten oder Protokolle', () => {
    for (const url of [
      'javascript:alert(1)',
      'http://www.linkedin.com/learning/course',
      'https://www.linkedin.com.evil.test/learning/course',
      'https://user:pass@app.pluralsight.com/library/courses/course',
      'https://app.pluralsight.com/',
    ])
      expect(() => parseCourse(url)).toThrow();
    const ref = parseCourse('https://www.linkedin.com/learning/course');
    expect(lessonUrl('https://www.linkedin.com/learning/other-course/clip', ref)).toBeNull();
    expect(lessonUrl('https://evil.test/learning/course/clip', ref)).toBeNull();
  });
});
