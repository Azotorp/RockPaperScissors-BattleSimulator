(() => {
  const $=id=>document.getElementById(id),pref='swarmArena.dev.lab';
  let current, ticket=0,paused=true;
  try{
    const s=JSON.parse(localStorage.getItem(pref));
    if(s && ['CPU','GPU','Auto'].includes(s.backend) && Number.isInteger(s.n) && s.n>0 && s.n<=1e6){
      $('backend').value=s.backend;$('population').value=s.n;
    }
  }catch{}
  function newCanvas(){
    const old=document.querySelector('canvas'),next=old.cloneNode(false);
    old.replaceWith(next);return next;
  }
  $('controls').onsubmit=async e=>{
    e.preventDefault();
    const run=++ticket,n=$('population').valueAsNumber,choice=$('backend').value;
    current?.dispose?.();current=null;paused=true;$('pause').disabled=true;
    if(!Number.isInteger(n)||n<1||n>1e6)return;
    try{localStorage.setItem(pref,JSON.stringify({backend:choice,n}));}catch{}
    const extent=Math.max(100,Math.ceil(Math.sqrt(n)*5)),seed=SwarmLabModel.initial(n,extent,'lab');
    let canvas=newCanvas(),engine,label,steps=0,message='';
    const cpu=()=>{
      const model=SwarmLabModel.cpu(seed,extent),context=canvas.getContext('2d');
      const colors=['#40a3ff','#faab2b','#59ed9c'];
      return {step:model.step,draw(){
        const f=new Float32Array(model.data),u=new Uint32Array(model.data);
        context.fillStyle='#071020';context.fillRect(0,0,canvas.width,canvas.height);
        for(let i=0;i<n;i++){const j=8*i;context.fillStyle=colors[u[j+4]];
          context.fillRect(Math.floor(f[j]*canvas.width/extent),Math.floor(f[j+1]*canvas.height/extent),1,1);}
      }};
    };
    function fallback(reason){
      if(run!==ticket)return;
      engine?.dispose?.();canvas=newCanvas();engine=cpu();current=engine;label='CPU';
      steps=0;message=reason+' · restarted from the same seed. ';
    }
    $('status').textContent='Preparing '+choice+'…';
    try{
      if(choice==='CPU'){engine=cpu();label='CPU';}
      else{
        try{engine=await SwarmLabGPU.open(seed,extent,canvas,why=>fallback('GPU device lost: '+why));label='GPU · '+engine.name;}
        catch(err){fallback(err.message);}
      }
      if(run!==ticket){engine?.dispose?.();return;}
      current=engine;paused=false;$('pause').disabled=false;$('pause').textContent='Pause';
      let last=0;
      async function frame(now){
        if(run!==ticket)return;
        if(!paused){
          const active=engine,start=performance.now();
          try{
            active.step();active.draw();await active.settle?.();
            if(run===ticket && active===engine){
              steps++;
              if(now-last>=250||steps===1){
                $('status').textContent=message+label+' · '+n.toLocaleString()+' agents · step '+steps+' · '+(performance.now()-start).toFixed(1)+' ms simulation + draw';
                last=now;
              }
            }
          }catch(error){if(run===ticket && active===engine)fallback(error.message);}
        }
        if(run===ticket)requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }catch(error){$('status').textContent=error.message;}
  };
  $('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';};
})();
