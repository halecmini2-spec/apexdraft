# Apex Drawn

Draw a closed loop and it becomes a 3D circuit you drive immediately — elevation,
per-corner banking, kerbs, tyre walls, and lap/sector timing. No account, no install.

Open `index.html` in any modern browser, or host it as-is.

## Playing

The page opens on a home page with four doors — **Draw & drive**, **Multiplayer**,
**Daily time trial**, and a **Shop** that says coming soon — with an account strip
under them that says what an account is for and that it is free, and opens
straight onto the sign-up form; signed in, it names you instead. Admin and
About links sit beside it. Each mode shows only its own controls, and a
**Home** button in the bar, the wordmark, and a Home row in the pause menu all
lead back.

- **Draw** a loop on the board. The direction you draw is the racing
  direction, and where you start becomes the start/finish line.
- **A loop that crosses itself** once or twice gets a bridge at each
  crossing. One that crosses more than twice, or that runs back along itself
  so two roads would share their barriers, is refused as not a valid circuit,
  with the reason on the board, and Drive stays off until it is redrawn.
- **Bank a corner** by clicking its number on the map, then using the slider.
- **Start line** — it sits where you began drawing unless you move it:
  **Move the start line** on the board, then tap the circuit. Either way, a
  line that lands in a really tight corner slides back to the straight just
  before it, and the board shows both places — a dotted marker where it was
  asked for, the checkered line where it is. Corners are numbered from the
  line, and a banked corner keeps its angle when the numbers change.
- **Pick the setting** — **Alpine**, **Desert** or **City**.
- **What the settings are made of.** Each grows a dozen different plants
  rather than one stamped six hundred times, which is the whole difference
  between a wood and a wallpaper: alpine conifers of four to six tiers, a
  broadleaf every fourth tree and a dead one every seventh; saguaro with the
  elbow their arms actually have — out, then up — barrel cactus in flower,
  and dry brush. Under them is a band of scrub down each side of the road.
  It is a band rather than a scatter for a plain reason: spread over the
  whole map, a thousand bushes is bare ground with a bush in it, and the
  only part of the county anyone passes close enough to look at is the ten
  metres past the run-off. Stones are four shapes with their vertices shoved
  about, usually with a smaller one leaning on them, and the ground carries
  patches of bare earth at a tighter frequency than its green-on-green, so
  it is not one flat colour for a kilometre.
- **The city is a night race through a downtown.** There is no sun to speak
  of: the key light is turned right down, and what you see by is the lit
  windows, the street lamps and your own headlights. Blocks of ten different
  shapes stand back from the barrier on both sides, each with its windows on
  all four faces — about three in five lit, and a strip of neon up the front
  of some. Lamps run down the road on alternate sides every 21 metres, and
  the circuit is lit for its whole length: one ribbon of light built on the
  road's own stations, so it sits exactly on the surface however the road
  banks and climbs. Patches under each lamp were the first go and they were
  wrong in the way that matters — a floodlit circuit is lit everywhere, and
  what you got was bright rings with black between them. It brightens under
  each lamp but never falls to nothing. The ground is nearly flat there,
  because twenty metres of hill through the middle of a city reads as a
  mistake. **Dusk**, which the city replaced, is gone from the settings, but
  a circuit saved as Dusk still opens — at night, in the city.
- **Every car has a rarity**, and wears it: **Rare** in green (the Kart and
  the Yaris), **Epic** in purple (the GT, and the Superbike and Trike),
  **Legendary** in gold (the Formula) and **Mythic** in red (the V12). The
  colour is the card's edge and the word sits above the name, so the row
  reads as a set of things of different worth before any of it is read.
  Which car is *chosen* therefore cannot be the border as well — it is the
  ring inside it, the tinted ground and the name in the same colour. The
  colour is stated once, on the car, and the cards read it off there.
- **Pick a car** in the garage, which is where **Drive it** takes you: a GT
  racer, a Formula single-seater, a kart with no top end and enormous grip
  that has to be driven into a corner rather than pointed at one,
  or a Yaris that never quite settles on its springs, each drawn from its own
  model in the colour you choose. Each keeps its own best lap, since they
  don't lap at the same pace. The garage is in the pause menu too.
- **Drive it** — `WASD`/arrows, `R` recover, `R` twice to restart from the
  line, `C` camera, `M` sound, `Esc` menu. On a phone, on-screen controls
  appear automatically, and the pause menu has **Back to the start**.
- **On a phone** the layout is a phone layout, not a shrunk desktop, in
  either orientation and in Safari, Chrome and Edge alike. Sideways: the
  doors, the garage, the daily page and the pause menu each fit one screen,
  with the settings beside the board in one column on a small phone and two
  on a large one. Upright: the board sits above the settings, full width,
  with the pedals spaced for the width there is. Nothing to press is under
  32px, inputs are 16px so Safari does not zoom into them, and the prompt to
  turn the phone appears only over the board and the track.
- **Fullscreen** — on Android the browser is asked for it as you go out on
  track, and there is a toggle in the pause menu. iPhone Safari has no
  Fullscreen API at all, so there the route is Add to Home Screen: the page
  is set up to launch standalone, with no browser around it.
