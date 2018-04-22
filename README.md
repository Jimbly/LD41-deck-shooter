LD41 Entry by Jimbly
============================

* Using [Javascript libGlov/GLOV.js framework](https://github.com/Jimbly/turbulenz-playground)

Start with: `npm start` (after running `npm i` once)

Deckbuilding Bullet-hell Plan / TODO list
* Build a BHS
  X avatar (movable with controls for debug)
  X simple enemy movement and firing patterns
  X collision detection / health
  * Add Physicality to player movement / use thrust!
  * later: powerups - some reason to move to a particular position (just + 2 cards, maybe?)
  * later: allow retry/continue upon fail
  * later: level progression
* Card-playing while playing BHS
  X Show hand of cards
  X Click card, generate input to BHS
  X Cards draw into hand at regular intervals up to hand limit
  * later: Show hand limit (counters on empty slots?)
* Metagame
  * Choose new cards to add (and ones to trash) between levels
  * Fixed progression of levels, or just get to choose easy/medium/hard and they set the rates for spawns?
    * Gain some kind of resources that can be spent to improve your deck?
* Defense Cards:
  * Reaction Defense (prevents one hit)
  * Shield (wipes out big area, slowly shrinks)
  * Repair
  * Draw 3
* Offense Cards
  * Spread
  * Rapid fire
  * Beam
  * Homing
* Enemies
  X drone - Little guys that don't shoot, lots of them in formation
  X sniper - Medium, circle movers, that shoot towards the player (deadly when closer)
  X bomber - Medium, full left/right strafers that slowly show straight down - spawn pattern so bullets make a wave/wall
  X large1 - Large, very slow horiz movement, lots of HP, does bursts of straight down firing
  X large2 - Large, no horiz movement, lots of HP, does bursts of spread firing
  X Spawn patterns
  X Health bars
  * Boss
* Art
  * Avatar
  * Background
  * Enemies
  * Bullets
  * Explosions
  * Sound FX
  * Music
  * Damage progression sprites instead of health bars?


Rhythm Tower Defense Scope
* Build a rhythm game
  * Just notes/arrows coming down, hitting them, playing simple sound on hit
  * No music syncing to start with
  * Want to be able to add more and more layers of patterns to make it more difficult
* Add TD
  * Notes have HP, towers do damage to lowest HP, repeat
* Currency name: "Eighths"
* Art - go with a simple musical score kind of theme
  * Notes (simple)
  * Towers (gun turrets? look like fermatas?)
  * Sound
    * Can do simple sounds just to have rhythm in background and drums when notes are hit
    * Could go crazy with procedural chord progression and guns making music and such

Theme Thoughts
* Deck building (or just card game?) + Bullet-hell Shooter
  * probably real-time
    * draw cards at a fixed rate per second
    * hand limit to encourage playing cards
    * can see what's coming for a bit to encourage planning/saving cards
  * movement cards
    * "move right"? "move 3" playing a card requires targeting a location?
  * reaction cards
  * things like shields, healing, armor, etc
  * always shooting? maybe cards that change your shoot angle
  * powerups come down - just one-time use cards to add to your hand, or bonuses like "Draw 2"
    * or new cards to add to your deck - have to trash something in hand?
    * or regular powerups like spread/etc
  * between level upgrading - ship has X slots, and each slot is equipped with an item that provides a set of cards
    * E.g. thruster choices: "3 move 1 cards" "1 move 3 card" "2 move 1 and 2 shield", etc
    * Each level just give them an two "interesting choice" upgrades for two slots?
    * Or, better/more upgrades based on how they did?
    * Slots also determine other ship factors - Hand size, draw speed, anything else?
      * Maybe ship hull is hand size and draw speed, as otherwise they're too significant of an advantage to be uncoupled
* Turn Based + Dogfighting
* Rhythm + Card Game
  * card have patterns of moves
  * pattern is coming down
  * can hit extra, so want to play something that will match, but might not be obvious
  * all cards quarter notes, but some rhythms 8th, so need to play multiple cards
* Rhythm + Tower Defense discussed with David
  * Increasingly complex patterns
  * Towers destroy notes
  * Have to play what makes it through
  * Only get money for notes played, not destroyed, so if you build too well, you don't get any money
  * Maybe elemental notes, so you can't destroy everything (would this actually help?)
* Idle + Golf?
  * Unlock different clubs with different distances
  * Unlock auto-clicking of clubs (using a club always leaves you at least as close, but possibly on the other side)
  * If randomness, unlock multiple balls?
  * Proceed to larger and larger courses with bigger rewards
  * Scaling how often clubs are hit, or how much distance they travel?
  * Is distance left just HP, or is there a physics-game feel to it? How to do physics if players aren't aiming?
* Programming + ?
