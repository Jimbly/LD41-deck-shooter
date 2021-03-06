
const util = require('./glov/util.js');
export let defs = {};

defs.explosion = {
  particles: {
    part0: {
      bucket: 'additive_nearest',
      texture: 'circle_alpha_gradient8.png',
      color: [1,1,1,1], // multiplied by animation track, default 1,1,1,1, can be omitted
      color_track: [ // just values, NOT random range
        { t: 0.0, v: [1,1,1,0] },
        { t: 0.2, v: [1,1,1,1] },
        { t: 0.4, v: [1,1,0.5,0.5] },
        { t: 1.0, v: [1,1,0,0] },
      ],
      size: [[48,8], [48,8]], // multiplied by animation track
      size_track: [ // just values, NOT random range
        { t: 0.0, v: [1,1] },
        { t: 0.2, v: [2,2] },
        { t: 0.4, v: [1,1] },
        { t: 1.0, v: [1.5,1.5] },
      ],
      accel: [0,0,0],
      rot: [0,360], // degrees
      rot_vel: [10,2], // degrees per second
      lifespan: [450,0], // milliseconds
      kill_time_accel: 5,
    },
  },
  emitters: {
    part0: {
      particle: 'part0',
      // Random ranges affect each emitted particle:
      pos: [[-8,16], [-8,16], 0],
      vel: [0,0,0],
      emit_rate: [0,0], // emissions per second
      // Random ranges only calculated upon instantiation:
      emit_time: [0,0],
      emit_initial: 4,
      max_parts: Infinity,
    },
  },
  system_lifespan: 450,
};

defs.explosion_small = util.clone(defs.explosion);
defs.explosion_small.emitters.part0.emit_initial = 2;

defs.explosion_player = {
  particles: {
    part0: {
      bucket: 'additive_nearest',
      texture: 'circle_alpha_gradient8.png',
      color: [1,1,1,1], // multiplied by animation track, default 1,1,1,1, can be omitted
      color_track: [ // just values, NOT random range
        { t: 0.0, v: [1,1,1,0] },
        { t: 0.2, v: [1,1,1,1] },
        { t: 0.4, v: [1,0.2,0.2,0.5] },
        { t: 1.0, v: [1,0,0,0] },
      ],
      size: [[48,64], [48,64]], // multiplied by animation track
      size_track: [ // just values, NOT random range
        { t: 0.0, v: [1,1] },
        { t: 0.2, v: [2,2] },
        { t: 0.4, v: [1,1] },
        { t: 1.0, v: [1.5,1.5] },
      ],
      accel: [0,0,0],
      rot: [0,360], // degrees
      rot_vel: [10,2], // degrees per second
      lifespan: [450,0], // milliseconds
      kill_time_accel: 5,
    },
  },
  emitters: {
    part0: {
      particle: 'part0',
      // Random ranges affect each emitted particle:
      pos: [[-12,24], [-12,24], 0],
      vel: [0,0,0],
      emit_rate: [50,10], // emissions per second
      // Random ranges only calculated upon instantiation:
      emit_time: [0,1000],
      emit_initial: 10,
      max_parts: Infinity,
    },
  },
  system_lifespan: 1500,
};
