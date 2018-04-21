LD41 Entry by Jimbly
============================

* Using [Javascript libGlov/GLOV.js framework](https://github.com/Jimbly/turbulenz-playground)

Start with: `npm start` (after running `npm i` once)

TODO
* Is DB-BHS fun?  Prototype basics

Deckbuilding Bullet-hell Scope
* Build a BHS
  * avatar (movable with controls for debug)
  * simple enemy movement and firing patterns
  * collision detection / health
  * later: simple powerups - spread, machine gun
  * later: allow retry/continue upon fail
* Card-playing while playing BHS
  * Show hand of cards, with area for rollover description
  * Click card, click target (or right click/click on-screen button to abort), generate input to BHS
  * Cards draw into hand at regular intervals up to hand limit
  * later: Show hand limit (counters on empty slots?)
* Art
  * Avatar
  * Background
  * Enemies
  * Bullets
  * Explosions

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
