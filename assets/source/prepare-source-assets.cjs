const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = __dirname;
const runtime = path.join(root, 'runtime');
fs.mkdirSync(runtime, {recursive: true});
const groups = [
  {id:'weapons',dir:'blaster/Models/GLB format',names:['blaster-a','blaster-b','blaster-c','blaster-d','blaster-e','blaster-f','blaster-g','blaster-h','blaster-i','blaster-j','blaster-k','blaster-l','blaster-m','blaster-n','blaster-o','blaster-p','blaster-q','blaster-r','crate-medium','crate-wide','grenade-a','grenade-b','scope-small','scope-large-a','silencer-small'],source:'https://kenney.nl/assets/blaster-kit',creator:'Kenney',licenseFile:'blaster/License.txt'},
  {id:'industrial',dir:'industrial/Models/GLB format',names:['building-a','building-b','building-c','building-d','building-e','building-f','building-g','building-h','building-i','building-j','building-k','building-l','building-m','building-n','building-o','building-p','building-q','building-r','building-s','building-t','chimney-basic','chimney-large','detail-tank','detail-tank-large','shipping-container-a','shipping-container-b','shipping-container-c','water-tower','windmill','solar-panel-landscape-group'],source:'https://kenney.nl/assets/city-kit-industrial',creator:'Kenney',licenseFile:'industrial/License.txt'},
  {id:'nature',dir:'nature/Models/GLTF format',names:['tree_pineTallA_detailed','tree_pineTallB_detailed','tree_pineDefaultA','tree_pineRoundC','rock_largeA','rock_largeB','rock_largeC','rock_tallA','rock_tallB','cliff_large_rock','cliff_cornerLarge_rock','bridge_wood','bridge_stone'],source:'https://kenney.nl/assets/nature-kit',creator:'Kenney',licenseFile:'nature/License.txt'},
  {id:'operator',dir:'.',names:['swat'],source:'https://poly.pizza/m/Btfn3G5Xv4',creator:'Quaternius'},
];
for(const [name,id] of [['assault-rifle','Bgvuu4CUMV'],['battle-rifle','K2lXTYFSLC'],['sniper-rifle','ASOMZIErq3'],['marksman-rifle','TKaBjAEofL'],['shotgun','TyWl27dUz6'],['smg','sRkpgScNzi'],['pistol','J3i9KDQ3kt'],['bullpup','iKAlIbHUFD'],['pump-shotgun','ZmPTnh7njL'],['submachine-gun','7ehatxr7FY']]) groups.push({id:'firearms',dir:'quaternius-guns',names:[name],source:'https://poly.pizza/m/'+id,creator:'Quaternius'});
const report=[];
for (const group of groups) {
  const outdir=path.join(runtime,group.id);
  fs.mkdirSync(outdir,{recursive:true});
  for (const name of group.names) {
    const input=path.join(root,group.dir,name+'.glb');
    const raw=fs.readFileSync(input);
    assert.equal(raw.readUInt32LE(0),0x46546c67);
    assert.equal(raw.readUInt32LE(4),2);
    const jsonLen=raw.readUInt32LE(12);
    const json=JSON.parse(raw.toString('utf8',20,20+jsonLen));
    assert.equal(json.buffers.length,1);
    const binHeader=20+jsonLen;
    assert.equal(raw.readUInt32LE(binHeader+4),0x004e4942);
    let bin=raw.subarray(binHeader+8,binHeader+8+raw.readUInt32LE(binHeader));
    const changes=[];
    for (const img of json.images||[]) {
      if (!img.uri) continue;
      const png=fs.readFileSync(path.join(path.dirname(input),img.uri));
      const padded=Buffer.concat([png,Buffer.alloc((4-png.length%4)%4)]);
      img.bufferView=json.bufferViews.length;
      img.mimeType='image/png';
      delete img.uri;
      json.bufferViews.push({buffer:0,byteOffset:bin.length,byteLength:png.length});
      bin=Buffer.concat([bin,padded]);
      changes.push('Embedded source palette texture');
    }
    if (group.id==='nature'||group.id==='operator') {
      for (const material of json.materials||[]) {
        if(material.pbrMetallicRoughness){
          material.pbrMetallicRoughness.metallicFactor=0;
          material.pbrMetallicRoughness.roughnessFactor=0.9;
        }
      }
      changes.push('Changed nonmetal surfaces to metallic=0, roughness=0.9');
    }
    json.buffers[0].byteLength=bin.length;
    const str=Buffer.from(JSON.stringify(json));
    const jb=Buffer.concat([str,Buffer.alloc((4-str.length%4)%4,32)]);
    const header=Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);
    header.writeUInt32LE(28+jb.length+bin.length,8);
    header.writeUInt32LE(jb.length,12);header.writeUInt32LE(0x4e4f534a,16);
    const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
    const output=Buffer.concat([header,jb,bh,bin]);
    assert.equal(output.length,output.readUInt32LE(8));
    assert.ok((json.images||[]).every(image=>!image.uri));
    fs.writeFileSync(path.join(outdir,name+'.glb'),output);
    let triangles=0;
    for(const mesh of json.meshes||[])for(const p of mesh.primitives||[]){
      assert.equal(p.mode??4,4);
      triangles+=(p.indices!==undefined?json.accessors[p.indices].count:json.accessors[p.attributes.POSITION].count)/3;
    }
    const originalName=({swat:'SWAT','assault-rifle':'Assault Rifle','battle-rifle':'Assault Rifle','marksman-rifle':'Sniper Rifle','sniper-rifle':'Sniper Rifle','pistol':'Pistol','bullpup':'Bullpup','pump-shotgun':'Shotgun','shotgun':'Shotgun','smg':'Smg','submachine-gun':'Submachine Gun'})[name]||name;
    report.push({file:group.id+'/'+name+'.glb',name,originalName,source:group.source,creator:group.creator,license:'CC0-1.0',attributionRequired:false,bytes:output.length,triangles,animations:(json.animations||[]).map(a=>a.name),materials:json.materials?.map(m=>m.name),meshes:json.meshes?.length,changes,lod:'Single source LOD; renderer must instance and distance-cull',sha256:crypto.createHash('sha256').update(output).digest('hex')});
  }
}
for(const suffix of ['diff','nor_gl','rough']) {
  const name='ground-'+suffix+'.jpg';
  fs.copyFileSync(path.join(root,name),path.join(runtime,name));
  const data=fs.readFileSync(path.join(runtime,name));
  report.push({file:name,name:'Aerial Grass Rock '+suffix,source:'https://polyhaven.com/a/aerial_grass_rock',creator:'Rob Tuytel / Poly Haven',license:'CC0-1.0',attributionRequired:false,bytes:data.length,dimensions:[1024,1024],physicalWidthMetres:15,changes:['Downloaded official 1K JPEG'],sha256:crypto.createHash('sha256').update(data).digest('hex')});
}
fs.writeFileSync(path.join(root,'asset-report.json'),JSON.stringify(report,null,2));
const uses={weapons:'Supply crates, attachments, grenades and optional weapon variants',firearms:'First-person weapons, operator weapon display and physical loot',industrial:'Freight yard, refinery, port and distant industrial skyline',nature:'Coastal hills, forest and rock cover',operator:'Animated bots, remote players and main menu operator'};
const lines=['# CINDERLINE external asset licenses','', 'All assets listed below are downloaded local files, not production hotlinks. License checked 2026-09-06. All use CC0 1.0; attribution is not required. Voluntary in-game credit: Kenney, Quaternius, Rob Tuytel / Poly Haven.','', '## License evidence','', '- Kenney explicitly allows commercial use and redistribution with no required attribution: https://kenney.nl/support. Pack pages also list CC0; source License.txt files are retained separately.','- Quaternius models were downloaded from the author-uploaded Poly Pizza pages linked per file, each explicitly marked Public Domain (CC0). Author pack page: https://quaternius.com/packs/ultimatedanimatedcharacter.html.','- Poly Haven expressly allows commercial use, modification and redistribution without attribution: https://polyhaven.com/license.','- License deed: https://creativecommons.org/publicdomain/zero/1.0/.','', '## Files','', '| Runtime file | Original asset | Creator | Original source | License | Attribution required | Modifications | Intended use |','|---|---|---|---|---|---|---|---|'];
for(const a of report) lines.push('| '+[a.file,a.originalName||a.name,a.creator,a.source,a.license,'No',(a.changes||[]).join('; ')||'No changes',(uses[a.file.split('/')[0]]||'Repeated terrain surface: diffuse, OpenGL normal, roughness')].join(' | ')+' |');
lines.push('','## Source/runtime separation','','Source ZIPs, original GLBs and source license files are retained outside runtime. Runtime GLBs embed source texture palettes, so they are self-contained. The operator keeps all 24 animation clips. The source names identify assets in this document; fictional game weapon/operator names are separate.','', '## Scope limits','','These are intentionally low polygon source models. Buildings are primarily exterior models; enterable hero-building interiors must be implemented separately. Models have one source LOD and require runtime instancing/distance culling. No downloaded copyrighted game assets, brands, sounds, music, logos or UI are included.');
fs.writeFileSync(path.join(root,'ASSET_LICENSES.md'),lines.join('\n'));
console.log(JSON.stringify({files:report.length,totalBytes:report.reduce((s,a)=>s+a.bytes,0),triangles:report.reduce((s,a)=>s+(a.triangles||0),0),animated:report.filter(a=>a.animations?.length).map(a=>({file:a.file,animations:a.animations.length}))},null,2));
