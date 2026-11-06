import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  duration,
  courseIsLoading,
  entries,
  expandNavigation,
  readCourse,
  selectedVideo,
} from '../src/adapters/dom';
import { parseCourse } from '../src/shared/urls';
import linkedin from '../../docs/video-displayer/fixtures/linkedin-agentic-ai-governance.json';
import pluralsight from '../../docs/video-displayer/fixtures/pluralsight-big-data-explained.json';
vi.stubGlobal('CSS', { escape: (s: string) => s });
afterEach(() => vi.restoreAllMocks());
const mmss = (s: number) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
function doc(html: string): Document {
  return new JSDOM(html).window.document;
}
describe('Kursnavigation', () => {
  it('wertet Account-Menüs und ausgeblendete Kursansichten nicht als geschlossene Module', () => {
    const ref = parseCourse('https://app.pluralsight.com/library/courses/test');
    for (const hidden of ['hidden', 'aria-hidden="true"', 'style="display:none"']) {
      const d = doc(
        '<nav><button id="account" aria-expanded="false">Account</button><ul><li>Profile</li></ul></nav><aside><button aria-expanded="true">Module</button><ul><li><button>Clip 01:30</button></li></ul></aside><div ' +
          hidden +
          ' data-testid="course-content"><section data-module-id="mobile"><button id="mobile" aria-expanded="false">Module</button></section></div>',
      );
      const account = vi.spyOn(d.querySelector<HTMLElement>('#account')!, 'click');
      const mobile = vi.spyOn(d.querySelector<HTMLElement>('#mobile')!, 'click');
      expect(readCourse(d, ref).complete).toBe(true);
      expandNavigation(d, ref);
      expect(account).not.toHaveBeenCalled();
      expect(mobile).not.toHaveBeenCalled();
    }
  });
  it('ignoriert Menüs und Textdetails innerhalb eines geöffneten Kursbereichs', () => {
    const ref = parseCourse('https://app.pluralsight.com/library/courses/test');
    const d = doc(
      '<aside data-testid="course-content"><section data-module-id="module"><button aria-expanded="true">Module</button><ul><li><button>Clip 01:30</button><button aria-expanded="false" aria-haspopup="menu">Clip options</button></li></ul><button aria-expanded="false" aria-controls="details">More details</button><p id="details" hidden>Description</p><button aria-expanded="false" aria-controls="options">Options</button><ul id="options" role="menu"><li>Settings</li></ul></section></aside>',
    );
    const buttons = [...d.querySelectorAll<HTMLElement>('[aria-expanded="false"]')].map((b) =>
      vi.spyOn(b, 'click'),
    );
    expect(readCourse(d, ref).complete).toBe(true);
    expandNavigation(d, ref);
    for (const button of buttons) expect(button).not.toHaveBeenCalled();
  });
  it('meldet ein wirklich geschlossenes Modul trotz bereits im DOM vorhandener Videos', () => {
    const ref = parseCourse('https://app.pluralsight.com/library/courses/test');
    const d = doc(
      '<aside><div role="listitem"><h3><button id="module" aria-expanded="false" aria-controls="clips">Module</button></h3><div id="clips" hidden><button>Clip 01:30</button></div></div></aside>',
    );
    expect(readCourse(d, ref).videos).toHaveLength(1);
    expect(readCourse(d, ref).issues.join(' ')).toContain('eingeklappte');
    d.querySelector('#module')!.addEventListener('click', () => {
      d.querySelector('#module')!.setAttribute('aria-expanded', 'true');
      d.querySelector('#clips')!.removeAttribute('hidden');
    });
    expandNavigation(d, ref);
    expect(readCourse(d, ref).complete).toBe(true);
  });
  it('öffnet erkennbare Module, deren Videoliste erst nach dem Klick angelegt wird', () => {
    const ref = parseCourse('https://app.pluralsight.com/library/courses/test');
    const d = doc(
      '<aside><section data-module-id="lazy"><h3><button id="module" aria-expanded="false" aria-controls="clips">Module</button></h3></section></aside>',
    );
    expect(readCourse(d, ref).issues.join(' ')).toContain('eingeklappte');
    d.querySelector('#module')!.addEventListener('click', () => {
      d.querySelector('#module')!.setAttribute('aria-expanded', 'true');
      d.querySelector('section')!.insertAdjacentHTML(
        'beforeend',
        '<ul id="clips"><li><button>Clip 01:30</button></li></ul>',
      );
    });
    expandNavigation(d, ref);
    expect(readCourse(d, ref).complete).toBe(true);
  });
  it('blockiert eine vollständige Videoliste nicht wegen globaler oder fremder Ladeflags', () => {
    const ref = parseCourse(
      'https://app.pluralsight.com/ilx/video-courses/big-data-explained/course-overview',
    );
    const d = doc(
      '<body aria-busy="true"><nav aria-busy="true">Account-Menü</nav><aside><ul><li><button>Clip 01:30</button></li></ul></aside><section aria-busy="true">Empfehlungen</section></body>',
    );
    expect(courseIsLoading(d, ref)).toBe(false);
    expect(readCourse(d, ref).complete).toBe(true);
  });
  it('erkennt einen wirklichen Ladevorgang im Container der Videoliste', () => {
    const ref = parseCourse('https://app.pluralsight.com/library/courses/test');
    const d = doc('<aside aria-busy="true"><ul><li><button>Clip 01:30</button></li></ul></aside>');
    expect(courseIsLoading(d, ref)).toBe(true);
    expect(readCourse(d, ref).complete).toBe(false);
    d.querySelector('aside')!.setAttribute('aria-busy', 'false');
    expect(readCourse(d, ref).complete).toBe(true);
  });
  it('ignoriert ausgeblendete Ladeindikatoren in der Kursnavigation', () => {
    const ref = parseCourse('https://app.pluralsight.com/library/courses/test');
    const d = doc(
      '<aside><ul><li><button>Clip 01:30</button></li><li hidden aria-busy="true"></li><li aria-hidden="true"><span aria-busy="true"></span></li><li style="display:none" aria-busy="true"></li></ul></aside>',
    );
    expect(courseIsLoading(d, ref)).toBe(false);
    expect(readCourse(d, ref).complete).toBe(true);
  });
  it('trennt unmittelbar benachbarte Titel- und Zeitangaben wie auf der ILX-Seite', () => {
    const ref = parseCourse(
      'https://app.pluralsight.com/ilx/video-courses/big-data-explained/course-overview',
    );
    const d = doc(
      '<aside><ul><li><button><span>What Big Data Is Not</span><span>4m </span><span>49s</span></button></li><li><button><span class="clip-title">Big Data Framework<span class="clip-duration">4m 31s</span></span></button></li><li><button>Build a 5m timer 02:00</button></li></ul></aside>',
    );
    const videos = readCourse(d, ref).videos;
    expect(videos.map((v) => v.title)).toEqual([
      'What Big Data Is Not',
      'Big Data Framework',
      'Build a 5m timer',
    ]);
    expect(videos.slice(0, 2).map((v) => v.duration)).toEqual([289, 271]);
  });
  it('liest 14 LinkedIn-Videos mit Laufzeiten und sperrt die öffentliche Login-Ansicht', () => {
    const ref = parseCourse(linkedin.sourceUrl);
    const markup =
      '<h1>' +
      linkedin.title +
      '</h1><p>Sign in to unlock this course</p><nav><ul>' +
      linkedin.videos
        .map(
          (v) =>
            '<li class="toc-item"><a href="' +
            v.publicLessonUrl +
            '"><div class="table-of-contents__item-title">' +
            v.title +
            '</div><div class="table-of-contents__item-duration">' +
            mmss(v.durationSeconds) +
            '</div></a></li>',
        )
        .join('') +
      '</ul></nav>';
    const course = readCourse(doc(markup), ref);
    expect(course.videos).toHaveLength(14);
    expect(course.videos.reduce((s, v) => s + v.duration!, 0)).toBe(3158);
    expect(course.complete).toBe(false);
    expect(course.issues.join(' ')).toContain('anmelden');
  });
  it('liest eindeutige Pluralsight-Clip-Links und ausgewählten Clip aus einem simulierten Player', () => {
    const ref = parseCourse('https://app.pluralsight.com/library/courses/big-data-explained');
    const markup =
      '<h1>Big Data Explained</h1><aside><ul>' +
      pluralsight.videos
        .map(
          (v) =>
            '<li ' +
            (v.index === 2 ? 'aria-current="true"' : '') +
            '><a href="https://app.pluralsight.com/player?course=big-data-explained&clipId=' +
            v.index +
            '"><span class="clip-title">' +
            v.title +
            '</span><span class="clip-duration">' +
            mmss(v.durationSeconds) +
            '</span></a></li>',
        )
        .join('') +
      '</ul></aside>';
    const d = doc(markup),
      course = readCourse(d, ref);
    expect(course.complete).toBe(true);
    expect(course.videos).toHaveLength(8);
    expect(
      selectedVideo(
        d,
        ref,
        'https://app.pluralsight.com/player?course=big-data-explained&clipId=2',
      ),
    ).toBe('big-data-explained/2');
    expect(
      selectedVideo(
        d,
        ref,
        'https://app.pluralsight.com/player?course=big-data-explained&clipId=3',
      ),
    ).toBeNull();
  });
  it('erkennt nicht eindeutige Button-Ziele', () => {
    const ref = parseCourse('https://app.pluralsight.com/library/courses/test');
    const course = readCourse(
      doc('<aside><button>Same title 02:00</button><button>Same title 02:00</button></aside>'),
      ref,
    );
    expect(course.complete).toBe(false);
    expect(course.issues.join(' ')).toContain('Mehrdeutige');
  });
  it('schließt Quiz aus und öffnet nur Navigation, keine beliebigen Seitenelemente', () => {
    const d = doc(
      '<button id="outside" aria-expanded="false">Unrelated</button><aside><button id="module" aria-expanded="false">Modul</button><ul><li><button>Quiz 01:00</button></li><li><button>Clip 01:30</button></li></ul></aside>',
    );
    const outside = vi.spyOn(d.querySelector<HTMLElement>('#outside')!, 'click'),
      inside = vi.spyOn(d.querySelector<HTMLElement>('#module')!, 'click');
    expandNavigation(d, parseCourse('https://app.pluralsight.com/library/courses/test'));
    expect(inside).toHaveBeenCalledOnce();
    expect(outside).not.toHaveBeenCalled();
    expect(
      entries(d, parseCourse('https://app.pluralsight.com/library/courses/test')).map(
        (e) => e.video.title,
      ),
    ).toEqual(['Clip']);
  });
  it('liest deutsche, englische und Uhrzeit-Dauern', () => {
    expect(duration('4m 21s')).toBe(261);
    expect(duration('1:02:03')).toBe(3723);
    expect(duration('46s')).toBe(46);
    expect(duration('4 Min 21 Sekunden')).toBe(261);
    expect(duration('Live')).toBeNull();
  });
  it('sperrt erkennbar unvollständige, virtualisierte Listen', () => {
    const ref = parseCourse('https://app.pluralsight.com/library/courses/test');
    const course = readCourse(
      doc('<aside data-total-clips="8"><ul><li><button>Clip 01:30</button></li></ul></aside>'),
      ref,
    );
    expect(course.videos).toHaveLength(1);
    expect(course.complete).toBe(false);
    expect(course.issues.join(' ')).toContain('mehr Einträge');
  });
});
