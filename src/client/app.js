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

  let enemy_types = ['drone', 'sniper', 'bomber', 'large1', 'large2'];
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

    sprites.game_bg = loadSprite('white', 1, 1, {
      width : game_width,
      height : game_height,
      color : [0, 0.72, 1, 1],
      origin: [0, 0],
    });
  }

  let player_speed = 0.002;
  let ZIGZAG = 300;
  let cards = {
    move_left: {
      name: 'Move Left',
      effects: [
        {
          duration: 1000,
          dx: -1,
        },
      ]
    },
    move_right: {
      name: 'Move Right',
      effects: [
        {
          duration: 1000,
          dx: 1,
        },
      ]
    },
    zigzag: {
      name: 'Zig- Zag',
      effects: [
        {
          duration: ZIGZAG,
          dx: -1,
        },
        {
          duration: ZIGZAG * 2,
          dx: 1,
        },
        {
          duration: ZIGZAG,
          dx: -1,
        },
      ]
    }
  };
  let deck = [];
  for (let ii = 0; ii < 4; ++ii) {
    deck.push('move_left');
    deck.push('move_right');
  }
  for (let ii = 0; ii < 2; ++ii) {
    deck.push('zigzag');
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
  shuffle();
  let hand_size = 5;
  function draw() {
    if (hand.length >= hand_size) {
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
  while (draw()) {}

  let score = {
    kills: 0,
    damage: 0,
  };
  let board_w = 5;
  let board_h = 10;
  let bullets = [];
  let enemies = [];
  let board_tile_h = game_height / board_h;
  let board_tile_w = board_tile_h;
  let board_x0 = board_tile_w / 2;
  let board_y0 = game_height - board_tile_h * board_h;
  let ui_x0 = board_x0 * 2 + board_w * board_tile_w;
  let player = {
    x : board_w / 2,
    y : board_h - 0.5,
    color: math_device.v4Copy(color_white),
    bullet_speed: 0.005,
    fire_countdown: 0,
    fire_delay: 60 * 4,
    max_health: 10,
  };
  let player_dead = false;
  let player_scale = math_device.v2Build(board_tile_w/2, board_tile_h/2);
  let enemy_scale = math_device.v2Build(board_tile_w/2, board_tile_h/2);
  let player_vs_bullet_dist_sq = 0.25*0.25;
  let enemy_vs_bullet_dist_sq = 0.25*0.25;
  let player_vs_enemy_dist_sq = 0.25*0.25;
  let hit_cooldown = 0;
  let hit_blink_time = 250;
  let player_border_pad = 0.25;
  function updatePlayer(dt) {
    let p = player;
    let dx = 0;
    let dy = 0;
    if (!'keyboard control') {
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
    }
    for (let ii = cards_in_play.length - 1; ii >= 0 && !player_dead; --ii) {
      let card = cards_in_play[ii];
      let cdt = dt;
      while (card.effects.length && cdt > 0) {
        let e = card.effects[0];
        let portion = 1;
        if (cdt >= e.duration) {
          portion = e.duration / cdt;
          cdt -= e.duration;
          card.effects.splice(0, 1);
        } else {
          e.duration -= cdt;
          cdt = 0;
        }
        // do effects
        if (e.dx) {
          dx += portion * e.dx;
        }
      }
      if (!card.effects.length) {
        cards_in_play[ii] = cards_in_play[cards_in_play.length - 1];
        cards_in_play.pop();
      }
    }

    p.x += dx * dt * player_speed;
    p.x = clamp(p.x, player_border_pad, board_w - player_border_pad);
    p.y += dy * dt * player_speed;
    p.y = clamp(p.y, board_h / 2 + player_border_pad, board_h - player_border_pad);

    // Check for collision vs bullets
    for (let jj = bullets.length - 1; jj >= 0 && !player_dead; --jj) {
      let b = bullets[jj];
      if (b.player) {
        continue;
      }
      if ((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) <= player_vs_bullet_dist_sq) {
        // kill bullet, take damage
        bullets[jj] = bullets[bullets.length - 1];
        bullets.pop();
        if (!hit_cooldown) {
          score.damage++;
          hit_cooldown = hit_blink_time;
        }
      }
    }
    // Check for collision vs enemies
    for (let jj = enemies.length - 1; jj >= 0 && !player_dead; --jj) {
      let b = enemies[jj];
      if ((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) <= player_vs_enemy_dist_sq) {
        // kill enemy, take damage, score
        score.kills++;
        enemies[jj] = enemies[enemies.length - 1];
        enemies.pop();
        if (!hit_cooldown) {
          score.damage++;
          hit_cooldown = hit_blink_time;
        }
      }
    }

    let firing = false && !player_dead; // && glov_input.isKeyDown(key_codes.SPACE);
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
    if (this.dx !== this.desired_dx) {
      let delta = this.desired_dx - this.dx;
      let sign_delta = (delta < 0) ? -1 : 1;
      delta *= sign_delta;
      delta = Math.min(delta, dt * drone_accel);
      this.dx += delta * sign_delta;
    }
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

  function spawnEnemy(x, y, name) {
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
      hp: 1,
    };
    switch (name) {
      case 'drone':
        e.shoots = false;
        e.xfn = droneX;
        e.desired_dx = ((x > board_w / 2) ? -1 : 1) * 0.0005;
        e.dx = e.desired_dx;
        e.hp = 1;
        break;
      case 'bomber':
        e.xscale = randInt(2) * 2 - 1;
        e.xperiod = 0.001;
        e.xfn = bomberX;
        e.fire_delay = 1000;
        e.hp = 2;
        break;
      case 'sniper':
        e.xscale = randInt(2) * 2 - 1;
        e.xperiod = 0.001;
        e.xfn = bomberX;
        e.yfn = sniperY;
        e.fire_delay = 2500;
        e.shootfn = shootSniper;
        e.hp = 1;
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
        e.hp = 10;
        break;
      case 'large2':
        e.xscale = (randInt(2) * 2 - 1);
        e.xperiod = 0.0001;
        e.xfn = bomberX;
        e.dy *= 0.25;
        e.burst_high = 1500;
        e.burst_low = 300;
        e.burst_count = 12;
        e.burst_state = 0;
        e.firedelayfn = fireDelayBurst3;
        e.shootfn = shootSpread;
        e.hp = 10;
        break;
    }
    if (e.shoots) {
      e.fire_countdown = e.firedelayfn();
    }
    enemies.push(e);
  }

  let spawn_countdown = 100;
  let spawn_delay = 2500;
  function updateEnemies(dt) {
    if (dt >= spawn_countdown && !player_dead) {
      spawn_countdown = spawn_delay - (dt - spawn_countdown);
      let type = enemy_types[randInt(enemy_types.length)];
      //type = 'large2';
      spawnEnemy(0.75 + Math.random() * (board_w - 1.5), 0.5, type);
    } else {
      spawn_countdown -= dt;
    }
    for (let ii = enemies.length - 1; ii >= 0; --ii) {
      let e = enemies[ii];
      // do movement pattern
      e.age += dt;
      e.xfn(dt);
      e.yfn(dt);
      // check for bullet collision
      let killme = false;
      for (let jj = bullets.length - 1; jj >= 0 && !player_dead; --jj) {
        let b = bullets[jj];
        if (!b.player) {
          continue;
        }
        if ((b.x - e.x) * (b.x - e.x) + (b.y - e.y) * (b.y - e.y) <= enemy_vs_bullet_dist_sq) {
          killme = true;
          // kill bullet too
          bullets[jj] = bullets[bullets.length - 1];
          bullets.pop();
        }
      }
      if (killme) {
        score.kills++;
      }
      if (e.y > board_h + 0.5) {
        killme = true;
      }
      if (killme) {
        enemies[ii] = enemies[enemies.length - 1];
        enemies.pop();
        continue;
      }
      // do firing
      if (e.shoots && e.y >= 0) {
        if (dt >= e.fire_countdown) {
          while (dt >= e.fire_countdown) {
            e.fire_countdown = e.firedelayfn() - (dt - e.fire_countdown);
            if (e.x > 0.01 && e.x < board_w - 0.01) {
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
        } else {
          e.fire_countdown -= dt;
        }
      }

      draw_list.queue(sprites.enemies[e.name],
        board_x0 + e.x * board_tile_w, board_y0 + e.y * board_tile_h, Z.SPRITES, color_white,
        enemy_scale);
    }
  }

  function playCard(card_name) {
    cards_in_play.push(util.clone(cards[card_name]));
  }

  let draw_countdown = 0;
  const DRAW_RATE = 1000;
  let card_h = 120;
  let card_w = (2.5/3.5) * card_h;
  function drawCard(card, x, y, z, color) {
    let lines = card.name.split(' ');
    for (let jj = 0; jj < lines.length; ++jj) {
      glov_ui.print(glov_font.styleColored(null, color), x + 8, y + 24 + jj * 20, z, lines[jj]);
    }
    // Panel last, it eats clicks!
    glov_ui.panel({
      x,
      y,
      z,
      w: card_w,
      h: card_h,
    });
  }
  function drawHand(dt) {
    let hand_x0 = ui_x0;
    let hand_y0 = game_height - card_h - 50 - 40;
    let in_play_y0 = hand_y0 - card_h - 50;

    if (player_dead) {
      glov_ui.print(null, hand_x0 + 24, hand_y0 + card_h/2 - 12, Z.UI, 'SHIP DESTROYED');
      return;
    }

    if (hand.length >= hand_size) {
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
      let z = Z.UI + ii * 10;
      let bounds = {
        x,
        y: hand_y0,
        z,
        w: card_w,
        h: card_h,
      };
      let playme = glov_input.clickHit(bounds);
      let color = 0x000000ff;
      if (playme || glov_input.isMouseOver(bounds)) {
        color = 0x009000ff;
      }
      drawCard(cards[hand[ii]], x, hand_y0, z, color); // eats clicks due to panel()

      if (playme) {
        let card = hand[ii];
        hand.splice(ii, 1);
        discard.push(card);
        playCard(card);
      }
    }

    for (let ii = cards_in_play.length - 1; ii >= 0; --ii) {
      let x = hand_x0 + card_w * ii;
      let z = Z.UI + ii * 10;
      drawCard(cards_in_play[ii], x, in_play_y0, z, 0x000000ff);
    }
  }

  function drawBottomUI() {
    let y = game_height - 16;
    y-= 24;
    glov_ui.print(glov_font.styleColored(null, 0xFFFFFFff), ui_x0, y, Z.UI,
      `Enemies killed: ${score.kills}`);
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

  function test(dt) {
    player_dead = score.damage >= player.max_health;
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    drawHand(dt);

    drawBottomUI(dt);

    draw_list.queue(sprites.white, board_x0, board_y0, Z.BACKGROUND + 1, [0, 0.72, 1, 1], [board_tile_w * board_w, board_tile_h * board_h]);
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