- **The gears are the car's own.** There used to be one fixed ladder for
  everything, topping out at 250 km/h — so a kart spent its life in second
  and the V12 sat against the limiter for a third of every straight. Each
  car has its own number of ratios now, spread over the speed it can
  actually reach, and they are much of a size — a GT's six cover 20, 17, 16,
  16, 15 and 15 per cent of its range, first a whisker longer than the rest.
  A geometric ladder was tried first and crowded them at the top, which left
  first covering forty per cent of the speed the car could do. The last
  change still lands at about 85 per cent: top gear is for the last stretch
  before the top speed rather than most of the road.
  A kart has no gearbox, so it has none here either — one gear, and the note
  simply rises with the road speed all the way to the end of it.
- **Every car sounds like what it is.** What tells one engine from another
  is not the pitch but which harmonics are in it: a big twelve fires six
  times a crank revolution against a V8's four, so it sings well above a
  road car at the same road speed and does it evenly, with none of the lump
  underneath that a lazy engine has. Each car has a note, an amount of that
  lump, a harmonic above it that comes in with the revs, and a filter that
  opens as far as it deserves. The V12 sits well above the GT with a
  twelfth of the lump and twice the brightness — a wail rather than a
  grumble — and the Rocket Trike is the opposite of it in every one of
  those four.

  The harmonic is a triangle rather than a second sawtooth, and it is
  loudest in the middle of a gear rather than at the top of one. A sawtooth
  already carries every harmonic there is, so putting another an octave and
  a half above it piled edge on edge, and having it peak exactly where the
  note was already highest made the top of every gear the harshest part of
  the sound instead of the best part of it. However far the filter is told
  to open it is now held near the note it is opening for, so flat out in top
  the V12 rings at eighteen per cent through a filter at 4.1 kHz where it
  used to scream at forty-six through one at 7.
- **The Yaris has a beat.** An original drill track — sliding 808s, a
  clapped snare, rolling hats, a dark piano line — synthesised in the
  browser while it is driven; nothing is a file and nothing is anyone's
  record. It stops with the pause menu and on the board, and has its own
  switch in the pause menu, separate from the engine sound.
- **Every car does the speed on its card.** Thrust falls from full power to
  exactly the drag at that car's top speed, so the number written on it is
  the number it reaches — a GT gets to all of its 230 and the V12 to all of
  its 360, where before they stopped at about 205 and 300. It also pulls
  harder through the middle of the range on the way there, which is where
  acceleration is actually felt: a GT does 0–200 in six and a half seconds
  against nine.
- **The wheel winds on rather than snapping.** Full lock used to arrive
  inside three hundredths of a second, which on a keyboard — where the
  input is all or nothing — meant the nose flicked across the moment the
  key went down. It takes about three times as long to wind on now and the
  angle asked for is the square-ish of the input rather than the input, so
  the first twentieth of a second is less than half as sharp: a GT turns at
  66 degrees a second where it used to turn at 147. By a tenth of a second
  it has caught up, and the rate it settles at is exactly what it was. It
  still lets go as fast as ever, so straightening up is immediate.
- **It turns.** The rack goes to forty-six degrees, the wheel takes its set
  in a couple of hundredths of a second, and there is far more grip the
  slower the car is — more than double at walking pace, fading to the plain
  figure by 145 km/h. A GT at 30 km/h turns inside three metres and at
  60 km/h inside ten, so hairpins are a matter of the wheel and the
  throttle rather than the brake. The Formula turns sharper again. Full lock
  asks exactly the grip there is and never more, so the car never pushes
  wide of its tightest circle; the wheel alone will not slide it, and the
  handbrake still will. **Holding** the wheel over keeps tightening the
  line, by about two fifths again after a second, for as long as you hold
  it. This sits deliberately short of where it was briefly taken: the darty
  version turned inside two and a half metres at 30 km/h and read as
  twitchy, and the car before it needed four and a half and would not turn
  at all. It is nearer the darty end than the old one.
- **Cars are solid, and shaped like themselves.** Each car's hitbox is
  measured from the model that is drawn, so anything you can see of it is
  something you can hit — a Formula's long nose, a kart's stubbiness.
- **A crash is an impulse at a point.** What it does follows from how fast
  the two things met, at what angle, how heavy each is, and whereabouts on
  the car it landed. Momentum goes where the masses say it goes; what is
  left over rubs off as friction between the two flanks. Panels crush, so
  the harder the hit the less of it comes back. There is no generic bounce:
  a nose into a gearbox, a door rubbed down a flank and a corner into a
  barrier are three different sums.
- **Walls take the speed out of you.** Straight into the Armco at 150 km/h
  costs about ninety-five per cent of your speed and leaves the car facing
  where it was; the same barrier at forty-five degrees costs about two
  thirds and throws the car round at ninety degrees a second. A brush at
  25 km/h costs a quarter of it and little else. The steeper the angle the
  more it stops you, the shallower the more it turns and drags you along.
- **Blows off the middle turn the car.** The reaction is the moment of the
  impulse about the middle of the car, so a square hit through the nose
  does not rotate it at all, and neither does being rear-ended squarely;
  the same blow on one corner brings the tail round. A tap in traffic does
  neither. The Armco at forty-five degrees and 150 km/h throws the car
  round at three hundred degrees a second, a nose into someone's rear
  corner at two hundred.
