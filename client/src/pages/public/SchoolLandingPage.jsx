import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  GraduationCap,
  Heart,
  Image as ImageIcon,
  Mail,
  MapPin,
  Menu,
  Phone,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SCHOOL } from '../../config/school';
import { publicSchoolImageUrl, publicSchoolService } from '../../services/public-school.service';

const NAV_ITEMS = [
  ['About Us', 'about'],
  ['Academics', 'academics'],
  ['Activities', 'activities'],
  ['Achievements', 'achievements'],
  ['Gallery', 'gallery'],
  ['Contact', 'contact'],
];

const ACADEMIC_FIELDS = [
  ['Academic programmes', 'academicPrograms'],
  ['Teaching and learning', 'teachingApproach'],
  ['Academic calendar', 'academicCalendar'],
  ['Examinations', 'examinationInfo'],
  ['Special programmes', 'specialPrograms'],
];

function contentLines(value) {
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith('[') || text.startsWith('{')) {
      try {
        return contentLines(JSON.parse(text));
      } catch {
        return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      }
    }
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap(contentLines);
  if (typeof value === 'object') {
    const line = value.title || value.name || value.description || value.label;
    if (typeof line === 'string' && line.trim()) return [line.trim()];
    return Object.values(value).flatMap(contentLines);
  }
  return [String(value)];
}

