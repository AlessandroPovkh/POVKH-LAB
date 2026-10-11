const services = ['appleMusic', 'spotify', 'youtubeMusic', 'amazonMusic', 'yandexMusic', 'vkMusic', 'kionMusic'];
export const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const text = value => typeof value === 'string' ? value.trim() : '';
const optional = value => text(value) || null;
export function normalizeCatalog(input, validateLink) {
  const catalog = structuredClone(input);
  if (!isDate(catalog.asOf)) throw new Error('Укажите корректную дату обновления каталога.');
  if (!Array.isArray(catalog.releases) || !catalog.releases.length) throw new Error('Каталог не может быть пустым.');
  const tuneCoreIds = new Set();
  catalog.releases = catalog.releases.map((item, index) => {
    const id = `PVKH-${String(index + 1).padStart(3, '0')}`;
    if (item.id && item.id !== id) throw new Error('Порядок существующих релизов менять нельзя.');
    const title = text(item.title);
    if (!title) throw new Error(`${id}: укажите название.`);
    if (!Array.isArray(item.artists) || !item.artists.length || item.artists.some(a => !text(a))) throw new Error(`${title}: выберите артиста.`);
    if (!isDate(item.releaseDate)) throw new Error(`${title}: укажите корректную дату релиза.`);
    const status = item.releaseDate > catalog.asOf ? 'upcoming' : 'published';
    const artwork = text(item.artwork).replace(/^\//, '');
    if (!/^assets\/releases\/[a-z0-9][a-z0-9._-]*\.(webp|jpe?g|png)$/i.test(artwork)) throw new Error(`${title}: загрузите JPG, PNG или WebP с латинским именем файла.`);
    const streamingLinks = (item.streamingLinks || []).filter(link => text(link.url)).map(link => ({ service: link.service, url: text(link.url) }));
    if (streamingLinks.some(link => !services.includes(link.service) || !validateLink(link.service, link.url))) throw new Error(`${title}: проверьте прямые ссылки на музыкальные платформы.`);
    if (new Set(streamingLinks.map(link => link.service)).size !== streamingLinks.length) throw new Error(`${title}: каждая платформа должна встречаться один раз.`);
    streamingLinks.sort((a, b) => services.indexOf(a.service) - services.indexOf(b.service));
    if (status === 'upcoming' && streamingLinks.length) throw new Error(`${title}: ссылки прослушивания добавляются после выхода. Для анонса используйте предзаказ.`);
    const primaryGenre = optional(item.primaryGenre);
    if (status === 'published' && (!streamingLinks.length || !primaryGenre)) throw new Error(`${title}: для вышедшего релиза нужны жанр и хотя бы одна проверенная ссылка. Дата каталога: ${catalog.asOf}.`);
    const releaseType = item.releaseType || 'single';
    if (!['single','mixtape'].includes(releaseType) || !['en','ru'].includes(item.titleLanguage || 'en')) throw new Error(`${title}: проверьте формат и язык названия.`);
    const tracks = releaseType === 'single'
      ? [{ ...(item.tracks?.[0] || {}), position: 1, title, duration: optional(item.tracks?.[0]?.duration) }]
      : (item.tracks || []).map((track, i) => ({ ...track, position: i + 1, title: text(track.title), duration: optional(track.duration) }));
    if (!tracks.length || (releaseType === 'mixtape' && tracks.length < 2) || tracks.some(track => !track.title || (track.duration !== null && !/^\d+:[0-5]\d$/.test(track.duration)))) throw new Error(`${title}: проверьте трек-лист и длительности М:СС.`);
    const tuneCoreId = optional(item.tuneCoreId);
    if (tuneCoreId && !/^\d+$/.test(tuneCoreId)) throw new Error(`${title}: TuneCore ID должен содержать только цифры.`);
    if (tuneCoreId && tuneCoreIds.has(tuneCoreId)) throw new Error(`${title}: TuneCore ID уже используется другим релизом.`);
    if (tuneCoreId) tuneCoreIds.add(tuneCoreId);
    const editorialTags = item.editorialTags || [];
    if (!Array.isArray(editorialTags) || editorialTags.some(tag => !text(tag))) throw new Error(`${title}: удалите пустые теги.`);
    const normalizedTags = editorialTags.map(tag => text(tag).toLocaleLowerCase('en'));
    if (new Set(normalizedTags).size !== normalizedTags.length || (primaryGenre && normalizedTags.includes(primaryGenre.toLocaleLowerCase('en')))) throw new Error(`${title}: теги не должны повторяться или дублировать жанр.`);
    const preorderDate = optional(item.preorderDate), preorderUrl = optional(item.preorderUrl);
    if (status === 'published' && (preorderDate || preorderUrl)) throw new Error(`${title}: удалите предзаказ у вышедшего релиза.`);
    if (preorderDate && (!isDate(preorderDate) || preorderDate >= item.releaseDate)) throw new Error(`${title}: предзаказ должен начинаться до выхода релиза.`);
    if (preorderUrl) {
      let parsed; try { parsed = new URL(preorderUrl); } catch { throw new Error(`${title}: некорректная ссылка предзаказа.`); }
      if (!preorderDate || preorderDate > catalog.asOf || parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw new Error(`${title}: ссылка предзаказа должна использовать HTTPS; дата начала обязательна и не позже даты каталога.`);
    }
    if (id === 'PVKH-014' && (releaseType !== 'mixtape' || tracks.length !== 11)) throw new Error('Two Faces должен сохранить 11 треков микстейпа.');
    const content = { ...item.content };
    const facts = {
      en: `${title} — ${item.artists.join(' & ')}. ${status === 'published' ? 'Released' : 'Release date'}: ${item.releaseDate}.`,
      it: `${title} — ${item.artists.join(' & ')}. ${status === 'published' ? 'Pubblicato' : 'Data di uscita'}: ${item.releaseDate}.`,
      ru: `${title} — ${item.artists.join(' & ')}. ${status === 'published' ? 'Вышел' : 'Дата выхода'}: ${item.releaseDate}.`
    };
    for (const locale of ['en', 'it', 'ru']) content[locale] = { ...content[locale], short: text(content[locale]?.short) || facts[locale], story: text(content[locale]?.story) || facts[locale], mood: optional(content[locale]?.mood), audience: optional(content[locale]?.audience) };
    const editorial = { contentBasis: 'artist_supplied_release_facts', genreBasis: primaryGenre ? 'owner_verified_platform' : 'not_supplied', reviewRequired: true, ...item.editorial };
    if (!editorial.reviewRequired && Object.values(content).some(copy => !copy.mood || !copy.audience)) throw new Error(`${title}: заполните все описания перед снятием редакционной проверки.`);
    return { ...item, id, slug: id.toLowerCase(), public: true, title, artists: item.artists.map(text), artistCredit: item.artists.map(text).join(' & '), titleLanguage: item.titleLanguage || 'en', status, releaseType, releaseDate: item.releaseDate, artwork, formats: ['digital'], tuneCoreId, tuneCoreIdNeedsOwnerVerification: tuneCoreId === null || Boolean(item.tuneCoreIdNeedsOwnerVerification), primaryGenre, editorialTags: editorialTags.map(text), streamingLinks: streamingLinks.length ? streamingLinks : null, preorderDate, preorderUrl, tracks, trackCount: tracks.length, content, editorial };
  });
  if (!catalog.releases.some(r => r.id === catalog.featuredReleaseId)) throw new Error('Выберите премьерный релиз из каталога.');
  return catalog;
}
