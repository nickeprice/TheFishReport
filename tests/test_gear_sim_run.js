#!/usr/bin/env node
// Gear-sim simulation runner — node tests/test_gear_sim_run.js [--brief]
// Custom rig: node tests/test_gear_sim_run.js --custom '{"weightOz":1}'

const fs=require("fs"),path=require("path"),ROOT=path.resolve(__dirname,"..");
const BRIEF=process.argv.includes("--brief");
const CUSTOM=(()=>{const i=process.argv.indexOf("--custom");if(i>=0&&i+1<process.argv.length){try{return JSON.parse(process.argv[i+1])}catch(e){return{}}}return{}})();
const SO=["src/shared/debug.js","src/shared/ui.js","src/shared/nav.js","src/shared/format.js","src/shared/api.js","src/shared/forms.js","src/shared/idb.js","src/shared/gear-options.js","src/shared/tackle.js","src/data/tackle.json","src/features/gear-sim/inputs.js","src/features/gear-sim/continuity.js","src/features/gear-sim/physics.js","src/features/gear-sim/hydro.js","src/features/gear-sim/riverbed.js","src/features/gear-sim/chain.js","src/features/gear-sim/salmon.js","src/features/gear-sim/interception.js","src/features/gear-sim/sonar.js","src/features/gear-sim/zone-env.js","src/features/gear-sim/zone-core.js","src/features/gear-sim/zone-best.js","src/features/gear-sim/rig.js","src/features/gear-sim/techniques/drift.js","src/features/gear-sim/registry.js","src/features/gear-sim/solver.js","src/features/gear-sim/water-types.js","src/features/gear-sim/sim.js"];
const TI=[{"id":"pp-30-braid","type":"line","material":"braid","brand":"PowerPro","lb_test":30,"diameter_mm":0.38,"density_g_cm3":1},{"id":"maxima-12-mono","type":"line","material":"mono","brand":"Maxima","lb_test":12,"diameter_mm":0.33,"density_g_cm3":1.15},{"id":"generic-15-mono","type":"line","material":"mono","brand":"","lb_test":15,"diameter_mm":0.35,"density_g_cm3":1.15},{"id":"hook-gam-oct-2","type":"hook","size":"2","mass_g":0.145,"buoyancy_g":0.019,"area_cm2":0.2916,"cd":1.05},{"id":"corky-12","type":"foam","size":12,"mass_g":0.01,"buoyancy_g":0.262,"area_cm2":0.495,"cd":0.47},{"id":"bead-4","type":"bead","size_mm":4,"mass_g":0.1,"buoyancy_g":0.01,"netSinkG":0.09,"area_cm2":0.2,"cd":0.5},{"id":"bead-6","type":"bead","size_mm":6,"mass_g":0.15,"buoyancy_g":0.02,"netSinkG":0.13,"area_cm2":0.35,"cd":0.5},{"id":"bead-8","type":"bead","size_mm":8,"mass_g":0.25,"buoyancy_g":0.03,"netSinkG":0.22,"area_cm2":0.55,"cd":0.5},{"id":"lead-cannonball-0.5","type":"weight","shape":"Lead Cannonball","oz":0.5,"mass_g":14.175,"area_cm2":1.8,"cd":0.47,"density_g_cm3":11.34},{"id":"lead-cannonball-0.75","type":"weight","shape":"Lead Cannonball","oz":0.75,"mass_g":21.26,"area_cm2":2.4,"cd":0.47,"density_g_cm3":11.34},{"id":"slinky-0.5","type":"weight","shape":"Slinky","oz":0.5,"mass_g":14.175,"area_cm2":3.5,"cd":0.8,"density_g_cm3":4.5}];

