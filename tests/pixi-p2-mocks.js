(function(){
 class Vec {constructor(owner){this.owner=owner; this.x=0;this.y=0;} set(x,y){this.x=x;this.y=y;} }
 class Container{constructor(){this.children=[];this.position=new Vec(this);this.scale=new Vec(this);this.scale.set(1,1);this.rotation=0;this.visible=true;}addChild(...v){this.children.push(...v);return v[v.length-1];}removeChildren(){this.children=[];}removeChild(v){this.children=this.children.filter(x=>x!==v);}destroy(){}get x(){return this.position.x;}set x(n){this.position.x=n;}get y(){return this.position.y;}set y(n){this.position.y=n;}}
 class Graphics extends Container{ clear(){return this;}circle(){return this;}stroke(){return this;}fill(){return this;}rect(){return this;}lineTo(){return this;}moveTo(){return this;}arc(){return this;} }
 class Sprite extends Container{constructor(t){super();this.texture=t;this.width=30;this.height=30;this.anchor={set:()=>{}};this.alpha=1;this.blendMode='normal';}}
 class Application{constructor(){this.screen={width:innerWidth,height:innerHeight};this.ticker={fns:[],add(fn){this.fns.push(fn)}};this.canvas=document.createElement('canvas');this.renderer={resize:(w,h)=>{this.screen.width=w;this.screen.height=h;}};this.stage=new Container();}
 async init(){this.canvas.width=innerWidth;this.canvas.height=innerHeight;this.canvas.style.width='100%';this.canvas.style.height='100%';window.__app=this;}}
 class Body{constructor(opts){this.position=[...opts.position];this.previousPosition=[...opts.position];this.velocity=[0,0];this.id=Math.random();this.shapes=[];this.agent=null;}addShape(shape){this.shapes.push(shape);}updateBoundingRadius(){}updateMassProperties(){}}
 class Circle{constructor(o){Object.assign(this,o);}}
 class SAPBroadphase{}
 class World{constructor(){this.bodies=[];this.solver={iterations:1};this.defaultContactMaterial={};}addBody(x){this.bodies.push(x);}removeBody(x){this.bodies=this.bodies.filter(b=>b!==x);}on(){}step(dt){for(let b of this.bodies){b.previousPosition=[...b.position];b.position[0]+=b.velocity[0]*dt;b.position[1]+=b.velocity[1]*dt;}}}
 window.PIXI={Application,Container,Graphics,Sprite,Assets:{load: async () => ({width:256,height:256})}};
 window.p2={World,Body,Circle,SAPBroadphase};
})();
