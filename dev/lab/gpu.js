window.SwarmLabGPU = (() => {
  async function open(data,extent,canvas,onLoss) {
    const adapter=await navigator.gpu?.requestAdapter();
    if(!adapter)throw Error('WebGPU adapter unavailable');
    const device=await adapter.requestDevice(), n=data.byteLength/32;
    let disposed=false;
    device.lost.then(info=>{if(!disposed)onLoss?.(info.message || info.reason);});
    try {
      const grid=Math.max(1,Math.ceil(Math.sqrt(n/8))), count=grid*grid;
      if(data.byteLength>device.limits.maxStorageBufferBindingSize || data.byteLength>device.limits.maxBufferSize ||
          Math.ceil(n/64)>device.limits.maxComputeWorkgroupsPerDimension)throw Error('Population exceeds adapter limits');
      const U=GPUBufferUsage, S=GPUShaderStage;
      const buf=(size,usage)=>device.createBuffer({size,usage});
      const states=[0,1].map(()=>buf(data.byteLength,U.STORAGE|U.COPY_DST|U.COPY_SRC));
      const heads=buf(count*4,U.STORAGE|U.COPY_DST), links=buf(n*4,U.STORAGE);
      const masks=buf((count+1)*4,U.STORAGE|U.COPY_DST), config=buf(16,U.UNIFORM|U.COPY_DST);
      const params=new ArrayBuffer(16);
      new Uint32Array(params).set([n,grid]);new Float32Array(params).set([extent,extent/grid],2);
      device.queue.writeBuffer(config,0,params);device.queue.writeBuffer(states[0],0,data);
      const url=new URL('compute.wgsl',document.baseURI);
      const response=await fetch(url);if(!response.ok)throw Error('Unable to load swarm shader');
      const module=device.createShaderModule({code:await response.text()});
      const errors=(await module.getCompilationInfo()).messages.filter(e=>e.type==='error');
      if(errors.length)throw Error(errors.map(e=>e.lineNum+' '+e.message).join('\n'));
      const layout=device.createBindGroupLayout({entries:['uniform','read-only-storage','storage','storage','storage','storage'].map((type,binding)=>({binding,visibility:S.COMPUTE,buffer:{type}}))});
      const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
      const pipelines=await Promise.all(['indexAgents','moveAgents'].map(entryPoint=>
        device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint}})));
      const groups=states.map((src,i)=>device.createBindGroup({layout,entries:
        [config,src,states[1-i],heads,links,masks].map((buffer,binding)=>({binding,resource:{buffer}}))}));
      let front=0,ctx,render,renderGroups;
      if(canvas){
        ctx=canvas.getContext('webgpu');
        if(!ctx)throw Error('WebGPU canvas unavailable');
        const format=navigator.gpu.getPreferredCanvasFormat();
        ctx.configure({device,format,alphaMode:'opaque'});
        const draw=device.createShaderModule({code:`
          struct Agent { pos:vec2f, v:vec2f, kind:u32, prey:u32, state:u32, id:u32 }
          @group(0) @binding(0) var<storage,read> agents:array<Agent>;
          struct Out { @builtin(position) pos:vec4f, @location(0) color:vec3f }
          @vertex fn vert(@builtin(vertex_index)i:u32)->Out{
            let a=agents[i];let p=a.pos/${Number(extent).toFixed(6)}*2.-1.;
            let colors=array(vec3f(.25,.64,1.),vec3f(.98,.67,.17),vec3f(.35,.93,.61));
            return Out(vec4f(p.x,-p.y,0,1),colors[a.kind]);
          }
          @fragment fn frag(in:Out)->@location(0) vec4f{return vec4f(in.color,1);}
        `});
        render=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:draw,entryPoint:'vert'},
          fragment:{module:draw,entryPoint:'frag',targets:[{format}]},primitive:{topology:'point-list'}});
        renderGroups=states.map(buffer=>device.createBindGroup({layout:render.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer}}]}));
      }
      return {
        name:adapter.info?.architecture || adapter.info?.vendor || 'WebGPU',
        bytes:2*data.byteLength+4*(n+2*count+1)+16,
        step(){
          const enc=device.createCommandEncoder();enc.clearBuffer(heads);enc.clearBuffer(masks);
          for(const pipeline of pipelines){
            const pass=enc.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,groups[front]);
            pass.dispatchWorkgroups(Math.ceil(n/64));pass.end();
          }
          device.queue.submit([enc.finish()]);front=1-front;
        },
        draw(){
          if(!ctx)return;
          const enc=device.createCommandEncoder(),pass=enc.beginRenderPass({colorAttachments:[{
            view:ctx.getCurrentTexture().createView(),clearValue:{r:.025,g:.045,b:.075,a:1},loadOp:'clear',storeOp:'store'}]});
          pass.setPipeline(render);pass.setBindGroup(0,renderGroups[front]);pass.draw(n);pass.end();device.queue.submit([enc.finish()]);
        },
        settle:()=>device.queue.onSubmittedWorkDone(),
        async snapshot(){
          const staging=buf(data.byteLength,U.MAP_READ|U.COPY_DST);
          try{
            const enc=device.createCommandEncoder();enc.copyBufferToBuffer(states[front],0,staging,0,data.byteLength);
            device.queue.submit([enc.finish()]);await staging.mapAsync(GPUMapMode.READ);
            return staging.getMappedRange().slice(0);
          } finally {staging.destroy();}
        },
        dispose(){disposed=true;device.destroy();}
      };
    } catch(e){disposed=true;device.destroy();throw e;}
  }
  return {open};
})();
