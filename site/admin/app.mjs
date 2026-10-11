import { adminConfig } from './schema.mjs';
import { normalizeCatalog } from './catalog.mjs';
import { isOfficialStreamingUrl } from './streaming.mjs';
const status = document.getElementById('admin-status');
try {
 const response = await fetch('./settings.json', {cache:'no-store'});
 if (!response.ok) throw new Error('Не удалось загрузить настройки редактора.');
 const settings = await response.json();
 const local = settings.local === true && ['127.0.0.1','localhost'].includes(location.hostname);
 if (settings.local && !local) throw new Error('Локальный режим доступен только на этом компьютере.');
 const config = adminConfig({...settings,origin:location.origin,local});
 delete config.logo_url;
 CMS.registerEventListener({ name:'preSave', handler:({entry})=>{
   if (entry.get('collection') !== 'catalog') return entry.get('data');
   const data=normalizeCatalog(entry.get('data').toJS(),isOfficialStreamingUrl);
   return entry.get('data').clear().mergeDeep(data);
 }});
 const React={createElement:window.h};
 CMS.registerPreviewTemplate('catalog', window.createClass({
  render() {
   const catalog=this.props.entry.get('data').toJS();
   return React.createElement('div',{style:{fontFamily:'system-ui',padding:24}},React.createElement('h1',null,'Каталог POVKH LAB'),React.createElement('p',null,`Премьерный релиз: ${catalog.featuredReleaseId || 'не выбран'}`),...(catalog.releases||[]).map((r,i)=>React.createElement('article',{key:r.id||i,style:{borderBottom:'1px solid #ccc',padding:'16px 0'}},r.artwork ? React.createElement('img',{src:String(this.props.getAsset(r.artwork)),alt:'Обложка',style:{width:120,height:120,objectFit:'cover'}}) : null,React.createElement('h2',null,r.title||'Новый релиз'),React.createElement('p',null,(r.artists||[]).join(' & ')),React.createElement('p',null,`${r.releaseDate||'Укажите дату'} · ${r.releaseDate>catalog.asOf?'Анонс':'Вышел'}`))));
  }
 }));
 await CMS.init({config});
 status.textContent=local?'Локальная версия: изменения сохраняются в отдельную копию. Публикации в интернет нет.':'';
} catch(error) { status.textContent=`Редактор не запущен: ${error.message}`;console.error(error); }