- **A real hit puts you into a slide.** For a second or so afterwards the
  tyres are scrabbling rather than gripping: the car keeps the momentum it
  had, the nose stops pointing where it is going, and the limit that makes
  an everyday spin impossible is lifted for as long as it lasts. That is
  what turns a heavy knock into a genuine slide or spin instead of a wobble
  the car shrugs off in a frame. It is set by the crash and by nothing else
  — the slide is scaled to how hard the two things met, so a racing touch
  at 45 km/h sets none of it and ordinary driving never sees it. Hold the
  throttle and you can usually gather it up and drive out.
- **The body settles, it does not rock.** Knocked over onto its springs, a
  car leans once and takes the set — no pendulum swinging side to side
  afterwards. Even put right over, it is dead still within about three
  seconds of the impact.
- **Getting a wheel off the ground is hard, and one-sided.** One tyre
  climbing another is the only thing here that lifts a car, so the other
  car must be an open-wheeler and the contact must be side to side and
  mean it. Of the two, only the one that met the other further forward on
  itself goes up — its front tyre is the one riding over the other's rear;
  the car being climbed stays down, and two cars level with each other just
  rub. Nothing else lifts anything: not a barrier, not a nose into a flank.
- **A car can be put over, but it takes a real one.** Nothing throws a car
  into the air — no crash, no barrier, no landing; the wheels are on the
  road unless another tyre is lifting one side of you. Two Formulas closing
  side to side at seventeen metres a second across leans a car over about
  twenty degrees and it comes straight back down on its springs. Past
  twenty across it goes over, and a car that goes
  over stays over: its roof is held clear of the road, there is next to
  nothing to steer or drive with while it is there, and getting back on
  your wheels is your own job. Nothing resets you for you. The machines
  are the exception, because there is nobody at the wheel to do it: one on
  its roof slides to a stop and puts itself back on its wheels a few
  seconds later, rather than sitting out the rest of the race.
- **Nothing is ever lost under the map.** Whatever a crash does, a car
  below the surface is put back on it and an impossible number puts the car
  back on the track. It is a floor under the physics, not part of them.
- **Lock the rear** by holding the brake. A stab slows you down; keep it
  pinned and the back end lets go — at the cost of some braking, because a
  locked wheel stops the car worse than one on the edge of grip.

### Customisation

Being tried out on the same one account as the shop, and nobody else has it,
sees it, or is sent it — none of it goes over the network, so other people
in a party see an ordinary car.

Four things go on the car, chosen from a drawer in the garage, and each item
has a rarity of its own and wears it the way the cars do. The drawer opens
when you press it and then shows one part at a time — Paint, Rims, Underglow
or Horn — because four rows of chips open at once is most of a phone screen
and the garage has to fit on one without scrolling. On a short screen the car
cards shrink to make room: a smaller picture of a car is still plainly that
car, where a Drive button below the fold is not a button at all.

- **Paint** — the six plain colours (Rare), then Candy Apple and Matte
  Military (Rare), Midnight Flake (Epic), Gold Leaf and Holographic
  (Legendary), Prismatic Chrome (Mythic). The plain colours are paints too,
  and the commonest ones there are; having them on a swatch strip of their
  own and the interesting ones in a drawer said they were different kinds of
  thing, which they are not. Choosing one takes off whatever finish was on,
  because a colour and a finish are the same slot — a car cannot be both
  candy red and prismatic chrome. For everybody else the swatch strip is
  exactly where it was.

  The top three are not finishes, they are a shader. A finish is two numbers
  — how metal, how smooth — and done that way the good ones came out white,
  because at high metalness the base colour only tints a reflection and a
  bright sky washes it out. A rainbow you cannot see is not a rainbow. So the
  colour is decided per pixel from the angle that pixel is seen at, which is
  what iridescence physically is: the band sweeps across the bodywork as the
  car turns and sits in the curve of a wing the way it does on a real one.
  **Holographic** is a pearl: wide slow bands at half saturation on a satin
  finish, so it shifts as you walk round it and is plainly special, but it is
  still a paint. **Prismatic Chrome** is not a paint — it is a mirror with a
  spectrum stepped hard across it, moving fast enough to watch, and nothing
  else here is allowed to look like it. The two being merely different
  rainbows was not enough of a gap between a Legendary and a Mythic. **Midnight Flake** uses the same shader at a twentieth
  of the strength and adds nothing to the colour at all — on a near-black car
  the light it gives off is the only thing there is to see, and two goes at
  it turned midnight into neon before that was understood.
- **Rims** — Bronze (Rare), Carbon and Chrome (Epic), Gold (Legendary), Neon
  (Mythic). A wheel is four parts, not one: the barrel, the face, the hub and
  the machined ring round the edge. Painting all four the same colour is what
  made these look cheap, so the dearer ones set each — carbon with a polished
  ring, gold with a dark hub behind bright spokes — and Neon lights only its
  spokes and ring, cycling, because a wheel glowing all over is a lamp. The
  ring used to be the same material as the badges and the brightwork, so the
  rims you chose stopped at the edge of the rim; and a kart's dish and a road
  car's wheel were built out of that brightwork too, which is why choosing
  rims did nothing at all to them.