let _dbg=0;
function elStub(ov){
  const d={"ml-mat":"braid","ml-brand":"PowerPro","ml-lb":"30","ml-line":"pp-30-braid","ld-mat":"mono","ld-brand":"Maxima","ld-lb":"12","ld-line":"maxima-12-mono","ld-len":"8","weight-shape":"Lead Cannonball","weight-setup":"sliding","weight":"0.5","hook":"gam-oct-2","yarn":"1","foam":"12","foam2":"0","foam3":"6","species":"Chinook","water-type":"run"};
  const v=Object.assign({},d);for(const[k,w]of Object.entries(ov)){if(w!=null)v[k]=String(w);}
  const E={},C={};
  function gid(id){
    if(!E[id])E[id]={_id:id,innerText:"",textContent:"",innerHTML:"",value:v[id]||"",style:{},children:[],parentNode:undefined,className:"",classList:{add(c){(C[id]=C[id]||new Set()).add(c);},remove(c){if(C[id])C[id].delete(c);},toggle(c,f){(C[id]=C[id]||new Set());f===undefined?(C[id].has(c)?C[id].delete(c):C[id].add(c)):(f?C[id].add(c):C[id].delete(c));},has(c){return!!(C[id]&&C[id].has(c));},get value(){const s=C[id]||new Set();return[...s].join(" ");}},setAttribute(){},appendChild(){},removeChild(){},addEventListener(){},focus(){},getAttribute(){return null;},removeAttribute(){}};
    return E[id];
  }
  return {dom:{getElementById:gid,querySelector(){return null;},querySelectorAll(s){return s===".tab-content"?["tab-water-report","tab-gear-sim","tab-catch-log"].map(id=>gid(id)):[];},createElement(){return gid("_dyn_"+Math.random());},body:{appendChild(){}}}};
}
function ti(t){return t?TI.filter(i=>i.type===t):TI;}
function tlbi(id){return TI.find(i=>i.id===id&&i.type==="line")||null;}
function tlbml(m,l){return TI.find(i=>i.type==="line"&&i.material===m&&i.lb_test===Number(l))||null;}
function thd(s){const r=TI.find(i=>i.type==="hook"&&i.size===Number(s));return r?{ac:r.area_cm2,cd:r.cd,mg:r.mass_g,bg:r.buoyancy_g}:{ac:0.28,cd:0.47,mg:0.15,bg:0.001};}
function tfbi(id){const r=TI.find(i=>i.id===id&&i.type==="foam");return r?{k:id,sz:r.size,bg:r.buoyancy_g,mg:r.mass_g,nbg:r.net_buoyancy_g,ac:r.area_cm2,cd:r.cd}:null;}
function tbd(m){const r=TI.find(i=>i.type==="bead"&&i.size_mm===Number(m));return r?{ac:r.area_cm2,cd:r.cd,nsg:r.netSinkG}:{ac:0.35,cd:0.5,nsg:0.13};}
function tybg(i){return(i&&i>0)?i*-0.012:0;}
function tydd(){return{ac:1.8,cd:0.8};}
function twr(s,o){return TI.find(i=>i.type==="weight"&&i.shape===s&&i.oz===Number(o))||null;}
function twps(s,o){
  if(!s||!o)return null;
  const r=twr(s,o);if(!r)return null;
  const m=Number(r.mass_g),d=r.density_g_cm3?Number(r.density_g_cm3):11.34;
  let sm=m;if(d>0){sm=m*(1-1/d);if(sm<0)sm=0;}
  return{ac:Number(r.area_cm2)||0,cd:Number(r.cd)||1.0,mg:m,smg:sm,d:d};
}
function tbs(){return TI.filter(i=>i.type==="bead").map(i=>({value:String(i.size_mm),label:i.size_mm+"mm"}));}

