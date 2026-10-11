const hidden = name => ({ name, widget: 'hidden', required: false });
const field = (name, label, options = {}) => ({ name, label, widget: 'string', ...options });
const date = (name, label, required = true) => field(name, label, { widget: 'datetime', format: 'YYYY-MM-DD', date_format: 'DD.MM.YYYY', time_format: false, picker_utc: true, required });
const copyFields = ['ru', 'en', 'it'].map(locale => ({ name: locale, label: {ru:'Русский',en:'English',it:'Italiano'}[locale], widget:'object', collapsed:true, required:false, fields:[field('short','Краткое описание',{widget:'text',required:false}),field('story','О релизе',{widget:'text',required:false}),field('mood','Настроение',{required:false}),field('audience','Для кого',{required:false})] }));
export function adminConfig({ releases, artists, origin, basePath = '', local = false }) {
 const backend = local ? {name:'proxy',proxy_url:'/api/cms',branch:'local'} : {name:'github',repo:'AlessandroPovkh/POVKH-LAB',branch:'main',base_url:origin,auth_endpoint:`${basePath}/admin/auth`.replace(/^\//,'')};
 return {
  backend, publish_mode:local?'simple':'editorial_workflow', locale:'ru', site_url:local?'http://127.0.0.1:4177/ru/':`${origin}${basePath}/`, display_url:local?'http://127.0.0.1:4177/ru/':`${origin}${basePath}/ru/`,
  load_config_file:false, media_folder:'site/assets/releases',public_folder:'assets/releases',slug:{encoding:'ascii',clean_accents:true,sanitize_replacement:'-'},
  collections:[{name:'catalog',label:'Релизы',label_singular:'Каталог релизов',delete:false,editor:{preview:true},files:[{name:'catalog',label:'Каталог и премьерный релиз',file:'site/data/catalog.json',format:'json',fields:[
   hidden('schemaVersion'),hidden('notice'),hidden('label'),
   date('asOf','Дата обновления каталога'),
   field('featuredReleaseId','Премьерный релиз',{widget:'select',options:releases.map(r=>({label:`${r.id} — ${r.title}`,value:r.id})),hint:'Остаётся на главной независимо от новых анонсов. Новый релиз появится в выборе после сохранения и обновления админки.'}),
   {name:'releases',label:'Все релизы',label_singular:'релиз',widget:'list',collapsed:true,allow_remove:false,allow_reorder:false,summary:'{{fields.id}} · {{fields.title}} · {{fields.releaseDate}}',fields:[
    ...['id','slug','public','status','artistCredit','formats','trackCount','tuneCoreIdNeedsOwnerVerification'].map(hidden),
    field('title','Название'),field('artists','Артисты',{widget:'select',multiple:true,options:artists.map(a=>a.name)}),
    date('releaseDate','Дата выхода'),field('artwork','Обложка',{widget:'image',choose_url:false,media_library:{config:{multiple:false}},hint:'JPG, PNG или WebP. Имя файла — латиницей; изображение будет оптимизировано при сборке.'}),
    field('releaseType','Формат релиза',{widget:'select',default:'single',required:false,options:[{label:'Сингл',value:'single'},{label:'Микстейп',value:'mixtape'}]}),
    field('titleLanguage','Язык названия',{widget:'select',default:'en',options:[{label:'Английский',value:'en'},{label:'Русский',value:'ru'}]}),
    field('primaryGenre','Жанр на платформе',{required:false,hint:'Для анонса можно оставить пустым. Для вышедшего релиза укажите подтверждённый жанр.'}),
    {name:'streamingLinks',label:'Ссылки прослушивания',widget:'list',required:false,default:[],collapsed:true,summary:'{{fields.service}}',fields:[field('service','Платформа',{widget:'select',options:[{label:'Apple Music',value:'appleMusic'},{label:'Spotify',value:'spotify'},{label:'YouTube Music',value:'youtubeMusic'},{label:'Amazon Music',value:'amazonMusic'},{label:'Яндекс Музыка',value:'yandexMusic'},{label:'VK Музыка',value:'vkMusic'},{label:'КИОН Музыка',value:'kionMusic'}]}),field('url','Прямая ссылка')]},
    {name:'tracks',label:'Трек-лист',widget:'list',required:false,default:[],collapsed:true,summary:'{{fields.title}}',fields:[hidden('position'),field('title','Название трека',{required:false}),field('duration','Длительность М:СС',{required:false})]},
    {name:'content',label:'Описания',widget:'object',collapsed:true,required:false,fields:copyFields},
    {name:'editorial',label:'Редакционная проверка',widget:'object',collapsed:true,required:false,fields:[hidden('contentBasis'),hidden('genreBasis'),field('reviewRequired','Скрывать описания до подтверждения',{widget:'boolean',default:true,required:false})]},
    field('editorialTags','Теги',{widget:'list',required:false,default:[]}),
    date('preorderDate','Дата начала предзаказа',false),field('preorderUrl','Ссылка предзаказа',{required:false}),field('tuneCoreId','Внутренний TuneCore ID',{required:false})
   ]}
  ]}]}]
 };
}