- **Underglow** — Ice Blue, Violet, Toxic Green, Ember Red, and a Rainbow
  that cycles. A picture of a glow rather than a real light, because a real
  light under every car would be honest and would halve the frame rate. Both
  of the car's shadows — the contact patch and the cast one — are off while
  it is lit, since a dark patch sitting on top of the light is the one thing
  underglow must not have.

  Getting it to stay on the ground took three goes. It began as a flat sheet
  hanging off the car, so it did everything the car does: pitched over a
  crest, rolled on its springs, and on a superbike laid over thirty-five
  degrees — which put half of it under the tarmac. Taking the car's attitude
  out of it fixed the bike and left every other car still dipping an edge in:
  measured over a lap of the hilliest circuit the board will draw, the worst
  was seven tenths of a metre under the road at no roll and no pitch at all.
  It was never the car. A flat sheet four metres long laid on ground that
  curves has its ends in the tarmac whatever it is attached to.

  So it is not a sheet. It is a small grid whose every point is put on the
  ground where that point is, refreshed each frame, belonging to the world
  rather than to the car — the car only says where it is and which way it
  faces. Eighty-one ground lookups a frame, which costs a tenth of one per
  cent of a frame at 60fps, and it cannot be buried on any car over any
  ground because there is nowhere left for it to be buried into.
- **Horn** — Classic, Air, Truck, La Cucaracha and Train, on **H** and on a
  button that appears on a phone only when there is a horn to sound. Each is
  two or three notes held together, which is what a horn is.

Each of those paints carries a cache key of its own. Three keeps compiled
shaders in a cache keyed by what it knows about a material, and it knows
nothing about source injected into one — so two paints built the same way
with different numbers in them were handed the same compiled shader, and the
second silently rendered as the first. It is the sort of fault that makes you
tune the wrong thing for an hour.

**Titles** go with the name rather than with the car, so they are chosen on
the account page: Track Day Hero and Backmarker (Rare), Apex Hunter (Epic),
Unbeaten (Legendary), The King (Mythic). The one you are wearing sits under
your name there and on the home strip, in its rarity's colour.

Anything changed in the garage rebuilds the car you are looking at and, if
you are already on track, the car you are driving — a paint you have to
leave the session to see is not much of a paint.

### The shop

Being built, and open to one account while it is. For everybody else the
door on the home page still says **Coming soon** and still does nothing,
which is exactly what it did before — the same gate the AI opponents and
the three test cars sit behind.

Inside are the three cars still being tried out, priced: the **Superbike X**
and the **Rocket Trike** at 50p each, both Epic, and the **V12 Monster** at
£1.50, Mythic. Each tile wears its rarity the way the garage cards do, and
the picture is the same one the garage draws, from the same renderer — a
second way of drawing a car would be a second way of being wrong about one.
Below them are **packs** and **coins**, listed but not yet shaped or priced.

Nothing takes payment. Pressing **Buy** says so and names the price it
would have been.

## Racing a party

A party can race rather than just share a circuit. The host picks the
number of laps — one, three, five or ten, or **Practice** for the old free
run — and sets the **starting grid**: move anyone up or down, take the join
order, or make it random. Everyone sees the settings as they change. **Start
race** lines everyone up on that grid, the lights go for all of them at
once, and the laps are counted from the lights. The running order sits under
the timing tower and the lap counter reads 2/3 · P1; the first driver to
complete the laps is the winner, and each driver gets the finishing order,
with gaps, as they cross the line for the last time. A latecomer joins the
race late. Recover while racing only puts the car back on the road, never
back at the start. The winner is shown crossing the line from beside the track,
under confetti, before the results card.

The account page counts **time trial wins** (the fastest lap on a finished
day) and **race wins** (a party or AI race won against at least one
opponent). Winning yesterday's daily brings a congratulations on the next
sign-in. The relay can also leave a **notice** for one account, shown when
they sign in, set in NOTICES (name=message;...).

## Opponents

Racing alone can be a race too, and so can racing in a party. The button
under the board says **Next**, because it no longer starts anything — it
goes to a **race** screen, and the garage is the step after that. The board
has no car on it either, for the same reason: the garage is where the car
is chosen and two ways into it was two places to change one thing. What the
race screen asks: how many machine-driven
cars line up (up to ten), their **strength**, the laps, and whether you
start at the front, the back or wherever the draw puts you — and, if you
are in a party, that party's laps and starting grid in the same place.
**The cars are on a rail.** One row you push sideways, and it never stops:
the seven cars are laid out three times over and you sit in the middle copy,
so a flick can run for a whole extra set in either direction before it could
reach an end — and the moment you cross out of the middle copy the position
is shifted back by exactly one set, in one frame, with no smoothing. It
cannot be seen, because the copy it lands on is identical to the one it
left. Flicked at 260 pixels a frame, six sets of travel in one go, it never
reaches an end in either direction.