const{dom}=elStub(CUSTOM);
document=dom;window=global;location={search:""};navigator={geolocation:null,serviceWorker:null};
localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
CHANNEL_MEASUREMENTS={sites:{"12101500":{fit:{a:0.42,b:0.47},n:24}}};
RIVER_WIDTHS={"12101500":{width_ft:180}};
SPOT_WIDTHS={rivers:{puyallup:{points:[{lat:47.44,lon:-122.43,width_ft:210,dist_m:0}]}}};
CFS_TO_MS=0.3048;
for(const r of SO){const a=path.join(ROOT,r);if(!fs.existsSync(a)){console.log("Skip "+r);continue;}try{let s=fs.readFileSync(a,"utf8");if(r.endsWith(".json")){s="TACKLE="+s;}eval(s);}catch(e){console.log("ERR: "+r+" -> "+e.message);}}
const REQ=["lineDragPerFt","lineNetBuoyancyPerFt","pointDragGf","totalDragPerFt","computeLiftGf","presentationHeightInches","logLawVelocity","velocityProfile","uStarFromMax","ROUGHNESS_COBBLE","chainSolve","DRIFT_TECHNIQUE","gearTechnique","computeStrikeZone","hydraulicVelocity","parseFoam","WATER_TYPES","salmonPositionZ","interceptionProbability","tackleWeightPhysicsData","tackleHookData","tackleBeadData","tackleYarnBuoyancyG","tackleYarnDragData"];
const miss=REQ.filter(n=>eval("typeof "+n)==="undefined");
  if(miss.length){console.error("\nMissing "+miss.length+" symbols: "+miss.join(", "));process.exit(1);}
  console.log("OK. All "+REQ.length+" symbols loaded.\n");
  const rig={flow:Number(CUSTOM.flow||1040),weightOz:Number(CUSTOM.weightOz||0.5),weightShape:CUSTOM.weightShape||"Lead Cannonball",weightSetup:CUSTOM.weightSetup||"sliding",ldLen:Number(CUSTOM.ldLen||8),ldMat:CUSTOM.ldMat||"mono",ldLb:Number(CUSTOM.ldLb||12),ldDia:Number(CUSTOM.ldDia||0.33),mlMat:CUSTOM.mlMat||"braid",mlLb:Number(CUSTOM.mlLb||30),mlDia:Number(CUSTOM.mlDia||0.38),hook:Number(CUSTOM.hook||2),yarn:Number(CUSTOM.yarn||1),foam:parseFoam(CUSTOM.foam||"12"),foam2:parseFoam(CUSTOM.foam2||"0"),bdSz:Number(CUSTOM.bdSz||6),species:CUSTOM.species||"Chinook",waterType:CUSTOM.waterType||"run"};
  if(!BRIEF){console.log("");console.log("=== RUN ===");console.log("  Rig: "+rig.weightOz+"oz "+rig.weightShape+" "+rig.ldLen+"' "+rig.ldMat+" Flow: "+rig.flow+"cfs "+rig.species);}
  const vel=hydraulicVelocity(rig.flow,"12101500");
  if(!BRIEF)console.log("  Mean="+vel.mean.toFixed(4)+" bot="+vel.bottom.toFixed(4)+" src="+vel.source);
  if(typeof velocityAtSpot==="function"){const sv=velocityAtSpot(rig.flow,"12101500");if(sv&&sv.bottom>0&&!BRIEF)console.log("  Spot: m="+sv.mean.toFixed(4)+" b="+sv.bottom.toFixed(4));}
  const bv=vel.bottom;
  const hD=tackleHookData(rig.hook),hookG=hD?(hD.mass_g-hD.buoyancy_g):0,bD=tackleBeadData(rig.bdSz),bs=bD?bD.netSinkG:0,yG=tackleYarnBuoyancyG(rig.yarn);
  const lift=computeLiftGf(rig.foam.net_buoyancy_g,rig.foam2.net_buoyancy_g,hookG,bs,yG);
  if(!BRIEF)console.log("  Lift: "+lift.toFixed(3)+"gf");
  const wD=tackleWeightPhysicsData(rig.weightShape,rig.weightOz);
  const drag=totalDragPerFt(bv,rig.ldDia,rig.ldLen,wD?{areaCm2:wD.areaCm2,cd:wD.cd}:null,{areaCm2:rig.foam.areaCm2,cd:rig.foam.cd},{areaCm2:rig.foam2.areaCm2,cd:rig.foam2.cd},bD?{areaCm2:bD.areaCm2,cd:bD.cd}:null,hD?{areaCm2:hD.areaCm2,cd:hD.cd}:null,{areaCm2:1.8,cd:0.8});
  if(!BRIEF)console.log("  Drag: "+drag.toFixed(4)+" gf/ft");
  const fh=presentationHeightInches(lift,drag,rig.ld);
  if(!BRIEF)console.log("  Fallback: "+fh.toFixed(2)+"in");
  console.log("");console.log("-- FULL COMPUTE --");
  const out=DRIFT_TECHNIQUE.compute(rig,{flow:rig.flow,species:rig.species,dbArray:[],siteId:"12101500"});
  console.log("  Height="+out.hgt.toFixed(2)+"in Score="+out.score.toFixed(2)+"/5 Blown="+out.blownOut);
  if(out.chainResult){const c=out.chainResult;console.log("  Chain conv="+c.converged+" hD="+c.hookDepthM.toFixed(3)+"m iter="+(c.iterations||"?"));}
  if(out.interceptionProb!==undefined)console.log("  P(intercept)="+out.interceptionProb.toFixed(4));
  if(out.zone)console.log("  Zone: "+out.zone.min.toFixed(1)+"-"+out.zone.max.toFixed(1)+"in");
  if(out.whereToFish)console.log("  Where: "+out.whereToFish);
  console.log("");console.log("-- RAW --");
  const raw={rig:{flow:rig.flow,weightOz:rig.weightOz,weightShape:rig.weightShape,ldLen:rig.ldLen,ldMat:rig.ldMat,hook:rig.hook,foam:rig.foam.key,species:rig.species},vel:{m:out.velocity?.mean,b:out.velocity?.bottom,s:out.velocity?.source},lift:{gf:lift},drag:{gf_ft:drag},fhIn:fh,hgtIn:out.hgt,chain:{c:out.chainResult?.converged,hDm:out.chainResult?.hookDepthM},zone:{lo:out.zone?.min,hi:out.zone?.max},score:out.score,blown:out.blownOut};
  console.log(JSON.stringify(raw,null,2));
  console.log("");console.log("-- DONE -- Debug: 0");