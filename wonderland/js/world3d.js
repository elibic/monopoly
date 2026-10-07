import * as THREE from '../vendor/three.module.min.js';

// The scene is a view of the existing game. All rules stay in the engine.
const D = globalThis.MONOPOLY_DATA;
const UI = globalThis.MonopolyUI;
const COLORS = ['#ff715c', '#46a9eb', '#b588e8', '#ffd166'];
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const world = { ready: false, game: null, moving: false };
globalThis.MonopolyWorld = world;

function coordinate(pos) {
  const side = Math.floor(pos / 10), step = pos % 10;
  if (side === 0) return new THREE.Vector3((5 - step) * 1.28, .42, 6.4);
  if (side === 1) return new THREE.Vector3(-6.4, .42, (5 - step) * 1.28);
  if (side === 2) return new THREE.Vector3((step - 5) * 1.28, .42, -6.4);
  return new THREE.Vector3(6.4, .42, (step - 5) * 1.28);
}

try {
  const host = document.querySelector('#world-canvas');
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'לוח מונופול תלת־ממדי. אפשר לגרור לסיבוב וללחוץ על נכסים.');
  const camera = new THREE.OrthographicCamera(-11, 11, 9, -9, .1, 100);
  let yaw = -.22, pitch = .88, zoom = 1, idle = true, selected = -1;
  const target = new THREE.Vector3(0, .1, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x85a7b0, 3));
  const sun = new THREE.DirectionalLight(0xfff3da, 4);
  sun.position.set(-9, 18, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: .1, far: 45 });
  sun.shadow.bias = -.0003; sun.shadow.normalBias = .025;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xd9efff, 1.2); rim.position.set(8, 4, -8); scene.add(rim);
  const materials = new Map();
  function material(color, extra = {}) {
    if (!Object.keys(extra).length && materials.has(color)) return materials.get(color);
    const m = new THREE.MeshStandardMaterial({ color, roughness: .68, ...extra });
    if (!Object.keys(extra).length) materials.set(color, m);
    return m;
  }
  function mesh(geometry, color, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, typeof color === 'string' || typeof color === 'number' ? material(color) : color);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, w, h, d, color, x, y, z) { return mesh(new THREE.BoxGeometry(w, h, d), color, parent, x, y, z); }
  function sphere(parent, r, color, x, y, z, scale) {
    const m = mesh(new THREE.SphereGeometry(r, 16, 10), color, parent, x, y, z);
    if (scale) m.scale.set(...scale); return m;
  }
  function cylinder(parent, r, h, color, x, y, z, top = r, sides = 24) {
    return mesh(new THREE.CylinderGeometry(top, r, h, sides), color, parent, x, y, z);
  }
  function rounded(w, d, depth, radius = .12) {
    const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
    s.moveTo(x + radius, y); s.lineTo(x + w - radius, y);
    s.quadraticCurveTo(x + w, y, x + w, y + radius); s.lineTo(x + w, y + d - radius);
    s.quadraticCurveTo(x + w, y + d, x + w - radius, y + d); s.lineTo(x + radius, y + d);
    s.quadraticCurveTo(x, y + d, x, y + d - radius); s.lineTo(x, y + radius);
    s.quadraticCurveTo(x, y, x + radius, y);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: .035, bevelThickness: .035, bevelSegments: 2, steps: 1, curveSegments: 5 });
    g.rotateX(-Math.PI / 2); return g;
  }
  const base = mesh(rounded(14.5, 14.5, .48, .5), '#78c7ce', scene, 0, -.5, 0);
  mesh(rounded(14.2, 14.2, .15, .45), '#f6e5c2', scene, 0, -.03, 0);
  const floor = mesh(new THREE.PlaneGeometry(200, 200), '#bde4e8', scene, 0, -.57, 0);
  floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
  // Island, paths, pond and living miniature city occupy the actual board center.
  mesh(rounded(11.1, 11.1, .13, .5), '#a7d4a3', scene, 0, .14, 0);
  box(scene, 10.5, .06, 1.05, '#eedcb9', 0, .32, .3);
  box(scene, 1.05, .06, 10.5, '#eedcb9', -.5, .32, 0);
  box(scene, 10.2, .04, .035, '#fff8dc', 0, .36, -.14);
  box(scene, 10.2, .04, .035, '#fff8dc', 0, .36, .75);
  for (let i = -4; i <= 4; i++) box(scene, .37, .025, .045, '#fff4db', i * 1.05, .37, .3);
  const pond = cylinder(scene, 1.3, .06, '#6ecbdd', 2.75, .33, 2.3);
  pond.scale.z = .66;
  cylinder(scene, .49, .13, '#f8e8c9', 2.75, .43, 2.3);
  cylinder(scene, .37, .14, '#63bfd5', 2.75, .52, 2.3);
  cylinder(scene, .08, .55, '#f7f0d8', 2.75, .8, 2.3);
  sphere(scene, .15, '#a3e9ef', 2.75, 1.14, 2.3);
  const fountain = [];
  for (let i = 0; i < 8; i++) fountain.push(sphere(scene, .035, '#c4f6ff', 2.75, 1, 2.3));

  function tree(x, z, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, .32, z); g.scale.setScalar(scale); scene.add(g);
    cylinder(g, .07, .65, '#ac8158', 0, .31, 0);
    sphere(g, .32, '#66a567', 0, .82, 0, [1, 1.2, 1]);
    sphere(g, .23, '#83be75', .16, .72, .04);
  }
  for (const [x, z, s] of [[-4.6,-4.6,1.2],[-3.8,-4.6,.9],[4.6,-4.6,1.1],[4.6,4.6,1.3],[-4.5,4.5,1],[-3.5,4.5,.85],[4.4,1.3,1],[-4.5,-1.2,.9],[1.6,4.4,.9],[.5,-4.5,.9],[3.5,-4.5,1],[4.4,-2,1.1]]) tree(x, z, s);

  function house(parent, color, size = 1, hotel = false) {
    const g = new THREE.Group(); parent.add(g); g.scale.setScalar(size);
    const h = hotel ? 1.45 : .67;
    box(g, .72, h, .63, '#fff0d5', 0, h / 2, 0);
    box(g, .75, .1, .66, color, 0, h + .04, 0);
    if (!hotel) {
      const roof = mesh(new THREE.CylinderGeometry(.58, .58, .81, 3), color, g, 0, h + .2, 0);
      roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2;
    } else {
      box(g, .28, .35, .3, color, 0, h + .25, 0);
      cylinder(g, .18, .1, '#ffd27a', 0, h + .45, 0);
    }
    box(g, .18, .32, .035, '#476b70', 0, .16, .33);
    for (const x of [-.23, .23]) for (let y = .42; y < h; y += .38) {
      box(g, .14, .18, .035, '#82c3d8', x, y, .33);
      box(g, .15, .19, .035, '#82c3d8', -.38, y, x);
    }
    return g;
  }
  for (const [x,z,c,s,h] of [[-3.1,-2.8,'#eb9b77',1.3,false],[-1.3,-2.7,'#75acbc',1.1,true],[1,-2.5,'#edbb63',1.4,true],[3,-2.6,'#ce8db0',1.25,false],[-3.2,2,'#85afa0',1.2,false],[-1.4,3,'#ec9c88',1.2,false]]) {
    const g = new THREE.Group(); g.position.set(x, .34, z); scene.add(g); house(g,c,s,h);
  }
  // Clock tower and civic square, with dimensional roof, windows and clock face.
  const hall = new THREE.Group(); hall.position.set(-.2, .34, -1); scene.add(hall);
  house(hall, '#6ea0b9', 1.5, true);
  cylinder(hall, .42, .65, '#f9e3b7', 0, 2.85, 0);
  mesh(new THREE.ConeGeometry(.52, .48, 24), '#648ca6', hall, 0, 3.42, 0);
  sphere(hall,.055,'#e8b363',0,3.72,0);
  const clock = cylinder(hall, .21, .03, '#fff9ea', 0, 2.9, .42); clock.rotation.x = Math.PI / 2;
  box(hall,.025,.14,.02,'#55717a',0,2.94,.45);box(hall,.1,.025,.02,'#55717a',.045,2.9,.45);
  // A real little train circles its own park track.
  const track = mesh(new THREE.TorusGeometry(1.35, .035, 6, 60), '#a29479', scene, -2.9, .39, 2.4); track.rotation.x = Math.PI / 2;
  const train = new THREE.Group(); scene.add(train);
  box(train,.52,.25,.28,'#e99b69',0,.16,0);box(train,.2,.25,.28,'#fff0ce',.11,.38,0);
  cylinder(train,.055,.18,'#456b74',-.16,.36,0);

  const tiles = [], decorations = [], pickable = [];
  function tileTexture(sq) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d'); c.fillStyle = '#fff8e8'; c.fillRect(0,0,256,256);
    const color = sq.group ? D.GROUPS[sq.group].color : '#78b6bd';
    c.fillStyle = color; c.fillRect(0,0,256,60);
    c.textAlign = 'center'; c.direction = 'rtl'; c.fillStyle = '#fff'; c.font = 'bold 28px Arial';
    c.fillText(sq.group ? D.GROUPS[sq.group].name : '',128,42);
    c.fillStyle = '#284e56'; c.font = 'bold 29px Arial';
    const words = sq.name.split(' '); let lines = [''];
    for (const word of words) { const last=lines.length-1; if(c.measureText(lines[last]+' '+word).width>232)lines.push(word);else lines[last]+=' '+word; }
    lines.forEach((line,i)=>c.fillText(line.trim(),128,110+i*34));
    c.font='bold 26px Arial'; c.fillStyle='#688b89';
    c.fillText(sq.price ? sq.price+' ₪' : ({go:'+200 ₪',tax:sq.amount+' ₪',chance:'?',chest:'✦',free:'מתנה',jail:'ביקור',gotojail:'לכלא'}[sq.type]||''),128,225);
    const t = new THREE.CanvasTexture(canvas); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
  }
  for (const sq of D.BOARD) {
    const pos=coordinate(sq.pos), g=new THREE.Group();g.position.copy(pos);g.position.y=.18;scene.add(g);
    const body=mesh(rounded(1.19,1.19,.17,.08), '#fff8e8',g);body.userData.pos=sq.pos;pickable.push(body);
    const face=mesh(new THREE.PlaneGeometry(1.14,1.14),new THREE.MeshBasicMaterial({map:tileTexture(sq)}),g,0,.213,0);
    face.rotation.x=-Math.PI/2;face.rotation.z=Math.floor(sq.pos/10)*-Math.PI/2;face.userData.pos=sq.pos;pickable.push(face);
    const property=new THREE.Group();g.add(property);property.position.set(0,.22,-.12);decorations.push(property);tiles.push(g);
    if (sq.type==='rail') {
      const train=new THREE.Group();property.add(train);train.scale.setScalar(.65);
      box(train,.55,.28,.3,'#77a9ad',0,.16,0);box(train,.22,.3,.31,'#f7d27e',.1,.4,0);
      for(const x of [-.18,.18]){const w=cylinder(train,.08,.34,'#395b66',x,.08,0);w.rotation.x=Math.PI/2;}
      property.position.z=-.27;
    } else if(sq.type==='chest') {
      box(property,.46,.3,.33,'#eab55d',0,.15,-.16);box(property,.49,.09,.35,'#ffd68b',0,.34,-.16);box(property,.08,.16,.03,'#bd8a48',0,.24,.02);
    } else if(sq.type==='chance') {
      const s=label('?', '#e28b91', '#ffffff', 100);s.scale.set(.55,.55,1);s.position.set(0,.65,-.25);property.add(s);
    }
  }
  function label(text,bg='#ffffff',fg='#315e66',size=48) {
    const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');
    x.fillStyle=bg;x.beginPath();x.roundRect(3,3,506,122,40);x.fill();x.font=`bold ${size}px Arial`;x.textAlign='center';x.direction='rtl';x.fillStyle=fg;x.fillText(text,256,84);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));
  }
  const townSign=label('העיר שלנו','#fff8e8','#376b71',54);townSign.position.set(0,1.1,1.45);townSign.scale.set(3.5,.88,1);scene.add(townSign);
  const tokenMeshes=[];
  function token(player) {
    const g=new THREE.Group(),color=COLORS[player.idx%4];
    cylinder(g,.28,.09,color,0,.045,0); cylinder(g,.22,.03,'#fff4d7',0,.105,0);
    if(player.token==='🚗') {
      box(g,.52,.19,.3,color,0,.23,0);box(g,.28,.15,.26,'#fff0d8',.025,.4,0);
      box(g,.16,.09,.27,'#75b6cc',.025,.42,0);
      for(const x of [-.17,.17])for(const z of [-.17,.17]){const w=cylinder(g,.09,.05,'#395966',x,.17,z);w.rotation.x=Math.PI/2;}
      for(const z of [-.1,.1])sphere(g,.035,'#ffedbb',-.28,.25,z);
    }else if(player.token==='🐶'||player.token==='🐱') {
      sphere(g,.2,'#e7ba7b',0,.3,0,[1,1.1,.7]);sphere(g,.19,'#f2ce98',0,.55,0);
      for(const x of [-.12,.12])sphere(g,.085,player.token==='🐶'?'#a67b53':'#efab95',x,.7,0,[.8,1.5,.8]);
      for(const x of [-.065,.065])sphere(g,.022,'#354e5a',x,.58,.165);
      sphere(g,.026,'#795950',0,.53,.185);
    }else if(player.token==='🎩') {
      cylinder(g,.24,.055,'#445b78',0,.17,0);cylinder(g,.15,.35,'#445b78',0,.35,0);cylinder(g,.155,.07,color,0,.25,0);
    }else if(player.token==='🚢') {
      sphere(g,.26,'#edc06d',0,.23,0,[1.4,.55,.65]);box(g,.26,.14,.21,'#fff8e7',0,.34,0);cylinder(g,.035,.17,color,0,.48,0);
    }else {
      sphere(g,.2,'#f7e8d0',0,.31,0,[1.5,.6,.6]);box(g,.17,.045,.61,color,0,.34,0);box(g,.06,.2,.12,color,.21,.4,0);
    }
    const tag=label(player.name,color,'#ffffff',36);tag.scale.set(1.12,.28,1);tag.position.set(0,1,0);g.add(tag);
    scene.add(g);return g;
  }
  const halo=mesh(new THREE.TorusGeometry(.4,.045,8,40),'#ffce76',scene);halo.rotation.x=Math.PI/2;halo.visible=false;
  let propertyStamp='';
  function sync(g, {positions=true}={}) {
    world.game=g;
    g.players.forEach((p,i)=>{
      if(!tokenMeshes[i])tokenMeshes[i]=token(p);
      tokenMeshes[i].visible=!p.bankrupt;
      if(positions&&!world.moving){tokenMeshes[i].position.copy(coordinate(p.pos));tokenMeshes[i].position.y=.43;tokenMeshes[i].position.x+=(i%2)*.36-.18;tokenMeshes[i].position.z+=Math.floor(i/2)*.3-.15;}
    });
    const stamp=JSON.stringify([g.owner,g.houses,g.mortgaged]);
    if(stamp!==propertyStamp){propertyStamp=stamp;D.BOARD.forEach((sq,i)=>{
      if(sq.type!=='street')return;const parent=decorations[i];
      while(parent.children.length){const c=parent.children[0];parent.remove(c);c.traverse(o=>{if(o.geometry)o.geometry.dispose()});}
      const owner=g.owner[i],count=g.houses[i];
      if(owner!==null){const flag=cylinder(parent,.055,.45,COLORS[owner%4],.42,.25,-.4);box(parent,.2,.13,.025,COLORS[owner%4],.33,.46,-.4);}
      for(let n=0;n<(count===5?1:count);n++){const h=house(parent,sq.group?D.GROUPS[sq.group].color:'#77aaa6',count===5?.72:.42,count===5);h.position.set((n%2)*.43-.2,0,-.24+Math.floor(n/2)*.32);}
      if(g.mortgaged[i])box(parent,.7,.03,.045,'#8c9395',0,.05,0);
    });}
    const p=g.current();halo.visible=!p.bankrupt;halo.position.copy(coordinate(p.pos));halo.position.y=.42;
    document.querySelector('#world-player').textContent=p.isAI?p.name+' חושב…':p.name+', התור שלך!';
    const title={roll:'מוכנים לצעד הבא?',buy:'איזה עסק פותחים כאן?',pay:'עושים העברה, צעד אחר צעד',collect:'הגיע הזמן לקבל כסף!',debt:'נמצא יחד דרך לשלם',auction:'מי יזכה בנכס?',end:'כל הכבוד! ממשיכים?',gameover:'איזו הרפתקה!'}[g.phase]||'בונים את העיר שלנו';
    document.querySelector('#world-prompt').textContent=title;
    document.querySelector('#world-location').textContent=D.BOARD[p.pos].name;
    document.querySelector('#world-count').textContent=g.playerProps(0).length+' נכסים';
    document.querySelector('#world-budget').textContent=g.players[0].money.toLocaleString('he-IL')+' ₪';
    selectTile(p.pos,false);
  }
  world.sync=sync;
  world.move=async(g,i,from,to)=>{
    if(!tokenMeshes[i])sync(g);
    const token=tokenMeshes[i];world.moving=true;
    try{
      const forward=(to-from+40)%40,back=(from-to+40)%40;const path=[];
      if(forward<=12)for(let n=1;n<=forward;n++)path.push((from+n)%40);
      else if(back<=3)for(let n=1;n<=back;n++)path.push((from-n+40)%40);
      else path.push(to);
      if(reduce()||document.hidden){token.position.copy(coordinate(to));return;}
      const speed=UI.getSpeed()==='fast'?100:UI.getSpeed()==='slow'?280:180;
      for(const pos of path){const start=token.position.clone(),end=coordinate(pos);await new Promise(resolve=>{
        const begin=performance.now();function step(now){const t=clamp((now-begin)/speed,0,1);token.position.lerpVectors(start,end,t);token.position.y=.43+Math.sin(t*Math.PI)*.35;halo.position.copy(end);if(t<1)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);
      });}
    }finally{world.moving=false;sync(g);}
  };
  function selectTile(pos, open=true) {
    selected=pos;const sq=D.BOARD[pos];
    const panel=document.querySelector('#tile-peek');panel.hidden=false;
    document.querySelector('#peek-city').textContent=sq.group?D.GROUPS[sq.group].name:'מגלים בדרך';
    document.querySelector('#peek-title').textContent=sq.name;
    document.querySelector('#peek-price').textContent=sq.price?sq.price+' ₪':sq.type==='go'?'מקבלים 200 ₪':'משבצת מיוחדת';
    const owner=world.game?.owner[pos];document.querySelector('#peek-owner').textContent=owner===null||owner===undefined?'מחכה לבעלים חדשים':world.game.players[owner].name+' בנה כאן עסק';
    if(open&&world.game)UI.showDeed(world.game,pos);
  }
  document.querySelector('#peek-open').onclick=()=>{if(world.game&&selected>=0)UI.showDeed(world.game,selected);};
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,yaw,pitch,moved:false,id:e.pointerId};renderer.domElement.setPointerCapture(e.pointerId);});
  renderer.domElement.addEventListener('pointermove',e=>{
    if(!down)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;
    if(Math.hypot(dx,dy)>6){down.moved=true;idle=false;yaw=down.yaw-dx*.004;pitch=clamp(down.pitch+dy*.003,.48,1.4);}
  });
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!down)return;const click=!down.moved;down=null;renderer.domElement.releasePointerCapture(e.pointerId);
    if(click){const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(pickable)[0];if(hit)selectTile(hit.object.userData.pos);}
  });
  renderer.domElement.addEventListener('pointercancel',()=>{down=null;});
  renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();zoom=clamp(zoom-e.deltaY*.001,.75,1.75);idle=false;},{passive:false});
  document.querySelector('#camera-home').onclick=()=>{yaw=-.22;pitch=.88;zoom=1;idle=true;};
  document.querySelector('#camera-top').onclick=()=>{pitch=pitch>1.2?.88:1.4;idle=false;};
  document.querySelector('#camera-in').onclick=()=>{zoom=clamp(zoom+.15,.75,1.75);};
  document.querySelector('#camera-out').onclick=()=>{zoom=clamp(zoom-.15,.75,1.75);};
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();world.ready=false;document.querySelector('#board').prepend(document.querySelector('#board-center'));document.body.classList.remove('world-ready');UI.toast('עוברים ללוח הרגיל כדי להמשיך לשחק');});
  function resize(){const r=host.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);const aspect=r.width/r.height;const span=9.5;camera.left=-span*aspect;camera.right=span*aspect;camera.top=span;camera.bottom=-span;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(host);
  const observer=new MutationObserver(()=>{if(!document.querySelector('#game-screen').classList.contains('hidden'))resize();});observer.observe(document.querySelector('#game-screen'),{attributes:true,attributeFilter:['class']});
  const originalRender=UI.render;UI.render=async function(g){sync(g,{positions:false});await originalRender(g);sync(g);};
  const guide=document.querySelector('.guide-avatar');if(guide)guide.innerHTML=UI.SVG.robot;
  document.querySelector('#world-dock').appendChild(document.querySelector('#board-center'));
  world.ready=true;document.body.classList.add('world-ready');resize();
  let last=0;function frame(now){requestAnimationFrame(frame);if(document.hidden||document.querySelector('#game-screen').classList.contains('hidden'))return;if(now-last<30)return;last=now;
    const t=reduce()?0:now*.001;
    camera.position.set(Math.sin(yaw)*24*Math.cos(pitch),Math.sin(pitch)*24,Math.cos(yaw)*24*Math.cos(pitch));camera.zoom=zoom;camera.lookAt(target);camera.updateProjectionMatrix();
    const angle=t*.26;train.position.set(-2.9+Math.cos(angle)*1.35,.36,2.4+Math.sin(angle)*1.35);train.rotation.y=-angle;
    fountain.forEach((d,i)=>{const a=i/8*Math.PI*2;const v=(t*.8+i/8)%1;d.position.set(2.75+Math.cos(a)*v*.4,.65+Math.sin(v*Math.PI)*.8,2.3+Math.sin(a)*v*.4);});
    halo.scale.setScalar(1+Math.sin(t*3)*.06);renderer.render(scene,camera);
  }requestAnimationFrame(frame);
} catch(error) {
  console.warn('3D board unavailable; the accessible board remains playable.',error);
  document.querySelector('#world-loading')?.remove();
}