Two earlier goes at this were worse in instructive ways. The first kept one
copy and shuffled a card from one end to the other on arrival at the edge —
but the edge is exactly where a flick has already been stopped, and moving
the scroll on a row set to scroll smoothly makes the browser animate the
correction, so every wrap slid a card's width across the screen. The second
waited for the scrolling to settle before correcting, which let a hard flick
reach a real end first: the browser bounces you there and throws the flick
away, and the correction lands on top of that. Correcting on the way past,
not on arrival, is what makes it continuous.

An arrow either side steps one car along and wraps, going to whichever copy
of that car is nearest rather than always the middle one — otherwise the
arrows could slide you a whole set sideways to reach a car already next to
you. The left and right keys do the same, and tapping a card picks it. On
the daily, where the car is the day's and not yours, the arrows are gone.

A grid is what forced the pictures out of shape before: seven
cars in a grid meant three rows of shrinking boxes on a phone and a canvas
squashed to a letterbox to make them fit. One row is one row at any width,
so every picture is drawn at the proportions it was modelled in — measured
at 1.64 against 1.64 as drawn, on a desktop and on three phone sizes.

**And the whole step is on the screen** — both of these steps are, in either
orientation, without scrolling for the button at the bottom. Measured at
390x844, 844x390, 360x640 and 640x360: on all four, both pages, the content
is no taller than the window. The button also rides the bottom of the
scroll, so on anything smaller still it is on the screen anyway.

**Next** takes you to the garage for the car, and that takes you to the
track. Three steps, each asking one thing: the race, the car, the circuit.

Where there is nothing to ask, the step is not put in the way. The daily is
the one place with no opponents and never will have: it is a single timed
lap against a board, and a field of cars to trip over is not what that is —
so on the daily, **Drive it** goes straight to the garage as it always did.

**Run it again.** Double-tapping R restarts a race — you back on your grid
slot with the lights, the field back on theirs, the clock and the finishing
order cleared. The whole field restarts with you, which is the point:
restarting a race you have just lost to a car that is still circulating is
not a restart. The pause menu says Restart the race instead of Back to the
start while there is one on, and the sheet at the end offers Race again.

They race with the grid, the lights, the running order and the finishing
order of a party race. They are not driven through
the car model: each runs a racing line — the least-curvature path the road
edges allow, worked out for the circuit when the race starts — at a speed set
by that line and the strength, braking in time for what is coming. Each keeps
a line of its own around it, holds its grid slot off the line, and is solid
to you and to the others. Below full strength each has a pace of its own and
now and then lifts, wobbles or runs wide; the weaker, the more often and the
worse.

**Their wheels point where they are going.** The angle is taken from the
turn the car has just made, which is the only thing that cannot disagree
with it. It used to be built from the road curvature under the car plus the
rate it was changing lane, and those two answer different questions — the
road bends one way while the line across it goes the other, and on a
straight into a corner the road says nothing at all — so about one frame in
eight the wheels were pointed the wrong way. What is shown is not the rack
angle, which at racing speed is a couple of degrees and reads as a car not
turning at all, but the same thing the driver's own wheels show: how much of
the tightest turn available to it, it is making. A hairpin is full lock and
a fast sweep is a flick.

**In a party, one machine runs them all.** A field simulated separately in
each browser would be a different field on each screen within a corner, so
the host runs them and everyone else is told where they are. Guests take
them as ordinary peers — the same code that draws another player draws
these, which is why they have name tags, appear in the standings and can be
leaned on in exactly the same way, with no second kind of car anywhere in
the page. The room remembers the field, so somebody joining late is told
about it too, and it is cleared when the race is rather than when the party
is. The grid is the players and the machines together, dropped in at the
place the host asked for.

**They race you rather than follow you.** Catch a car that is genuinely
slower — the road would let this one go quicker and it is closing — and it
pulls out to the side with more road and goes past, you included. The move
is remembered once begun: pulling alongside takes the other car out of the
corridor a driver watches, so judging it afresh each frame made them swing
out, lose sight of it, tuck back in and start again, alongside for ever and
never past. Now the car being gone round is kept in mind until it is
properly behind. A car it cannot actually beat is not attacked; it queues
instead.

**And they drive tidily where the road is straight.** The lane a driver
prefers and the wander that is theirs alone are wound most of the way out
on the straights, where there is one place to be and all of them know it,
and come back through the corners where a different line is a worth having.
They also cannot move sideways without moving forwards: nothing on the grid
slides across the start line any more, and the nose takes its direction
from how fast the car is going along the road and across it, so a shove
from a contact can no longer flick the whole car sideways for a frame.

## Three more, being tried out

Alongside the GT, the Formula, the Yaris and the kart there are three others
in the garage, shown to one account only while they are looked at — the
same single-account gate the opponents used to sit behind, before they
became part of the game. Signed in as anyone else, or signed out,
there is nothing on the page to see: the cards are not greyed, they are not
there. Picking one is refused server-side of nothing, because there is no
server side to it; but the garage, the pause-menu switcher and the saved
choice all check, so signing out of that account puts you back in the GT
rather than leaving you in something you can no longer pick.

