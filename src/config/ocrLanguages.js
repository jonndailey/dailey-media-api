export const OCR_LANGUAGE_METADATA = [
  { code: 'eng', name: 'English', nativeName: 'English' },
  { code: 'spa', name: 'Spanish', nativeName: 'Espanol' },
  { code: 'fra', name: 'French', nativeName: 'Francais' },
  { code: 'deu', name: 'German', nativeName: 'Deutsch' },
  { code: 'ita', name: 'Italian', nativeName: 'Italiano' },
  { code: 'por', name: 'Portuguese', nativeName: 'Portugues' },
  { code: 'nld', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pol', name: 'Polish', nativeName: 'Polski' },
  { code: 'swe', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'fin', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'tur', name: 'Turkish', nativeName: 'Turkce' },
  { code: 'jpn', name: 'Japanese', nativeName: 'Nihongo' },
  { code: 'chi_sim', name: 'Chinese (Simplified)', nativeName: 'Jiantizhongwen' }
];

export function getLanguageMetadataByCode(code) {
  return OCR_LANGUAGE_METADATA.find(language => language.code === code) || null;
}

export default OCR_LANGUAGE_METADATA;
