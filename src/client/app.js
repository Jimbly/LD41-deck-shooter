/*jshint noempty:false*/

/*global $: false */
/*global math_device: false */
/*global assert: false */
/*global Z: false */

const local_storage = require('./local_storage.js');
local_storage.storage_prefix = 'turbulenz-LD41';
const util = require('./glov/util.js');
window.Z = window.Z || {};
Z.BACKGROUND = 0;
Z.SPRITES = 10;
Z.FLOAT = 100;

const DEBUG = window.location.toString().indexOf('localhost') !== -1;

let levelWon;
let levelWonInit;

// Balance params
const DRAW_RATE = 2000;
const COST_BY_TIER = [100, 300, 800];
const TRASH_COST = 250;
const MONEY_PER_HP = 5;

// Virtual viewport for our game logic
const game_width = 1280;
const game_height = 1024;

function clamp(v, mn, mx) {
  return Math.min(Math.max(v, mn), mx);
}

export function main(canvas)
{
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

  const color_white = math_device.v4Build(1, 1, 1, 1);
  const color_red = math_device.v4Build(1, 0, 0, 1);
  const color_green = math_device.v4Build(0, 1, 0, 1);
  const color_blue = math_device.v4Build(0, 0, 1, 1);
  //const color_yellow = math_device.v4Build(1, 1, 0, 1);

  // Cache key_codes
  const key_codes = glov_input.key_codes;
  const pad_codes = glov_input.pad_codes;

  let game_state;

  let level_num = 0;
  let enemy_types = ['drone', 'bomber', 'sniper', 'large1', 'large2'];
  let enemy_hps = [1, 2, 4, 20, 20];
  let sprites = {};
  const sprite_size = 32;
  const bullet_size = 8;
  function initGraphics() {
    if (sprites.white) {
      return;
    }

    sound_manager.loadSound('test');

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
    sprites.player = loadSprite('player.png', sprite_size, sprite_size);
    sprites.enemies = {};
    for (let ii = 0; ii < enemy_types.length; ++ii) {
      sprites.enemies[enemy_types[ii]] = loadSprite(`enemy_${enemy_types[ii]}.png`, sprite_size, sprite_size);
    }
    sprites.bullet_small = loadSprite('bullet_small.png', bullet_size, bullet_size);
    sprites.bullet_large = loadSprite('bullet_large.png', bullet_size, bullet_size);

    sprites.cards = glov_ui.loadSpriteRect('cards.png', [13, 13, 13], [13, 13, 13, 13]);

    sprites.game_bg = loadSprite('white', 1, 1, {
      width : game_width,
      height : game_height,
      origin: [0, 0],
    });
  }

  const player_speed = 0.002;
  const ZIGZAG = 300;
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
          duration: 1000,
          dx: -1,
        },
      ],
      sprite_idx: 0,
    },
    move_right: {
      name: 'MOVE RIGHT',
      effects: [
        {
          duration: 1000,
          dx: 1,
        },
      ],
      sprite_idx: 1,
    },
    zigzag: {
      name: 'ZIG-ZAG',
      effects: [
        {
          duration: ZIGZAG,
          dx: -1,
        },
        {
          duration: ZIGZAG * 2,
          dx: 1.2,
        },
        {
          duration: ZIGZAG * 1.5,
          dx: -1,
        },
      ],
      sprite_idx: 2,
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
          duration: 2000,
          weapon: 'beam',
        }
      ],
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
  if (!DEBUG) {
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
    deck.push('zigzag');
    deck.push('move_left');
    deck.push('move_right');
    // deck.push('repair');
    // deck.push('shield');
    // deck.push('react');
    // deck.push('draw3');
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
  let board_tile_h = game_height / board_h;
  let board_tile_w = board_tile_h;
  let board_x0 = board_tile_w / 2;
  let board_y0 = game_height - board_tile_h * board_h;
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
    }
    if (weapon === 'spread') {
      playerAddBullet(dt, player.bullet_speed * player_spread_factor_x * -1,
        -player.bullet_speed * player_spread_factor_y);
      playerAddBullet(dt, -player.bullet_speed * player_spread_factor_x * -1,
        -player.bullet_speed * player_spread_factor_y);
    }
    if (weapon === 'rapid') {
      playerAddBullet(dt, 0, -player.bullet_speed, -0.22, 0.05);
      playerAddBullet(dt, 0, -player.bullet_speed, 0.22, 0.05);
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
  });
  function addMoney(x, y, m) {
    score.money += m;
    x = board_x0 + x * board_tile_w - 15;
    y = board_y0 + y * board_tile_h;
    floatText(x, y, FLOAT_SCORE_TIME, `+\$${m}`, float_score_style);
  }

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
          hit_was_blocked = true;
        } else {
          score.damage++;
          hit_was_blocked = false;
        }
        hit_cooldown = player_hit_blink_time;
      }
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

  function spawnDrones(spawns, t, mode) {
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
  function spawnSnipers(spawns, t) {
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
  function spawnBombers(spawns, t) {
    let x = board_w / 4  + board_w / 2 * Math.random();
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
  function spawnOne(spawns, t, type) {
    spawns.push({
      t,
      x: 0.75 + Math.random() * (board_w - 1.5),
      type,
    });
  }
  function spawnPair(spawns, t, type) {
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

  let level_timestamp;
  let max_levels = 2;
  function initLevel(level_num) {
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
    if (DEBUG) {
      spawnDrones(spawns, 0, 0);
      spawnOne(spawns, 0, 'large1');
      spawnOne(spawns, 0, 'large1');
      spawnOne(spawns, 0, 'large1');
      spawnPair(spawns, 2000, 'large2');
    } else if (level_num === 0) {
      // 178 HP
      spawnDrones(spawns, 0, 0);
      spawnDrones(spawns, 2000, 1);
      spawnBombers(spawns, 5000);
      spawnBombers(spawns, 9000); // 4s between bombers looks good
      spawnDrones(spawns, 12000, 2);
      spawnSnipers(spawns, 12000);
      spawnDrones(spawns, 14000, 0);
      spawnOne(spawns, 20000, 'large2');
      spawnOne(spawns, 25000, 'large1');
      spawnPair(spawns, 35000, 'large1');
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
    };
    switch (name) {
      case 'drone':
        e.shoots = false;
        e.xfn = droneX;
        e.desired_dx = ((x > board_w / 2) ? -1 : 1) * 0.0005;
        e.dx = e.desired_dx;
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
  }

  let draw_countdown = 0;
  let card_h = 120;
  let card_w = (2.5/3.5) * card_h;
  function drawCard(card, x, y, z, scale) {
    let color = 0x000000ff;
    let pad = 0.05 * card_w * scale;
    let icon_w = card_w * scale - pad * 2;
    draw_list.queue(sprites.cards, x + pad, y + pad, z + 1, color_white,
      [icon_w, icon_w], sprites.cards.uidata.rects[card.sprite_idx]);
    let text_y = y + icon_w + pad;
    font.drawSizedAligned(glov_font.styleColored(null, color), x + pad, text_y,
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
      money = score.money = level_won_saved.money;
      deck = util.clone(level_won_saved.deck);
      level_won_is_victory = false;
      --level_num;
      genCardsForSale();
      game_state = levelWon;
    }
  }
  function drawHand(dt) {
    let hand_x0 = ui_x0;
    let hand_y0 = game_height - card_h - 50 - 40 - 24;
    let in_play_y0 = hand_y0 - card_h - 50;

    if (player_dead) {
      glov_ui.print(null, hand_x0 + 24, hand_y0 + card_h / 2 - 12, Z.UI, 'SHIP DESTROYED');
      if (glov_ui.buttonText({
        x: hand_x0 + 24,
        y: hand_y0 - 80,
        font_height: 48,
        text: 'Retry level'
      })) {
        score.retries++;
        retryLevel();
      }
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

    glov_ui.print(null, hand_x0, in_play_y0 - 40, Z.UI, 'IN PLAY');

    glov_ui.print(null, hand_x0, hand_y0 - 40, Z.UI, 'HAND');

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
      let playme = glov_input.clickHit(bounds) || glov_input.keyDownHit(key_codes.NUMBER_1 + ii);
      font.drawSizedAligned(glov_font.styleColored(null, 0xAAAAAAff), x, y + bounds.h, z, 18, glov_font.ALIGN.HCENTER, bounds.w, 0,
        String.fromCharCode('1'.charCodeAt(0) + ii));
      let scale = 1;
      if (playme || glov_input.isMouseOver(bounds)) {
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
      let style = glov_font.styleColored(null, 0xDDDDDDff);
      let x = ui_x0 + card_w * hand.length;
      let y = hand_y0;
      let message = 'Draw...';
      let text_x = x + 5;
      if (hand.length >= hand_size) {
        message = 'Hand full';
        text_x += 15;
      } else if (!discard.length && !deck.length) {
        message = 'No more cards';
        text_x += 15;
      }
      font.drawSizedAligned(style, text_x, y, Z.UI + 1, 24, glov_font.ALIGN.VCENTER, card_w, card_h,
        message);
      if (hand.length < hand_size && (discard.length || deck.length)) {
        glov_ui.drawRect(x, y + draw_countdown / DRAW_RATE * card_h, x + card_w, y + card_h, Z.UI, [0.5, 0.5, 0.5, 1]);
      }
    }

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

  function drawBottomUI() {
    let y = game_height - 16;
    y-= 24;
    glov_ui.print(glov_font.styleColored(null, 0xFFFFFFff), ui_x0, y, Z.UI,
      `Cash: \$${score.money}    Level: ${level_num + 1} / ${max_levels}`);
    y -= 4;
    let health_height = 24 + 8;
    let health_width = 400;
    let health = player.max_health - score.damage;
    y -= health_height;
    glov_ui.drawRect(ui_x0, y, ui_x0 + health_width, y + health_height, Z.UI, [0.5, 0, 0, 1]);
    glov_ui.drawRect(ui_x0, y, ui_x0 + health_width * health / player.max_health, y + health_height, Z.UI + 1, [0, 0.5, 0, 1]);
    glov_ui.print(glov_font.styleColored(null, 0xFFFFFFff), ui_x0 + 8, y + 4, Z.UI + 2,
      `Health: ${health} / ${player.max_health}`);
  }

  function gameplay(dt) {
    player_dead = score.damage >= player.max_health;
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    drawHand(dt);

    drawBottomUI(dt);

    drawFloaters(dt);

    // game area background
    draw_list.queue(sprites.white, board_x0, board_y0, Z.BACKGROUND + 1, [0, 0, 0, 1], [board_tile_w * board_w, board_tile_h * board_h]);

    // left of game area
    draw_list.queue(sprites.white, glov_camera.x0(), glov_camera.y0(), Z.SPRITES + 9, [0.2, 0.2, 0.2, 1], [board_x0 - glov_camera.x0(), glov_camera.y1() - glov_camera.y0()]);
    // right of game area
    draw_list.queue(sprites.white, board_x0 + board_tile_w * board_w, glov_camera.y0(), Z.SPRITES + 9, [0.2, 0.2, 0.2, 1], [1e9, glov_camera.y1() - glov_camera.y0()]);
    // bottom
    draw_list.queue(sprites.white, glov_camera.x0(), board_y0 + board_tile_h * board_h, Z.SPRITES + 9, [0.2, 0.2, 0.2, 1], [1e9, 1e9]);
    // top
    draw_list.queue(sprites.white, glov_camera.x0(), glov_camera.y0(), Z.SPRITES + 9, [0.2, 0.2, 0.2, 1], [1e9, board_y0 - glov_camera.y0()]);

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

  levelWon = function() {
    let y = 20;
    glov_ui.drawRect(20, y, game_width - 20, y + 180, Z.UI - 1, [0.2, 0.2, 0.2, 1]);
    font.drawSizedAligned(glov_font.styleColored(null, 0xAAAAAAff), 0, 28,
      Z.UI, 36, glov_font.ALIGN.HCENTERFIT, game_width, 0, `Level ${level_num+1} ${level_won_is_victory ? 'Complete' : 'Failed'}!`);
    font.drawSizedAligned(glov_font.styleColored(null, level_won_is_victory ? 0x80FF80ff : 0xFF8080ff), 0, 0,
      Z.UI, 96, glov_font.ALIGN.HVCENTERFIT, game_width, 200, level_won_is_victory ? 'VICTORY!' : 'RETRY LEVEL');
    y += 130;
    font.drawSizedAligned(glov_font.styleColored(null, 0xFFFF00ff), 0, y,
      Z.UI, 36, glov_font.ALIGN.HCENTERFIT, game_width, 0, `Cash: \$${money}`);
    y += 50;
    y += 20;
    glov_ui.drawRect(20, y, game_width - 20, game_height - 20, Z.UI - 1, [0.2, 0.2, 0.2, 1]);
    y += 20;

    let x = 40;
    const section_style = glov_font.styleColored(null, 0xFFFFFFff);

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
        money -= cost;
        deck.push(cards_for_sale[ii]);
        cards_for_sale.splice(ii, 1);
      }
    }
    y += card_h * scale + 40;
    font.drawSized(section_style, x, y, Z.UI, 36, `YOUR DECK (minimum 5 cards) click to trash:`);
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
        money -= TRASH_COST;
        deck.splice(ii, 1);
      }
    }

    if (money !== level_won_saved.money &&  glov_ui.buttonText({
      x: game_width / 2 - 400 - 20,
      y: game_height - 64 - 80,
      font_height: 48,
      text: 'UNDO'
    })) {
      money = level_won_saved.money;
      cards_for_sale = util.clone(level_won_saved.cards);
      deck = util.clone(level_won_saved.deck);
    }

    if (glov_ui.buttonText({
      x: game_width / 2 + 20,
      y: game_height - 64 - 80,
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
    if (level_num > 0) {
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
