// Mode-relative path, display label, default, minimum, maximum and step.
window.SwarmOptions = {
  movement:[
    ['wanderMin','Minimum wander interval (ms)',500,0,60000,1],
    ['wanderMax','Maximum wander interval (ms)',5000,0,60000,1],
    ['turnRate','Turn speed (degrees/s)',360,15,1440,1],
    ['threat','Urgent threat radius (head widths)',2.5,0,20,.1],
    ['retarget','Required distance improvement (%)',25,0,95,1]
  ],
  outbreak:[
    ['fearDuration','Fear memory (ms)',4000,0,60000,1],
    ['panicRange','Panic influence radius (head widths)',4,0,20,.1],
    ['idleMin','Minimum idle time (ms)',1000,0,60000,1],
    ['idleMax','Maximum idle time (ms)',10000,0,60000,1],
    ['huntTime','Search time before resting (ms)',3200,100,60000,1],
    ['acquire','Tracking time before chase (ms)',250,0,10000,1],
    ['attackHold','Bite recovery (ms)',180,0,5000,1],
    ['threshold','Exposure required (ms)',1000,1,60000,1],
    ['incubation','Incubation (ms)',10000,1,300000,1],
    ['bonusInterval','Additional contact interval (ms)',1000,1,60000,1],
    ['bonus','Incubation reduction per interval (ms)',1000,0,60000,1]
  ],
  spawning:[
    ['arenaScale','Arena size multiplier',1,1,50,.25],
    ['gap','Minimum gap (world units)',2,0,100,.5]
  ],
  physics:[['maxSteps','Maximum physics steps per frame',32,1,60,1],['frameBudget','1× catch-up CPU budget (ms/frame)',10,2,100,1]]
};
