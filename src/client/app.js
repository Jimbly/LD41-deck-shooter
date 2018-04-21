/*jshint noempty:false*/

/*global $: false */
/*global math_device: false */
/*global assert: false */
/*global Z: false */

const local_storage = require('./local_storage.js');
local_storage.storage_prefix = 'turbulenz-playground';
window.Z = window.Z || {};
Z.BACKGROUND = 0;
Z.SPRITES = 10;

// Virtual viewport for our game logic
const game_width = 720;
const game_height = 1280;

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
  // const glov_camera = glov_engine.glov_camera;
  const glov_input = glov_engine.glov_input;
  const glov_sprite = glov_engine.glov_sprite;
  const glov_ui = glov_engine.glov_ui;
  const draw_list = glov_engine.draw_list;
  // const font = glov_engine.font;


  const loadTexture = glov_sprite.loadTexture.bind(glov_sprite);
  const createSprite = glov_sprite.createSprite.bind(glov_sprite);

  glov_ui.bindSounds(sound_manager, {
    button_click: 'button_click',
    rollover: 'rollover',
  });

  const color_white = math_device.v4Build(1, 1, 1, 1);
  const color_red = math_device.v4Build(1, 0, 0, 1);
  const color_green = math_device.v4Build(0, 1, 0, 1);
  const color_yellow = math_device.v4Build(1, 1, 0, 1);

  // Cache key_codes
  const key_codes = glov_input.key_codes;
  const pad_codes = glov_input.pad_codes;

  let game_state;

  let sprites = {};
  const sprite_size = 32;
  const bullet_size = 8;
  function initGraphics() {
    if (sprites.white) {
      return;
    }

    sound_manager.loadSound('test');

    sprites.white = createSprite('white', {
      width : 1,
      height : 1,
      x : 0,
      y : 0,
      rotation : 0,
      color : math_device.v4Build(1,1,1,1),
      origin: math_device.v2Build(0, 0),
      textureRectangle : math_device.v4Build(0, 0, 1, 1)
    });

    sprites.player = createSprite('player.png', {
      width : 1,
      height : 1,
      rotation : 0,
      color : [1,1,1,1],
      textureRectangle : math_device.v4Build(0, 0, sprite_size, sprite_size)
    });
    sprites.enemies = [];
    for (let ii = 0; ii < 1; ++ii) {
      sprites.enemies[ii] = createSprite(`enemy0${ii}.png`, {
        width : 1,
        height : 1,
        rotation : 0,
        color : [1,1,1,1],
        textureRectangle : math_device.v4Build(0, 0, sprite_size, sprite_size)
      });
    }
    sprites.bullet_small = createSprite(`bullet_small.png`, {
      width : 1,
      height : 1,
      rotation : 0,
      color : [1,1,1,1],
      textureRectangle : math_device.v4Build(0, 0, bullet_size, bullet_size)
    });
    sprites.bullet_large = createSprite(`bullet_large.png`, {
      width : 1,
      height : 1,
      rotation : 0,
      color : [1,1,1,1],
      textureRectangle : math_device.v4Build(0, 0, bullet_size, bullet_size)
    });

    sprites.game_bg = createSprite('white', {
      width : game_width,
      height : game_height,
      x : 0,
      y : 0,
      rotation : 0,
      color : [0, 0.72, 1, 1],
      origin: [0, 0],
      textureRectangle : math_device.v4Build(0, 0, sprite_size, sprite_size)
    });
  }

  let score = {
    kills: 0,
    damage: 0,
  };
  let board = {
    w: 5,
    h: 10,
  };
  let bullets = [];
  let board_tile_h = game_height / board.h;
  let board_tile_w = board_tile_h;
  let board_x0 = (game_width - board_tile_w * board.w) / 2;
  let board_y0 = game_height - board_tile_h * board.h;
  let player = {
    x : board.w / 2,
    y : board.h - 0.5,
    color: math_device.v4Copy(color_white),
    bullet_speed: 0.005,
    fire_countdown: 0,
    fire_delay: 60 * 4,
  };
  let player_scale = math_device.v2Build(board_tile_w/2, board_tile_h/2);
  let enemy_scale = math_device.v2Build(board_tile_w/2, board_tile_h/2);
  let player_radius_sq = 0.25*0.25;
  let enemy_radius_sq = 0.25*0.25;
  let hit_cooldown = 0;
  let hit_blink_time = 250;
  let player_border_pad = 0.25;
  function updatePlayer(dt) {
    let p = player;
    let dx = 0;
    let dy = 0;
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

    p.x += dx * dt * 0.002;
    p.x = clamp(p.x, player_border_pad, board.w - player_border_pad);
    p.y += dy * dt * 0.002;
    p.y = clamp(p.y, board.h / 2 + player_border_pad, board.h - player_border_pad);

    for (let jj = bullets.length - 1; jj >= 0; --jj) {
      let b = bullets[jj];
      if (b.player) {
        continue;
      }
      if ((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) <= player_radius_sq) {
        // kill bullet, take damage
        bullets[jj] = bullets[bullets.length - 1];
        bullets.pop();
        score.damage++;
        hit_cooldown = hit_blink_time;
      }
    }

    let firing = true; // glov_input.isKeyDown(key_codes.SPACE);
    if (dt >= p.fire_countdown) {
      if (firing) {
        p.fire_countdown = p.fire_delay - (dt - p.fire_countdown);
        bullets.push({
          x: p.x,
          y: p.y,
          player: true,
          dx: 0,
          dy: -p.bullet_speed,
        });
      } else {
        p.fire_countdown = 0;
      }
    } else {
      p.fire_countdown -= dt;
    }

    if (dt >= hit_cooldown) {
      hit_cooldown = 0;
      math_device.v4Copy(color_white, player.color);
    } else {
      hit_cooldown -= dt;
      math_device.v4Lerp(color_red, color_white, 1 - hit_cooldown / hit_blink_time, player.color);
    }

    draw_list.queue(sprites.player, board_x0 + p.x * board_tile_w, board_y0 + p.y * board_tile_h, Z.SPRITES, player.color,
      player_scale);
  }
  let bullet_scale = math_device.v2Build(board_tile_w/2 * bullet_size / sprite_size, board_tile_h/2 * bullet_size / sprite_size);
  function updateBullets(dt) {
    for (let ii = bullets.length - 1; ii >= 0; --ii) {
      let b = bullets[ii];
      b.x = b.x + b.dx * dt;
      b.y = b.y + b.dy * dt;
      if (b.x < 0 || b.y < 0 || b.x >= board.w || b.y >= board.h) {
        bullets[ii] = bullets[bullets.length - 1];
        bullets.pop();
        continue;
      }
      draw_list.queue(b.player ? sprites.bullet_large : sprites.bullet_large,
        board_x0 + b.x * board_tile_w, board_y0 + b.y * board_tile_h, Z.SPRITES, b.player ? color_green : color_red,
        bullet_scale);
    }
  }

  let enemies = [];
  let spawn_countdown = 100;
  let spawn_delay = 1000;
  function updateEnemies(dt) {
    if (dt >= spawn_countdown) {
      spawn_countdown = spawn_delay - (dt - spawn_countdown);
      enemies.push({
        x0: 0.75 + Math.random() * (board.w - 1.5),
        y0: -0.5,
        dy: 0.0005,
        p: 0.001,
        m: 1,
        idx: 0,
        age: 0,
        fire_countdown: 1000,
        fire_delay: 1000,
        bullet_speed: 0.002,
      });
    } else {
      spawn_countdown -= dt;
    }
    for (let ii = enemies.length - 1; ii >= 0; --ii) {
      let e = enemies[ii];
      // do movement pattern
      e.age += dt;
      e.x = e.x0 + Math.sin(e.age * e.p) * e.m;
      e.y = e.y0 + e.age * e.dy;
      // check for bullet collision
      let killme = false;
      for (let jj = bullets.length - 1; jj >= 0; --jj) {
        let b = bullets[jj];
        if (!b.player) {
          continue;
        }
        if ((b.x - e.x) * (b.x - e.x) + (b.y - e.y) * (b.y - e.y) <= enemy_radius_sq) {
          killme = true;
          // kill bullet too
          bullets[jj] = bullets[bullets.length - 1];
          bullets.pop();
        }
      }
      if (killme) {
        score.kills++;
      }
      if (e.y > board.h + 0.5) {
        killme = true;
      }
      if (killme) {
        enemies[ii] = enemies[enemies.length - 1];
        enemies.pop();
        continue;
      }
      // do firing
      if (dt >= e.fire_countdown) {
        e.fire_countdown = e.fire_delay - (dt - e.fire_countdown);
        if (e.x > 0.01 && e.x < board.w - 0.01) {
          bullets.push({
            x: e.x,
            y: e.y,
            player: false,
            dx: 0,
            dy: e.bullet_speed,
          });
        }
      } else {
        e.fire_countdown -= dt;
      }

      draw_list.queue(sprites.enemies[e.idx],
        board_x0 + e.x * board_tile_w, board_y0 + e.y * board_tile_h, Z.SPRITES, color_white,
        enemy_scale);
    }
  }

  function test(dt) {
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);

    glov_ui.print(glov_font.styleColored(null, 0x000000ff), 100, game_height - 60, Z.SPRITES + 1,
      `Enemies killed: ${score.kills}`);
    glov_ui.print(glov_font.styleColored(null, 0x000000ff), 100, game_height - 40, Z.SPRITES + 1,
      `Hits taken: ${score.damage}`);

    draw_list.queue(sprites.white, board_x0, board_y0, Z.BACKGROUND + 1, [0, 0.72, 1, 1], [board_tile_w * board.w, board_tile_h * board.h]);
    draw_list.queue(sprites.game_bg, 0, 0, Z.BACKGROUND, [0.2, 0.2, 0.2, 1]);
  }

  function testInit(dt) {
    $('.screen').hide();
    $('#title').show();
    game_state = test;
    test(dt);
  }

  function loading() {
    let load_count = glov_sprite.loading() + sound_manager.loading();
    $('#loading').text(`Loading (${load_count})...`);
    if (!load_count) {
      game_state = testInit;
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
