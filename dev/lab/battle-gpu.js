window.createBattlePass=async function(device,config,states,n,extent){
  const response=await fetch('battle.wgsl?v=0.3.0-dev.6');
  if(!response.ok)throw Error('Could not load contact shader');
  const module=device.createShaderModule({code:await response.text()});
  const errors=(await module.getCompilationInfo()).messages.filter(e=>e.type==='error');
  if(errors.length)throw Error(errors.map(e=>e.lineNum+' '+e.message).join('\n'));
  const U=GPUBufferUsage,align=device.limits.minUniformBufferOffsetAlignment;
  const blocks=Math.ceil(n/16);
  const buffer=(size,usage)=>device.createBuffer({size,usage});
  const heads=buffer(4*Math.ceil(extent/2)**2,U.STORAGE|U.COPY_DST);
  const next=buffer(4*n,U.STORAGE),flags=buffer(4*n,U.STORAGE),stats=buffer(8,U.STORAGE);
  const ranges=buffer(align*blocks,U.UNIFORM|U.COPY_DST);
  const offsets=new Uint32Array(align*blocks/4);
  for(let i=0;i<blocks;i++)offsets[i*align/4]=16*i;
  device.queue.writeBuffer(ranges,0,offsets);
  const types=['uniform','read-only-storage','storage','storage','storage','storage','storage','uniform'];
  const layout=device.createBindGroupLayout({entries:types.map((type,binding)=>({
    binding,visibility:GPUShaderStage.COMPUTE,buffer:{type,hasDynamicOffset:binding===7}
  }))});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const [prepare,contacts,finish]=await Promise.all(['prepare','contacts','finish'].map(entryPoint=>
    device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint}})));
  const groups=states.map((src,i)=>device.createBindGroup({layout,entries:
    [config,src,states[1-i],heads,next,flags,stats,ranges].map((buffer,binding)=>({
      binding,resource:binding===7?{buffer,size:16}:{buffer}
    }))}));
  return {
    bytes:heads.size+next.size+flags.size+stats.size+ranges.size,
    encode(enc,front){
      enc.clearBuffer(heads);
      const pass=enc.beginComputePass();
      pass.setPipeline(prepare);pass.setBindGroup(0,groups[front],[0]);pass.dispatchWorkgroups(1);
      pass.setPipeline(contacts);
      for(let i=0;i<blocks;i++){
        pass.setBindGroup(0,groups[front],[align*i]);pass.dispatchWorkgroups(1);
      }
      pass.setPipeline(finish);pass.setBindGroup(0,groups[front],[0]);pass.dispatchWorkgroups(Math.ceil(n/64));pass.end();
    }
  };
};