- **Superbike X**, a litre superbike, with a rider on it, drawn at twice
  its own size so it is not lost behind a car, and casting no shadow at all:
  the contact shadow is one fixed car-shaped patch, and under something this
  narrow it read as a car's shadow with a bike standing on it. 280+ km/h, 165 kg,
  and the only thing here with one wheel behind the other. It has no track
  to roll on, so it cannot lean on its springs the way a car does — it lays
  over into a corner instead, up to thirty-five degrees, by as much as the
  sideways force asks for. It turns about the tyre on the road, so nothing
  has to be lifted to keep it out of the tarmac: laid right over, the lowest
  part of it is two centimetres into the road, which is about what a tyre
  edge should be doing at that angle. The rider is tucked — chest on the
  tank, chin behind the screen, knees in, feet on the pegs — and is built
  into the same group as the bodywork, so they go over with the bike rather
  than sitting bolt upright while it corners underneath them. Quickest thing
  here off the line.
- **Rocket Trike**, a blown V8 in a tube frame. 240+ km/h, 210 kg, one narrow
  wheel out front on a long raked fork and two enormous slicks at the back.
  There is no bodywork: the frame is the shape of it. On the throttle it
  burns out of all eleven pipes — the eight zoomies and three out the back —
  each with a length and a flicker of its own so they do not pulse together
  like a string of lights, and out altogether the moment you lift.

  It is also the one thing here that will turn itself over — but only when
  something puts it over, never because it turned. Cornering load was tried
  and it does not work: the load in a hard corner is not a plateau but a row
  of spikes, a full-lock turn spending five per cent of itself above five g
  and most of itself far below, so any rule strict enough to ignore ordinary
  cornering ignores everything and any rule loose enough to fire went over
  in three of seven ordinary turns. What tips one is a blow, so a blow is
  what does it: this car takes three times the roll out of an impact that
  anything else does. Into the armco at forty-five degrees and 180 km/h it
  goes over, where a GT taking the same hit leans five degrees; holding full
  lock at any speed leans it and nothing more.
- **V12 Monster**, mid-engined and the fastest thing here at 360 km/h. Also
  the heaviest at 1,450 kg — the card says so in the largest type on it, which is what makes it the one that will not be
  shoved about — and the slowest of the three to get going.

Everything else about them is ordinary. They are chosen in the garage like
any other car, their laps are records of their own, and the relay checks a
lap in one against that car's ceilings exactly as it does a GT lap. The
daily is still the GT for everyone, this account included.

Two of them broke an assumption nothing had questioned before: that a
vehicle has four wheels and the first two of them steer. Wheels are now
built from however many positions a body asks for, and the body says how
many of the leading ones are on the front axle — two for a car, one for a
bike or a trike.

## The daily time trial

**Daily** in the bar is one circuit a day, the same for everyone. The car
changes with the day and every one of the seven comes up once a week, in an
order the week itself decides, so nobody gets the kart twice running and
nobody waits a month for it. Whatever the day's car is, that is what
everybody drives: the garage shows it and closes every other card.

**The circuit is sized to the car.** A lap should take about the same time
whatever is being driven, so the loop is stretched for a quick car and shrunk
for a slow one — around 1.5 km for the kart and 3.5 km for the V12 — and the
sizing is done by the same model the relay uses to refuse impossible laps,
so the two can never drift apart. A machine at full strength comes in at
1.15 times that bound, near enough the same multiple for all seven cars,
which is what makes the bound usable as a stopwatch and not only as a limit.
Bisection rather than a formula, because a smaller loop is a tighter loop
and halving the length takes rather more than half the time out of a lap.
Every day of the next fortnight lands within a tenth of a second of the
same target.

On the daily the car is not the driver's to claim either: the relay works
out which one the day was from the circuit key and judges the lap against
that, so a time sent as something quicker is judged against the right
ceiling anyway. And on the day the rotation reaches one of the three still
being tried out, everybody gets it — on the daily, for that day, and
nowhere else. The relay draws it from the date — harmonics on an oval, with
the width, the hills, the smoothing, the scenery and a few banked corners
all rolled with the shape — so every machine builds exactly the same lap
and nothing has to be stored. It changes at midnight UTC. There are no
start lights: you are dropped in just before the last corner, moving off
in your own time, and the clock starts as you cross the line. Restarting
puts you back there, not on the line. The page lists the top 25 times and
says how many drivers are on the board; **Show all** lists every one.

The Daily page shows the circuit, the world record so far and who holds
it, your own best and where it stands ("14th of 213"), and the day's times.
Drive it and the settings on the board lock, the garage offers only the GT,
and the timing tower carries the record and your ranking while you drive.

Every improvement you post carries the lap itself, as a run of positions,
and the fastest lap of the day is the **ghost**: a see-through car driving
its record beside you, switched on or off from the Daily page or the pause
menu. It is the car the circuit makes everybody use, not a GT — it used to
be a GT whatever was being driven, which on a Formula daily is a GT going
round on the Formula's line at the Formula's pace. Times need an account; the board is readable without one.
## Racing other people

**Host** a party and you get a four-character code. Anyone who enters it joins
you, and the circuit you have drawn is sent to them — they don't need to draw
anything. Everyone drives their own car on their own machine; you see each
other live, and you drive through each other rather than colliding, so two
machines can never disagree about a crash.

