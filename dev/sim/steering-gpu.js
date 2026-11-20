// The CPU retains authoritative positions for contacts, walls and mid-round edits.
window.SwarmSteeringGPU = {async open(onLoss) {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw Error('WebGPU unavailable');
  const device = await adapter.requestDevice();
  let closed = false;
  device.lost.then(info => { if (!closed) onLoss(info.message || 'device lost'); });
  try {
    const shader = device.createShaderModule({code:`
      struct Settings { halfSize: vec2f, pad: f32, maxTurn: f32, walls: u32 }
      @group(0) @binding(0) var<storage,read> agents: array<vec4f>;
      @group(0) @binding(1) var<storage,read_write> result: array<vec4f>;
      @group(0) @binding(2) var<uniform> cfg: Settings;
      @compute @workgroup_size(64)
      fn main(@builtin(global_invocation_id) id: vec3u) {
        if (id.x >= arrayLength(&agents)) {return;}
        let a = agents[id.x];
        var dir = vec2f(cos(a.w), sin(a.w));
        if (cfg.walls != 0u) {
          let edge = cfg.halfSize - cfg.pad;
          if ((a.x <= -edge.x && dir.x < 0) || (a.x >= edge.x && dir.x > 0)) {dir.x = 0;}
          if ((a.y <= -edge.y && dir.y < 0) || (a.y >= edge.y && dir.y > 0)) {dir.y = 0;}
          if (abs(dir.x)+abs(dir.y)<0.001) {dir = -a.xy;}
        }
        var goal = 0.0;
        if (any(dir != vec2f(0))) {goal = atan2(dir.y,dir.x);}
        let diff = goal-a.z;
        let turn = clamp(atan2(sin(diff),cos(diff)),-cfg.maxTurn,cfg.maxTurn);
        let heading = a.z+turn;
        result[id.x] = vec4f(turn,cos(heading),sin(heading),0);
      }`});
    const pipeline = await device.createComputePipelineAsync({layout:'auto',compute:{module:shader,entryPoint:'main'}});
    const U = GPUBufferUsage;
    const config = device.createBuffer({size:32,usage:U.UNIFORM|U.COPY_DST});
    let capacity=0, input, output, readback, group, boundCount=0;
    function buffers(count) {
      if (count>capacity) {
        for(const b of [input,output,readback]) b?.destroy();
        capacity=Math.min(999999,2**Math.ceil(Math.log2(count)));
        const size=capacity*16;
        input=device.createBuffer({size,usage:U.STORAGE|U.COPY_DST});
        output=device.createBuffer({size,usage:U.STORAGE|U.COPY_SRC});
        readback=device.createBuffer({size,usage:U.COPY_DST|U.MAP_READ});
      }
      if(boundCount!==count){
        group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
          {binding:0,resource:{buffer:input,size:count*16}},
          {binding:1,resource:{buffer:output,size:count*16}},
          {binding:2,resource:{buffer:config}}]});
        boundCount=count;
      }
    }
    return {
      async calculate(data,count,settings,walls){
        buffers(count);
        const bytes=count*16, uniform=new Float32Array(8);
        uniform.set(settings);new Uint32Array(uniform.buffer)[4]=Number(walls);
        device.queue.writeBuffer(config,0,uniform);
        device.queue.writeBuffer(input,0,data.buffer,0,bytes);
        const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
        pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();
        encoder.copyBufferToBuffer(output,0,readback,0,bytes);device.queue.submit([encoder.finish()]);
        await readback.mapAsync(GPUMapMode.READ,0,bytes);
        try {return new Float32Array(readback.getMappedRange(0,bytes).slice(0));}
        finally {readback.unmap();}
      },
      dispose(){closed=true;device.destroy();}
    };
  } catch(error){closed=true;device.destroy();throw error;}
}};
