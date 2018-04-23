/*jshint noempty:false*/

/*global $: false */
/*global math_device: false */
/*global assert: false */
/*global Z: false */

const local_storage = require('./local_storage.js');
local_storage.storage_prefix = 'turbulenz-LD41';
const util = require('./glov/util.js');
const particle_data = require('./particle_data.js');
window.Z = window.Z || {};
Z.BACKGROUND = 0;
Z.SPRITES = 10;
Z.PARTICLES = 20;
Z.BORDER = 30;
Z.FLOAT = 100;

const DEBUG = window.location.toString().indexOf('localhost') !== -1;

let levelWon;
let levelWonInit;
let spaceParamsInit;

// Balance params
const DRAW_RATE = 2000;
const COST_BY_TIER = [100, 300, 800];
const TRASH_COST = 250;
const MONEY_PER_HP = 5;

// Virtual viewport for our game logic
const game_width = 1024;
const game_height = 1024;

function clamp(v, mn, mx) {
  return Math.min(Math.max(v, mn), mx);
}

export function main(canvas)
{
  const random_seed = require('random-seed');
  const glov_engine = require('./glov/engine.js');
  const glov_font = require('./glov/font.js');

  glov_engine.startup({
    canvas,
    game_width,
    game_height,
    pixely: true,
  });

  const sound_manager = glov_engine.sound_manager;
  const glov_camera = glov_engine.glov_camera;
  const glov_input = glov_engine.glov_input;
  const glov_sprite = glov_engine.glov_sprite;
  const glov_ui = glov_engine.glov_ui;
  const draw_list = glov_engine.draw_list;
  const font = glov_engine.font;

  glov_ui.button_width = 400;
  glov_ui.button_height = 64;

  const loadTexture = glov_sprite.loadTexture.bind(glov_sprite);
  const createSprite = glov_sprite.createSprite.bind(glov_sprite);

  glov_ui.bindSounds(sound_manager, {
    button_click: 'button_click',
    rollover: 'rollover',
  });

  const color_black = math_device.v4Build(0, 0, 0, 1);
  const color_white = math_device.v4Build(1, 1, 1, 1);
  const color_red = math_device.v4Build(1, 0, 0, 1);
  const color_green = math_device.v4Build(0, 1, 0, 1);
  const color_blue = math_device.v4Build(0, 0, 1, 1);
  const color_ghost = math_device.v4Build(1, 1, 1, 0.5);
  //const color_yellow = math_device.v4Build(1, 1, 0, 1);

  // Cache key_codes
  const key_codes = glov_input.key_codes;
  const pad_codes = glov_input.pad_codes;

  let game_state;

  let enemy_types = ['drone', 'bomber', 'sniper', 'large1', 'large2'];
  let enemy_hps = [1, 2, 4, 20, 20];
  let sprites = {};
  const sprite_size = 32;
  const bullet_size = 8;
  function initGraphics() {
    if (sprites.white) {
      return;
    }

    loadTexture('circle_alpha_gradient.png');
    loadTexture('circle_alpha_gradient8.png');

    sound_manager.loadSound('test');
    sound_manager.loadSound('shoot1');
    sound_manager.loadSound('shoot2');
    sound_manager.loadSound('shoot3');
    sound_manager.loadSound('shoot4');
    sound_manager.loadSound('shoot_rapid');
    sound_manager.loadSound('react_block');
    sound_manager.loadSound('shield_block');
    sound_manager.loadSound('draw3');
    sound_manager.loadSound('damage1');
    sound_manager.loadSound('damage_player');
    sound_manager.loadSound('destroyed_small');
    sound_manager.loadSound('destroyed_large');

    const origin_0_0 = { origin: math_device.v2Build(0, 0) };

    function loadSprite(file, u, v, params) {
      params = params || {};
      return createSprite(file, {
        width: params.width || 1,
        height: params.height || 1,
        rotation: params.rotation || 0,
        color: params.color || color_white,
        origin: params.origin || undefined,
        textureRectangle: math_device.v4Build(0, 0, u, v),
      });
    }

    sprites.white = loadSprite('white', 1, 1, origin_0_0);
    sprites.vignette = loadSprite('vignette.png', 64, 64, origin_0_0);
    sprites.player = loadSprite('player13.png', 13, 13);
    sprites.enemies = {};
    for (let ii = 0; ii < enemy_types.length; ++ii) {
      sprites.enemies[enemy_types[ii]] = loadSprite(`enemy_${enemy_types[ii]}13.png`, 13, 13);
    }
    sprites.bullet_small = loadSprite('bullet_small.png', bullet_size, bullet_size);
    sprites.bullet_large = loadSprite('bullet_large.png', bullet_size, bullet_size);

    sprites.space = [];
    for (let ii = 0; ii < 3; ++ii) {
      sprites.space[ii] = loadSprite(`space${ii+1}.png`, 128, 64, origin_0_0);
    }

    sprites.cards = glov_ui.loadSpriteRect('cards.png', [13, 13, 13], [13, 13, 13, 13]);
    sprites.border = glov_ui.loadSpriteRect('border.png', [8, 24, 32], [8, 48, 8]);

    sprites.game_bg = loadSprite('white', 1, 1, {
      width : game_width,
      height : game_height,
      origin: [0, 0],
    });
  }

  const player_speed = 0.002;
  const ZIGZAG = 450;
  const SHIELD_SIZE = 2;
  const SHIELD_GROW_TIME = 250;
  const SHIELD_SHRINK_TIME = 2500;
  let weapons = ['regular', 'spread', 'rapid', 'beam', 'homing'];
  const FIRE_DELAY_REGULAR = 60 * 4;
  let fire_delay = [FIRE_DELAY_REGULAR, FIRE_DELAY_REGULAR, FIRE_DELAY_REGULAR / 2, 16, FIRE_DELAY_REGULAR * 2];
  const BEAM_SPEED_SCALE = 3;
  let cards = {
    move_left: {
      name: 'MOVE LEFT',
      effects: [
        {
          duration: 1100,
          dx: -1,
        },
      ],
      sprite_idx: 0,
      sound: 'move',
    },
    move_right: {
      name: 'MOVE RIGHT',
      effects: [
        {
          duration: 1100,
          dx: 1,
        },
      ],
      sprite_idx: 1,
      sound: 'move',
    },
    zigzag: {
      name: 'ZIG-ZAG',
      effects: [
        {
          duration: ZIGZAG,
          dx: -1,
        },
        {
          duration: ZIGZAG * 2.5,
          dx: 1,
        },
        {
          duration: ZIGZAG * 1.54,
          dx: -1,
        },
      ],
      sprite_idx: 2,
      sound: 'zigzag',
    },
    react: {
      name: 'AUTO-GUARD',
      sprite_idx: 3,
      effects: [
        {
          duration: 60000,
          guard: true,
        }
      ],
      sound: 'react_play',
    },
    shield: {
      name: 'SHIELD BUBBLE',
      sprite_idx: 4,
      effects: [
        {
          duration: SHIELD_GROW_TIME,
          shield_grow: SHIELD_SIZE,
        },
        {
          duration: SHIELD_SHRINK_TIME,
          shield_shrink: SHIELD_SIZE,
        },
      ],
      sound: 'shield',
    },
    repair: {
      name: 'REPAIR',
      sprite_idx: 5,
      effects: [
        {
          duration: 250 * 5,
          trigger_at: 250,
          hp: 1,
        }
      ],
      sound: 'repair',
    },
    draw3: {
      name: 'DRAW 3',
      sprite_idx: 6,
      effects: [
        {
          duration: 250 * 3,
          trigger_at: 250,
          draw: 1,
        }
      ],
      sound: 'button_click',
    },
    spread: {
      name: 'SPREAD',
      sprite_idx: 7,
      effects: [
        {
          duration: 3000,
          weapon: 'spread',
        }
      ],
      sound: 'spread',
    },
    rapid: {
      name: 'RAPID FIRE',
      sprite_idx: 8,
      effects: [
        {
          duration: 2500,
          weapon: 'rapid',
        }
      ],
    },
    beam: {
      name: 'BEAM',
      sprite_idx: 9,
      effects: [
        {
          duration: 1750,
          weapon: 'beam',
        }
      ],
      sound: 'beam',
    },
    homing: {
      name: 'HOMING',
      sprite_idx: 10,
      effects: [
        {
          duration: 3000,
          weapon: 'homing',
        }
      ],
    },
  };
  for (let id in cards) {
    cards[id].id = id;
    if (cards[id].sound) {
      sound_manager.loadSound(cards[id].sound);
    }
  }

  let cards_by_tier = [
    ['move_left', 'move_right', 'zigzag'],
    ['repair', 'react', 'draw3', 'rapid'],
    ['shield', 'beam', 'spread'],
  ];
  for (let ii = 0; ii < cards_by_tier.length; ++ii) {
    for (let jj = 0; jj < cards_by_tier[ii].length; ++jj) {
      cards[cards_by_tier[ii][jj]].tier = ii;
    }
  }

  let deck = [];
  if (!DEBUG || true) {
    // starting deck
    for (let ii = 0; ii < 4; ++ii) {
      deck.push('move_left');
      deck.push('move_right');
    }
    for (let ii = 0; ii < 2; ++ii) {
      deck.push('zigzag');
    }
    deck.push('repair');
    if (false) {
      deck.push('shield');
      deck.push('react');
      deck.push('draw3');
      deck.push('spread');
      deck.push('rapid');
      deck.push('beam');
    }
  } else {
    // TESTING
    // deck.push('zigzag');
    // deck.push('zigzag');
    // deck.push('move_left');
    // deck.push('move_right');
    deck.push('repair');
    deck.push('shield');
    deck.push('react');
    deck.push('draw3');
    deck.push('draw3');
    deck.push('draw3');
    deck.push('draw3');
    deck.push('draw3');
    deck.push('draw3');
    deck.push('draw3');
    deck.push('spread');
    deck.push('rapid');
    deck.push('beam');
    // TODO: deck.push('homing');
  }
  let discard = [];
  let hand = [];
  let cards_in_play = [];
  function randInt(max) { // [0, max-1]
    return Math.floor(Math.random() * max);
  }
  function shuffle() {
    for (let ii = deck.length - 1; ii >= 0; --ii) {
      let idx = randInt(ii + 1);
      let t = deck[ii];
      deck[ii] = deck[idx];
      deck[idx] = t;
    }
  }
  let hand_size = 5;
  function draw(allow_over) {
    if (!allow_over && hand.length >= hand_size) {
      return false;
    }
    if (!deck.length) {
      deck = discard;
      discard = [];
      shuffle();
    }
    if (!deck.length) {
      return false;
    }
    hand.push(deck.pop());
    return true;
  }

  let score = {
    retries: 0,
    kills: 0,
    damage: 0,
    money: 0,
    money_total: 0,
  };
  let board_w = 5;
  let board_h = 10;
  let bullets;
  let enemies;
  let card_h = 118;
  let card_w = (2.5/3.5) * card_h;
  const HAND_BELOW = true;
  let hand_below_h = HAND_BELOW ? card_h + 48 + 20 : 0;
  let board_tile_h = (game_height - hand_below_h) / board_h;
  let board_tile_w = board_tile_h;
  let board_x0 = board_tile_w / 2;
  let board_y0 = 0;
  let ui_x0 = board_x0 * 2 + board_w * board_tile_w;
  let player = {
    color: math_device.v4Copy(color_white),
    bullet_speed: 0.005,
    fire_countdowns: [],
    max_health: DEBUG ? 10 : 10,
  };
  for (let ii = 0; ii < weapons.length; ++ii) {
    player.fire_countdowns[ii] = 0;
  }
  let spawns;
  let player_dead;
  let player_scale = math_device.v2Build(board_tile_w/2, board_tile_h/2);
  let enemy_scale = math_device.v2Build(board_tile_w/2, board_tile_h/2);
  let player_vs_bullet_dist_sq = 0.25*0.25;
  let enemy_vs_bullet_dist_sq = 0.25*0.25;
  let player_vs_enemy_dist_sq = 0.25*0.25;
  let hit_cooldown = 0;
  let hit_was_blocked = false;
  let player_hit_blink_time = 250;
  let enemy_hit_blink_time = 150;
  let player_border_pad = 0.25;
  const player_spread_angle = (90 - 15) / 180 * Math.PI;
  const player_spread_factor_x = Math.cos(player_spread_angle);
  const player_spread_factor_y = Math.sin(player_spread_angle);
  function playerAddBullet(dt, dx, dy, xoffs, yoffs) {
    bullets.push({
      x: player.x + (xoffs || 0) + dt * dx,
      y: player.y + (yoffs || 0) + dt * dy,
      player: true,
      dx,
      dy,
    });
  }
  function fireWeapon(weapon, dt) {
    if (weapon === 'regular') {
      playerAddBullet(dt, 0, -player.bullet_speed);
      sound_manager.play('shoot1', 0.33);
    }
    if (weapon === 'spread') {
      playerAddBullet(dt, player.bullet_speed * player_spread_factor_x * -1,
        -player.bullet_speed * player_spread_factor_y);
      playerAddBullet(dt, -player.bullet_speed * player_spread_factor_x * -1,
        -player.bullet_speed * player_spread_factor_y);
      sound_manager.play('shoot1');
    }
    if (weapon === 'rapid') {
      playerAddBullet(dt, 0, -player.bullet_speed, -0.22, 0.05);
      playerAddBullet(dt, 0, -player.bullet_speed, 0.22, 0.05);
      sound_manager.play('shoot_rapid');
    }
    if (weapon === 'beam') {
      playerAddBullet(dt, 0, -player.bullet_speed * BEAM_SPEED_SCALE, -0.05);
      playerAddBullet(dt, 0, -player.bullet_speed * BEAM_SPEED_SCALE, 0.00);
      playerAddBullet(dt, 0, -player.bullet_speed * BEAM_SPEED_SCALE, 0.05);
    }
  }

  function accelerate(cur_dx, desired_dx, dt, accel) {
    if (desired_dx !== cur_dx) {
      let delta = desired_dx - cur_dx;
      let sign_delta = (delta < 0) ? -1 : 1;
      delta *= sign_delta;
      delta = Math.min(delta, dt * accel);
      cur_dx += delta * sign_delta;
    }
    return cur_dx;
  }

  const FLOATER_DIST = 32;
  const FLOATER_SIZE = 16;
  const FLOAT_SCORE_TIME = 750;
  let floaters = [];
  function floatText(x, y, time, text, style) { // addFloater
    floaters.push({
      x, y, z: Z.FLOAT, style,
      text,
      t: 0,
      time,
    });
  }
  function drawFloaters(dt) {
    for (let ii = floaters.length - 1; ii >= 0; --ii) {
      let fl = floaters[ii];
      fl.t += dt;
      let y = fl.y - util.easeOut(fl.t / fl.time, 2) * FLOATER_DIST;
      if (fl.t > fl.time) {
        floaters[ii] = floaters[floaters.length - 1];
        floaters.pop();
      } else {
        /*jshint bitwise:false*/
        let a = Math.min(1, (2 - 2 * fl.t / fl.time)) * 255 | 0;
        let style = glov_font.style(fl.style, {
          color: fl.style.color & 0xFFFFFF00 | a,
          outline_color: fl.style.outline_color & 0xFFFFFF00 | a,
        });
        font.drawSized(style, fl.x, y, fl.z, FLOATER_SIZE, fl.text);
      }
    }
  }

  let float_score_style = glov_font.style(null, {
    color: 0x00FF00ff,
    outline_width: 3,
    outline_color: 0x00000080,
    glow_xoffs: 3.25,
    glow_yoffs: 3.25,
    glow_inner: -2.5,
    glow_outer: 5,
    glow_color: 0x000000ff,
  });
  function addMoney(x, y, m) {
    score.money += m;
    x = board_x0 + x * board_tile_w - 15;
    y = board_y0 + y * board_tile_h;
    floatText(x, y, FLOAT_SCORE_TIME, `+\$${m}`, float_score_style);
  }

  let mouseover_card = null;
  function updatePlayer(dt) {
    let p = player;
    let dx = 0;
    let dy = 0;
    if (DEBUG) {
      if (glov_input.isKeyDown(key_codes.LEFT) || glov_input.isKeyDown(key_codes.A) || glov_input.isPadButtonDown(0, pad_codes.LEFT)) {
        dx = -1;
      } else if (glov_input.isKeyDown(key_codes.RIGHT) || glov_input.isKeyDown(key_codes.D) || glov_input.isPadButtonDown(0, pad_codes.RIGHT)) {
        dx = 1;
      }
      if (glov_input.isKeyDown(key_codes.UP) || glov_input.isKeyDown(key_codes.W) || glov_input.isPadButtonDown(0, pad_codes.UP)) {
        dy = -1;
      } else if (glov_input.isKeyDown(key_codes.DOWN) || glov_input.isKeyDown(key_codes.S) || glov_input.isPadButtonDown(0, pad_codes.DOWN)) {
        dy = 1;
      }
      if (glov_input.keyDownHit(key_codes.K)) {
        score.damage = player.max_health;
      }
      if (glov_input.keyDownHit(key_codes.W)) {
        spawns = [];
        enemies = [];
      }
    }
    let shield = 0;
    let weapons_active = { regular: true };
    for (let ii = cards_in_play.length - 1; ii >= 0 && !player_dead; --ii) {
      let card = cards_in_play[ii];
      let cdt = dt;
      while (card.effects.length && cdt > 0) {
        let e = card.effects[0];
        let portion = 1;
        let duration_old = e.duration;
        if (cdt >= e.duration) {
          portion = e.duration / cdt;
          cdt -= e.duration;
          e.duration = 0;
          card.effects.splice(0, 1);
        } else {
          e.duration -= cdt;
          cdt = 0;
        }
        let duration_new = e.duration;
        if (e.trigger_at) {
          let oldi = Math.floor((duration_old - 1) / e.trigger_at);
          let newi = Math.floor((duration_new - 1) / e.trigger_at);
          portion = oldi - newi;
        }
        // do effects
        if (e.dx) {
          dx += portion * e.dx;
        }
        if (e.hp) {
          score.damage = Math.max(0, score.damage - e.hp * portion);
        }
        if (e.draw) {
          for (let ii = 0; ii < e.draw * portion; ++ii) {
            sound_manager.play('draw3');
            draw(true);
          }
        }
        if (e.shield_grow) {
          shield = Math.max(shield, e.shield_grow * (1 - e.duration / SHIELD_GROW_TIME));
        }
        if (e.shield_shrink) {
          shield = Math.max(shield, e.shield_shrink * e.duration / SHIELD_SHRINK_TIME);
        }
        if (e.weapon) {
          weapons_active[e.weapon] = true;
        }
      }
      if (!card.effects.length) {
        discard.push(cards_in_play[ii].id);
        cards_in_play.splice(ii, 1);
      }
    }

    // accelerated player.dx to dx
    const player_accel = 0.005;
    player.dx = accelerate(player.dx, dx, dt, player_accel);
    player.dy = accelerate(player.dy, dy, dt, player_accel);

    p.x += player.dx * dt * player_speed;
    p.x = clamp(p.x, player_border_pad, board_w - player_border_pad);
    p.y += player.dy * dt * player_speed;
    p.y = clamp(p.y, board_h / 2 + player_border_pad, board_h - player_border_pad);

    // Check for collision vs bullets
    let player_hit = false;
    let dist = Math.max(player_vs_bullet_dist_sq, shield * shield);
    for (let jj = bullets.length - 1; jj >= 0 && !player_dead; --jj) {
      let b = bullets[jj];
      if (b.player) {
        continue;
      }
      if ((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) <= dist) {
        // kill bullet, take damage
        bullets[jj] = bullets[bullets.length - 1];
        bullets.pop();
        player_hit = true;
      }
    }
    // Check for collision vs enemies
    dist = Math.max(player_vs_enemy_dist_sq, shield * shield);
    for (let jj = enemies.length - 1; jj >= 0 && !player_dead; --jj) {
      let b = enemies[jj];
      if ((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) <= dist) {
        // kill enemy, take damage, score
        score.kills++;
        addMoney(b.x, b.y, MONEY_PER_HP * b.max_hp);
        enemies[jj] = enemies[enemies.length - 1];
        enemies.pop();
        player_hit = true;
      }
    }
    if (player_hit && !shield) {
      if (!hit_cooldown) {
        let blocked = false;
        for (let ii = 0; ii < cards_in_play.length; ++ii) {
          if (cards_in_play[ii].effects[0].guard) {
            blocked = true;
            discard.push(cards_in_play[ii].id);
            cards_in_play.splice(ii, 1);
            break;
          }
        }
        if (blocked) {
          sound_manager.play('react_block');
          hit_was_blocked = true;
        } else {
          sound_manager.play('damage_player');
          score.damage++;
          hit_was_blocked = false;
          if (score.damage === player.max_health) {
            sound_manager.play('destroyed_large');
            glov_engine.glov_particles.createSystem(particle_data.defs.explosion_player,
              [p.x * board_tile_w + board_x0, p.y * board_tile_h + board_y0, Z.PARTICLES]);
          }
        }
        hit_cooldown = player_hit_blink_time;
      }
    } else if (player_hit && shield) {
      sound_manager.play('shield_block');
    }

    let firing = !player_dead && (spawns.length || enemies.length); // && !DEBUG || DEBUG && glov_input.isKeyDown(key_codes.SPACE);
    for (let ii = 0; ii < weapons.length; ++ii) {
      let weapon = weapons[ii];
      let rdt = dt;
      while (rdt >= p.fire_countdowns[ii]) {
        if (firing && weapons_active[weapon]) {
          rdt -= p.fire_countdowns[ii];
          p.fire_countdowns[ii] = fire_delay[ii];
          fireWeapon(weapon, rdt - dt);
        } else {
          rdt = 0;
          p.fire_countdowns[ii] = 0;
          break;
        }
      }
      p.fire_countdowns[ii] -= rdt;
    }

    if (dt >= hit_cooldown) {
      hit_cooldown = 0;
      math_device.v4Copy(color_white, player.color);
    } else {
      hit_cooldown -= dt;
      math_device.v4Lerp(hit_was_blocked ? color_blue : color_red, color_white, 1 - hit_cooldown / player_hit_blink_time, player.color);
    }

    let x = board_x0 + p.x * board_tile_w;
    let y = board_y0 + p.y * board_tile_h;
    if (!player_dead) {
      draw_list.queue(sprites.player, x, y, Z.SPRITES, player.color,
        player_scale);
      if (!cards_in_play.length || cards_in_play.length === 1 && cards_in_play[0].id === 'react') {
        if (mouseover_card === 'move_left') {
          draw_list.queue(sprites.player, clamp(p.x - 2.25, player_border_pad, board_w - player_border_pad) * board_tile_w + board_x0, y /*- board_tile_w * 2*/, Z.SPRITES - 1, color_ghost, player_scale);
        } else if (mouseover_card === 'move_right') {
          draw_list.queue(sprites.player, clamp(p.x + 2.25, player_border_pad, board_w - player_border_pad) * board_tile_w + board_x0, y /*- board_tile_w * 2*/, Z.SPRITES - 1, color_ghost, player_scale);
        } else if (mouseover_card === 'zigzag') {
          let zx = clamp(p.x - 2.25 * 0.4, player_border_pad, board_w - player_border_pad);
          draw_list.queue(sprites.player, zx * board_tile_w + board_x0, y /*- board_tile_w * 2 * 0.4*/, Z.SPRITES - 1, color_ghost, player_scale);
          zx = clamp(zx + 2.25 * 0.4 * 2, player_border_pad, board_w - player_border_pad);
          draw_list.queue(sprites.player, zx * board_tile_w + board_x0, y /*- board_tile_w * 2 * 0.4 * 3*/, Z.SPRITES - 1, color_ghost, player_scale);
          zx = clamp(zx - 2.25 * 0.4, player_border_pad, board_w - player_border_pad);
          draw_list.queue(sprites.player, zx * board_tile_w + board_x0, y /*- board_tile_w * 2 * 0.4 * 4*/, Z.SPRITES - 1, color_ghost, player_scale);
        }
      }
    }

    if (shield > 0.1) {
      glov_ui.drawHollowCircle(x, y, Z.SPRITES - 1, shield * board_tile_w, 0.9, color_blue);
      glov_ui.drawCircle(x, y, Z.SPRITES - 2, shield * board_tile_w, 0.9, [0.5, 0.5, 1, 1]);
      glov_ui.drawCircle(x, y, Z.SPRITES + 5, shield * board_tile_w, 0.9, [0.5, 0.5, 1, 0.5]);
    }
  }
  let bullet_scale = math_device.v2Build(board_tile_w/2 * bullet_size / sprite_size, board_tile_h/2 * bullet_size / sprite_size);
  function updateBullets(dt) {
    for (let ii = bullets.length - 1; ii >= 0; --ii) {
      let b = bullets[ii];
      b.x = b.x + b.dx * dt;
      b.y = b.y + b.dy * dt;
      if (b.x < 0 || b.y < 0 || b.x >= board_w || b.y >= board_h) {
        bullets[ii] = bullets[bullets.length - 1];
        bullets.pop();
        continue;
      }
      draw_list.queue(b.player ? sprites.bullet_small : sprites.bullet_large,
        board_x0 + b.x * board_tile_w, board_y0 + b.y * board_tile_h, Z.SPRITES, b.player ? color_green : color_red,
        bullet_scale);
    }
  }


  function spawnDrones(mode, t) {
    let count = (mode === 2) ? 20 : 10;
    let delay = (mode === 2) ? 120 : 400;
    for (let ii = 0; ii < count; ++ii) {
      spawns.push({
        t: t + ii * delay,
        x:
          (mode === 0) ? board_w * 3/4 :
          (mode === 1) ? board_w * 1/4 :
          (mode === 2) ? board_w * 0.5 - ii * 0.3 :
          1,
        type: 'drone',
      });
    }
  }
  function spawnSnipers(t) {
    let count = 3;
    let delay = 1500;
    for (let ii = 0; ii < count; ++ii) {
      spawns.push({
        t: t + ii * delay,
        x: 1.5,
        type: 'sniper'
      });
      spawns.push({
        t: t + ii * delay,
        x: board_w - 1.5,
        type: 'sniper'
      });
    }
  }
  function spawnBombers(rand, t) {
    let x = board_w / 4  + board_w / 2 * rand.random();
    let count = 6;
    let delay = 400;
    for (let ii = 0; ii < count; ++ii) {
      spawns.push({
        t: t + ii * delay,
        x,
        offset: ii * delay,
        type: 'bomber'
      });
    }
  }
  function spawnOne(rand, type, t) {
    spawns.push({
      t,
      x: 1.25 + 0 * rand.random() * (board_w - 2.5),
      type,
    });
  }
  function spawnPair(type, t) {
    spawns.push({
      t,
      x: board_w / 4,
      type,
    });
    spawns.push({
      t,
      x: board_w * 3 / 4,
      type,
    });
  }

  function cardsToDeck() {
    deck = deck.concat(discard, hand, cards_in_play.map(function (c) {
      return c.id;
    }));
    discard = [];
    hand = [];
    cards_in_play = [];
    deck.sort(function (a, b) {
      let r = cards[a].tier - cards[b].tier;
      if (r) {
        return r;
      }
      return (a < b) ? -1 : (a > b) ? 1 : 0;
    });
  }

  function setupSpawns(seed, total_hp, time) {
    let rand = random_seed.create(seed);

    let options = [
      {
        weight: 4,
        hp: 10, delay: [1,3],
        fn: spawnDrones.bind(null, 0),
      },
      {
        weight: 4,
        hp: 10, delay: [1,3],
        fn: spawnDrones.bind(null, 1),
      },
      {
        weight: 4,
        hp: 20, delay: [0,2],
        fn: spawnDrones.bind(null, 2),
      },
      {
        weight: 6,
        hp: 12, delay: [2,4],
        fn: spawnBombers.bind(null, rand),
      },
      {
        weight: 4,
        hp: 24, delay: [5, 7],
        fn: spawnSnipers,
      },
      {
        weight: 1,
        hp: 20, delay: [5,10],
        fn: spawnOne.bind(null, rand, 'large1'),
      },
      {
        weight: 1,
        hp: 20, delay: [5,10],
        fn: spawnOne.bind(null, rand, 'large2'),
      },
      {
        weight: 0.5,
        hp: 40, delay: [10,20],
        fn: spawnPair.bind(null, 'large1'),
      },
      {
        weight: 0.5,
        hp: 40, delay: [10,20],
        fn: spawnPair.bind(null, 'large2'),
      },
    ];
    let weight = 0;
    for (let ii = 0; ii < options.length; ++ii) {
      weight += options[ii].weight;
    }
    let choices = [];
    let total_time = 0;
    while (total_hp > 0) {
      let r = rand.random() * weight;
      let idx = 0;
      while (true) {
        r -= options[idx].weight;
        if (r <= 0) {
          break;
        }
        idx++;
      }
      total_hp -= options[idx].hp;
      let delay = options[idx].delay;
      let this_time = rand.floatBetween(delay[0], delay[1]);
      total_time += this_time;
      choices.push([this_time, idx]);
    }
    let time_scale = time / total_time;
    console.log(`Total time = ${total_time}, time_scale=${time_scale}`);
    // sort by difficulty
    choices.sort(function (a, b) {
      return a[1] - b[1];
    });
    // randomly permute a bit
    for (let ii = 0; ii < choices.length - 1; ++ii) {
      let idx = ii + rand(Math.min(4, choices.length - ii - 1));
      let t = choices[ii];
      choices[ii] = choices[idx];
      choices[idx] = t;
    }
    // ensure no two identical things are next to each other
    for (let ii = 0; ii < choices.length - 1; ++ii) {
      if (choices[ii][1] === choices[ii+1][1]) {
        // find the next non-matching and put it in ii+1
        for (let jj = ii + 1; jj < choices.length; ++jj) {
          if (choices[jj][1] !== choices[ii + 1][1]) {
            let t = choices[ii + 1];
            choices[ii + 1] = choices[jj];
            choices[jj] = t;
            break;
          }
        }
      }
    }
    let t = 0;
    for (let ii = 0; ii < choices.length; ++ii) {
      options[choices[ii][1]].fn(t);
      t += choices[ii][0] * time_scale;
    }
  }

  let level_timestamp;
  let level_data = [
    ['level1b', 170, 40000],
    ['level2d', 200, 60000],
    ['level3', 300, 65000],
    ['level4', 400, 70000],
    ['level5', 500, 70000],
    ['level6', 600, 70000],
    ['level7', 800, 70000],
    ['level8', 1000, 70000],
  ];
  let level_num = 0;
  let max_levels = level_data.length;
  function initLevel(level_num) {
    spaceParamsInit();
    floaters = [];
    cardsToDeck();
    shuffle();
    while (draw()) {}
    player.x = board_w / 2;
    player.y = board_h - 0.5;
    player.dx = player.dy = 0;
    enemies = [];
    bullets = [];
    spawns = [];
    level_timestamp = 0;
    if (DEBUG && false) {
      let rand = random_seed.create('test');
      spawnOne(rand, 'drone', 0);
      spawnOne(rand, 'drone', 120000);
      // let rand = random_seed.create('test');
      // spawnDrones(0, 0);
      // spawnOne(rand, 'large1', 0);
      // spawnOne(rand, 'large1', 0);
      // spawnOne(rand, 'large1', 0);
      // spawnPair(rand, 'large2', 2000);
      //setupSpawns('level1a', 170, 40000);
    } else if (level_num === 0 && false) {
      // 178 HP
      let rand = random_seed.create('test');
      spawnDrones(0, 0);
      spawnDrones(1, 2000);
      spawnBombers(rand, 5000);
      spawnBombers(rand, 9000); // 4s between bombers looks good
      spawnDrones(2, 12000);
      spawnSnipers(12000);
      spawnDrones(0, 14000);
      spawnOne(rand, 'large2', 20000);
      spawnOne(rand, 'large1', 25000);
      spawnPair('large1', 35000);
    } else {
      setupSpawns(level_data[level_num][0], level_data[level_num][1], level_data[level_num][2]);
    }

    spawns.sort(function (a, b) {
      return b.t - a.t;
    });

    let total = 0;
    for (let ii = 0; ii < spawns.length; ++ii) {
      total += enemy_hps[enemy_types.indexOf(spawns[ii].type)];
    }
    console.log(`Level ${level_num} has ${total} HP in total`);

    player_dead = false;
    score.kills = score.damage = 0;
  }

  function linearY() {
    this.y = this.y0 + this.age * this.dy;
  }
  function sniperY() {
    this.y = this.y0 + this.age * this.dy + -Math.cos(this.age * 0.001) * 1;
  }
  function bomberX() {
    this.x = this.x0 + Math.sin(this.age * this.xperiod) * this.xscale;
  }
  function droneX(dt) {
    const drone_x_pad = 0.5;
    const drone_accel = 0.0000005;
    if (this.desired_dx > 0 && this.x >= board_w - drone_x_pad ||
      this.desired_dx < 0 && this.x <= drone_x_pad)
    {
      this.desired_dx *= -1;
    }
    this.dx = accelerate(this.dx, this.desired_dx, dt, drone_accel);
    this.x += this.dx * dt;
  }

  function fireDelayLinear() {
    return this.fire_delay;
  }

  function fireDelayBurst() {
    this.burst_state++;
    if (this.burst_state === 1) { // was 0
      return this.burst_high;
    }
    if (this.burst_state >= this.burst_count) {
      this.burst_state = 0;
    }
    return this.burst_low;
  }
  function fireDelayBurst3() {
    this.burst_state++;
    if (this.burst_state === 1) { // was 0
      return this.burst_high;
    }
    if (this.burst_state >= this.burst_count) {
      this.burst_state = 0;
    }
    if (this.burst_state % 3 !== 1) {
      return 0;
    }
    return this.burst_low;
  }

  function shootDown(b) {
    b.dy = this.bullet_speed;
  }
  function shootSniper(b) {
    let dx = player.x - b.x;
    let dy = player.y - b.y;
    let mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 0.001) {
      b.dx = dx / mag * this.bullet_speed;
      b.dy = dy / mag * this.bullet_speed;
    } else {
      b.dy = this.bullet_speed;
    }
  }
  const spread_angle = (90 - 15) / 180 * Math.PI;
  const spread_factor_x = Math.cos(spread_angle);
  const spread_factor_y = Math.sin(spread_angle);
  function shootSpread(b) {
    let idx = this.burst_state % 3;
    if (idx === 0) {
      b.dy = this.bullet_speed;
    } else {
      b.dx = this.bullet_speed * spread_factor_x * (idx * 2 - 3);
      b.dy = this.bullet_speed * spread_factor_y;
    }
  }

  function spawnEnemy(spawn) {
    let x = spawn.x;
    let y = spawn.y;
    let name = spawn.type;
    let e = {
      x,
      y,
      x0: x,
      y0: y,
      dy: 0.0005,
      xfn: null,
      yfn: linearY,
      name: name,
      age: 0,
      shoots: true,
      firedelayfn: fireDelayLinear,
      shootfn: shootDown,
      bullet_speed: 0.002,
      hp: enemy_hps[enemy_types.indexOf(name)],
      damage_sound: 'damage1',
      death_sound: 'destroyed_small',
      shoot_sound: 'shoot2',
      death_system: 'explosion',
    };
    switch (name) {
      case 'drone':
        e.shoots = false;
        e.xfn = droneX;
        e.desired_dx = ((x > board_w / 2) ? -1 : 1) * 0.0005;
        e.dx = e.desired_dx;
        e.death_sound = 'damage1';
        e.death_system = 'explosion_small';
        break;
      case 'bomber':
        e.xscale = (e.x < board_w / 2) ? 1 : -1;
        e.xperiod = 0.001;
        e.xfn = bomberX;
        e.fire_delay = Math.PI / e.xperiod;
        e.fire_countdown = e.fire_delay * 1 / 4 - spawn.offset;
        break;
      case 'sniper':
        e.xscale = (e.x < board_w / 2) ? 1 : -1;
        e.xperiod = 0.001;
        e.xfn = bomberX;
        e.yfn = sniperY;
        e.fire_delay = Math.PI * 2 / e.xperiod; // at peak
        e.fire_countdown = e.fire_delay * 3 / 4 + 250;
        e.shootfn = shootSniper;
        e.shoot_sound = 'shoot3';
        break;
      case 'large1':
        e.xscale = (randInt(2) * 2 - 1);
        e.xperiod = 0.0001;
        e.xfn = bomberX;
        e.dy *= 0.25;
        e.burst_high = 3000;
        e.burst_low = 120;
        e.burst_count = 10;
        e.burst_state = 0;
        e.firedelayfn = fireDelayBurst;
        e.death_sound = 'destroyed_large';
        e.shoot_sound = 'shoot4';
        break;
      case 'large2':
        e.xscale = (randInt(2) * 2 - 1);
        e.xperiod = 0.0001;
        e.xfn = bomberX;
        e.dy *= 0.20;
        e.burst_high = 1500;
        e.burst_low = 300;
        e.burst_count = 12;
        e.burst_state = 0;
        e.firedelayfn = fireDelayBurst3;
        e.shootfn = shootSpread;
        e.death_sound = 'destroyed_large';
        e.shoot_sound = 'shoot4';
        break;
    }
    e.max_hp = e.hp;
    if (e.shoots && !e.fire_countdown) {
      e.fire_countdown = e.firedelayfn();
    }
    enemies.push(e);
  }

  // let spawn_countdown = 100;
  // let spawn_delay = 2500;
  function updateEnemies(dt) {
    // if (dt >= spawn_countdown && !player_dead) {
    //   spawn_countdown = spawn_delay - (dt - spawn_countdown);
    //   let type = enemy_types[randInt(enemy_types.length)];
    //   //type = 'large2';
    //   spawnEnemy({ x: 0.75 + Math.random() * (board_w - 1.5), y: 0.5, type });
    // } else {
    //   spawn_countdown -= dt;
    // }
    level_timestamp += dt;
    while (spawns.length && level_timestamp >= spawns[spawns.length - 1].t) {
      let s = spawns.pop();
      s.y = s.y || -0.5; // (DEBUG ? 0.5 : -0.5);
      spawnEnemy(s);
    }

    for (let ii = enemies.length - 1; ii >= 0; --ii) {
      let e = enemies[ii];
      // do movement pattern
      e.age += dt;
      e.xfn(dt);
      e.yfn(dt);
      // check for bullet collision
      for (let jj = bullets.length - 1; jj >= 0 && !player_dead; --jj) {
        let b = bullets[jj];
        if (!b.player) {
          continue;
        }
        if ((b.x - e.x) * (b.x - e.x) + (b.y - e.y) * (b.y - e.y) <= enemy_vs_bullet_dist_sq) {
          // kill bullet
          bullets[jj] = bullets[bullets.length - 1];
          bullets.pop();
          e.hp = Math.max(0, e.hp - 1);
          e.blink_at = e.age;
          if (e.hp) {
            sound_manager.play(e.damage_sound);
          } else {
            sound_manager.play(e.death_sound);
            glov_engine.glov_particles.createSystem(particle_data.defs[e.death_system],
              [e.x * board_tile_w + board_x0, e.y * board_tile_h + board_y0, Z.PARTICLES]);
          }
        }
      }
      if (!e.hp) {
        score.kills++;
        addMoney(e.x, e.y, MONEY_PER_HP * e.max_hp);
      }
      if (!e.hp || e.y > board_h + 0.5) {
        enemies[ii] = enemies[enemies.length - 1];
        enemies.pop();
        continue;
      }
      // do firing
      if (e.shoots) {
        let rdt = dt;
        while (rdt >= e.fire_countdown) {
          rdt -= e.fire_countdown;
          e.fire_countdown = e.firedelayfn();
          if (e.x > 0.01 && e.x < board_w - 0.01 && e.y >= 0) {
            let b = {
              x: e.x,
              y: e.y,
              player: false,
              dx: 0,
              dy: 0,
            };
            e.shootfn(b);
            sound_manager.play(e.shoot_sound);
            bullets.push(b);
          }
        }
        e.fire_countdown -= rdt;
      }

      let x = board_x0 + e.x * board_tile_w;
      let y = board_y0 + e.y * board_tile_h;
      let color = color_white;
      if (e.blink_at) {
        let time_since_blink = e.age - e.blink_at;
        if (time_since_blink < enemy_hit_blink_time) {
          color = math_device.v4Lerp(color_white, color_red, 1 - time_since_blink / enemy_hit_blink_time);
        }
        // been damaged, show health bar
        let health_height = 6;
        let health_width = 32;
        let health_y = y - 24;
        glov_ui.drawRect(x - health_width / 2, health_y, x + health_width / 2, health_y + health_height, Z.SPRITES + 10, [0.5, 0, 0, 1]);
        glov_ui.drawRect(x - health_width / 2, health_y, x - health_width / 2 + health_width * e.hp / e.max_hp, health_y + health_height, Z.SPRITES + 11, [0, 0.5, 0, 1]);
      }
      draw_list.queue(sprites.enemies[e.name],
        x, y, Z.SPRITES, color,
        enemy_scale);
    }
  }

  function playCard(card_name) {
    let card = util.clone(cards[card_name]);
    card.total = 0;
    for (let ii = 0; ii < card.effects.length; ++ii) {
      card.total += card.effects[ii].duration;
    }
    cards_in_play.push(card);
    if (card.sound) {
      sound_manager.play(card.sound);
    }
  }

  let style_card_label = glov_font.style(null, {
    color: 0x000000ff,
    outline_width: 0,
    outline_color: 0x00000000,
    glow_xoffs: 0,
    glow_yoffs: 0,
    glow_inner: -2.5,
    glow_outer: 5,
    glow_color: 0xFFFFFFff,
  });

  let draw_countdown = 0;
  function drawCard(card, x, y, z, scale) {
    let pad = 0.05 * card_w * scale;
    let icon_w = card_w * scale - pad * 2;
    draw_list.queue(sprites.cards, x + pad, y + pad, z + 1, color_white,
      [icon_w, icon_w], sprites.cards.uidata.rects[card.sprite_idx]);
    let text_y = y + icon_w + pad;
    font.drawSizedAligned(style_card_label, x + pad, text_y,
      z, 12 * scale, glov_font.ALIGN.HVCENTERFIT, icon_w, y + card_h * scale - text_y, card.name);

    // Panel last, it eats clicks!
    glov_ui.panel({
      x,
      y,
      z,
      w: card_w * scale,
      h: card_h * scale,
    });
  }
  let money;
  let cards_for_sale;
  let level_won_saved;
  let level_won_is_victory;
  function genCardsForSale() {
    cards_for_sale = [];
    for (let ii = 0; ii < cards_by_tier.length; ++ii) {
      for (let jj = 0; jj < 2; ++jj) {
        let idx = randInt(cards_by_tier[ii].length);
        cards_for_sale.push(cards_by_tier[ii][idx]);
      }
    }
    level_won_saved.cards = util.clone(cards_for_sale);
  }
  function retryLevel() {
    if (level_num === 0) {
      // Just reset everything to defaults, no buying of anything
      score.money = 0;
      initLevel(level_num);
    } else {
      // revert money, go back to buying things
      cardsToDeck();
      //money = score.money = level_won_saved.money;
      money = score.money; // NOT restoring this
      deck = util.clone(level_won_saved.deck);
      level_won_is_victory = false;
      --level_num;
      genCardsForSale();
      game_state = levelWon;
    }
  }
  let style_hand_ui = glov_font.style(null, {
    color: 0xFFFFFFff,
    outline_width: 3,
    outline_color: 0x00000080,
    glow_xoffs: 3.25,
    glow_yoffs: 3.25,
    glow_inner: -2.5,
    glow_outer: 5,
    glow_color: 0x000000ff,
  });
  function drawInPlay(dt) {
    let hand_x0 = ui_x0;
    let in_play_y0 = game_height - hand_below_h - card_h + 12;

    if (player_dead) {
      if (glov_ui.buttonText({
        x: hand_x0 + 24,
        y: in_play_y0,
        font_height: 48,
        text: 'Retry level'
      })) {
        score.retries++;
        retryLevel();
      }
      return;
    }

    glov_ui.print(style_hand_ui, hand_x0, in_play_y0 - 40, Z.UI, 'IN PLAY');

    for (let ii = cards_in_play.length - 1; ii >= 0; --ii) {
      let x = hand_x0 + card_w * ii;
      let z = Z.UI + ii * 10;
      let card = cards_in_play[ii];
      let left = 0;
      for (let jj = 0; jj < card.effects.length; ++jj) {
        left += card.effects[jj].duration;
      }
      drawCard(card, x, in_play_y0, z, 1);
      glov_ui.drawRect(x, in_play_y0 + left / card.total * card_h, x + card_w, in_play_y0 + card_h, z + 2, [0, 0, 0, 0.5]);
    }

  }
  function drawHand(dt) {
    mouseover_card = null;
    let hand_x0 = HAND_BELOW ? board_x0 : ui_x0;
    let hand_y0 = game_height - (HAND_BELOW ? hand_below_h - 40 : card_h - 50 - 40 - 24);

    if (player_dead) {
      glov_ui.print(style_hand_ui, hand_x0 + 24, hand_y0 + card_h / 2 - 12, Z.UI, 'SHIP DESTROYED');
      return;
    }

    if (hand.length >= hand_size || !discard.length && !deck.length) {
      draw_countdown = DRAW_RATE;
    } else if (dt >= draw_countdown) {
      draw_countdown = DRAW_RATE - (dt - draw_countdown);
      draw();
    } else {
      draw_countdown -= dt;
    }

    glov_ui.print(style_hand_ui, hand_x0, hand_y0 - 38, Z.UI, 'HAND');

    for (let ii = hand.length - 1; ii >= 0; --ii) {
      let x = hand_x0 + card_w * ii;
      let y = hand_y0;
      let z = Z.UI + ii * 10;
      let bounds = {
        x,
        y,
        z,
        w: card_w,
        h: card_h,
      };
      let playme = glov_input.clickHit(bounds);
      if (ii < 9) {
        playme = playme || glov_input.keyDownHit(key_codes.NUMBER_1 + ii);
        font.drawSizedAligned(glov_font.styleColored(null, 0xAAAAAAff), x, y + bounds.h, z, 18, glov_font.ALIGN.HCENTER, bounds.w, 0,
          String.fromCharCode('1'.charCodeAt(0) + ii));
      }
      let scale = 1;
      if (playme || glov_input.isMouseOver(bounds)) {
        glov_ui.setMouseOver('card' + ii);
        mouseover_card = hand[ii];
        scale = 1.2;
        x -= (card_w * scale - card_w) / 2;
        y -= (card_h * scale - card_h) / 2;
        z += 20;
      }
      drawCard(cards[hand[ii]], x, y, z, scale); // eats clicks due to panel()

      if (playme) {
        let card = hand[ii];
        hand.splice(ii, 1);
        //discard.push(card); happens when leaving play
        playCard(card);
      }
    }

    {
      let style = glov_font.styleColored(style_hand_ui, 0xDDDDDDff);
      let x = hand_x0 + card_w * hand.length;
      let y = hand_y0;
      let message = 'Draw...';
      let text_x = x + 5;
      if (!discard.length && !deck.length) {
        message = 'No more cards';
        text_x += 15;
      } else if (hand.length >= hand_size) {
        message = 'Hand full';
        text_x += 15;
      }
      font.drawSizedAligned(style, text_x, y, Z.UI + 1, 24, glov_font.ALIGN.VCENTER, card_w, card_h,
        message);
      if (hand.length < hand_size && (discard.length || deck.length)) {
        glov_ui.drawRect(x, y + draw_countdown / DRAW_RATE * card_h, x + card_w, y + card_h, Z.UI, [0.5, 0.5, 0.5, 1]);
      }
    }
  }

  function drawBottomUI() {
    let x = ui_x0;
    let y = game_height - hand_below_h - card_h - 40;
    y-= 24;
    glov_ui.print(glov_font.style(null, {
      color: 0xFFFFFFff,
      outline_width: 3,
      outline_color: 0x00000080,
    }), x, y, Z.UI,
      `Cash: \$${score.money}    Level: ${level_num + 1} / ${max_levels}`);
    y -= 4;


    let xoffs = 90;
    x = board_x0 + xoffs;
    y = game_height - hand_below_h;
    let health_height = 24 + 8;
    let health_width = board_w * board_tile_w - xoffs;
    let health = player.max_health - score.damage;
    glov_ui.drawRect(x, y, x + health_width, y + health_height, Z.UI, [0.5, 0, 0, 1]);
    glov_ui.drawRect(x, y, x + health_width * health / player.max_health, y + health_height, Z.UI + 1, [0, 0.5, 0, 1]);
    glov_ui.print(glov_font.style(null, {
      color: 0xFFFFFFff,
      outline_width: 3,
      outline_color: 0x000000DD,
    }), x + 8, y + 4, Z.UI + 2,
      `Health: ${health} / ${player.max_health}`);
  }

  let space_params;
  const SPACE_W = 128;
  const SPACE_H = 64;
  spaceParamsInit = function() {
    space_params = [];
    let a = 0.75;
    for (let ii = 0; ii < sprites.space.length; ++ii) {
      let my_a = (ii === sprites.space.length - 1) ? a : Math.min(Math.random() * a, 0.66);
      a -= my_a;
      space_params.push({
        xoffs: Math.random() * SPACE_W,
        dx: (Math.random() * 2 - 1) * 0.0001,
        yoffs: Math.random() * SPACE_H,
        dy: -(0.001 + Math.random() * 0.010),
        a: my_a,
      });
    }
  };
  function drawBackground(dt) {
    draw_list.queue(sprites.white, board_x0, board_y0, Z.BACKGROUND, [0, 0, 0, 1], [board_tile_w * board_w, board_tile_h * board_h]);
    const SPACE_BUCKET = 'additive_nearest';
    let rect = [board_tile_w * board_w, board_tile_h * board_h];
    let texel_scale = SPACE_H / rect[1]; // texels per pixel
    let space_screen_w = texel_scale * rect[0]; // texels that fit
    for (let ii = 0; ii < space_params.length; ++ii) {
      let p = space_params[ii];
      p.xoffs += p.dx * dt;
      p.yoffs += p.dy * dt;
      draw_list.queue(sprites.space[ii], board_x0, board_y0, Z.BACKGROUND + 0.1 + ii * 0.1, [1,1,1,p.a], rect,
        [p.xoffs, p.yoffs, p.xoffs + space_screen_w, p.yoffs + SPACE_H], 0, SPACE_BUCKET);
    }
  }

  function gameplay(dt) {
    if (DEBUG && glov_input.isKeyDown(key_codes.LEFT_SHIFT)) {
      dt *= 3;
    }
    player_dead = score.damage >= player.max_health;
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    drawInPlay(dt);
    drawHand(dt);

    drawBottomUI(dt);

    drawFloaters(dt);

    drawBackground(dt);

    // game area border
    let xpos = [glov_camera.x0(), board_x0, board_x0 + board_tile_w * board_w, glov_camera.x1()];
    let ypos = [glov_camera.y0(), board_y0, board_y0 + board_tile_h * board_h, glov_camera.y1()];
    for (let ii = 0; ii < 3; ++ii) {
      for (let jj = 0; jj < 3; ++jj) {
        if (ii === 1 && jj === 1) {
          continue;
        }
        draw_list.queue(sprites.border, xpos[ii], ypos[jj], Z.BORDER, color_white,
          [xpos[ii + 1] - xpos[ii], ypos[jj + 1] - ypos[jj]], sprites.border.uidata.rects[ii + jj * 3]);
      }
    }
    // vignette
    let color = math_device.v4Lerp(color_black, color_red, clamp(hit_cooldown / player_hit_blink_time, 0, 1));
    draw_list.queue(sprites.vignette, board_x0, board_y0, Z.BORDER, color, [board_w * board_tile_w, board_h * board_tile_h], null, 0, 'alpha');

    let level_won = !spawns.length && !enemies.length && !bullets.length && !player_dead || DEBUG && false;
    if (level_won) {
      game_state = levelWonInit;
    }
  }

  function gameplayInit(dt) {
    initLevel(level_num);
    $('.screen').hide();
    $('#title').show();
    game_state = gameplay;
    gameplay(dt);
  }

  let style_victory = glov_font.style(null, {
    color: 0x80FF80ff,
    outline_width: 3,
    outline_color: 0x000000ff,
    glow_xoffs: 0,
    glow_yoffs: 0,
    glow_inner: 1,
    glow_outer: 5,
    glow_color: 0xFFFF00ff,
  });
  let style_retry = glov_font.style(null, {
    color: 0xFF8080ff,
    outline_width: 2,
    outline_color: 0x000000ff,
    glow_xoffs: 0,
    glow_yoffs: 0,
    glow_inner: 0,
    glow_outer: 0,
    glow_color: 0x000000ff,
  });

  levelWon = function() {
    /* jshint bitwise:false */
    let y = 20;
    glov_ui.drawRect(20, y, game_width - 20, y + 190, Z.UI - 1, [0.2, 0.2, 0.2, 1]);
    style_victory.glow_color = 0xFFFF0000 | (Math.abs(Math.sin(glov_engine.getFrameTimestamp() * 0.003)) * 255 | 0);
    font.drawSizedAligned(glov_font.styleColored(null, 0xAAAAAAff), 0, 28,
      Z.UI, 36, glov_font.ALIGN.HCENTERFIT, game_width, 0, `Level ${level_num+1} ${level_won_is_victory ? 'Complete' : 'Failed'}!`);
    font.drawSizedAligned(level_won_is_victory ? style_victory : style_retry, 0, 10,
      Z.UI, 96, glov_font.ALIGN.HVCENTERFIT, game_width, 200, level_won_is_victory ? 'VICTORY!' : 'RETRY LEVEL');
    y += 140;
    font.drawSizedAligned(glov_font.style(null, {
      color: 0xFFFF00ff,
      outline_width: 3,
      outline_color: 0x00000080,
    }), 0, y,
      Z.UI, 36, glov_font.ALIGN.HCENTERFIT, game_width, 0, `Cash: \$${money}`);
    y += 50;
    y += 20;
    glov_ui.drawRect(20, y, game_width - 20, game_height - 20, Z.UI - 1, [0.2, 0.2, 0.2, 1]);
    y += 20;

    let x = 40;
    const section_style = glov_font.style(null, {
      outline_width: 3,
      outline_color: 0x00000080,
      color: 0xFFFFFFff
    });

    if (level_num + 1 === max_levels) {
      y += 36 + 8;
      font.drawSizedAligned(section_style, 0, y,
        Z.UI, 36, glov_font.ALIGN.HCENTERFIT, game_width, 0, 'All levels complete!');
      y += 36 + 8;
      font.drawSizedAligned(section_style, 0, y,
        Z.UI, 36, glov_font.ALIGN.HCENTERFIT, game_width, 0, 'Thanks for playing!');
      y += 36 + 8;
      y += 36 + 8;
      font.drawSizedAligned(section_style, 0, y,
        Z.UI, 36, glov_font.ALIGN.HCENTERFIT, game_width, 0, `Deaths: ${score.retries}`);
      y += 36 + 8;
      font.drawSizedAligned(section_style, 0, y,
        Z.UI, 36, glov_font.ALIGN.HCENTERFIT, game_width, 0, `Total Cash Earned: \$${score.money_total}`);
      y += 36 + 8;
      return;
    }

    font.drawSized(section_style, x, y, Z.UI, 36, 'BUY NEW CARDS:');
    y += 36 + 8;
    let scale = 1.5;
    for (let ii = 0; ii < cards_for_sale.length; ++ii) {
      let cost = COST_BY_TIER[cards[cards_for_sale[ii]].tier];
      let afford = cost <= money;
      let xx = x + (card_w * scale + 8) * ii;
      let yy = y;
      let z = Z.UI + ii * 10;
      let bounds = {
        x: xx,
        y: yy,
        z,
        w: card_w * scale,
        h: card_h * scale,
      };
      let buyme = afford && glov_input.clickHit(bounds);
      let extra_scale = 1.0;
      let price_offs = 6;
      if (buyme || afford && glov_input.isMouseOver(bounds)) {
        glov_ui.setMouseOver('card' + ii);
        extra_scale = 1.2;
        z += 20;
        price_offs += 8;
      }
      if (!afford) {
        glov_ui.drawRect(bounds.x, bounds.y, bounds.x + bounds.w, bounds.y + bounds.h, z + 5, [0, 0, 0, 0.5]);
      }
      font.drawSizedAligned(glov_font.styleColored(null, afford ? 0xFFFF00ff : 0x800000ff), xx, yy + card_h * scale + price_offs,
        Z.UI, 24, glov_font.ALIGN.HCENTERFIT, card_w * scale, 0, `\$${cost}`);
      xx -= (card_w * scale * extra_scale - card_w * scale ) / 2;
      yy -= (card_h * scale  * extra_scale - card_h * scale ) / 2;
      drawCard(cards[cards_for_sale[ii]], xx, yy, z, scale * extra_scale); // eats clicks due to panel()
      if (buyme) {
        glov_ui.playUISound('button_click');
        money -= cost;
        deck.push(cards_for_sale[ii]);
        cards_for_sale.splice(ii, 1);
      }
    }
    y += card_h * scale + 40;
    font.drawSized(section_style, x, y, Z.UI, 36, `YOUR DECK - ${deck.length > 5 ? 'click to trash:' : '5 cards minimum'}`);
    y += 36 + 8;
    let afford = TRASH_COST <= money && (deck.length > 5);
    scale = 1.0;
    let xmod = 0;
    for (let ii = 0; ii < deck.length; ++ii) {
      let xx = x + (card_w * scale + 8) * ii - xmod;
      if (xx + card_w * scale > game_width - 20) {
        y += card_h * scale + 40;
        xmod += xx - x;
        xx = x;
      }
      let yy = y;
      let z = Z.UI + ii * 10;
      let bounds = {
        x: xx,
        y: yy,
        z,
        w: card_w * scale,
        h: card_h * scale,
      };
      let trashme = afford && glov_input.clickHit(bounds);
      let extra_scale = 1.0;
      let price_offs = 6;
      if (trashme || afford && glov_input.isMouseOver(bounds)) {
        glov_ui.setMouseOver('trashcard' + ii);
        extra_scale = 1.2;
        z += 20;
        price_offs += 8;
      }
      if (!afford) {
        glov_ui.drawRect(bounds.x, bounds.y, bounds.x + bounds.w, bounds.y + bounds.h, z + 5, [0, 0, 0, 0.5]);
      }
      font.drawSizedAligned(glov_font.styleColored(null, afford ? 0xFFFF00ff : 0x800000ff), xx, yy + card_h * scale + price_offs,
        Z.UI, 24, glov_font.ALIGN.HCENTERFIT, card_w * scale, 0, `\$${TRASH_COST}`);
      xx -= (card_w * scale * extra_scale - card_w * scale ) / 2;
      yy -= (card_h * scale  * extra_scale - card_h * scale ) / 2;
      drawCard(cards[deck[ii]], xx, yy, z, scale * extra_scale); // eats clicks due to panel()
      if (trashme) {
        glov_ui.playUISound('button_click');
        money -= TRASH_COST;
        deck.splice(ii, 1);
      }
    }

    if (money !== level_won_saved.money &&  glov_ui.buttonText({
      x: game_width / 2 - 400 - 20,
      y: game_height - 64 - 40,
      font_height: 48,
      text: 'UNDO'
    })) {
      money = level_won_saved.money;
      cards_for_sale = util.clone(level_won_saved.cards);
      deck = util.clone(level_won_saved.deck);
    }

    if (glov_ui.buttonText({
      x: game_width / 2 + 20,
      y: game_height - 64 - 40,
      font_height: 48,
      text: 'Next Level'
    })) {
      level_num++;
      game_state = gameplayInit;
      score.money = money;
    }
  };

  levelWonInit = function (dt) {
    cardsToDeck();
    level_won_is_victory = true;
    game_state = levelWon;
    money = score.money;
    if (DEBUG && false) {
      money += 875;
    }
    let new_money = money;
    if (level_won_saved) {
      new_money -= level_won_saved.money;
    }
    score.money_total += new_money;
    level_won_saved = {
      deck: util.clone(deck),
      money: money,
    };
    genCardsForSale();
    levelWon(dt);
  };

  function loading() {
    let load_count = glov_sprite.loading() + sound_manager.loading();
    $('#loading').text(`Loading (${load_count})...`);
    if (!load_count) {
      game_state = gameplayInit;
    }
  }

  function loadingInit() {
    initGraphics();
    $('.screen').hide();
    $('#title').show();
    game_state = loading;
    loading();
  }

  game_state = loadingInit;

  function tick(dt) {
    game_state(dt);
  }

  loadingInit();
  glov_engine.go(tick);
}