Once the host has started, the room is live: anyone who joins — or comes
back after leaving — goes straight out onto the circuit, and a guest who
steps back to the board gets a **Join the race** button instead of a wait.
It stays live for as long as the party does — the host stepping back to
the board to change something does not close it, and whoever goes out next
goes out onto the circuit as it now is.

**Garage**, in the pause menu, changes car without leaving the track: the
new car is built where you are and you restart from the line, since its
laps are a different record. Everyone in the party sees the change.

The relay that carries the messages is in [`relay/`](relay/): a small
websocket server that hands out codes and passes messages between players in
a room. It knows nothing about racing and keeps nothing about a race — a room
exists while someone is in it and is forgotten when the last player leaves.

It is deployed alongside the game by the same blueprint. The page finds it by
name (`apexdrawn` → `apexdrawn-relay`), and `?relay=ws://localhost:8080`
points it somewhere else for local work.

## Accounts

Optional, and they settle one thing: the name other people see on your car.
Sign in from the home page — a username and a password, and nothing else
asked for. You can host and join parties without one.

The name comes from the session token rather than from the client, so a
signed-in driver races under their own name and nobody else can turn up
wearing it.

### Saved circuits

**Tracks** in the top bar is a shelf of circuits you have kept. Name the one
on the board and save it; load one back and it replaces what you are drawing,
keeping your car and colour. Hosting a party and loading one sends it to
everyone, since the circuit is the host's to set.

Each is drawn from its own points in the list, because a row of names tells
you nothing about which lap is which. Thirty per account, and saving over a
name you have used replaces that circuit rather than leaving you two you
can't tell apart — it asks first.

They live with the account, so they are there on whatever you next sit down
at. That also means they need one: signed out, the page says so rather than
keeping them somewhere that won't last.

### Fastest laps

Every circuit has its own leaderboard — a lap time means nothing except
against the same layout, so one big list would just crown the shortest
scribble. Pause mid-race to see it: everyone who has driven that circuit,
their best lap and what car they set it in.

The circuit is identified by what it is made of rather than by who saved it,
so two people who drew — or were sent — the same layout land on the same
board without anybody publishing anything. The key is taken from the drawing
and the settings that shape it, measured from the circuit's own corner so
that re-centring it on a differently shaped board doesn't move it to a
different board. Change the width, the elevation or the smoothing and it is a
different circuit, because it is a different lap; change the scenery and it
is not.

While you race other people there is a live order of the room under the
timing tower, fed by everyone's improvements as they set them.

Every other car carries a name tag in their colour, with how far away they
are. When they are off the screen — behind you, or round the next corner —
the tag pins itself to the edge nearest them and points, so you always know
where somebody is even when you cannot see them.

**Contact** is always on: cars are solid to each other, in a party and against
the machine, and both sides feel the same shunt from their own side of it.

Times need an account to appear, but the board is readable without one.

**A lap time is a claim.** The physics run in the browser, so the server
cannot referee one, and all it checks is that a time is plausible. Treat the
board as a scoreboard among people you know rather than as a record book.

### Admin

Accounts named in `ADMIN_USERS` on the relay (comma-separated usernames, set
in the Render dashboard) get an **Admin** section on their account page and
two extra controls on the leaderboard. Everything there removes something —
an account and everything it saved, one lap time, a whole board — and
nothing creates or edits, which is the whole of moderating a game whose lap
times are claims the server cannot referee.

There is deliberately no way to become an admin from inside the game, and an
admin cannot delete their own account or another admin's from there. Every
removal is logged on the relay with who did it.

The desk also counts: who is playing right now, visits and different people
today and all time, parties started, accounts, and a thirty-day chart. The
page sends one beacon per load carrying a random id its browser made up and
keeps; the relay stores a count per day against it. No address, no browser
string, no path — enough to say how many came, and nothing about any one of
them. Copies opened from disk or a dev server are not counted. The desk
also lists when the recent visits happened, on the admin's own clock, with
each browser shown as a short tag and marked as a newcomer or a return —
or by account name, when the visitor was signed in. A browser seen signed in
once is that person's, so its earlier visits are named from it too, marked
"same browser". Every open page also sends a heartbeat every half minute, so
the desk lists who is **online now** — everyone, not only the parties — with
what they are doing, when they arrived and how long they have been on, and
keeps a list of **recent sessions** with how long each lasted.
"People" means different browsers: a phone and a laptop count twice, two
people on one machine count once.

### Lap times are checked

The physics run in the page, and a page is open: anyone can find the lap
endpoint in the browser tools and post a number. So the relay no longer
takes a number. A lap has to arrive with the trace the page records as it
drives — a point every tenth of a second — plus, for a drawn circuit, the
circuit itself, which must hash to the board it claims; the daily's the
relay already has. The relay rebuilds the circuit's plan with the same
geometry as the page and checks that the trace is on the road, goes once
round the lap the right way, never exceeds the speeds, accelerations or
cornering grip the car model can produce, and spans the time claimed. The
time also has to be slower than the quickest lap the model could possibly
set on that circuit, and the lap has to have taken that long in real time:
the page asks for a **ticket** as it crosses the line, and the time cannot
be handed in sooner than the lap it claims. A refused lap is logged with
the reason. Times that could not have been driven are removed from the
recent daily boards when the relay starts, and any named in `PURGE_LAPS`
(`circuit:name,...`) with them; an admin can also remove a time from the
daily page.