function ContentBlock({ title, value, icon: Icon = Check, className = '' }) {
  const lines = contentLines(value);
  if (!lines.length) return null;
  return (
    <article className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Icon className="h-4 w-4 text-brand-700" aria-hidden="true" />
        {title}
      </h3>
      {lines.length === 1 ? (
        <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{lines[0]}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {lines.map((line, index) => (
            <li key={`${title}-${index}`} className="flex gap-2 text-sm leading-6 text-slate-600">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function SectionHeading({ eyebrow, title, description, light = false }) {
  return (
    <div className="mb-9 max-w-2xl">
      {eyebrow && (
        <p className={`text-xs font-bold uppercase tracking-[0.2em] ${light ? 'text-amber-300' : 'text-brand-700'}`}>
          {eyebrow}
        </p>
      )}
      <h2 className={`mt-3 text-3xl font-semibold tracking-tight sm:text-4xl ${light ? 'text-white' : 'text-slate-950'}`}>
        {title}
      </h2>
      {description && <p className={`mt-3 text-base leading-7 ${light ? 'text-slate-300' : 'text-slate-600'}`}>{description}</p>}
    </div>
  );
}

function SchoolLogo({ imageUrl, compact = false }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-900 text-white ${compact ? 'h-10 w-10' : 'h-12 w-12'}`}>
      {imageUrl ? (
        <img src={publicSchoolImageUrl(imageUrl)} alt="" className="h-full w-full object-contain p-1" />
      ) : (
        <GraduationCap className={compact ? 'h-6 w-6' : 'h-7 w-7'} aria-hidden="true" />
      )}
    </span>
  );
}

export default function SchoolLandingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState('All');
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    publicSchoolService.get()
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  useEffect(() => {
    if (!selectedImage) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedImage(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedImage]);

  const details = data?.details ?? {};
  const schoolName = data?.school?.name || SCHOOL.name;
  const bengaliName = details.nameBn || SCHOOL.nameBn;
  const gallery = useMemo(() => {
    const images = [
      ...(data?.galleryImages ?? []),
      ...(data?.albums ?? []).flatMap((album) =>
        (album.images ?? []).map((image) => ({ ...image, albumTitle: album.title })),
      ),
    ];
    const seen = new Set(images.map((image) => image.imageUrl));
    for (const album of data?.albums ?? []) {
      if (album.coverUrl && !seen.has(album.coverUrl)) {
        images.push({
          id: `album-cover-${album.id}`,
          title: album.title,
          caption: album.description,
          category: 'Album cover',
          imageUrl: album.coverUrl,
          albumTitle: album.title,
        });
        seen.add(album.coverUrl);
      }
    }
    return images.filter((image) => image.imageUrl);
  }, [data]);
  const categories = useMemo(
    () => ['All', ...new Set(gallery.map((image) => image.category).filter(Boolean))],
    [gallery],
  );
  const visibleGallery = category === 'All' ? gallery : gallery.filter((image) => image.category === category);
  const heroImage = details.coverUrl || gallery[0]?.imageUrl || data?.albums?.find((album) => album.coverUrl)?.coverUrl;
  const intro = details.introduction || details.aboutUs || SCHOOL.description;
  const aboutFields = [
    ['Our history', details.history, CalendarDays],
    ['Mission', details.mission, Sparkles],
    ['Vision', details.vision, ArrowUpRight],
    ['Educational philosophy', details.educationalPhilosophy, BookOpen],
    ['Our objectives', details.objectives, Check],
    ['Core values', details.coreValues, Heart],
    ['A message from the Headteacher', details.principalMessage, GraduationCap],
  ];
  const hasAboutDetails = aboutFields.some(([, value]) => contentLines(value).length);
  const activities = contentLines(details.activities);
  const achievements = contentLines(details.achievements);
  const awards = contentLines(details.awards);
  const notices = data?.notices ?? [];
  const contact = [
    data?.school?.address && { icon: MapPin, label: 'Address', value: data.school.address },
    data?.school?.phone && { icon: Phone, label: 'Phone', value: data.school.phone, href: `tel:${data.school.phone}` },
    data?.school?.email && { icon: Mail, label: 'Email', value: data.school.email, href: `mailto:${data.school.email}` },
  ].filter(Boolean);

  return (
    <div className="public-page min-h-screen bg-white text-slate-900">
      <a href="#main-content" className="sr-only z-50 rounded-md bg-white p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#home" className="flex min-w-0 items-center gap-3" aria-label={`${schoolName} home`}>
            <SchoolLogo imageUrl={details.logoUrl} compact />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-bold text-slate-950 sm:text-base">{schoolName}</span>
              <span lang="bn" className="block truncate text-xs text-slate-500">{bengaliName}</span>
            </span>
          </a>

          <nav className="hidden items-center gap-6 lg:flex" aria-label="Main navigation">
            <a className="text-sm font-medium text-slate-600 hover:text-brand-800" href="#home">Home</a>
            {NAV_ITEMS.map(([label, id]) => (
              <a key={id} className="text-sm font-medium text-slate-600 hover:text-brand-800" href={`#${id}`}>{label}</a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link to="/login" className="inline-flex rounded-lg bg-brand-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-800 sm:px-4 sm:py-2.5 sm:text-sm">
              Login
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 lg:hidden"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="mobile-navigation" className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden" aria-label="Mobile navigation">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-1">
              {[['Home', 'home'], ...NAV_ITEMS].map(([label, id]) => (
                <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {label}
                </a>
              ))}
              <Link to="/login" onClick={() => setMenuOpen(false)} className="col-span-2 mt-1 rounded-lg bg-brand-900 px-3 py-2.5 text-center text-sm font-semibold text-white">
                Login to Portal
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main id="main-content">
        <section id="home" className="relative overflow-hidden bg-slate-950">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_40%,rgba(38,105,82,0.36),transparent_52%)]" aria-hidden="true" />
          <div className="relative mx-auto grid min-h-[620px] max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-emerald-100">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Play Group to Class 10
              </div>
              <h1 className="text-4xl font-semibold leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Learning with purpose.
                <span className="mt-2 block text-amber-300">Growing with values.</span>
              </h1>
              <p lang="bn" className="mt-4 text-xl font-medium text-white/90 sm:text-2xl">{bengaliName}</p>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">{intro}</p>
              <p className="mt-3 text-sm font-medium text-emerald-100">Academics · Moral values · Sports · Creativity</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#about" className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300">
                  Explore our school <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <Link to="/login" className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                  Login to portal <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <a href="#about" className="mt-10 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
                Discover Ratonpur Central School <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>

            <div className="relative mx-auto w-full max-w-xl lg:ml-auto">
              <div className="absolute -left-5 -top-5 h-24 w-24 rounded-full border border-amber-300/30" aria-hidden="true" />
              <div className="absolute -bottom-5 -right-5 h-32 w-32 rounded-full border border-emerald-200/20" aria-hidden="true" />
              <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-white/15 bg-slate-900 shadow-2xl">
                {heroImage ? (
                  <img
                    src={publicSchoolImageUrl(heroImage)}
                    alt={`${schoolName} school photograph`}
                    loading="eager"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center bg-[linear-gradient(145deg,#173b35_0%,#102722_52%,#15202b_100%)] px-8 text-center">
                    <span className="flex h-24 w-24 items-center justify-center rounded-full border border-white/20 bg-white/5 text-amber-300">
                      <GraduationCap className="h-12 w-12" aria-hidden="true" />
                    </span>
                    <p className="mt-6 text-lg font-semibold text-white">{schoolName}</p>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-slate-300">School photographs will appear here when published by the school.</p>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 to-transparent px-6 pb-6 pt-16">
                  <p className="text-sm font-medium text-white">{schoolName}</p>
                  <p lang="bn" className="mt-1 text-sm text-slate-200">{bengaliName}</p>
                </div>
              </div>
              <div className="absolute -bottom-7 left-4 hidden items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg sm:flex">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                  <BookOpen className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-xs text-slate-500">A school for</span>
                  <span className="block text-sm font-semibold text-slate-900">Play Group to Class 10</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-100 bg-white">
          <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-slate-100 px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6 lg:px-8">
            {[
              ['Early Years', 'Play Group · Nursery · KG'],
              ['Primary', 'Classes 1–5'],
              ['Secondary', 'Classes 6–10'],
            ].map(([label, value]) => (
              <div key={label} className="py-5 text-center sm:px-6 sm:py-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">{label}</p>
                <p className="mt-1.5 text-sm font-semibold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {error && (
          <div className="mx-auto mt-6 flex max-w-7xl flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <p>School details could not be loaded. You can still browse the school overview.</p>
            <button type="button" onClick={() => setRetry((count) => count + 1)} className="font-semibold underline underline-offset-2">Try again</button>
          </div>
        )}

        <section id="about" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <SectionHeading
                eyebrow="About our school"
                title="A place to learn and grow"
                description={details.aboutUs || details.introduction || SCHOOL.description}
              />
              <p className="max-w-xl whitespace-pre-line text-sm leading-7 text-slate-600">{details.introduction && details.aboutUs ? details.introduction : ''}</p>
              {!hasAboutDetails && !loading && (
                <p className="mt-5 text-sm text-slate-500">More information about the school will be shared here when it is published.</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {aboutFields.map(([title, value, Icon]) => (
                <ContentBlock key={title} title={title} value={value} icon={Icon} />
              ))}
            </div>
          </div>
        </section>

        <section id="academics" className="bg-slate-50">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
            <SectionHeading
              eyebrow="Academics"
              title="Learning at every stage"
              description="From the early years through secondary school, the academic programme is shaped around the information shared by the school."
            />
            <div className="mb-8 grid gap-4 md:grid-cols-3">
              {[
                ['Early Years', 'Play Group, Nursery and KG', 'A welcoming start to the school journey.'],
                ['Primary', 'Classes 1–5', 'Building strong foundations for learning.'],
                ['Secondary', 'Classes 6–10', 'Continuing academic development through Class 10.'],
              ].map(([title, range, text]) => (
                <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-800">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-brand-700">{title}</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">{range}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                </article>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ACADEMIC_FIELDS.map(([title, key]) => (
                <ContentBlock key={key} title={title} value={details[key]} icon={CalendarDays} />
              ))}
              {contentLines(details.educationLevels).length > 0 && (
                <ContentBlock title="Published education levels" value={details.educationLevels} icon={GraduationCap} />
              )}
            </div>
            {!loading && !ACADEMIC_FIELDS.some(([, key]) => contentLines(details[key]).length) && !contentLines(details.educationLevels).length && (
              <p className="mt-5 text-sm text-slate-500">Additional academic information will be added when published by the school.</p>
            )}
          </div>
        </section>

        <section id="activities" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <SectionHeading
            eyebrow="Beyond the classroom"
            title="Activities and events"
            description="Published school activities and event photographs are shared here."
          />
          {activities.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activities.map((activity, index) => (
                <article key={`${index}-${activity}`} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="pt-1 text-sm leading-6 text-slate-700">{activity}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
              School activities will appear here after they are added to the published school information.
            </p>
          )}
        </section>

        <section id="achievements" className="bg-brand-950">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
            <SectionHeading
              eyebrow="Achievements"
              title="Recognising progress"
              description="Only achievements and awards published by the school are shown."
              light
            />
            {achievements.length || awards.length ? (
              <div className="grid gap-5 md:grid-cols-2">
                {achievements.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <h3 className="flex items-center gap-2 font-semibold text-white"><Trophy className="h-5 w-5 text-amber-300" /> Achievements</h3>
                    <ul className="mt-4 space-y-3">
                      {achievements.map((item, index) => <li key={index} className="flex gap-3 text-sm leading-6 text-slate-200"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />{item}</li>)}
                    </ul>
                  </div>
                )}
                {awards.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <h3 className="flex items-center gap-2 font-semibold text-white"><Trophy className="h-5 w-5 text-amber-300" /> Awards and recognition</h3>
                    <ul className="mt-4 space-y-3">
                      {awards.map((item, index) => <li key={index} className="flex gap-3 text-sm leading-6 text-slate-200"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
                Achievements and awards will be displayed here when verified information is published.
              </p>
            )}
          </div>
        </section>

        <section id="gallery" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <SectionHeading
            eyebrow="Photo gallery"
            title="Moments from school life"
            description="Browse photographs selected and published by the school."
          />
          {gallery.length ? (
            <>
              {categories.length > 2 && (
                <div className="mb-6 flex flex-wrap gap-2" aria-label="Filter gallery by category">
                  {categories.map((item) => (
                    <button
                      type="button"
                      key={item}
                      onClick={() => setCategory(item)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${category === item ? 'bg-brand-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                      aria-pressed={category === item}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleGallery.map((image) => (
                  <button
                    type="button"
                    key={image.id}
                    onClick={() => setSelectedImage(image)}
                    className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm"
                    aria-label={`Preview ${image.caption || image.title}`}
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden bg-slate-100">
                      <img
                        src={publicSchoolImageUrl(image.imageUrl)}
                        alt={image.caption || image.title}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                      <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-800">
                        <ImageIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </span>
                    <span className="block p-4">
                      <span className="block font-semibold text-slate-900">{image.title}</span>
                      {image.caption && <span className="mt-1 line-clamp-2 block text-sm text-slate-600">{image.caption}</span>}
                      {image.category && <span className="mt-3 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{image.category}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <ImageIcon className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-3 font-medium text-slate-800">No public photographs yet</p>
              <p className="mt-1 text-sm text-slate-500">Published images from School Details will appear in this gallery.</p>
            </div>
          )}
        </section>

        <section className="bg-slate-50">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
            <div>
              <SectionHeading
                eyebrow="Why choose our school?"
                title="Education with a wider purpose"
                description="The school’s stated focus brings together academic learning, moral values, sports and creativity."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Academics', 'Supporting learning and knowledge.'],
                  ['Moral values', 'Making character part of education.'],
                  ['Sports', 'Including sport in school life.'],
                  ['Creativity', 'Making room for creative expression.'],
                ].map(([title, text]) => (
                  <article key={title} className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="font-semibold text-slate-900">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
                  </article>
                ))}
              </div>
            </div>
            <div id="news" className="scroll-mt-24">
              <SectionHeading
                eyebrow="Latest news"
                title="Public announcements"
                description="Only notices explicitly marked for the public website are shown."
              />
              {notices.length ? (
                <div className="space-y-3">
                  {notices.map((notice) => (
                    <article key={notice.id} className="rounded-xl border border-slate-200 bg-white p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                        {new Date(notice.publishDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                      <h3 className="mt-2 font-semibold text-slate-900">{notice.title}</h3>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{notice.description}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                  There are no public announcements at this time.
                </p>
              )}
            </div>
          </div>
        </section>

        <section id="contact" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-10 rounded-3xl bg-brand-950 p-7 text-white sm:p-10 lg:grid-cols-[1fr_0.8fr] lg:p-14">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Contact and location</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Get in touch with the school</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                Official contact information is shown below when it has been provided and published by the school.
              </p>
              <a href={SCHOOL.website} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-amber-300 hover:text-amber-200">
                Visit school website <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <div className="space-y-3">
              {contact.map(({ icon: Icon, label, value, href }) => (
                <div key={label} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-medium text-slate-400">{label}</p>
                    {href ? <a href={href} className="mt-1 block break-words text-sm text-white hover:underline">{value}</a> : <p className="mt-1 text-sm text-white">{value}</p>}
                  </div>
                </div>
              ))}
              {!contact.length && (
                <p className="rounded-xl border border-dashed border-white/20 p-5 text-sm leading-6 text-slate-300">
                  Address, phone number and email have not been published.
                </p>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr] lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <SchoolLogo imageUrl={details.logoUrl} compact />
              <div>
                <p className="font-semibold text-slate-900">{schoolName}</p>
                <p lang="bn" className="text-xs text-slate-500">{bengaliName}</p>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">{SCHOOL.description}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Quick links</h2>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {NAV_ITEMS.map(([label, id]) => <a key={id} href={`#${id}`} className="text-sm text-slate-600 hover:text-brand-800">{label}</a>)}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">School portal</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Students, parents, teachers and administrators can sign in to their existing portal.</p>
            <Link to="/login" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-800 hover:text-brand-950">
              Login to portal <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="border-t border-slate-100">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p>© {new Date().getFullYear()} {schoolName}. All rights reserved.</p>
            <a href="#home" className="inline-flex items-center gap-1 hover:text-slate-900">Back to top <ArrowDown className="h-3 w-3 rotate-180" aria-hidden="true" /></a>
          </div>
        </div>
      </footer>

      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo preview: ${selectedImage.caption || selectedImage.title}`}
          onClick={() => setSelectedImage(null)}
        >
          <button type="button" onClick={() => setSelectedImage(null)} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close photo preview">
            <X className="h-6 w-6" />
          </button>
          <figure className="max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <img src={publicSchoolImageUrl(selectedImage.imageUrl)} alt={selectedImage.caption || selectedImage.title} className="max-h-[78vh] max-w-full rounded-xl object-contain" />
            <figcaption className="mt-3 text-center text-sm text-white">
              {selectedImage.caption || selectedImage.title}
              {selectedImage.albumTitle && <span className="ml-2 text-slate-300">· {selectedImage.albumTitle}</span>}
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
