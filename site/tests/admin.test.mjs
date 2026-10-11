import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeCatalog,isDate} from '../admin/catalog.mjs';
import {adminConfig} from '../admin/schema.mjs';
import {isOfficialStreamingUrl} from '../src/streaming.mjs';
const catalog=JSON.parse(await readFile(new URL('./fixtures/catalog-2026-10-11.json',import.meta.url)));
const artists=JSON.parse(await readFile(new URL('../data/artists.json',import.meta.url))).artists;
const normalize=input=>normalizeCatalog(input,isOfficialStreamingUrl);
const nextRelease=()=>({title:'New single',artists:['Levo.mp3'],releaseDate:'2026-12-01',artwork:'assets/releases/new-single.jpg'});
test('save preserves old release identity, links, credits and tracks',()=>{
 const result=normalize(catalog);assert.equal(result.releases.length,16);assert.equal(result.featuredReleaseId,'PVKH-014');
 for(let i=0;i<16;i++){const before=catalog.releases[i],after=result.releases[i];for(const key of ['id','slug','artists','artistCredit','title','streamingLinks','tracks','content','editorial'])assert.deepEqual(after[key],before[key],`${before.id} ${key}`);}
});
test('a new single receives safe complete metadata and never replaces the premiere',()=>{const input=structuredClone(catalog);input.releases.push(nextRelease());const result=normalize(input);const release=result.releases.at(-1);assert.equal(release.id,'PVKH-017');assert.equal(release.status,'upcoming');assert.equal(release.trackCount,1);assert.equal(release.streamingLinks,null);assert.equal(release.primaryGenre,null);assert.equal(release.tuneCoreId,null);assert.equal(result.featuredReleaseId,'PVKH-014');for(const locale of ['en','it','ru'])assert(release.content[locale].short.includes('New single'));});
test('malformed dates, unsafe artwork and invalid external links fail before saving',()=>{
 assert.equal(isDate('2026-02-30'),false);
 for(const patch of [{releaseDate:'2026-02-30'},{artwork:'assets/releases/../../secret.jpg'},{streamingLinks:[{service:'spotify',url:'https://spotify.com.evil.test/x'}]}]){const input=structuredClone(catalog);input.releases.push({...nextRelease(),...patch});assert.throws(()=>normalize(input));}
});
test('changing the date cannot silently publish incomplete announcements',()=>{const input=structuredClone(catalog);input.asOf='2026-10-17';assert.throws(()=>normalize(input),/Out the box/);});
test('reordering, duplicate destinations and missing premiere are rejected',()=>{const input=structuredClone(catalog);input.releases.reverse();assert.throws(()=>normalize(input),/Порядок/);input.releases.reverse();input.releases[13].streamingLinks.push(input.releases[13].streamingLinks[0]);assert.throws(()=>normalize(input),/один раз/);input.releases[13].streamingLinks.pop();input.featuredReleaseId='PVKH-999';assert.throws(()=>normalize(input),/премьерный/);});
test('public administration uses GitHub drafts; local backend is explicit and constrained',()=>{const production=adminConfig({releases:catalog.releases,artists,origin:'https://label.test'});assert.equal(production.backend.name,'github');assert.equal(production.publish_mode,'editorial_workflow');assert.equal(production.backend.repo,'AlessandroPovkh/POVKH-LAB');const list=production.collections[0].files[0].fields.find(f=>f.name==='releases');assert.equal(list.allow_remove,false);assert.equal(list.allow_reorder,false);assert.equal(adminConfig({releases:catalog.releases,artists,origin:'http://127.0.0.1:4178',local:true}).backend.proxy_url,'/api/cms');});
test('preorder relationships, unique IDs and editorial tags are rejected before publication',()=>{
 const invalid=[{preorderUrl:'https://band.link/example'},{preorderDate:'2026-02-30'},{preorderDate:'2026-12-01'},{preorderDate:'2026-11-01',preorderUrl:'https://band.link/example'},{preorderDate:'2026-10-01',preorderUrl:'http://band.link/example'},{tuneCoreId:catalog.releases[0].tuneCoreId},{editorialTags:['House','house']},{primaryGenre:'House',editorialTags:['house']},{editorialTags:['']},{releaseType:'album'},{titleLanguage:'unknown'}];
 for(const patch of invalid){const input=structuredClone(catalog);input.releases.push({...nextRelease(),...patch});assert.throws(()=>normalize(input),JSON.stringify(patch));}
 const input=structuredClone(catalog);input.releases[0].preorderDate='2025-01-01';assert.throws(()=>normalize(input),/предзаказ/);
 const valid=structuredClone(catalog);valid.releases.push({...nextRelease(),preorderDate:'2026-10-01',preorderUrl:'https://band.link/example'});assert.equal(normalize(valid).releases.at(-1).preorderUrl,'https://band.link/example');
});

test('GitHub Pages administration links retain the project subpath',()=>{const config=adminConfig({releases:catalog.releases,artists,origin:'https://alessandropovkh.github.io',basePath:'/POVKH-LAB'});assert.equal(config.site_url,'https://alessandropovkh.github.io/POVKH-LAB/');assert.equal(config.display_url,'https://alessandropovkh.github.io/POVKH-LAB/ru/');assert.equal(config.backend.auth_endpoint,'POVKH-LAB/admin/auth');});