### The small print

There is **no email and no password reset**, and the UI says so
where you choose a password. Passwords are hashed with scrypt and a random
salt per account; sessions are stored as a hash of the token, so a copy of
the database is not a set of keys to everyone's account.

Accounts are the one thing here that outlives a connection, so they need
somewhere to live:

- **`DATABASE_URL` set** — Postgres. The server creates its own tables.
  The blueprint declares a free Render database and wires this up, so
  applying it is all that is needed.
- **not set** — a JSON file beside the server, for local work. A free Render
  instance has no filesystem that survives a restart, so an account made
  there would not last the day. The server says as much at boot.

Render's free Postgres expires 30 days after it is created. To keep accounts
past that, make a database that doesn't expire — [Neon](https://neon.tech)'s
free tier is the usual choice — and set `DATABASE_URL` on the relay by hand.

To run the whole thing locally:

```
cd relay && npm install && node server.js
```

then open the game with `?relay=ws://localhost:8080`.

### A word left on an account

An admin can leave one line of text on an account, and its owner reads it
the next time they are signed in — on the account page and on the panel on
the front page, in the one place on the site that is allowed to shout. It
is the only thing on the desk that puts something onto an account rather
than taking something off one, and it exists because the alternative to
telling somebody their username has to change is deleting the account
without warning. Sending an empty line takes it down again. The desk shows
which accounts are carrying one, and the message that gets sent most often
— asking for a rename — is already typed when the box is opened.

## Being found

The page carries what a search engine or a link preview needs: a real
document head with a description, Open Graph and Twitter cards, JSON-LD
describing it as a free browser racing game and track maker, a canonical
URL, a web manifest with icons, `robots.txt` and `sitemap.xml`, and the same
description as visible text on the board — an About section at the end of
the rail with real headings and an FAQ, which is also in the structured data.
Nothing is hidden: text a visitor cannot see is text search engines punish.

Bing, DuckDuckGo and Yandex are told about the page through IndexNow (the
key file at the root is what makes the ping ours). Google does not take
IndexNow, and ranking anywhere is up to the engines; submitting the sitemap
in Google Search Console is the one step worth doing by hand.

The game lives at https://apexdrawn.onrender.com/. It was Apex Draft, at
apexdraft.onrender.com: a Render service keeps the address it was created
with whatever it is later renamed, so the move meant new services under the
new names — the blueprint declares `apexdrawn` and `apexdrawn-relay`, and
the old address checks the new one is up and then sends people on. The
database kept its name, and the accounts with it.

## Hosting

It's a single self-contained file. Drop `index.html` onto any static host
(GitHub Pages, Netlify, Cloudflare Pages) and it works — no build step, no backend.

three.js is loaded from a CDN, so the page needs an internet connection.

### Deploying to Render

`render.yaml` in this repo declares the site as a Render **static site**, so
there's nothing to configure by hand:

1. On [Render](https://dashboard.render.com), choose **New → Blueprint**.
2. Connect this repository. Render reads `render.yaml` and creates the site.
3. Click **Apply**. It's live in well under a minute.

Every push to `main` redeploys automatically.

There's deliberately no Dockerfile. A container would mean running an nginx web
service to hand over one HTML file — on Render that gives up the static tier's
CDN and never-sleeping free plan in exchange for cold starts.

## Built with

Vanilla JS + three.js (WebGL). Everything else — the tarmac texture, the sky,
the environment map, the car body — is generated procedurally at runtime.

### Who may drive what

The three cars being tried out are not in this file. A car whose body is
built in the page is a car everybody has, because the page is one file and
everybody who opens the game downloads all of it — which is how somebody
with a copy of the source gave themselves all three. Their shapes live on
the relay now and are handed over only to an account that holds them, so a
driver who is not entitled to one has nothing to build it out of. There is
no gate to edit, because the thing the gate was guarding was never sent.

What an account holds is a list on the account, written by the admin desk
and, when buying exists, by a purchase. `relay/cars.js` is the only thing
that answers the question, and both the lap checks and the handing over ask
it. A lap claiming a car the account does not hold is refused before any of
the verification work is done: it is a question about the account rather
than about the lap.

Two honest limits.

A daily hands the day's car to everybody for the day, whatever it is, so on
a day whose car is one of these it goes out to people who have not bought
it. That is the daily working as it was asked for rather than a hole in
this.

The shapes live in `relay/locked-cars.js`, which is deliberately not in
this repository — it is public, and committing them there would hand them to
exactly the people they are kept from. On the live service it is a Render
**secret file** named `locked-cars.js`, which lands in `/etc/secrets`; the
relay looks beside itself first and there second, and runs either way,
serving nothing if it finds neither.

And once an entitled account has been handed a car, the code for it is on
that machine and can be copied from there. No page that runs in somebody's
browser can do better. What this fixes is the thing that actually happened —
helping yourself out of your own copy of the file — and everything added
from now on is added on the far side of the same gate.
